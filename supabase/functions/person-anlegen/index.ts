// Supabase Edge Function: legt eine neue Person an (Schüler-Datensatz + Login).
//
// Nur der Admin darf das. Der service_role-Key steckt automatisch in der
// Function (SUPABASE_SERVICE_ROLE_KEY) und verlässt den Server nie.
// Das Startpasswort tippt der Admin selbst ein (oder es wird erzeugt). Es wird
// genau einmal zurückgegeben und nirgends gespeichert – beim ersten Login muss
// es geändert werden.
//
// Deploy: supabase functions deploy person-anlegen

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, "content-type": "application/json" } });

const HALBJAHRE = ["EF.1", "EF.2", "Q1.1", "Q1.2", "Q2.1", "Q2.2"];
const ROLLEN = ["schueler", "stufenteam", "kassenwart"];

// Gleiche Wortliste wie scripts/passwoerter.mjs – "Anker-Muschel-472"
const WOERTER = [
  "Anker", "Birke", "Brise", "Delta", "Feder", "Funke", "Garten", "Hafen",
  "Insel", "Kiesel", "Komet", "Krone", "Lampe", "Linde", "Muschel", "Nebel",
  "Norden", "Pfeil", "Quelle", "Regen", "Ritter", "Salbei", "Segel", "Silber",
  "Sonne", "Spiegel", "Stern", "Tanne", "Turm", "Ufer", "Welle", "Wolke",
  "Achat", "Bernstein", "Distel", "Eiche", "Farn", "Granit", "Holunder",
  "Jade", "Karat", "Lawine", "Marmor", "Nordlicht", "Olive", "Pollen",
];
function zufall(n: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
function startpasswort(): string {
  const a = WOERTER[zufall(WOERTER.length)];
  let b = WOERTER[zufall(WOERTER.length)];
  while (b === a) b = WOERTER[zufall(WOERTER.length)];
  return `${a}-${b}-${100 + zufall(900)}`;
}

/** Vom Admin eingetipptes Passwort: leer = automatisch, sonst 8–72 Zeichen. */
function pruefePw(p: unknown): { pw: string; fehler?: string } {
  const pw = typeof p === "string" ? p.trim() : "";
  if (!pw) return { pw: "" };
  if (pw.length < 8) return { pw, fehler: "Das Passwort braucht mindestens 8 Zeichen." };
  if (pw.length > 72) return { pw, fehler: "Das Passwort ist zu lang." };
  return { pw };
}

const sauber = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Wie scripts/eltern-anlegen.mjs: "Liv Icking" -> "liv.icking" (Kind andersherum). */
function schlicht(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

type Db = ReturnType<typeof createClient>;

/** Elternzugang für ein Kind: sieht nur dieses Kind (parent_children + RLS). */
async function elternAnlegen(admin: Db, kind: { id: string; vorname: string; nachname: string }, wunschPw = "") {
  let username = `${schlicht(kind.vorname)}.${schlicht(kind.nachname)}`;
  const basis = username;
  for (let i = 2; i < 50; i++) {
    const { data: da } = await admin.from("profiles").select("user_id").eq("username", username).maybeSingle();
    if (!da) break;
    username = `${basis}${i}`;
  }
  const passwort = wunschPw || startpasswort();
  const { data: neu, error } = await admin.auth.admin.createUser({
    email: `${username}@sv-beitraege.local`,
    password: passwort,
    email_confirm: true,
  });
  if (error || !neu?.user) return { error: "Elternzugang: " + (error?.message || "unbekannt") };
  const uid = neu.user.id;
  const { error: pErr } = await admin.from("profiles").upsert(
    { user_id: uid, username, role: "eltern", student_id: null, must_change_password: true, has_logged_in: false },
    { onConflict: "user_id" },
  );
  if (pErr) {
    await admin.auth.admin.deleteUser(uid);
    return { error: "Elternprofil: " + pErr.message };
  }
  await admin.from("public_profiles").upsert({
    user_id: uid,
    anzeigename: `Familie ${kind.nachname}`,
    initialen: kind.nachname.slice(0, 2).toUpperCase(),
    farbe: "slate",
  });
  const { error: kErr } = await admin.from("parent_children").upsert({ user_id: uid, student_id: kind.id });
  if (kErr) return { error: "Kind-Zuordnung: " + kErr.message };
  return { username, passwort };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Wer fragt? Nur Admin (oder Owner) -----------------------------------
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wer } = await admin.auth.getUser(jwt);
  if (!wer?.user) return json({ error: "Bitte anmelden." }, 401);
  const { data: ich } = await admin.from("profiles").select("role, is_op").eq("user_id", wer.user.id).maybeSingle();
  if (!ich || !(ich.role === "admin" || ich.is_op)) {
    return json({ error: "Nur der Admin darf neue Personen anlegen." }, 403);
  }

  // ---- Eingaben prüfen -----------------------------------------------------
  const k = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Nur einen Elternzugang zu einer schon vorhandenen Person anlegen
  if (typeof k.eltern_fuer === "string") {
    const { data: kind } = await admin.from("students").select("id, vorname, nachname").eq("id", k.eltern_fuer).maybeSingle();
    if (!kind) return json({ error: "Person nicht gefunden." }, 404);
    const { data: schon } = await admin.from("parent_children").select("user_id").eq("student_id", kind.id);
    if (schon && schon.length && !k.trotzdem) return json({ error: "Für diese Person gibt es schon einen Elternzugang.", doppelt: true }, 409);
    const ep = pruefePw(k.eltern_passwort);
    if (ep.fehler) return json({ error: ep.fehler }, 400);
    const e = await elternAnlegen(admin, kind, ep.pw);
    if ("error" in e) return json({ error: e.error }, 500);
    console.log("Elternzugang angelegt:", e.username, "von", wer.user.id);
    return json({ ok: true, eltern: e });
  }
  const vorname = sauber(k.vorname);
  const nachname = sauber(k.nachname);
  const ab = HALBJAHRE.includes(String(k.beigetreten_ab)) ? String(k.beigetreten_ab) : "EF.1";
  const rolle = ROLLEN.includes(String(k.rolle)) ? String(k.rolle) : "schueler";
  if (!vorname || !nachname) return json({ error: "Vor- und Nachname fehlen." }, 400);
  if (vorname.length > 60 || nachname.length > 60) return json({ error: "Name ist zu lang." }, 400);
  const sp = pruefePw(k.passwort);
  if (sp.fehler) return json({ error: "Schüler: " + sp.fehler }, 400);
  const ep = pruefePw(k.eltern_passwort);
  if (ep.fehler) return json({ error: "Eltern: " + ep.fehler }, 400);

  // Gibt es die Person schon?
  const { data: gleich } = await admin
    .from("students").select("id").ilike("nachname", nachname).ilike("vorname", vorname).limit(1);
  if (gleich && gleich.length && !k.trotzdem) {
    return json({ error: `${vorname} ${nachname} steht schon in der Liste.`, doppelt: true }, 409);
  }

  // ---- Nutzername nach Schema nachname.vorname, bei Gleichheit mit Zahl ----
  const { data: basis, error: uErr } = await admin.rpc("username_for", { nachname, vorname });
  if (uErr || !basis) return json({ error: "Nutzername ließ sich nicht bilden." }, 500);
  let username = String(basis);
  for (let i = 2; i < 50; i++) {
    const { data: da } = await admin.from("profiles").select("user_id").eq("username", username).maybeSingle();
    if (!da) break;
    username = `${basis}${i}`;
  }

  // ---- Anlegen: erst Schüler, dann Login, dann verknüpfen ------------------
  const { data: st, error: sErr } = await admin
    .from("students").insert({ vorname, nachname, beigetreten_ab: ab }).select("id").single();
  if (sErr || !st) return json({ error: "Schüler-Datensatz: " + (sErr?.message || "unbekannt") }, 500);

  const passwort = sp.pw || startpasswort();
  const { data: neu, error: aErr } = await admin.auth.admin.createUser({
    email: `${username}@sv-beitraege.local`,
    password: passwort,
    email_confirm: true,
  });
  if (aErr || !neu?.user) {
    await admin.from("students").delete().eq("id", st.id);
    return json({ error: "Login: " + (aErr?.message || "unbekannt") }, 500);
  }

  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ user_id: neu.user.id, username, role: rolle, student_id: st.id, must_change_password: true }, { onConflict: "user_id" });
  if (pErr) {
    await admin.auth.admin.deleteUser(neu.user.id);
    await admin.from("students").delete().eq("id", st.id);
    return json({ error: "Profil: " + pErr.message }, 500);
  }

  console.log("Person angelegt:", username, "von", wer.user.id);
  let eltern: { username: string; passwort: string } | null = null;
  let elternFehler = "";
  if (k.mit_eltern) {
    const e = await elternAnlegen(admin, { id: st.id, vorname, nachname }, ep.pw);
    if ("error" in e) elternFehler = e.error || "";
    else eltern = e;
  }
  return json({ ok: true, username, passwort, student_id: st.id, user_id: neu.user.id, eltern, elternFehler });
});
