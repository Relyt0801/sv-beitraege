// Supabase Edge Function: Infos zu einem Spotify-Link für den Steckbrief.
// Deploy:  supabase functions deploy spotify-info   (JWT-Prüfung bleibt an)
//
// Holt Titel, Künstler, Cover und die 30-Sekunden-Hörprobe serverseitig und
// speichert sie in spotify_titel (30 Tage). So geht beim Ansehen eines
// Steckbriefs nichts an Spotify – das Cover kommt als Bild-Daten aus unserer
// Datenbank. Erst wer auf „Abspielen“ tippt, lädt die Hörprobe von Spotify.
// Es werden nur Adressen von open.spotify.com aufgerufen, die aus der
// erkannten ID neu gebaut werden (keine fremden Adressen aus der Anfrage).

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Nur angemeldete Personen
    const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const { data: me } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    if (!me?.user?.id) return json({ error: "nicht angemeldet" }, 401);

    const { url } = (await req.json().catch(() => ({}))) as { url?: string };
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
    let cover = "";
    const bild = String(oe.thumbnail_url || "");
    if (/^https:\/\/[a-z0-9.-]*(scdn\.co|spotifycdn\.com)\//.test(bild)) {
      const r = await fetch(bild).catch(() => null);
      if (r?.ok) {
        const typ = r.headers.get("content-type") || "image/jpeg";
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.length < 300_000 && typ.startsWith("image/")) {
          let s = "";
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          cover = `data:${typ};base64,${btoa(s)}`;
        }
      }
    }

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
