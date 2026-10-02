// Die Spielregeln des Assistenten – ohne Netzwerk, ohne Datenbank, testbar.
//
// Die KI liefert nur Einschätzungen (welche Absicht, welche Schicht, bei Jev
// auch: wie stimmig) mit einer Sicherheit. Was daraus folgt, steht HIER und
// nirgends sonst – so wie es der jev-anything-Skill verlangt („keep authority
// in your code“). Einschätzen kann Jev (wenn ein TypeSafe-/OpenRouter-Schlüssel
// gesetzt ist) oder Claude (sonst). Claude bewertet NICHT, wie stimmig jemand
// ist – ohne Jev kommt der Wert nur aus der Bilanz.
//
// Grundsätze:
//   - Unsicher heißt immer: ein Mensch entscheidet. Nie: abgelehnt.
//   - Automatisch eingetragen wird nicht hier, sondern in der Datenbank
//     (anwesenheit_eintragen) – und dort nur, wenn die Person eingeteilt war,
//     eingewilligt hat und ihr Score über der Schwelle liegt. Diese Regeln
//     entscheiden nur, OB wir überhaupt fragen.
//   - Fällt die KI aus, passiert nichts Automatisches (fail-safe: ans Team).

/** Antwort einer Auswahlfrage (Jev „choice“ bzw. Claude mit fester Liste). */
export interface Wahl {
  wahl: string;
  sicherheit: number;
}

/** Antwort einer Jev-Bewertung (score), auf 0..1 umgerechnet. */
export interface Bewertung {
  wert: number;
  sicherheit: number;
}

export interface Einschaetzung {
  absicht: Wahl;
  /** null, wenn es keine passenden Schichten gab */
  schicht: Wahl | null;
  /** nur von Jev; Claude bewertet das nicht (null) */
  stimmig: Bewertung | null;
}

export const ABSICHTEN = ["mithilfe_nachtrag", "zahlung", "termin", "sonstiges"] as const;
export type Absicht = (typeof ABSICHTEN)[number];

/** Ab hier gilt eine Einschätzung als sicher genug, um danach zu handeln. */
export const SICHER_ABSICHT = 0.8;
export const SICHER_SCHICHT = 0.85;
/** Jev „zweifelt“: stimmig unter 0,35 bei Sicherheit ab 0,7 (wie vertrauen_wert in SQL). */
export const ZWEIFEL_WERT = 0.35;
export const ZWEIFEL_SICHERHEIT = 0.7;

export type Schritt =
  /** Nichts automatisch tun, das Team schaut drauf (Vorschlag fürs Team). */
  | { art: "team"; grund: "andere_absicht" | "absicht_unklar" | "ki_fehler" }
  /** Nachfragen, welche Schicht gemeint ist. */
  | { art: "rueckfrage"; grund: "schicht_unklar" }
  /** Die Datenbank versuchen lassen (anwesenheit_melden_fuer). */
  | { art: "melden"; terminKey: string };

export function istZweifel(s: Bewertung | null): boolean {
  return !!s && s.sicherheit >= ZWEIFEL_SICHERHEIT && s.wert < ZWEIFEL_WERT;
}

/** Erster Schritt: was tun mit dieser Nachricht? */
export function entscheide(jev: Einschaetzung | null): Schritt {
  if (!jev) return { art: "team", grund: "ki_fehler" };
  if (jev.absicht.wahl !== "mithilfe_nachtrag") {
    return { art: "team", grund: jev.absicht.sicherheit >= SICHER_ABSICHT ? "andere_absicht" : "absicht_unklar" };
  }
  if (jev.absicht.sicherheit < SICHER_ABSICHT) return { art: "team", grund: "absicht_unklar" };
  if (!jev.schicht || jev.schicht.wahl === "keine_passt" || jev.schicht.sicherheit < SICHER_SCHICHT) {
    return { art: "rueckfrage", grund: "schicht_unklar" };
  }
  return { art: "melden", terminKey: jev.schicht.wahl };
}

/** Was die Datenbank auf anwesenheit_melden_fuer antwortet. */
export type DbErgebnis = "auto" | "offen" | "nicht_da" | "schon_eingetragen" | "ohne_punkte" | "entschieden";

export type Antwort =
  /** feste Bestätigung, ohne KI-Text */
  | { art: "fest"; text: string; teamFragen: boolean }
  /** Rückfrage, Claude formuliert sie im Stil des Stufenteams */
  | { art: "rueckfrage"; grund: "schicht_unklar" | "zweifel"; teamFragen: boolean }
  /** keine Antwort an die Person, nur ans Team */
  | { art: "still"; teamFragen: boolean };

