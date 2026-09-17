// ============================================================
// Legt für jedes Kind einen Elternzugang an.
//
// Der Nutzername ist der des Kindes, nur andersherum: aus "icking.liv" wird
// "liv.icking". So ist sofort klar, zu wem ein Zugang gehört, und gleiche
// Nachnamen können nicht durcheinandergeraten.
//
// Ausnahme sind Geschwister, die sich einen Zugang teilen sollen. Die stehen
// unten in ZUSAMMEN und bekommen genau ein Konto für beide Kinder.
//
// Der Zugang sieht ausschliesslich die eigenen Kinder. Dafür sorgt nicht nur
// die Oberfläche, sondern die Datenbank selbst (parent_children + RLS).
//
// PowerShell im Projektordner:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/eltern-anlegen.mjs                     # Probelauf, zeigt nur an
//   node scripts/eltern-anlegen.mjs --wirklich          # Konten anlegen
//   node scripts/eltern-anlegen.mjs --nur icking        # nur diese Nachnamen
//   node scripts/eltern-anlegen.mjs --entfernen --wirklich
//
// Die Zugangsdaten landen in privat/eltern-zugaenge.csv. Der Ordner privat/
// ist von Git ausgeschlossen – die Liste gehört nicht ins Repo.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { privOut } from "./privat.mjs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ernst = process.argv.includes("--wirklich");
const entfernen = process.argv.includes("--entfernen");

const nurIdx = process.argv.indexOf("--nur");
const NUR = nurIdx > -1 ? (process.argv[nurIdx + 1] || "").toLowerCase() : null;

