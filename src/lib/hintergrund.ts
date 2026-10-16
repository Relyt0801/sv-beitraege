import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { fehlerText } from "./netz";

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
 *
 * ----------------------------------------------------------------------------
 * Fehler bis 1.3: verschiedene Bilder auf verschiedenen Geräten (Update 1.4)
 * ----------------------------------------------------------------------------
 * Ursache 1 (die Hauptursache): Das Bild liegt IMMER unter demselben Namen
 * (<uid>/bild.jpg) und wurde mit „cache-control: max-age=31536000“ (1 Jahr)
 * hochgeladen. Hatte Gerät B das alte Bild schon einmal geladen, lieferte der
 * HTTP-Cache des Browsers (bzw. das CDN vor dem Speicher) beim nächsten
 * Herunterladen wieder das ALTE Bild – obwohl hintergrund_at sich geändert
 * hatte. Gerät B legte dieses alte Bild dann mit dem NEUEN Zeitstempel in
 * seinen Cache und hielt es damit für aktuell – dauerhaft.
 *   → Jetzt: Herunterladen mit `cacheNonce = hintergrund_at` (andere Adresse
 *     je Version, am CDN vorbei) und `cache: "no-store"` (am HTTP-Cache des
 *     Browsers vorbei). Neue Uploads bekommen max-age=0.
 *
 * Ursache 2: Scheiterte die Abfrage von hintergrund_at (kein Netz, Schul-WLAN),
 * galt das als „kein Bild“ – der Cache wurde geleert und das Bild verschwand
 * auf diesem Gerät, auf den anderen nicht.
 *   → Jetzt: Bei einem Fehler bleibt alles, wie es ist.
 *
 * Ursache 3: Geprüft wurde nur beim Start. Eine App, die tagelang im
 * Hintergrund offen bleibt (iPhone), bekam eine Änderung nie mit.
 *   → Jetzt: Prüfen beim Start, beim Wieder-Sichtbarwerden (visibilitychange)
 *     und live über Realtime auf die eigene profiles-Zeile
 *     (components/HintergrundEbene.tsx).
 *
 * Ursache 4: Beim Ändern/Entfernen wurde erst die Datei angefasst und dann
 * hintergrund_at – ging der zweite Schritt schief, zeigte dieses Gerät das
 * neue Bild, alle anderen das alte. Und wer zweimal kurz hintereinander lud,
 * konnte die Antworten in falscher Reihenfolge bekommen.
 *   → Jetzt: Die Datenbank ist die Wahrheit. Gezeigt wird nur, was dort
 *     gespeichert ist; Ladevorgänge sind nummeriert, nur der letzte zählt.
 */
const PFAD = (uid: string) => `${uid}/bild.jpg`; // Name bleibt, Typ steht im Content-Type
/*
 * Neuer Name ab 1.4: Im alten Cache („sv-hintergrund“) kann wegen Ursache 1
 * ein ALTES Bild mit NEUEM Zeitstempel liegen – das würde der Abgleich für
 * aktuell halten. Darum wird er einmal verworfen und neu geladen.
 */
const CACHE_NAME = "sv-hintergrund-2";
const ALTER_CACHE_NAME = "sv-hintergrund";
let alterCacheWeg = false;
function alterCacheWegraeumen() {
  if (alterCacheWeg) return;
  alterCacheWeg = true;
  try {
    if ("caches" in window) void caches.delete(ALTER_CACHE_NAME).catch(() => undefined);
  } catch {
    /* privater Modus */
  }
}
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
/** Welche Version (hintergrund_at) gerade angezeigt wird – "" = unbekannt. */
let aktuellAt: string | null = null;
function setzeAktuell(blob: Blob | null, at: string | null = null) {
  if (aktuell) URL.revokeObjectURL(aktuell);
  aktuell = blob ? URL.createObjectURL(blob) : null;
  aktuellAt = blob ? at : null;
  window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: aktuell }));
}

/** Welche Version gerade angezeigt wird (für den Realtime-Abgleich). */
export const hintergrundVersion = (): string | null => aktuellAt;

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

/**
 * Mit dem Server abgleichen: beim Start, beim Zurückkommen in die App und
 * wenn Realtime eine Änderung an der eigenen profiles-Zeile meldet.
 *
 * Ablauf:
 *  1. Sofort das Bild aus dem Cache zeigen (schneller Start, auch offline).
 *  2. hintergrund_at vom Server holen – das ist die Wahrheit.
 *     - Fehler (kein Netz …)  → nichts ändern, Cache bleibt.
 *     - null                  → Bild wurde (auf irgendeinem Gerät) entfernt:
 *                               Cache leeren, nichts zeigen.
 *     - gleich wie im Cache   → fertig.
 *     - anders                → neu herunterladen, an allen Caches vorbei.
 */
