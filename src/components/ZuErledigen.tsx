import { useState, type ReactNode } from "react";
import { useEvents } from "../events-store";
import { useTopics } from "../topics-store";
import { committeeLabel } from "../lib/committees";
import { useRole } from "../auth/RoleProvider";
import { springe, useFuerMichOffen, useTeamAufgaben, type TeamArt } from "../lib/offen";
import { tagLang, zeitText } from "../lib/termine";
import { useTermine } from "../termine-store";
import { melde } from "../lib/melder";
import { abschlussOeffnen } from "./SchichtAbschluss";
import { Gruppe, Symbol, Wert, Zeile, ZeileHaken } from "./Liste";
import { Sheet, SheetKopf } from "./Sheet";
import { FussLeiste } from "./FussLeiste";
import { FaulGrenze, faul } from "./FaulLaden";
import type { EventItem } from "../lib/events";
import type { Termin } from "../lib/termine";
import { Icon, type IconName } from "./Icon";
import { useBreit } from "../lib/gescrollt";

/**
 * „Für dich offen“ (Schüler) bzw. „Zu erledigen“ (Team) – ganz oben in der
 * Übersicht, als EINE Gruppe aus Zeilen wie in den iOS-Einstellungen.
 *
 * Prüfung Okt. 2026: Die Übersicht zeigte nur, was man bezahlt hat. Eine
 * offene Abstimmung stand in Events erst nach 1200 px, die eigene Schicht und
 * „Wichtig“-Infos kamen gar nicht vor; beim Team waren die Prüfaufgaben über
 * vier Reiter verstreut. Jetzt steht hier alles, was auf einen wartet – und
 * nur dann: Ist nichts offen, gibt es die Gruppe nicht.
 *
 * Abstimmen, Wichtiges lesen und die eigene Schicht ansehen geht direkt im
 * Blatt, ohne Reiterwechsel. „In Events ansehen“ springt genau zu diesem
 * Eintrag (#events/<id>), alles andere in den passenden Reiter
 * (lib/offen.ts → springe).
 */

/** Termin-Blatt erst laden, wenn man die Schicht antippt (eigene Datei, wie EventsTab) */
const TerminAnsehen = faul(() => import("./TerminSheet").then((m) => ({ default: m.TerminAnsehen })));

/** So viele Abstimmungen / Infos einzeln, der Rest als „Weitere …“ */
const EINZELN = 2;

const TEAM: { art: TeamArt; titel: string; unter: string; icon: IconName; farbe: string }[] = [
  { art: "schichten", titel: "Schichten bestätigen", unter: "Mithilfe für die Eingeteilten", icon: "haken", farbe: "bg-[#FF9500]" },
  { art: "kosten", titel: "Kostenanfragen", unter: "genehmigen oder ablehnen", icon: "finanzen", farbe: "bg-[#34C759]" },
  { art: "termin", titel: "Terminanfragen", unter: "in den Kalender übernehmen", icon: "kalender", farbe: "bg-[#0A84FF]" },
  { art: "nachtrag", titel: "Mithilfe nachtragen", unter: "Anträge prüfen", icon: "herz", farbe: "bg-[#FF2D55]" },
  { art: "zitate", titel: "Zitate prüfen", unter: "freigeben oder ablehnen", icon: "zitat", farbe: "bg-[#FF9F0A]" },
  { art: "komitee", titel: "Komitee-Wünsche", unter: "aufnehmen oder ablehnen", icon: "rollen", farbe: "bg-[#5856D6]" },
  { art: "foto", titel: "Steckbrief-Fotos", unter: "freigeben", icon: "bild", farbe: "bg-[#AF52DE]" },
  { art: "meldung", titel: "Meldungen", unter: "ansehen und entscheiden", icon: "schild", farbe: "bg-[#FF3B30]" },
  { art: "entsperren", titel: "Entsperren", unter: "Anfragen gesperrter Personen", icon: "schluessel", farbe: "bg-[#8E8E93]" },
];

function ziel(art: TeamArt) {
  if (art === "schichten") abschlussOeffnen();
  else if (art === "zitate") springe("zitate");
  else springe(art);
}

const sym = (icon: IconName, farbe: string): ReactNode => (
  <Symbol farbe={farbe}>
    <Icon name={icon} size={17} strich={2.2} />
  </Symbol>
);

