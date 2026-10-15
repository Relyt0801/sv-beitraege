import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { SELECTABLE_COMMITTEES, committeeLabel } from "../lib/committees";
import { passwortProblem, passwortStaerke } from "../lib/passwort";
import { fehlerText, istNetzfehler, OFFLINE_TEXT } from "../lib/netz";
import { AnmeldeKopf, AnmeldeRahmen, FormFehler, LadeKnopf, Splash, ZELLEN_FELD } from "./AuthGate";

// Das Vertagen gilt pro Konto und nicht ewig.
//
// Vorher stand hier ein einziger Schluessel fuer den ganzen Browser. Wer sich
// auf dem Familien-Laptop nach jemandem anmeldete, der "spaeter" getippt
// hatte, wurde nie wieder nach seinem Komitee gefragt. Und wer einmal
// vertagte, bekam die Frage nie wieder – auch Monate spaeter nicht.
const SKIP_PREFIX = "sv:komitee-spaeter:";
const SKIP_TAGE = 14;

/**
 * Erzwingt nach dem Login zwei Dinge:
 * 1. Passwortwechsel, solange noch das Startpasswort läuft
 * 2. Auswahl des eigenen Komitees (einmalig, danach nur noch über das Stufenteam)
 */
export function PasswordGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "change" | "komitee" | "ok">(hasSupabase ? "loading" : "ok");

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
        .select("must_change_password, role")
        .eq("user_id", uid)
        .maybeSingle();
      if (!alive) return;
      // Elternzugaenge gehoeren in kein Komitee – die Frage waere fuer sie sinnlos.
      const eltern = (data as { role?: string } | null)?.role === "eltern";
      if (data?.must_change_password) {
        setState("change");
        return;
      }
      setState(!eltern && (await braucheKomitee(uid)) ? "komitee" : "ok");
    };
    // Scheitert die Prüfung (z. B. kein Netz), nicht ewig den Ladebildschirm
    // zeigen: weiter in die App – dort erklärt das Offline-Band, was los ist.
    const sicherPruefen = () =>
      check().catch(() => {
        if (alive) setState("ok");
      });
    void sicherPruefen();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        setState("loading");
        void sicherPruefen();
      }
      if (event === "SIGNED_OUT") setState("ok");
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") return <Splash />;
  if (state === "change")
    return (
      <ChangeForm
        onDone={async () => {
          try {
            const { data: s } = await supabase!.auth.getSession();
            const uid = s.session?.user.id;
            if (!uid) {
              setState("ok");
              return;
            }
            const { data: p } = await supabase!.from("profiles").select("role").eq("user_id", uid).maybeSingle();
            const eltern = (p as { role?: string } | null)?.role === "eltern";
            setState(!eltern && (await braucheKomitee(uid)) ? "komitee" : "ok");
          } catch {
            setState("ok");
          }
        }}
      />
    );
  if (state === "komitee") return <KomiteeForm onDone={() => setState("ok")} />;
  return <>{children}</>;
}

/** Ist der Nutzer noch in keinem Komitee und hat es auch nicht vertagt? */
async function braucheKomitee(uid: string): Promise<boolean> {
  if (vertagtBis(uid) > Date.now()) return false;
  const { data, error } = await supabase!.from("tag_members").select("tag").eq("user_id", uid).limit(1);
  if (error) return false; // Tabelle/Recht fehlt -> nicht blockieren
  return !data || data.length === 0;
}

function vertagtBis(uid: string): number {
  try {
    return Number(localStorage.getItem(SKIP_PREFIX + uid) || 0);
  } catch {
    return 0; // privates Fenster o. Ae. – dann eben fragen
  }
}

function vertagen(uid: string) {
  try {
    localStorage.setItem(SKIP_PREFIX + uid, String(Date.now() + SKIP_TAGE * 864e5));
  } catch {
    /* nicht schlimm: dann kommt die Frage beim naechsten Mal wieder */
  }
}

/**
 * Komitee wählen – im Apple-Look als Auswahlliste mit Häkchen (wie die
 * Auswahl in den iOS-Einstellungen), statt einzelner umrandeter Kästen.
 */
