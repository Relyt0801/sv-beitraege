// Erzeugt aus accounts.csv eine druckbare HTML-Seite mit Zugangs-Kärtchen
// (zum Ausdrucken, Ausschneiden und Austeilen).
//
//   node scripts/make-zettel.mjs accounts.csv https://deine-app.vercel.app
//
// Ergebnis: zettel.html  ->  im Browser öffnen  ->  Strg+P  ->  drucken / als PDF.

import { readFileSync, writeFileSync } from "node:fs";

const csvFile = process.argv[2] || "accounts.csv";
const appUrl = process.argv[3] || "https://sv-beitraege.vercel.app/";

function parseCSV(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const out = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out;
    });
}

const rows = parseCSV(readFileSync(csvFile, "utf8"));
const data = rows.slice(1); // Kopfzeile weg

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const cards = data
  .map(
    ([nachname, vorname, user, pass]) => `
  <div class="card">
    <div class="name">${esc(vorname)} ${esc(nachname)}</div>
    <div class="row"><span>App:</span><b>${esc(appUrl)}</b></div>
    <div class="row"><span>Benutzername:</span><b>${esc(user)}</b></div>
    <div class="row"><span>Startpasswort:</span><b class="pw">${esc(pass)}</b></div>
    <div class="hint">Beim ersten Login legst du ein eigenes Passwort fest.<br>
    iPhone: Seite über Teilen → „Zum Home-Bildschirm" installieren.</div>
  </div>`,
  )
  .join("\n");

writeFileSync(
  "zettel.html",
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Zugangsdaten Stufenkasse</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:10mm;font-size:10pt}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
  .card{border:1.5px dashed #999;border-radius:8px;padding:5mm;break-inside:avoid}
  .name{font-weight:800;font-size:12pt;margin-bottom:2mm}
  .row{display:flex;gap:2mm;margin:1mm 0}
  .row span{color:#666;min-width:30mm}
  .pw{font-family:Consolas,monospace;font-size:11pt;letter-spacing:.5px}
  .hint{margin-top:2mm;font-size:8pt;color:#777;line-height:1.35}
  @media print{ .card{page-break-inside:avoid} }
</style></head><body>
<div class="grid">${cards}</div>
</body></html>`,
);
console.log(`✓ zettel.html erzeugt (${data.length} Kärtchen) – im Browser öffnen und drucken (Strg+P).`);
