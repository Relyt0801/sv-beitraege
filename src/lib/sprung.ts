import { useEffect, useRef, useState } from "react";

/**
 * Sprungziele aus Benachrichtigungen. Tippt man z. B. auf „Mithilfe
 * nachtragen – bitte prüfen“, öffnet die App ./#anfrage-nachtrag: der
 * passende Reiter geht auf (App.tsx), und die Anfrage selbst wird geöffnet
 * oder in die Mitte gescrollt und kurz hervorgehoben – kein Suchen, kein
 * Scrollen.
 */
export type Sprungziel = "nachtrag" | "komitee" | "entsperren" | "termin" | "meldung";

export const SPRUNG_TAB: Record<Sprungziel, "themen" | "events"> = {
  nachtrag: "themen",
  komitee: "themen",
  entsperren: "themen",
  termin: "events",
  meldung: "themen",
};

export const sprungUrl = (z: Sprungziel) => `./#anfrage-${z}`;

/** "#anfrage-nachtrag" -> "nachtrag" */
export function sprungAusHash(hash: string): Sprungziel | null {
  const m = hash.match(/^#anfrage-(nachtrag|komitee|entsperren|termin|meldung)$/);
  return m ? (m[1] as Sprungziel) : null;
}

/**
 * In der Anfrage-Komponente: wartet, bis die Daten da sind (bereit), und
 * ruft dann einmal ziel() auf. Ohne passende Daten nach 15 s: vergessen.
 */
export function useSprungziel(z: Sprungziel, bereit: boolean, ziel: () => void) {
  const [wartet, setWartet] = useState(false);
  const zielRef = useRef(ziel);
  zielRef.current = ziel;

  useEffect(() => {
    const pruefe = () => {
      if (sprungAusHash(window.location.hash) !== z) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setWartet(true);
    };
    pruefe();
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, [z]);

  useEffect(() => {
    if (!wartet) return;
    if (bereit) {
      setWartet(false);
      // Erst rendern lassen, dann springen (ohne Aufräumen – setWartet würde
      // den Zeitgeber sonst sofort wieder löschen)
      setTimeout(() => zielRef.current(), 120);
      return;
    }
    const t = setTimeout(() => setWartet(false), 15000);
    return () => clearTimeout(t);
  }, [wartet, bereit]);
}

/** In die Mitte scrollen und kurz hervorheben */
export function hinScrollen(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("sprung-markiert");
  setTimeout(() => el.classList.remove("sprung-markiert"), 2400);
}
