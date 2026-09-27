import { useEffect, useState } from "react";

/** Folgt dem Hell/Dunkel-Schalter der App (Klasse "dark" am <html>). */
export function useDunkel(): boolean {
  const [dunkel, setDunkel] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const beob = new MutationObserver(() => setDunkel(document.documentElement.classList.contains("dark")));
    beob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => beob.disconnect();
  }, []);
  return dunkel;
}
