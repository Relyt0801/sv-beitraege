import { useEffect, useRef, useState } from "react";

/** Wie viele Zeilen auf einmal dazukommen. */
export const SCHRITT = 40;

/**
 * Lange Listen stueckweise zeichnen.
 *
 * Bei 300 Konten hingen sonst alle Zeilen gleichzeitig im Dokument – rund
 * 10.000 Knoten, und jeder Tastendruck im Suchfeld ging durch alle davon.
 * Hier stehen erst 40 Zeilen da; sobald die Marke am Ende in Sicht kommt,
 * kommen die naechsten 40 dazu.
 *
 * Bewusst kein echtes Fenster-Rendering: die Zeilen sind unterschiedlich hoch
 * (auf dem Handy brechen die Halbjahre um), und falsch geschaetzte Hoehen
 * lassen den Balken springen. Nachschub ist unauffaelliger.
 */
export function useNachschub(anzahl: number, zuruecksetzenBei: unknown[]) {
  const [sichtbar, setSichtbar] = useState(SCHRITT);
  const marke = useRef<HTMLDivElement | null>(null);

  // Neue Suche, neuer Filter: wieder oben anfangen.
  useEffect(() => {
    setSichtbar(SCHRITT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, zuruecksetzenBei);

  useEffect(() => {
    const ziel = marke.current;
    if (!ziel) return;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) setSichtbar((v) => v + SCHRITT);
      },
      { rootMargin: "600px" },
    );
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, [sichtbar, anzahl]);

  return { sichtbar, marke, rest: Math.max(0, anzahl - sichtbar) };
}
