import { useEffect, useState } from "react";
import { hasSupabase } from "../lib/supabase";
import { aufVerbindung, neuVerbinden, type Verbindung } from "../lib/realtime";

/**
 * Ein schmaler Streifen, wenn die Live-Verbindung weg ist.
 *
 * Bisher konnte man das überhaupt nicht sehen. Bricht die Verbindung ab – Handy
 * gesperrt, WLAN gewechselt, oder der Server lässt keine weiteren Geräte mehr
 * zu – dann zeigte die App einfach weiter den alten Stand. Neue Nachrichten
 * kamen nicht an, und niemand konnte ahnen, warum. Genau das steckt hinter
 * "Ansichten werden bei anderen nicht sofort aktualisiert".
 *
 * Der Streifen erscheint bewusst erst nach ein paar Sekunden: ein kurzer
 * Aussetzer beim Wiederverbinden ist normal und soll niemanden beunruhigen.
 */
export function Verbindungshinweis() {
  const [zustand, setZustand] = useState<Verbindung>("verbindet");
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => aufVerbindung(setZustand), []);

  useEffect(() => {
    if (zustand === "verbunden") {
      setZeigen(false);
      return;
    }
    const t = setTimeout(() => setZeigen(true), 6000);
    return () => clearTimeout(t);
  }, [zustand]);

  if (!hasSupabase || !zeigen) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-3 bg-amber-500 px-3 py-1.5 text-[12px] font-semibold text-white">
      <span>Keine Live-Verbindung – neue Beiträge kommen gerade nicht an.</span>
      <button onClick={neuVerbinden} className="shrink-0 rounded-md bg-white/25 px-2 py-0.5 underline">
        Neu verbinden
      </button>
    </div>
  );
}
