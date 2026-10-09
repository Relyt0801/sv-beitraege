import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

/**
 * Eigenes Hintergrundbild (nur fürs eigene Konto).
 *
 * Das Bild wird im Browser verkleinert (längste Seite 1600 px, JPEG) und in
 * einen PRIVATEN Speicher geladen: Bucket „hintergruende“, Ordner = eigene
 * Konto-ID. Lesen, ersetzen, löschen darf nur das Konto selbst
 * (supabase/runden-und-freigaben.sql). Niemand sonst sieht es – auch nicht
 * das Team.
 *
 * profiles.hintergrund_at merkt sich, wann es zuletzt geändert wurde. So holt
 * ein anderes Gerät das Bild nur neu, wenn es sich geändert hat; dazwischen
 * liegt es im Browser (localStorage).
 */
const PFAD = (uid: string) => `${uid}/bild.jpg`;
const CACHE = (uid: string) => `sv:hintergrund:${uid}`;
const EREIGNIS = "sv:hintergrund";

interface Cache {
  at: string;
  bild: string; // data:-URL
}

function cacheLesen(uid: string): Cache | null {
  try {
    const roh = localStorage.getItem(CACHE(uid));
    return roh ? (JSON.parse(roh) as Cache) : null;
  } catch {
    return null;
  }
}
function cacheSchreiben(uid: string, c: Cache | null) {
  try {
    if (c) localStorage.setItem(CACHE(uid), JSON.stringify(c));
    else localStorage.removeItem(CACHE(uid));
  } catch {
    /* zu groß oder privater Modus – dann eben jedes Mal laden */
  }
}

let aktuell: string | null = null;
function setzeAktuell(bild: string | null) {
  aktuell = bild;
  window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: bild }));
}

function alsDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fehler(r.error);
    r.readAsDataURL(blob);
  });
}

/** Verkleinern: längste Seite 1600 px, JPEG 82 % – meist 150–400 KB */
async function verkleinern(datei: File): Promise<Blob> {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fehler) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fehler(new Error("Das Bild ließ sich nicht öffnen."));
      i.src = url;
    });
    const f = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, fehler) => c.toBlob((b) => (b ? ok(b) : fehler(new Error("Verkleinern ging nicht."))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Beim Start: eigenes Bild laden (aus dem Browser oder neu vom Server) */
export async function hintergrundLaden(uid: string | null): Promise<void> {
  if (!uid) return setzeAktuell(null);
  const c = cacheLesen(uid);
  if (!hasSupabase) return setzeAktuell(c?.bild ?? null);
  if (c) setzeAktuell(c.bild);
  const { data } = await supabase!.from("profiles").select("hintergrund_at").eq("user_id", uid).maybeSingle();
  const at = (data as { hintergrund_at?: string | null } | null)?.hintergrund_at ?? null;
  if (!at) {
    cacheSchreiben(uid, null);
    return setzeAktuell(null);
  }
  if (c && c.at === at) return;
  const { data: blob, error } = await supabase!.storage.from("hintergruende").download(PFAD(uid));
  if (error || !blob) return;
  const bild = await alsDataUrl(blob);
  cacheSchreiben(uid, { at, bild });
  setzeAktuell(bild);
}

export async function hintergrundSetzen(uid: string | null, datei: File): Promise<string | null> {
  if (!uid) return "Bitte anmelden.";
  if (!datei.type.startsWith("image/")) return "Bitte ein Bild auswählen.";
  let blob: Blob;
  try {
    blob = await verkleinern(datei);
  } catch (e) {
    return (e as Error).message;
  }
  const bild = await alsDataUrl(blob);
  const at = new Date().toISOString();
  if (hasSupabase) {
    const { error } = await supabase!.storage.from("hintergruende").upload(PFAD(uid), blob, { upsert: true, contentType: "image/jpeg" });
    if (error) return error.message;
    const { error: e2 } = await supabase!.from("profiles").update({ hintergrund_at: at }).eq("user_id", uid);
    if (e2) return e2.message;
  }
  cacheSchreiben(uid, { at, bild });
  setzeAktuell(bild);
  return null;
}

export async function hintergrundEntfernen(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  if (hasSupabase) {
    const { error } = await supabase!.storage.from("hintergruende").remove([PFAD(uid)]);
    if (error) return error.message;
    await supabase!.from("profiles").update({ hintergrund_at: null }).eq("user_id", uid);
  }
  cacheSchreiben(uid, null);
  setzeAktuell(null);
  return null;
}

/** Das aktuelle Bild (oder null) – aktualisiert sich beim Ändern */
export function useHintergrund(): string | null {
  const [bild, setBild] = useState<string | null>(aktuell);
  useEffect(() => {
    const h = (e: Event) => setBild((e as CustomEvent<string | null>).detail);
    window.addEventListener(EREIGNIS, h);
    return () => window.removeEventListener(EREIGNIS, h);
  }, []);
  return bild;
}
