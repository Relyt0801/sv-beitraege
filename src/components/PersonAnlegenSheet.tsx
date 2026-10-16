import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileEingabe, ZeileMitSchalter, ZeileSegmente } from "./Liste";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
import { FussLeiste } from "./FussLeiste";

import { hinweis } from "../lib/melder";
/**
 * Nur für den Admin: eine neue Person anlegen – Eintrag in der Liste und Login
 * in einem Schritt. Das Konto entsteht auf dem Server (Edge Function
 * "person-anlegen"), der geheime Schlüssel verlässt ihn nie.
 *
 * Das Startpasswort wird genau EINMAL angezeigt und nirgends gespeichert.
 * Beim ersten Login muss die Person es ändern.
 *
 * Prüfung Okt. 2026: „Dabei ab“ stand fest auf Q1.1 (in der EF zählten so die
 * EF-Beiträge nicht) und war wie „Rolle“ ein natives Auswahlfeld. Jetzt
 * beginnt „Dabei ab“ beim laufenden Halbjahr, beides sind Segmente wie im
 * Kassen-Blatt, und der Knopf klebt unten (FussLeiste).
 */
const ROLLEN = [
  { key: "schueler", text: "Schüler" },
  { key: "stufenteam", text: "Stufenteam" },
  { key: "kassenwart", text: "Kassenwart" },
] as const;

export function PersonAnlegenSheet({
  open,
  onClose,
  onFertig,
  onNurListe,
}: {
  open: boolean;
  onClose: () => void;
  onFertig: () => void;
  /** Optional (Kasse): stattdessen nur einen Listeneintrag ohne Login anlegen */
  onNurListe?: () => void;
}) {
  const { settings } = useStore();
  const laeuft = settings.aktuelles_halbjahr;
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [ab, setAb] = useState<Halbjahr>(laeuft);
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
    setAb(laeuft);
    setPw("");
    setElternPw("");
    setFehler("");
    setDoppelt(false);
    setErgebnis(null);
    setKopiert(false);
  }, [open, laeuft]);

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
          <SheetKopf titel="Person hinzufügen" unter="Legt den Eintrag in der Liste und den Login an. Das Startpasswort legst du selbst fest." onClose={onClose} />

          {/* Name, Beitritt und Rolle wie in den iOS-Einstellungen – Auswahl als
              Segment, keine nativen Auswahlfelder */}
          <Gruppe titel="Person" className="">
            <ZeileEingabe label="Vorname" value={vorname} onChange={setVorname} placeholder="Pflicht" autoFocus />
            <ZeileEingabe label="Nachname" value={nachname} onChange={setNachname} placeholder="Pflicht" />
          </Gruppe>

          <Gruppe titel="Dabei ab" fuss="Halbjahre davor zählen nicht zum Beitrag.">
            <ZeileSegmente werte={HY} wert={ab} onWahl={setAb} />
          </Gruppe>

          <Gruppe titel="Rolle">
            <div className="px-3 py-2.5">
              <div className="seg" role="radiogroup" aria-label="Rolle">
                {ROLLEN.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={rolle === r.key}
                    onClick={() => setRolle(r.key)}
                    className={`seg-item px-1 ${rolle === r.key ? "seg-aktiv" : ""}`}
                  >
                    {r.text}
                  </button>
                ))}
              </div>
            </div>
          </Gruppe>

          <Gruppe titel="Zugang" fuss="Mindestens 8 Zeichen. „Vorschlag“ erzeugt ein Passwort ohne Verwechsler wie 0/O oder 1/l.">
            <PwZeile label="Passwort Schüler" wert={pw} setzen={setPw} />
            <ZeileMitSchalter label="Elternzugang gleich mit anlegen">
              <Schalter an={mitEltern} onChange={setMitEltern} label="Elternzugang gleich mit anlegen" />
            </ZeileMitSchalter>
            {mitEltern && <PwZeile label="Passwort Eltern" wert={elternPw} setzen={setElternPw} />}
          </Gruppe>

          {onNurListe && (
            <Gruppe fuss="Für jemanden, der die App nicht nutzt – steht nur in der Kassenliste.">
              <Zeile label="Nur Listeneintrag ohne Login" onClick={onNurListe} />
            </Gruppe>
          )}

          <FussLeiste>
            {fehler && <p className="mb-2.5 px-1 text-[13px] font-semibold text-amber-700 dark:text-amber-400">{fehler}</p>}
            {doppelt ? (
              <button disabled={busy} onClick={() => void anlegen(true)} className="btn-primary disabled:opacity-50">
                {busy ? "…" : "Trotzdem neu anlegen"}
              </button>
            ) : (
              <button disabled={busy} onClick={() => void anlegen()} className="btn-primary disabled:opacity-50">
                {busy ? "Wird angelegt …" : "Anlegen"}
              </button>
            )}
          </FussLeiste>
        </>
      ) : (
        <>
          <SheetKopf titel="Person angelegt" unter={ergebnis.name} onClose={onClose} />
          <p className="mb-3 px-1 text-[14px] leading-snug text-tinte-matt dark:text-slate-300">
            Gib diese Zugangsdaten persönlich weiter. Das Passwort wird <b>nur jetzt</b> angezeigt und muss beim ersten
            Login geändert werden.
          </p>
          <Gruppe titel="Schülerzugang" className="">
            <Zeile label="Nutzername">
              <span className="select-all font-mono text-[15px]">{ergebnis.username}</span>
            </Zeile>
            <Zeile label="Passwort">
              <span className="select-all font-mono text-[15px] font-semibold">{ergebnis.passwort}</span>
            </Zeile>
          </Gruppe>
          {ergebnis.eltern && (
            <Gruppe titel="Elternzugang">
              <Zeile label="Nutzername">
                <span className="select-all font-mono text-[15px]">{ergebnis.eltern.username}</span>
              </Zeile>
              <Zeile label="Passwort">
                <span className="select-all font-mono text-[15px] font-semibold">{ergebnis.eltern.passwort}</span>
              </Zeile>
            </Gruppe>
          )}
          {ergebnis.elternFehler && (
            <p className="mt-3 px-4 text-[13px] font-semibold text-amber-700 dark:text-amber-400">{ergebnis.elternFehler}</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(zugang);
                  setKopiert(true);
                } catch {
                  // Kopieren geht nicht (manche Browser): zum Abschreiben zeigen
                  void hinweis(zugang);
                }
              }}
              className="btn-grau"
            >
              {kopiert ? "Kopiert" : "Kopieren"}
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

/**
 * Passwort-Zeile: oben Bezeichnung und „Vorschlag“, darunter das Feld über die
 * volle Breite (so wird auch ein 8-stelliges Passwort nie abgeschnitten).
 */
function PwZeile({ label, wert, setzen }: { label: string; wert: string; setzen: (v: string) => void }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex min-h-[36px] items-center gap-2">
        <label htmlFor={`pw-${label}`} className="min-w-0 flex-1 text-[15px]">
          {label}
        </label>
        <button type="button" onClick={() => setzen(vorschlag())} className="btn-klein-grau shrink-0 !px-3" title="Zufälliges Passwort vorschlagen">
          <Icon name="funke" size={15} />
          Vorschlag
        </button>
      </div>
      <input
        id={`pw-${label}`}
        className="mt-1 w-full bg-transparent font-mono text-[16px] outline-none placeholder:font-sans placeholder:text-tinte-leise"
        placeholder="mindestens 8 Zeichen"
        value={wert}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setzen(e.target.value)}
      />
    </div>
  );
}
