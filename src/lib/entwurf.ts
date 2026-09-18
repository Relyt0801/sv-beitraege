import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ein Eingabefeld, das nicht bei jedem Tastendruck in die Datenbank schreibt.
 *
 * Getippt wird zuerst nur im Feld selbst. Erst wenn man kurz aufhört (oder das
 * Feld verlässt), geht der Wert einmal zur Datenbank. Aus fünfzehn Anfragen für
 * "Waffelverkauf" wird so eine einzige.
 *
 * Solange getippt wird, lassen wir den Wert von außen in Ruhe – sonst würde
 * eine verspätete Antwort mitten ins Wort grätschen.
 */
export function useEntwurf<T>(vonAussen: T, speichern: (wert: T) => void, verzoegerung = 600) {
  const [wert, setWert] = useState<T>(vonAussen);
  const wirdGetippt = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speichernRef = useRef(speichern);
  speichernRef.current = speichern;

  useEffect(() => {
    if (!wirdGetippt.current) setWert(vonAussen);
  }, [vonAussen]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Wert im Feld ändern, Speichern auf später verschieben. */
  const aendern = useCallback(
    (neu: T) => {
      wirdGetippt.current = true;
      setWert(neu);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        wirdGetippt.current = false;
        speichernRef.current(neu);
      }, verzoegerung);
    },
    [verzoegerung],
  );

  /** Beim Verlassen des Feldes nicht erst warten. */
  const jetztSpeichern = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    wirdGetippt.current = false;
    speichernRef.current(wert);
  }, [wert]);

  return { wert, aendern, jetztSpeichern };
}

/**
 * Ein Wert, der der Eingabe hinterherlaeuft.
 *
 * Fuers Suchfeld: das Tippen soll sofort im Feld stehen, aber die Liste mit
 * 300 Personen muss nicht bei jedem Buchstaben neu gefiltert und gezeichnet
 * werden. Erst wenn kurz nichts mehr kommt, zieht die Liste nach.
 */
export function useVerzoegert<T>(wert: T, verzoegerung = 120): T {
  const [spaet, setSpaet] = useState(wert);
  useEffect(() => {
    const t = setTimeout(() => setSpaet(wert), verzoegerung);
    return () => clearTimeout(t);
  }, [wert, verzoegerung]);
  return spaet;
}