let ladeNr = 0;
export async function hintergrundLaden(uid: string | null): Promise<void> {
  const nr = ++ladeNr;
  const nochAktuell = () => nr === ladeNr;
  if (!uid) return setzeAktuell(null);
  const c = await cacheLesen(uid);
  if (!nochAktuell()) return;
  if (!hasSupabase) {
    if (!aktuell || aktuellAt !== (c?.at ?? null)) setzeAktuell(c?.blob ?? null, c?.at ?? null);
    return;
  }
  // 1. Aus dem Cache zeigen – aber nicht dasselbe Bild neu setzen (kein Flackern)
  if (c && aktuellAt !== c.at) setzeAktuell(c.blob, c.at);

  // 2. Wahrheit vom Server
  let at: string | null;
  try {
    const { data, error } = await supabase!.from("profiles").select("hintergrund_at").eq("user_id", uid).maybeSingle();
    if (error) return; // kein Netz o. Ä.: so lassen, wie es ist
    at = (data as { hintergrund_at?: string | null } | null)?.hintergrund_at ?? null;
  } catch {
    return;
  }
  if (!nochAktuell()) return;

  if (!at) {
    // Entfernt (auch auf einem anderen Gerät) → hier ebenfalls weg
    if (c) await cacheSchreiben(uid, null);
    if (nochAktuell() && aktuell) setzeAktuell(null);
    return;
  }
  if (c && c.at === at) {
    if (aktuellAt !== at) setzeAktuell(c.blob, at);
    return;
  }
  if (aktuellAt === at) return; // zeigt schon genau diese Version

  // Neue Version: an CDN (cacheNonce = neue Adresse je Version) und
  // HTTP-Cache des Browsers (no-store) vorbei herunterladen.
  try {
    const { data: blob, error } = await supabase!.storage
      .from("hintergruende")
      .download(PFAD(uid), { cacheNonce: at }, { cache: "no-store" });
    if (error || !blob || !nochAktuell()) return;
    await cacheSchreiben(uid, { at, blob });
    if (nochAktuell()) setzeAktuell(blob, at);
  } catch {
    /* kein Netz: beim nächsten Abgleich wieder */
  }
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
  ladeNr++; // laufende Abgleiche dürfen das neue Bild nicht mehr überschreiben
  if (hasSupabase) {
    try {
      // Erst die Datei, dann der Zeitstempel. Der Zeitstempel ist das Signal
      // für alle anderen Geräte – er darf erst stehen, wenn die Datei da ist.
      // max-age=0: Browser und CDN sollen sich das Bild nicht merken (die App
      // hat ihren eigenen Cache mit Versionsabgleich).
      const { error } = await supabase!.storage
        .from("hintergruende")
        .upload(PFAD(uid), blob, { upsert: true, contentType: blob.type || "image/jpeg", cacheControl: "0" });
      if (error) return fehlerText(error);
      const { error: e2 } = await supabase!.from("profiles").update({ hintergrund_at: at }).eq("user_id", uid);
      // Ohne Zeitstempel sehen die anderen Geräte das neue Bild nicht – dann
      // lieber auch hier beim alten bleiben, damit alle dasselbe zeigen.
      if (e2) return fehlerText(e2);
    } catch (e) {
      return fehlerText(e);
    }
  }
  await cacheSchreiben(uid, { at, blob });
  setzeAktuell(blob, at);
  return null;
}

export async function hintergrundEntfernen(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  ladeNr++;
  if (hasSupabase) {
    try {
      // Zuerst die Wahrheit setzen (hintergrund_at = null): Damit entfernen
      // alle anderen Geräte das Bild beim nächsten Abgleich bzw. sofort über
      // Realtime. Danach erst die Datei – bleibt die liegen, stört sie nicht.
      const { error } = await supabase!.from("profiles").update({ hintergrund_at: null }).eq("user_id", uid);
      if (error) return fehlerText(error);
      const { error: e2 } = await supabase!.storage.from("hintergruende").remove([PFAD(uid)]);
      if (e2) console.warn("[hintergrund] Datei blieb liegen:", e2.message);
    } catch (e) {
      return fehlerText(e);
    }
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
