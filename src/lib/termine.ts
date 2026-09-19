/**
 * Termine der Stufe.
 *
 * Datum und Uhrzeit stehen getrennt und als reine Zeichenketten
 * ("2026-09-24", "14:00"). Kein Date-Objekt, keine Zeitzone: ein Termin um
 * 14:00 ist 14:00, egal wo das Handy steht oder wie seine Uhr gestellt ist.
 * Umgerechnet wird erst beim Anzeigen.
 */

export type Sichtbarkeit = "alle" | "komitee" | "personen";

export interface Aktion {
  id: string;
  titel: string;
  icon: string;
  beschreibung: string;
  /** Wie viel Prozent die Mithilfe zaehlt. */
  prozent: number;
  geschlossen: boolean;
  created_at: string;
}

/**
 * Eine Terminanfrage eines Komiteevorsitzes.
 *
 * Bewusst KEIN Termin mit Status: eine Anfrage steht nirgends im Kalender,
 * auch nicht grau. Erst wenn das Stufenteam sie uebernimmt, entsteht ein
 * echter Termin – im ganz normalen Formular, mit allen Einstellungen.
 */
export interface TerminAnfrage {
  id: string;
  /** Komitee, fuer das angefragt wird – das eigene. */
  tag: string;
  titel: string;
  ort: string;
  /** Begruendung an das Stufenteam. */
  nachricht: string;
  datum: string;
  bis_datum: string | null;
  von: string | null;
  bis: string | null;
  status: "offen" | "angenommen" | "abgelehnt";
  created_by: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  /** Antwort des Stufenteams, vor allem beim Ablehnen. */
  antwort: string;
}

export interface NeueAnfrage {
  tag: string;
  titel: string;
  ort: string;
  nachricht: string;
  datum: string;
  bis_datum: string | null;
  von: string | null;
  bis: string | null;
}

export interface Termin {
  id: string;
  titel: string;
  beschreibung: string;
  ort: string;
  /** Tag des Beginns, ISO: 2026-09-24 */
  datum: string;
  /** letzter Tag bei mehrtaegigen Terminen, sonst null */
  bis_datum: string | null;
  /** null = ganztaegig */
  von: string | null;
  bis: string | null;
  sichtbar: Sichtbarkeit;
  fuer_eltern: boolean;
  created_by: string | null;
  created_at: string;
  /** Komitee-Slugs bei sichtbar = "komitee" */
  tags: string[];
  /** student_ids bei sichtbar = "personen", oder die zugeteilten Schichtleute */
  personen: string[];
  /** gesetzt, wenn dieser Termin eine Schicht einer Aktion ist */
  aktion_id: string | null;
  /** wie viele Leute fuer diese Schicht gebraucht werden */
  plaetze: number | null;
  /** eigenes Zeichen im Kalender, z. B. 🧇 */
  icon: string | null;
}

export interface NeuerTermin {
  titel: string;
  beschreibung: string;
  ort: string;
  datum: string;
  bis_datum: string | null;
  von: string | null;
  bis: string | null;
  sichtbar: Sichtbarkeit;
  fuer_eltern: boolean;
  tags: string[];
  personen: string[];
  aktion_id?: string | null;
  plaetze?: number | null;
  icon?: string | null;
}

// ---------------------------------------------------------------- Datum

/** "2026-09-24" – der Schluessel, unter dem ein Tag im Kalender steht. */
export function tagKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

export function heuteKey(): string {
  return tagKey(new Date());
}

/** Aus "2026-09-24" ein Date fuer Rechnereien – immer 12:00, damit die
 *  Sommerzeit-Umstellung den Tag nicht kippt. */
export function ausKey(key: string): Date {
  const [j, m, t] = key.split("-").map(Number);
  return new Date(j, m - 1, t, 12, 0, 0);
}

export function plusTage(key: string, n: number): string {
  const d = ausKey(key);
  d.setDate(d.getDate() + n);
  return tagKey(d);
}

/** Montag der Woche, in der dieser Tag liegt. */
export function montagVon(key: string): string {
  const d = ausKey(key);
  const wt = (d.getDay() + 6) % 7; // Mo = 0
  d.setDate(d.getDate() - wt);
  return tagKey(d);
}

export const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function tagLang(key: string): string {
  const d = ausKey(key);
  return `${WOCHENTAGE[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
}

/** "Mo, 12.10.26" – kurz genug für eine Benachrichtigung. */
export function kurzDatum(key: string): string {
  const d = ausKey(key);
  const tt = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${WOCHENTAGE[(d.getDay() + 6) % 7]}, ${tt}.${mm}.${String(d.getFullYear()).slice(2)}`;
}

