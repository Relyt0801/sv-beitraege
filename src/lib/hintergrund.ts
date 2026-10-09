import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

/**
 * Eigenes Hintergrundbild (nur fürs eigene Konto).
 *
 * Das Bild wird im Browser für Retina-Bildschirme aufbereitet (längste Seite
 * bis 2560 px, WebP bzw. JPEG mit 90 %) und in einen PRIVATEN Speicher geladen:
 * Bucket „hintergruende“, Ordner = eigene Konto-ID. Lesen, ersetzen, löschen
 * darf nur das Konto selbst (supabase/runden-und-freigaben.sql). Niemand sonst
 * sieht es – auch nicht das Team. Ist das Original schon klein genug, wird es
 * unverändert hochgeladen (kein zweites Komprimieren).
 *
 * profiles.hintergrund_at merkt sich, wann es zuletzt geändert wurde. So holt
 * ein anderes Gerät das Bild nur neu, wenn es sich geändert hat; dazwischen
 * liegt es im Cache-Speicher des Browsers (Cache API – anders als localStorage
 * ohne 5-MB-Grenze und ohne Umweg über Text).
 */
const PFAD = (uid: string) => `${uid}/bild.jpg`; // Name bleibt, Typ steht im Content-Type
const CACHE_NAME = "sv-hintergrund";
const CACHE_URL = (uid: string) => `/__hintergrund/${uid}`;
const ALT_CACHE = (uid: string) => `sv:hintergrund:${uid}`; // bis 1.3: data:-URL in localStorage
const EREIGNIS = "sv:hintergrund";
const MAX_SEITE = 2560;
const MAX_BYTES = 5_500_000; // Bucket erlaubt 6 MB

async function cacheLesen(uid: string): Promise<{ at: string; blob: Blob } | null> {
  try {
    if (!("caches" in window)) return null;
    const c = await caches.open(CACHE_NAME);
    const r = await c.match(CACHE_URL(uid));
    if (!r) return null;
    return { at: r.headers.get("x-at") || "", blob: await r.blob() };
  } catch {
    return null;
  }
}
async function cacheSchreiben(uid: string, eintrag: { at: string; blob: Blob } | null) {
  try {
    localStorage.removeItem(ALT_CACHE(uid)); // alten, großen Eintrag aufräumen
  } catch {
    /* privater Modus */
  }
  try {
    if (!("caches" in window)) return;
    const c = await caches.open(CACHE_NAME);
    if (!eintrag) await c.delete(CACHE_URL(uid));
    else
      await c.put(
        CACHE_URL(uid),
        new Response(eintrag.blob, { headers: { "content-type": eintrag.blob.type || "image/jpeg", "x-at": eintrag.at } }),
      );
  } catch {
    /* voll oder privater Modus – dann eben jedes Mal laden */
  }
}

let aktuell: string | null = null;
function setzeAktuell(blob: Blob | null) {
  if (aktuell) URL.revokeObjectURL(aktuell);
  aktuell = blob ? URL.createObjectURL(blob) : null;
  window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: aktuell }));
}

function bildOeffnen(datei: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(datei);
  return new Promise<HTMLImageElement>((ok, fehler) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fehler(new Error("Das Bild ließ sich nicht öffnen."));
    i.src = url;
  }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 0));
}

function alsBlob(c: HTMLCanvasElement, typ: string, q: number): Promise<Blob | null> {
  return new Promise((ok) => c.toBlob((b) => ok(b), typ, q));
}

/**
 * Für den Bildschirm aufbereiten: längste Seite höchstens 2560 px, in
 * Halbschritten verkleinert (schärfer als ein großer Sprung), dann WebP 90 %
 * – kann der Browser kein WebP (ältere iPhones), JPEG 90 %.
 */
