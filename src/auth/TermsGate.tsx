import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { enablePush, pushConfigured, pushPermission } from "../lib/push";
import { TermsText } from "../components/TermsText";

/**
 * Erzwingt beim ersten Login die Zustimmung zu den Nutzungsbedingungen
 * (profiles.terms_accepted_at = null -> Zustimmungsscreen vor der App).
 */
export function TermsGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "accept" | "ok">(hasSupabase ? "loading" : "ok");

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    const check = async () => {
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) {
        if (alive) setState("ok");
        return;
      }
      const { data } = await supabase!
        .from("profiles")
        .select("terms_accepted_at")
        .eq("user_id", uid)
        .maybeSingle();
      if (alive) setState(data && !data.terms_accepted_at ? "accept" : "ok");
    };
    void check();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        setState("loading");
        void check();
      }
      if (event === "SIGNED_OUT") setState("ok");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading")
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="animate-pulse text-lg font-semibold">Stufenkasse …</div>
      </div>
    );
  if (state === "accept") return <AcceptScreen onDone={() => setState("ok")} />;
  return <>{children}</>;
}

function AcceptScreen({ onDone }: { onDone: () => void }) {
  const [checked, setChecked] = useState(false);
  // Benachrichtigungen gleich mit erledigen – der Klick auf "Zustimmen" ist die
  // Nutzergeste, die der Browser für die Nachfrage braucht.
  const [pushAn, setPushAn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pushMoeglich = pushConfigured() && pushPermission() === "default";

  async function accept() {
    setBusy(true);
    setErr("");
    const { data: s } = await supabase!.auth.getSession();
    if (!s.session) return;
    const { error } = await supabase!
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("user_id", s.session.user.id);
    setBusy(false);
    if (error) {
      setErr("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    localStorage.removeItem("sv:push-optin");
    if (pushAn && pushMoeglich) {
      // Direkt hier fragen, solange der Klick noch als Nutzergeste zählt
      const r = await enablePush();
      if (!r.ok) console.warn("[push] Aktivierung nach Zustimmung fehlgeschlagen:", r.error);
    }
    onDone();
  }

  return (
    <div className="flex min-h-full items-start justify-center p-4 sm:p-6">
      <div className="card w-full max-w-2xl p-5 sm:p-7">
        <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <TermsText />
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-brand"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Ich habe gelesen, was mit meinen Daten passiert, und bin damit einverstanden.
          </span>
        </label>

        {pushMoeglich && (
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-brand"
              checked={pushAn}
              onChange={(e) => setPushAn(e.target.checked)}
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              Schick mir eine Nachricht aufs Gerät, wenn es etwas Neues gibt. Dein Browser fragt
              gleich noch einmal nach. Du kannst das später jederzeit im Profil ändern.
            </span>
          </label>
        )}

        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-[13px] text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
          Gleich danach suchst du dir ein eigenes Passwort aus. Das Startpasswort kennen noch andere,
          deshalb ist der Schritt nicht überspringbar.
        </p>

        {err && <div className="mt-3 text-sm font-medium text-red-500">{err}</div>}

        <button className="btn-primary mt-4" disabled={!checked || busy} onClick={accept}>
          {busy ? "…" : "Passt, weiter"}
        </button>
        <button
          className="mt-3 w-full text-center text-sm font-semibold text-slate-400"
          onClick={() => supabase!.auth.signOut()}
        >
          Nein, lieber abmelden
        </button>
      </div>
    </div>
  );
}
