// Erzeugt kontakte.csv mit den Schulmails (vorname.nachname@<domain>) für alle
// Personen aus dem App-Export – zum direkten Verfüttern an send-credentials.mjs.
//
//   node scripts/make-kontakte.mjs stufenkasse-export.json remigianum.borken.de
//
// Regeln (aus den bestätigten Beispielen):
//   Anna-Lena Ebbing            -> anna-lena.ebbing@...
//   Juli Charlotte von Laszewski-> juli.vonlaszewski@...
//   Lotta Große Kleimann        -> lotta.grossekleimann@...
//   Filip Gâta Dobrei           -> filip.gatadobrei@...
//   Sarah-Maria Knüsting        -> sarah-maria.knuesting@...

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] || "stufenkasse-export.json";
const domain = process.argv[3] || "remigianum.borken.de";

function clean(s) {
  return (s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ").trim();
}
const vornamePart = (s) => clean(s).split(" ")[0].replace(/^-+|-+$/g, "");
const nachnamePart = (s) => clean(s).replace(/ /g, "").replace(/^-+|-+$/g, "");

const students = JSON.parse(readFileSync(file, "utf8")).students;
const rows = [["nachname", "vorname", "email", "handy"]];
for (const st of students) {
  const email = `${vornamePart(st.vorname)}.${nachnamePart(st.nachname)}@${domain}`;
  rows.push([st.nachname, st.vorname, email, ""]);
}
const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
writeFileSync("kontakte.csv", csv);
console.log(`✓ kontakte.csv erzeugt (${rows.length - 1} Schulmails @${domain}).`);
console.log("Stichproben:");
for (const r of rows.slice(1, 4)) console.log("  " + r[2]);
