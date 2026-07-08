import { useEffect, useState, type ReactNode } from "react";
import { ACCESS_CODE, hasSupabase, supabase, usernameToEmail } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

export function AuthGate({ children }: { children: ReactNode }) {
  // Ohne Supabase-Konfiguration: lokaler Modus, kein Login nötig.
  if (!hasSupabase) return <>{children}</>;

  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) return <Splash />;
  if (!session) return <LoginForm />;
  return <>{children}</>;
}

function Splash() {
  return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <div className="animate-pulse text-lg font-semibold">Stufenkasse …</div>
    </div>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!username.trim() || !password) {
      setErr("Benutzername und Passwort ausfüllen.");
      return;
    }
    setBusy(true);
    const email = usernameToEmail(username);
    try {
      if (mode === "register") {
        if (ACCESS_CODE && code.trim() !== ACCESS_CODE) {
          setErr("Falscher Zugangscode.");
          return;
        }
        const { error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      setErr(e?.message === "Invalid login credentials" ? "Benutzername oder Passwort falsch." : e?.message || "Fehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1 text-center text-2xl font-bold">Stufenkasse</div>
        <div className="mb-6 text-center text-sm text-slate-500">
          {mode === "login" ? "Anmelden" : "Konto erstellen"}
        </div>

        <input
          className="field mb-3"
          placeholder="Benutzername"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field mb-3"
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {mode === "register" && ACCESS_CODE && (
          <input
            className="field mb-3"
            placeholder="Zugangscode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        {err && <div className="mb-3 text-sm font-medium text-red-500">{err}</div>}

        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "…" : mode === "login" ? "Anmelden" : "Registrieren"}
        </button>

        <button
          className="mt-4 w-full text-center text-sm font-semibold text-brand"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setErr("");
          }}
        >
          {mode === "login" ? "Neu hier? Konto erstellen" : "Schon ein Konto? Anmelden"}
        </button>
      </div>
    </div>
  );
}
