import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Live-Verbindung zur Datenbank: anmelden, Zustand melden, neu verbinden.
 *
 * ----------------------------------------------------------------------------
 * Warum es das gibt
 * ----------------------------------------------------------------------------
 * An sieben Stellen stand `.subscribe()` – **ohne Rückmeldung**. Damit war nicht
 * zu erkennen, ob die Anmeldung überhaupt geklappt hat. Lehnt der Server sie ab
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

export type Verbindung = "verbindet" | "verbunden" | "getrennt";

let zustand: Verbindung = "verbindet";
const zuhoerer = new Set<(v: Verbindung) => void>();

export const verbindung = (): Verbindung => zustand;

export function aufVerbindung(fn: (v: Verbindung) => void): () => void {
  zuhoerer.add(fn);
  fn(zustand);
  return () => zuhoerer.delete(fn);
}

function melde(v: Verbindung): void {
  if (zustand === v) return;
  zustand = v;
  for (const fn of zuhoerer) fn(v);
}

/** Alle offenen Kanäle – damit "jetzt neu verbinden" alle auf einmal erreicht. */
const offen = new Set<() => void>();

/** Von Hand neu verbinden (Knopf im Verbindungshinweis). */
export function neuVerbinden(): void {
  melde("verbindet");
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

  let kanal: RealtimeChannel | null = null;
  let versuche = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let beendet = false;
  let liefSchonMal = false;

  const abbauen = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (kanal) {
      void supabase!.removeChannel(kanal);
      kanal = null;
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
    kanal = aufbauen(supabase!.channel(name)).subscribe((status) => {
      if (beendet) return;
      if (status === "SUBSCRIBED") {
        versuche = 0;
        melde("verbunden");
        // Beim allerersten Mal haben die Speicher gerade selbst geladen –
        // dann waere das Nachholen nur eine doppelte Abfrage.
        if (liefSchonMal) nachholen?.();
        liefSchonMal = true;
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn(`[realtime] ${name}: ${status} – neuer Versuch folgt`);
        melde("getrennt");
        spaeterNochmal();
      }
    });
  };

  const sofortNochmal = () => {
    versuche = 0;
    starten();
  };
  offen.add(sofortNochmal);

  // Zurueck aus dem Hintergrund oder wieder online: nachsehen, ob die Leitung
  // noch steht. Ein gesperrtes Handy kappt die Verbindung stillschweigend.
  const beiRueckkehr = () => {
    if (document.visibilityState !== "visible") return;
    if (zustand !== "verbunden") sofortNochmal();
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
  };
}
