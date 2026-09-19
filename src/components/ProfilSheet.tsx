import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { personIcon } from "../lib/committees";
import { useProfiles } from "../profiles-store";
import { useTopicsOptional } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { farbKontur, farbwert, lesbarerName, speichereProfil, waehlbareFarben } from "../lib/profil";
import { passwortProblem } from "../lib/passwort";
import { SELECTABLE_COMMITTEES, committeeIcon, committeeLabel, rolleUndKomitees } from "../lib/committees";
import { ladeKomiteeAntraege, stelleKomiteeAntrag } from "../lib/komitee-antrag";
import { useTheme } from "../lib/theme";
import { abmelden, enablePush, pushConfigured, pushPermission } from "../lib/push";

/** Das eigene Profil: Bild, Namensfarbe, Passwort, Komitee-Wechsel, Hilfe. */
export function ProfilSheet({
  open,
  onClose,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  /** Fehlt in der Elternansicht – dort gibt es keine Einführung. */
  onTutorial?: () => void;
}) {
  const { mein, uid, aktualisiere, neuLaden } = useProfiles();
  const { isStaff, isOp, role } = useRole();
  const istEltern = role === "eltern";
  // In der Elternansicht laeuft kein Chat-Speicher – dann bleibt die Komiteeliste leer.
  const topics = useTopicsOptional();
  const committeesOf = topics?.committeesOf ?? (() => [] as string[]);
  const { theme } = useTheme();
  const [wunsch, setWunsch] = useState("");
  const [grund, setGrund] = useState("");
  const [antragOffen, setAntragOffen] = useState(false);
  const [farbFehler, setFarbFehler] = useState("");
  const [hatAntrag, setHatAntrag] = useState(false);
  // Passwort ändern direkt im Sheet – prompt() blockieren manche Browser
  const [pwOffen, setPwOffen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwInfo, setPwInfo] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [perm, setPerm] = useState(pushPermission());
  const [pushBusy, setPushBusy] = useState(false);

  const meine = committeesOf(uid);

  useEffect(() => {
    if (open) void ladeKomiteeAntraege().then((r) => setHatAntrag(r.some((x) => x.user_id === uid)));
  }, [open, uid]);

  async function passwortSpeichern() {
    setPwInfo("");
    const problem = passwortProblem(pw1, mein?.anzeigename || "");
    if (problem) {
      setPwInfo(problem);
      return;
    }
    if (pw1 !== pw2) {
      setPwInfo("Die beiden Eingaben sind nicht gleich.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw1 });
    setPwBusy(false);
    if (error) {
      setPwInfo("Hat nicht geklappt: " + error.message);
      return;
    }
    // Der graue Punkt in den Listen bedeutet "nutzt noch das Startpasswort".
    // Wer hier ein eigenes setzt, hat genau das hinter sich – ohne diese Zeile
    // blieb die Markierung fuer immer stehen und log ueber den Kontostand.
    const { data: s } = await supabase!.auth.getSession();
    const uid = s.session?.user.id;
    if (uid) await supabase!.from("profiles").update({ must_change_password: false }).eq("user_id", uid);

    setPw1("");
    setPw2("");
    setPwOffen(false);
    setPwInfo("Passwort geändert.");
  }

  const row =
    "flex w-full items-center gap-3 rounded-xl border border-papier-linie px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[.99] dark:border-slate-700";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Mein Profil</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      {/* Kopf: Namenskreis + Name. Elternzugaenge tragen kein Bild. */}
      <div className="mb-5 flex items-center gap-4">
        {!istEltern && <Avatar userId={uid} size={64} />}
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-lg font-bold"
            style={
              istEltern
                ? undefined
                : { color: farbwert(mein?.farbe, theme === "dark"), textShadow: farbKontur(mein?.farbe, theme === "dark") }
            }
          >
            {istEltern
              ? mein?.anzeigename || "Ihr Zugang"
              : `${personIcon(role, meine)} | ${lesbarerName(mein?.anzeigename || "") || "Dein Name"}`}
          </div>
          <div className="text-[12px] text-tinte-leise">
            {istEltern ? "Elternzugang" : rolleUndKomitees(role, meine) || "noch kein Komitee"}
          </div>
        </div>
      </div>

      {/* Farbe – bei Elternzugaengen gibt es keine, die Namen stehen neutral da. */}
      {!istEltern && (
      <>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">Farbe deines Namens</div>
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
                      ? "Die Farbe ließ sich nicht speichern. In der Datenbank fehlt noch profile.sql."
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
      </>
      )}

      {/* Chat-Schalter – Eltern haben keine Chats */}
      {!istEltern && (
      <div className="mb-5 rounded-2xl bg-papier-matt p-3 dark:bg-slate-800/70">
        <button
          onClick={async () => {
            const neu = !(mein?.push_chats ?? true);
            aktualisiere({ push_chats: neu });
            const r = await speichereProfil({ push_chats: neu });
            if (!r.ok) setFarbFehler("Einstellung konnte nicht gespeichert werden: " + r.error);
            else neuLaden();
          }}
          className="flex w-full items-center gap-3 text-left"
        >
          <span
            className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
              (mein?.push_chats ?? true) ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white transition ${(mein?.push_chats ?? true) ? "translate-x-5" : ""}`}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Pop-ups für Chats</span>
            <span className="block text-[12px] text-tinte-matt">
              Nur normale Chat-Nachrichten. Angepinntes, Nachrichten vom Stufenteam und Events kommen immer.
            </span>
          </span>
        </button>
      </div>
      )}

      {farbFehler && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-500">
          {farbFehler}
        </div>
      )}

      {/* Komitee-Wechsel – Eltern gehoeren in kein Komitee */}
      {!isStaff && !istEltern && (
        <div className="mb-5 rounded-2xl bg-papier-matt p-3 dark:bg-slate-800/70">
          <div className="mb-1 text-sm font-bold">Komitee wechseln</div>
          {hatAntrag ? (
            <p className="text-[13px] text-tinte-matt">Dein Wunsch liegt beim Stufenteam. Sie melden sich.</p>
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
                placeholder="Warum? Ein Satz reicht"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setAntragOffen(false)} className="rounded-lg border border-papier-linie px-3 py-2 text-sm font-semibold text-tinte-matt dark:border-slate-600">
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
              <p className="mb-2 text-[13px] text-tinte-matt">
                Das Stufenteam schaut sich deinen Wunsch an.
              </p>
              <button onClick={() => setAntragOffen(true)} className="rounded-lg border border-papier-linie px-3 py-2 text-sm font-bold text-brand dark:border-slate-600">
                Wechsel beantragen
              </button>
            </>
          )}
        </div>
      )}

      {/* Benachrichtigungen */}
      {hasSupabase && (
        <div className="mb-3 rounded-2xl bg-papier-matt p-3 dark:bg-slate-800/70">
          <div className="text-sm font-bold">Benachrichtigungen aufs Gerät</div>
          {!pushConfigured() ? (
            <p className="mt-1 text-[13px] text-tinte-matt">
              {isStaff
                ? "Für diese Seite ist noch kein Schlüssel hinterlegt. In der Anleitung PUSH-SETUP.md steht, wie das geht."
                : "Hier noch nicht eingerichtet. Sag dem Stufenteam Bescheid."}
            </p>
          ) : perm === "granted" ? (
            <p className="mt-1 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              Sind an. Du bekommst Bescheid, wenn es etwas Neues gibt.
            </p>
          ) : perm === "denied" ? (
            <p className="mt-1 text-[13px] text-tinte-matt">
              Dein Browser blockiert sie gerade. Du kannst das in den Einstellungen deines
              Browsers wieder erlauben, dann klappt es hier sofort.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-tinte-matt">
                Noch aus. Einmal antippen und du verpasst nichts mehr.
              </p>
              <button
                disabled={pushBusy}
                onClick={async () => {
                  setPushBusy(true);
                  const r = await enablePush();
                  setPushBusy(false);
                  setPerm(pushPermission());
                  if (!r.ok && r.error) alert("Hat nicht geklappt: " + r.error);
                }}
                className="mt-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {pushBusy ? "…" : "Benachrichtigungen anschalten"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Passwort */}
      {hasSupabase && pwOffen && (
        <div className="mb-3 rounded-2xl border border-brand/40 bg-brand/5 p-3">
          <div className="mb-2 text-sm font-bold">Neues Passwort</div>
          <input
            type="password"
            autoComplete="new-password"
            className="field mb-2"
            placeholder="Neues Passwort"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            className="field mb-2"
            placeholder="Noch einmal zur Sicherheit"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void passwortSpeichern()}
          />
          {pwInfo && <div className="mb-2 text-[13px] font-medium text-red-500">{pwInfo}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPwOffen(false);
                setPwInfo("");
              }}
              className="rounded-lg border border-papier-linie px-3 py-2 text-sm font-semibold text-tinte-matt dark:border-slate-600"
            >
              Abbrechen
            </button>
            <button
              disabled={pwBusy}
              onClick={passwortSpeichern}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {pwBusy ? "…" : "Speichern"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {hasSupabase && !pwOffen && (
          <button className={row} onClick={() => { setPwOffen(true); setPwInfo(""); }}>
            <span>🔑</span> Passwort ändern
          </button>
        )}
        {onTutorial && (
          <button className={row} onClick={onTutorial}>
            <span>🧭</span> Einführung noch mal ansehen
          </button>
        )}
        {hasSupabase && (
          <button
            className={`${row} text-red-500`}
            onClick={() => confirm("Wirklich abmelden?") && void abmelden()}
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
