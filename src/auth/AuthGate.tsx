import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase, usernameToEmail } from "../lib/supabase";
import { pushConfigured, pushSupported } from "../lib/push";
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
    <div className="flex h-full items-center justify-center text-tinte-leise">
      <div className="animate-pulse text-lg font-semibold">Stufenkasse …</div>
    </div>
  );
}

/**
 * Anmeldung. Bewusst OHNE Selbstregistrierung.
 *
 * Frueher konnte sich hier jeder mit einem Zugangscode ein Konto anlegen. Der
 * Code steckte aber in der ausgelieferten App und war damit fuer jeden lesbar,
 * der die Seite oeffnet – also keine echte Huerde. Konten legt jetzt
 * ausschliesslich das Stufenteam an.
 */
function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wantPush, setWantPush] = useState(true);
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
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Wunsch merken, das Push-Abo wird nach dem Anmelden angelegt.
      if (wantPush && pushSupported && pushConfigured()) localStorage.setItem("sv:push-optin", "1");
      else localStorage.removeItem("sv:push-optin");
    } catch (e: any) {
      setErr(e?.message === "Invalid login credentials" ? "Benutzername oder Passwort falsch." : e?.message || "Fehler.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      {/* Ein echtes <form> mit Submit. Browser erkennen ein Anmeldeformular
          daran – ohne das fragt der Passwortmanager an unpassenden Stellen
          nach und zeigt Hinweise, die nichts mit dieser App zu tun haben. */}
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-1 text-center text-2xl font-bold">Stufenkasse</div>
        <div className="mb-6 text-center text-sm text-tinte-matt">
          Anmelden
        </div>

        {/* Ein Anmeldeformular, wie Browser es erwarten: name und autoComplete
            gesetzt. Ohne das raten Chrome und Safari, worum es geht, bieten an
            falschen Stellen Passwoerter an und melden sich mit Hinweisen, die
            nichts mit dieser App zu tun haben. */}
        <input
          className="field mb-3"
          name="username"
          autoComplete="username"
          placeholder="Benutzername"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="field mb-3"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {pushSupported && pushConfigured() && (
          <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-papier-matt p-3 dark:bg-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand"
              checked={wantPush}
              onChange={(e) => setWantPush(e.target.checked)}
            />
            <span className="text-sm text-tinte-matt dark:text-slate-300">
              🔔 Benachrichtigungen aktivieren – bitte anlassen, damit du <b>Abstimmungen &amp; Mitteilungen</b> mitbekommst.
            </span>
          </label>
        )}

        {err && <div className="mb-3 text-sm font-medium text-red-500">{err}</div>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "…" : "Anmelden"}
        </button>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-tinte-leise">
          Zugangsdaten bekommst du vom Stufenteam.
          <br />
          Passwort vergessen? Meld dich dort, sie setzen es zurück.
        </p>
      </form>
    </div>
  );
}