export function ZuErledigen({ className = "" }: { className?: string }) {
  const { isStaff, isEltern } = useRole();
  const { aktionen, meineVorsitze } = useTermine();
  const ich = useFuerMichOffen();
  const team = useTeamAufgaben();
  // Blätter: Abstimmung bzw. Info direkt hier
  const [abstimmungId, setAbstimmungId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  // Die eigene nächste Schicht im Blatt (fürs Team dasselbe wie unter „Mitmachen“)
  const [schichtOffen, setSchichtOffen] = useState<Termin | null>(null);
  const { topics, items, myVotes, committeesOf, uid } = useTopics();
  const breit = useBreit();

  if (isEltern) return null;

  // Was in den eigenen Komitees offen ist (Abstimmung ohne eigene Stimme,
  // offene To-dos) – vorher sah man das nur, wenn man in Chats nachschaute.
  // Eigene Gruppe: Komitee-Aufgaben gehören allen Mitgliedern, die Zahl am
  // Reiter zählt nur, was oben unter „Zu erledigen“ steht.
  const meineKoms = uid ? committeesOf(uid) : [];
  const jetzt = Date.now();
  const komitee: ReactNode[] = topics
    .filter((t) => t.kind === "chat" && t.tag && meineKoms.includes(t.tag))
    .flatMap((t) => {
      const eig = items.filter((i) => i.topic_id === t.id);
      const abst = eig.filter(
        // Freitext-Abstimmungen (antwort_art) speichern die Antwort in
        // topic_antworten, nicht in topic_votes – myVotes bliebe für immer leer
        // und die Abstimmung stünde hier dauerhaft als offen. Wie ChatsTab und
        // KomiteePage: nur Auswahl-Abstimmungen zählen.
        (i) => i.type === "umfrage" && !i.antwort_art && !(i.poll_deadline && Date.parse(i.poll_deadline) < jetzt) && !(myVotes[i.id] || []).length,
      );
      const todos = eig.filter((i) => i.type === "todo" && !i.done);
      const erstes = abst[0] ?? todos[0];
      if (!erstes) return [];
      const teile = [
        abst.length ? `${abst.length} ${abst.length === 1 ? "Abstimmung" : "Abstimmungen"}` : "",
        todos.length ? `${todos.length} ${todos.length === 1 ? "To-do" : "To-dos"}` : "",
      ].filter(Boolean);
      return [
        <Zeile
          key={`k-${t.id}`}
          symbol={sym("chats", "bg-[#5856D6]")}
          label={committeeLabel(t.tag!)}
          // Vorsitz: gleich sichtbar, dass man das Komitee leitet
          unter={`${meineVorsitze.includes(t.tag!) ? "Vorsitz · " : ""}${teile.join(" · ")} offen`}
          // Öffnet das Komitee auf der Pinnwand beim ersten offenen Eintrag
          onClick={() => {
            window.location.hash = `chats/${t.id}/${erstes.id}`;
          }}
        />,
      ];
    });

  const zeilen: ReactNode[] = [];

  // 1. Wichtiges, das man noch nicht gesehen hat. Die Zeile sagt, an wen es
  //    geht – eine Info an alle („Beitrag bis Freitag überweisen“) wirkte unter
  //    „Für dich offen“ wie eine persönliche Schuld, auch wenn man längst
  //    bezahlt hatte.
  for (const e of ich.wichtig.slice(0, EINZELN))
    zeilen.push(<Zeile key={`w-${e.id}`} symbol={sym("info", "bg-[#FF3B30]")} label={e.title} unter={`${anWen(e)} · neu`} onClick={() => setInfoId(e.id)} />);
  if (ich.wichtig.length > EINZELN) {
    const rest = ich.wichtig.slice(EINZELN);
    zeilen.push(
      <Zeile
        key="w-mehr"
        symbol={sym("info", "bg-[#FF3B30]")}
        label={rest.every((e) => e.audience === "all") ? "Weitere Infos an alle" : "Weitere wichtige Infos"}
        // Schüler finden Wichtiges unter „Bitte ansehen“, das Team im Feed
        // „Infos & Abstimmungen“ (EventsTab hebt es fürs Team nicht hoch)
        onClick={() => springe("events", isStaff ? "infos" : "bitte")}
      >
        <Wert>{rest.length}</Wert>
      </Zeile>,
    );
  }

  // 2. Abstimmungen ohne eigene Stimme
  for (const e of ich.abstimmungen.slice(0, EINZELN))
    zeilen.push(
      <Zeile key={`a-${e.id}`} symbol={sym("umfrage", "bg-[#0A84FF]")} label={e.title} unter="Abstimmung · stimm ab" onClick={() => setAbstimmungId(e.id)} />,
    );
  if (ich.abstimmungen.length > EINZELN)
    zeilen.push(
      <Zeile key="a-mehr" symbol={sym("umfrage", "bg-[#0A84FF]")} label="Weitere Abstimmungen" onClick={() => springe("events", "bitte")}>
        <Wert>{ich.abstimmungen.length - EINZELN}</Wert>
      </Zeile>,
    );

  // 3. Prüfaufgaben des Teams (nur mit Recht, nur wenn etwas wartet)
  for (const t of TEAM) {
    const n = team[t.art];
    if (!n) continue;
    zeilen.push(
      <Zeile key={`t-${t.art}`} symbol={sym(t.icon, t.farbe)} label={t.titel} unter={t.unter} onClick={() => ziel(t.art)}>
        <Wert stark>{n}</Wert>
      </Zeile>,
    );
  }

  // 4. Die eigene nächste Schicht (in den nächsten zwei Wochen)
  if (ich.schicht) {
    const s = ich.schicht;
    const aktion = s.aktion_id ? aktionen.find((a) => a.id === s.aktion_id) : null;
    zeilen.push(
      <Zeile
        key="schicht"
        symbol={sym("kalender", "bg-[#34C759]")}
        label="Deine nächste Schicht"
        unter={[tagLang(s.datum), zeitText(s), aktion?.titel || s.titel].filter(Boolean).join(" · ")}
        // Direkt im Blatt statt oben in Events (dort lag „Deine Schichten“ am
        // iPhone SE unter „+ Neu“ und der Reiterleiste)
        onClick={() => setSchichtOffen(s)}
      />,
    );
  }

  // Ab Laptop/iPad quer EINE Karte mit zwei Spalten, die Komitee-Zeilen
  // hinten dran (Sprechblase + Komitee-Name zeigen, woher sie kommen).
  // Vorher zwei Gruppen nebeneinander: bei 3–4 Aufgaben und 1 Komitee blieben
  // rechts 2–3 Zeilen leer (platz-check Okt. 2026); untereinander kostete die
  // zweite Überschrift Höhe. So ist es immer die niedrigste Höhe ohne Loch.
  // Am Handy weiter zwei Gruppen untereinander.
  const titel = isStaff ? "Zu erledigen" : "Für dich offen";
  return (
    <>
      {(zeilen.length > 0 || komitee.length > 0) &&
        (breit ? (
          <div className={className}>
            <Gruppe titel={zeilen.length ? titel : "Aus deinen Komitees"} className="" spalten>
              {zeilen}
              {komitee}
            </Gruppe>
          </div>
        ) : (
          <div className={className}>
            {zeilen.length > 0 && (
              <Gruppe titel={titel} className="">
                {zeilen}
              </Gruppe>
            )}
            {komitee.length > 0 && (
              <Gruppe titel="Aus deinen Komitees" className={zeilen.length ? "mt-4" : ""}>
                {komitee}
              </Gruppe>
            )}
          </div>
        ))}
      <AbstimmungBlatt id={abstimmungId} onClose={() => setAbstimmungId(null)} />
      <InfoBlatt id={infoId} onClose={() => setInfoId(null)} />
      {schichtOffen && (
        <FaulGrenze still>
          <TerminAnsehen termin={schichtOffen} onSchliessen={() => setSchichtOffen(null)} />
        </FaulGrenze>
      )}
    </>
  );
}

/** An wen eine wichtige Info geht – kurz für die zweite Zeile. */
function anWen(e: EventItem): string {
  if (e.audience === "selected" && e.target_ids.length) return "Wichtig · an dich";
  if (e.audience === "komitee") return "Wichtig · an dein Komitee";
  return "Info an alle";
}

/** Abstimmen, ohne in Events suchen zu müssen. Ändern geht dort jederzeit. */
function AbstimmungBlatt({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { events, myVotes, vote } = useEvents();
  const e = id ? events.find((x) => x.id === id) : undefined;
  const mine = (e && myVotes[e.id]) || [];
  return (
    <Sheet open={Boolean(e)} onClose={onClose}>
      {e && (
        <>
          <SheetKopf titel={e.title} unter={e.poll_multiple ? "Abstimmung · mehrere Antworten möglich" : "Abstimmung"} onClose={onClose} />
          {e.body && <p className="mb-3 whitespace-pre-wrap px-1 text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{e.body}</p>}
          <Gruppe className="">
            {e.options.map((o) => (
              <ZeileHaken
                key={o.id}
                label={o.label}
                gewaehlt={mine.includes(o.id)}
                onClick={() => {
                  const neu = !mine.includes(o.id);
                  void vote(e.id, o.id, e.poll_multiple);
                  if (!e.poll_multiple && neu) {
                    melde("Deine Stimme ist gespeichert.", "erfolg");
                    // Haken kurz zeigen, dann zu
                    setTimeout(onClose, 450);
                  }
                }}
              />
            ))}
          </Gruppe>
          <Gruppe fuss="Dort siehst du das Ergebnis und kannst deine Stimme ändern.">
            <Zeile
              label="In Events ansehen"
              onClick={() => {
                onClose();
                springe("events", e.id);
              }}
            />
          </Gruppe>
          {e.poll_multiple && (
            <FussLeiste>
              <button className="btn-primary" onClick={onClose} disabled={mine.length === 0}>
                Fertig
              </button>
            </FussLeiste>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Eine „Wichtig“-Info lesen – danach gilt sie als gesehen. */
function InfoBlatt({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { events, markRead } = useEvents();
  const e = id ? events.find((x) => x.id === id) : undefined;
  const zu = () => {
    if (e) markRead(e.id);
    onClose();
  };
  return (
    <Sheet open={Boolean(e)} onClose={zu}>
      {e && (
        <>
          <SheetKopf titel={e.title} unter={anWen(e)} onClose={zu} />
          {e.body ? (
            <p className="whitespace-pre-wrap px-1 text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{e.body}</p>
          ) : null}
          <Gruppe>
            <Zeile
              label="In Events ansehen"
              onClick={() => {
                zu();
                springe("events", e.id);
              }}
            />
          </Gruppe>
          <FussLeiste>
            <button className="btn-primary" onClick={zu}>
              Gelesen
            </button>
          </FussLeiste>
        </>
      )}
    </Sheet>
  );
}
