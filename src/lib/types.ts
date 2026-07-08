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
  /** Gesamtzahl der Beteiligungen (zusammengefasst, nicht pro Halbjahr). */
  beteiligungen: number;
  terms: Record<Halbjahr, Term>;
  updated_at?: string;
}

export interface Settings {
  aktuelles_halbjahr: Halbjahr;
  /** Benötigte Beteiligungen bis Q2.2. */
  benoetigt: number;
  /** Zusatzbetrag (€), fällig bei Q2.2, wenn Schwelle nicht erreicht. */
  zusatz: number;
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
