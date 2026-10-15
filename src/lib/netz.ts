import { useEffect, useState } from "react";

/**
 * Netz: verständliche Fehler und der Verbindungs-Zustand der App.
 *
 * ----------------------------------------------------------------------------
 * Warum es das gibt (Update 1.4)
 * ----------------------------------------------------------------------------
 * Wer ohne Internet (oder im Schul-WLAN, das gerade hängt) auf „Anmelden“
 * tippte, bekam „Failed to fetch“ zu sehen – englisch, technisch, und ohne
 * Hinweis, was man tun soll. Je nach Browser heißt derselbe Fehler auch
 * „NetworkError when attempting to fetch resource“ (Firefox), „Load failed“
 * (Safari) oder „The network connection was lost“ (iPhone). Dazu kommen
 * Zeitüberschreitungen und Störungen auf Seiten des Servers (502/503/504).
 *
 * Hier liegt deshalb an EINER Stelle:
 *
 *   fehlerText(e)      macht aus jedem Fehler (Objekt oder Text) einen
 *                      deutschen Satz. Netzwerk-Phrasen werden auch mitten in
 *                      einem zusammengesetzten Text erkannt („Speichern ging
 *                      nicht: TypeError: Failed to fetch“) und ersetzt.
 *   istNetzfehler(e)   ist das ein Verbindungsproblem?
 *   useNetz()          Zustand für das Offline-Band (components/Verbindung.tsx)
 *   netzMelden(ok)     ruft der fetch-Wrapper in lib/supabase.ts nach jeder
 *                      Anfrage auf – so merkt die App auch dann, dass der
 *                      Server nicht erreichbar ist, wenn das Gerät behauptet,
 *                      online zu sein (WLAN ohne Internet, Captive Portal).
 *
 * Diese Datei importiert absichtlich NICHTS aus lib/supabase.ts – supabase.ts
 * importiert von hier, ein Kreis-Import wäre die Folge. Die Server-Prüfung
 * hängt supabase.ts deshalb über `serverPruefungSetzen()` ein.
 */

/** Text, wenn der Server nicht erreichbar ist (Gerät ist aber online). */
export const NETZ_TEXT = "Keine Verbindung zum Server. Prüfe dein Internet und versuch es nochmal.";
/** Text, wenn das Gerät selbst offline ist. */
export const OFFLINE_TEXT = "Du bist offline. Sobald du wieder Internet hast, versuch es nochmal.";

/*
 * Die englischen (und ein paar deutsche) Formulierungen, mit denen Browser,
 * supabase-js und vorgeschaltete Server ein Verbindungsproblem melden.
 * Ein optionales „TypeError: “ o. Ä. davor wird mit ersetzt, ebenso alles
 * danach (oft folgt noch ein Stack oder HTML einer Fehlerseite).
 *
 * Bewusst NICHT dabei: eine nackte Zahl wie „503“ – die kann auch in einem
 * normalen Text stehen (Betrag, Raumnummer).
 */
const NETZ_MUSTER = new RegExp(
  "(?:(?:Type|Fetch|Abort|Timeout|AuthRetryableFetch|StorageUnknown|Network)?Error:\\s*)?" +
    "(?:failed to fetch|fetch failed|networkerror(?: when attempting to fetch resource\\.?)?|network ?error|" +
    "network request failed|load failed|the network connection was lost|" +
    "the internet connection appears to be offline|internet connection appears to be offline|" +
    "a server with the specified hostname could not be found|could not connect to the server|" +
    "the request timed out|request timed out|timed out|timeout exceeded|zeitüberschreitung|" +
    "signal (?:is|has been) aborted(?: without reason)?|the operation was aborted|the user aborted a request|" +
    "upstream (?:request timeout|connect error)|bad gateway|service (?:temporarily )?unavailable|gateway time-?out|" +
    "err_internet_disconnected|err_network_changed|err_connection_(?:reset|refused|closed|timed_out)|econnreset|" +
    "(?:http|status(?: ?code)?)\\s*:?\\s*50[234]\\b|<!doctype html|<html)" +
    "[\\s\\S]*$",
  "i",
);

