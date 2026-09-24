import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ist die Seite ein Stück nach unten gescrollt? Dann wird der Kopf milchig
 * und der große Titel klein – wie in iOS-Apps.
 */
export function useGescrollt(ab = 12): boolean {
  const [gescrollt, setGescrollt] = useState(() => window.scrollY > ab);
  useEffect(() => {
    let raf = 0;
    const pruefen = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setGescrollt(window.scrollY > ab));
    };
    window.addEventListener("scroll", pruefen, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", pruefen);
    };
  }, [ab]);
  return gescrollt;
}

/**
 * Reiter wechseln und dabei oben anfangen – ohne dass iOS die Tab-Leiste
 * hochfedern lässt.
 *
 * Früher wurde erst der neue Reiter gezeigt und danach nach oben gescrollt.
 * War man vorher weit unten und ist der neue Reiter kurz (Events ohne
 * Einträge), stand die Seite für einen Moment "hinter dem Ende". iOS federt
 * das zurück und nimmt die feste Tab-Leiste dabei mit. Deshalb geht es jetzt
 * erst nach oben, solange die alte, lange Seite noch da ist, und dann erst
 * zum neuen Reiter. Ein Tipp auf den Reiter, in dem man schon ist, scrollt
 * sanft nach oben – wie in iOS-Apps.
 */
export function useReiter<T>(start: T | (() => T)): [T, (neu: T) => void] {
  const [reiter, setReiterRoh] = useState<T>(start);
  const aktuell = useRef(reiter);
  aktuell.current = reiter;
  const setReiter = useCallback((neu: T) => {
    if (window.scrollY > 0) {
      if (neu === aktuell.current) window.scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo(0, 0);
    }
    aktuell.current = neu;
    setReiterRoh(neu);
  }, []);
  return [reiter, setReiter];
}
