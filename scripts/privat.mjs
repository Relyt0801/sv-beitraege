// ============================================================
// Zentraler Ort fuer alle VERTRAULICHEN Dateien: <Projektstamm>/privat/
// Der Ordner ist in .gitignore ausgeschlossen und wird zusaetzlich vom
// Pre-Commit-Hook blockiert. Fuehrende Datenquelle bleibt die Datenbank;
// diese Dateien sind nur kurzlebige Arbeitskopien.
// ============================================================
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const PRIVAT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "privat");

/** Pfad zum Lesen. Blosser Dateiname -> privat/<name>. Enthaelt der Wert einen
 *  Ordner oder ist er absolut, wird er unveraendert benutzt. */
export function priv(name) {
  if (isAbsolute(name) || name.includes("/") || name.includes("\\\\")) return name;
  const p = resolve(PRIVAT, name);
  if (!existsSync(p) && existsSync(name)) {
    console.warn(`! ${name} liegt noch im Projektstamm - bitte nach privat/ verschieben.`);
    return name;
  }
  return p;
}

/** Pfad zum Schreiben - legt privat/ bei Bedarf an. */
export function privOut(name) {
  mkdirSync(PRIVAT, { recursive: true });
  if (isAbsolute(name) || name.includes("/") || name.includes("\\")) return name;
  return resolve(PRIVAT, name);
}
