import { useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { SELECTABLE_COMMITTEES, committeeLabel } from "../lib/committees";

const SKIP_KEY = "sv:komitee-spaeter";

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
        .select("must_change_password")
        .eq("user_id", uid)
        .maybeSingle();
      if (!alive) return;
      if (data?.must_change_password) {
        setState("change");
        return;
      }
      setState((await braucheKomitee(uid)) ? "komitee" : "ok");
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
  if (state === "change")
    return (
      <ChangeForm
        onDone={async () => {
          const { data: s } = await supabase!.auth.getSession();
          const uid = s.session?.user.id;
          setState(uid && (await braucheKomitee(uid)) ? "komitee" : "ok");
        }}
      />
    );
  if (state === "komitee") return <KomiteeForm onDone={() => setState("ok")} />;
  return <>{children}</>;
}

/** Ist der Nutzer noch in keinem Komitee und hat es auch nicht vertagt? */
async function braucheKomitee(uid: string): Promise<boolean> {
  if (localStorage.getItem(SKIP_KEY) === "1") return false;
  const { data, error } = await supabase!.from("tag_members").select("tag").eq("user_id", uid).limit(1);
  if (error) return false; // Tabelle/Recht fehlt -> nicht blockieren
  return !data || data.length === 0;
}

function KomiteeForm({ onDone }: { onDone: () => void }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function speichern() {
    if (!sel) return;
    setBusy(true);
    setErr("");
    const { data: s } = await supabase!.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return;
    const { error } = await supabase!.from("tag_members").insert({ tag: sel, user_id: uid });
    setBusy(false);
    if (error) {
      setErr("Das hat nicht geklappt: " + error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1 text-center text-2xl font-bold">Dein Komitee</div>
        <p className="mb-5 text-center text-sm text-slate-500">
          Wähle aus, wo du mitarbeitest. Du kommst damit automatisch in den passenden Chat.
        </p>

        <div className="mb-4 grid gap-2">
          {SELECTABLE_COMMITTEES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setSel(c.slug)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] font-semibold transition ${
                sel === c.slug
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] text-white ${
                  sel === c.slug ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"
                }`}
              >
                {sel === c.slug ? "✓" : ""}
              </span>
              {c.label}
            </button>
          ))}
        </div>

        {err && <div className="mb-3 text-sm font-medium text-red-500">{err}</div>}

        <button className="btn-primary" disabled={!sel || busy} onClick={speichern}>
          {busy ? "…" : sel ? `„${committeeLabel(sel)}" übernehmen` : "Komitee wählen"}
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          Das kannst du später nicht selbst ändern – nur das Stufenteam.
          <br />
          Aufsichtsrat wird ausschließlich vom Stufenteam vergeben.
        </p>
        <button
          onClick={() => {
            localStorage.setItem(SKIP_KEY, "1");
            onDone();
          }}
          className="mt-3 w-full text-center text-sm font-semibold text-slate-400"
        >
          Ich weiß es noch nicht
        </button>
      </div>
    </div>
  );
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
