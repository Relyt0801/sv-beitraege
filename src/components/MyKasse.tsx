import { useState } from "react";
import { HY, type Settings, type Student } from "../lib/types";
import { useStore } from "../store";
import { basisOffen, naechsteStufe, prozentVon, staffelVon, ticketBetrag } from "../lib/logic";
import { TermChip } from "./TermChip";
import { PunkteSheet } from "./PunkteSheet";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind.
 * Drei Blöcke: was ich der Kasse schulde, wie viel Prozent ich habe,
 * was mein Abiballticket kostet – dazu meine letzten Einträge.
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
  const [showPunkte, setShowPunkte] = useState(false);

  if (!ready)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Deine Beiträge werden geladen …</div>
      </div>
    );

  if (!student)
    return (
      <div className="card mx-auto max-w-2xl p-6 text-center text-sm text-slate-500">
        Zu deinem Konto ist noch keine Person zugeordnet.
        <br />
        Sag dem Stufenteam Bescheid, dann schalten sie dich frei.
      </div>
    );

  const offen = basisOffen(student, settings.aktuelles_halbjahr);
  const pct = prozentVon(punkte, settings);
  const zusatz = ticketBetrag(pct, settings);
  const grund = settings.ticket_preis || 0;
  const next = naechsteStufe(pct, settings);
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return (
    <>
      <div className="mx-auto grid max-w-3xl gap-3 lg:grid-cols-2" data-tour="meine-karte">
        {/* ------------------------------------------------ offener Betrag */}
        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="text-sm text-slate-500">{student.vorname} {student.nachname}</div>
              <div
                className={`mt-0.5 text-4xl font-extrabold leading-none ${
                  offen > 0 ? "text-amber-500" : "text-emerald-500"
                }`}
              >
                {offen} €
              </div>
              <div className="mt-1 text-[13px] text-slate-500">
                {offen > 0 ? "noch offen. 25 € pro Halbjahr" : "alles bezahlt ✓"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-1.5" data-tour="meine-halbjahre">
            {HY.map((h, i) => (
              <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span>✓ bezahlt</span>
            <span>€ offen</span>
            <span>/ erlassen</span>
            <span>noch nicht dabei</span>
          </div>
        </section>

        {/* ------------------------------------------------ Prozentstand */}
        <section className="card p-5" data-tour="meine-punkte">
          <div className="text-sm text-slate-500">Wobei du geholfen hast</div>

          <div className="mt-2 flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">
                {pct >= 100
                  ? "Geschafft. Auf dein erstes Abiballticket kommt nichts mehr drauf."
                  : "Je mehr Prozent du sammelst, desto günstiger wird dein erstes Abiballticket."}
              </div>
              {next && (
                <div className="mt-1.5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[12px] font-semibold text-brand">
                  Noch {next.fehlt} % bis zur nächsten Stufe, das spart dir {next.spart} €
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
                        ? "bg-brand/15 text-brand"
                        : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                  }`}
                >
                  <div className="text-[12px] font-extrabold leading-none">{stufe.ab}%</div>
                  <div className="mt-0.5 text-[10px] font-semibold leading-none opacity-90">
                    +{stufe.betrag} €
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowPunkte(true)}
            className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-[13px] font-bold text-slate-500 transition active:scale-[.99] dark:border-slate-700"
          >
            Meine Einträge ansehen ({meine.length})
          </button>
        </section>

        {/* ------------------------------------------------ Abiballticket */}
        <section className="card p-5">
          <div className="text-sm text-slate-500">Abiballticket</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold leading-none text-slate-800 dark:text-slate-100">
              {grund + zusatz} €
            </span>
            <span className="text-[13px] font-semibold text-slate-500">dein 1. Ticket</span>
          </div>
          {grund > 0 ? (
            <div className="mt-1 text-[12px] text-slate-400">
              {grund} € für das Ticket {zusatz > 0 ? `und ${zusatz} € Zusatzbeitrag` : "und nichts extra"}
            </div>
          ) : (
            <div className="mt-1 text-[12px] text-slate-400">
              So viel kommt bei {pct} % dazu. Was das Ticket selbst kostet, steht noch nicht fest
            </div>
          )}

          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <b>Nur dein erstes Ticket</b> wird teurer. Tickets für Eltern oder Gäste kosten
            {grund > 0 ? ` ${grund} €` : " den normalen Preis"}, egal wie viele Prozent du hast.
          </div>

          <div className="mt-3 text-[12px] text-slate-400">
            Der Ticketpreis hat mit dem offenen Betrag oben nichts zu tun. Das sind zwei getrennte Sachen.
          </div>
        </section>
      </div>

      <PunkteSheet
        student={student}
        settings={settings}
        editable={false}
        open={showPunkte}
        onClose={() => setShowPunkte(false)}
      />
    </>
  );
}

/** Runder Fortschritt: die Prozentzahl groß in der Mitte. */
function Ring({ pct }: { pct: number }) {
  const r = 34;
  const umfang = 2 * Math.PI * r;
  const voll = pct >= 100;
  return (
    <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={voll ? "stroke-emerald-500" : "stroke-brand"}
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - Math.min(pct, 100) / 100)}
          style={{ transition: "stroke-dashoffset .5s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`text-2xl font-extrabold ${voll ? "text-emerald-500" : "text-brand"}`}>{pct}</span>
        <span className="text-[11px] font-bold text-slate-400">Prozent</span>
      </div>
    </div>
  );
}
