// Supabase Edge Function: Infos zu einem Spotify-Link für den Steckbrief.
// Deploy:  supabase functions deploy spotify-info   (JWT-Prüfung bleibt an)
//
// Holt Titel, Künstler, Cover und die 30-Sekunden-Hörprobe serverseitig und
// speichert sie in spotify_titel (30 Tage). So geht beim Ansehen eines
// Steckbriefs nichts an Spotify – das Cover kommt als Bild-Daten aus unserer
// Datenbank. Erst wer auf „Abspielen“ tippt, lädt die Hörprobe von Spotify.
// Es werden nur Adressen von open.spotify.com aufgerufen, die aus der
// erkannten ID neu gebaut werden (keine fremden Adressen aus der Anfrage).
//
// Suche ({ suche: "Mr Brightside" }): nur wenn die Supabase-Secrets
// SPOTIFY_CLIENT_ID und SPOTIFY_CLIENT_SECRET gesetzt sind (eigene App im
// Spotify-Developer-Dashboard, Client-Credentials – kein Nutzerkonto nötig).
// Ohne Secrets kommt { ohneSchluessel: true } und die App bietet „In Spotify
// suchen“ + „Kopierten Link einfügen“ an. Kleine Cover kommen als Bild-Daten.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, "content-type": "application/json" } });

const MUSTER = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?|spotify:)(track|album|playlist|episode)[/:]([A-Za-z0-9]{10,40})/;
const TAGE = 30;

let token: { wert: string; bis: number } | null = null;
async function spotifyToken(id: string, geheim: string): Promise<string | null> {
  if (token && token.bis > Date.now() + 30_000) return token.wert;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: "Basic " + btoa(`${id}:${geheim}`) },
    body: "grant_type=client_credentials",
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = await r.json();
  token = { wert: d.access_token, bis: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return token.wert;
}

async function alsDaten(bild: string, max = 300_000): Promise<string> {
  if (!/^https:\/\/[a-z0-9.-]*(scdn\.co|spotifycdn\.com)\//.test(bild)) return "";
  const r = await fetch(bild).catch(() => null);
  if (!r?.ok) return "";
  const typ = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length >= max || !typ.startsWith("image/")) return "";
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${typ};base64,${btoa(s)}`;
}

interface SpTrack {
  id: string;
  name: string;
  artists?: { name: string }[];
  album?: { images?: { url: string; width: number }[] };
}

async function suchen(q: string) {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const geheim = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !geheim) return json({ ohneSchluessel: true });
  const t = await spotifyToken(id, geheim);
  if (!t) return json({ ohneSchluessel: true, error: "Spotify-Anmeldung ging nicht" });
  const r = await fetch(
    `https://api.spotify.com/v1/search?type=track&market=DE&limit=8&q=${encodeURIComponent(q)}`,
    { headers: { authorization: `Bearer ${t}` } },
  ).catch(() => null);
  if (!r?.ok) return json({ error: `Spotify-Suche ging nicht (${r?.status ?? "keine Verbindung"})` }, 502);
  const d = await r.json();
  const liste = ((d?.tracks?.items || []) as SpTrack[]).filter((x) => /^[A-Za-z0-9]{10,40}$/.test(x.id));
  const treffer = await Promise.all(
    liste.map(async (x) => {
      const bilder = x.album?.images || [];
      const klein = [...bilder].sort((a, b) => a.width - b.width)[0]?.url || "";
      return {
        id: x.id,
        titel: String(x.name || "").slice(0, 200),
        kuenstler: (x.artists || []).map((a) => a.name).slice(0, 4).join(", ").slice(0, 200),
        cover: klein ? await alsDaten(klein, 60_000) : "",
      };
    }),
  );
  return json({ treffer });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Nur angemeldete Personen
    const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const { data: me } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    if (!me?.user?.id) return json({ error: "nicht angemeldet" }, 401);

    const { url, suche } = (await req.json().catch(() => ({}))) as { url?: string; suche?: string };
    if (typeof suche === "string") {
      const q = suche.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
      if (q.length < 2) return json({ treffer: [] });
      return await suchen(q);
    }
    const m = String(url || "").match(MUSTER);
    if (!m) return json({ error: "kein Spotify-Link" }, 400);
    const art = m[1];
    const id = m[2];
    const schluessel = `${art}:${id}`;

    const { data: alt } = await supabase.from("spotify_titel").select("*").eq("schluessel", schluessel).maybeSingle();
    if (alt && Date.parse(alt.geholt) > Date.now() - TAGE * 864e5) return json(alt);

    const seite = `https://open.spotify.com/${art}/${id}`;
    const [oe, emb] = await Promise.all([
      fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(seite)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`https://open.spotify.com/embed/${art}/${id}`, { headers: { "user-agent": "Mozilla/5.0" } }).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
    ]);
    if (!oe) return json({ error: "Spotify kennt diesen Link nicht" }, 404);

    // Künstler und Hörprobe stehen in den Daten der Einbett-Seite
    const kuenstler = [...emb.matchAll(/"artists":\[(.*?)\]/g)]
      .slice(0, 1)
      .flatMap((x) => [...x[1].matchAll(/"name":"((?:[^"\\]|\\.)*)"/g)].map((n) => JSON.parse(`"${n[1]}"`)))
      .slice(0, 4)
      .join(", ");
    const vorschau = emb.match(/"audioPreview":\{"url":"(https:\/\/p\.scdn\.co\/mp3-preview\/[A-Za-z0-9]+)/)?.[1] || "";

    // Cover als Bild-Daten (höchstens 300 kB)
    const cover = await alsDaten(String(oe.thumbnail_url || ""));

    const zeile = {
      schluessel,
      titel: String(oe.title || "").slice(0, 200),
      kuenstler: kuenstler.slice(0, 200),
      cover,
      vorschau,
      geholt: new Date().toISOString(),
    };
    await supabase.from("spotify_titel").upsert(zeile);
    return json(zeile);
  } catch (e) {
    console.log("FEHLER:", String(e));
    return json({ error: String(e) }, 500);
  }
});