export function KomiteeForm({ onDone }: { onDone: () => void }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [netz, setNetz] = useState(false);

  async function speichern() {
    if (!sel || busy) return;
    setErr("");
    setNetz(false);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(OFFLINE_TEXT);
      setNetz(true);
      return;
    }
    setBusy(true);
    try {
      if (!hasSupabase) {
        await new Promise((r) => setTimeout(r, 900)); // Demo-Vorschau
        onDone();
        return;
      }
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) {
        setErr("Die Anmeldung ist abgelaufen. Bitte neu anmelden.");
        return;
      }
      const { error } = await supabase!.from("tag_members").insert({ tag: sel, user_id: uid });
      if (error) {
        setNetz(istNetzfehler(error));
        setErr(fehlerText("Das hat nicht geklappt: " + error.message));
        return;
      }
      onDone();
    } catch (e) {
      setNetz(istNetzfehler(e));
      setErr(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnmeldeRahmen>
      <AnmeldeKopf symbol={false} titel="Dein Komitee" unter="Wähle aus, wo du mitarbeitest. Du kommst damit automatisch in den passenden Chat." />

      <div className="gruppe-zellen" role="radiogroup" aria-label="Komitee">
        {SELECTABLE_COMMITTEES.map((c) => {
          const an = sel === c.slug;
          return (
            <button
              key={c.slug}
              type="button"
              role="radio"
              aria-checked={an}
              disabled={busy}
              onClick={() => setSel(c.slug)}
              className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[16px] transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <span className="min-w-0 flex-1">{c.label}</span>
              {/* Häkchen rechts in Systemblau – wie bei Auswahllisten in iOS */}
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`shrink-0 text-brand transition duration-200 ease-ios ${an ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">
        Ändern kann das später nur das Stufenteam. Aufsichtsrat wird ausschließlich vom Stufenteam vergeben.
      </p>

      {err ? <FormFehler text={err} netz={netz} /> : <div className="h-6" />}

      <LadeKnopf
        busy={busy}
        disabled={!sel}
        onClick={() => void speichern()}
        text={sel ? `„${committeeLabel(sel)}“ übernehmen` : "Komitee wählen"}
        busyText="Speichern …"
      />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          try {
            const { data: s } = hasSupabase ? await supabase!.auth.getSession() : { data: { session: null } };
            const uid = s.session?.user.id;
            if (uid) vertagen(uid);
          } catch {
            /* ohne Sitzung: dann eben beim nächsten Mal wieder fragen */
          }
          onDone();
        }}
        className="mt-2 flex min-h-[2.75rem] w-full items-center justify-center rounded-full text-[17px] text-brand transition active:opacity-50 disabled:opacity-40"
      >
        Ich weiß es noch nicht
      </button>
    </AnmeldeRahmen>
  );
}

/**
 * Startpasswort ersetzen. Wie beim Anmelden: Knopf mit Rädchen und
 * „Speichern …“, gesperrt während es läuft; Netzfehler auf Deutsch.
 *
 * Zwei Schritte gehen ans Netz: erst das Passwort (Supabase Auth), dann der
 * Vermerk must_change_password = false im Profil. Klappt nur der zweite
 * nicht, ist das Passwort schon geändert – dann merkt sich das Formular das
 * und versucht beim nächsten Tippen NUR den Vermerk (ein zweites Setzen
 * desselben Passworts würde Supabase sonst ablehnen).
 */
export function ChangeForm({ onDone }: { onDone: () => void }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [netz, setNetz] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nutzer, setNutzer] = useState("");
  const [pwSchonGesetzt, setPwSchonGesetzt] = useState(false);

  // Den eigenen Nutzernamen holen, damit er nicht als Passwort durchgeht.
  useEffect(() => {
    if (!hasSupabase) return;
    void (async () => {
      try {
        const { data: s } = await supabase!.auth.getSession();
        const uid = s.session?.user.id;
        if (!uid) return;
        const { data } = await supabase!.from("profiles").select("username").eq("user_id", uid).maybeSingle();
        setNutzer(((data as { username?: string } | null)?.username) || "");
      } catch {
        /* ohne Netz: Prüfung gegen den Namen entfällt, der Rest greift */
      }
    })();
  }, []);

  const staerke = passwortStaerke(pw1);

  async function submit() {
    if (busy) return;
    setErr("");
    setNetz(false);
    if (!pwSchonGesetzt) {
      const problem = passwortProblem(pw1, nutzer);
      if (problem) {
        setErr(problem);
        return;
      }
      if (pw1 !== pw2) {
        setErr("Die Passwörter stimmen nicht überein.");
        return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(OFFLINE_TEXT);
      setNetz(true);
      return;
    }
    setBusy(true);
    try {
      if (!hasSupabase) {
        await new Promise((r) => setTimeout(r, 1200)); // Demo-Vorschau
        throw new Error("Demo-Modus: Ohne Datenbank wird nichts gespeichert.");
      }
      if (!pwSchonGesetzt) {
        const { error } = await supabase!.auth.updateUser({ password: pw1 });
        if (error) {
          setNetz(istNetzfehler(error));
          setErr(
            /new password should be different/i.test(error.message)
              ? "Das neue Passwort muss sich vom Startpasswort unterscheiden."
              : fehlerText(error),
          );
          return;
        }
        setPwSchonGesetzt(true);
      }
      const { data: s } = await supabase!.auth.getSession();
      if (s.session) {
        const { error: e2 } = await supabase!.from("profiles").update({ must_change_password: false }).eq("user_id", s.session.user.id);
        if (e2) {
          setNetz(istNetzfehler(e2));
          setErr(fehlerText("Dein Passwort ist geändert, nur der Vermerk fehlt noch: " + e2.message) + " Tipp einfach nochmal auf „Weiter“.");
          return;
        }
      }
      onDone();
    } catch (e) {
      setNetz(istNetzfehler(e));
      setErr(fehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnmeldeRahmen>
      <AnmeldeKopf
        titel="Neues Passwort"
        unter="Du nutzt noch dein Startpasswort. Leg jetzt ein eigenes fest – danach geht es weiter."
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* Verstecktes Nutzerfeld: Passwortmanager wissen so, zu welchem
            Konto das neue Passwort gehört, und speichern es richtig. */}
        <input type="text" name="username" autoComplete="username" value={nutzer} readOnly hidden />
        <div className="gruppe-zellen shadow-[0_0_0_0.5px_rgba(0,0,0,0.05)] dark:shadow-none">
          <label className="block">
            <span className="sr-only">Neues Passwort</span>
            <input
              className={ZELLEN_FELD}
              type="password"
              placeholder="Neues Passwort"
              autoComplete="new-password"
              autoFocus
              disabled={busy || pwSchonGesetzt}
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="sr-only">Passwort bestätigen</span>
            <input
              className={ZELLEN_FELD}
              type="password"
              placeholder="Passwort bestätigen"
              autoComplete="new-password"
              disabled={busy || pwSchonGesetzt}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </label>
        </div>

        {/* Kleine Rückmeldung, solange getippt wird */}
        <div className="mt-2 flex h-4 items-center gap-2 px-4">
          {pw1.length > 0 && (
            <>
              <div className="flex h-1 flex-1 gap-1">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className={`h-full flex-1 rounded-full transition-colors duration-300 ${
                      staerke.stufe >= n
                        ? staerke.stufe === 1
                          ? "bg-[#FF9500]"
                          : staerke.stufe === 2
                            ? "bg-[#FFCC00]"
                            : "bg-[#34C759]"
                        : "bg-[rgb(118_118_128/0.16)] dark:bg-[rgb(118_118_128/0.32)]"
                    }`}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">{staerke.text}</span>
            </>
          )}
        </div>
        <p className="mt-1 px-4 text-[13px] leading-snug text-tinte-leise">
          Mindestens 8 Zeichen. Nimm nichts, was du anderswo schon benutzt.
        </p>

        {err ? <FormFehler text={err} netz={netz} /> : <div className="h-6" />}

        <LadeKnopf type="submit" busy={busy} text={pwSchonGesetzt ? "Weiter" : "Passwort speichern"} busyText="Speichern …" />
      </form>
    </AnmeldeRahmen>
  );
}