async function aufbereiten(datei: File): Promise<Blob> {
  const img = await bildOeffnen(datei);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const passt = Math.max(w0, h0) <= MAX_SEITE;
  // Schon passend und nicht zu groß: Original behalten
  if (passt && datei.size <= MAX_BYTES && /^image\/(jpeg|webp|png)$/.test(datei.type)) return datei;

  const f = Math.min(1, MAX_SEITE / Math.max(w0, h0));
  const zielW = Math.round(w0 * f);
  const zielH = Math.round(h0 * f);
  let quelle: CanvasImageSource = img;
  let w = w0;
  let h = h0;
  // Halbschritte, solange mehr als doppelt so groß wie das Ziel
  while (w / 2 >= zielW && h / 2 >= zielH) {
    const zw = document.createElement("canvas");
    zw.width = Math.round(w / 2);
    zw.height = Math.round(h / 2);
    const k = zw.getContext("2d")!;
    k.imageSmoothingEnabled = true;
    k.imageSmoothingQuality = "high";
    k.drawImage(quelle, 0, 0, zw.width, zw.height);
    quelle = zw;
    w = zw.width;
    h = zw.height;
  }
  const c = document.createElement("canvas");
  c.width = zielW;
  c.height = zielH;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(quelle, 0, 0, zielW, zielH);

  for (const q of [0.9, 0.82, 0.72]) {
    const webp = await alsBlob(c, "image/webp", q);
    const b = webp && webp.type === "image/webp" ? webp : await alsBlob(c, "image/jpeg", q);
    if (b && b.size <= MAX_BYTES) return b;
  }
  throw new Error("Das Bild ist zu groß.");
}

/** Beim Start: eigenes Bild laden (aus dem Cache oder neu vom Server) */
export async function hintergrundLaden(uid: string | null): Promise<void> {
  if (!uid) return setzeAktuell(null);
  const c = await cacheLesen(uid);
  if (!hasSupabase) return setzeAktuell(c?.blob ?? null);
  if (c) setzeAktuell(c.blob);
  const { data } = await supabase!.from("profiles").select("hintergrund_at").eq("user_id", uid).maybeSingle();
  const at = (data as { hintergrund_at?: string | null } | null)?.hintergrund_at ?? null;
  if (!at) {
    await cacheSchreiben(uid, null);
    return setzeAktuell(null);
  }
  if (c && c.at === at) return;
  const { data: blob, error } = await supabase!.storage.from("hintergruende").download(PFAD(uid));
  if (error || !blob) return;
  await cacheSchreiben(uid, { at, blob });
  setzeAktuell(blob);
}

export async function hintergrundSetzen(uid: string | null, datei: File): Promise<string | null> {
  if (!uid) return "Bitte anmelden.";
  if (!datei.type.startsWith("image/")) return "Bitte ein Bild auswählen.";
  let blob: Blob;
  try {
    blob = await aufbereiten(datei);
  } catch (e) {
    return (e as Error).message;
  }
  const at = new Date().toISOString();
  if (hasSupabase) {
    const { error } = await supabase!.storage
      .from("hintergruende")
      .upload(PFAD(uid), blob, { upsert: true, contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
    if (error) return error.message;
    const { error: e2 } = await supabase!.from("profiles").update({ hintergrund_at: at }).eq("user_id", uid);
    if (e2) return e2.message;
  }
  await cacheSchreiben(uid, { at, blob });
  setzeAktuell(blob);
  return null;
}

export async function hintergrundEntfernen(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  if (hasSupabase) {
    const { error } = await supabase!.storage.from("hintergruende").remove([PFAD(uid)]);
    if (error) return error.message;
    await supabase!.from("profiles").update({ hintergrund_at: null }).eq("user_id", uid);
  }
  await cacheSchreiben(uid, null);
  setzeAktuell(null);
  return null;
}

/** Das aktuelle Bild als Objekt-URL (oder null) – aktualisiert sich beim Ändern */
export function useHintergrund(): string | null {
  const [bild, setBild] = useState<string | null>(aktuell);
  useEffect(() => {
    const h = (e: Event) => setBild((e as CustomEvent<string | null>).detail);
    window.addEventListener(EREIGNIS, h);
    setBild(aktuell);
    return () => window.removeEventListener(EREIGNIS, h);
  }, []);
  return bild;
}
