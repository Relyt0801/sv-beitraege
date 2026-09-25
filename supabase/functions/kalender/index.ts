// Supabase Edge Function "kalender" – Termine der Stufe mit dem eigenen
// Handy-Kalender verbinden. Zwei Richtungen:
//
// 1. App → Handy (Abo): GET ?u=<user_id>&t=<schluessel>
//    Liefert eine .ics-Datei mit allen Terminen, die diese Person in der App
//    sieht. Der Link wird in iPhone/Google/Outlook als Kalender-Abo eingetragen;
//    die Kalender-App fragt selbst regelmäßig nach (iPhone: einstellbar, meist
//    alle 15 min bis 1 h; Google: alle paar Stunden).
//    Kalender-Apps können sich nicht anmelden – deshalb steht im Link ein
//    Schlüssel (HMAC über die user_id). Er wird mit dem service_role-Key
//    gebildet und lässt sich nicht erraten; wer den Link hat, sieht aber die
//    Termine dieser Person. Also nicht weitergeben.
//
// 2. Handy → App: POST { aktion: "fremd", url } mit Anmeldung
//    Holt den eigenen Kalender über dessen iCal-Link (iCloud "Öffentlicher
//    Kalender", Google "Privatadresse im iCal-Format", Outlook "ICS-Link") und
//    gibt die Termine der nächsten Monate als JSON zurück. Die App zeigt sie
//    grau im Kalender – nur dieser Person, nur auf diesem Gerät. Gespeichert
//    wird hier nichts.
//
// Dazu POST { aktion: "link" } mit Anmeldung: gibt den persönlichen Abo-Link.
//
// DEMO: Vorerst nur für die Testkonten in DEMO_KONTEN. Alle anderen bekommen
// weder Link noch Abo noch Import.
//
// Deploy: supabase functions deploy kalender --no-verify-jwt
// (ohne JWT-Prüfung, weil Kalender-Apps keinen Login schicken – die Function
//  prüft selbst: Schlüssel im Link bzw. Anmeldung bei POST).

import { createClient } from "npm:@supabase/supabase-js@2";
import { kalenderIcs, leseIcs } from "./ics.ts";

const DEMO_KONTEN = ["admin.test", "test.admin"];

/** So heißt der Kalender im Handy – daran erkennt man die Stufen-Termine. */
const KALENDER_NAME = "Stufen-Termine (Stufenkasse)";
const HINWEIS = "Stufen-Termin aus der Stufenkasse-App. Ändern geht nur dort.";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, "content-type": "application/json" } });

const URL_BASIS = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_BASIS, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const TEAM = ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"];

// ------------------------------------------------------------ Schlüssel

async function schluessel(uid: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`kalender:v1:${uid}`)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}

function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function profilVon(uid: string) {
  const { data } = await admin.from("profiles").select("user_id, username, role, student_id").eq("user_id", uid).maybeSingle();
  return data as { user_id: string; username: string | null; role: string; student_id: string | null } | null;
}

const istDemo = (p: { username: string | null } | null) => Boolean(p?.username && DEMO_KONTEN.includes(p.username));

// ------------------------------------------------------------ Sichtbarkeit
// Dieselbe Regel wie kann_termin_sehen() in supabase/termine.sql – hier für eine
// bestimmte Person statt für auth.uid(), weil das Abo ohne Anmeldung kommt.

