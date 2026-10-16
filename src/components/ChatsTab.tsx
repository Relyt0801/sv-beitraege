import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SkelettKarten } from "./Skelett";
import { useTopics, type Topic, type TopicItem } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { UnbanRequests } from "./UnbanRequests";
import { KomiteeRequests } from "./KomiteeRequests";
import { ElternGespraecheEbene, ElternInfosEbene, useElternZahlen } from "./ElternTeamTab";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { KomiteePage } from "./KomiteePage";
import { BannHinweis } from "./BannHinweis";
import { ChatBlasen, ChatEbene, ChatEingabe, ChatKopf, GespraechKnoepfe, GespraechMehrBlatt } from "./ChatBlasen";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { Sheet, SheetKopf } from "./Sheet";
import { normalize } from "../lib/logic";
import { lesbarerName } from "../lib/profil";

import { frage } from "../lib/melder";
import { NachtragAnfragen } from "./NachtragAnfragen";
import { MeldungenAnfragen } from "./Melden";
import { Schalter } from "./Schalter";
import { kategorieAn, komiteeAn, useMitteilungen, type Kategorie } from "../lib/mitteilungen";
import { useZaehltMit } from "../lib/chat-zaehler";
import { FotoFreigaben } from "./FotoFreigaben";
import { FarbKachel } from "./Kachel";
import { Gruppe, Symbol, Wert, Zeile, ZeileMitSchalter } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { Icon, type IconName } from "./Icon";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
import { TABELLE_NAME, TEIL_NAME, useAlleVerschiebungen, type Verschiebung, type TeilTabelle } from "../lib/teile";
import { sprungAusHash, type Sprungziel } from "../lib/sprung";
const TEAM_CHAT_TITLE = "Stufenteam";

/**
 * Farben der Kacheln im Chats-Reiter – je Bereich EINE Systemfarbe (wie die
 * bunten Karten der Startseite), der Verlauf bleibt in dieser Farbe. Etwas
 * dunkler als die reinen iOS-Töne, damit die weiße Schrift gut lesbar ist.
 */
const FARBE = {
  komitee: { verlauf: "from-[#6E6CF0] to-[#4341C8]", schatten: "shadow-[0_10px_24px_-14px_rgba(67,65,200,.9)]" },
  team: { verlauf: "from-[#1E8CFF] to-[#0058C8]", schatten: "shadow-[0_10px_24px_-14px_rgba(0,88,200,.9)]" },
  anfragen: { verlauf: "from-[#FF9F0A] to-[#E2560B]", schatten: "shadow-[0_10px_24px_-14px_rgba(226,86,11,.9)]" },
  schueler: { verlauf: "from-[#2FB0CC] to-[#0F7690]", schatten: "shadow-[0_10px_24px_-14px_rgba(15,118,144,.9)]" },
  eltern: { verlauf: "from-[#FF4F6F] to-[#D1103F]", schatten: "shadow-[0_10px_24px_-14px_rgba(209,16,63,.9)]" },
  infos: { verlauf: "from-[#BF5AF2] to-[#8B2CC2]", schatten: "shadow-[0_10px_24px_-14px_rgba(139,44,194,.9)]" },
} as const;

/** Unterseiten des Chats-Reiters – jede als eigene Ebene über allem. */
type Ansicht = "anfragen" | "schueler" | "eltern" | "elterninfos" | null;
/** Teil einer Komitee-Seite (KomiteePage): Chat oder Pinnwand */
type Teil = "chat" | "uebersicht";

/**
 * Was im Chats-Reiter offen war – wie bei iOS behält ein Reiter seinen Stand,
 * wenn man kurz in einen anderen wechselt (vorher war der offene Chat nach
 * Übersicht → Chats weg). Nur im Speicher: ein Neuladen beginnt wieder bei
 * den Kacheln. Erneutes Antippen des Reiters (sv:reiter-wurzel) leert ihn.
 */
const merker: { openId: string | null; teamOffen: boolean; ansicht: Ansicht; teil?: Teil } = {
  openId: null,
  teamOffen: false,
  ansicht: null,
};

/** Diese Benachrichtigungen führen zu den Anfragen (lib/sprung.ts). */
const ANFRAGE_ZIELE: Sprungziel[] = ["nachtrag", "komitee", "entsperren", "meldung", "foto"];
const istAnfrageSprung = () => {
  const z = sprungAusHash(window.location.hash);
  return Boolean(z && ANFRAGE_ZIELE.includes(z));
};

/**
 * Chats: pro Komitee ein Chat und der Stufenteam-Chat.
 * Für Schüler fühlt sich der Stufenteam-Chat wie ein normaler Chat an –
 * im Hintergrund entsteht daraus ein Ticket, das das Team beantwortet.
 *
 * Aufbau seit 1.4 (Wunsch: „wie die Kacheln auf der Startseite“ und „nicht
 * scrollen müssen, um etwas zu finden“):
 *   - oben ein Raster aus bunten Kacheln (2 Spalten am Handy) mit dem, was man
 *     am häufigsten braucht – mit roter Zahl, wenn dort etwas wartet,
 *   - darunter die Komitee-Chats als ruhige iOS-Liste,
 *   - jede Kachel öffnet eine eigene Vollbild-Ebene (ChatEbene) mit eigener
 *     Kopfleiste und Zurück-Pfeil, wie in iMessage.
 */
