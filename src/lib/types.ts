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

export interface Settings {
  aktuelles_halbjahr: Halbjahr;
  /** Beitragspunkte, die jede Person bis zum Ende sammeln muss. */
  ziel_punkte: number;
  /** Zusatzbetrag (€), fällig am Ende, wenn die Zielpunktzahl nicht erreicht ist. */
  zusatz: number;
}

/** Ein einzelner Beitrag ("Kuchen gebacken", "Stände aufgebaut") mit Punktwert. */
export interface Contribution {
  id: string;
  student_id: string;
  titel: string;
  punkte: number;
  datum: string; // ISO-Datum (YYYY-MM-DD)
  created_by?: string | null;
  created_at?: string;
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
