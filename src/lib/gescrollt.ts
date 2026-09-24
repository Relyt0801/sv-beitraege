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

/**
 * Höhe eines festen Bereichs (Kopf, Tab-Leiste) als CSS-Variable ablegen.
 *
 * Vorher standen an jeder Stelle geratene Zahlen (3.6rem, 4.9rem, 52px), die
 * nach dem neuen Design nicht mehr stimmten: Die Leiste mit „Anpinnen /
 * Abstimmung / To-do“ lag halb unter der Tab-Leiste. Jetzt wird gemessen –
 * auch wenn sich die Leiste ändert (Schriftgröße, Drehen, iPad).
 * Ist das Element ausgeblendet (z. B. Tab-Leiste am Rechner), gilt 0.
 */
export function useHoeheAlsVariable(name: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const root = document.documentElement;
    const setzen = () => {
      const sichtbar = getComputedStyle(el).display !== "none";
      root.style.setProperty(name, `${sichtbar ? el.offsetHeight : 0}px`);
    };
    setzen();
    const ro = new ResizeObserver(setzen);
    ro.observe(el);
    window.addEventListener("resize", setzen);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setzen);
      root.style.removeProperty(name);
    };
  }, [el, name]);
  return setEl;
}

/**
 * Chat: ans Ende scrollen – beim Öffnen immer, bei neuen Nachrichten nur, wenn
 * man ohnehin unten war oder selbst geschrieben hat. Vorher riss jede neue
 * Nachricht die Ansicht nach unten, auch wenn man gerade ältere las.
 */
export function useChatEnde(anzahl: number, letzteIstMeine: boolean) {
  const ende = useRef<HTMLDivElement | null>(null);
  const erstes = useRef(true);
  const warUnten = useRef(true);
  useEffect(() => {
    const pruefen = () => {
      const rest = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      warUnten.current = rest < 160;
    };
    pruefen();
    window.addEventListener("scroll", pruefen, { passive: true });
    return () => window.removeEventListener("scroll", pruefen);
  }, []);
  useEffect(() => {
    if (!ende.current) return;
    if (erstes.current || warUnten.current || letzteIstMeine) ende.current.scrollIntoView({ block: "end" });
    if (anzahl > 0) erstes.current = false;
  }, [anzahl, letzteIstMeine]);
  return ende;
}
