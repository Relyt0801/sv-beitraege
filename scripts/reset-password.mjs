// Setzt das Passwort eines Kontos neu (Admin-Reset, z. B. bei "Passwort vergessen").
// Passwörter sind nur als Hash gespeichert und können NIE ausgelesen werden -
// dieses Skript setzt ein neues, ohne das alte zu kennen.
//
// NUR LOKAL AUSFÜHREN (geheimer Key, niemals committen):
//
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/reset-password.mjs mueller.jonas            # -> Zufallspasswort
//   node scripts/reset-password.mjs mueller.jonas Wunsch123  # -> gesetztes Passwort

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const username = process.argv[2];
let password = process.argv[3];

if (!URL || !KEY || !username) {
  console.error("Aufruf: node scripts/reset-password.mjs <nutzername> [neues-passwort]");
  process.exit(1);
}
if (!password) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  password = Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
}

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `${username.toLowerCase().trim()}@sv-beitraege.local`;

// Konto über die Profil-Tabelle finden (schneller als alle User zu listen)
const { data: prof, error: pErr } = await supabase.from("profiles").select("user_id").eq("username", username).maybeSingle();
if (pErr || !prof) {
  console.error(`Konto '${username}' nicht gefunden.`, pErr?.message || "");
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(prof.user_id, { password });
if (error) {
  console.error("Fehler:", error.message);
  process.exit(1);
}
await supabase.from("profiles").update({ must_change_password: true }).eq("user_id", prof.user_id);
console.log(`✓ Passwort für ${username} (${email}) neu gesetzt:`);
console.log(`  ${password}`);
console.log("Der Person mitteilen und ans Ändern erinnern (App -> ⚙︎ -> Passwort ändern).");
