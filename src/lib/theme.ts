import { useCallback, useSyncExternalStore } from "react";

/**
 * Erscheinungsbild der App: Hell, Dunkel oder Automatisch (folgt dem Gerät).
 *
 * Update 1.4 (U3): Vorher gab es nur hell/dunkel; beim ersten Öffnen wurde die
 * Einstellung des Geräts übernommen und sofort fest gespeichert – wer später
 * am Handy auf Dunkel umstellte, blieb in der App hell. Jetzt gibt es einen
 * dritten Zustand „auto“: solange nichts gewählt ist, folgt die App dem Gerät
 * (auch live, wenn es abends automatisch dunkel wird).
 *
 * Gespeichert wird weiter unter demselben Schlüssel:
 *   "light" | "dark"  – ausdrücklich gewählt (so auch alle bisherigen Geräte)
 *   fehlt / "auto"    – automatisch
 *
 * Alle Aufrufer teilen sich EINEN Zustand (useSyncExternalStore). Vorher hatte
 * jeder useTheme()-Aufruf seinen eigenen – der Mond-Knopf im Kopf stellte die
 * Seite um, aber z. B. die Namensfarbe im Profil blieb auf dem alten Stand.
 *
 * index.html setzt die Klasse „dark“ schon vor dem ersten Zeichnen nach
 * derselben Regel, damit beim Start nichts kurz hell aufblitzt.
 */
export type Theme = "light" | "dark";
export type Modus = "auto" | Theme;

const KEY = "sv-beitraege:theme";

function gespeichert(): Modus {
  try {
    const s = localStorage.getItem(KEY);
    return s === "light" || s === "dark" ? s : "auto";
  } catch {
    return "auto";
  }
}

const geraetDunkel = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

let modus: Modus = typeof window === "undefined" ? "auto" : gespeichert();
const zuhoerer = new Set<() => void>();

/** Welches Aussehen gilt gerade wirklich? (auto → so wie das Gerät) */
function wirksam(): Theme {
  if (modus === "auto") return geraetDunkel() ? "dark" : "light";
  return modus;
}

/** Klasse am <html> setzen – die einzige Stelle, die das tut. */
function anwenden() {
  document.documentElement.classList.toggle("dark", wirksam() === "dark");
}

function melden() {
  anwenden();
  zuhoerer.forEach((f) => f());
}

export function setModus(neu: Modus) {
  modus = neu;
  try {
    if (neu === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, neu);
  } catch {
    /* privater Modus: gilt dann nur für diese Sitzung */
  }
  melden();
}

if (typeof window !== "undefined") {
  anwenden();
  // Gerät wechselt von selbst (Abend, Energiesparmodus): im Automatik-Modus mitgehen
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const beiGeraetewechsel = () => {
    if (modus === "auto") melden();
  };
  if (mq.addEventListener) mq.addEventListener("change", beiGeraetewechsel);
  // Anderer Tab / anderes Fenster ändert die Wahl
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    modus = gespeichert();
    melden();
  });
}

function abonnieren(f: () => void) {
  zuhoerer.add(f);
  return () => zuhoerer.delete(f);
}

export function useTheme() {
  // Der Schnappschuss ist der Text „modus|wirksam“ (ein Wert, der sich nur ändert, wenn sich etwas ändert)
  const stand = useSyncExternalStore(abonnieren, () => `${modus}|${wirksam()}`, () => "auto|light");
  const [m, t] = stand.split("|") as [Modus, Theme];
  // Mond-/Sonnen-Knopf: auf das Gegenteil von dem, was gerade zu sehen ist (ausdrücklich gewählt)
  const toggle = useCallback(() => setModus(wirksam() === "dark" ? "light" : "dark"), []);
  return { theme: t, modus: m, setModus, toggle };
}
