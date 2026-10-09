import { HY, FEE, BEITRAEGE_STANDARD, STAFFEL_STANDARD, ABIBALL_STANDARD, type Abiball, type Beitraege, type Contribution, type Halbjahr, type Settings, type Staffel, type Student } from "./types";

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

/** Was die Halbjahre kosten – mit Rueckfall, falls die Einstellungen fehlen. */
export function beitraegeVon(s: Settings): Beitraege {
  const roh = s.beitraege;
  if (!roh) return BEITRAEGE_STANDARD;
  const aus = { ...BEITRAEGE_STANDARD };
  for (const h of HY) if (typeof roh[h] === "number") aus[h] = roh[h];
  return aus;
}

/** Was ein einzelnes Halbjahr kostet. */
export function beitragFuer(h: Halbjahr, s: Settings): number {
  return beitraegeVon(s)[h] ?? FEE;
}

/**
 * Offener Betrag: alle Halbjahre bis einschliesslich dem aktuellen, in denen
 * die Person dabei ist und noch nicht bezahlt hat. Jedes Halbjahr zaehlt mit
 * seinem eigenen Preis – die EF ist guenstiger als die Q-Phase.
 */
export function basisOffen(st: Student, aktuell: Halbjahr, s?: Settings): number {
  const preise = s ? beitraegeVon(s) : BEITRAEGE_STANDARD;
  const c = idx(aktuell);
  let summe = 0;
  HY.forEach((h, i) => {
    if (i <= c && isActive(st, i) && st.terms[h].status === "offen") summe += preise[h] ?? FEE;
  });
  return summe;
}

/** Was insgesamt zu zahlen ist, wenn man alle Halbjahre mitmacht. */
export function beitragGesamt(st: Student, s: Settings): number {
  const preise = beitraegeVon(s);
  let summe = 0;
  HY.forEach((h, i) => {
    if (isActive(st, i)) summe += preise[h] ?? FEE;
  });
  return summe;
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

/** Abiball-Einstellungen mit Standardwerten für alles, was fehlt. */
export function abiballVon(s: Settings): Abiball {
  const a = { ...ABIBALL_STANDARD, ...(s.abiball || {}) };
  const n = (v: unknown, f: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : f);
  // Früher stand Datum und Uhrzeit zusammen in „datum“ (2027-06-26T19:00)
  let datum = a.datum || null;
  let uhrzeit = a.uhrzeit || "";
  if (datum && datum.includes("T")) {
    uhrzeit = uhrzeit || datum.slice(11, 16);
    datum = datum.slice(0, 10);
  }
  return {
    ...a,
    datum,
    uhrzeit,
    bonusSchritt: Math.max(1, Math.min(100, n(a.bonusSchritt, 10))),
    bonusProSchritt: Math.max(0, Math.min(100, n(a.bonusProSchritt, 2))),
    bonusMax: Math.max(0, Math.min(500, n(a.bonusMax, 10))),
    maxProPerson: Math.max(1, Math.min(20, n(a.maxProPerson, 4))),
    kontingent: Math.max(0, n(a.kontingent, 0)),
  };
}

/**
 * Bis wie viel Prozent es noch etwas bringt: dort ist der höchste Bonus
 * erreicht (z. B. alle 10 % 2 €, höchstens 10 € → 150 %). Darüber zählt
 * nichts mehr.
 */
export function bonusGrenze(a: Abiball): number {
  if (a.bonusProSchritt <= 0 || a.bonusMax <= 0) return 100 + a.bonusSchritt;
  return Math.min(1000, 100 + Math.ceil(a.bonusMax / a.bonusProSchritt) * a.bonusSchritt);
}

/** Bonus in € bei diesem Stand (ohne Deckel durch den Ticketpreis). */
export function bonusEuro(prozent: number, a: Abiball): number {
  if (!a.ueber100 || prozent <= 100) return 0;
  return Math.min(a.bonusMax, Math.floor((prozent - 100) / a.bonusSchritt) * a.bonusProSchritt);
}

/**
 * Gesammelte Prozent. Normal gedeckelt bei 100 (mehr bringt nichts). Ist
 * „Über 100 %“ an, zählt es weiter bis zum höchsten Bonus.
 */
export function prozentVon(punkte: number, s: Settings): number {
  const ziel = Math.max(1, s.ziel_punkte);
  const a = abiballVon(s);
  const deckel = a.ueber100 ? bonusGrenze(a) : 100;
  return Math.max(0, Math.min(deckel, Math.round((punkte / ziel) * 100)));
}

/** Wie weit im Bonus-Bereich (über 100 %)? 0 … 1 – 0, wenn der Modus aus ist. */
export function bonusAnteil(prozent: number, s: Settings): number {
  const a = abiballVon(s);
  if (!a.ueber100 || prozent <= 100) return 0;
  return Math.min(1, (prozent - 100) / (bonusGrenze(a) - 100));
}

/**
 * Alles, was man über die Ticketpreise wissen muss – eine Stelle für alle
 * Ansichten:
 *  standard  = Grundpreis + Aufschlag bei 0 % (der „Listenpreis“)
 *  erstes    = was das eigene 1. Ticket bei diesem Stand kostet
 *  weiteres  = jedes weitere Ticket (Grundpreis)
 *  rabatt    = Bonus über 100 % (nur, wenn eingeschaltet)
 */
export function ticketPreise(prozent: number, s: Settings) {
  const grund = s.ticket_preis || 0;
  const aufschlag0 = ticketBetrag(0, s);
  const aufschlag = ticketBetrag(Math.min(prozent, 100), s);
  const a = abiballVon(s);
  const rabatt = Math.min(grund + aufschlag, bonusEuro(prozent, a));
  return {
    grund,
    preisSteht: grund > 0,
    aufschlag0,
    aufschlag,
    rabatt,
    standard: grund + aufschlag0,
    erstes: grund + aufschlag - rabatt,
    weiteres: grund,
    gespart: aufschlag0 - aufschlag + rabatt,
  };
}

/** Was eine Bestellung von n Tickets kostet (das erste zum eigenen Preis). */
export function bestellBetrag(anzahl: number, prozent: number, s: Settings): number {
  if (anzahl <= 0) return 0;
  const p = ticketPreise(prozent, s);
  return p.erstes + (anzahl - 1) * p.weiteres;
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
  return basisOffen(st, s.aktuelles_halbjahr, s);
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

/** Hat die Person die Stufe verlassen? (verlässt im laufenden Halbjahr oder früher) */
export function hatVerlassen(st: Student, aktuell: Halbjahr): boolean {
  return leftIdx(st) <= idx(aktuell);
}
