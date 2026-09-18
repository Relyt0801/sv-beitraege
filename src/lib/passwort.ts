/**
 * Prüft, ob ein neues Passwort tauglich ist.
 *
 * Hintergrund: Der Browser warnt, wenn jemand ein Passwort setzt, das in
 * bekannten Datenlecks auftaucht – "123456" zum Beispiel. Damit diese Warnung
 * gar nicht erst nötig wird, lehnt die App solche Passwörter direkt ab und
 * sagt auch, warum.
 *
 * Gibt null zurück, wenn alles in Ordnung ist, sonst den Grund im Klartext.
 */

/** Die Passwörter, die in jeder Lecksammlung ganz oben stehen. */
const ZU_BEKANNT = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "password", "passwort", "qwertz", "qwerty", "qwertz123", "abc123",
  "111111", "000000", "123123", "654321", "passwort1", "password1",
  "iloveyou", "sonnenschein", "hallo123", "willkommen", "test1234",
  "geheim", "geheim123", "schule123", "abi2028", "abi28",
]);

export function passwortProblem(pw: string, nutzername?: string): string | null {
  const p = (pw || "").trim();

  if (p.length < 8) return "Bitte mindestens 8 Zeichen.";
  if (p.length > 200) return "Das ist zu lang.";

  const klein = p.toLowerCase();
  if (ZU_BEKANNT.has(klein))
    return "Dieses Passwort ist zu bekannt. Denk dir etwas Eigenes aus.";

  // Reine Zahlenketten und stures Durchzählen sind schnell geraten.
  if (/^\d+$/.test(p)) return "Nur Zahlen ist zu wenig. Nimm auch Buchstaben dazu.";
  if (/^(.)\1+$/.test(p)) return "Immer derselbe Buchstabe reicht nicht.";
  if (/^(0123456789|abcdefghij|qwertzuiop)/.test(klein))
    return "Das ist eine Tastaturreihe. Denk dir etwas Eigenes aus.";

  if (nutzername) {
    const n = nutzername.toLowerCase();
    if (klein.includes(n) || n.includes(klein))
      return "Nimm nicht deinen Nutzernamen als Passwort.";
    // auch Vor- und Nachname einzeln
    for (const teil of n.split(/[._-]/)) {
      if (teil.length >= 4 && klein.includes(teil))
        return "In deinem Passwort steht dein Name. Nimm lieber etwas anderes.";
    }
  }

  return null;
}

/** Kleine Einschätzung für die Anzeige unter dem Eingabefeld. */
export function passwortStaerke(pw: string): { stufe: 0 | 1 | 2 | 3; text: string } {
  const p = (pw || "").trim();
  if (p.length < 8) return { stufe: 0, text: "zu kurz" };
  let punkte = 0;
  if (p.length >= 12) punkte++;
  if (/[a-zäöüß]/.test(p) && /[A-ZÄÖÜ]/.test(p)) punkte++;
  if (/\d/.test(p)) punkte++;
  if (/[^\w\s]/.test(p)) punkte++;
  if (punkte <= 1) return { stufe: 1, text: "geht so" };
  if (punkte === 2) return { stufe: 2, text: "gut" };
  return { stufe: 3, text: "sehr gut" };
}
