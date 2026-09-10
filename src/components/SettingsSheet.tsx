import { hasSupabase, supabase } from "../lib/supabase";
import { useTopics } from "../topics-store";
import { committeeLabel } from "../lib/committees";
import { Sheet } from "./Sheet";

/** Schlanke Einstellungen für alle ohne Team-Rechte – ohne Filter und Datenkram. */
export function SettingsSheet({
  open,
  onClose,
  onTerms,
  onTutorial,
  onChangePassword,
}: {
  open: boolean;
  onClose: () => void;
  onTerms: () => void;
  onTutorial: () => void;
  onChangePassword: () => void;
}) {
  const { committeesOf, uid } = useTopics();
  const meine = committeesOf(uid);

  const row =
    "flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[.99] dark:border-slate-700";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Einstellungen</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <div className="mb-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mein Komitee</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {meine.length ? (
            meine.map((s) => (
              <span key={s} className="rounded-full bg-brand/15 px-2.5 py-1 text-sm font-bold text-brand">
                {committeeLabel(s)}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">noch keins – das Stufenteam kann dich zuordnen</span>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <button className={row} onClick={onTutorial}>
          <span>🧭</span> Kurze Einführung noch mal ansehen
        </button>
        <button className={row} onClick={onTerms}>
          <span>📄</span> Nutzungsbedingungen
        </button>
        {hasSupabase && (
          <>
            <button className={row} onClick={onChangePassword}>
              <span>🔑</span> Passwort ändern
            </button>
            <button
              className={`${row} text-red-500`}
              onClick={() => {
                if (confirm("Wirklich abmelden?")) void supabase!.auth.signOut();
              }}
            >
              <span>↩</span> Abmelden
            </button>
          </>
        )}
      </div>

      <button className="btn-primary mt-5" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}
