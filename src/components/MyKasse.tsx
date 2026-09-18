import { HY, type Settings, type Student } from "../lib/types";
import { useStore } from "../store";
import { basisOffen, beitragFuer, naechsteStufe, prozentVon, staffelVon, ticketBetrag } from "../lib/logic";
import { TermChip } from "./TermChip";
import { Ring } from "./Ring";
import { BeitragsListe } from "./BeitragsListe";
import { TicketErklaerung } from "./TicketErklaerung";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind.
 *
 * Ganz oben steht die eine Zahl, die zählt: was noch zu zahlen ist. Alles
 * andere ordnet sich darunter ein. Vorher standen offener Betrag, Prozente und
 * Ticketpreis gleichwertig nebeneinander – man musste erst suchen, worum es
 * geht.
 */
export function MyKasse({
  student,
  settings,
  punkte,
  ready,
}: {
  student: Student | null;
  settings: Settings;
  punkte: number;
  ready: boolean;
}) {
  const { contributions } = useStore();

  if (!ready)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Deine Beiträge werden geladen …</div>
      </div>
    );

  if (!student)
    return (
      <div className="card mx-auto max-w-2xl p-6 text-center text-sm text-tinte-matt">
        Zu deinem Konto ist noch keine Person zugeordnet.
        <br />
        Sag dem Stufenteam Bescheid, dann schalten sie dich frei.
      </div>
    );

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const next = naechsteStufe(pct, settings);
  const gesamt = HY.reduce((n, h) => n + beitragFuer(h, settings), 0);
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return (
    <div className="mx-auto grid max-w-3xl gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-tour="meine-karte">
      {/* ------------------------------------------ die eine Zahl */}
      <section className="leitkarte lg:col-span-2">
        <div className="kennlabel text-white/60">
          {offen > 0 ? "Du musst noch zahlen" : "Deine Stufenkasse"}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`leitwert ${offen > 0 ? "text-white" : "text-emerald-400"}`}>{offen} €</span>
          <span className="text-[13px] text-white/60">
            {offen > 0 ? `für ${settings.aktuelles_halbjahr} und was davor offen ist` : "Alles bezahlt. Danke!"}
          </span>
        </div>
        <div className="mt-2 text-[12px] text-white/50">
          {student.vorname} {student.nachname} · {gesamt} € über alle sechs Halbjahre
        </div>
      </section>

      {/* ------------------------------------------ Halbjahre mit Preis */}
      <section className="card p-4 sm:p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-tinte-matt">Deine Halbjahre</h2>
          <span className="text-[12px] text-tinte-leise">EF je 25 €, ab Q1 je 50 €</span>
        </div>

        <div className="mt-3 flex gap-1.5" data-tour="meine-halbjahre">
          {HY.map((h, i) => (
            <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {HY.map((h) => (
            <div key={h} className="zahl flex-1 basis-0 text-center text-[11px] font-semibold text-tinte-leise">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-tinte-leise">
          <Legende farbe="bg-bezahlt" text="bezahlt" />
          <Legende farbe="bg-amber-400" text="noch offen" />
          <Legende farbe="bg-erlassen" text="erlassen" />
          <Legende farbe="bg-papier-linie" text="noch nicht dabei" />
        </div>
      </section>

      {/* ------------------------------------------ Prozentstand */}
      <section className="card p-4 sm:p-5" data-tour="meine-punkte">
        <h2 className="text-[13px] font-semibold text-tinte-matt">Wobei du geholfen hast</h2>

        <div className="mt-3 flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-snug">
              {pct >= 100
                ? "Geschafft. Auf dein erstes Abiballticket kommt nichts mehr drauf."
                : "Je mehr Prozent du sammelst, desto günstiger wird dein erstes Abiballticket."}
            </div>
            {next && (
              <div className="mt-1.5 text-[12px] leading-relaxed text-tinte-matt">
                Noch <b className="text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                <b className="text-brand">{next.spart} €</b>.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1">
          {staffelVon(settings).map((stufe) => {
            const erreicht = pct >= stufe.ab;
            const aktuell = staffelVon(settings).filter((x) => pct >= x.ab).pop()?.ab === stufe.ab;
            return (
              <div
                key={stufe.ab}
                className={`rounded-lg px-1 py-1.5 text-center ${
                  aktuell
                    ? "bg-brand text-white"
                    : erreicht
                      ? "bg-brand/10 text-brand"
                      : "bg-papier-matt text-tinte-leise dark:bg-slate-800"
                }`}
              >
                <div className="zahl text-[12px] font-extrabold leading-none">{stufe.ab}%</div>
                <div className="zahl mt-0.5 text-[10px] font-semibold leading-none opacity-90">+{stufe.betrag} €</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------ Abiballticket */}
      <TicketErklaerung settings={settings} zusatz={ticketBetrag(pct, settings)} prozent={pct} />

      {/* ------------------------------------------ meine Beiträge */}
      <section className="card p-4 sm:p-5 lg:col-span-2">
        <h2 className="text-[13px] font-semibold text-tinte-matt">Das hast du bisher gemacht</h2>
        <BeitragsListe
          eintraege={meine}
          leerText="Hier steht noch nichts. Sobald du mithilfst, trägt das Stufenteam es ein."
        />
      </section>
    </div>
  );
}

function Legende({ farbe, text }: { farbe: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${farbe}`} />
      {text}
    </span>
  );
}
