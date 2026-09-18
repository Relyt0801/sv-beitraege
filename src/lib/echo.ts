/**
 * Was man selbst gerade gespeichert hat, soll nicht Sekunden später vom Server
 * zurückkommen und die eigene Eingabe überschreiben.
 *
 * Ablauf ohne diese Bremse: Du tippst einen Buchstaben, die App schreibt ihn in
 * die Datenbank, die Datenbank meldet die Änderung an alle zurück – auch an
 * dich. Dieses Echo kommt mit Verzögerung an und setzt das Eingabefeld auf einen
 * Stand zurück, der schon veraltet ist. Genau so verschwinden Zeichen beim
 * Tippen.
 *
 * ----------------------------------------------------------------------------
 * Warum das hier umgebaut wurde
 * ----------------------------------------------------------------------------
 * Vorher wurde das Echo **weggeworfen**, und zwar nach Zeilen-Nummer: "an Zeile
 * X habe ich vor weniger als 5 Sekunden etwas geändert, also ignoriere ich
 * alles, was zu Zeile X hereinkommt".
 *
 * Damit verschwanden auch die Änderungen **anderer Leute**. Zwei Beispiele aus
 * dem Alltag:
 *
 * - Du hakst bei Anna ein Halbjahr ab, der Kassenwart trägt zwei Sekunden
 *   später bei derselben Anna "verlässt ab" ein. Bei dir kam das nie an.
 * - Bei den Einstellungen war der Schlüssel sogar ein fester Text
 *   ("einstellungen"). Wer irgendetwas umstellte, machte damit für fünf
 *   Sekunden **alle** Einstellungsänderungen von **allen** unsichtbar.
 *
 * Das passt genau zur Meldung "Ansichten werden bei anderen nicht sofort
 * aktualisiert".
 *
 * Jetzt wird nichts mehr weggeworfen, sondern **zusammengeführt**: die Zeile
 * vom Server wird übernommen, nur die Felder, die man selbst gerade geschrieben
 * hat, behalten für einen Moment Vorrang. Fremde Änderungen an anderen Feldern
 * kommen also sofort an, und das eigene Tippen wird trotzdem nicht überschrieben.
 */

interface Eigene {
  zeit: number;
  /** Die Felder, die man selbst geschrieben hat – nur die haben Vorrang. */
  felder: Record<string, unknown>;
}

const eigene = new Map<string, Eigene>();

/** So lange behalten die eigenen Felder Vorrang. */
const DAUER = 5000;

/**
 * Merken, was man selbst geschrieben hat.
 *
 * `felder` sind die Werte, die gerade an die Datenbank gegangen sind. Ohne
 * Angabe gilt weiterhin die ganze Zeile als "meine" – das ist der Notfall für
 * Aufrufer, die ihren Patch nicht zur Hand haben.
 */
export function merkeEigeneAenderung(schluessel: string, felder?: Record<string, unknown>): void {
  eigene.set(schluessel, { zeit: Date.now(), felder: felder ?? {} });
  if (eigene.size > 300) aufraeumen();
}

/**
 * Die eigenen Felder zu dieser Zeile, solange sie noch frisch sind.
 *
 * Gibt null zurück, wenn man an der Zeile nichts gemacht hat oder es zu lange
 * her ist – dann gilt der Stand vom Server unverändert.
 */
export function eigeneFelder(schluessel: string): Record<string, unknown> | null {
  const e = eigene.get(schluessel);
  if (!e) return null;
  if (Date.now() - e.zeit > DAUER) {
    eigene.delete(schluessel);
    return null;
  }
  return e.felder;
}

/**
 * Den Stand vom Server mit den eigenen frischen Feldern überlagern.
 *
 * Das ist der übliche Weg: `zusammenfuehren("student:" + id, zeileVomServer)`.
 */
export function zusammenfuehren<T extends object>(schluessel: string, vomServer: T): T {
  const meins = eigeneFelder(schluessel);
  if (!meins || Object.keys(meins).length === 0) return vomServer;
  return { ...vomServer, ...meins };
}

/** Beim Abmelden alles vergessen – sonst gilt es für den nächsten Nutzer weiter. */
export function echoLeeren(): void {
  eigene.clear();
}

function aufraeumen(): void {
  const jetzt = Date.now();
  for (const [k, e] of eigene) if (jetzt - e.zeit > DAUER) eigene.delete(k);
}