export function ChatsTab() {
  const { topics, items, members, ready, unreadCount, createTopic, committeesOf, uid, myVotes } = useTopics();
  const { can, isStaff } = useRole();
  const [anschreiben, setAnschreiben] = useState(false);
  const { mitteilungen, setKategorie, setKomitee } = useMitteilungen();
  const zaehlt = useZaehltMit();
  const darfVerwalten = can("chats.manage");
  // Nur wer ALLE Chats sieht, kann erkennen, welcher wirklich fehlt. Wer nur
  // einen Teil sieht (z. B. direkt nach einem Rollenwechsel, solange die Liste
  // noch aus der alten Sicht stammt), hielte unsichtbare Chats für fehlend –
  // so entstanden am 24.09.2026 doppelte Komitee-Chats. Zusätzlich überspringt
  // die Datenbank Doppelte selbst (supabase/komitee-chats-eindeutig.sql).
  const siehtAlle = can("chats.view_all");
  const [openId, setOpenId] = useState<string | null>(() => merker.openId);
  // Mit welchem Teil eine Komitee-Seite aufgeht (Vorschau-Zeilen: Pinnwand oder Chat)
  const [openTeil, setOpenTeil] = useState<Teil | undefined>(() => merker.teil);
  // Eintrag der Pinnwand, zu dem die Seite beim Öffnen springt (nur einmal, nicht gemerkt)
  const [openZiel, setOpenZiel] = useState<string | undefined>();
  const [teamOffen, setTeamOffen] = useState(() => merker.teamOffen);
  // Kam man über eine Benachrichtigung zu einer Anfrage, gleich die Anfragen
  // zeigen. Schon beim ersten Zeichnen prüfen: Die Anfrage-Komponenten
  // nehmen die Marke (#anfrage-…) beim Einhängen sofort aus der Adresse.
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (istAnfrageSprung() ? "anfragen" : merker.ansicht));
  const [anfragenZahl, setAnfragenZahl] = useState(0);
  const angelegt = useRef(false);
  const eltern = useElternZahlen(isStaff);

  const chats = topics.filter((t) => t.kind === "chat");
  const teamChat = chats.find((t) => !t.tag) ?? null;

  // Stand für den nächsten Besuch des Reiters merken
  useEffect(() => {
    merker.openId = openId;
    merker.teamOffen = teamOffen;
    merker.ansicht = ansicht;
    if (!openId) merker.teil = undefined;
  }, [openId, teamOffen, ansicht]);

  /** Einen Komitee-Chat öffnen – optional gleich auf der Pinnwand, bei einem bestimmten Eintrag */
  const oeffne = useCallback((id: string, teil?: Teil, ziel?: string) => {
    setOpenTeil(teil);
    setOpenZiel(ziel);
    merker.teil = teil;
    setOpenId(id);
  }, []);

  // Reiter „Chats“ noch einmal angetippt (lib/gescrollt.ts): zurück zu den
  // Kacheln – alle offenen Ebenen schließen, wie in iOS-Apps.
  useEffect(() => {
    const zurWurzel = (e: Event) => {
      const r = (e as CustomEvent<unknown>).detail;
      if (r !== undefined && r !== "themen" && r !== "chats") return;
      setOpenId(null);
      setTeamOffen(false);
      setAnsicht(null);
      setAnschreiben(false);
    };
    window.addEventListener("sv:reiter-wurzel", zurWurzel);
    return () => window.removeEventListener("sv:reiter-wurzel", zurWurzel);
  }, []);

  // Benachrichtigung, während der Reiter schon offen ist. Als Layout-Effekt,
  // damit dieser Zuhörer VOR denen der Anfrage-Komponenten an der Reihe ist –
  // die entfernen die Marke aus der Adresse.
  useLayoutEffect(() => {
    const pruefe = () => {
      if (!istAnfrageSprung()) return;
      setOpenId(null);
      setAnsicht("anfragen");
    };
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, []);

  // Aus einer Benachrichtigung (#chat-<id>): genau diesen Chat öffnen.
  // Ebenso „#chats/<ziel>“ (Absprache R2: App.tsx öffnet nur den Reiter und
  // lässt die Marke stehen): <chat-id>, <chat-id>/<eintrag-id> (Pinnwand bei
  // diesem Eintrag) oder eine Unterseite (anfragen, schueler, eltern, elterninfos).
  useEffect(() => {
    if (!ready) return;
    const ausAdresse = () => {
      const unter = window.location.hash.match(/^#chats\/([^/]+)(?:\/(.+))?$/);
      const m = unter ?? window.location.hash.match(/^#chat-([0-9a-f-]{36})$/i);
      if (!m) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      const ziel = decodeURIComponent(m[1]);
      // „#chats/team“: Schüler öffnen ihr Gespräch mit dem Stufenteam
      if (unter && ziel === "team" && !isStaff) {
        setOpenId(null);
        return setTeamOffen(true);
      }
      if (unter && isStaff && (["anfragen", "schueler", "eltern", "elterninfos"] as const).includes(ziel as never)) {
        setOpenId(null);
        return setAnsicht(ziel as Ansicht);
      }
      const t = topics.find((x) => x.id === ziel);
      if (!t) return;
      // Schüler sehen ihre Gespräche mit dem Team als einen durchgehenden Chat
      if (t.kind === "ticket" && !isStaff) return setTeamOffen(true);
      const eintrag = unter?.[2] ? items.find((i) => i.id === decodeURIComponent(unter[2]) && i.topic_id === t.id) : undefined;
      const aufPinnwand = eintrag && (eintrag.type === "umfrage" || eintrag.type === "todo" || eintrag.pinned);
      if (aufPinnwand) oeffne(t.id, "uebersicht", eintrag.id);
      else oeffne(t.id, eintrag ? "chat" : undefined);
    };
    ausAdresse();
    window.addEventListener("hashchange", ausAdresse);
    return () => window.removeEventListener("hashchange", ausAdresse);
  }, [ready, topics, items, isStaff, oeffne]);
  const meineKoms = committeesOf(uid);

  // Fehlende Chats einmalig anlegen – nur wer Chats verwalten darf, kann das.
  useEffect(() => {
    if (!ready || !darfVerwalten || !siehtAlle || angelegt.current) return;
    const fehlend = COMMITTEES.filter((c) => !chats.some((t) => t.tag === c.slug));
    const brauchtTeam = !teamChat;
    if (!fehlend.length && !brauchtTeam) return;
    angelegt.current = true;
    void (async () => {
      for (const c of fehlend) {
        await createTopic({ title: c.label, tag: c.slug, visibility: "komitee", memberIds: [], komiteeSlugs: [], kind: "chat" });
      }
      if (brauchtTeam) {
        await createTopic({ title: TEAM_CHAT_TITLE, tag: "", visibility: "stufenteam", memberIds: [], komiteeSlugs: [], kind: "chat" });
      }
    })();
  }, [ready, darfVerwalten, siehtAlle, topics, chats, teamChat, createTopic]);

  const tickets = useMemo(
    // Schüler: eigene Fragen UND Gespräche, die das Team mit ihnen begonnen hat
    () =>
      topics.filter(
        (t) => t.kind === "ticket" && (isStaff || t.created_by === uid || (members[t.id] || []).includes(uid)),
      ),
    [topics, members, isStaff, uid],
  );

  /** Letzte Nachricht eines Chats als kurze Vorschau („Lena: Treffen um 3?“) */
  const vorschau = useCallback(
    (topicIds: string[], leer: string) => {
      const ids = new Set(topicIds);
      let letzte: (typeof items)[number] | null = null;
      for (const i of items) {
        if (!ids.has(i.topic_id) || i.type !== "nachricht" || i.pinned) continue;
        if (!letzte || i.created_at > letzte.created_at) letzte = i;
      }
      if (!letzte) return leer;
      const wer = letzte.created_by === uid ? "Du" : lesbarerName(letzte.author || "").split(" ")[0] || "Jemand";
      return `${wer}: ${letzte.body}`;
    },
    [items, uid],
  );

  /**
   * Untertitel eines Komitees (Kachel und Liste). Vorher stand „noch keine
   * Nachricht“ neben einer roten 5 – die 5 steckte auf der Pinnwand. Jetzt
   * sagt die Zeile, wo das Neue ist, und sonst, was offen ist.
   */
  const komiteeUnter = (t: Topic, leer: string) => {
    const nPin = unreadCount(t.id, "uebersicht");
    if (nPin && !unreadCount(t.id, "chat")) return `${nPin} neu auf der Pinnwand`;
    return vorschau([t.id], "") || standText(items, t.id, myVotes) || leer;
  };

  const glocke = (k: Kategorie) => ({ an: kategorieAn(mitteilungen, k), setAn: (an: boolean) => void setKategorie(k, an) });

  if (!ready)
    return (
      <div className="pt-2">
        <SkelettKarten n={4} />
      </div>
    );

  const offen = topics.find((t) => t.id === openId) ?? null;
  const offeneTickets = tickets.filter((t) => t.status !== "erledigt");
  // Rote Zahl nur für offene Gespräche – erledigte zählen nicht mehr
  const ticketUngelesen = offeneTickets.reduce((n, t) => n + unreadCount(t.id), 0);

  const reihenfolge = new Map(COMMITTEES.map((c, i) => [c.slug, i]));
  const komiteeChats = chats
    .filter((t) => t.tag)
    .sort((a, b) => (reihenfolge.get(a.tag) ?? 99) - (reihenfolge.get(b.tag) ?? 99));
  const meineChats = komiteeChats.filter((t) => meineKoms.includes(t.tag));
  const andereChats = komiteeChats.filter((t) => !meineKoms.includes(t.tag));
  // Vorschau-Gruppen unter den Kacheln (nur Schüler): eigene Komitees mit Inhalt
  // und die letzte Nachricht im Gespräch mit dem Team
  const vorschauKomitees = isStaff ? [] : meineChats.filter((t) => items.some((i) => i.topic_id === t.id && i.type !== "system"));
  const ticketIds = new Set(tickets.map((t) => t.id));
  const teamLetzte = isStaff
    ? null
    : items.filter((i) => ticketIds.has(i.topic_id) && i.type === "nachricht").sort(neuesteZuerst)[0] ?? null;
  const vorschauZahl = vorschauKomitees.length + (teamLetzte ? 1 : 0);

  // ------------------------------------------------------------ Kacheln
  const kacheln: JSX.Element[] = [];
  const komiteeKachel = (t: Topic) => (
    <FarbKachel
      key={t.id}
      {...FARBE.komitee}
      symbol={committeeIcon(t.tag)}
      titel={committeeLabel(t.tag)}
      unter={komiteeUnter(t, "Mein Komitee – noch keine Nachricht")}
      zahl={unreadCount(t.id)}
      zahlRot
      onClick={() => oeffne(t.id)}
    />
  );

  // Symbole wie in den Köpfen der Ebenen, die sie öffnen (Design-Regeln 5: keine Emojis)
  if (isStaff) {
    kacheln.push(
      <FarbKachel
        key="anfragen"
        {...FARBE.anfragen}
        symbol={<Icon name="haken" size={19} strich={2.6} />}
        titel="Anfragen"
        unter={anfragenZahl ? `${anfragenZahl} warten auf eine Entscheidung` : "Gerade nichts offen"}
        zahl={anfragenZahl}
        zahlRot
        gedaempft={!anfragenZahl}
        onClick={() => setAnsicht("anfragen")}
      />,
    );
    if (teamChat)
      kacheln.push(
        <FarbKachel
          key="teamchat"
          {...FARBE.team}
          symbol={<Icon name="chats" size={19} strich={2.2} />}
          titel="Stufenteam-Chat"
          unter={vorschau([teamChat.id], "Nur fürs Team")}
          zahl={unreadCount(teamChat.id)}
          zahlRot
          onClick={() => oeffne(teamChat.id)}
        />,
      );
    kacheln.push(
      <FarbKachel
        key="schueler"
        {...FARBE.schueler}
        symbol={<Icon name="person" size={19} strich={2.2} />}
        titel="Schüler"
        unter={offeneTickets.length ? `${offeneTickets.length} ${offeneTickets.length === 1 ? "Gespräch" : "Gespräche"} offen` : "Kein Gespräch offen"}
        zahl={ticketUngelesen}
        zahlRot
        onClick={() => setAnsicht("schueler")}
      />,
      <FarbKachel
        key="eltern"
        {...FARBE.eltern}
        symbol={<Icon name="rollen" size={19} strich={2.2} />}
        titel="Eltern"
        unter={eltern.offen ? `${eltern.offen} ${eltern.offen === 1 ? "Gespräch" : "Gespräche"} offen` : "Kein Gespräch offen"}
        zahl={eltern.neu}
        zahlRot
        onClick={() => setAnsicht("eltern")}
      />,
      <FarbKachel
        key="elterninfos"
        {...FARBE.infos}
        symbol={<Icon name="info" size={19} strich={2.2} />}
        titel="Infos für Eltern"
        unter={eltern.infos ? `${eltern.infos} veröffentlicht` : "Noch nichts veröffentlicht"}
        onClick={() => setAnsicht("elterninfos")}
      />,
    );
    // Eigene Komitees des Teams ebenfalls als Kachel – die übrigen in der Liste
    for (const t of meineChats) kacheln.push(komiteeKachel(t));
  } else {
    // „Mithilfe nachtragen“ steht nicht mehr hier: dafür gibt es oben in der
    // Kopfzeile auf jedem Reiter „+ Nachtragen“ (ein Antrag ist kein Chat).
    for (const t of meineChats) kacheln.push(komiteeKachel(t));
    kacheln.push(
      <FarbKachel
        key="frag"
        {...FARBE.team}
        symbol={<Icon name="schild" size={19} strich={2.2} />}
        titel="Frag das Stufenteam"
        unter={vorschau(tickets.map((t) => t.id), "Frag hier alles – das Team antwortet dir")}
        zahl={ticketUngelesen}
        zahlRot
        onClick={() => setTeamOffen(true)}
      />,
    );
  }
  // Ungerade Anzahl: die letzte Kachel geht über beide Spalten (am Handy)
  const breitLetzte = kacheln.length % 2 === 1;
  // Am Rechner so viele Spalten, dass keine halbe Reihe leer bleibt
  // (6 Kacheln: 3 + 3 statt 4 + 2; eine einzelne Kachel über die ganze Breite)
  const n = kacheln.length;
  const lgSpalten =
    n === 1 ? "lg:grid-cols-1" : n === 2 ? "lg:grid-cols-2" : n === 3 || n === 5 || n === 6 || n === 9 ? "lg:grid-cols-3" : "lg:grid-cols-4";

  return (
    <div className="space-y-6 pb-4">
      <div className={`grid grid-cols-2 gap-3 ${lgSpalten}`}>
        {kacheln.map((k, i) =>
          breitLetzte && i === kacheln.length - 1 ? (
            <div key={k.key} className="col-span-2 grid lg:col-span-1">
              {k}
            </div>
          ) : (
            k
          ),
        )}
      </div>

      {!isStaff && meineChats.length === 0 && (
        <p className="auf-bild -mt-2 px-4 text-[13px] leading-snug text-tinte-leise">
          Du bist noch in keinem Komitee. Das Stufenteam kann dich eintragen – dann steht dein Komitee-Chat hier oben.
        </p>
      )}

      {/* Schüler/Komitee-Mitglieder: was im eigenen Komitee wartet und die
          letzte Nachricht mit dem Team, direkt unter den Kacheln (vorher war
          der Rest des Reiters leer). Am Laptop zwei Spalten – aber nur, wenn
          es mehr als eine Gruppe gibt (sonst endete eine Gruppe in der Mitte). */}
      {vorschauZahl > 0 && (
        <div className={`grid gap-x-5 gap-y-6 lg:items-start ${vorschauZahl > 1 ? "lg:grid-cols-2" : ""}`}>
          {vorschauKomitees.map((t) => (
            <KomiteeVorschau key={t.id} topic={t} onOeffnen={(teil, ziel) => oeffne(t.id, teil, ziel)} />
          ))}
          {teamLetzte && <TeamVorschau letzte={teamLetzte} uid={uid} onOeffnen={() => setTeamOffen(true)} />}
        </div>
      )}

      {/* Komitee-Chats: ruhige Liste. Fürs Team mit Glocke je Komitee. */}
      {andereChats.length > 0 &&
        (isStaff ? (
          <Gruppe
            className=""
            titel={meineChats.length ? "Weitere Komitees" : "Komitees"}
            fuss="Glocke an = Mitteilungen und roter Punkt auch für Komitees, in denen du nicht bist."
          >
            {andereChats.map((t) => {
              const an = komiteeAn(mitteilungen, t.tag, false);
              return (
                <ChatZeile
                  key={t.id}
                  titel={committeeLabel(t.tag)}
                  icon={committeeIcon(t.tag)}
                  unter={komiteeUnter(t, "Noch keine Nachricht")}
                  unread={zaehlt(t) ? unreadCount(t.id) : 0}
                  onOpen={() => oeffne(t.id)}
                  glocke={{ an, setAn: (x) => void setKomitee(t.tag, x), name: committeeLabel(t.tag) }}
                />
              );
            })}
          </Gruppe>
        ) : (
          // Schüler sehen andere Komitees normalerweise gar nicht (Datenbank);
          // falls doch (Testbetrieb), zugeklappt, damit nichts überladen wirkt.
          <details className="group">
            <summary className="auf-bild flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise [&::-webkit-details-marker]:hidden">
              Weitere Komitees ({andereChats.length})
              <span className="transition group-open:rotate-90" aria-hidden>
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <div className="gruppe-zellen mt-1">
              {andereChats.map((t) => (
                <ChatZeile
                  key={t.id}
                  titel={committeeLabel(t.tag)}
                  icon={committeeIcon(t.tag)}
                  unread={0}
                  onOpen={() => oeffne(t.id)}
                />
              ))}
            </div>
          </details>
        ))}

      {/* ---------------------------------------------- Ebenen (Vollbild) */}
      {isStaff && (
        // Immer eingehängt (unsichtbar), damit die Kachel ihre Zahl kennt
        // und Benachrichtigungen („bitte prüfen“) sofort hierher führen.
        <AnfragenEbene
          sichtbar={ansicht === "anfragen" && !offen}
          onBack={() => setAnsicht(null)}
          onZahl={setAnfragenZahl}
          glocke={glocke("anfragen")}
        />
      )}
      {isStaff && ansicht === "schueler" && (
        <TicketListe
          offene={offeneTickets}
          erledigt={tickets.filter((t) => t.status === "erledigt")}
          onBack={() => setAnsicht(null)}
          onOpen={(id) => oeffne(id)}
          onAnschreiben={() => setAnschreiben(true)}
          glocke={glocke("schueler")}
        />
      )}
      {isStaff && ansicht === "eltern" && <ElternGespraecheEbene onBack={() => setAnsicht(null)} glocke={<MitteilungsGruppe {...glocke("eltern")} name="Chats mit Eltern" fuss="Kommt als Mitteilung aufs Handy, sobald Eltern schreiben." />} />}
      {isStaff && ansicht === "elterninfos" && <ElternInfosEbene onBack={() => setAnsicht(null)} />}

      {/* Schüler: durchgehender Chat mit dem Stufenteam */}
      {teamOffen && !isStaff && <TeamChatSchueler tickets={tickets} onBack={() => setTeamOffen(false)} />}

      {/* Ein geöffneter Chat liegt über allem – auch über einer Liste, aus der
          er geöffnet wurde; Zurück führt dann wieder in diese Liste. */}
      {offen &&
        (offen.kind === "chat" ? (
          <KomiteePage
            key={offen.id}
            topic={offen}
            startTeil={openTeil}
            startZiel={openZiel}
            onTeil={(t) => {
              merker.teil = t;
            }}
            onBack={() => setOpenId(null)}
          />
        ) : (
          <TicketChat key={offen.id} topic={offen} onBack={() => setOpenId(null)} />
        ))}

      {isStaff && <SchuelerAnschreiben open={anschreiben} onClose={() => setAnschreiben(false)} />}
    </div>
  );
}

/* ------------------------------------------------ Vorschau eines Komitees */

const abgelaufen = (i: TopicItem) => Boolean(i.poll_deadline) && new Date(i.poll_deadline!).getTime() < Date.now();
const neuesteZuerst = (a: TopicItem, b: TopicItem) => (a.created_at < b.created_at ? 1 : -1);
const fristKurz = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const zeitKurz = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
};

/** Was in einem Komitee offen ist, als eine Zeile („1 Abstimmung offen · 2 To-dos offen“). */
function standText(items: TopicItem[], topicId: string, myVotes: Record<string, unknown[]>): string {
  const eig = items.filter((i) => i.topic_id === topicId);
  // Nur Abstimmungen, bei denen man selbst noch nicht abgestimmt hat
  const umfragen = eig.filter((i) => i.type === "umfrage" && !abgelaufen(i) && !(myVotes[i.id] || []).length).length;
  const todos = eig.filter((i) => i.type === "todo" && !i.done).length;
  const teile: string[] = [];
  if (umfragen) teile.push(`${umfragen} ${umfragen === 1 ? "Abstimmung" : "Abstimmungen"} offen`);
  if (todos) teile.push(`${todos} ${todos === 1 ? "To-do" : "To-dos"} offen`);
  if (teile.length) return teile.join(" · ");
  const pin = eig.filter((i) => i.type === "nachricht" && i.pinned).sort(neuesteZuerst)[0];
  return pin ? `Angepinnt: ${pin.body}` : "";
}

/**
 * Was im eigenen Komitee wartet – direkt unter den Kacheln, damit man nicht
 * erst den Chat öffnen muss (und der Reiter nicht halb leer bleibt):
 * neuestes Angepinntes, offene Abstimmungen (ohne eigene Stimme zuerst),
 * offene To-dos und die letzte Nachricht. Jede Zeile öffnet die passende
 * Stelle (Pinnwand oder Chat). Ist nichts da, fehlt die Gruppe ganz.
 */
function KomiteeVorschau({ topic, onOeffnen }: { topic: Topic; onOeffnen: (teil: Teil, ziel?: string) => void }) {
  const { items, myVotes, uid } = useTopics();
  // Gesperrte dürfen nicht abstimmen – dann auch kein „Abstimmen“ anbieten
  const { banned } = useRole();
  const eig = items.filter((i) => i.topic_id === topic.id);
  const pin = eig.filter((i) => i.type === "nachricht" && i.pinned).sort(neuesteZuerst)[0];
  const ohneStimme = (u: TopicItem) => !u.antwort_art && !(myVotes[u.id] || []).length;
  const umfragen = eig
    .filter((i) => i.type === "umfrage" && !abgelaufen(i))
    .sort((a, b) => Number(ohneStimme(b)) - Number(ohneStimme(a)) || neuesteZuerst(a, b))
    .slice(0, 2);
  const todos = eig.filter((i) => i.type === "todo" && !i.done).sort(neuesteZuerst);
  const letzte = eig.filter((i) => i.type === "nachricht" && !i.pinned).sort(neuesteZuerst)[0];

  const zeilen: JSX.Element[] = [];
  if (pin)
    zeilen.push(
      <Zeile
        key="pin"
        label={<span className="line-clamp-2 [overflow-wrap:anywhere]">{pin.body}</span>}
        unter="Angepinnt"
        symbol={
          <Symbol farbe="bg-[#E8590C]">
            <Icon name="pin" size={17} strich={2.2} />
          </Symbol>
        }
        onClick={() => onOeffnen("uebersicht", pin.id)}
      />,
    );
  // Jede Zeile springt zu IHREM Eintrag auf der Pinnwand (mittig, kurz hervorgehoben)
  for (const u of umfragen)
    zeilen.push(
      <Zeile
        key={u.id}
        label={<span className="line-clamp-2 [overflow-wrap:anywhere]">{u.body}</span>}
        unter={u.poll_deadline ? `Abstimmung · bis ${fristKurz(u.poll_deadline)}` : "Abstimmung"}
        symbol={
          <Symbol farbe="bg-[#5E5CE6]">
            <Icon name="umfrage" size={17} strich={2.2} />
          </Symbol>
        }
        onClick={() => onOeffnen("uebersicht", u.id)}
      >
        {banned ? null : ohneStimme(u) ? (
          <span className="text-[15px] font-medium text-brand-dark dark:text-brand">Abstimmen</span>
        ) : !u.antwort_art ? (
          <Wert>Abgestimmt</Wert>
        ) : null}
      </Zeile>,
    );
  if (todos.length)
    zeilen.push(
      <Zeile
        key="todos"
        label="To-dos"
        unter={<span className="line-clamp-1 [overflow-wrap:anywhere]">{todos[0].body}</span>}
        symbol={
          <Symbol farbe="bg-[#248A3D]">
            <Icon name="haken" size={17} strich={2.4} />
          </Symbol>
        }
        onClick={() => onOeffnen("uebersicht", todos[0].id)}
      >
        <Wert>{todos.length} offen</Wert>
      </Zeile>,
    );
  if (letzte) {
    const wer = letzte.created_by === uid ? "Du" : lesbarerName(letzte.author || "").split(" ")[0] || "Jemand";
    zeilen.push(
      <Zeile
        key="chat"
        label={
          <span className="line-clamp-2 [overflow-wrap:anywhere]">
            <span className="font-semibold">{wer}:</span> {letzte.body}
          </span>
        }
        unter={`Letzte Nachricht · ${zeitKurz(letzte.created_at)}`}
        symbol={
          <Symbol farbe="bg-[#007AFF]">
            <Icon name="chats" size={17} strich={2.2} />
          </Symbol>
        }
        onClick={() => onOeffnen("chat")}
      />,
    );
  }
  if (!zeilen.length) return null;
  return (
    <Gruppe className="" titel={committeeLabel(topic.tag)}>
      {zeilen}
    </Gruppe>
  );
}

/** Schüler: die letzte Nachricht im Gespräch mit dem Stufenteam – ein Tipp öffnet den Chat. */
function TeamVorschau({ letzte, uid, onOeffnen }: { letzte: TopicItem; uid: string | null; onOeffnen: () => void }) {
  const wer = letzte.created_by === uid ? "Du" : "Stufenteam";
  return (
    <Gruppe className="" titel="Stufenteam">
      <Zeile
        label={
          <span className="line-clamp-2 [overflow-wrap:anywhere]">
            <span className="font-semibold">{wer}:</span> {letzte.body}
          </span>
        }
        unter={`Letzte Nachricht · ${zeitKurz(letzte.created_at)}`}
        symbol={
          <Symbol farbe="bg-[#007AFF]">
            <Icon name="schild" size={17} strich={2.2} />
          </Symbol>
        }
        onClick={onOeffnen}
      />
    </Gruppe>
  );
}

/** Mitteilungen an/aus – klein, damit es nicht wie eine Hauptaktion wirkt. */
function Glocke({ an, setAn, name }: { an: boolean; setAn: (an: boolean) => void; name: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setAn(!an);
      }}
      role="switch"
      aria-checked={an}
      aria-label={`Mitteilungen für ${name}`}
      title={an ? "Mitteilungen an – antippen zum Ausschalten" : "Mitteilungen aus – antippen zum Einschalten"}
      // after: unsichtbar vergrößerte Trefferfläche (die Kapsel selbst bleibt klein und ruhig)
      className={`relative flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold transition after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] active:scale-95 ${
        an
          ? "bg-brand/[0.08] text-[#004f9e] dark:bg-brand/20 dark:text-brand-soft"
          : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
      }`}
    >
      <Icon name={an ? "glocke" : "glocke-aus"} size={14} strich={2.2} />
      {an ? "an" : "aus"}
    </button>
  );
}

