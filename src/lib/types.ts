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

export const FEE = 25;

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
