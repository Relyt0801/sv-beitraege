import { useEffect } from "react";
import { useRole } from "../auth/RoleProvider";
import { hintergrundLaden, hintergrundVersion, useHintergrund } from "../lib/hintergrund";
import { abonniere } from "../lib/realtime";
import { hasSupabase } from "../lib/supabase";

/**
 * Das eigene Hintergrundbild hinter der ganzen App. Karten bleiben deckend
 * weiß bzw. dunkel, damit alles lesbar bleibt; nur der graue Grund dazwischen
 * zeigt das Bild – leicht abgedeckt, damit es ruhig wirkt.
 *
 * Abgleich mit dem Server (Update 1.4 – vorher zeigten Geräte desselben Kontos
 * teils verschiedene Bilder, Ursachen in lib/hintergrund.ts):
 *   - beim Start bzw. Kontowechsel,
 *   - wenn die App wieder sichtbar wird (Handy entsperrt, Tab gewechselt) –
 *     höchstens alle 15 s, es ist nur eine winzige Abfrage,
 *   - sofort, wenn Realtime meldet, dass sich hintergrund_at in der EIGENEN
 *     profiles-Zeile geändert hat (anderes Gerät hat Bild gesetzt/entfernt).
 */
export function HintergrundEbene() {
  const { uid } = useRole();
  const bild = useHintergrund();

  useEffect(() => {
    void hintergrundLaden(uid);
    if (!uid) return;

    // Zurück in der App: nachsehen, ob sich etwas geändert hat
    let zuletzt = Date.now();
    const sichtbar = () => {
      if (document.visibilityState !== "visible" || Date.now() - zuletzt < 15_000) return;
      zuletzt = Date.now();
      void hintergrundLaden(uid);
    };
    document.addEventListener("visibilitychange", sichtbar);

    // Live: nur die eigene Zeile, nur Änderungen. Der Filter hält den Kanal
    // schlank – Änderungen an anderen Profilen kommen hier gar nicht an.
    const abmelden = hasSupabase
      ? abonniere({
          name: "sv-hintergrund",
          nachholen: () => void hintergrundLaden(uid),
          aufbauen: (kanal) =>
            kanal.on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${uid}` },
              (p) => {
                const neu = (p.new as { hintergrund_at?: string | null }).hintergrund_at ?? null;
                // Nur reagieren, wenn sich die Version wirklich unterscheidet –
                // profiles ändert sich auch aus vielen anderen Gründen.
                if (neu !== hintergrundVersion()) void hintergrundLaden(uid);
              },
            ),
        })
      : () => {};

    return () => {
      document.removeEventListener("visibilitychange", sichtbar);
      abmelden();
    };
  }, [uid]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("mit-hintergrund", Boolean(bild));
    // Für Vollbild-Ebenen (.ebene-grund), die das Bild noch einmal zeigen
    if (bild) html.style.setProperty("--hg-bild", `url(${bild})`);
    else html.style.removeProperty("--hg-bild");
    return () => {
      html.classList.remove("mit-hintergrund");
      html.style.removeProperty("--hg-bild");
    };
  }, [bild]);

  if (!bild) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bild})` }} />
      <div className="absolute inset-0 bg-[rgb(var(--papier)/0.45)]" />
    </div>
  );
}