/** Eine Zeile in der Komitee-Liste: Symbol, Name, letzte Nachricht, Zahl, Glocke. */
function ChatZeile({
  titel, unter, icon, unread, onOpen, glocke,
}: {
  titel: string;
  unter?: string;
  icon: string;
  unread: number;
  onOpen: () => void;
  glocke?: { an: boolean; setAn: (an: boolean) => void; name: string };
}) {
  return (
    <div className="flex w-full items-center">
      <button
        onClick={onOpen}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[18px] dark:bg-[rgb(118_118_128/0.24)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold">{titel}</span>
          {unter && <span className="block truncate text-[12.5px] text-tinte-leise">{unter}</span>}
        </span>
        {unread > 0 && (
          <span className="zahl flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {!glocke && <span aria-hidden className="text-[17px] leading-none text-tinte-leise">›</span>}
      </button>
      {glocke && (
        <span className="pr-3">
          <Glocke an={glocke.an} setAn={glocke.setAn} name={glocke.name} />
        </span>
      )}
    </div>
  );
}

/**
 * Mitteilungen für einen Bereich an/aus – als eigene Gruppe am Ende der
 * jeweiligen Unterseite (eine Stelle je Bereich, nicht verstreut).
 */
function MitteilungsGruppe({ an, setAn, name, fuss }: { an: boolean; setAn: (an: boolean) => void; name: string; fuss?: string }) {
  return (
    <Gruppe titel="Mitteilungen" fuss={fuss} className="mt-6">
      <ZeileMitSchalter
        label={name}
        symbol={
          <Symbol farbe="bg-[#FF3B30]">
            <Icon name="glocke" size={17} strich={2.2} />
          </Symbol>
        }
      >
        <Schalter an={an} onChange={setAn} label={`Mitteilungen für ${name}`} />
      </ZeileMitSchalter>
    </Gruppe>
  );
}

/** Leerer Zustand einer Unterseite: Liniensymbol, ein Satz, was als Nächstes passiert. */
function Leer({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand dark:bg-brand/20">
        <Icon name={icon} size={26} />
      </span>
      <p className="auf-bild mx-auto mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">{text}</p>
    </div>
  );
}

/**
 * Zählt die Meldungen in der Anfragen-Ebene. MeldungenAnfragen (Melden.tsx)
 * meldet ihre Anzahl nicht selbst; statt die Meldungen ein zweites Mal zu
 * laden (doppelte Live-Verbindung „sv-meldungen“), zählen wir die Karten in
 * ihrem Behälter #sprung-meldung.
 */
function useMeldungenZahl(box: HTMLElement | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!box) return;
    const zaehlen = () => setN(box.querySelector("#sprung-meldung")?.childElementCount ?? 0);
    zaehlen();
    const mo = new MutationObserver(zaehlen);
    mo.observe(box, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [box]);
  return n;
}

/**
 * Ein Abschnitt der Anfragen-Seite (Überschrift mit Zahl + Karten). Bleibt immer
 * eingehängt (nur unsichtbar, wenn n = 0), damit die Anfrage-Komponenten darin
 * weiter zählen und live nachladen. Bewusst AUSSERHALB von AnfragenEbene: als
 * Funktion im Funktionskörper wäre es bei jedem Zeichnen ein „neuer“ Baustein,
 * und alle Kinder würden dabei neu aufgebaut und neu geladen.
 */
function AnfragenAbschnitt({ titel, n, children }: { titel: string; n: number; children: React.ReactNode }) {
  return (
    <section className={n ? "mb-6" : "hidden"}>
      <h3 className="auf-bild mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
        {titel} <span className="zahl">· {n}</span>
      </h3>
      <div className="grid gap-2.5 lg:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * Alle Anfragen ans Team auf einer Seite, nach Art gruppiert (mit Anzahl),
 * damit man nicht durch eine lange gemischte Liste scrollen muss.
 */
function AnfragenEbene({
  sichtbar, onBack, onZahl, glocke,
}: {
  sichtbar: boolean;
  onBack: () => void;
  onZahl: (n: number) => void;
  glocke: { an: boolean; setAn: (an: boolean) => void };
}) {
  const { can } = useRole();
  const [zahlen, setZahlen] = useState({ nachtrag: 0, komitee: 0, entsperren: 0, foto: 0 });
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const meldungen = useMeldungenZahl(box);
  // Verschieben (offiziell ↔ inoffiziell): nur laden/zeigen, wenn man irgendwo mitentscheiden darf –
  // die Datenbank liefert ohnehin nur, was man sehen darf (Rechte je Bereich).
  const darfVerschieben = can("zitate.pruefen") || can("rankings.verwalten") || can("motto.verwalten") || can("album.moderieren");
  const verschieben = useAlleVerschiebungen(darfVerschieben);
  const verschiebeZahl = darfVerschieben ? verschieben.liste.length : 0;
  // Je Art ein fester Rückruf – sonst liefen die Effekte der Kinder bei jedem Zeichnen neu
  const setzer = useMemo(() => {
    const f = (k: keyof typeof zahlen) => (n: number) => setZahlen((z) => (z[k] === n ? z : { ...z, [k]: n }));
    return { nachtrag: f("nachtrag"), komitee: f("komitee"), entsperren: f("entsperren"), foto: f("foto") };
  }, []);
  const summe = zahlen.nachtrag + zahlen.komitee + zahlen.entsperren + zahlen.foto + meldungen + verschiebeZahl;
  useEffect(() => onZahl(summe), [summe, onZahl]);

  return (
    <ChatEbene
      sichtbar={sichtbar}
      onSchliessen={onBack}
      label="Anfragen"
      // Listen beginnen oben – die erste Anfrage ist die wichtigste, nicht die letzte
      start="oben"
      kopf={<ChatKopf onBack={onBack} symbol={<Icon name="haken" size={17} strich={2.4} />} titel="Anfragen" unter={summe ? `${summe} offen` : "Alles erledigt"} />}
    >
      <div ref={setBox} className="py-4">
        {summe === 0 && <Leer icon="haken" text="Gerade keine offenen Anfragen. Neue erscheinen hier – mit roter Zahl auf der Kachel." />}
        <AnfragenAbschnitt titel="Meldungen" n={meldungen}>
          <MeldungenAnfragen />
        </AnfragenAbschnitt>
        <AnfragenAbschnitt titel="Verschieben (offiziell ↔ inoffiziell)" n={verschiebeZahl}>
          {darfVerschieben &&
            verschieben.liste.map((v) => (
              <VerschiebeAnfrage key={v.id} v={v} onZustimmen={() => void verschieben.zustimmen(v.id)} onAblehnen={() => void verschieben.ablehnen(v.id)} />
            ))}
        </AnfragenAbschnitt>
        <AnfragenAbschnitt titel="Mithilfe nachtragen" n={zahlen.nachtrag}>
          <NachtragAnfragen onAnzahl={setzer.nachtrag} />
        </AnfragenAbschnitt>
        <AnfragenAbschnitt titel="Komitee-Wünsche" n={zahlen.komitee}>
          <KomiteeRequests onAnzahl={setzer.komitee} />
        </AnfragenAbschnitt>
        <AnfragenAbschnitt titel="Entsperren" n={zahlen.entsperren}>
          <UnbanRequests onAnzahl={setzer.entsperren} />
        </AnfragenAbschnitt>
        <AnfragenAbschnitt titel="Steckbrief-Fotos" n={zahlen.foto}>
          <FotoFreigaben onAnzahl={setzer.foto} />
        </AnfragenAbschnitt>
        <MitteilungsGruppe {...glocke} name="Neue Anfragen" fuss="Kommt als Mitteilung aufs Handy, sobald jemand etwas beantragt." />
      </div>
    </ChatEbene>
  );
}

/**
 * Ein offener Antrag „von Inoffiziell nach Offiziell verschieben“ (oder zurück).
 * Zustimmen zählt eine Stimme; ist die nötige Zahl erreicht (Admin: reicht allein),
 * wird verschoben. Verwerfen zieht den Antrag zurück. Gleiche Zellen wie die übrigen
 * Anfragen – Bereich (Zitat, Ranking, Motto, Kommentar) steht über dem Text.
 */
function VerschiebeAnfrage({
  v, onZustimmen, onAblehnen,
}: { v: Verschiebung & { tabelle: TeilTabelle }; onZustimmen: () => void; onAblehnen: () => void }) {
  return (
    <div className="gruppe-zellen">
      <div className="px-4 py-3.5">
        <div className="text-[12.5px] font-semibold text-tinte-leise">
          {TABELLE_NAME[v.tabelle]} · nach „{TEIL_NAME[v.nach]}“
        </div>
        <div className="mt-0.5 line-clamp-3 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{v.titel}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-tinte-leise">
          <span>Beantragt von {v.von || "jemandem aus dem Team"}</span>
          <ZustimmungsMarke zahl={v.stimmen} noetig={v.noetig} ichSchon={v.ich} />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-klein-grau flex-1"
            onClick={() => void frage("Diesen Antrag verwerfen? Der Eintrag bleibt, wo er ist.", "Verwerfen", true).then((ok) => { if (ok) onAblehnen(); })}
          >
            Verwerfen
          </button>
          {v.ich ? (
            <span className="flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 text-[14px] font-semibold text-[#1E7B34] dark:text-[#30D158]">
              <Icon name="haken" size={15} strich={2.6} /> Zugestimmt
            </span>
          ) : (
            <button className="btn-klein flex-1" onClick={onZustimmen}>
              Zustimmen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Schüleransicht: ein einziger Verlauf. Neue Nachrichten landen im offenen
 * Ticket; gibt es keins, wird im Hintergrund ein neues eröffnet.
 */
function TeamChatSchueler({ tickets, onBack }: { tickets: Topic[]; onBack: () => void }) {
  const { items, postItem, deleteItem, markRead, createTopic, committeesOf, uid } = useTopics();
  const { role, banned } = useRole();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const meineIds = new Set(tickets.map((t) => t.id));
  const verlauf = items
    .filter((i) => meineIds.has(i.topic_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  useEffect(() => {
    for (const t of tickets) markRead(t.id);
  }, [tickets, verlauf.length, markRead]);

  async function senden() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const nachricht = text;
    setText("");
    const meta = { role, koms: committeesOf(uid) };
    const offenes = tickets.find((t) => t.status !== "erledigt");
    if (offenes) {
      await postItem(offenes, "nachricht", nachricht, undefined, "", meta);
    } else {
      const titel = nachricht.trim().slice(0, 60);
      const id = await createTopic({
        title: titel,
        tag: "",
        visibility: "stufenteam",
        memberIds: [],
        komiteeSlugs: [],
        kind: "ticket",
      });
      if (id) {
        await postItem(
          { id, title: titel, tag: "", kind: "ticket", status: "offen", pinned: false, admin_only: false, visibility: "stufenteam", parent_id: null, created_by: uid, created_at: new Date().toISOString() },
          "nachricht",
          nachricht,
          undefined,
          "",
          meta,
        );
      }
    }
    setBusy(false);
  }

  return (
    <ChatEbene
      label="Stufenteam"
      onSchliessen={onBack}
      kopf={<ChatKopf onBack={onBack} symbol={<Icon name="schild" size={17} strich={2.2} />} titel="Stufenteam" unter="Das Team antwortet dir hier" />}
      fuss={banned ? undefined : <ChatEingabe wert={text} setWert={setText} onSenden={senden} />}
    >
      {banned ? (
        <div className="mt-3">
          <BannHinweis />
        </div>
      ) : (
        <ChatBlasen
          liste={verlauf}
          uid={uid}
          darfLoeschen={false}
          onDelete={deleteItem}
          leerText="Schreib dem Stufenteam – die Antwort kommt hier in den Chat."
        />
      )}
    </ChatEbene>
  );
}

/** Teamansicht: ein Ticket als Chat – im Kopf „Erledigt“ und „…“ (Löschen im Blatt). */
function TicketChat({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, deleteItem, deleteTopic, updateTopic, markRead, committeesOf, uid } = useTopics();
  const { role, can, isStaff, banned } = useRole();
  const { profile } = useProfiles();
  const [text, setText] = useState("");
  const [mehr, setMehr] = useState(false);

  const liste = items
    .filter((i) => i.topic_id === topic.id)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  useEffect(() => {
    markRead(topic.id);
  }, [topic.id, liste.length, markRead]);

  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  const person = useTicketPerson(topic);
  const name = person ? profile[person]?.anzeigename : "";
  const erledigt = topic.status === "erledigt";
  const umschalten = () => void updateTopic(topic.id, { status: erledigt ? "offen" : "erledigt" });

  return (
    <ChatEbene
      label={name || "Frage"}
      onSchliessen={onBack}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Avatar userId={person} name={name} size={32} />}
          titel={name || "Frage"}
          unter={erledigt ? `Erledigt · ${topic.title}` : topic.title}
          rechts={isStaff && <GespraechKnoepfe erledigt={erledigt} onErledigt={umschalten} onMehr={() => setMehr(true)} />}
        />
      }
      fuss={banned ? undefined : <ChatEingabe wert={text} setWert={setText} onSenden={senden} platzhalter="Antworten" />}
    >
      <ChatBlasen liste={liste} uid={uid} darfLoeschen={can("chats.delete_messages")} onDelete={deleteItem} />
      {isStaff && (
        <GespraechMehrBlatt
          open={mehr}
          onClose={() => setMehr(false)}
          titel={name || "Frage"}
          unter={erledigt ? `Erledigt · ${topic.title}` : topic.title}
          erledigt={erledigt}
          onErledigt={umschalten}
          loeschen={
            can("chats.manage")
              ? {
                  frage: "Diese Frage samt Verlauf löschen?",
                  fuss: "Alle Nachrichten darin verschwinden – auch für die Schülerin oder den Schüler.",
                  onLoeschen: () => {
                    void deleteTopic(topic.id);
                    onBack();
                  },
                }
              : undefined
          }
        />
      )}
    </ChatEbene>
  );
}

/** Mit wem läuft das Gespräch? Bei Team-Anfängen die angeschriebene Person. */
function useTicketPerson(topic: Topic | null): string | null {
  const { members } = useTopics();
  const { profiles } = useRole();
  if (!topic) return null;
  const team = new Set(
    profiles.filter((p) => ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"].includes(p.role)).map((p) => p.user_id),
  );
  const kandidaten = [topic.created_by, ...(members[topic.id] || [])].filter(Boolean) as string[];
  return kandidaten.find((u) => !team.has(u)) ?? topic.created_by ?? null;
}

/** Das Team schreibt eine Schülerin / einen Schüler direkt an. */
function SchuelerAnschreiben({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles } = useRole();
  const { students } = useStore();
  const { createTopic, postItem, committeesOf, uid } = useTopics();
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [wer, setWer] = useState<string | null>(null);
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setWer(null);
    setBetreff("");
    setText("");
  }, [open]);

  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const liste = useMemo(() => {
    const n = normalize(q);
    return profiles
      .filter((p) => p.role !== "eltern" && p.student_id && p.user_id !== uid)
      .map((p) => {
        const s = nachId.get(p.student_id!);
        return { id: p.user_id, name: s ? `${s.vorname} ${s.nachname}` : p.username || "?" };
      })
      .filter((x) => !n || normalize(x.name).includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .slice(0, 30);
  }, [profiles, nachId, q, uid]);
  const gewaehlt = liste.find((x) => x.id === wer) ?? (wer ? { id: wer, name: "" } : null);

  async function senden() {
    if (!wer || !betreff.trim() || !text.trim() || busy) return;
    setBusy(true);
    const titel = betreff.trim().slice(0, 60);
    const id = await createTopic({
      title: titel, tag: "", visibility: "stufenteam", memberIds: [wer], komiteeSlugs: [], kind: "ticket",
    });
    if (id) {
      await postItem(
        { id, title: titel, tag: "", kind: "ticket", status: "offen", pinned: false, admin_only: false, visibility: "stufenteam", parent_id: null, created_by: uid, created_at: new Date().toISOString() },
        "nachricht",
        text,
        undefined,
        "",
        { role, koms: committeesOf(uid) },
      );
    }
    setBusy(false);
    if (id) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Schüler anschreiben" unter="Kommt als Pop-up an – auch wenn Chat-Meldungen aus sind." onClose={onClose} />
      {!wer ? (
        <>
          <input className="field" placeholder="Name suchen …" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <div className="gruppe-zellen mt-3 max-h-[50vh] overflow-y-auto">
            {liste.map((x) => (
              <button
                key={x.id}
                onClick={() => setWer(x.id)}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <Avatar userId={x.id} name={x.name} size={28} />
                <span className="truncate text-[15px]">{x.name}</span>
              </button>
            ))}
            {liste.length === 0 && <p className="px-4 py-3 text-[14px] text-tinte-leise">Niemand gefunden.</p>}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setWer(null)}
            className="flex min-h-[48px] w-full items-center gap-3 rounded-[0.875rem] zelle px-4 py-2 text-left"
          >
            <Avatar userId={wer} name={gewaehlt?.name} size={28} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{gewaehlt?.name || "Ausgewählt"}</span>
            <span className="text-[15px] text-brand-dark dark:text-brand">Ändern</span>
          </button>
          <label className="mb-1.5 mt-4 block px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Betreff</label>
          <input className="field" placeholder="z. B. Waffelstand 1. Pause" value={betreff} maxLength={60} onChange={(e) => setBetreff(e.target.value)} />
          <label className="mb-1.5 mt-4 block px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Nachricht</label>
          <textarea className="field min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} />
          <FussLeiste>
            <button disabled={busy || !betreff.trim() || !text.trim()} onClick={senden} className="btn-primary">
              {busy ? "Wird gesendet …" : "Senden"}
            </button>
          </FussLeiste>
        </>
      )}
    </Sheet>
  );
}

/**
 * Alle Gespräche mit Schülern – nur fürs Team. Offene oben als Liste,
 * erledigte zugeklappt darunter; oben rechts „+“ zum Anschreiben.
 */
function TicketListe({
  offene, erledigt, onBack, onOpen, onAnschreiben, glocke,
}: {
  offene: Topic[];
  erledigt: Topic[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onAnschreiben: () => void;
  glocke: { an: boolean; setAn: (an: boolean) => void };
}) {
  const { unreadCount } = useTopics();
  // Löschen steht im geöffneten Gespräch (oben rechts) – nicht als Mülleimer in jeder Zeile
  return (
    <ChatEbene
      label="Gespräche mit Schülern"
      onSchliessen={onBack}
      start="oben"
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Icon name="person" size={17} strich={2.2} />}
          titel="Schüler"
          unter={offene.length ? `${offene.length} offen` : "Nichts offen"}
          rechts={
            <button className="iconbtn" onClick={onAnschreiben} aria-label="Schüler anschreiben" title="Schüler anschreiben">
              <Icon name="plus" size={19} strich={2.4} />
            </button>
          }
        />
      }
    >
      <div className="py-4">
        {offene.length === 0 ? (
          <Leer icon="chats" text="Gerade keine offenen Fragen. Mit „+“ oben rechts schreibst du jemanden an." />
        ) : (
          <Gruppe titel="Offen" className="">
            {offene.map((t) => (
              <TicketZeile key={t.id} topic={t} unread={unreadCount(t.id)} onOpen={() => onOpen(t.id)} />
            ))}
          </Gruppe>
        )}

        {erledigt.length > 0 && (
          <details className="group mt-6">
            <summary className="auf-bild flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise [&::-webkit-details-marker]:hidden">
              Erledigt ({erledigt.length})
              <span className="transition group-open:rotate-90" aria-hidden>
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <div className="gruppe-zellen mt-1">
              {erledigt.map((t) => (
                <TicketZeile key={t.id} topic={t} unread={0} onOpen={() => onOpen(t.id)} />
              ))}
            </div>
          </details>
        )}

        <MitteilungsGruppe {...glocke} name="Gespräche mit Schülern" />
      </div>
    </ChatEbene>
  );
}

/** Eine Zeile „Gespräch mit …“ in der Liste der Schüler-Gespräche. */
function TicketZeile({
  topic, unread, onOpen,
}: { topic: Topic; unread: number; onOpen: () => void }) {
  const { profile } = useProfiles();
  const person = useTicketPerson(topic);
  const name = person ? profile[person]?.anzeigename : "";
  return (
    <div className="flex items-center">
      <button
        onClick={onOpen}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
      >
        <Avatar userId={person} name={name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold">{name || "Frage"}</span>
          <span className="block truncate text-[12.5px] text-tinte-leise">{topic.title}</span>
        </span>
        {unread > 0 && (
          <span className="zahl flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {topic.status === "erledigt" && (
          <span className="text-[#248A3D] dark:text-[#30D158]">
            <Icon name="haken" size={16} strich={2.6} />
          </span>
        )}
        <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
      </button>
    </div>
  );
}
