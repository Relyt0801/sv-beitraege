import { HY, FEE, STAFFEL_STANDARD, type Contribution, type Halbjahr, type Settings, type Staffel, type Student } from "./types";

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

/** Staffel aus den Einstellungen, sortiert – mit Rückfall auf den Standard. */
export function staffelVon(s: Settings): Staffel[] {
  const roh = Array.isArray(s.staffel) && s.staffel.length ? s.staffel : STAFFEL_STANDARD;
  return [...roh].sort((a, b) => a.ab - b.ab);
}

/** Gesammelte Prozent, gedeckelt bei 100 (mehr bringt nichts mehr). */
export function prozentVon(punkte: number, s: Settings): number {
  const ziel = Math.max(1, s.ziel_punkte);
  return Math.max(0, Math.min(100, Math.round((punkte / ziel) * 100)));
}

/**
 * Zusatzbeitrag zum Abiballticket bei diesem Prozentstand.
 * Es gilt die höchste Stufe, die erreicht ist: 60 % fällt in die 50-%-Stufe.
 */
export function ticketBetrag(prozent: number, s: Settings): number {
  const staffel = staffelVon(s);
  let betrag = staffel[0]?.betrag ?? 0;
  for (const stufe of staffel) if (prozent >= stufe.ab) betrag = stufe.betrag;
  return betrag;
}

/** Nächste Stufe: wie viel Prozent fehlen und was spart das? null = schon oben. */
export function naechsteStufe(
  prozent: number,
  s: Settings,
): { ab: number; betrag: number; fehlt: number; spart: number } | null {
  const staffel = staffelVon(s);
  const naechste = staffel.find((x) => x.ab > prozent);
  if (!naechste) return null;
  return {
    ab: naechste.ab,
    betrag: naechste.betrag,
    fehlt: naechste.ab - prozent,
    spart: ticketBetrag(prozent, s) - naechste.betrag,
  };
}

/**
 * Zusatzbeitrag zum ersten Abiballticket in €.
 * Steht getrennt von den Halbjahresbeiträgen und wird NICHT dazugerechnet.
 */
export function zusatzBetrag(_st: Student, s: Settings, punkte: number): number {
  return ticketBetrag(prozentVon(punkte, s), s);
}

/** Kostet das erste Ticket mehr als die weiteren? */
export function zusatzFaellig(st: Student, s: Settings, punkte: number): boolean {
  return zusatzBetrag(st, s, punkte) > 0;
}

/** Preis des ERSTEN Tickets: Grundpreis + Zusatzbeitrag. */
export function ersteTicket(st: Student, s: Settings, punkte: number): number {
  return (s.ticket_preis || 0) + zusatzBetrag(st, s, punkte);
}

/**
 * Offener Betrag der Stufenkasse – nur die Halbjahresbeiträge.
 * Das Abiballticket läuft getrennt und wird bewusst nicht addiert.
 */
export function offenGesamt(st: Student, s: Settings, _punkte?: number): number {
  return basisOffen(st, s.aktuelles_halbjahr);
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
