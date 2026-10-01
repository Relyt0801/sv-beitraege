// Die Spielregeln des Assistenten – ohne Netzwerk, ohne Datenbank, testbar.
//
// Jev liefert nur Einschätzungen (welche Absicht, welche Schicht, wie stimmig)
// mit einer Sicherheit. Was daraus folgt, steht HIER und nirgends sonst – so
// wie es der jev-anything-Skill verlangt („keep authority in your code“).
//
// Grundsätze:
//   - Unsicher heißt immer: ein Mensch entscheidet. Nie: abgelehnt.
//   - Automatisch eingetragen wird nicht hier, sondern in der Datenbank
//     (anwesenheit_eintragen) – und dort nur, wenn die Person eingeteilt war,
//     eingewilligt hat und ihr Score über der Schwelle liegt. Diese Regeln
//     entscheiden nur, OB wir überhaupt fragen.
//   - Fällt Jev aus, passiert nichts Automatisches (fail-safe: ans Team).

/** Antwort einer Jev-Auswahlfrage (choice). */
export interface Wahl {
  wahl: string;
  sicherheit: number;
}

/** Antwort einer Jev-Bewertung (score), auf 0..1 umgerechnet. */
export interface Bewertung {
  wert: number;
  sicherheit: number;
}

export interface JevErgebnis {
  absicht: Wahl;
  /** null, wenn es keine passenden Schichten gab */
  schicht: Wahl | null;
  stimmig: Bewertung | null;
}

export const ABSICHTEN = ["mithilfe_nachtrag", "zahlung", "termin", "sonstiges"] as const;
export type Absicht = (typeof ABSICHTEN)[number];

/** Ab hier gilt eine Jev-Einschätzung als sicher genug, um danach zu handeln. */
export const SICHER_ABSICHT = 0.8;
export const SICHER_SCHICHT = 0.85;
/** Jev „zweifelt“: stimmig unter 0,35 bei Sicherheit ab 0,7 (wie vertrauen_wert in SQL). */
export const ZWEIFEL_WERT = 0.35;
export const ZWEIFEL_SICHERHEIT = 0.7;

export type Schritt =
  /** Nichts automatisch tun, das Team schaut drauf (Vorschlag fürs Team). */
  | { art: "team"; grund: "andere_absicht" | "absicht_unklar" | "jev_fehler" }
  /** Nachfragen, welche Schicht gemeint ist. */
  | { art: "rueckfrage"; grund: "schicht_unklar" }
  /** Die Datenbank versuchen lassen (anwesenheit_melden_fuer). */
  | { art: "melden"; terminKey: string };

export function istZweifel(s: Bewertung | null): boolean {
  return !!s && s.sicherheit >= ZWEIFEL_SICHERHEIT && s.wert < ZWEIFEL_WERT;
}

/** Erster Schritt: was tun mit dieser Nachricht? */
export function entscheide(jev: JevErgebnis | null): Schritt {
  if (!jev) return { art: "team", grund: "jev_fehler" };
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

/** Jev-Score (0 … Stufen-1, auch Bruchteile) auf 0..1. */
export function aufEins(score: number, stufen: number): number {
  if (!(stufen > 1) || !Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(1, score / (stufen - 1)));
}

/**
 * Namen aus einem Text entfernen, bevor er an einen KI-Dienst geht. Ersetzt
 * ganze Wörter (Groß/Klein egal), damit „Ben“ nicht in „Benjamin“ hängt.
 */
export function pseudonymisiere(text: string, namen: string[]): string {
  let t = text;
  const sauber = [...new Set(namen.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of sauber) {
    const muster = new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
    t = t.replace(muster, "Person");
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
