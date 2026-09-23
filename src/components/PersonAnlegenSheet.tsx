import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { HY } from "../lib/types";
import { Sheet } from "./Sheet";

/**
 * Nur für den Admin: eine neue Person anlegen – Eintrag in der Liste und Login
 * in einem Schritt. Das Konto entsteht auf dem Server (Edge Function
 * "person-anlegen"), der geheime Schlüssel verlässt ihn nie.
 *
 * Das Startpasswort wird genau EINMAL angezeigt und nirgends gespeichert.
 * Beim ersten Login muss die Person es ändern.
 */
export function PersonAnlegenSheet({ open, onClose, onFertig }: { open: boolean; onClose: () => void; onFertig: () => void }) {
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [ab, setAb] = useState<string>("Q1.1");
  const [rolle, setRolle] = useState("schueler");
  const [mitEltern, setMitEltern] = useState(true);
  const [pw, setPw] = useState("");
  const [elternPw, setElternPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const [doppelt, setDoppelt] = useState(false);
  const [ergebnis, setErgebnis] = useState<{
    username: string;
    passwort: string;
    name: string;
    eltern: { username: string; passwort: string } | null;
    elternFehler: string;
  } | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVorname("");
    setNachname("");
    setPw("");
    setElternPw("");
    setFehler("");
    setDoppelt(false);
    setErgebnis(null);
    setKopiert(false);
  }, [open]);

  async function anlegen(trotzdem = false) {
    setFehler("");
    if (!vorname.trim() || !nachname.trim()) return setFehler("Bitte Vor- und Nachnamen eingeben.");
    if (pw.trim().length < 8) return setFehler("Passwort für den Schülerzugang: mindestens 8 Zeichen.");
    if (mitEltern && elternPw.trim().length < 8) return setFehler("Passwort für den Elternzugang: mindestens 8 Zeichen.");
    if (!hasSupabase) return setFehler("Ohne Datenbank geht das nicht.");
    setBusy(true);
    const { data, error } = await supabase!.functions.invoke("person-anlegen", {
      body: { vorname: vorname.trim(), nachname: nachname.trim(), beigetreten_ab: ab, rolle, trotzdem, mit_eltern: mitEltern, passwort: pw.trim(), eltern_passwort: mitEltern ? elternPw.trim() : "" },
    });
    setBusy(false);
    if (error) {
      // Die Function schickt bei Fehlern eine Erklärung mit
      let text = error.message;
      let istDoppelt = false;
      try {
        const k = await (error as { context?: Response }).context?.json();
        if (k?.error) text = k.error;
        istDoppelt = Boolean(k?.doppelt);
      } catch {
        /* keine Erklärung mitgeschickt */
      }
      setDoppelt(istDoppelt);
      return setFehler(text);
    }
    setErgebnis({
      username: data.username,
      passwort: data.passwort,
      name: `${vorname.trim()} ${nachname.trim()}`,
      eltern: data.eltern ?? null,
      elternFehler: data.elternFehler || "",
    });
    onFertig();
  }

  const zugang = ergebnis
    ? `${ergebnis.name}\nNutzername: ${ergebnis.username}\nStartpasswort: ${ergebnis.passwort}` +
      (ergebnis.eltern
        ? `\n\nElternzugang\nNutzername: ${ergebnis.eltern.username}\nStartpasswort: ${ergebnis.eltern.passwort}`
        : "")
    : "";

  return (
    <Sheet open={open} onClose={onClose}>
      {!ergebnis ? (
        <>
          <h2 className="text-xl font-extrabold">Person hinzufügen</h2>
          <p className="text-[12px] text-tinte-leise">
            Legt den Eintrag in der Liste und den Login an. Das Startpasswort legst du selbst fest.
          </p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <div className="min-w-0">
              <label className="block text-[12px] font-semibold text-tinte-leise">Vorname</label>
              <input className="field mt-1" value={vorname} autoFocus onChange={(e) => setVorname(e.target.value)} />
            </div>
            <div className="min-w-0">
              <label className="block text-[12px] font-semibold text-tinte-leise">Nachname</label>
              <input className="field mt-1" value={nachname} onChange={(e) => setNachname(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <div className="min-w-0">
              <label className="block text-[12px] font-semibold text-tinte-leise">Dabei ab</label>
              <select className="field mt-1" value={ab} onChange={(e) => setAb(e.target.value)}>
                {HY.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-[12px] font-semibold text-tinte-leise">Rolle</label>
              <select className="field mt-1" value={rolle} onChange={(e) => setRolle(e.target.value)}>
                <option value="schueler">Schüler*in</option>
                <option value="stufenteam">Stufenteam</option>
                <option value="kassenwart">Kassenwart</option>
              </select>
            </div>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-tinte-matt dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={mitEltern}
              onChange={(e) => setMitEltern(e.target.checked)}
            />
            Elternzugang gleich mit anlegen
          </label>
          <PwFeld label="Startpasswort Schülerzugang" wert={pw} setzen={setPw} />
          {mitEltern && <PwFeld label="Startpasswort Elternzugang" wert={elternPw} setzen={setElternPw} />}
          {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
          {doppelt ? (
            <button disabled={busy} onClick={() => void anlegen(true)} className="btn-primary mt-4 disabled:opacity-50">
              {busy ? "…" : "Trotzdem neu anlegen"}
            </button>
          ) : (
            <button disabled={busy} onClick={() => void anlegen()} className="btn-primary mt-4 disabled:opacity-50">
              {busy ? "Wird angelegt …" : "Anlegen"}
            </button>
          )}
        </>
      ) : (
        <>
          <h2 className="text-xl font-extrabold">✓ {ergebnis.name} ist angelegt</h2>
          <p className="mt-1 text-[13px] text-tinte-matt dark:text-slate-300">
            Gib diese Zugangsdaten persönlich weiter. Das Passwort wird <b>nur jetzt</b> angezeigt und muss beim ersten
            Login geändert werden.
          </p>
          <div className="mt-3 grid gap-1 rounded-xl bg-papier-matt p-3 font-mono text-[15px] dark:bg-slate-800">
            <div>
              <span className="text-tinte-leise">Nutzername </span>
              <b className="select-all">{ergebnis.username}</b>
            </div>
            <div>
              <span className="text-tinte-leise">Passwort </span>
              <b className="select-all">{ergebnis.passwort}</b>
            </div>
          </div>
          {ergebnis.eltern && (
            <>
              <div className="mt-3 text-[12px] font-bold uppercase tracking-wide text-tinte-leise">Elternzugang</div>
              <div className="mt-1 grid gap-1 rounded-xl bg-papier-matt p-3 font-mono text-[15px] dark:bg-slate-800">
                <div>
                  <span className="text-tinte-leise">Nutzername </span>
                  <b className="select-all">{ergebnis.eltern.username}</b>
                </div>
                <div>
                  <span className="text-tinte-leise">Passwort </span>
                  <b className="select-all">{ergebnis.eltern.passwort}</b>
                </div>
              </div>
            </>
          )}
          {ergebnis.elternFehler && (
            <p className="mt-2 text-[13px] font-semibold text-amber-600">{ergebnis.elternFehler}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(zugang);
                  setKopiert(true);
                } catch {
                  alert(zugang);
                }
              }}
              className="rounded-xl border border-papier-linie py-3 text-[14px] font-bold dark:border-slate-700"
            >
              {kopiert ? "✓ Kopiert" : "Kopieren"}
            </button>
            <button onClick={onClose} className="btn-primary">
              Fertig
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** 8 Zeichen ohne Verwechsler (0/O, 1/l/I) – nur ein Vorschlag zum Übernehmen. */
function vorschlag(): string {
  const z = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => z[x % z.length]).join("");
}

function PwFeld({ label, wert, setzen }: { label: string; wert: string; setzen: (v: string) => void }) {
  return (
    <div className="mt-3">
      <label className="block text-[12px] font-semibold text-tinte-leise">{label}</label>
      <div className="mt-1 flex gap-2">
        <input
          className="field min-w-0 flex-1 font-mono"
          placeholder="mindestens 8 Zeichen"
          value={wert}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setzen(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setzen(vorschlag())}
          className="shrink-0 rounded-xl border border-papier-linie px-3 text-[13px] font-bold text-tinte-matt dark:border-slate-700 dark:text-slate-300"
          title="Zufälliges Passwort vorschlagen"
        >
          🎲 Vorschlag
        </button>
      </div>
    </div>
  );
}
