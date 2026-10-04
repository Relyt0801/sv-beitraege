import { useRef, useState, type TouchEvent } from "react";

/**
 * Waagerecht wischen zum Blättern (Monat, Woche, Tag).
 * Nach links wischen = weiter (+1), nach rechts = zurück (−1). Nur klar
 * waagerechte Bewegungen zählen, damit das Scrollen nach unten frei bleibt.
 * `zug` folgt dem Finger gedämpft – für das Mitziehen der Ansicht.
 */
export function useWischen(weiter: (richtung: number) => void, schwelle = 55) {
  const start = useRef<{ x: number; y: number; waagerecht: boolean | null } | null>(null);
  const [zug, setZug] = useState(0);
  const handler = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, waagerecht: null };
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.waagerecht === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.waagerecht = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (s.waagerecht) setZug(Math.max(-90, Math.min(90, dx * 0.45)));
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      setZug(0);
      if (!s?.waagerecht) return;
      const dx = e.changedTouches[0].clientX - s.x;
      if (Math.abs(dx) > schwelle) weiter(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => {
      start.current = null;
      setZug(0);
    },
  };
  return { handler, zug };
}
