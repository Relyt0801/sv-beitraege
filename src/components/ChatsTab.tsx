import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SkelettKarten } from "./Skelett";
import { useTopics, type Topic } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { UnbanRequests } from "./UnbanRequests";
import { KomiteeRequests } from "./KomiteeRequests";
import { ElternGespraecheEbene, ElternInfosEbene, useElternZahlen } from "./ElternTeamTab";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { KomiteePage } from "./KomiteePage";
import { BannHinweis } from "./BannHinweis";
import { ChatBlasen, ChatEbene, ChatEingabe, ChatKopf } from "./ChatBlasen";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { Sheet, SheetKopf } from "./Sheet";
import { normalize } from "../lib/logic";
import { lesbarerName } from "../lib/profil";

import { frage } from "../lib/melder";
import { NachtragAnfragen } from "./NachtragAnfragen";
import { MeldungenAnfragen } from "./Melden";
import { NachtragSheet } from "./NachtragSheet";
import { Schalter } from "./Schalter";
import { kategorieAn, komiteeAn, useMitteilungen, type Kategorie } from "../lib/mitteilungen";
import { useZaehltMit } from "../lib/chat-zaehler";
import { FotoFreigaben } from "./FotoFreigaben";
import { FarbKachel } from "./Kachel";
import { Gruppe } from "./Liste";
import { Icon } from "./Icon";
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
  nachtragen: { verlauf: "from-[#30B852] to-[#1D7F35]", schatten: "shadow-[0_10px_24px_-14px_rgba(29,127,53,.9)]" },
  anfragen: { verlauf: "from-[#FF9F0A] to-[#E2560B]", schatten: "shadow-[0_10px_24px_-14px_rgba(226,86,11,.9)]" },
  schueler: { verlauf: "from-[#2FB0CC] to-[#0F7690]", schatten: "shadow-[0_10px_24px_-14px_rgba(15,118,144,.9)]" },
  eltern: { verlauf: "from-[#FF4F6F] to-[#D1103F]", schatten: "shadow-[0_10px_24px_-14px_rgba(209,16,63,.9)]" },
  infos: { verlauf: "from-[#BF5AF2] to-[#8B2CC2]", schatten: "shadow-[0_10px_24px_-14px_rgba(139,44,194,.9)]" },
} as const;

