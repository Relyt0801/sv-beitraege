import { useEffect, useState } from "react";
import { hasSupabase } from "../lib/supabase";
import { aufVerbindung, neuVerbinden, type Verbindung } from "../lib/realtime";

/**
 * Eine kleine Kapsel oben, wenn die Live-Verbindung weg ist.
 *
 * Bisher konnte man das überhaupt nicht sehen. Bricht die Verbindung ab – Handy
 * gesperrt, WLAN gewechselt, oder der Server lässt keine weiteren Geräte mehr
 * zu – dann zeigte die App einfach weiter den alten Stand. Neue Nachrichten
 * kamen nicht an, und niemand konnte ahnen, warum.
 *
 * Die Kapsel erscheint bewusst erst nach ein paar Sekunden: ein kurzer
 * Aussetzer beim Wiederverbinden ist normal und soll niemanden beunruhigen.
 * Vor dem Login ("aus") ist gar kein Kanal offen – dann auch kein Hinweis.
 */
export function Verbindungshinweis() {
  const [zustand, setZustand] = useState<Verbindung>("aus");
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => aufVerbindung(setZustand), []);

  useEffect(() => {
    if (zustand === "verbunden" || zustand === "aus") {
      setZeigen(false);
      return;
    }
    const t = setTimeout(() => setZeigen(true), 6000);
    return () => clearTimeout(t);
  }, [zustand]);

  if (!hasSupabase || !zeigen) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[80] flex justify-center px-3"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-[#1c1c1e]/90 py-1.5 pl-3.5 pr-1.5 text-[13px] font-semibold text-white shadow-lg backdrop-blur-xl">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#FF9F0A]" />
        <span className="min-w-0 truncate">Keine Live-Verbindung</span>
        <button
          onClick={neuVerbinden}
          className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold transition active:scale-95"
        >
          Neu verbinden
        </button>
      </div>
    </div>
  );
}
