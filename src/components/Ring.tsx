/** Runder Fortschritt: die Prozentzahl gross in der Mitte. */
export function Ring({ pct, klein }: { pct: number; klein?: boolean }) {
  const groesse = klein ? 68 : 88;
  const mitte = groesse / 2;
  const r = klein ? 26 : 34;
  const dicke = klein ? 7 : 9;
  const umfang = 2 * Math.PI * r;
  const voll = pct >= 100;
  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} className="-rotate-90">
        <circle cx={mitte} cy={mitte} r={r} fill="none" strokeWidth={dicke} className="stroke-[rgb(118_118_128/0.16)]" />
        <circle
          cx={mitte}
          cy={mitte}
          r={r}
          fill="none"
          strokeWidth={dicke}
          strokeLinecap="round"
          className={voll ? "stroke-bezahlt" : "stroke-brand"}
          strokeDasharray={umfang}
          strokeDashoffset={umfang * (1 - Math.min(pct, 100) / 100)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.32,.72,0,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`zahl font-extrabold ${klein ? "text-xl" : "text-2xl"} ${voll ? "text-bezahlt" : "text-brand"}`}>
          {pct}&nbsp;%
        </span>
      </div>
    </div>
  );
}