/** Zweiter Schritt: nach dem Eintrags-Versuch – was schreiben wir zurück? */
export function antwortNachMelden(db: DbErgebnis, stimmig: Bewertung | null, schicht: string): Antwort {
  switch (db) {
    case "auto":
      return { art: "fest", text: `Hab dich für ${schicht} eingetragen 🙌 Danke fürs Mithelfen!`, teamFragen: false };
    case "schon_eingetragen":
      return { art: "fest", text: `${schicht} ist bei dir schon eingetragen – da musst du nichts mehr machen.`, teamFragen: false };
    case "offen":
      // Jev zweifelt: höflich nachfragen, das Team schaut ohnehin drauf.
      if (istZweifel(stimmig)) return { art: "rueckfrage", grund: "zweifel", teamFragen: true };
      return {
        art: "fest",
        text: `Danke! Das Stufenteam schaut kurz drüber und trägt ${schicht} dann ein.`,
        teamFragen: true,
      };
    case "nicht_da":
    case "ohne_punkte":
    case "entschieden":
    default:
      return { art: "still", teamFragen: true };
  }
}

/**
 * Claude gibt keine Wahrscheinlichkeit, sondern sagt, wie klar die Nachricht
 * ist. Nur „eindeutig“ reicht für SICHER_ABSICHT/SICHER_SCHICHT – bei
 * „wahrscheinlich“ wird nachgefragt bzw. das Team schaut drauf.
 */
export const KLARHEIT = { eindeutig: 0.95, wahrscheinlich: 0.7, unklar: 0.4 } as const;
export type Klarheit = keyof typeof KLARHEIT;

export interface ClaudeEinordnung {
  absicht: Absicht;
  absicht_klarheit: Klarheit;
  /** Schlüssel s1 … sN oder „keine_passt“ */
  schicht: string;
  schicht_klarheit: Klarheit;
}

/** Claudes Einordnung in dieselbe Form wie eine Jev-Antwort bringen. */
export function ausClaude(e: ClaudeEinordnung, gibtSchichten: boolean): Einschaetzung {
  return {
    absicht: { wahl: e.absicht, sicherheit: KLARHEIT[e.absicht_klarheit] ?? 0 },
    schicht: gibtSchichten ? { wahl: e.schicht, sicherheit: KLARHEIT[e.schicht_klarheit] ?? 0 } : null,
    stimmig: null,
  };
}

/** Jev-Score (0 … Stufen-1, auch Bruchteile) auf 0..1. */
export function aufEins(score: number, stufen: number): number {
  if (!(stufen > 1) || !Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(1, score / (stufen - 1)));
}

/**
 * Wörter, die zugleich Vornamen sein können, aber für das Erkennen der Schicht
 * gebraucht werden („am 3. Mai“). Die werden bei ANDEREN nicht ersetzt.
 */
const KEIN_NAME = new Set([
  "januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember",
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag", "heute", "gestern", "morgen",
]);

const alsWort = (n: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");

/**
 * Namen aus einem Text entfernen, bevor er an einen KI-Dienst geht. Ersetzt
 * ganze Wörter (Groß/Klein egal), damit „Ben“ nicht in „Benjamin“ hängt.
 * Eigene Namen → „Person“, Namen anderer aus der Stufe → „[Name]“ (z. B. „ich
 * war mit Lena da“). Bei anderen erst ab drei Buchstaben und ohne Monate und
 * Wochentage, damit Datumsangaben lesbar bleiben.
 */
export function pseudonymisiere(text: string, namen: string[], andere: string[] = []): string {
  let t = text;
  const sauber = (liste: string[], min: number) =>
    [...new Set(liste.map((n) => n.trim()).filter((n) => n.length >= min))].sort((a, b) => b.length - a.length);
  const eigene = sauber(namen, 2);
  for (const n of eigene) t = t.replace(alsWort(n), "Person");
  const klein = new Set(eigene.map((n) => n.toLowerCase()));
  for (const n of sauber(andere, 3)) {
    if (klein.has(n.toLowerCase()) || KEIN_NAME.has(n.toLowerCase())) continue;
    t = t.replace(alsWort(n), "[Name]");
  }
  return t;
}

/** „Waffelverkauf am Di 29.09., 10:00–11:00“ */
export function schichtText(k: { titel: string; datum: string; von: string | null; bis: string | null }): string {
  const d = new Date(`${k.datum}T12:00:00Z`);
  const tag = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()];
  const datum = `${k.datum.slice(8, 10)}.${k.datum.slice(5, 7)}.`;
  const zeit = k.von ? `, ${k.von.slice(0, 5)}${k.bis ? `–${k.bis.slice(0, 5)}` : ""}` : "";
  return `${k.titel} am ${tag} ${datum}${zeit}`;
}
