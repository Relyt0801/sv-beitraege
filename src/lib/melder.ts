/**
 * Meldungen und Rückfragen, die die App selbst zeichnet.
 *
 * Vorher lief alles über die eingebauten Fenster des Browsers: alert() und
 * confirm(). Das hat zwei Haken.
 *
 * Erstens bietet der Browser nach ein paar solchen Fenstern an, "weitere
 * Dialoge dieser Seite zu verhindern". Wer das einmal antippt, sieht für den
 * Rest der Sitzung **gar nichts** mehr – und confirm() liefert dann stumm
 * "nein". Löschen tut dann einfach nichts, und Fehlermeldungen kommen nie an.
 *
 * Zweitens sind diese Fenster in einer installierten App (Home-Bildschirm)
 * unzuverlässig und sehen nach Webseite aus statt nach App.
 *
 * Deshalb: die App zeichnet selbst (src/components/Melder.tsx). Die Funktionen
 * hier sind absichtlich einfache Aufrufe und keine Hooks, damit sie auch aus
 * den Datenspeichern heraus benutzt werden können. Ist der Melder (noch) nicht
 * eingehängt, fallen sie auf das Browserfenster zurück – lieber eine hässliche
 * Meldung als gar keine.
 */

import { hasSupabase, supabase } from "./supabase";

export type MeldeArt = "info" | "fehler" | "erfolg";

type ToastFn = (text: string, art: MeldeArt) => void;
type FrageFn = (text: string, jaText: string, gefaehrlich: boolean, nurOk: boolean) => Promise<boolean>;

let toastFn: ToastFn | null = null;
let frageFn: FrageFn | null = null;

/** Wird vom MelderProvider aufgerufen. Nichts sonst sollte das benutzen. */
export function melderEinhaengen(t: ToastFn, f: FrageFn): () => void {
  toastFn = t;
  frageFn = f;
  return () => {
    if (toastFn === t) toastFn = null;
    if (frageFn === f) frageFn = null;
  };
}

/** Kurze Meldung oben am Bildschirm. Verschwindet von selbst. */
export function melde(text: string, art: MeldeArt = "info"): void {
  if (toastFn) toastFn(text, art);
  else if (typeof alert === "function") alert(text);
}

/** Wie melde(), nur als Fehler eingefärbt und länger sichtbar. */
let gesperrt = false;
/** Setzt der RoleProvider: ist die eigene Person gerade gesperrt? */
export function sperreMerken(an: boolean): void {
  gesperrt = an;
}
/** Die eigene Sperre neu laden (RoleProvider hört darauf). */
function sperrePruefen(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sv:sperre-pruefen"));
}

export function meldeFehler(text: string): void {
  // Wortfilter (Datenbank): Meldung ohne „Ging nicht:“ davor, und den
  // Versuch zählen – 3 in 10 Minuten sperren automatisch
  // (5 Minuten → 1 Stunde → 1 Tag, supabase/auto-sperre.sql).
  const i = text.indexOf("Bitte ohne beleidigende Wörter");
  if (i >= 0) {
    const nur = text.slice(i);
    melde(nur, "fehler");
    const wort = (nur.match(/„([^“]+)“/) || [])[1] || "";
    if (hasSupabase) void supabase!.rpc("wortfilter_versuch", { p_wort: wort }).then(sperrePruefen);
    return;
  }
  // Mehrere Zustimmungen nötig: das ist kein Fehler, sondern ein Zwischenstand
  const z = text.indexOf("Deine Zustimmung ist gespeichert");
  if (z >= 0) {
    melde(text.slice(z), "info");
    return;
  }
  // Gesperrt (z. B. gerade automatisch wegen Spam): verständlich statt
  // „violates row-level security policy“
  if (/gerade gesperrt|row-level security/i.test(text)) {
    sperrePruefen();
    if (gesperrt || /gerade gesperrt/i.test(text)) {
      melde("Du bist gerade gesperrt und kannst nichts schreiben, einreichen oder abstimmen.", "fehler");
      return;
    }
  }
  melde(text, "fehler");
}


/**
 * Rückfrage mit Abbrechen/Ja. Gibt true zurück, wenn bestätigt wurde.
 *
 * `gefaehrlich` färbt den Bestätigen-Knopf rot – für alles, was etwas
 * endgültig löscht.
 */
export function frage(text: string, jaText = "OK", gefaehrlich = false): Promise<boolean> {
  if (frageFn) return frageFn(text, jaText, gefaehrlich, false);
  return Promise.resolve(typeof confirm === "function" ? confirm(text) : false);
}

/**
 * Hinweis, der stehen bleibt, bis man "OK" tippt – für längere Texte, die man
 * wirklich lesen muss (z. B. "in der Datenbank fehlt eine Spalte").
 */
export function hinweis(text: string): Promise<void> {
  if (frageFn) return frageFn(text, "OK", false, true).then(() => undefined);
  if (typeof alert === "function") alert(text);
  return Promise.resolve();
}
