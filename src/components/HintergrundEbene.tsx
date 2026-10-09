import { useEffect } from "react";
import { useRole } from "../auth/RoleProvider";
import { hintergrundLaden, useHintergrund } from "../lib/hintergrund";

/**
 * Das eigene Hintergrundbild hinter der ganzen App. Karten bleiben deckend
 * weiß bzw. dunkel, damit alles lesbar bleibt; nur der graue Grund dazwischen
 * zeigt das Bild – leicht abgedeckt, damit es ruhig wirkt.
 */
export function HintergrundEbene() {
  const { uid } = useRole();
  const bild = useHintergrund();

  useEffect(() => {
    void hintergrundLaden(uid);
  }, [uid]);

  useEffect(() => {
    document.documentElement.classList.toggle("mit-hintergrund", Boolean(bild));
    return () => document.documentElement.classList.remove("mit-hintergrund");
  }, [bild]);

  if (!bild) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bild})` }} />
      <div className="absolute inset-0 bg-[rgb(var(--papier)/0.45)]" />
    </div>
  );
}
