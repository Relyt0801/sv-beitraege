import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase, usernameToEmail } from "../lib/supabase";
import { pushConfigured, pushSupported } from "../lib/push";
import { RechtLinks } from "../components/Rechtliches";
import { InstallKarte, InstallOverlay } from "../components/InstallHinweis";
import { Schalter } from "../components/Schalter";
import { OfflineBand } from "../components/Verbindung";
import { fehlerText, istNetzfehler, OFFLINE_TEXT } from "../lib/netz";
import { ChangeForm, KomiteeForm } from "./PasswordGate";
import type { Session } from "@supabase/supabase-js";

/**
 * Vorschau der Anmelde-Bildschirme im Demo-Modus (`npm run demo`):
 * `?anmelden=1` zeigt das Anmeldeformular, `?anmelden=passwort` das
 * Startpasswort-Formular, `?anmelden=komitee` die Komitee-Wahl. Ohne
 * Datenbank gäbe es sie sonst nirgends zu sehen. Im fertigen Build ist MODE
 * immer "production" – dort greift das nie.
 */
const VORSCHAU =
  import.meta.env.MODE === "demo" && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("anmelden")
    : null;

export function AuthGate({ children }: { children: ReactNode }) {
  // Das Offline-Band steht in JEDEM Zweig – auch vor dem Login, wo „Failed to
  // fetch“ bisher am meisten verwirrt hat (components/Verbindung.tsx).
  if (VORSCHAU)
    return (
      <>
        <OfflineBand />
        {VORSCHAU === "passwort" ? (
          <ChangeForm onDone={() => undefined} />
        ) : VORSCHAU === "komitee" ? (
          <KomiteeForm onDone={() => undefined} />
        ) : (
          <LoginForm />
        )}
      </>
    );
  // Ohne Supabase-Konfiguration: lokaler Modus, kein Login nötig.
  if (!hasSupabase)
    return (
      <>
        <OfflineBand />
        {children}
      </>
    );
  return (
    <>
      <OfflineBand />
      <MitSitzung>{children}</MitSitzung>
    </>
  );
}

function MitSitzung({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase!.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      // Hängt die Sitzung (z. B. Token-Erneuerung ohne Netz), lieber das
      // Anmeldeformular zeigen als für immer den Ladebildschirm.
      .catch(() => setSession(null))
      .finally(() => setChecked(true));
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) return <Splash />;
  if (!session) return <LoginForm />;
  return <>{children}</>;
}

/** Ladebildschirm: nur das App-Symbol, ruhig – wie beim Start einer iOS-App. */
export function Splash() {
  return (
    <div className="flex h-full min-h-dvh items-center justify-center">
      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt="Stufenkasse"
        width={72}
        height={72}
        className="h-[72px] w-[72px] animate-pulse rounded-[22.5%] shadow-[0_10px_30px_-10px_rgba(60,60,180,0.55)]"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Bausteine, die auch PasswordGate (Startpasswort, Komitee) benutzt
 * ------------------------------------------------------------------------- */

/**
 * Rahmen der Anmelde-Bildschirme: grauer Grund, Inhalt oben mittig (wie die
 * Anmeldung in den iOS-Einstellungen), am Rechner mittig im Fenster.
 */
export function AnmeldeRahmen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:justify-center sm:pt-10">
      <div className="w-full max-w-sm animate-aufsteigen">{children}</div>
    </div>
  );
}

/** App-Symbol, großer Titel, ein erklärender Satz. */
export function AnmeldeKopf({ titel, unter, symbol = true }: { titel: string; unter: ReactNode; symbol?: boolean }) {
  return (
    <div className="mb-7 flex flex-col items-center text-center">
      {symbol && (
        <img
          src={`${import.meta.env.BASE_URL}icon-192.png`}
          alt=""
          width={76}
          height={76}
          className="mb-4 h-[76px] w-[76px] rounded-[22.5%] shadow-[0_12px_32px_-12px_rgba(60,60,180,0.6),0_0_0_0.5px_rgba(0,0,0,0.06)]"
        />
      )}
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em]">{titel}</h1>
      <p className="mt-1.5 max-w-[19rem] text-[15px] leading-snug text-tinte-matt dark:text-slate-300">{unter}</p>
    </div>
  );
}

