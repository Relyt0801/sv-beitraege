import { useState } from "react";
import { useRole, type Profile } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";

/** Wie lange eine Chat-Sperre laeuft. Rollen-Reiter und Chat teilen sich die Liste. */
export const DAUERN: { label: string; ms: number | null }[] = [
  { label: "1 Stunde", ms: 60 * 60 * 1000 },
  { label: "1 Tag", ms: 24 * 60 * 60 * 1000 },
  { label: "Dauerhaft", ms: null },
];

export const isBanned = (p: Pick<Profile, "chat_banned_until" | "chat_ban_permanent">) =>
  Boolean(p.chat_ban_permanent) || (!!p.chat_banned_until && new Date(p.chat_banned_until) > new Date());

/**
 * Stummschalten direkt an der Nachricht – fuer alle mit mod.timeout.
 *
 * Der Knopf dafuer sass bisher nur im Rollen-Reiter, und der wird ueber
 * roles.manage eingeblendet. Wer sperren darf, aber keine Rollen vergibt,
 * hatte das Recht also ohne jede Oberflaeche. Hier steht es da, wo moderiert
 * wird: an der Nachricht.
 *
 * Zeigt sich nicht bei eigenen Nachrichten, beim geschuetzten OP-Konto und
 * wenn das Profil der Person nicht sichtbar ist (dann scheitert das Sperren
 * ohnehin an der RLS).
 */
export function MuteKnopf({ userId, name, icon = false }: { userId: string | null; name?: string; icon?: boolean }) {
  const { can, uid, profiles, opUserId, setBan } = useRole();
  const [offen, setOffen] = useState(false);

  const ziel = profiles.find((p) => p.user_id === userId);
  if (!can("mod.timeout") || !ziel) return null;
  if (ziel.user_id === uid || ziel.is_op || ziel.user_id === opUserId) return null;

  const zielId = ziel.user_id;
  const gesperrt = isBanned(ziel);
  const titel = gesperrt ? "Sperre aufheben" : "Vom Chat sperren";

  function sperren(ms: number | null) {
    setOffen(false);
    void setBan(zielId, ms ? new Date(Date.now() + ms).toISOString() : null, ms === null);
  }

  function entsperren() {
    setOffen(false);
    void setBan(zielId, null, false);
  }

  return (
    <>
      <button
        onClick={() => setOffen(true)}
        title={titel}
        aria-label={titel}
        className={icon ? "" : `ml-2 underline ${gesperrt ? "text-red-500" : ""}`}
      >
        {icon ? (gesperrt ? "🚫" : "🔇") : gesperrt ? "entsperren" : "stumm"}
      </button>

      <Sheet open={offen} onClose={() => setOffen(false)}>
        {/* Eigene Textklassen: der Knopf steht in der winzigen Zeitzeile der
            Chatblase, deren Schriftgroesse und Ausrichtung sonst durchschlagen. */}
        <div className="text-left text-[15px] text-tinte dark:text-slate-100">
          <h3 className="text-lg font-extrabold">{name || ziel.username || "Person"}</h3>
          <p className="mb-4 mt-1 text-[13px] text-tinte-leise">
            {gesperrt
              ? "Diese Person kann im Moment nirgends schreiben."
              : "Solange gesperrt kann die Person nirgends mehr schreiben – lesen schon."}
          </p>
          <div className="grid gap-2">
            {gesperrt ? (
              <button
                onClick={entsperren}
                className="rounded-xl border border-papier-linie py-2.5 font-bold dark:border-slate-700"
              >
                Sperre aufheben
              </button>
            ) : (
              DAUERN.map((d) => (
                <button
                  key={d.label}
                  onClick={() => sperren(d.ms)}
                  className="rounded-xl border border-papier-linie py-2.5 font-bold dark:border-slate-700"
                >
                  {d.label}
                </button>
              ))
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
