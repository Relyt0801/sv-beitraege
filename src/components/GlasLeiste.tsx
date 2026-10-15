import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reiterleiste aus Glas wie in iPadOS/iOS 26:
 *
 *   – Unter dem gewählten Reiter liegt eine gläserne „Linse“, die beim
 *     Wechseln federnd hinübergleitet und beim Drücken kurz anwächst.
 *   – Mit Maus oder Trackpad (iPad mit Zeiger, Laptop) folgt eine zweite,
 *     ganz leichte Linse dem Zeiger („Hover“).
 *
 * variante "unten": Handy – schwebende Kapsel unten, Symbol über Text.
 * variante "oben":  Laptop/iPad quer – schmale Kapsel oben, Symbol neben Text.
 *
 * Die Linse wird aus der Lage des Knopfs berechnet (ResizeObserver), damit
 * sie auch bei wechselnder Zahl von Reitern und Badges genau sitzt.
 */
export interface GlasReiter<K extends string> {
  key: K;
  label: string;
  icon: ReactNode;
  badge?: number;
  tour?: string;
}

interface Rahmen {
  x: number;
  w: number;
}

export function GlasLeiste<K extends string>({
  reiter,
  aktiv,
  onWahl,
  variante,
}: {
  reiter: GlasReiter<K>[];
  aktiv: K;
  onWahl: (k: K) => void;
  variante: "unten" | "oben";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const knoepfe = useRef(new Map<K, HTMLButtonElement>());
  const [linse, setLinse] = useState<Rahmen | null>(null);
  const [zeiger, setZeiger] = useState<Rahmen | null>(null);
  const [gedrueckt, setGedrueckt] = useState(false);
  const [bereit, setBereit] = useState(false);

  const rahmenVon = useCallback((k: K | null): Rahmen | null => {
    if (!k) return null;
    const el = knoepfe.current.get(k);
    const box = boxRef.current;
    if (!el || !box) return null;
    return { x: el.offsetLeft, w: el.offsetWidth };
  }, []);

  useLayoutEffect(() => {
    const neu = () => setLinse(rahmenVon(aktiv));
    neu();
    const ro = new ResizeObserver(neu);
    if (boxRef.current) ro.observe(boxRef.current);
    knoepfe.current.forEach((el) => ro.observe(el));
    // Erst nach dem ersten Messen animieren – sonst fliegt die Linse beim
    // Laden von links herein.
    const t = requestAnimationFrame(() => setBereit(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t);
    };
  }, [aktiv, reiter.length, rahmenVon]);

  const unten = variante === "unten";
  // Viele Reiter (Admin: 7) auf schmalem Handy: Schrift bleibt bei 10 px (kleiner
  // wird es unleserlich), dafür weniger Innenabstand und engerer Buchstabenabstand –
  // gekürzt („Finanz…“) wird nichts mehr.
  const eng = unten && reiter.length >= 6;
  const feder = bereit ? "transform 520ms cubic-bezier(.34,1.32,.5,1), width 520ms cubic-bezier(.34,1.32,.5,1), opacity 200ms" : "none";

  return (
    <div
      ref={boxRef}
      onPointerLeave={() => {
        setZeiger(null);
        setGedrueckt(false);
      }}
      className={`relative flex items-stretch ${unten ? "w-full" : "w-fit max-w-full overflow-x-auto no-scrollbar"}`}
      role="tablist"
    >
      {/* Zeiger-Linse: nur mit Maus/Trackpad sichtbar */}
      {zeiger && (
        <span
          aria-hidden
          className="glas-zeiger pointer-events-none absolute inset-y-0 left-0 rounded-full"
          style={{ transform: `translateX(${zeiger.x}px)`, width: zeiger.w, transition: feder }}
        />
      )}
      {linse && (
        <span
          aria-hidden
          className="glas-linse pointer-events-none absolute inset-y-0 left-0 rounded-full"
          style={{
            transform: `translateX(${linse.x}px) scale(${gedrueckt ? 1.08 : 1})`,
            width: linse.w,
            transition: feder,
          }}
        />
      )}
      {reiter.map((r) => {
        const an = r.key === aktiv;
        return (
          <button
            key={r.key}
            ref={(el) => {
              if (el) knoepfe.current.set(r.key, el);
              else knoepfe.current.delete(r.key);
            }}
            role="tab"
            aria-selected={an}
            aria-current={an ? "page" : undefined}
            aria-label={r.label}
            data-tour={r.tour}
            onClick={() => onWahl(r.key)}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setZeiger(rahmenVon(r.key));
            }}
            onPointerDown={() => an && setGedrueckt(true)}
            onPointerUp={() => setGedrueckt(false)}
            onPointerCancel={() => setGedrueckt(false)}
            className={`relative z-[1] flex min-w-0 items-center justify-center rounded-full transition-colors duration-300 ease-ios ${
              unten
                ? `flex-1 flex-col gap-[2px] py-[7px] text-[10px] font-semibold ${eng ? "px-0 tracking-[-0.025em]" : "px-0.5 tracking-[-0.01em]"}`
                : "shrink-0 gap-1.5 px-3.5 py-1.5 text-[14px] font-semibold"
            } ${an ? "text-brand dark:text-brand-dark" : "text-[#3C3C43]/75 dark:text-white/70"}`}
          >
            <span className={`relative flex items-center leading-none ${unten ? "h-[24px]" : ""}`}>
              {r.icon}
              {/* Handy: Zahl am Symbol. Laptop/iPad quer: erst die Beschriftung,
                  dann die Zahl – sonst liest sich „Symbol 8 Events“ wie „8 Events“. */}
              {unten && (r.badge ?? 0) > 0 && (
                <span className="absolute -right-3 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white ring-2 ring-[rgb(var(--glas))]">
                  {r.badge! > 9 ? "9+" : r.badge}
                </span>
              )}
            </span>
            <span className={unten ? "w-full whitespace-nowrap text-center" : ""}>{r.label}</span>
            {!unten && (r.badge ?? 0) > 0 && (
              <span className="-ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white">
                {r.badge! > 9 ? "9+" : r.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
