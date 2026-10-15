import type { ReactNode } from "react";

/**
 * Fußleiste eines Blatts: bleibt beim Scrollen unten kleben, damit der
 * Hauptknopf („Eintragen“, „Runde starten“ …) nie unter den Bildschirmrand
 * rutscht (Prüfung 15.10.2026: Knopf war erst nach Scrollen erreichbar).
 *
 * Funktioniert als direktes Kind eines <Sheet>: Das Blatt scrollt selbst und
 * hat unten 1,5 rem + Sicherheitsabstand Innenabstand. Den holt sich die
 * Leiste mit negativem Außenabstand zurück, damit sie bündig mit dem
 * Blattrand abschließt und der Grund (hell: Grau, dunkel: #1C1C1E) lückenlos
 * ist – Inhalt scheint nicht mehr unter dem Knopf durch.
 */
export function FussLeiste({ children }: { children: ReactNode }) {
  return (
    <div
      // Chrome und Safari messen „sticky“ vom Inhaltsrand aus, nicht vom Blattrand:
      // ohne den negativen Wert bliebe unter der Leiste ein Streifen Inhalt sichtbar.
      style={{ bottom: "calc(-1 * (env(safe-area-inset-bottom) + 1.5rem))" }}
      className="sticky z-10 -mx-5 -mb-[calc(env(safe-area-inset-bottom)+1.5rem)] mt-4 border-t border-black/[0.06] bg-papier px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-white/[0.08] dark:bg-slate-900"
    >
      {children}
    </div>
  );
}
