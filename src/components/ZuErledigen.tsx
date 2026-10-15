import { useState, type ReactNode } from "react";
import { useEvents } from "../events-store";
import { useRole } from "../auth/RoleProvider";
import { springe, useFuerMichOffen, useTeamAufgaben, type TeamArt } from "../lib/offen";
import { tagLang, zeitText } from "../lib/termine";
import { useTermine } from "../termine-store";
import { melde } from "../lib/melder";
import { abschlussOeffnen } from "./SchichtAbschluss";
import { Gruppe, Symbol, Wert, Zeile, ZeileHaken } from "./Liste";
import { Sheet, SheetKopf } from "./Sheet";
import { FussLeiste } from "./FussLeiste";
import { Icon, type IconName } from "./Icon";

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
 * Abstimmen und Wichtiges lesen geht direkt im Blatt, ohne Reiterwechsel.
 * Alles andere springt in den passenden Reiter (lib/offen.ts → springe).
 */

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
  const { aktionen } = useTermine();
  const ich = useFuerMichOffen();
  const team = useTeamAufgaben();
  // Blätter: Abstimmung bzw. Info direkt hier
  const [abstimmungId, setAbstimmungId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);

  if (isEltern) return null;

  const zeilen: ReactNode[] = [];

  // 1. Wichtiges, das man noch nicht gesehen hat
  for (const e of ich.wichtig.slice(0, EINZELN))
    zeilen.push(<Zeile key={`w-${e.id}`} symbol={sym("info", "bg-[#FF3B30]")} label={e.title} unter="Wichtig · neu" onClick={() => setInfoId(e.id)} />);
  if (ich.wichtig.length > EINZELN)
    zeilen.push(
      <Zeile key="w-mehr" symbol={sym("info", "bg-[#FF3B30]")} label="Weitere wichtige Infos" onClick={() => springe("events")}>
        <Wert>{ich.wichtig.length - EINZELN}</Wert>
      </Zeile>,
    );

  // 2. Abstimmungen ohne eigene Stimme
  for (const e of ich.abstimmungen.slice(0, EINZELN))
    zeilen.push(
      <Zeile key={`a-${e.id}`} symbol={sym("umfrage", "bg-[#0A84FF]")} label={e.title} unter="Abstimmung · stimm ab" onClick={() => setAbstimmungId(e.id)} />,
    );
  if (ich.abstimmungen.length > EINZELN)
    zeilen.push(
      <Zeile key="a-mehr" symbol={sym("umfrage", "bg-[#0A84FF]")} label="Weitere Abstimmungen" onClick={() => springe("events")}>
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
        onClick={() => springe("events")}
      />,
    );
  }

  return (
    <>
      {zeilen.length > 0 && (
        <Gruppe titel={isStaff ? "Zu erledigen" : "Für dich offen"} className={className}>
          {zeilen}
        </Gruppe>
      )}
      <AbstimmungBlatt id={abstimmungId} onClose={() => setAbstimmungId(null)} />
      <InfoBlatt id={infoId} onClose={() => setInfoId(null)} />
    </>
  );
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
                springe("events");
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
          <SheetKopf titel={e.title} unter="Wichtig" onClose={zu} />
          {e.body ? (
            <p className="whitespace-pre-wrap px-1 text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{e.body}</p>
          ) : null}
          <Gruppe>
            <Zeile
              label="In Events ansehen"
              onClick={() => {
                zu();
                springe("events");
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
