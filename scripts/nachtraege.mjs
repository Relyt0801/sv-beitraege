// Offene Nachträge im Terminal bearbeiten – für den Claude-Code-Befehl /nachtraege.
//
// Claude Code ruft dieses Skript auf; ihr könnt es aber auch selbst benutzen.
// Es kann NUR das, was auch die App kann (feste Funktionen in der Datenbank):
//   - „war da“-Angaben bestätigen oder als „stimmt nicht“ markieren
//   - Vorschläge des Assistenten erledigen oder verwerfen
//   - im Gespräch mit dem Stufenteam antworten (als ihr selbst)
// Freies SQL führt es nicht aus. Für alles andere schreibt Claude einen
// SQL-Vorschlag nach privat/ – den prüft ihr und spielt ihn selbst ein.
//
// Datenschutz: Die Liste zeigt KEINE Namen und keine Kennungen, sondern
// Kürzel (a1, v1 …) und „Person“ statt Namen in Nachrichten. Die Zuordnung
// liegt nur auf diesem Rechner in privat/nachtraege-zuordnung.json.
//
// Zugang (NUR LOKAL, nie committen) – entweder als Umgebungsvariablen oder in
// privat/.env:
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
//   NACHTRAEGE_ALS=dein.benutzername      (wer im Protokoll steht)
//
// Aufrufe:
//   node scripts/nachtraege.mjs liste
//   node scripts/nachtraege.mjs bestaetigen a1        (oder: ablehnen a1)
//   node scripts/nachtraege.mjs erledigt v1           (oder: verwerfen v1)
//   node scripts/nachtraege.mjs antworten v1 "Hey, welche Schicht meinst du genau?"

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priv, privOut } from "./privat.mjs";

