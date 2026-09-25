import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { demoRolle } from "./demo";
import { kalenderIcs, leseIcs, type FremderTermin } from "../../supabase/functions/kalender/ics";
import { heuteKey, plusTage, type Termin } from "./termine";

/**
 * Termine mit dem eigenen Handy-Kalender verbinden – TESTPHASE.
 *
 * Zwei Richtungen, weil eine Web-App den Kalender des Handys nicht direkt
 * lesen oder beschreiben darf (dafür gibt es im Browser keine Schnittstelle):
 *
 *   App → Handy: ein Kalender-Abo (webcal-Link). iPhone, Google und Outlook
 *                holen sich die Termine der Stufe selbst und regelmäßig.
 *   Handy → App: der iCal-Link des eigenen Kalenders (iCloud "Öffentlicher
 *                Kalender", Google "Privatadresse"). Die App liest ihn über die
 *                Function "kalender" und zeigt die Termine grau – nur dieser
 *                Person, nur auf diesem Gerät (der Link bleibt im Browser).
 *
 * Vorerst nur für die Testkonten (siehe DEMO_KONTEN, auch in der Function)
 * und im Demo-Modus.
 */

export const DEMO_KONTEN = ["admin.test", "test.admin"];

let eigenerName: string | null | undefined;

/** Nutzername aus der Anmeldung ("admin.test@sv-beitraege.local" → "admin.test"). */
async function nutzername(): Promise<string | null> {
  if (eigenerName !== undefined) return eigenerName;
  if (!hasSupabase) return (eigenerName = null);
  const { data } = await supabase!.auth.getSession();
  eigenerName = data.session?.user.email?.split("@")[0] ?? null;
  return eigenerName;
}

