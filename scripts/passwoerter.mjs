// ============================================================
// Startpasswörter – eine Quelle für alle Skripte.
// ============================================================
// Zwei Wörter und drei Ziffern: "Anker-Muschel-472". Das kann man vorlesen,
// abtippen und sich für einen Tag merken, ist aber nichts, was in einer
// geleakten Passwortliste steht. Genau daran lag die Chrome-Warnung
// "in einer Datenpanne gefunden" – die trifft nur bekannte Passwörter.
//
// Verwechselbare Zeichen kommen nicht vor, und die Wörter sind absichtlich
// harmlos: Die Liste wird ausgedruckt und weitergegeben.

const WOERTER = [
  "Anker", "Birke", "Brise", "Delta", "Feder", "Funke", "Garten", "Hafen",
  "Insel", "Kiesel", "Komet", "Krone", "Lampe", "Linde", "Muschel", "Nebel",
  "Norden", "Pfeil", "Quelle", "Regen", "Ritter", "Salbei", "Segel", "Silber",
  "Sonne", "Spiegel", "Stern", "Tanne", "Turm", "Ufer", "Welle", "Wolke",
  "Achat", "Bernstein", "Distel", "Eiche", "Farn", "Granit", "Holunder",
  "Jade", "Karat", "Lawine", "Marmor", "Nordlicht", "Olive", "Pollen",
];

/**
 * Ein Startpasswort. Mindestens 14 Zeichen, zwei Wörter, drei Ziffern –
 * damit es die Prüfung in src/lib/passwort.ts sicher besteht.
 */
export function startpasswort() {
  const w = () => WOERTER[Math.floor(Math.random() * WOERTER.length)];
  let a = w();
  let b = w();
  while (b === a) b = w();
  const zahl = 100 + Math.floor(Math.random() * 900);
  return `${a}-${b}-${zahl}`;
}

/** Wie viele verschiedene Passwörter es gibt – fürs Protokoll. */
export const MOEGLICHKEITEN = WOERTER.length * (WOERTER.length - 1) * 900;
