import type { Contribution } from "../lib/types";

/** Datum lesbar machen: 2026-09-17 wird zu "17. September 2026". */
const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function datumLang(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Was jemand bisher gemacht hat, mit Datum und Prozentwert.
 * Wird in der Schueleransicht und in der Elternansicht gleich dargestellt.
 */
export function BeitragsListe({
  eintraege,
  leerText,
}: {
  eintraege: Contribution[];
  leerText: string;
}) {
  const summe = eintraege.reduce((n, c) => n + c.punkte, 0);

  if (!eintraege.length)
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-papier-linie p-5 text-center text-[13px] text-tinte-leise dark:border-slate-700">
        {leerText}
      </div>
    );

  return (
    <>
      <ul className="mt-3 grid gap-1.5">
        {eintraege.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl bg-papier px-3 py-2.5 dark:bg-slate-800/60"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-tinte dark:text-slate-200">{c.titel}</div>
              <div className="text-[12px] text-tinte-leise">{datumLang(c.datum)}</div>
            </div>
            <div className="zahl shrink-0 rounded-lg bg-brand/10 px-2.5 py-1 text-[14px] font-extrabold text-brand">
              +{c.punkte} %
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-brand/10 px-3 py-2">
        <span className="text-[13px] font-semibold text-brand">Zusammen</span>
        <span className="zahl text-[15px] font-extrabold text-brand">{summe} %</span>
      </div>
    </>
  );
}
