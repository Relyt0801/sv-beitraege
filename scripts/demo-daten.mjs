// ============================================================
// Demo-Daten für die Stufenkasse
//
//   - zufällige Schüler mit Konto (Passwort für ALLE: 123456)
//   - gemischte Beiträge: bezahlt, offen, erlassen, "bis Q1.1 bezahlt"
//   - eine Person hat die Schule verlassen
//   - gesammelte Prozent aus dem Vorlagen-Katalog (5 / 10 / 20 %); die
//     Staffelstufen 0/25/50/75/100 % sind alle mindestens einmal vertreten
//   - Rollen-Demo: Kassenwart Karlo, Stufensprecherin Sarah, Admin Andreas
//
// ACHTUNG: schreibt in die Datenbank, auf die SUPABASE_URL zeigt.
// Am besten ein eigenes Demo-Projekt verwenden, nicht die echte Stufe.
//
// PowerShell im Projektordner:
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/demo-daten.mjs                 # Probelauf, zeigt nur an
//   node scripts/demo-daten.mjs --wirklich      # legt die Daten an
//   node scripts/demo-daten.mjs --anzahl 40 --wirklich
//   node scripts/demo-daten.mjs --fertig --wirklich      # ohne Erstanmeldung
//   node scripts/demo-daten.mjs --entfernen --wirklich   # räumt sie wieder weg
//
// Standard: die Konten durchlaufen beim ersten Login den echten Ablauf –
// Nutzungsbedingungen, Passwort ändern, Komitee wählen. Mit --fertig sind sie
// sofort einsatzbereit (grüner Punkt, kein Zwischenschritt).
//
// Angelegte Kennungen landen in privat/demo-ids.json – nur darüber wird
// beim Entfernen gelöscht, echte Daten bleiben unangetastet.
// ============================================================
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { privOut } from "./privat.mjs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ernst = process.argv.includes("--wirklich");
const entfernen = process.argv.includes("--entfernen");
// --fertig: Konten überspringen Zustimmung + Passwortwechsel
const fertig = process.argv.includes("--fertig");
const anzahlArg = process.argv.indexOf("--anzahl");
const ANZAHL = anzahlArg > -1 ? Math.max(3, Number(process.argv[anzahlArg + 1]) || 30) : 30;
const PASSWORT = "123456";
const MERKDATEI = privOut("demo-ids.json");

