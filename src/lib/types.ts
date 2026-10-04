export const HY = ["EF.1", "EF.2", "Q1.1", "Q1.2", "Q2.1", "Q2.2"] as const;
export type Halbjahr = (typeof HY)[number];

export type Status = "offen" | "bezahlt" | "erlassen";
export const STATI: Status[] = ["offen", "bezahlt", "erlassen"];

export interface Term {
  status: Status;
}

export interface Student {
  id: string;
  nachname: string;
  vorname: string;
  beigetreten_ab: Halbjahr;
  verlaesst_ab: Halbjahr | null;
  /** @deprecated Alte Zählung vor den Beitragspunkten – wird nicht mehr angezeigt. */
  beteiligungen: number;
  terms: Record<Halbjahr, Term>;
  updated_at?: string;
}

/** Eine Stufe der Abiball-Staffel: ab X % kostet das Ticket Y €. */
export interface Staffel {
  /** ab wie viel Prozent diese Stufe gilt */
  ab: number;
  /** Zusatzbeitrag zum Abiballticket in € */
  betrag: number;
}

/**
 * Standard-Staffel: alle 25 % sinkt der Zusatzbeitrag zum Abiballticket.
 *   0 % = 50 €, 25 % = 40 €, 50 % = 25 €, 75 % = 10 €, 100 % = 0 €
 */
export const STAFFEL_STANDARD: Staffel[] = [
  { ab: 0, betrag: 50 },
  { ab: 25, betrag: 40 },
  { ab: 50, betrag: 25 },
  { ab: 75, betrag: 10 },
  { ab: 100, betrag: 0 },
];

export interface Settings {
  aktuelles_halbjahr: Halbjahr;
  /** Prozent, die als "voll" gelten – normalerweise 100. */
  ziel_punkte: number;
  /**
   * @deprecated Fester Zusatzbetrag aus dem alten Konzept. Die Staffel hat ihn
   * abgelöst; der Wert bleibt nur, damit alte Datenbankzeilen nicht stören.
   */
  zusatz: number;
  /** Abiball-Staffel, aufsteigend nach "ab". */
  staffel: Staffel[];
  /** Grundpreis eines Abiballtickets in €. 0 = steht noch nicht fest. */
  ticket_preis: number;
  /** Was jedes Halbjahr kostet. */
  beitraege: Beitraege;
  /** Abiball: Bonus über 100 %, Ticketverkauf, Ort/Datum (app_settings.abiball) */
  abiball: Abiball;
}

/**
 * Einstellungen rund um den Abiball (eine jsonb-Spalte, damit neue Felder
 * keine neue Spalte brauchen).
 */
export interface Abiball {
  /** Über 100 % sammeln erlaubt (Standard: aus) */
  ueber100: boolean;
  /** Alle so viel Prozent über 100 … */
  bonusSchritt: number;
  /** … wird das 1. Ticket um so viel € günstiger */
  bonusProSchritt: number;
  /** Höchstens so viel € Bonus insgesamt */
  bonusMax: number;
  /** Ab wann Tickets bestellt werden können (ISO), null = Verkauf nicht freigegeben */
  verkaufAb: string | null;
  /** Höchstens so viele Tickets je Person */
  maxProPerson: number;
  /** Tickets insgesamt, 0 = unbegrenzt */
  kontingent: number;
  /** Ort, Tag (YYYY-MM-DD) und Uhrzeit (HH:MM) – erscheinen erst auf dem Ticket, wenn eingetragen */
  ort: string;
  datum: string | null;
  uhrzeit: string;
}

export const ABIBALL_STANDARD: Abiball = {
  ueber100: false,
  bonusSchritt: 10,
  bonusProSchritt: 2,
  bonusMax: 10,
  verkaufAb: null,
  maxProPerson: 4,
  kontingent: 0,
  ort: "",
  datum: null,
  uhrzeit: "",
};

/** Kontodaten der Stufenkasse. Stehen nur in der Datenbank, nie im Quellcode. */
export interface BankKonto {
  inhaber: string;
  iban: string;
  bic: string;
  bank: string;
  hinweis: string;
}

/** Ein einzelner Beitrag ("Kuchen gebacken", "Girolauf") mit Prozentwert. */
export interface Contribution {
  id: string;
  student_id: string;
  titel: string;
  punkte: number;
  datum: string; // ISO-Datum (YYYY-MM-DD)
  created_by?: string | null;
  created_at?: string;
}

/** Vorlage für typische Beiträge ("Kuchen gebacken", 5 %). */
export interface ContribTemplate {
  id: string;
  titel: string;
  punkte: number;
  sort: number;
  /** Wert beim Eintragen anpassbar (z. B. "je nach Aufwand 3–10 %"). */
  variabel?: boolean;
}

/**
 * @deprecated Fruher waren 25 Euro pro Halbjahr fest verdrahtet. Was ein
 * Halbjahr kostet, steht jetzt in den Einstellungen (Settings.beitraege) und
 * laesst sich von Admin und Kassenwart aendern. Dieser Wert dient nur noch als
 * Rueckfall, solange die Einstellungen nicht geladen sind.
 */
export const FEE = 25;

/** Was ein Halbjahr kostet. EF guenstiger, ab Q1 das Doppelte. */
export type Beitraege = Record<Halbjahr, number>;

export const BEITRAEGE_STANDARD: Beitraege = {
  "EF.1": 25,
  "EF.2": 25,
  "Q1.1": 50,
  "Q1.2": 50,
  "Q2.1": 50,
  "Q2.2": 50,
};

export function emptyTerms(): Record<Halbjahr, Term> {
  const t = {} as Record<Halbjahr, Term>;
  for (const h of HY) t[h] = { status: "offen" };
  return t;
}

export function newStudent(nachname: string, vorname: string, beigetreten_ab: Halbjahr = "EF.1"): Student {
  return {
    id: crypto.randomUUID(),
    nachname: nachname.trim(),
    vorname: vorname.trim(),
    beigetreten_ab,
    verlaesst_ab: null,
    beteiligungen: 0,
    terms: emptyTerms(),
  };
}
