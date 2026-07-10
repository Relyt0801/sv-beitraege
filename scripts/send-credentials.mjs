// Verschickt Zugangsdaten an die Stufe – zwei Modi:
//
//   E-MAIL (vollautomatisch, SMTP z. B. Gmail):
//     $env:SMTP_USER="deine@gmail.com"
//     $env:SMTP_PASS="xxxx xxxx xxxx xxxx"   # Gmail-App-Passwort (nicht dein Login-Passwort!)
//     node scripts/send-credentials.mjs accounts.csv kontakte.csv email https://deine-app.vercel.app
//
//   WHATSAPP (halbautomatisch, ohne Sperr-Risiko):
//     node scripts/send-credentials.mjs accounts.csv kontakte.csv whatsapp https://deine-app.vercel.app
//     -> erzeugt whatsapp-versand.html: pro Person ein Klick-Link mit fertiger Nachricht,
//        du bestätigst jede Nachricht nur noch mit "Senden".
//
// kontakte.csv (Kopfzeile Pflicht, Spalten leer lassen wenn unbekannt):
//   nachname,vorname,email,handy
//   Müller,Jonas,jonas@mail.de,0151 2345678

import { readFileSync, writeFileSync } from "node:fs";

const [accFile = "accounts.csv", kontFile = "kontakte.csv", mode = "whatsapp", appUrl = "https://sv-beitraege.vercel.app/"] =
  process.argv.slice(2);

// ---------- Helfer ----------
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
function norm(s) {
  return (s || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const key = (n, v) => `${norm(n)}.${norm(v)}`;

function phoneIntl(raw) {
  let p = (raw || "").replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("0")) p = "+49" + p.slice(1);
  if (!p.startsWith("+")) p = "+49" + p;
  return p.replace("+", "");
}

// Fester Nachrichten-Aufbau (E-Mail und WhatsApp identisch)
function message(vorname, user, pass) {
  return `Hi ${vorname}! 👋

Hier ist dein Zugang zur Stufenkasse-App (Beiträge, Abstimmungen & Infos der Stufe):

🔗 App: ${appUrl}
👤 Benutzername: ${user}
🔑 Startpasswort: ${pass}

Beim ersten Login legst du ein eigenes Passwort fest.
📱 iPhone-Tipp: Seite in Safari öffnen → Teilen → „Zum Home-Bildschirm", dann funktioniert die App inkl. Benachrichtigungen.

Bei Problemen einfach beim Stufenteam melden.`;
}

// ---------- Daten einlesen & matchen ----------
const acc = parseCSV(readFileSync(accFile, "utf8")).slice(1);   // nachname,vorname,nutzername,passwort
const kont = parseCSV(readFileSync(kontFile, "utf8")).slice(1); // nachname,vorname,email,handy
const kontMap = new Map(kont.map((r) => [key(r[0], r[1]), { email: r[2] || "", handy: r[3] || "" }]));

const rows = [];
const missing = [];
for (const [nachname, vorname, user, pass] of acc) {
  const k = kontMap.get(key(nachname, vorname));
  if (!k || (!k.email && !k.handy)) {
    missing.push(`${nachname}, ${vorname}`);
    continue;
  }
  rows.push({ nachname, vorname, user, pass, ...k });
}

console.log(`Konten: ${acc.length} · mit Kontakt: ${rows.length} · ohne Kontakt: ${missing.length}`);
if (missing.length) console.log("Ohne Kontakt (Zettel nötig):", missing.join(" | "));

// ---------- Modus: WhatsApp (Klick-Links) ----------
if (mode === "whatsapp") {
  const withPhone = rows.filter((r) => r.handy);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const items = withPhone.map((r) => {
    const num = phoneIntl(r.handy);
    const txt = encodeURIComponent(message(r.vorname, r.user, r.pass));
    // web.whatsapp.com/send öffnet den Chat DIREKT mit fertigem Text (WhatsApp Web muss eingeloggt sein)
    const webLink = `https://web.whatsapp.com/send?phone=${num}&text=${txt}`;
    const mobLink = `https://wa.me/${num}?text=${txt}`;
    return `<li><label><input type="checkbox" onchange="this.closest('li').classList.toggle('done',this.checked)">
      <b>${esc(r.nachname)}, ${esc(r.vorname)}</b></label>
      <a href="${esc(webLink)}" target="_blank" rel="noopener">Chat öffnen →</a>
      <a class="alt" href="${esc(mobLink)}" target="_blank" rel="noopener">(Handy)</a></li>`;
  }).join("\n");
  writeFileSync("whatsapp-versand.html", `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>WhatsApp-Versand Stufenkasse</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:24px auto;padding:0 16px}
ul{list-style:none;padding:0}li{display:flex;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid #ddd}
li.done{opacity:.35;text-decoration:line-through}label{flex:1;display:flex;gap:8px;align-items:center;cursor:pointer}
a{font-weight:600;color:#4f46e5;text-decoration:none}a.alt{font-weight:400;font-size:12px;color:#999}</style></head><body>
<h2>WhatsApp-Versand (${withPhone.length} Personen)</h2>
<p><b>Vorher:</b> <a href="https://web.whatsapp.com" target="_blank">web.whatsapp.com</a> in diesem Browser einloggen (QR-Code mit Handy scannen).<br>
Dann pro Person: <b>Chat öffnen</b> → Nachricht steht schon drin → <b>Senden</b> → hier abhaken.</p><ul>${items}</ul></body></html>`);
  console.log(`✓ whatsapp-versand.html erzeugt (${withPhone.length} Links). Öffnen, klicken, senden, abhaken.`);
  process.exit(0);
}

// ---------- Modus: E-Mail (SMTP, vollautomatisch) ----------
if (mode === "email") {
  const { default: nodemailer } = await import("nodemailer");
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user; // Absender darf vom SMTP-Login abweichen (z. B. Brevo)
  if (!user || !pass) {
    console.error("SMTP_USER und SMTP_PASS setzen (z. B. Brevo: Login + SMTP-Schlüssel, SMTP_HOST=smtp-relay.brevo.com).");
    process.exit(1);
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user, pass },
  });
  const withMail = rows.filter((r) => r.email);
  console.log(`Sende ${withMail.length} E-Mails …`);
  let ok = 0;
  for (const r of withMail) {
    try {
      await transport.sendMail({
        from: `"Stufenkasse Abi 28" <${from}>`,
        to: r.email,
        subject: "Dein Zugang zur Stufenkasse-App",
        text: message(r.vorname, r.user, r.pass),
      });
      ok++;
      console.log(`✓ ${r.nachname}, ${r.vorname} <${r.email}>`);
      await new Promise((res) => setTimeout(res, 1500)); // sanftes Tempo
    } catch (e) {
      console.error(`✗ ${r.nachname}, ${r.vorname}: ${e.message}`);
    }
  }
  console.log(`Fertig: ${ok}/${withMail.length} gesendet.`);
  process.exit(0);
}

console.error(`Unbekannter Modus '${mode}' – nutze 'email' oder 'whatsapp'.`);
process.exit(1);