/** Bekannte englische Meldungen von Supabase, die keine Netzprobleme sind. */
const UEBERSETZT: [RegExp, string][] = [
  [/invalid login credentials/i, "Benutzername oder Passwort falsch."],
  [/new password should be different/i, "Das neue Passwort muss sich vom alten unterscheiden."],
  [/password should be at least (\d+)/i, "Das Passwort ist zu kurz."],
  [/too many requests|rate limit|over_request_rate_limit|for security purposes, you can only request/i, "Zu viele Versuche. Warte kurz und versuch es dann nochmal."],
  [/user is banned/i, "Dieses Konto ist gesperrt. Meld dich beim Stufenteam."],
  [/jwt expired|invalid refresh token|refresh token not found|refresh_token_not_found|auth session missing/i, "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an."],
];

function geraetOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Den eigentlichen Text aus einem Fehler holen – egal, was geworfen wurde. */
function rohText(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const o = e as { message?: unknown; error_description?: unknown; msg?: unknown; name?: unknown };
    const m = [o.message, o.error_description, o.msg].find((x) => typeof x === "string" && x) as string | undefined;
    if (m) return m;
    if (typeof o.name === "string") return o.name;
  }
  return String(e);
}

/**
 * Ist das ein Verbindungsproblem? Erkennt Fehler-Objekte (AbortError,
 * TimeoutError, AuthRetryableFetchError, Status 0/502/503/504) und Texte.
 */
export function istNetzfehler(e: unknown): boolean {
  if (e && typeof e === "object") {
    const o = e as { name?: unknown; status?: unknown };
    if (o.name === "AbortError" || o.name === "TimeoutError" || o.name === "AuthRetryableFetchError") return true;
    if (o.status === 0 || o.status === 502 || o.status === 503 || o.status === 504) return true;
  }
  return NETZ_MUSTER.test(rohText(e));
}

/**
 * Jeden Fehler in einen verständlichen deutschen Satz verwandeln.
 *
 * - Netzwerkfehler → „Keine Verbindung zum Server …“ bzw. „Du bist offline …“.
 *   Steht davor schon ein deutscher Anfang („Speichern ging nicht: …“), bleibt
 *   der stehen – man weiß dann noch, WAS nicht geklappt hat.
 * - Bekannte englische Supabase-Meldungen → deutsche Übersetzung.
 * - Alles andere bleibt, wie es ist.
 */
export function fehlerText(e: unknown): string {
  const text = rohText(e).trim();
  const netzText = geraetOffline() ? OFFLINE_TEXT : NETZ_TEXT;

  const treffer = NETZ_MUSTER.exec(text);
  if (treffer) {
    // Was VOR der englischen Phrase steht, ist meist der deutsche Anfang
    const vorne = text.slice(0, treffer.index).replace(/[\s:–—-]+$/, "").trim();
    return vorne ? `${vorne}: ${netzText}` : netzText;
  }
  // Fehler-Objekt ohne passenden Text, aber eindeutig Netz (z. B. Status 503)
  if (istNetzfehler(e)) return netzText;

  for (const [muster, deutsch] of UEBERSETZT) {
    if (muster.test(text)) {
      // Deutschen Anfang behalten, nur den englischen Teil ersetzen
      const i = text.search(muster);
      const vorne = text.slice(0, i).replace(/[\s:–—-]+$/, "").trim();
      return vorne && !/^(Auth|Error)/.test(vorne) ? `${vorne}: ${deutsch}` : deutsch;
    }
  }
  return text || "Das hat nicht geklappt. Versuch es nochmal.";
}

