// Legt für jede Person aus einer Export-Datei ein Konto an (Nutzername nach Schema,
// Zufallspasswort) und verknüpft es mit dem Schüler-Datensatz.
//
// NUR LOKAL AUSFÜHREN – braucht den geheimen service_role-Key (niemals committen!):
//
//   SUPABASE_URL="https://xxxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ... (service_role secret)" \
//   node scripts/create-accounts.mjs stufenkasse-export.json
//
// Ergebnis: accounts.csv mit Nachname, Vorname, Nutzername, Passwort (zum Verteilen).
// Passwörter können später nicht mehr ausgelesen werden – Datei sicher aufbewahren.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];
if (!URL || !KEY || !file) {
  console.error("Bitte SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und Export-Datei angeben.");
  process.exit(1);
}

function usernamePart(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const makeUsername = (n, v) => `${usernamePart(n)}.${usernamePart(v)}`;

function makePassword(len = 8) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789"; // ohne verwechselbare Zeichen
  let p = "";
  for (let i = 0; i < len; i++) p += abc[Math.floor(Math.random() * abc.length)];
  return p;
}

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const students = JSON.parse(readFileSync(file, "utf8")).students;

const seen = new Map();
const rows = [["nachname", "vorname", "nutzername", "passwort"]];

for (const st of students) {
  let username = makeUsername(st.nachname, st.vorname);
  const n = (seen.get(username) || 0) + 1;
  seen.set(username, n);
  if (n > 1) username = `${username}${n}`; // Kollision -> Nummer anhängen
  const email = `${username}@sv-beitraege.local`;
  const password = makePassword();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`⚠ ${username}: ${error.message}`);
    continue;
  }
  // Profil mit Schüler verknüpfen (Rolle bleibt schueler)
  await supabase.from("profiles").update({ student_id: st.id, username }).eq("user_id", data.user.id);
  rows.push([st.nachname, st.vorname, username, password]);
  console.log(`✓ ${username}`);
}

const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
writeFileSync("accounts.csv", csv);
console.log(`\nFertig – ${rows.length - 1} Konten. Zugangsdaten in accounts.csv (sicher aufbewahren!).`);
