import { useId } from "react";

/**
 * Runder Fortschritt: die Prozentzahl groß in der Mitte.
 *
 * stufen: an diesen Prozentwerten sinkt der Aufschlag – dort schneidet ein
 * Strich quer durch den Ring (dunkel mit hellem Rand, damit er auf dem
 * gefüllten und dem leeren Teil gleich gut zu sehen ist). Der Strich der
 * aktuellen Stufe (aktuellAb) ist in der Markenfarbe wie die aktuelle
 * Kachel darunter und etwas breiter. Kein Strich steht über den Ring hinaus.
 *
 * bonus (0 … 1): Ist „Über 100 %“ an und jemand liegt darüber, läuft über den
 * vollen grünen Ring eine zweite, goldene Runde – voll, wenn die Bonus-Grenze
 * erreicht ist. Die Zahl wird dann ebenfalls golden.
 */
export function Ring({
  pct, klein, stufen, aktuellAb, bonus,
}: {
  pct: number;
  klein?: boolean;
  stufen?: number[];
  aktuellAb?: number | null;
  bonus?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const r = klein ? 26 : 34;
  const dicke = klein ? 7 : 9;
  const rand = 0; // die Striche bleiben im Ring – kein Platz außen nötig
  const groesse = (klein ? 68 : 88) + rand * 2;
  const mitte = groesse / 2;
  const umfang = 2 * Math.PI * r;
  const voll = pct >= 100;
  const gold = pct > 100 && bonus != null && bonus > 0;
  const goldAnteil = gold ? Math.max(0.03, Math.min(1, bonus!)) : 0;

  // 0 % und 100 % liegen am selben Punkt oben – nur einmal zeichnen
  const winkel = [...new Set((stufen || []).map((ab) => ((ab % 100) + 100) % 100))];
  const aktuellWinkel = aktuellAb == null ? null : ((aktuellAb % 100) + 100) % 100;
  const innen = r - dicke / 2;
  const aussen = r + dicke / 2;

  return (
    <div className="relative shrink-0" style={{ width: groesse, height: groesse }}>
      <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} className="-rotate-90 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`gold-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F6DD8B" />
            <stop offset="55%" stopColor="#D9A92B" />
            <stop offset="100%" stopColor="#A87A0C" />
          </linearGradient>
        </defs>
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
        {gold && (
          <circle
            cx={mitte}
            cy={mitte}
            r={r}
            fill="none"
            strokeWidth={dicke}
            strokeLinecap="round"
            stroke={`url(#gold-${gid})`}
            strokeDasharray={umfang}
            strokeDashoffset={umfang * (1 - goldAnteil)}
            style={{
              transition: "stroke-dashoffset .8s cubic-bezier(.32,.72,0,1)",
              filter: "drop-shadow(0 0 3px rgba(217,169,43,.55))",
            }}
          />
        )}
        {!gold && winkel.map((w) => {
          const rad = (w / 100) * 2 * Math.PI;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const aktuell = w === aktuellWinkel;
          // genau so lang wie der Ring dick ist – nichts steht über
          const pos = {
            x1: mitte + innen * cos,
            y1: mitte + innen * sin,
            x2: mitte + aussen * cos,
            y2: mitte + aussen * sin,
          };
          return (
            <g key={w}>
              {/* heller Rand in Kartenfarbe – trennt den Strich vom Ring */}
              <line {...pos} strokeLinecap="butt" strokeWidth={aktuell ? 6 : 4.5} className="stroke-white dark:stroke-slate-900" />
              <line
                {...pos}
                strokeLinecap="butt"
                strokeWidth={aktuell ? 3 : 2}
                className={aktuell ? "stroke-brand" : "stroke-tinte/70 dark:stroke-slate-300/80"}
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {gold ? (
          <>
            <span
              className={`zahl bg-gradient-to-b from-[#C9961E] to-[#8A650A] bg-clip-text font-extrabold text-transparent dark:from-[#F6DD8B] dark:to-[#D9A92B] ${
                klein ? "text-[14px]" : "text-[17px]"
              }`}
            >
              {pct}&nbsp;%
            </span>
            <span className="mt-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-[#9A7410] dark:text-[#E9C460]">
              ✦ Bonus
            </span>
          </>
        ) : (
          <span className={`zahl font-extrabold ${klein ? "text-xl" : "text-2xl"} ${voll ? "text-bezahlt" : "text-brand"}`}>
            {pct}&nbsp;%
          </span>
        )}
      </div>
    </div>
  );
}