/** Eingabefeld innerhalb einer Zellen-Gruppe (ohne eigenen Rahmen). */
export const ZELLEN_FELD =
  "block w-full min-w-0 bg-transparent px-4 py-[13px] text-[17px] text-tinte outline-none placeholder:text-tinte-leise dark:text-slate-100";

/** Drehendes Rädchen für Knöpfe, die gerade arbeiten. */
export function Kreisel({ hell = true }: { hell?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 ${
        hell ? "border-white/35 border-t-white" : "border-tinte-leise/30 border-t-tinte-leise"
      }`}
    />
  );
}

/**
 * Hauptknopf mit Lade-Zustand: Während `busy` dreht sich das Rädchen, der
 * Text wechselt (z. B. „Anmelden …“) und der Knopf ist gesperrt – so ist
 * klar, dass etwas passiert, und niemand schickt doppelt ab.
 */
export function LadeKnopf({
  busy,
  text,
  busyText,
  disabled,
  onClick,
  type = "button",
}: {
  busy: boolean;
  text: ReactNode;
  busyText: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button className="btn-primary gap-2.5" type={type} disabled={busy || disabled} aria-busy={busy} onClick={onClick}>
      {busy ? (
        <>
          <Kreisel />
          <span>{busyText}</span>
        </>
      ) : (
        text
      )}
    </button>
  );
}

/**
 * Fehlerzeile unter dem Formular. Verbindungsprobleme bekommen das
 * WLAN-Zeichen und eine ruhige Farbe – das ist kein Fehler der Person.
 */
export function FormFehler({ text, netz }: { text: string; netz?: boolean }) {
  if (!text) return null;
  return (
    <div role="alert" className="mb-4 mt-3 flex animate-aufsteigen items-start gap-2.5 px-4">
      {netz ? (
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mt-[1px] shrink-0 text-[#FF9500]">
          <path d="M2 8.8a15 15 0 0 1 20 0" />
          <path d="M5.5 12.4a10 10 0 0 1 13 0" />
          <path d="M9 16a5 5 0 0 1 6 0" />
          <path d="M3 3l18 18" />
        </svg>
      ) : (
        <span aria-hidden className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-[12px] font-bold leading-none text-white dark:bg-[#FF453A]">
          !
        </span>
      )}
      <p className={`text-[14px] leading-snug ${netz ? "text-tinte-matt dark:text-slate-300" : "font-medium text-[#D70015] dark:text-[#FF6961]"}`}>{text}</p>
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
 *
 * Update 1.4 (Apple-Look + verständliche Fehler):
 *   - Benutzername und Passwort als eine Zellen-Gruppe wie in iOS
 *   - Knopf zeigt „Anmelden …“ mit Rädchen und ist so lange gesperrt
 *   - Ohne Netz kommt kein „Failed to fetch“ mehr, sondern „Du bist offline“
 *     bzw. „Keine Verbindung zum Server“ (lib/netz.ts)
 */
function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wantPush, setWantPush] = useState(true);
  const [err, setErr] = useState("");
  const [netzFehler, setNetzFehler] = useState(false);
  const [busy, setBusy] = useState(false);
  const pushZeigen = pushSupported && pushConfigured();

  async function submit() {
    if (busy) return;
    setErr("");
    setNetzFehler(false);
    // Die Frage nach Benachrichtigungen MUSS direkt aus dem Tippen kommen –
    // nach dem Warten auf die Anmeldung lehnen iPhone und Firefox sie still ab.
    if (wantPush && pushSupported && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        void Notification.requestPermission();
      } catch {
        /* alter Browser – dann eben über die Karte in der App */
      }
    }
    if (!username.trim() || !password) {
      setErr("Benutzername und Passwort ausfüllen.");
      return;
    }
    // Ohne Netz gar nicht erst losschicken – die Antwort steht ja fest.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(OFFLINE_TEXT);
      setNetzFehler(true);
      return;
    }
    setBusy(true);
    try {
      if (!hasSupabase) {
        // Demo-Vorschau: kurz „arbeiten“, damit der Lade-Zustand zu sehen ist
        await new Promise((r) => setTimeout(r, 1200));
        throw new Error("Demo-Modus: Ohne Datenbank gibt es keine Anmeldung.");
      }
      const email = usernameToEmail(username);
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Wunsch merken, das Push-Abo wird nach dem Anmelden angelegt.
      if (wantPush && pushZeigen) localStorage.setItem("sv:push-optin", "1");
      else localStorage.removeItem("sv:push-optin");
    } catch (e) {
      setNetzFehler(istNetzfehler(e));
      setErr(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnmeldeRahmen>
      {/* Der Hinweis zum Home-Bildschirm gehoert VOR die Anmeldung, nicht
          dahinter. Zwei Gruende: Es ist das Erste, was jemand ueberhaupt zu
          sehen bekommt – und auf iPhone/iPad hat die installierte App einen
          eigenen Speicher. Wer sich erst anmeldet und dann installiert, steht
          in der App wieder vor dem Anmeldeformular. */}
      <div className="mb-6 [&:empty]:hidden">
        <InstallKarte />
      </div>
      <InstallOverlay />

      <AnmeldeKopf titel="Stufenkasse" unter="Melde dich mit den Zugangsdaten an, die du vom Stufenteam bekommen hast." />

      {/* Ein echtes <form> mit Submit. Browser erkennen ein Anmeldeformular
          daran – ohne das fragt der Passwortmanager an unpassenden Stellen
          nach und zeigt Hinweise, die nichts mit dieser App zu tun haben. */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* Ein Anmeldeformular, wie Browser es erwarten: name und autoComplete
            gesetzt. Ohne das raten Chrome und Safari, worum es geht, bieten an
            falschen Stellen Passwoerter an und melden sich mit Hinweisen, die
            nichts mit dieser App zu tun haben. */}
        <div className="gruppe-zellen shadow-[0_0_0_0.5px_rgba(0,0,0,0.05)] dark:shadow-none">
          <label className="block">
            <span className="sr-only">Benutzername</span>
            <input
              className={ZELLEN_FELD}
              name="username"
              autoComplete="username"
              placeholder="Benutzername"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              disabled={busy}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="sr-only">Passwort</span>
            <input
              className={ZELLEN_FELD}
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Passwort"
              enterKeyHint="go"
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        {pushZeigen && (
          <>
            <div className="gruppe-zellen mt-5">
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2">
                <span className="symbol bg-[#FF3B30]">
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.5a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.1V8.5a6 6 0 0 0-6-6zM9.5 18.5a2.5 2.5 0 0 0 5 0z" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 text-[16px]">Mitteilungen</span>
                <Schalter an={wantPush} onChange={setWantPush} label="Mitteilungen aktivieren" />
              </label>
            </div>
            <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">
              Bitte anlassen, damit du Abstimmungen und Mitteilungen mitbekommst.
            </p>
          </>
        )}

        {err ? <FormFehler text={err} netz={netzFehler} /> : <div className="h-6" />}

        <LadeKnopf type="submit" busy={busy} text="Anmelden" busyText="Anmelden …" />

        <p className="mt-5 text-center text-[13px] leading-relaxed text-tinte-leise">
          Passwort vergessen? Meld dich beim Stufenteam –
          <br />
          dort wird es zurückgesetzt.
        </p>

        {/* Pflichtangaben müssen auch ohne Anmeldung erreichbar sein – deshalb
            stehen sie hier und nicht nur im Profil. */}
        <div className="mt-8">
          <RechtLinks klein />
        </div>
      </form>
    </AnmeldeRahmen>
  );
}