if (!URL || !KEY) {
  console.error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const email = (nutzername) => `${nutzername}@sv-beitraege.local`;

/**
 * Geschwister, die sich EINEN Zugang teilen.
 * Je Eintrag: Nachname und die Vornamen der Kinder. Das Konto laeuft auf den
 * alphabetisch ersten Vornamen, sieht aber alle genannten Kinder.
 *
 * Weitere Faelle einfach hier ergaenzen.
 */
const ZUSAMMEN = [
  { nachname: "Icking", vornamen: ["Liv", "Enni"] },
];

/** Umlaute und Sonderzeichen raus, damit der Nutzername überall funktioniert. */
function schlicht(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Gut lesbare Passwörter: zwei Wörter und zwei Ziffern, keine Verwechslungen.
const WOERTER = [
  "Anker", "Birke", "Brise", "Delta", "Feder", "Funke", "Garten", "Hafen",
  "Insel", "Kiesel", "Komet", "Krone", "Lampe", "Linde", "Muschel", "Nebel",
  "Norden", "Pfeil", "Quelle", "Regen", "Ritter", "Salbei", "Segel", "Silber",
  "Sonne", "Spiegel", "Stern", "Tanne", "Turm", "Ufer", "Welle", "Wolke",
];
function passwort() {
  const w = () => WOERTER[Math.floor(Math.random() * WOERTER.length)];
  const zahl = 10 + Math.floor(Math.random() * 90);
  let a = w(), b = w();
  while (b === a) b = w();
  return `${a}-${b}-${zahl}`;
}

// ------------------------------------------------------------ Personen holen
const { data: alleSchueler, error: sErr } = await db.from("students").select("id, vorname, nachname, verlaesst_ab");
if (sErr) {
  console.error("Personen konnten nicht gelesen werden:", sErr.message);
  process.exit(1);
}

// Ein Zugang pro Kind – ausser bei den Geschwistern in ZUSAMMEN.
const familien = new Map();
for (const s of alleSchueler || []) {
  if (!s.vorname || !s.nachname) continue;
  if (NUR && schlicht(s.nachname) !== schlicht(NUR)) continue;

  // Gehoert das Kind zu einem gemeinsamen Zugang?
  const paar = ZUSAMMEN.find(
    (z) =>
      schlicht(z.nachname) === schlicht(s.nachname) &&
      z.vornamen.some((v) => schlicht(v) === schlicht(s.vorname)),
  );

  // Schluessel: bei Geschwistern der alphabetisch erste Vorname, sonst das Kind selbst.
  const leitVorname = paar
    ? [...paar.vornamen].sort((a, b) => a.localeCompare(b, "de"))[0]
    : s.vorname;
  const key = `${schlicht(leitVorname)}.${schlicht(s.nachname)}`;
  if (!key || key === ".") continue;

  if (!familien.has(key)) familien.set(key, { nachname: s.nachname, vorname: leitVorname, kinder: [] });
  familien.get(key).kinder.push(s);
}

// ------------------------------------------------------------ Entfernen
if (entfernen) {
  const { data: vorhandene } = await db.from("profiles").select("user_id, username").eq("role", "eltern");
  const liste = (vorhandene || []).filter((p) => !NUR || schlicht(p.username).includes(schlicht(NUR)));
  console.log(`${liste.length} Elternzugänge gefunden.`);
  if (!ernst) {
    for (const p of liste) console.log("  - " + p.username);
    console.log("\nPROBELAUF. Es wurde nichts gelöscht.");
    console.log("Zum Ausführen: node scripts/eltern-anlegen.mjs --entfernen --wirklich");
    process.exit(0);
  }
  let weg = 0;
  for (const p of liste) {
    const { error } = await db.auth.admin.deleteUser(p.user_id);
    if (error) console.log(`  ! ${p.username}: ${error.message}`);
    else weg++;
  }
  console.log(`\nFertig. ${weg} Elternzugänge entfernt.`);
  process.exit(0);
}

// ------------------------------------------------------------ Anlegen
// Gegen ALLE Nutzernamen pruefen, nicht nur gegen die Elternzugaenge.
// Sonst koennte ein Elternname zufaellig auf einem Schuelerkonto landen.
const { data: alleProfile } = await db.from("profiles").select("username, role");
const belegt = new Set((alleProfile || []).map((p) => (p.username || "").toLowerCase()));
const belegtVonEltern = new Set(
  (alleProfile || []).filter((p) => p.role === "eltern").map((p) => (p.username || "").toLowerCase()),
);

const geplant = [];
for (const [key, fam] of familien) {
  // "liv.icking" – der Nutzername des Kindes, nur andersherum.
  geplant.push({
    nutzername: key,
    nachname: fam.nachname,
    vorname: fam.vorname,
    kinder: fam.kinder,
    schonDa: belegtVonEltern.has(key),
    kollision: belegt.has(key) && !belegtVonEltern.has(key),
  });
}
geplant.sort(
  (a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"),
);

const mehrfach = geplant.filter((g) => g.kinder.length > 1);
const kollidiert = geplant.filter((g) => g.kollision);
const neu = geplant.filter((g) => !g.schonDa && !g.kollision);

console.log(`${alleSchueler.length} Personen, daraus ${geplant.length} Elternzugaenge.`);
console.log(`  neu anzulegen: ${neu.length}`);
console.log(`  schon vorhanden: ${geplant.filter((g) => g.schonDa).length}`);

if (mehrfach.length) {
  console.log(`\nGeschwister mit gemeinsamem Zugang:`);
  for (const g of mehrfach)
    console.log(`  ${g.nutzername}  ->  ${g.kinder.map((k) => k.vorname).join(" und ")} ${g.nachname}`);
}

if (kollidiert.length) {
  console.log(`\n  ACHTUNG: Diese Nutzernamen sind schon an ein anderes Konto vergeben`);
  console.log(`  und werden uebersprungen:`);
  for (const g of kollidiert) console.log(`    ${g.nutzername}`);
}

if (!ernst) {
  console.log("\nPROBELAUF. Es wurde nichts angelegt.");
  console.log("Zum Ausführen: node scripts/eltern-anlegen.mjs --wirklich");
  process.exit(0);
}

const zugaenge = [];
let ok = 0;
let fehler = 0;

for (const g of neu) {
  const pw = passwort();
  const { data: u, error: uErr } = await db.auth.admin.createUser({
    email: email(g.nutzername),
    password: pw,
    email_confirm: true,
  });
  if (uErr || !u?.user) {
    console.log(`  ! ${g.nutzername}: ${uErr?.message}`);
    fehler++;
    continue;
  }

  const { error: pErr } = await db.from("profiles").upsert({
    user_id: u.user.id,
    username: g.nutzername,
    role: "eltern",
    student_id: null,
    must_change_password: true,
    has_logged_in: false,
  });
  if (pErr) {
    console.log(`  ! Profil ${g.nutzername}: ${pErr.message}`);
    fehler++;
    continue;
  }

  // Anzeigename und Kürzel: "Familie Icking" mit IC
  await db.from("public_profiles").upsert({
    user_id: u.user.id,
    anzeigename: `Familie ${g.nachname}`,
    initialen: g.nachname.slice(0, 2).toUpperCase(),
    farbe: "slate",
  });

  const { error: kErr } = await db
    .from("parent_children")
    .upsert(g.kinder.map((k) => ({ user_id: u.user.id, student_id: k.id })));
  if (kErr) console.log(`  ! Kinder ${g.nutzername}: ${kErr.message}`);

  zugaenge.push({
    familie: `Familie ${g.nachname}`,
    fuer: g.kinder.map((k) => k.vorname).join(" und ") + " " + g.nachname,
    nutzername: g.nutzername,
    passwort: pw,
    kinder: g.kinder.map((k) => `${k.vorname} ${k.nachname}`).join(" und "),
  });
  ok++;
}

// ------------------------------------------------------------ Liste ausgeben
if (zugaenge.length) {
  const csv = [
    "Anzeigename;Nutzername;Startpasswort;Kinder",
    ...zugaenge.map((z) => `${z.familie};${z.nutzername};${z.passwort};${z.kinder}`),
  ].join("\r\n");
  const ziel = privOut("eltern-zugaenge.csv");
  writeFileSync(ziel, "﻿" + csv, "utf8");
  console.log(`\nZugangsdaten geschrieben nach: ${ziel}`);
  console.log("Diese Datei enthält Passwörter. Sie liegt in privat/ und gehört nicht ins Git.");
}

console.log(`\nFertig. ${ok} Zugänge angelegt, ${fehler} Fehler.`);
console.log("Jeder Zugang muss beim ersten Anmelden ein eigenes Passwort setzen.");
