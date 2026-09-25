// ============================================================
// Legt für jedes Kind einen Elternzugang an.
//
// Der Nutzername ist der des Kindes, nur andersherum: aus "muster.mia" wird
// "mia.muster". So ist sofort klar, zu wem ein Zugang gehört, und gleiche
// Nachnamen können nicht durcheinandergeraten.
//
// Geschwister bekommen trotzdem je einen eigenen Nutzernamen. Sie stehen unten
// in ZUSAMMEN und bekommen dann zwei Dinge gemeinsam: jedes ihrer Konten sieht
// ALLE Kinder der Familie, und beide Konten haben dasselbe Startpasswort. Die
// Eltern koennen sich also mit jedem der Namen anmelden und muessen sich nur ein
// Passwort merken.
//
// Der Zugang sieht ausschliesslich die eigenen Kinder. Dafür sorgt nicht nur
// die Oberfläche, sondern die Datenbank selbst (parent_children + RLS).
//
// PowerShell im Projektordner:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/eltern-anlegen.mjs                     # Probelauf, zeigt nur an
//   node scripts/eltern-anlegen.mjs --wirklich          # Konten anlegen
//   node scripts/eltern-anlegen.mjs --nur muster        # nur diese Nachnamen
//   node scripts/eltern-anlegen.mjs --entfernen --wirklich
//
// Die Zugangsdaten landen in privat/eltern-zugaenge.csv. Der Ordner privat/
// ist von Git ausgeschlossen – die Liste gehört nicht ins Repo.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { priv, privOut } from "./privat.mjs";
import { startpasswort } from "./passwoerter.mjs";

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
 * Geschwister, die zusammengehoeren.
 * Je Eintrag: Nachname und die Vornamen der Kinder. Jedes Kind behaelt seinen
 * eigenen Nutzernamen, aber alle Konten der Familie sehen alle Kinder und
 * teilen sich ein Passwort.
 *
 * Die Schreibweise muss genau so wie in der Personenliste sein.
 *
 * Echte Namen gehoeren nicht ins Repo: die Liste steht in
 * privat/geschwister.json (von Git ausgeschlossen), zum Beispiel
 *   [{ "nachname": "Muster", "vornamen": ["Mia", "Ben"] }]
 */
const ZUSAMMEN = (() => {
  const datei = priv("geschwister.json");
  if (!existsSync(datei)) {
    console.warn("! privat/geschwister.json fehlt - Geschwister bekommen getrennte Passwoerter.");
    return [];
  }
  return JSON.parse(readFileSync(datei, "utf8"));
})();

/** Umlaute und Sonderzeichen raus, damit der Nutzername überall funktioniert. */
function schlicht(s) {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Startpasswörter kommen aus scripts/passwoerter.mjs – dieselbe Quelle wie
// bei den Schülerkonten.
const passwort = startpasswort;

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

  // Jedes Kind bekommt seinen eigenen Nutzernamen.
  const key = `${schlicht(s.vorname)}.${schlicht(s.nachname)}`;
  if (!key || key === ".") continue;

  // Gehoert das Kind zu einer Geschwistergruppe? Dann merken wir uns die Gruppe,
  // damit alle ihre Konten spaeter alle Kinder sehen und dasselbe Passwort haben.
  const paar = ZUSAMMEN.find(
    (z) =>
      schlicht(z.nachname) === schlicht(s.nachname) &&
      z.vornamen.some((v) => schlicht(v) === schlicht(s.vorname)),
  );
  const gruppe = paar ? schlicht(paar.nachname) : null;

  familien.set(key, { nachname: s.nachname, vorname: s.vorname, kinder: [s], gruppe });
}

// Geschwister: jedes Konto der Gruppe sieht alle Kinder der Gruppe.
for (const [, fam] of familien) {
  if (!fam.gruppe) continue;
  const alleDerGruppe = [...familien.values()].filter((f) => f.gruppe === fam.gruppe);
  fam.kinder = alleDerGruppe.flatMap((f) => f.kinder.filter((k) => k.id));
  // Doppelte entfernen, falls ein Kind zweimal auftaucht.
  fam.kinder = fam.kinder.filter((k, i, a) => a.findIndex((x) => x.id === k.id) === i);
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
  // "mia.muster" – der Nutzername des Kindes, nur andersherum.
  geplant.push({
    nutzername: key,
    nachname: fam.nachname,
    vorname: fam.vorname,
    kinder: fam.kinder,
    gruppe: fam.gruppe,
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
  console.log(`\nGeschwister – eigener Nutzername, aber gleiches Passwort und beide Kinder:`);
  for (const g of mehrfach)
    console.log(`  ${g.nutzername}  sieht  ${g.kinder.map((k) => k.vorname).join(" und ")} ${g.nachname}`);
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

// Geschwister teilen sich ein Passwort – einmal je Gruppe erzeugt.
const gruppenPasswort = new Map();

for (const g of neu) {
  let pw;
  if (g.gruppe) {
    if (!gruppenPasswort.has(g.gruppe)) gruppenPasswort.set(g.gruppe, passwort());
    pw = gruppenPasswort.get(g.gruppe);
  } else {
    pw = passwort();
  }
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

  // Anzeigename und Kürzel: "Familie Muster" mit MU
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
