// Erzeugt nachrichten.html: pro Person die fertige Copy-Paste-Nachricht mit
// Kopieren-Button und Abhak-Checkliste (für WhatsApp, Teams, egal was).
//
//   node scripts/make-nachrichten.mjs accounts.csv https://deine-app.vercel.app

import { readFileSync, writeFileSync } from "node:fs";

const accFile = process.argv[2] || "accounts.csv";
const appUrl = process.argv[3] || "https://sv-beitraege.vercel.app";

function parseCSV(text) {
  return text.trim().split(/\r?\n/).map((line) => {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

function message(user, pass) {
  return `Moin, wir haben von der Stufe eine App erstellt, in der du sehen kannst, ob die Stufenbeiträge schon bezahlt sind, ob aktuell Veranstaltungen stattfinden usw.

1. Öffne ${appUrl}
2. Melde dich mit diesen Daten an:
Nutzername: ${user}
Passwort: ${pass}
3. Erlaube bitte in 🔔 Benachrichtigungen.

LG Stufenteam`;
}

const rows = parseCSV(readFileSync(accFile, "utf8")).slice(1); // nachname,vorname,nutzername,passwort
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const items = rows
  .map(([nachname, vorname, user, pass], i) => {
    const msg = message(user, pass);
    return `<li>
      <label><input type="checkbox" onchange="this.closest('li').classList.toggle('done',this.checked)">
        <b>${esc(nachname)}, ${esc(vorname)}</b></label>
      <button onclick="copyMsg(${i}, this)">Kopieren</button>
      <textarea id="m${i}" readonly>${esc(msg)}</textarea>
    </li>`;
  })
  .join("\n");

writeFileSync(
  "nachrichten.html",
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Nachrichten-Versand Stufenkasse</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px;margin:24px auto;padding:0 16px}
ul{list-style:none;padding:0}
li{padding:10px 12px;border-bottom:1px solid #ddd;display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center}
li.done{opacity:.35}
li.done label{text-decoration:line-through}
label{display:flex;gap:8px;align-items:center;cursor:pointer}
button{padding:6px 14px;border:none;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer}
button.ok{background:#16a34a}
textarea{grid-column:1/-1;display:none}
</style></head><body>
<h2>Copy-Paste-Nachrichten (${rows.length} Personen)</h2>
<p>Pro Person: <b>Kopieren</b> klicken → im Chat der Person einfügen → senden → abhaken.</p>
<ul>${items}</ul>
<script>
function copyMsg(i, btn){
  navigator.clipboard.writeText(document.getElementById("m"+i).value).then(()=>{
    btn.textContent="Kopiert ✓"; btn.classList.add("ok");
    setTimeout(()=>{btn.textContent="Kopieren"; btn.classList.remove("ok");}, 1500);
  });
}
</script></body></html>`,
);
console.log(`✓ nachrichten.html erzeugt (${rows.length} Nachrichten). Öffnen -> Kopieren -> einfügen -> abhaken.`);
