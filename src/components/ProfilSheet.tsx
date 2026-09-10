import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { personIcon } from "../lib/committees";
import { useProfiles } from "../profiles-store";
import { useTopics } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { farbKontur, farbwert, lesbarerName, speichereProfil, waehlbareFarben } from "../lib/profil";
import { SELECTABLE_COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { ladeKomiteeAntraege, stelleKomiteeAntrag } from "../lib/komitee-antrag";
import { useTheme } from "../lib/theme";

/** Das eigene Profil: Bild, Namensfarbe, Passwort, Komitee-Wechsel, Hilfe. */
export function ProfilSheet({
  open,
  onClose,
  onTerms,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  onTerms: () => void;
  onTutorial: () => void;
}) {
  const { mein, uid, aktualisiere, neuLaden } = useProfiles();
  const { committeesOf } = useTopics();
  const { isStaff, isOp, role } = useRole();
  const { theme } = useTheme();
  const [wunsch, setWunsch] = useState("");
  const [grund, setGrund] = useState("");
  const [antragOffen, setAntragOffen] = useState(false);
  const [farbFehler, setFarbFehler] = useState("");
  const [hatAntrag, setHatAntrag] = useState(false);

  const meine = committeesOf(uid);

  useEffect(() => {
    if (open) void ladeKomiteeAntraege().then((r) => setHatAntrag(r.some((x) => x.user_id === uid)));
  }, [open, uid]);

  async function passwortAendern() {
    const pw = prompt("Neues Passwort (mindestens 6 Zeichen):");
    if (!pw) return;
    if (pw.length < 6) {
      alert("Mindestens 6 Zeichen.");
      return;
    }
    const { error } = await supabase!.auth.updateUser({ password: pw });
    alert(error ? "Fehler: " + error.message : "Passwort geändert ✓");
  }

  const row =
    "flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[.99] dark:border-slate-700";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Mein Profil</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      {/* Kopf: Namenskreis + Name */}
      <div className="mb-5 flex items-center gap-4">
        <Avatar userId={uid} size={64} />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-lg font-bold"
            style={{ color: farbwert(mein?.farbe, theme === "dark"), textShadow: farbKontur(mein?.farbe, theme === "dark") }}
          >
            {personIcon(role, meine)} | {lesbarerName(mein?.anzeigename || "") || "Dein Name"}
          </div>
          <div className="text-[12px] text-slate-400">
            {meine.length ? meine.map(committeeLabel).join(", ") : "noch kein Komitee"}
          </div>
        </div>
      </div>

      {/* Farbe */}
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Farbe deines Namens</div>
      <div className="mb-5 grid max-w-sm grid-cols-8 gap-2 sm:gap-2.5">
        {waehlbareFarben({ staff: isStaff, op: isOp }).map((f) => {
          const aktiv = (mein?.farbe || "indigo") === f.key;
          return (
            <button
              key={f.key}
              title={f.label}
              onClick={async () => {
                aktualisiere({ farbe: f.key });
                setFarbFehler("");
                const r = await speichereProfil({ farbe: f.key });
                if (!r.ok) {
                  setFarbFehler(
                    /public_profiles|does not exist|schema cache/i.test(r.error || "")
                      ? "Farbe konnte nicht gespeichert werden – in der Datenbank fehlt noch profile.sql."
                      : "Farbe konnte nicht gespeichert werden: " + r.error,
                  );
                  return;
                }
                neuLaden();
              }}
              style={{
                backgroundColor: theme === "dark" ? f.dunkel : f.hell,
                border: f.kontur ? "1px solid rgba(100,116,139,.5)" : undefined,
              }}
              className={`aspect-square w-full rounded-full transition active:scale-90 ${
                aktiv ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900" : ""
              }`}
            />
          );
        })}
      </div>

      {farbFehler && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-500">
          {farbFehler}
        </div>
      )}

      {/* Komitee-Wechsel */}
      {!isStaff && (
        <div className="mb-5 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/70">
          <div className="mb-1 text-sm font-bold">Komitee wechseln</div>
          {hatAntrag ? (
            <p className="text-[13px] text-slate-500">Dein Antrag liegt beim Stufenteam.</p>
          ) : antragOffen ? (
            <>
              <select
                className="field mb-2"
                value={wunsch}
                onChange={(e) => setWunsch(e.target.value)}
              >
                <option value="">— Wunsch-Komitee —</option>
                {SELECTABLE_COMMITTEES.filter((c) => !meine.includes(c.slug)).map((c) => (
                  <option key={c.slug} value={c.slug}>{committeeIcon(c.slug)} {c.label}</option>
                ))}
              </select>
              <textarea
                rows={2}
                maxLength={300}
                className="field mb-2 resize-none"
                placeholder="Warum? (kurz)"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setAntragOffen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-600">
                  Abbrechen
                </button>
                <button
                  disabled={!wunsch}
                  onClick={async () => {
                    const r = await stelleKomiteeAntrag(wunsch, grund);
                    if (r.ok) {
                      setHatAntrag(true);
                      setAntragOffen(false);
                    } else alert(r.error);
                  }}
                  className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  Antrag senden
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-[13px] text-slate-500">
                Das Stufenteam entscheidet darüber.
              </p>
              <button onClick={() => setAntragOffen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-brand dark:border-slate-600">
                Wechsel beantragen
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid gap-2">
        {hasSupabase && (
          <button className={row} onClick={passwortAendern}>
            <span>🔑</span> Passwort ändern
          </button>
        )}
        <button className={row} onClick={onTutorial}>
          <span>🧭</span> Einführung noch mal ansehen
        </button>
        <button className={row} onClick={onTerms}>
          <span>📄</span> Nutzungsbedingungen
        </button>
        {hasSupabase && (
          <button
            className={`${row} text-red-500`}
            onClick={() => confirm("Wirklich abmelden?") && void supabase!.auth.signOut()}
          >
            <span>↩</span> Abmelden
          </button>
        )}
      </div>

      <button className="btn-primary mt-5" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}
