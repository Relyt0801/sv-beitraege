// ============================================================
// Setzt die ganze Stufe zurück:
//   - Passwort auf den Wert aus privat/accounts.csv
//   - Startpasswort-Kennzeichen wieder an  -> grauer Punkt, Passwort-Screen
//   - Zustimmung zu den Nutzungsbedingungen zurückgesetzt
//   - Komitee-Selbstzuweisung wieder möglich (Zuordnungen bleiben!)
//
// NUR LOKAL AUSFÜHREN (geheimer Key, niemals committen):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/reset-alle.mjs            # Probelauf, ändert nichts
//   node scripts/reset-alle.mjs --wirklich # führt es aus
// ============================================================
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priv } from "./privat.mjs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ernst = process.argv.includes("--wirklich");

if (!URL || !KEY) {
  console.error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.");
  process.exit(1);
}

function parseCSV(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((z) => z.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((f) => f.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
}

const zeilen = parseCSV(readFileSync(priv("accounts.csv"), "utf8")).slice(1); // nachname,vorname,nutzername,passwort
const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

console.log(`${zeilen.length} Konten in accounts.csv${ernst ? "" : "  (PROBELAUF – nichts wird geändert)"}\n`);

let ok = 0;
let fehler = 0;
for (const [nachname, vorname, nutzername, passwort] of zeilen) {
  if (!nutzername || !passwort) continue;
  const { data: prof } = await supabase.from("profiles").select("user_id").eq("username", nutzername).maybeSingle();
  if (!prof) {
    console.log(`  ? ${nutzername} – kein Konto gefunden`);
    fehler++;
    continue;
  }
  if (!ernst) {
    console.log(`  · ${nutzername} (${vorname} ${nachname}) würde zurückgesetzt`);
    ok++;
    continue;
  }
  const { error: pwErr } = await supabase.auth.admin.updateUserById(prof.user_id, { password: passwort });
  if (pwErr) {
    console.log(`  ! ${nutzername} – ${pwErr.message}`);
    fehler++;
    continue;
  }
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ must_change_password: true, has_logged_in: false, terms_accepted_at: null })
    .eq("user_id", prof.user_id);
  if (upErr) {
    console.log(`  ! ${nutzername} – ${upErr.message}`);
    fehler++;
    continue;
  }
  console.log(`  ✓ ${nutzername}`);
  ok++;
}

console.log(`\nFertig: ${ok} ${ernst ? "zurückgesetzt" : "vorgemerkt"}, ${fehler} Fehler.`);
if (!ernst) console.log('Zum echten Ausführen: node scripts/reset-alle.mjs --wirklich');