// ------------------------------------------------------------ Zugang
function ladeEnv() {
  const datei = priv(".env");
  if (!existsSync(datei)) return;
  for (const zeile of readFileSync(datei, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(zeile);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
ladeEnv();
const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALS = process.env.NACHTRAEGE_ALS;
if (!URL || !KEY) {
  console.error("Es fehlt SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY (Umgebung oder privat/.env).");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ZUORDNUNG = privOut("nachtraege-zuordnung.json");

const befehl = process.argv[2] || "liste";
const kuerzel = process.argv[3];

async function ich() {
  if (!ALS) {
    console.error("Bitte NACHTRAEGE_ALS=<dein Benutzername> setzen – dann steht im Protokoll, wer es war.");
    process.exit(1);
  }
  const { data } = await db.from("profiles").select("user_id, username, role").eq("username", ALS).maybeSingle();
  if (!data) {
    console.error(`Benutzer „${ALS}“ nicht gefunden.`);
    process.exit(1);
  }
  return data;
}

function zuordnung() {
  try {
    return JSON.parse(readFileSync(ZUORDNUNG, "utf8"));
  } catch {
    console.error("Erst „liste“ aufrufen – dann gibt es die Kürzel.");
    process.exit(1);
  }
}

/** Namen durch „Person“ ersetzen (ganze Wörter). */
function ohneNamen(text, namen) {
  let t = String(text || "");
  for (const n of [...new Set(namen.filter((x) => x && x.length >= 2))].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu"), "Person");
  }
  return t;
}

const tag = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

// ------------------------------------------------------------ liste
if (befehl === "liste") {
  const [{ data: angaben, error: e1 }, { data: vorschlaege, error: e2 }, { data: einst }] = await Promise.all([
    db.from("anwesenheit").select("id, termin_id, student_id, user_id, quelle, eingeteilt, created_at").eq("status", "offen").eq("angabe", "da").order("created_at"),
    db.from("assistent_vorschlaege").select("id, topic_id, user_id, student_id, absicht, ergebnis, antwort, vorschlag, created_at").eq("status", "offen").neq("ergebnis", "auto").neq("ergebnis", "laeuft").order("created_at"),
    db.from("ki_einstellungen").select("stil").eq("id", 1).maybeSingle(),
  ]);
  if (e1 || e2) {
    console.error("Fehler:", (e1 || e2).message, "– ist supabase/update-abi28.sql eingespielt?");
    process.exit(1);
  }
  const termIds = [...new Set((angaben || []).map((a) => a.termin_id))];
  const { data: termine } = termIds.length ? await db.from("termine").select("id, titel, datum, von, bis, abschluss").in("id", termIds) : { data: [] };
  const terminVon = new Map((termine || []).map((t) => [t.id, t]));
  const sids = [...new Set([...(angaben || []), ...(vorschlaege || [])].map((x) => x.student_id).filter(Boolean))];
  const { data: schueler } = sids.length ? await db.from("students").select("id, vorname, nachname").in("id", sids) : { data: [] };
  const namen = (sid) => {
    const s = (schueler || []).find((x) => x.id === sid);
    return s ? [s.vorname, s.nachname, ...String(s.vorname).split(/\s+/), ...String(s.nachname).split(/\s+/)] : [];
  };

  const karte = {};
  console.log(`# Offene Nachträge (${new Date().toLocaleString("de-DE")})\n`);
  console.log("Schreibstil des Stufenteams:\n" + (einst?.stil || "(nicht gesetzt)") + "\n");

  console.log(`## „War da“-Angaben, die das Team prüfen soll: ${(angaben || []).length}`);
  (angaben || []).forEach((a, i) => {
    const k = `a${i + 1}`;
    karte[k] = { art: "angabe", id: a.id };
    const t = terminVon.get(a.termin_id);
    console.log(
      `- ${k}: Person ${i + 1} sagt „war da“ bei ${t ? `${t.titel} am ${tag(t.datum)}${t.von ? ` ${t.von.slice(0, 5)}` : ""}` : "?"}` +
        ` · ${a.eingeteilt ? "war eingeteilt" : "war NICHT eingeteilt"} · über ${a.quelle === "chat" ? "Chat" : "Abfrage"}` +
        `${t?.abschluss ? ` · Schicht schon abgeschlossen (${t.abschluss})` : ""}`,
    );
  });

  console.log(`\n## Gespräche, bei denen der Assistent nicht weiterkam: ${(vorschlaege || []).length}`);
  for (const [i, v] of (vorschlaege || []).entries()) {
    const k = `v${i + 1}`;
    karte[k] = { art: "vorschlag", id: v.id, topic_id: v.topic_id };
    const { data: verlauf } = await db.from("topic_items").select("body, author_role, created_by, created_at")
      .eq("topic_id", v.topic_id).order("created_at", { ascending: false }).limit(6);
    const n = namen(v.student_id);
    console.log(`\n### ${k} · Absicht: ${v.absicht} · Ergebnis: ${v.ergebnis}`);
    if (v.vorschlag) console.log(`Vorschlag des Assistenten: ${v.vorschlag}`);
    console.log("Letzte Nachrichten (neueste zuletzt):");
    for (const m of (verlauf || []).reverse()) {
      const wer = m.author_role === "assistent" ? "Assistent" : m.created_by === v.user_id ? "Person" : "Stufenteam";
      console.log(`  ${wer}: ${ohneNamen(m.body, n).slice(0, 400).replace(/\s+/g, " ")}`);
    }
  }
  writeFileSync(ZUORDNUNG, JSON.stringify(karte, null, 2));
  console.log(`\n(Kürzel gespeichert in privat/ – nur auf diesem Rechner.)`);
  process.exit(0);
}

// ------------------------------------------------------------ Aktionen
const karte = zuordnung();
const ziel = karte[kuerzel];
if (!ziel) {
  console.error(`Unbekanntes Kürzel „${kuerzel}“. Erst „liste“ aufrufen.`);
  process.exit(1);
}
const me = await ich();

if (befehl === "bestaetigen" || befehl === "ablehnen") {
  if (ziel.art !== "angabe") throw new Error("Das ist keine „war da“-Angabe.");
  const { data, error } = await db.rpc("anwesenheit_pruefen_als", { aid: ziel.id, stimmt: befehl === "bestaetigen", von: me.user_id });
  if (error) {
    console.error("Fehler:", error.message);
    process.exit(1);
  }
  console.log(`${kuerzel}: ${data}`);
} else if (befehl === "erledigt" || befehl === "verwerfen") {
  if (ziel.art !== "vorschlag") throw new Error("Das ist kein Vorschlag.");
  const { error } = await db.rpc("vorschlag_erledigen_als", { vid: ziel.id, p_status: befehl === "erledigt" ? "erledigt" : "verworfen", von: me.user_id });
  if (error) {
    console.error("Fehler:", error.message);
    process.exit(1);
  }
  console.log(`${kuerzel}: ${befehl}`);
} else if (befehl === "antworten") {
  if (ziel.art !== "vorschlag") throw new Error("Antworten geht nur in einem Gespräch (v…).");
  const text = String(process.argv[4] || "").trim();
  if (!text) throw new Error("Kein Text.");
  if (!["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"].includes(me.role)) throw new Error("Antworten darf nur das Stufenteam.");
  const { data: pp } = await db.from("public_profiles").select("anzeigename").eq("user_id", me.user_id).maybeSingle();
  const { error } = await db.from("topic_items").insert({
    topic_id: ziel.topic_id, type: "nachricht", title: "", body: text.slice(0, 2000),
    author: pp?.anzeigename || me.username, author_role: me.role, created_by: me.user_id,
  });
  if (error) {
    console.error("Fehler:", error.message);
    process.exit(1);
  }
  console.log(`${kuerzel}: Antwort geschrieben.`);
} else {
  console.error(`Unbekannter Befehl „${befehl}“. Möglich: liste, bestaetigen, ablehnen, erledigt, verwerfen, antworten.`);
  process.exit(1);
}