/** Darf diese Person die Kalender-Verbindung (Testphase) sehen? */
export function useKalenderDemo(): boolean {
  const [ja, setJa] = useState(() => !hasSupabase && demoRolle() !== null);
  useEffect(() => {
    if (!hasSupabase) return;
    let aktiv = true;
    void nutzername().then((n) => aktiv && setJa(Boolean(n && DEMO_KONTEN.includes(n))));
    const { data: sub } = supabase!.auth.onAuthStateChange(() => {
      eigenerName = undefined;
      void nutzername().then((n) => aktiv && setJa(Boolean(n && DEMO_KONTEN.includes(n))));
    });
    return () => {
      aktiv = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return ja;
}

// ---------------------------------------------------------------- App → Handy

export interface AboLink {
  https: string;
  webcal: string;
}

/** Der persönliche Abo-Link. Im Demo-Modus ein Beispiel, das nirgends hinführt. */
export async function aboLink(): Promise<{ link?: AboLink; fehler?: string }> {
  if (!hasSupabase) {
    const https = "https://beispiel.invalid/functions/v1/kalender?u=demo&t=nur-demo";
    return { link: { https, webcal: https.replace(/^https:/, "webcal:") } };
  }
  const { data, error } = await supabase!.functions.invoke("kalender", { body: { aktion: "link" } });
  if (error) return { fehler: await fehlerText(error) };
  return { link: data as AboLink };
}

/** Einen Termin als .ics-Datei – das Handy bietet dann "Zum Kalender hinzufügen" an. */
export function terminAlsDatei(t: Termin): void {
  const ics = kalenderIcs([t], { name: t.titel });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(t.titel || "termin").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 40) || "termin"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------------------------------------------------------------- Handy → App

const LS_LINK = "sv:kalender:fremd-link";
const LS_DATEN = "sv:kalender:fremd-daten";
/** So lange gilt der geladene Stand, danach wird beim nächsten Öffnen neu geholt. */
const FRISCH_MS = 30 * 60 * 1000;

interface Gespeichert {
  zeit: number;
  name: string;
  termine: FremderTermin[];
}

function lesen<T>(k: string): T | null {
  try {
    const roh = localStorage.getItem(k);
    return roh ? (JSON.parse(roh) as T) : null;
  } catch {
    return null;
  }
}
function schreiben(k: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  } catch {
    /* privater Modus – dann eben nur für diese Sitzung */
  }
}

async function fehlerText(error: unknown): Promise<string> {
  try {
    const k = await (error as { context?: Response }).context?.json();
    if (k?.error) return String(k.error);
  } catch {
    /* keine Erklärung mitgeschickt */
  }
  return (error as Error)?.message || "Das hat nicht geklappt.";
}

/** Beispielkalender für den Demo-Modus – läuft durch denselben Leser wie echte. */
function demoIcs(): string {
  const h = heuteKey();
  const d = (n: number) => plusTage(h, n).replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:Mein iPhone (Beispiel)",
    "BEGIN:VEVENT", "UID:demo-1", `DTSTART;TZID=Europe/Berlin:${d(1)}T160000`, `DTEND;TZID=Europe/Berlin:${d(1)}T170000`, "SUMMARY:Zahnarzt", "LOCATION:Praxis am Markt", "END:VEVENT",
    "BEGIN:VEVENT", "UID:demo-2", `DTSTART;TZID=Europe/Berlin:${d(0)}T180000`, `DTEND;TZID=Europe/Berlin:${d(0)}T193000`, "RRULE:FREQ=WEEKLY;COUNT=8", "SUMMARY:Fußballtraining", "END:VEVENT",
    "BEGIN:VEVENT", "UID:demo-3", `DTSTART;VALUE=DATE:${d(4)}`, `DTEND;VALUE=DATE:${d(6)}`, "SUMMARY:Wochenende bei Oma", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

async function holeFremde(link: string): Promise<{ daten?: Gespeichert; fehler?: string }> {
  if (!hasSupabase) {
    const text = demoIcs();
    const termine = leseIcs(text, plusTage(heuteKey(), -31), plusTage(heuteKey(), 400));
    return { daten: { zeit: Date.now(), name: "Mein iPhone (Beispiel)", termine } };
  }
  const { data, error } = await supabase!.functions.invoke("kalender", { body: { aktion: "fremd", url: link } });
  if (error) return { fehler: await fehlerText(error) };
  const d = data as { termine: FremderTermin[]; name: string };
  return { daten: { zeit: Date.now(), name: d.name || "", termine: d.termine || [] } };
}

/** In die Form bringen, die Kalender und Wochenstreifen kennen – grau, nur ansehen. */
function alsTermin(f: FremderTermin): Termin {
  return {
    id: `privat:${f.uid}:${f.datum}:${f.von || ""}`,
    titel: f.titel,
    beschreibung: "",
    ort: f.ort,
    datum: f.datum,
    bis_datum: f.bis_datum,
    von: f.von,
    bis: f.bis,
    sichtbar: "personen",
    fuer_eltern: false,
    created_by: null,
    created_at: "",
    tags: [],
    personen: [],
    aktion_id: null,
    plaetze: null,
    icon: null,
    privat: true,
  };
}

// Alle offenen Ansichten (Wochenstreifen, großer Kalender, Blatt) teilen sich einen Stand.
let stand: Gespeichert | null = lesen<Gespeichert>(LS_DATEN);
// Umgewandelt zwischengespeichert: dieselbe Liste, solange sich der Stand nicht ändert.
let standTermine: Termin[] = stand ? stand.termine.map(alsTermin) : [];
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((f) => f());
let laeuft: Promise<string | null> | null = null;

/** Eigenen Kalender (neu) laden. Gibt eine Fehlermeldung zurück oder null. */
export function fremdeNeuLaden(): Promise<string | null> {
  const link = fremdLink();
  if (!link) return Promise.resolve("Noch kein Kalender-Link eingetragen.");
  if (laeuft) return laeuft;
  laeuft = holeFremde(link).then(({ daten, fehler }) => {
    laeuft = null;
    if (fehler) return fehler;
    stand = daten!;
    standTermine = stand.termine.map(alsTermin);
    schreiben(LS_DATEN, stand);
    melden();
    return null;
  });
  return laeuft;
}

function localStorageRoh(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function fremdLink(): string {
  return localStorageRoh(LS_LINK) || "";
}

export async function fremdLinkSetzen(link: string): Promise<string | null> {
  const sauber = link.trim();
  if (!sauber) {
    schreiben(LS_LINK, null);
    schreiben(LS_DATEN, null);
    stand = null;
    standTermine = [];
    melden();
    return null;
  }
  schreiben(LS_LINK, sauber);
  return fremdeNeuLaden();
}

/** Die grauen Termine aus dem eigenen Kalender – leer, wenn nicht freigeschaltet. */
export function usePrivatTermine(aktiv: boolean): { termine: Termin[]; name: string; zeit: number | null } {
  const [, neu] = useState(0);
  const auffrischen = useCallback(() => neu((n) => n + 1), []);
  useEffect(() => {
    if (!aktiv) return;
    hoerer.add(auffrischen);
    // Veraltet? Dann im Hintergrund neu holen.
    if (fremdLink() && (!stand || Date.now() - stand.zeit > FRISCH_MS)) void fremdeNeuLaden();
    return () => {
      hoerer.delete(auffrischen);
    };
  }, [aktiv, auffrischen]);
  if (!aktiv || !stand || !fremdLink()) return { termine: [], name: "", zeit: null };
  return { termine: standTermine, name: stand.name, zeit: stand.zeit };
}
