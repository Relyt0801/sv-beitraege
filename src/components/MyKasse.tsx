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
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-500 dark:border-slate-700 dark:border-t-slate-300" />
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
    <div
      className="mx-auto grid max-w-3xl items-start gap-3 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch"
    >
      {/* ------------------------------------------ die eine Zahl */}
      <section className="leitkarte lg:col-span-2" data-tour="meine-karte">
        <div className="text-[13px] font-medium text-white/60">
          {offen > 0 ? "Du musst noch zahlen" : "Deine Stufenkasse"}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`leitwert ${offen > 0 ? "text-white" : "text-[#30D158]"}`}>{offen} €</span>
          <span className="text-[13px] text-white/60">
            {offen > 0 ? `fällig bis ${settings.aktuelles_halbjahr}` : "Alles bezahlt. Danke!"}
          </span>
        </div>
        <div className="mt-2 text-[12px] text-white/50">
          {student.vorname} {student.nachname} · {gesamt} € über alle sechs Halbjahre
        </div>
      </section>

      {/* ------------------------------------------ Halbjahre mit Preis */}
      <section className="card p-4 sm:p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Deine Halbjahre</h2>
          <span className="text-[12px] text-tinte-leise">
            EF je {beitragFuer("EF.1", settings)} €, Q1/Q2 je {beitragFuer("Q1.1", settings)} €
          </span>
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

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-tinte-leise">
          <Legende farbe="bg-bezahlt" text="bezahlt" />
          <Legende farbe="bg-offen" text="noch offen" />
          <Legende farbe="bg-erlassen" text="erlassen" />
          <Legende farbe="bg-slate-300 dark:bg-slate-600" text="später fällig / nicht dabei" />
        </div>
      </section>

      {/* ------------------------------------------ Prozentstand */}
      <section className="card p-4 sm:p-5" data-tour="meine-punkte">
        <h2 className="text-[15px] font-semibold">Mithilfe bei Aktionen</h2>

        <div className="mt-3 flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug">
              {pct >= 100
                ? "Geschafft. Auf dein erstes Abiball-Ticket kommt kein Aufschlag mehr."
                : "Mehr Prozent = weniger Aufschlag auf dein Abiball-Ticket."}
            </div>
            {next && (
              <div className="mt-1.5 text-[13px] leading-relaxed text-tinte-matt">
                Noch <b className="text-brand-dark dark:text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                <b className="text-brand-dark dark:text-brand">{next.spart} €</b>.
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
                className={`rounded-xl px-1 py-2 text-center transition ${
                  aktuell
                    ? "bg-brand text-white"
                    : erreicht
                      ? "bg-brand/[0.12] text-brand-dark dark:text-brand"
                      : "bg-[rgb(118_118_128/0.1)] text-tinte-leise"
                }`}
              >
                <div className="zahl text-[13px] font-bold leading-none">{stufe.ab} %</div>
                <div className="zahl mt-1 text-[11px] font-medium leading-none opacity-90">+{stufe.betrag} €</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------ Abiballticket */}
      {/* Am Rechner rechts über zwei Zeilen – links stehen Prozente und Liste */}
      <TicketErklaerung
        settings={settings}
        zusatz={ticketBetrag(pct, settings)}
        prozent={pct}
        className="lg:row-span-2"
      />

      {/* ------------------------------------------ meine Beiträge */}
      <section className="card p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">Wobei du geholfen hast</h2>
        <BeitragsListe
          eintraege={meine}
          leerText="Noch nichts eingetragen. Wenn du mithilfst, trägt das Stufenteam es hier ein."
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
