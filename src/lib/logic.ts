import { HY, FEE, type Halbjahr, type Student } from "./types";

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

/** Vor dem Beitritt: Halbjahr zählt nicht (grau). */
export function isPreJoin(st: Student, i: number): boolean {
  return i < joinIdx(st);
}

/** Ab Verlassen: Halbjahr zählt nicht (rot). */
export function isDead(st: Student, i: number): boolean {
  return i >= leftIdx(st);
}

/** Halbjahr ist für diesen Schüler aktiv (zwischen Beitritt und Verlassen). */
export function isActive(st: Student, i: number): boolean {
  return !isPreJoin(st, i) && !isDead(st, i);
}

/** Offener Betrag: alle aktiven, noch offenen Halbjahre bis inkl. aktuellem HJ. */
export function offenBetrag(st: Student, aktuell: Halbjahr): number {
  const c = idx(aktuell);
  let n = 0;
  HY.forEach((h, i) => {
    if (i <= c && isActive(st, i) && st.terms[h].status === "offen") n++;
  });
  return n * FEE;
}

export function totalBet(st: Student): number {
  return HY.reduce((s, h) => s + st.terms[h].bet, 0);
}

export function sortStudents(list: Student[]): Student[] {
  return [...list].sort(
    (a, b) =>
      a.nachname.localeCompare(b.nachname, "de") ||
      a.vorname.localeCompare(b.vorname, "de"),
  );
}
