import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
 * sie auch bei wechselnder Zahl von Reitern genau sitzt.
 *
 * WICHTIGSTE Regel: Jeder Reiter steht immer an derselben Stelle. Die roten
 * Zahlen stehen deshalb in BEIDEN Varianten außerhalb des Textflusses
 * (absolut) – vorher stand die Zahl oben hinter der Beschriftung, und jede
 * Zahl, die kam oder ging (Chat geöffnet, Kalender gesehen, 9 → „9+“),
 * machte die mittig gesetzte Kapsel breiter oder schmaler: alle Reiter
 * rutschten um 11 px zur Seite (Prüfung Okt. 2026, vier Rollen).
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
  /** `angetippt` ist immer true: die Wahl kam aus der Leiste (siehe useReiter) */
  onWahl: (k: K, angetippt?: boolean) => void;
  variante: "unten" | "oben";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const knoepfe = useRef(new Map<K, HTMLButtonElement>());
  const [linse, setLinse] = useState<Rahmen | null>(null);
  const [zeiger, setZeiger] = useState<Rahmen | null>(null);
  // Über welchem Reiter der Zeiger gerade steht – damit auch die Zeiger-Linse
  // nachgemessen wird, wenn sich die Leiste ändert (neuer Reiter, Drehen).
  // Vorher blieb sie nach einem Wechsel mit der alten Breite stehen und ragte
  // unter den Nachbarn.
  const zeigerKey = useRef<K | null>(null);
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
    const neu = () => {
      setLinse(rahmenVon(aktiv));
      if (zeigerKey.current) setZeiger(rahmenVon(zeigerKey.current));
    };
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
  const zahlId = useId();
  // Viele Reiter (Admin: 7) auf schmalem Handy: Schrift bleibt bei 10 px (kleiner
  // wird es unleserlich), dafür weniger Innenabstand und engerer Buchstabenabstand –
  // gekürzt („Finanz…“) wird nichts mehr.
  const eng = unten && reiter.length >= 6;
  const feder = bereit ? "transform 520ms cubic-bezier(.34,1.32,.5,1), width 520ms cubic-bezier(.34,1.32,.5,1), opacity 200ms" : "none";

  return (
    <div
      ref={boxRef}
      onPointerLeave={() => {
        zeigerKey.current = null;
        setZeiger(null);
        setGedrueckt(false);
      }}
      // Oben: Notfalls (sehr große Schrift) seitlich wischbar – aber NIE
      // senkrecht. Die 8 px Innenabstand ringsum (-m-2 p-2) nehmen die
      // Tippfläche (::after, 45 px) und die rote Zahl samt Ring auf, ohne dass
      // die Leiste mehr Platz braucht: vorher ragte das ::after 6 px unter die
      // Box, die Leiste ließ sich senkrecht scrollen und der erste Mausrad-Ruck
      // verschob die Reiter, statt die Seite zu scrollen. Seitlich dasselbe
      // für die Zahl am letzten Reiter.
      className={`relative flex items-stretch ${
        unten ? "w-full" : "no-scrollbar -m-2 w-fit max-w-[calc(100%+1rem)] overflow-x-auto overflow-y-hidden p-2"
      }`}
      role="tablist"
    >
      {/* Zeiger-Linse: nur mit Maus/Trackpad sichtbar */}
      {zeiger && (
        <span
          aria-hidden
          className={`glas-zeiger pointer-events-none absolute left-0 rounded-full ${unten ? "inset-y-0" : "inset-y-2"}`}
          style={{ transform: `translateX(${zeiger.x}px)`, width: zeiger.w, transition: feder }}
        />
      )}
      {linse && (
        <span
          aria-hidden
          className={`glas-linse pointer-events-none absolute left-0 rounded-full ${unten ? "inset-y-0" : "inset-y-2"}`}
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
            // Die Zahl als Beschreibung („Chats, 5 neu“) – der Name bleibt der Reiter
            aria-describedby={(r.badge ?? 0) > 0 ? `${zahlId}-${String(r.key)}` : undefined}
            data-tour={r.tour}
            onClick={() => onWahl(r.key, true)}
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse") return;
              zeigerKey.current = r.key;
              setZeiger(rahmenVon(r.key));
            }}
            onPointerDown={() => an && setGedrueckt(true)}
            onPointerUp={() => setGedrueckt(false)}
            onPointerCancel={() => setGedrueckt(false)}
            className={`relative z-[1] flex min-w-0 items-center justify-center rounded-full transition-colors duration-300 ease-ios ${
              unten
                ? `flex-1 flex-col gap-[2px] py-[7px] text-[10px] font-semibold ${eng ? "px-0 tracking-[-0.025em]" : "px-0.5 tracking-[-0.01em]"}`
                : // Kapsel 33 px hoch, Tippfläche über ::after 45 px (iPad quer: Finger)
                  "shrink-0 gap-1.5 px-3.5 py-1.5 text-[14px] font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
            } ${an ? "text-brand dark:text-brand-dark" : "text-[#3C3C43]/75 dark:text-white/70"}`}
          >
            <span className={`relative flex items-center leading-none ${unten ? "h-[24px]" : ""}`}>
              {r.icon}
              {/* Handy: Zahl am Symbol (absolut, ändert keine Breite) */}
              {unten && (r.badge ?? 0) > 0 && (
                <span id={`${zahlId}-${String(r.key)}`} className="absolute -right-3 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[12px] font-semibold text-white ring-2 ring-[rgb(var(--glas))]">
                  {r.badge! > 9 ? "9+" : r.badge}
                  <span className="sr-only"> neu</span>
                </span>
              )}
            </span>
            <span className={unten ? "w-full whitespace-nowrap text-center" : ""}>{r.label}</span>
            {/* Laptop/iPad quer: die Zahl sitzt oben rechts auf der Ecke des
                Reiters (wie die Zahl auf einem App-Symbol) – hinter der
                Beschriftung, aber ohne Platz im Textfluss. Sie liegt im
                Innenabstand der Leiste und wird deshalb nicht abgeschnitten. */}
            {!unten && (r.badge ?? 0) > 0 && (
              <span id={`${zahlId}-${String(r.key)}`} className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[12px] font-semibold leading-none text-white ring-2 ring-[rgb(var(--glas))]">
                {r.badge! > 9 ? "9+" : r.badge}
                <span className="sr-only"> neu</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
