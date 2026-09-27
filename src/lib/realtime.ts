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

/*
 * ---------------------------------------------------------------------------
 * Die Leitung selbst neu aufbauen (28.09.)
 * ---------------------------------------------------------------------------
 * Nur die Kanäle neu anzumelden reichte nicht: Nach dem Sperren des Handys ist
 * oft die ganze WebSocket-Leitung tot (oder ihr Anmelde-Token abgelaufen), und
 * jede neue Anmeldung darüber läuft ins Leere – bis man die App neu startet.
 * Darum wird hier das gemacht, was ein Neustart macht:
 *   1. Sitzung holen (erneuert das Token, falls abgelaufen) und der
 *      Live-Verbindung das frische Token geben,
 *   2. die Leitung trennen und neu aufbauen,
 *   3. alle Kanäle neu anmelden.
 * Das passiert automatisch, wenn die App länger im Hintergrund war, wenn ein
 * Kanal wiederholt scheitert, und wenn die Verbindung trotz allem länger weg
 * bleibt (Wächter). Der Knopf „Neu verbinden“ macht dasselbe sofort; hilft
 * auch das nicht, lädt er die App neu.
 */
let letzterNeuaufbau = 0;
let neuaufbauLaeuft: Promise<void> | null = null;

async function leitungNeu(): Promise<void> {
  if (!supabase) return;
  if (neuaufbauLaeuft) return neuaufbauLaeuft;
  neuaufbauLaeuft = (async () => {
    letzterNeuaufbau = Date.now();
    try {
      const { data } = await supabase!.auth.getSession();
      if (data.session?.access_token) await supabase!.realtime.setAuth(data.session.access_token);
    } catch {
      /* ohne Sitzung: Kanäle scheitern ohnehin, der Wächter versucht es später */
    }
    try {
      await Promise.race([supabase!.realtime.disconnect(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* war schon getrennt */
    }
    // Hängt das Trennen noch, kurz warten – sonst ignoriert connect() den Aufruf
    for (let i = 0; i < 15 && supabase!.realtime.connectionState() === "closing"; i++) await new Promise((r) => setTimeout(r, 200));
    supabase!.realtime.connect();
    for (const fn of [...offen]) fn();
  })().finally(() => {
    neuaufbauLaeuft = null;
  });
  return neuaufbauLaeuft;
}

const tipptGerade = () => {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
};

/** Letzter Ausweg: die App neu laden (höchstens alle 5 Minuten, nie beim Tippen). */
function neuStarten(): void {
  try {
    const zuletztNeu = Number(sessionStorage.getItem("sv:rt-neustart") || 0);
    if (Date.now() - zuletztNeu < 5 * 60_000) return;
    sessionStorage.setItem("sv:rt-neustart", String(Date.now()));
  } catch {
    /* ohne Speicher trotzdem */
  }
  window.location.reload();
}

/** Von Hand neu verbinden (Knopf im Verbindungshinweis). Hilft das nicht, neu laden. */
export function neuVerbinden(): void {
  void leitungNeu();
  setTimeout(() => {
    if (gesamt() !== "verbunden" && navigator.onLine) window.location.reload();
  }, 8000);
}

// Einmal für alle Kanäle: Rückkehr aus dem Hintergrund und ein Wächter.
if (typeof document !== "undefined") {
  let versteckt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      versteckt = Date.now();
      return;
    }
    // Länger als 20 s weg: der Leitung nicht trauen, auch wenn sie "verbunden" sagt
    if (kanaele.size && (gesamt() !== "verbunden" || (versteckt && Date.now() - versteckt > 20_000))) void leitungNeu();
    versteckt = 0;
  });
  window.addEventListener("online", () => {
    if (kanaele.size) void leitungNeu();
  });
  let wegSeit = 0;
  setInterval(() => {
    if (!kanaele.size || document.visibilityState !== "visible" || !navigator.onLine) {
      wegSeit = 0;
      return;
    }
    if (gesamt() === "verbunden") {
      wegSeit = 0;
      return;
    }
    if (!wegSeit) wegSeit = Date.now();
    const weg = Date.now() - wegSeit;
    // nach 15 s: Leitung neu (höchstens alle 20 s); nach 90 s: App neu laden
    if (weg > 15_000 && Date.now() - letzterNeuaufbau > 20_000) void leitungNeu();
    if (weg > 90_000 && !tipptGerade()) neuStarten();
  }, 5000);
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
      // Scheitert es wiederholt, liegt es meist an der Leitung selbst
      if (versuche >= 3 && Date.now() - letzterNeuaufbau > 20_000) void leitungNeu();
      else starten();
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

  // Rückkehr aus dem Hintergrund / wieder online: erledigt der gemeinsame
  // Wächter oben (leitungNeu), der dann alle Kanäle neu anmeldet.

  starten();

  return () => {
    beendet = true;
    offen.delete(sofortNochmal);
    abbauen();
    kanaele.delete(id);
    melden();
  };
}