async function sichtbareTermine(p: { user_id: string; role: string; student_id: string | null }) {
  const von = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data: termine } = await admin
    .from("termine")
    .select("id, titel, beschreibung, ort, datum, bis_datum, von, bis, sichtbar, fuer_eltern, icon, created_at")
    .or(`datum.gte.${von},bis_datum.gte.${von}`)
    .order("datum")
    .limit(2000);
  const liste = (termine as Record<string, any>[]) || [];
  if (TEAM.includes(p.role)) return liste;

  const eltern = p.role === "eltern";
  const { data: kinder } = await admin.from("parent_children").select("student_id").eq("user_id", p.user_id);
  const kinderIds = ((kinder as { student_id: string }[]) || []).map((k) => k.student_id);
  const personen = new Set<string>([...(p.student_id ? [p.student_id] : []), ...kinderIds]);
  // meine_komitees(): eigene Komitees und die der Kinder
  const nutzer = [p.user_id];
  if (kinderIds.length) {
    const { data: kinderKonten } = await admin.from("profiles").select("user_id").in("student_id", kinderIds);
    for (const k of (kinderKonten as { user_id: string }[]) || []) nutzer.push(k.user_id);
  }
  const { data: tags } = await admin.from("tag_members").select("tag").in("user_id", nutzer);
  const komitees = new Set(((tags as { tag: string }[]) || []).map((t) => t.tag));

  const ids = liste.map((t) => t.id);
  const [{ data: tk }, { data: tp }] = await Promise.all([
    admin.from("termin_komitees").select("termin_id, tag").in("termin_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("termin_personen").select("termin_id, student_id").in("termin_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const komiteeVon = new Map<string, string[]>();
  for (const r of (tk as { termin_id: string; tag: string }[]) || []) komiteeVon.set(r.termin_id, [...(komiteeVon.get(r.termin_id) || []), r.tag]);
  const personVon = new Map<string, string[]>();
  for (const r of (tp as { termin_id: string; student_id: string }[]) || []) personVon.set(r.termin_id, [...(personVon.get(r.termin_id) || []), r.student_id]);

  return liste.filter((t) => {
    if (eltern && !t.fuer_eltern) return false;
    if (t.sichtbar === "alle") return true;
    if (t.sichtbar === "komitee") return (komiteeVon.get(t.id) || []).some((tag) => komitees.has(tag));
    if (t.sichtbar === "personen") return (personVon.get(t.id) || []).some((s) => personen.has(s));
    return false;
  });
}

// ------------------------------------------------------------ Fremder Kalender

// Nur Kalenderdienste – die Function soll kein offener Proxy für beliebige Seiten sein.
const ERLAUBTE_HOSTS = [/\.icloud\.com$/, /^calendar\.google\.com$/, /^outlook\.(live|office365|office)\.com$/, /\.office\.com$/];

function pruefeUrl(roh: string): URL | null {
  try {
    const u = new URL(roh.trim().replace(/^webcals?:\/\//i, "https://"));
    if (u.protocol !== "https:") return null;
    if (!ERLAUBTE_HOSTS.some((r) => r.test(u.hostname))) return null;
    return u;
  } catch {
    return null;
  }
}

async function holeText(u: URL): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(u, { signal: ctrl.signal, redirect: "follow", headers: { accept: "text/calendar, */*" } });
    if (!r.ok) throw new Error(`Der Kalender antwortet mit ${r.status}.`);
    const text = await r.text();
    if (text.length > 3_000_000) throw new Error("Der Kalender ist zu groß.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Unter dem Link liegt kein Kalender.");
    return text;
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------ Anfragen

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1) Abo abrufen – ohne Anmeldung, mit Schlüssel im Link
  if (req.method === "GET") {
    const u = new URL(req.url);
    const uid = u.searchParams.get("u") || "";
    const t = u.searchParams.get("t") || "";
    if (!/^[0-9a-f-]{36}$/i.test(uid) || !t || !gleich(t, await schluessel(uid))) {
      return new Response("Link ungültig.", { status: 403, headers: cors });
    }
    const p = await profilVon(uid);
    if (!p || !istDemo(p)) return new Response("Kalender-Abo ist für dieses Konto nicht freigeschaltet.", { status: 403, headers: cors });
    const termine = await sichtbareTermine(p);
    // Gekennzeichnet: eigener Kalendername, Kategorie "Stufe" und ein Satz in
    // jeder Beschreibung – so sieht man im Handy sofort, woher ein Termin kommt.
    const ics = kalenderIcs(
      termine.map((t) => ({ ...t, hinweis: HINWEIS })) as any,
      { name: KALENDER_NAME },
    );
    return new Response(ics, {
      headers: {
        ...cors,
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="stufenkasse.ics"',
        "cache-control": "no-cache",
      },
    });
  }

  if (req.method !== "POST") return json({ error: "Nur GET oder POST." }, 405);

  // 2) Alles andere nur angemeldet
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wer } = await admin.auth.getUser(jwt);
  if (!wer?.user) return json({ error: "Bitte anmelden." }, 401);
  const p = await profilVon(wer.user.id);
  if (!istDemo(p)) return json({ error: "Die Kalender-Verbindung ist noch in der Testphase." }, 403);
  const k = (await req.json().catch(() => ({}))) as { aktion?: string; url?: string };

  if (k.aktion === "link") {
    const https = `${URL_BASIS}/functions/v1/kalender?u=${wer.user.id}&t=${await schluessel(wer.user.id)}`;
    return json({ https, webcal: https.replace(/^https:/, "webcal:") });
  }

  if (k.aktion === "fremd") {
    const u = pruefeUrl(k.url || "");
    if (!u) return json({ error: "Das ist kein Kalender-Link von iCloud, Google oder Outlook." }, 400);
    try {
      const text = await holeText(u);
      const heute = new Date();
      const von = new Date(heute.getTime() - 31 * 86400000).toISOString().slice(0, 10);
      const bis = new Date(heute.getTime() + 400 * 86400000).toISOString().slice(0, 10);
      const termine = leseIcs(text, von, bis, 1500);
      const name = /X-WR-CALNAME:(.+)/.exec(text)?.[1]?.trim() || "";
      return json({ termine, name });
    } catch (e) {
      return json({ error: (e as Error).message || "Der Kalender ließ sich nicht laden." }, 502);
    }
  }

  return json({ error: "Unbekannte Aktion." }, 400);
});