export function monatLang(key: string): string {
  const d = ausKey(key);
  return `${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14:00" aus "14:00:00" – die Datenbank liefert Sekunden mit. */
export function uhr(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

/** "14:00 – 16:00", "ab 14:00" oder "ganztägig" */
export function zeitText(t: Termin): string {
  if (!t.von) return "ganztägig";
  return t.bis ? `${uhr(t.von)} – ${uhr(t.bis)}` : `ab ${uhr(t.von)}`;
}

// ---------------------------------------------------------------- Zeitraum

/** Alle Tage, an denen ein Termin stattfindet (mehrtaegige laufen durch). */
export function tageVon(t: Termin): string[] {
  if (!t.bis_datum || t.bis_datum === t.datum) return [t.datum];
  const tage: string[] = [];
  let k = t.datum;
  // Sicherheitsnetz: ein Termin laeuft nie laenger als ein Schuljahr
  for (let i = 0; i < 400 && k <= t.bis_datum; i++) {
    tage.push(k);
    k = plusTage(k, 1);
  }
  return tage;
}

export function laeuftAn(t: Termin, key: string): boolean {
  return key >= t.datum && key <= (t.bis_datum || t.datum);
}

/** Termine eines Tages, frueheste zuerst. Ganztaegige stehen oben. */
export function anTag(termine: Termin[], key: string): Termin[] {
  return termine
    .filter((t) => laeuftAn(t, key))
    .sort((a, b) => (a.von || "").localeCompare(b.von || "") || a.titel.localeCompare(b.titel));
}

/** Die naechsten Termine ab heute. */
export function abHeute(termine: Termin[]): Termin[] {
  const h = heuteKey();
  return termine
    .filter((t) => (t.bis_datum || t.datum) >= h)
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));
}

// ---------------------------------------------------------------- Betroffen

/**
 * Betrifft mich dieser Termin persoenlich?
 *
 * Absichtlich eng: ein Termin fuer die ganze Stufe ist *nicht* "fuer dich".
 * Sonst waere der Marker an fast allem dran und wuerde nichts mehr sagen.
 * Gemeint ist: mein Komitee oder ich namentlich.
 */
export function betrifftMich(
  t: Termin,
  meineKomitees: string[],
  meineStudentIds: string[],
): boolean {
  // Namentlich eingetragen heisst immer "fuer dich" – auch wenn der Termin
  // sonst fuer alle sichtbar ist. Genau das ist der Fall bei einer Schicht:
  // die ganze Stufe sieht den Waffelverkauf, eingeteilt bist aber du.
  if (t.personen.some((id) => meineStudentIds.includes(id))) return true;
  if (t.sichtbar === "komitee") return t.tags.some((tag) => meineKomitees.includes(tag));
  return false;
}

/** Wie der Termin eingeordnet ist – fuer Farbe und Beschriftung. */
export function umfangText(t: Termin, komiteeName: (slug: string) => string): string {
  if (t.sichtbar === "alle") return t.fuer_eltern ? "ganze Stufe · auch Eltern" : "ganze Stufe";
  if (t.sichtbar === "komitee") return t.tags.map(komiteeName).join(", ") || "Komitee";
  return t.personen.length === 1 ? "1 Person" : `${t.personen.length} Personen`;
}

// ---------------------------------------------------------------- Schichten

/** Ist dieser Termin eine Schicht einer Aktion? */
export function istSchicht(t: Termin): boolean {
  return Boolean(t.aktion_id);
}

/** Das Zeichen, das im Kalender vor dem Titel steht. */
export function terminIcon(t: Termin, aktionIcon?: string): string {
  return t.icon || aktionIcon || "";
}

/** Die Wochentage, an denen sich eine Aktion wiederholt. Mo = 1 … So = 7. */
export const WOCHENTAG_WAHL: { nr: number; kurz: string; lang: string }[] = [
  { nr: 1, kurz: "Mo", lang: "Montag" },
  { nr: 2, kurz: "Di", lang: "Dienstag" },
  { nr: 3, kurz: "Mi", lang: "Mittwoch" },
  { nr: 4, kurz: "Do", lang: "Donnerstag" },
  { nr: 5, kurz: "Fr", lang: "Freitag" },
  { nr: 6, kurz: "Sa", lang: "Samstag" },
  { nr: 7, kurz: "So", lang: "Sonntag" },
];

/** Mo = 1 … So = 7, so wie die Leute zaehlen. */
export function wochentagNr(key: string): number {
  const d = ausKey(key);
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Welche Tage zwischen zwei Daten auf die gewaehlten Wochentage fallen.
 *
 * Daraus werden beim Anlegen einzelne Schichten. Die Obergrenze verhindert,
 * dass ein vertipptes Enddatum tausend Zeilen erzeugt.
 */
export function wiederholungsTage(
  von: string,
  bis: string,
  wochentage: number[],
  grenze = 60,
): string[] {
  if (!von || !bis || bis < von || wochentage.length === 0) return [];
  const tage: string[] = [];
  let k = von;
  for (let i = 0; i < 400 && k <= bis && tage.length < grenze; i++) {
    if (wochentage.includes(wochentagNr(k))) tage.push(k);
    k = plusTage(k, 1);
  }
  return tage;
}

// ---------------------------------------------------------------- Anfragen

/**
 * Aus einer Anfrage den Entwurf fuer das Terminformular machen.
 *
 * Die Sichtbarkeit steht dabei schon auf dem anfragenden Komitee – das ist
 * fast immer richtig und laesst sich im Formular mit einem Griff aendern.
 */
export function anfrageAlsEntwurf(a: TerminAnfrage): NeuerTermin {
  return {
    titel: a.titel,
    beschreibung: a.nachricht,
    ort: a.ort,
    datum: a.datum,
    bis_datum: a.bis_datum,
    von: a.von ? uhr(a.von) : null,
    bis: a.bis ? uhr(a.bis) : null,
    sichtbar: "komitee",
    fuer_eltern: false,
    tags: [a.tag],
    personen: [],
  };
}
