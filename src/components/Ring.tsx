/**
 * Runder Fortschritt: die Prozentzahl groß in der Mitte.
 *
 * stufen: an diesen Prozentwerten sinkt der Aufschlag – dort schneidet ein
 * Strich quer durch den Ring (dunkel mit hellem Rand, damit er auf dem
 * gefüllten und dem leeren Teil gleich gut zu sehen ist). Der Strich der
 * aktuellen Stufe (aktuellAb) ist in der Markenfarbe wie die aktuelle
 * Kachel darunter und steht etwas über den Ring hinaus.
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
  const rand = mitStrichen ? 4 : 0; // Platz für den überstehenden aktuellen Strich
  const groesse = (klein ? 68 : 88) + rand * 2;
  const mitte = groesse / 2;
  const umfang = 2 * Math.PI * r;
  const voll = pct >= 100;

  // 0 % und 100 % liegen am selben Punkt oben – nur einmal zeichnen
  const winkel = [...new Set((stufen || []).map((ab) => ((ab % 100) + 100) % 100))];
  const aktuellWinkel = aktuellAb == null ? null : ((aktuellAb % 100) + 100) % 100;
  const innen = r - dicke / 2;
  const aussen = r + dicke / 2;

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
          const ueber = aktuell ? 3 : 0.5;
          const pos = {
            x1: mitte + (innen - ueber) * cos,
            y1: mitte + (innen - ueber) * sin,
            x2: mitte + (aussen + ueber) * cos,
            y2: mitte + (aussen + ueber) * sin,
          };
          return (
            <g key={w}>
              {/* heller Rand in Kartenfarbe – trennt den Strich vom Ring */}
              <line {...pos} strokeLinecap="round" strokeWidth={aktuell ? 6 : 4.5} className="stroke-white dark:stroke-slate-900" />
              <line
                {...pos}
                strokeLinecap="round"
                strokeWidth={aktuell ? 3 : 2}
                className={aktuell ? "stroke-brand" : "stroke-tinte/70 dark:stroke-slate-300/80"}
              />
            </g>
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
