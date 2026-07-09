import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";

/**
 * Erzwingt nach dem Login einen Passwortwechsel, wenn das Konto noch das
 * Startpasswort nutzt (profiles.must_change_password = true).
 */
export function PasswordGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "change" | "ok">(hasSupabase ? "loading" : "ok");

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
        .select("must_change_password")
        .eq("user_id", uid)
        .maybeSingle();
      if (alive) setState(data?.must_change_password ? "change" : "ok");
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
  if (state === "change") return <ChangeForm onDone={() => setState("ok")} />;
  return <>{children}</>;
}

function ChangeForm({ onDone }: { onDone: () => void }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (pw1.length < 6) {
      setErr("Mindestens 6 Zeichen.");
      return;
    }
    if (pw1 !== pw2) {
      setErr("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw1 });
    if (error) {
      setBusy(false);
      setErr(error.message === "New password should be different from the old password."
        ? "Das neue Passwort muss sich vom Startpasswort unterscheiden."
        : error.message);
      return;
    }
    const { data: s } = await supabase!.auth.getSession();
    if (s.session) {
      await supabase!.from("profiles").update({ must_change_password: false }).eq("user_id", s.session.user.id);
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1 text-center text-2xl font-bold">Neues Passwort</div>
        <p className="mb-6 text-center text-sm text-slate-500">
          Du nutzt noch dein Startpasswort. Bitte lege jetzt ein eigenes fest – danach geht's in die App.
        </p>
        <input
          className="field mb-3"
          type="password"
          placeholder="Neues Passwort"
          autoFocus
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
        />
        <input
          className="field mb-3"
          type="password"
          placeholder="Passwort bestätigen"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {err && <div className="mb-3 text-sm font-medium text-red-500">{err}</div>}
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "…" : "Passwort speichern"}
        </button>
      </div>
    </div>
  );
}
