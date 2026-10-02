/**
 * Vertrauens-Check, Anwesenheits-Abfrage und Assistent (Update Abi28).
 *
 * Wie das zusammenspielt, steht ausführlich in supabase/update-abi28.sql.
 * Kurz:
 *   - Nach einer Schicht fragt die App die Eingeteilten „Warst du da?“.
 *   - „Ja“ wird nur dann sofort eingetragen, wenn die Person eingeteilt war,
 *     dem Vertrauens-Check zugestimmt hat und ihr Score hoch genug ist. Sonst
 *     schaut das Stufenteam einmal drauf. Ein niedriger Score lehnt nie ab.
 *   - TESTPHASE: Score, Einwilligung und Assistent gibt es vorerst nur für
 *     Admins und Testkonten (Recht ki.test). Alle anderen: Angabe → Team.
 *   - Den Score sieht nur der Admin.
 */

/** Stand der Datenschutzerklärung mit dem Abschnitt zum Vertrauens-Check. */
export const DATENSCHUTZ_VERSION = "2026-10-02";

export type AnwesenheitStatus = "offen" | "auto" | "bestaetigt" | "falsch" | "erledigt";

export interface Anwesenheit {
  id: string;
  termin_id: string;
  student_id: string;
  user_id: string | null;
  angabe: "da" | "nicht_da";
  status: AnwesenheitStatus;
  quelle: "abfrage" | "chat";
  eingeteilt: boolean;
  created_at: string;
}

/** Was der Assistent zu einer Chat-Nachricht gemacht hat – fürs Team, ohne Score. */
export interface Vorschlag {
  id: string;
  item_id: string | null;
  topic_id: string | null;
  user_id: string | null;
  student_id: string | null;
  absicht: string;
  termin_id: string | null;
  ergebnis: "auto" | "rueckfrage" | "team" | "fehler" | "laeuft" | string;
  antwort: string | null;
  vorschlag: string | null;
  sql_vorschlag: string | null;
  status: "offen" | "erledigt" | "verworfen";
  created_at: string;
}

/** Eine Zeile der Admin-Übersicht (vertrauen_liste()). */
export interface VertrauenZeile {
  user_id: string;
  name: string;
  username: string | null;
  rolle: string;
  student_id: string | null;
  freigeschaltet: boolean;
  einwilligung: boolean | null;
  einwilligung_at: string | null;
  bestaetigt: number;
  falsch: number;
  bilanz: number | null;
  jev_wert: number | null;
  jev_sicherheit: number | null;
  jev_at: string | null;
  wert: number | null;
  offene_angaben: number;
}

export interface KiEinstellungen {
  schwelle: number;
  assistent_an: boolean;
  stil: string;
}

/** Was die Datenbank auf „Warst du da?“ antwortet – als Satz für die Person. */
export function meldeText(status: string, schicht: string): string {
  switch (status) {
    case "auto":
      return `Eingetragen – danke fürs Mithelfen bei ${schicht}! 🙌`;
    case "offen":
      return "Danke! Das Stufenteam schaut kurz drüber und trägt es dann ein.";
    case "nicht_da":
      return "Alles klar, danke für die ehrliche Antwort.";
    case "schon_eingetragen":
      return "Ist schon eingetragen – da musst du nichts mehr machen.";
    case "ohne_punkte":
      return "Danke! Für diese Schicht gibt es keine Prozente.";
    default:
      return "Danke, ist angekommen.";
  }
}

/** Fehlt eine Tabelle oder Funktion, ist update-abi28.sql noch nicht eingespielt. */
export function fehltSql(msg: string | undefined | null): boolean {
  return Boolean(msg && /does not exist|schema cache|Could not find|not found/i.test(msg));
}

/** 0..1 als Prozentzahl für den Admin. */
export function prozentText(x: number | null | undefined): string {
  return x == null ? "–" : `${Math.round(x * 100)} %`;
}