/** Unterseiten des Chats-Reiters – jede als eigene Ebene über allem. */
type Ansicht = "anfragen" | "schueler" | "eltern" | "elterninfos" | null;

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
  const { topics, items, members, ready, unreadCount, createTopic, committeesOf, uid } = useTopics();
  const { can, isStaff } = useRole();
  const [anschreiben, setAnschreiben] = useState(false);
  const [nachtragen, setNachtragen] = useState(false);
  const { mitteilungen, setKategorie, setKomitee } = useMitteilungen();
  const zaehlt = useZaehltMit();
  const darfVerwalten = can("chats.manage");
  // Nur wer ALLE Chats sieht, kann erkennen, welcher wirklich fehlt. Wer nur
  // einen Teil sieht (z. B. direkt nach einem Rollenwechsel, solange die Liste
  // noch aus der alten Sicht stammt), hielte unsichtbare Chats für fehlend –
  // so entstanden am 24.09.2026 doppelte Komitee-Chats. Zusätzlich überspringt
  // die Datenbank Doppelte selbst (supabase/komitee-chats-eindeutig.sql).
  const siehtAlle = can("chats.view_all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [teamOffen, setTeamOffen] = useState(false);
  // Kam man über eine Benachrichtigung zu einer Anfrage, gleich die Anfragen
  // zeigen. Schon beim ersten Zeichnen prüfen: Die Anfrage-Komponenten
  // nehmen die Marke (#anfrage-…) beim Einhängen sofort aus der Adresse.
  const [ansicht, setAnsicht] = useState<Ansicht>(() => (istAnfrageSprung() ? "anfragen" : null));
  const [anfragenZahl, setAnfragenZahl] = useState(0);
  const angelegt = useRef(false);
  const eltern = useElternZahlen(isStaff);

  const chats = topics.filter((t) => t.kind === "chat");
  const teamChat = chats.find((t) => !t.tag) ?? null;

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

  // Aus einer Benachrichtigung (#chat-<id>): genau diesen Chat öffnen
  useEffect(() => {
    if (!ready) return;
    const oeffne = () => {
      const m = window.location.hash.match(/^#chat-([0-9a-f-]{36})$/i);
      if (!m) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      const t = topics.find((x) => x.id === m[1]);
      if (!t) return;
      // Schüler sehen ihre Gespräche mit dem Team als einen durchgehenden Chat
      if (t.kind === "ticket" && !isStaff) return setTeamOffen(true);
      setOpenId(t.id);
    };
    oeffne();
    window.addEventListener("hashchange", oeffne);
    return () => window.removeEventListener("hashchange", oeffne);
  }, [ready, topics, isStaff]);
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

  // ------------------------------------------------------------ Kacheln
  const kacheln: JSX.Element[] = [];
  const komiteeKachel = (t: Topic) => (
    <FarbKachel
      key={t.id}
      {...FARBE.komitee}
      symbol={committeeIcon(t.tag)}
      titel={committeeLabel(t.tag)}
      unter={vorschau([t.id], "Mein Komitee – noch keine Nachricht")}
      zahl={unreadCount(t.id)}
      zahlRot
      onClick={() => setOpenId(t.id)}
    />
  );

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
          symbol="👑"
          titel="Stufenteam-Chat"
          unter={vorschau([teamChat.id], "Nur fürs Team")}
          zahl={unreadCount(teamChat.id)}
          zahlRot
          onClick={() => setOpenId(teamChat.id)}
        />,
      );
    kacheln.push(
      <FarbKachel
        key="schueler"
        {...FARBE.schueler}
        symbol="🎓"
        titel="Schüler"
        unter={offeneTickets.length ? `${offeneTickets.length} ${offeneTickets.length === 1 ? "Gespräch" : "Gespräche"} offen` : "Kein Gespräch offen"}
        zahl={ticketUngelesen}
        zahlRot
        onClick={() => setAnsicht("schueler")}
      />,
      <FarbKachel
        key="eltern"
        {...FARBE.eltern}
        symbol="👪"
        titel="Eltern"
        unter={eltern.offen ? `${eltern.offen} ${eltern.offen === 1 ? "Gespräch" : "Gespräche"} offen` : "Kein Gespräch offen"}
        zahl={eltern.neu}
        zahlRot
        onClick={() => setAnsicht("eltern")}
      />,
      <FarbKachel
        key="elterninfos"
        {...FARBE.infos}
        symbol="📣"
        titel="Infos für Eltern"
        unter={eltern.infos ? `${eltern.infos} veröffentlicht` : "Noch nichts veröffentlicht"}
        onClick={() => setAnsicht("elterninfos")}
      />,
    );
    // Eigene Komitees des Teams ebenfalls als Kachel – die übrigen in der Liste
    for (const t of meineChats) kacheln.push(komiteeKachel(t));
  } else {
    for (const t of meineChats) kacheln.push(komiteeKachel(t));
    kacheln.push(
      <FarbKachel
        key="frag"
        {...FARBE.team}
        symbol="🛡️"
        titel="Frag das Stufenteam"
        unter={vorschau(tickets.map((t) => t.id), "Frag hier alles – das Team antwortet dir")}
        zahl={ticketUngelesen}
        zahlRot
        onClick={() => setTeamOffen(true)}
      />,
      <FarbKachel
        key="nachtragen"
        {...FARBE.nachtragen}
        symbol="🙌"
        titel="Mithilfe nachtragen"
        unter="Vergessen eingetragen? Hier beantragen."
        onClick={() => setNachtragen(true)}
      />,
    );
  }
  // Ungerade Anzahl: die letzte Kachel geht über beide Spalten (am Handy)
  const breitLetzte = kacheln.length % 2 === 1;

  return (
    <div className="space-y-6 pb-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <p className="-mt-2 px-4 text-[13px] leading-snug text-tinte-leise">
          Du bist noch in keinem Komitee. Das Stufenteam kann dich eintragen – dann steht dein Komitee-Chat hier oben.
        </p>
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
                  unter={vorschau([t.id], "Noch keine Nachricht")}
                  unread={zaehlt(t) ? unreadCount(t.id) : 0}
                  onOpen={() => setOpenId(t.id)}
                  glocke={{ an, setAn: (x) => void setKomitee(t.tag, x), name: committeeLabel(t.tag) }}
                />
              );
            })}
          </Gruppe>
        ) : (
          // Schüler sehen andere Komitees normalerweise gar nicht (Datenbank);
          // falls doch (Testbetrieb), zugeklappt, damit nichts überladen wirkt.
          <details className="group">
            <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise [&::-webkit-details-marker]:hidden">
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
                  onOpen={() => setOpenId(t.id)}
                />
              ))}
            </div>
          </details>
        ))}

      <NachtragSheet open={nachtragen} onClose={() => setNachtragen(false)} />

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
          onOpen={(id) => setOpenId(id)}
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
          <KomiteePage key={offen.id} topic={offen} onBack={() => setOpenId(null)} />
        ) : (
          <TicketChat key={offen.id} topic={offen} onBack={() => setOpenId(null)} />
        ))}

      {isStaff && <SchuelerAnschreiben open={anschreiben} onClose={() => setAnschreiben(false)} />}
    </div>
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
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold transition active:scale-95 ${
        an
          ? "bg-brand/[0.08] text-[#004f9e] dark:bg-brand/20 dark:text-brand-soft"
          : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
      }`}
    >
      <span aria-hidden>{an ? "🔔" : "🔕"}</span>
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
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
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
      <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
        <span aria-hidden className="text-[15px]">{an ? "🔔" : "🔕"}</span>
        <span className="min-w-0 flex-1 text-[15px]">{name}</span>
        <Schalter an={an} onChange={setAn} label={`Mitteilungen für ${name}`} />
      </div>
    </Gruppe>
  );
}

/** Leerer Zustand einer Unterseite: Symbol, ein Satz, was als Nächstes passiert. */
function Leer({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span aria-hidden className="text-[40px] leading-none">{icon}</span>
      <p className="mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">{text}</p>
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
  const [zahlen, setZahlen] = useState({ nachtrag: 0, komitee: 0, entsperren: 0, foto: 0 });
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const meldungen = useMeldungenZahl(box);
  // Je Art ein fester Rückruf – sonst liefen die Effekte der Kinder bei jedem Zeichnen neu
  const setzer = useMemo(() => {
    const f = (k: keyof typeof zahlen) => (n: number) => setZahlen((z) => (z[k] === n ? z : { ...z, [k]: n }));
    return { nachtrag: f("nachtrag"), komitee: f("komitee"), entsperren: f("entsperren"), foto: f("foto") };
  }, []);
  const summe = zahlen.nachtrag + zahlen.komitee + zahlen.entsperren + zahlen.foto + meldungen;
  useEffect(() => onZahl(summe), [summe, onZahl]);

  const Abschnitt = ({ titel, n, children }: { titel: string; n: number; children: React.ReactNode }) => (
    <section className={n ? "mb-6" : "hidden"}>
      <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
        {titel} <span className="zahl">· {n}</span>
      </h3>
      <div className="grid gap-2.5 lg:grid-cols-2">{children}</div>
    </section>
  );

  return (
    <ChatEbene
      sichtbar={sichtbar}
      label="Anfragen"
      kopf={<ChatKopf onBack={onBack} symbol="📥" titel="Anfragen" unter={summe ? `${summe} offen` : "Alles erledigt"} />}
    >
      <div ref={setBox} className="py-4">
        {summe === 0 && <Leer icon="✅" text="Gerade keine offenen Anfragen. Neue erscheinen hier – mit roter Zahl auf der Kachel." />}
        {/* Die Abschnitte bleiben immer eingehängt (nur unsichtbar), damit sie
            weiter zählen und live nachladen. */}
        <Abschnitt titel="Meldungen" n={meldungen}>
          <MeldungenAnfragen />
        </Abschnitt>
        <Abschnitt titel="Mithilfe nachtragen" n={zahlen.nachtrag}>
          <NachtragAnfragen onAnzahl={setzer.nachtrag} />
        </Abschnitt>
        <Abschnitt titel="Komitee-Wünsche" n={zahlen.komitee}>
          <KomiteeRequests onAnzahl={setzer.komitee} />
        </Abschnitt>
        <Abschnitt titel="Entsperren" n={zahlen.entsperren}>
          <UnbanRequests onAnzahl={setzer.entsperren} />
        </Abschnitt>
        <Abschnitt titel="Steckbrief-Fotos" n={zahlen.foto}>
          <FotoFreigaben onAnzahl={setzer.foto} />
        </Abschnitt>
        <MitteilungsGruppe {...glocke} name="Neue Anfragen" fuss="Kommt als Mitteilung aufs Handy, sobald jemand etwas beantragt." />
      </div>
    </ChatEbene>
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
      kopf={<ChatKopf onBack={onBack} symbol="🛡️" titel="Stufenteam" unter="Frag hier alles – das Team antwortet dir" />}
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

/** Teamansicht: ein Ticket als Chat, mit Erledigt- und Löschen-Knopf. */
function TicketChat({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, deleteItem, deleteTopic, updateTopic, markRead, committeesOf, uid } = useTopics();
  const { role, can, isStaff, banned } = useRole();
  const { profile } = useProfiles();
  const [text, setText] = useState("");

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

  return (
    <ChatEbene
      label={name || "Frage"}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Avatar userId={person} name={name} size={32} />}
          titel={name || "Frage"}
          unter={erledigt ? `Erledigt · ${topic.title}` : topic.title}
          rechts={
            isStaff && (
              <>
                <button
                  className={`flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition active:scale-95 ${
                    erledigt
                      ? "bg-[rgb(118_118_128/0.12)] text-brand-dark dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
                      : "bg-[#248A3D] text-white dark:bg-[#30D158] dark:text-black"
                  }`}
                  onClick={() => updateTopic(topic.id, { status: erledigt ? "offen" : "erledigt" })}
                  title={erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                >
                  {!erledigt && <Icon name="haken" size={15} strich={2.6} />}
                  {erledigt ? "Öffnen" : "Erledigt"}
                </button>
                {can("chats.manage") && (
                  <button
                    className="iconbtn"
                    title="Gespräch löschen"
                    aria-label="Gespräch löschen"
                    onClick={async () => {
                      if (await frage("Diese Frage samt Verlauf löschen?", "Löschen", true)) {
                        void deleteTopic(topic.id);
                        onBack();
                      }
                    }}
                  >
                    <Icon name="muell" size={17} />
                  </button>
                )}
              </>
            )
          }
        />
      }
      fuss={banned ? undefined : <ChatEingabe wert={text} setWert={setText} onSenden={senden} platzhalter="Antworten" />}
    >
      <ChatBlasen liste={liste} uid={uid} darfLoeschen={can("chats.delete_messages")} onDelete={deleteItem} />
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
          <button disabled={busy || !betreff.trim() || !text.trim()} onClick={senden} className="btn-primary mt-5">
            {busy ? "Wird gesendet …" : "Senden"}
          </button>
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
  const { unreadCount, deleteTopic } = useTopics();
  const loeschen = (t: Topic) => async () => {
    if (await frage(`Das Gespräch „${t.title}" endgültig löschen?\n\nAlle Nachrichten darin verschwinden.`, "Löschen", true))
      void deleteTopic(t.id);
  };
  return (
    <ChatEbene
      label="Gespräche mit Schülern"
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol="🎓"
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
          <Leer icon="💬" text="Gerade keine offenen Fragen. Mit „+“ oben rechts schreibst du jemanden an." />
        ) : (
          <Gruppe titel="Offen" className="">
            {offene.map((t) => (
              <TicketZeile key={t.id} topic={t} unread={unreadCount(t.id)} onOpen={() => onOpen(t.id)} onDelete={loeschen(t)} />
            ))}
          </Gruppe>
        )}

        {erledigt.length > 0 && (
          <details className="group mt-6">
            <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise [&::-webkit-details-marker]:hidden">
              Erledigt ({erledigt.length})
              <span className="transition group-open:rotate-90" aria-hidden>
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <div className="gruppe-zellen mt-1">
              {erledigt.map((t) => (
                <TicketZeile key={t.id} topic={t} unread={0} onOpen={() => onOpen(t.id)} onDelete={loeschen(t)} />
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
  topic, unread, onOpen, onDelete,
}: { topic: Topic; unread: number; onOpen: () => void; onDelete?: () => void }) {
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
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {topic.status === "erledigt" && (
          <span className="text-[#248A3D] dark:text-[#30D158]">
            <Icon name="haken" size={16} strich={2.6} />
          </span>
        )}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tinte-leise transition hover:text-red-500 active:scale-90"
          aria-label="Gespräch löschen"
          title="Gespräch löschen"
        >
          <Icon name="muell" size={17} />
        </button>
      )}
    </div>
  );
}
