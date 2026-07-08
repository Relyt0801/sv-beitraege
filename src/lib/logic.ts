import { HY, FEE, type Halbjahr, type Settings, type Student } from "./types";

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

/** Zusatzbetrag fällig? Nur wenn Q2.2 aktiv, Schüler am Ende noch dabei und Schwelle nicht erreicht. */
export function zusatzFaellig(st: Student, s: Settings): boolean {
  return s.aktuelles_halbjahr === "Q2.2" && isActive(st, idx("Q2.2")) && st.beteiligungen < s.benoetigt;
}

/** Gesamter offener Betrag inkl. evtl. Zusatzbetrag. */
export function offenGesamt(st: Student, s: Settings): number {
  return basisOffen(st, s.aktuelles_halbjahr) + (zusatzFaellig(st, s) ? s.zusatz : 0);
}

/** Summe aller offenen Beträge über die ganze Stufe. */
export function offenStufe(list: Student[], s: Settings): number {
  return list.reduce((sum, st) => sum + offenGesamt(st, s), 0);
}

export function sortStudents(list: Student[]): Student[] {
  return [...list].sort(
    (a, b) =>
      a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"),
  );
}
