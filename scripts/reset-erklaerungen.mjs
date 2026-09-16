// ============================================================
// Setzt Zustimmung, Einführung und den grünen Punkt zurück.
//
// Betrifft alle Konten AUSSER den geschützten (Standard: Tyler und Alexander).
// Passwörter bleiben unangetastet, es wird nur wieder verlangt, dass jede
// Person ein eigenes wählt.
//
// Danach sehen die Leute beim nächsten Öffnen wieder:
//   1. die Nutzungsbedingungen mit der Frage nach Benachrichtigungen
//   2. die Aufforderung, ein eigenes Passwort zu setzen
//   3. die kurze Einführung
//
// PowerShell im Projektordner:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/reset-erklaerungen.mjs                  # Probelauf
//   node scripts/reset-erklaerungen.mjs --wirklich       # wirklich zurücksetzen
//   node scripts/reset-erklaerungen.mjs --ausser adams.tyler --wirklich
// ============================================================
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ernst = process.argv.includes("--wirklich");

// Standardmäßig geschützt: alles, was "tyler" oder "alexander" enthält
const i = process.argv.indexOf("--ausser");
const GESCHUETZT =
  i > -1
    ? process.argv.slice(i + 1).filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase())
    : ["tyler", "alexander"];

if (!URL || !KEY) {
  console.error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: alle, error } = await db.from("profiles").select("user_id, username, role");
if (error) {
  console.error("Konnte die Profile nicht lesen:", error.message);
  process.exit(1);
}

const geschont = [];
const betroffen = [];
for (const p of alle || []) {
  const name = (p.username || "").toLowerCase();
  if (GESCHUETZT.some((g) => name.includes(g))) geschont.push(p);
  else betroffen.push(p);
}

console.log(`${alle.length} Konten insgesamt`);
console.log(`  bleiben unberührt: ${geschont.map((p) => p.username).join(", ") || "keine"}`);
console.log(`  werden zurückgesetzt: ${betroffen.length}`);

if (!ernst) {
  console.log("\nPROBELAUF. Es wurde nichts geändert.");
  console.log("Zum Ausführen: node scripts/reset-erklaerungen.mjs --wirklich");
  process.exit(0);
}

const jetzt = new Date().toISOString();
let ok = 0;
let fehler = 0;
for (const p of betroffen) {
  const { error: e } = await db
    .from("profiles")
    .update({
      terms_accepted_at: null, // Nutzungsbedingungen wieder zeigen
      must_change_password: true, // grauer Punkt, Passwort neu wählen
      has_logged_in: false,
      tour_reset_at: jetzt, // Einführung wieder zeigen
    })
    .eq("user_id", p.user_id);
  if (e) {
    console.log(`  ! ${p.username}: ${e.message}`);
    fehler++;
  } else ok++;
}

console.log(`\nFertig. ${ok} zurückgesetzt, ${fehler} Fehler.`);
if (fehler) console.log("Fehlt die Spalte tour_reset_at? Dann erst supabase/erklaerungen-reset.sql ausführen.");
