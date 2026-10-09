/**
 * Stand einer Freigabe mit mehreren Zustimmungen: Punkte (●●○) und „2 von 3“,
 * dazu ein Haken, wenn man selbst schon zugestimmt hat. Bricht nie um.
 * Erscheint nur, wenn mehr als eine Zustimmung nötig ist.
 */
export function ZustimmungsMarke({ zahl, noetig, ichSchon, className = "" }: { zahl: number; noetig: number; ichSchon: boolean; className?: string }) {
  if (noetig <= 1) return null;
  const n = Math.min(zahl, noetig);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-semibold leading-none text-brand-dark dark:text-brand ${className}`}
      aria-label={`${n} von ${noetig} Zustimmungen${ichSchon ? ", deine ist dabei" : ""}`}
    >
      <span aria-hidden className="flex gap-[3px]">
        {Array.from({ length: Math.min(noetig, 10) }, (_, i) => (
          <span key={i} className={`h-[7px] w-[7px] rounded-full ${i < n ? "bg-brand" : "bg-brand/25"}`} />
        ))}
      </span>
      {n} von {noetig}
      {ichSchon && <span aria-hidden>· du ✓</span>}
    </span>
  );
}
