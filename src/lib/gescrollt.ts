import { useEffect, useState } from "react";

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
