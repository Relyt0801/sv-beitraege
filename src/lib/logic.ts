import { HY, FEE, type Contribution, type Halbjahr, type Settings, type Student } from "./types";

/** Diakritika/Umlaute/Groß-Klein/Whitespace-tolerante Normalisierung für Suche. */
export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function idx(h: Halbjahr): number {
  return HY.indexOf(h);
}
export function joinIdx(st: Student): number {
  return idx(st.beigetreten_ab);
}
export function leftIdx(st: Student): number {
  return st.verlaesst_ab ? idx(st.verlaesst_ab) : Infinity;
}
export function isPreJoin(st: Student, i: number): boolean {
  return i < joinIdx(st);
}
export function isDead(st: Student, i: number): boolean {
  return i >= leftIdx(st);
}
export function isActive(st: Student, i: number): boolean {
  return !isPreJoin(st, i) && !isDead(st, i);
}

/** Offener Basisbetrag: aktive, noch offene Halbjahre bis inkl. aktuellem HJ × 25 €. */
export function basisOffen(st: Student, aktuell: Halbjahr): number {
  const c = idx(aktuell);
  let n = 0;
  HY.forEach((h, i) => {
    if (i <= c && isActive(st, i) && st.terms[h].status === "offen") n++;
  });
  return n * FEE;
}

/** Gesammelte Beitragspunkte einer Person. */
export function punkteVon(contributions: Contribution[], studentId: string): number {
  return contributions.reduce((n, c) => (c.student_id === studentId ? n + c.punkte : n), 0);
}

/** Punkte je Person als Nachschlagetabelle (spart Schleifen in großen Listen). */
export function punkteIndex(contributions: Contribution[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of contributions) m[c.student_id] = (m[c.student_id] || 0) + c.punkte;
  return m;
}

/**
 * Zusatzbetrag fällig? Nur wenn Q2.2 aktiv ist, die Person am Ende noch dabei ist
 * und sie die Zielpunktzahl nicht erreicht hat.
 */
export function zusatzFaellig(st: Student, s: Settings, punkte: number): boolean {
  return s.aktuelles_halbjahr === "Q2.2" && isActive(st, idx("Q2.2")) && punkte < s.ziel_punkte;
}

/** Gesamter offener Betrag inkl. evtl. Zusatzbetrag. */
export function offenGesamt(st: Student, s: Settings, punkte: number): number {
  return basisOffen(st, s.aktuelles_halbjahr) + (zusatzFaellig(st, s, punkte) ? s.zusatz : 0);
}

/** Summe aller offenen Beträge über die ganze Stufe. */
export function offenStufe(list: Student[], s: Settings, punkte: Record<string, number>): number {
  return list.reduce((sum, st) => sum + offenGesamt(st, s, punkte[st.id] || 0), 0);
}

export function sortStudents(list: Student[]): Student[] {
  return [...list].sort(
    (a, b) =>
      a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"),
  );
}
