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
 * Deshalb merken wir uns kurz, was aus dieser App heraus geändert wurde, und
 * überspringen das passende Echo. Änderungen von anderen Leuten kommen
 * weiterhin sofort an.
 */

const eigene = new Map<string, number>();

/** So lange gilt eine Änderung als "die habe ich selbst gemacht". */
const DAUER = 5000;

export function merkeEigeneAenderung(schluessel: string): void {
  eigene.set(schluessel, Date.now());
  if (eigene.size > 300) aufraeumen();
}

export function istEigenesEcho(schluessel: string): boolean {
  const zeit = eigene.get(schluessel);
  if (zeit == null) return false;
  if (Date.now() - zeit > DAUER) {
    eigene.delete(schluessel);
    return false;
  }
  return true;
}

function aufraeumen(): void {
  const jetzt = Date.now();
  for (const [k, zeit] of eigene) if (jetzt - zeit > DAUER) eigene.delete(k);
}
