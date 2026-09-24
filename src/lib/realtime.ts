import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Live-Verbindung zur Datenbank: anmelden, Zustand melden, neu verbinden.
 *
 * ----------------------------------------------------------------------------
 * Warum es das gibt
 * ----------------------------------------------------------------------------
 * Überall stand `.subscribe()` – **ohne Rückmeldung**. Damit war nicht zu
 * erkennen, ob die Anmeldung überhaupt geklappt hat. Lehnt der Server sie ab
 * (das passiert, wenn zu viele Geräte gleichzeitig verbunden sind) oder bricht
 * die Verbindung weg (Handy gesperrt, WLAN gewechselt), dann passiert genau
 * nichts: kein Fehler, kein Hinweis, kein neuer Versuch. Die App zeigt einfach
 * weiter den alten Stand.
 *
 * Das ist die Beschreibung von "Ansichten werden bei anderen nicht sofort
 * aktualisiert" – nur dass niemand sehen konnte, dass die Leitung tot war.
 *
 * Hier passiert deshalb dreierlei:
 *
 * 1. Der Zustand der Verbindung wird gemeldet, damit die App ihn anzeigen kann.
 * 2. Bricht sie ab, wird mit wachsendem Abstand neu verbunden (1s, 2s, 4s …
 *    bis höchstens 30s). Ohne diesen Abstand würden 300 Geräte nach einer
 *    Störung gleichzeitig wieder anklopfen und den Server erneut überlasten.
 * 3. Nach dem Wiederverbinden werden die Daten einmal neu geladen – was
 *    während der Trennung passiert ist, hat man ja nicht mitbekommen.
 *
 * Zusätzlich wird geprüft, sobald die App wieder in den Vordergrund kommt oder
 * das Gerät wieder online ist. Genau dann merkt man sonst am ehesten, dass
 * nichts mehr ankommt.
 */

/** "aus": gerade ist gar kein Kanal angemeldet (z. B. vor dem Login). */
export type Verbindung = "aus" | "verbindet" | "verbunden" | "getrennt";

/** Zustand je Kanal. Der Gesamtzustand ist der schlechteste davon – sonst
 *  würde ein gesunder Kanal einen toten überdecken. */
const kanaele = new Map<number, Exclude<Verbindung, "aus">>();
let zaehler = 0;
const zuhoerer = new Set<(v: Verbindung) => void>();
let zuletzt: Verbindung = "aus";

function gesamt(): Verbindung {
  if (kanaele.size === 0) return "aus";
  const werte = [...kanaele.values()];
  if (werte.includes("getrennt")) return "getrennt";
  if (werte.includes("verbindet")) return "verbindet";
  return "verbunden";
}

function melden(): void {
  const v = gesamt();
  if (v === zuletzt) return;
  zuletzt = v;
  for (const fn of zuhoerer) fn(v);
}

export const verbindung = (): Verbindung => gesamt();

export function aufVerbindung(fn: (v: Verbindung) => void): () => void {
  zuhoerer.add(fn);
  fn(gesamt());
  return () => {
    zuhoerer.delete(fn);
  };
}

/** Alle offenen Kanäle – damit "jetzt neu verbinden" alle auf einmal erreicht. */
const offen = new Set<() => void>();

/** Von Hand neu verbinden (Knopf im Verbindungshinweis). */
export function neuVerbinden(): void {
  for (const fn of [...offen]) fn();
}

interface Optionen {
  /** Eindeutiger Kanalname. */
  name: string;
  /** Hier werden die .on(...)-Zeilen angehängt. */
  aufbauen: (kanal: RealtimeChannel) => RealtimeChannel;
  /** Nach einer Unterbrechung: Daten neu holen, es fehlt sonst etwas. */
  nachholen?: () => void;
}

/**
 * Kanal anmelden und offen halten. Gibt die Abmeldung zurück.
 */
export function abonniere({ name, aufbauen, nachholen }: Optionen): () => void {
  if (!supabase) return () => {};
  const id = ++zaehler;
  let nr = 0;

  let kanal: RealtimeChannel | null = null;
  let versuche = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let beendet = false;
  let liefSchonMal = false;

  const setze = (v: Exclude<Verbindung, "aus">) => {
    kanaele.set(id, v);
    melden();
  };

  const abbauen = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (kanal) {
      const alt = kanal;
      kanal = null;
      void supabase!.removeChannel(alt);
    }
  };

  const spaeterNochmal = () => {
    if (beendet || timer) return;
    // 1s, 2s, 4s, 8s, 16s, dann immer 30s.
    const wartezeit = Math.min(30_000, 1000 * 2 ** Math.min(versuche, 5));
    versuche++;
    timer = setTimeout(() => {
      timer = null;
      starten();
    }, wartezeit);
  };

  const starten = () => {
    if (beendet) return;
    abbauen();
    setze("verbindet");
    // Jeder Versuch bekommt einen eigenen Kanalnamen. supabase.channel(name)
    // gibt sonst den alten Kanal zurück, solange dessen Abmeldung noch läuft –
    // und ein zweites subscribe() auf ihm bricht mit einem Fehler ab.
    const dieser = aufbauen(supabase!.channel(`${name}-${id}-${++nr}`));
    kanal = dieser;
    dieser.subscribe((status) => {
      // Rückmeldungen eines schon abgebauten Kanals zählen nicht mehr. Ohne
      // diese Prüfung meldet das Abbauen selbst "CLOSED" – und das löste den
      // nächsten Neustart aus, endlos.
      if (beendet || kanal !== dieser) return;
      if (status === "SUBSCRIBED") {
        versuche = 0;
        setze("verbunden");
        // Beim allerersten Mal haben die Speicher gerade selbst geladen –
        // dann wäre das Nachholen nur eine doppelte Abfrage.
        if (liefSchonMal) nachholen?.();
        liefSchonMal = true;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn(`[realtime] ${name}: ${status} – neuer Versuch folgt`);
        setze("getrennt");
        spaeterNochmal();
      }
    });
  };

  const sofortNochmal = () => {
    if (beendet) return;
    versuche = 0;
    starten();
  };
  offen.add(sofortNochmal);

  // Zurück aus dem Hintergrund oder wieder online: nachsehen, ob die Leitung
  // noch steht. Ein gesperrtes Handy kappt die Verbindung stillschweigend.
  const beiRueckkehr = () => {
    if (document.visibilityState !== "visible") return;
    if (kanaele.get(id) !== "verbunden") sofortNochmal();
  };
  document.addEventListener("visibilitychange", beiRueckkehr);
  window.addEventListener("online", sofortNochmal);

  starten();

  return () => {
    beendet = true;
    offen.delete(sofortNochmal);
    document.removeEventListener("visibilitychange", beiRueckkehr);
    window.removeEventListener("online", sofortNochmal);
    abbauen();
    kanaele.delete(id);
    melden();
  };
}
