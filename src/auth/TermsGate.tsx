import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { enablePush } from "../lib/push";
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    // Erst JETZT (nach der Einwilligung) das beim Login gewünschte Push-Abo anlegen –
    // der Klick auf "Zustimmen" liefert zugleich die nötige Nutzergeste für den Browser.
    if (localStorage.getItem("sv:push-optin") === "1") {
      localStorage.removeItem("sv:push-optin");
      void enablePush().then((r) => {
        if (!r.ok) console.warn("[push] Aktivierung nach Zustimmung fehlgeschlagen:", r.error);
      });
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
            Ich habe die Nutzungsbedingungen &amp; Datenschutzhinweise gelesen und bin mit der
            beschriebenen Verarbeitung meiner Daten einverstanden.
          </span>
        </label>

        {err && <div className="mt-3 text-sm font-medium text-red-500">{err}</div>}

        <button className="btn-primary mt-4" disabled={!checked || busy} onClick={accept}>
          {busy ? "…" : "Zustimmen & weiter"}
        </button>
        <button
          className="mt-3 w-full text-center text-sm font-semibold text-slate-400"
          onClick={() => supabase!.auth.signOut()}
        >
          Ablehnen &amp; abmelden
        </button>
      </div>
    </div>
  );
}
