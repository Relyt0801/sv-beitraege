import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBreit } from "../lib/gescrollt";

/**
 * Bedienelemente einer ganzen Seite (Umschalter wie „Personen | Rechte je
 * Rolle“, Knöpfe wie „+ Neu“) – am Rechner/iPad quer rechts in der
 * Kopfzeile der App (Platzhalter #kopf-aktionen in App.tsx), am Handy an
 * Ort und Stelle über dem Inhalt.
 *
 * So steht auf jedem Gerät alles, was die Seite steuert, an derselben
 * Stelle wie im geöffneten Chat „Chat | Pinnwand“ – und am Laptop kostet
 * es keine eigene Zeile (Design-Regeln, Abschnitt 3).
 *
 * `className` gilt nur für die Stelle im Inhalt (Handy), `kopfClassName`
 * nur in der Kopfzeile (z. B. eine feste Breite für einen Umschalter).
 */
export function InKopf({
  children,
  className = "",
  kopfClassName = "",
}: {
  children: ReactNode;
  className?: string;
  kopfClassName?: string;
}) {
  const breit = useBreit();
  const [ziel, setZiel] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setZiel(breit ? document.getElementById("kopf-aktionen") : null);
  }, [breit]);
  if (ziel) return createPortal(<div className={`flex shrink-0 items-center gap-2 ${kopfClassName}`}>{children}</div>, ziel);
  // Am Handy steht der Umschalter ausserhalb von <main>: „in-kopf“ macht ihn
  // auf dem Hintergrundbild deckend wie jedes Segment (index.css)
  return <div className={`in-kopf ${className}`}>{children}</div>;
}