/* ---------------------------------------------------------------------------
 * Verbindungs-Zustand
 * ---------------------------------------------------------------------------
 * Drei Zustände für das Band oben:
 *   "online"     alles gut (nichts anzeigen)
 *   "offline"    das Gerät meldet: kein Netz (navigator.onLine = false)
 *   "server"     das Gerät ist online, aber Anfragen an den Server scheitern
 *                (zweimal hintereinander – ein einzelner Aussetzer zählt nicht)
 * Dazu „wieder“: kurz nach der Rückkehr zu „online“, damit das Band einmal
 * „Wieder online“ zeigen kann.
 */
export type NetzZustand = "online" | "offline" | "server";

let fehlschlaege = 0;
let serverWeg = false;
const zuhoerer = new Set<() => void>();
let pruefTimer: ReturnType<typeof setInterval> | null = null;
let serverPruefung: (() => Promise<boolean>) | null = null;

function zustand(): NetzZustand {
  if (geraetOffline()) return "offline";
  return serverWeg ? "server" : "online";
}

function benachrichtigen(): void {
  for (const fn of zuhoerer) fn();
  // Ist der Server weg, alle 15 s nachsehen, ob er wieder da ist – sonst
  // bliebe das Band stehen, bis zufällig die nächste Anfrage rausgeht.
  if (serverWeg && !geraetOffline() && !pruefTimer && serverPruefung) {
    pruefTimer = setInterval(() => void jetztPruefen(), 15_000);
  }
  if ((!serverWeg || geraetOffline()) && pruefTimer) {
    clearInterval(pruefTimer);
    pruefTimer = null;
  }
}

/** supabase.ts hängt hier ein, wie man den Server anpingt. */
export function serverPruefungSetzen(fn: () => Promise<boolean>): void {
  serverPruefung = fn;
}

async function jetztPruefen(): Promise<void> {
  if (!serverPruefung || geraetOffline()) return;
  try {
    netzMelden(await serverPruefung());
  } catch {
    netzMelden(false);
  }
}

/**
 * Nach jeder Anfrage an den Server: hat sie ihn erreicht (`true`, egal mit
 * welchem Status) oder ist sie an der Verbindung gescheitert (`false`)?
 */
export function netzMelden(ok: boolean): void {
  if (ok) {
    fehlschlaege = 0;
    if (serverWeg) {
      serverWeg = false;
      benachrichtigen();
    }
    return;
  }
  fehlschlaege++;
  if (fehlschlaege >= 2 && !serverWeg) {
    serverWeg = true;
    benachrichtigen();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    // Wieder Netz: sofort prüfen, ob auch der Server erreichbar ist
    benachrichtigen();
    if (serverWeg) void jetztPruefen();
  });
  window.addEventListener("offline", benachrichtigen);
  // Zurück in der App (Handy entsperrt): Zustand neu anzeigen und ggf. prüfen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    benachrichtigen();
    if (serverWeg) void jetztPruefen();
  });
}

/** Aktueller Zustand, ohne Hook (z. B. für Fehlermeldungen). */
export const netzZustand = (): NetzZustand => zustand();

/**
 * Verbindungs-Zustand als Hook. `wieder` ist für 2,5 s true, nachdem die App
 * von „offline“/„server“ zurück zu „online“ gekommen ist.
 */
export function useNetz(): { zustand: NetzZustand; wieder: boolean } {
  const [z, setZ] = useState<NetzZustand>(zustand);
  const [wieder, setWieder] = useState(false);

  useEffect(() => {
    let vorher = zustand();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const aendern = () => {
      const jetzt = zustand();
      if (jetzt === vorher) return;
      if (jetzt === "online" && vorher !== "online") {
        setWieder(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setWieder(false), 2500);
      } else {
        setWieder(false);
      }
      vorher = jetzt;
      setZ(jetzt);
    };
    zuhoerer.add(aendern);
    aendern();
    return () => {
      zuhoerer.delete(aendern);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { zustand: z, wieder };
}
