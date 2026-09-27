/**
 * Runder Fortschritt: die Prozentzahl groß in der Mitte.
 *
 * stufen: an diesen Prozentwerten sinkt der Aufschlag – dort sitzt außen ein
 * kleiner Strich. Der Strich der aktuellen Stufe (aktuellAb) ist in der
 * Markenfarbe, wie die aktuelle Kachel darunter.
 */
export function Ring({
  pct, klein, stufen, aktuellAb,
}: {
  pct: number;
  klein?: boolean;
  stufen?: number[];
  aktuellAb?: number | null;
}) {
  const mitStrichen = Boolean(stufen?.length);
  const r = klein ? 26 : 34;
  const dicke = klein ? 7 : 9;
  const rand = mitStrichen ? 9 : 0; // Platz für die Striche außen
  const groesse = (klein ? 68 : 88) + rand * 2;
  const mitte = groesse / 2;
  const umfang = 2 * Math.PI * r;
  const voll = pct >= 100;

  // 0 % und 100 % liegen am selben Punkt oben – nur einmal zeichnen
  const winkel = [...new Set((stufen || []).map((ab) => ((ab % 100) + 100) % 100))];
  const aktuellWinkel = aktuellAb == null ? null : ((aktuellAb % 100) + 100) % 100;
  const innen = r + dicke / 2 + 1.5;
  const aussen = innen + 6;

  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} className="-rotate-90" aria-hidden="true">
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
        {winkel.map((w) => {
          const rad = (w / 100) * 2 * Math.PI;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const aktuell = w === aktuellWinkel;
          return (
            <line
              key={w}
              x1={mitte + innen * cos}
              y1={mitte + innen * sin}
              x2={mitte + aussen * cos}
              y2={mitte + aussen * sin}
              strokeLinecap="round"
              strokeWidth={aktuell ? 3 : 2}
              className={aktuell ? "stroke-brand" : "stroke-[rgb(118_118_128/0.45)]"}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`zahl font-extrabold ${klein ? "text-xl" : "text-2xl"} ${voll ? "text-bezahlt" : "text-brand"}`}>
          {pct}&nbsp;%
        </span>
      </div>
    </div>
  );
}