if (!URL || !KEY) {
  console.error("Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ---------------------------------------------------------------- Namen
const VORNAMEN = [
  "Lena", "Jonas", "Mia", "Elias", "Emma", "Noah", "Sophie", "Leon", "Marie", "Paul",
  "Hannah", "Felix", "Clara", "Luis", "Lina", "Moritz", "Johanna", "Til", "Greta", "Ben",
  "Frieda", "Jakob", "Ida", "Oskar", "Nele", "Milan", "Alma", "Theo", "Romy", "Anton",
  "Juli", "Mats", "Zoe", "Levi", "Pia", "Henri", "Malin", "Vincent", "Ella", "Carl",
];
const NACHNAMEN = [
  "Brinkmann", "Schulte", "Terhorst", "Wewers", "Böckmann", "Lammers", "Hövelmann", "Rensing",
  "Elsbernd", "Wiggering", "Nienhaus", "Tenbrink", "Determann", "Kortenbusch", "Siebers",
  "Wilmering", "Hemker", "Bültmann", "Overmann", "Reinke", "Schwering", "Kuhlmann", "Gerdes",
  "Holtkamp", "Rickert", "Nuszkowski", "Feldmann", "Averbeck", "Dirksen", "Lohmann",
];
const HY = ["EF.1", "EF.2", "Q1.1", "Q1.2", "Q2.1", "Q2.2"];
// Vorlagen-Katalog in Prozent – identisch zu supabase/prozent-staffel.sql
const VORLAGEN = [
  { titel: "Waffelverkauf in der Pause", punkte: 5 },
  { titel: "Waffeln oder Kuchen gebacken", punkte: 5 },
  { titel: "Kleinere Aufgabe / Hilfe (Einkauf o. Ä.)", punkte: 5 },
  { titel: "Waffel-/Kuchenverkauf außerhalb der Schulzeit", punkte: 10 },
  { titel: "Aufgabe mittleren Aufwands (z. B. 1 Tag Stand)", punkte: 10 },
  { titel: "Außerschulische Aktion über 2 Std.", punkte: 10 },
  { titel: "Girolauf (beide Tage)", punkte: 20 },
  { titel: "Größere profitable Aktion ermöglicht", punkte: 20 },
  { titel: "Eingebrachte Aktion, die umgesetzt wurde", punkte: 5 },
];
// Zielprozente der Demo-Personen: jede Staffelstufe kommt vor, dazwischen bunt
const ZIELE = [0, 25, 50, 75, 100, 5, 30, 45, 60, 80, 95, 10, 35, 55, 70, 85];

let seed = 20260916;
/** Reproduzierbarer Zufall – gleicher Aufruf, gleiche Demo-Stufe. */
function zufall() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const wahl = (arr) => arr[Math.floor(zufall() * arr.length)];
const zahl = (min, max) => min + Math.floor(zufall() * (max - min + 1));

function sauber(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ").trim();
}
const nutzername = (nachname, vorname) => `${sauber(nachname).replace(/ /g, "")}.${sauber(vorname).split(" ")[0]}`;
const email = (u) => `${u}@sv-beitraege.local`;

// ------------------------------------------------- Beitrags-Muster je Person
function termsFuer(i) {
  const t = {};
  const muster = i % 5; // gleichmäßig gemischt
  for (const [n, h] of HY.entries()) {
    if (muster === 0) t[h] = { status: "bezahlt" };                       // alles bezahlt
    else if (muster === 1) t[h] = { status: "offen" };                    // nichts bezahlt
    else if (muster === 2) t[h] = { status: n <= 2 ? "bezahlt" : "offen" }; // bis Q1.1 bezahlt
    else if (muster === 3) t[h] = { status: n === 0 ? "erlassen" : n <= 3 ? "bezahlt" : "offen" };
    else t[h] = { status: zufall() < 0.55 ? "bezahlt" : "offen" };        // bunt gemischt
  }
  return t;
}

// ------------------------------------------------------------ Personen bauen
const genutzt = new Set();
const personen = [];
// feste Rollen-Demo zuerst, damit die Namen stimmen
const FEST = [
  { vorname: "Karlo", nachname: "Wessels", rolle: "kassenwart" },
  { vorname: "Sarah", nachname: "Bernsmann", rolle: "sprecher" },
  { vorname: "Andreas", nachname: "Deitmar", rolle: "admin" },
];
for (const f of FEST) {
  const u = nutzername(f.nachname, f.vorname);
  genutzt.add(u);
  personen.push({ ...f, nutzername: u });
}
while (personen.length < ANZAHL) {
  const vorname = wahl(VORNAMEN);
  const nachname = wahl(NACHNAMEN);
  const u = nutzername(nachname, vorname);
  if (genutzt.has(u)) continue;
  genutzt.add(u);
  personen.push({ vorname, nachname, rolle: "schueler", nutzername: u });
}
personen.forEach((p, i) => {
  p.terms = termsFuer(i);
  p.beigetreten_ab = i % 11 === 7 ? "EF.2" : "EF.1";
  // genau eine Person verlässt die Schule
  p.verlaesst_ab = i === Math.min(9, personen.length - 1) ? "Q1.2" : null;
  // Prozent: Zielwert vorgeben und mit echten Vorlagen auffüllen, damit die
  // Einzelbeiträge stimmig sind (20 + 10 + 5 = 35 %).
  p.beitraege = [];
  let rest = ZIELE[i % ZIELE.length];
  p.ziel = rest;
  const datum = () => `2026-${String(zahl(1, 9)).padStart(2, "0")}-${String(zahl(1, 28)).padStart(2, "0")}`;
  while (rest > 0) {
    const passend = VORLAGEN.filter((v) => v.punkte <= rest);
    if (!passend.length) break;
    const v = wahl(passend);
    p.beitraege.push({ titel: v.titel, punkte: v.punkte, datum: datum() });
    rest -= v.punkte;
  }
  // Krümel (z. B. 3 %) als "je nach Aufwand" nachtragen
  if (rest > 0) p.beitraege.push({ titel: "Eingebrachte Aktion, die umgesetzt wurde", punkte: rest, datum: datum() });
});

// ------------------------------------------------------------------- Ausgabe
function uebersicht() {
  const zaehl = (s) => personen.filter((p) => Object.values(p.terms).every((t) => t.status === s)).length;
  console.log(`${personen.length} Personen, Startpasswort für alle: ${PASSWORT}`);
  console.log(
    fertig
      ? "  Erstanmeldung: übersprungen (sofort einsatzbereit, grüner Punkt)"
      : "  Erstanmeldung: Nutzungsbedingungen -> Passwort ändern -> Komitee wählen",
  );
  console.log(`  vollständig bezahlt: ${zaehl("bezahlt")}   gar nichts bezahlt: ${zaehl("offen")}`);
  console.log(`  verlässt die Schule: ${personen.filter((p) => p.verlaesst_ab).map((p) => `${p.vorname} ${p.nachname} (ab ${p.verlaesst_ab})`).join(", ") || "–"}`);
  const staffel = [
    { ab: 100, betrag: 0 }, { ab: 75, betrag: 10 }, { ab: 50, betrag: 25 },
    { ab: 25, betrag: 40 }, { ab: 0, betrag: 50 },
  ];
  const ticket = (pct) => staffel.find((x) => pct >= x.ab).betrag;
  const verteilung = {};
  for (const p of personen) {
    const pct = p.beitraege.reduce((n, b) => n + b.punkte, 0);
    const stufe = staffel.find((x) => pct >= x.ab).ab;
    verteilung[stufe] = (verteilung[stufe] || 0) + 1;
  }
  console.log(`  Prozent gesammelt: ${personen.filter((p) => p.beitraege.length).length} von ${personen.length} Personen`);
  console.log(
    "  Abiballticket:   " +
      [0, 25, 50, 75, 100].map((ab) => `${ab}%→${ticket(ab)}€: ${verteilung[ab] || 0}`).join("   "),
  );
  for (const f of FEST) {
    const p = personen.find((x) => x.vorname === f.vorname);
    console.log(`  ${f.rolle.padEnd(11)} ${p.vorname} ${p.nachname}  ->  ${p.nutzername}`);
  }
}

// ------------------------------------------------------------------ Entfernen
async function raeumeAuf() {
  if (!existsSync(MERKDATEI)) {
    console.error(`Keine ${MERKDATEI} gefunden – es gibt nichts zu entfernen.`);
    process.exit(1);
  }
  const merk = JSON.parse(readFileSync(MERKDATEI, "utf8"));
  // Zusätzlich alles einsammeln, was zu den Demo-Nutzernamen gehört. Nur so
  // werden auch Reste aus einem früheren Lauf gefunden.
  const namen = new Set(personen.map((p) => p.nutzername));
  const { data: profile } = await db.from("profiles").select("user_id, username, student_id");
  const extraUser = [];
  const extraStudents = [];
  for (const pr of profile || []) {
    if (!namen.has((pr.username || "").toLowerCase())) continue;
    if (!merk.users?.includes(pr.user_id)) extraUser.push(pr.user_id);
    if (pr.student_id && !merk.students?.includes(pr.student_id)) extraStudents.push(pr.student_id);
  }
  merk.users = [...new Set([...(merk.users || []), ...extraUser])];
  merk.students = [...new Set([...(merk.students || []), ...extraStudents])];
  console.log(`${merk.students.length} Personen und ${merk.users.length} Konten aus der Demo`);
  if (extraUser.length) console.log(`  davon ${extraUser.length} aus einem früheren Lauf nachträglich gefunden`);
  if (!ernst) {
    console.log("PROBELAUF – nichts wird gelöscht. Mit --wirklich ausführen.");
    return;
  }
  for (const uid of merk.users || []) {
    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) console.log(`  ! Konto ${uid}: ${error.message}`);
  }
  if (merk.students?.length) {
    const { error } = await db.from("students").delete().in("id", merk.students);
    if (error) console.log(`  ! Personen: ${error.message}`);
  }
  writeFileSync(MERKDATEI, JSON.stringify({ students: [], users: [] }, null, 2));
  console.log("Demo-Daten entfernt.");
}

// -------------------------------------------------------------------- Anlegen
async function anlegen() {
  uebersicht();
  if (!ernst) {
    console.log("\nPROBELAUF – nichts wird geschrieben. Zum Anlegen: node scripts/demo-daten.mjs --wirklich");
    return;
  }
  const merk = { students: [], users: [] };

  // 1) Beitrags-Vorlagen (Katalog frisch setzen)
  await db.from("contribution_templates").delete().neq("titel", "");
  await db
    .from("contribution_templates")
    .insert(VORLAGEN.map((v, i) => ({ titel: v.titel, punkte: v.punkte, sort: i + 1 })));
  console.log(`\n${VORLAGEN.length} Vorlagen angelegt.`);

  // 2) Schon vorhandene Demo-Konten erkennen, damit nichts doppelt entsteht
  const { data: schonDa } = await db.from("profiles").select("username");
  const vorhanden = new Set((schonDa || []).map((x) => (x.username || "").toLowerCase()));
  const doppelt = personen.filter((p) => vorhanden.has(p.nutzername));
  if (doppelt.length) {
    console.log(
      `\n${doppelt.length} der Personen gibt es schon (${doppelt.slice(0, 3).map((p) => p.nutzername).join(", ")}` +
        `${doppelt.length > 3 ? ", …" : ""}). Die werden übersprungen.`,
    );
  }

  // 3) Personen + Konten
  for (const p of personen) {
    if (vorhanden.has(p.nutzername)) continue; // niemals doppelt anlegen
    const { data: st, error: stErr } = await db
      .from("students")
      .insert({
        nachname: p.nachname,
        vorname: p.vorname,
        beigetreten_ab: p.beigetreten_ab,
        verlaesst_ab: p.verlaesst_ab,
        terms: p.terms,
      })
      .select("id")
      .single();
    if (stErr || !st) {
      console.log(`  ! ${p.nachname}, ${p.vorname}: ${stErr?.message}`);
      continue;
    }
    merk.students.push(st.id);

    const { data: u, error: uErr } = await db.auth.admin.createUser({
      email: email(p.nutzername),
      password: PASSWORT,
      email_confirm: true,
    });
    if (uErr || !u?.user) {
      console.log(`  ! Konto ${p.nutzername}: ${uErr?.message}`);
      continue;
    }
    merk.users.push(u.user.id);

    // Profil: Nutzername, Rolle, Verknüpfung zur Person
    const { error: pErr } = await db
      .from("profiles")
      .upsert(
        {
          user_id: u.user.id,
          username: p.nutzername,
          role: p.rolle,
          student_id: st.id,
          // Standard: Erstanmeldung wie bei echten Konten (Zustimmung,
          // Passwort ändern, Komitee wählen). --fertig überspringt das.
          must_change_password: !fertig,
          has_logged_in: fertig,
          terms_accepted_at: fertig ? new Date().toISOString() : null,
        },
        { onConflict: "user_id" },
      );
    if (pErr) console.log(`  ! Profil ${p.nutzername}: ${pErr.message}`);

    // Beitragspunkte
    if (p.beitraege.length) {
      const { error: bErr } = await db
        .from("contributions")
        .insert(p.beitraege.map((b) => ({ student_id: st.id, titel: b.titel, punkte: b.punkte, datum: b.datum })));
      if (bErr) console.log(`  ! Punkte ${p.nutzername}: ${bErr.message}`);
    }
    console.log(`  ✓ ${p.nutzername.padEnd(24)} ${p.rolle}`);
  }

  writeFileSync(MERKDATEI, JSON.stringify(merk, null, 2));
  console.log(`\nFertig. ${merk.students.length} Personen neu angelegt, ${merk.users.length} Konten.`);
  if (!merk.students.length) console.log("Es war also schon alles da. Nichts wurde doppelt angelegt.");
  console.log(`Kennungen gemerkt in ${MERKDATEI} – Entfernen mit: node scripts/demo-daten.mjs --entfernen --wirklich`);
}

await (entfernen ? raeumeAuf() : anlegen());
