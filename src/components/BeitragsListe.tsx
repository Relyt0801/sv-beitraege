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
      <div className="mt-3 rounded-2xl bg-papier p-5 text-center text-[14px] text-tinte-leise dark:bg-slate-800/60">
        {leerText}
      </div>
    );

  return (
    <>
      <ul className="liste mt-3 bg-papier dark:bg-slate-800/60">
        {eintraege.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-tinte dark:text-slate-100">{c.titel}</div>
              <div className="text-[13px] text-tinte-leise">{datumLang(c.datum)}</div>
            </div>
            <div className="zahl shrink-0 text-[15px] font-semibold text-brand-dark dark:text-brand">+{c.punkte} %</div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between px-4">
        <span className="text-[14px] text-tinte-leise">Zusammen</span>
        <span className="zahl text-[16px] font-bold text-brand-dark dark:text-brand">{summe} %</span>
      </div>
    </>
  );
}
