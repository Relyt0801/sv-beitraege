import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { pushAnTeam } from "./push";
import { nochFehlend, zustimmen } from "./zustimmung";

/**
 * Steckbrief-Fotos (supabase/album-fotos.sql)
 *
 * Jede Person lädt EIN Foto hoch. Andere sehen es erst nach der Freigabe
 * durch das Stufenteam (Standard 3 Zustimmungen, Profil → Freigaben). Die
 * Datenbank gibt Zeilen und Dateien nur heraus, wenn man sie sehen darf –
 * hier wird nur noch angezeigt, was ankommt.
 *
 * Bilder liegen in einem privaten Bucket; angezeigt wird über kurzlebige
 * signierte Adressen. Ein gemeinsamer Stand für alle Stellen der App.
 */
export type FotoStatus = "offen" | "frei" | "abgelehnt" | "entfernt";
export interface AlbumFoto {
  student_id: string;
  id: string;
  pfad: string;
  status: FotoStatus;
  created_at: string;
}

const BUCKET = "album-fotos";
const DEMO = "sv-album-fotos-demo";
const MAX_SEITE = 1400;

interface Stand {
  fotos: AlbumFoto[];
  urls: Record<string, string>; // pfad -> Adresse
  bereit: boolean;
}
let stand: Stand = { fotos: [], urls: {}, bereit: false };
const hoerer = new Set<(s: Stand) => void>();
const setze = (s: Stand) => {
  stand = s;
  for (const h of hoerer) h(s);
};
let laeuft: Promise<void> | null = null;
let kanal: (() => void) | null = null;
let nutzer = 0;

function demoLesen(): AlbumFoto[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO) || "[]") as AlbumFoto[];
  } catch {
    return [];
  }
}

async function laden(): Promise<void> {
  if (laeuft) return laeuft;
  laeuft = (async () => {
    if (!hasSupabase) {
      const fotos = demoLesen();
      setze({ fotos, urls: Object.fromEntries(fotos.map((f) => [f.pfad, f.pfad])), bereit: true });
      return;
    }
    const { data, error } = await supabase!.from("album_fotos").select("student_id, id, pfad, status, created_at");
    if (error) return setze({ ...stand, bereit: true });
    const fotos = ((data as AlbumFoto[]) || []).filter((f) => f.status === "offen" || f.status === "frei");
    const fehlend = fotos.map((f) => f.pfad).filter((p) => !stand.urls[p]);
    const urls = { ...stand.urls };
    if (fehlend.length) {
      const { data: s } = await supabase!.storage.from(BUCKET).createSignedUrls(fehlend, 60 * 60 * 6);
      for (const x of s || []) if (x.path && x.signedUrl) urls[x.path] = x.signedUrl;
    }
    setze({ fotos, urls, bereit: true });
  })().finally(() => {
    laeuft = null;
  });
  return laeuft;
}

/** Für ein schärferes, kleineres Bild: längste Seite 1400 px, WebP/JPEG 88 % */
async function aufbereiten(datei: File): Promise<Blob> {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fehler) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fehler(new Error("Das Bild ließ sich nicht öffnen."));
      i.src = url;
    });
    const f = Math.min(1, MAX_SEITE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const als = (typ: string) => new Promise<Blob | null>((ok) => c.toBlob(ok, typ, 0.88));
    const webp = await als("image/webp");
    const b = webp && webp.type === "image/webp" ? webp : await als("image/jpeg");
    if (!b) throw new Error("Das Bild ließ sich nicht umwandeln.");
    return b;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useAlbumFotos(aktiv: boolean) {
  const [s, setS] = useState<Stand>(stand);

  useEffect(() => {
    hoerer.add(setS);
    setS(stand);
    return () => {
      hoerer.delete(setS);
    };
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    nutzer++;
    if (!kanal)
      kanal = abonniere({
        name: "sv-album-fotos",
        nachholen: laden,
        aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "album_fotos" }, () => void laden()),
      });
    return () => {
      nutzer--;
      if (nutzer <= 0 && kanal) {
        kanal();
        kanal = null;
      }
    };
  }, [aktiv]);

  /** Foto zum Anzeigen (freigegeben – oder das eigene bzw. zum Prüfen) */
  const fotoVon = useCallback(
    (studentId: string, auchOffen = false): string | null => {
      const f = s.fotos.find((x) => x.student_id === studentId);
      if (!f) return null;
      if (f.status !== "frei" && !(auchOffen && f.status === "offen")) return null;
      return s.urls[f.pfad] || null;
    },
    [s],
  );
  const eintragVon = useCallback((studentId: string) => s.fotos.find((x) => x.student_id === studentId) || null, [s]);
  const offene = s.fotos.filter((f) => f.status === "offen");

  return { bereit: s.bereit, fotoVon, eintragVon, offene, urlVon: (pfad: string) => s.urls[pfad] || null, laden };
}

/** Eigenes Foto hochladen – wartet danach auf die Freigabe */
export async function fotoHochladen(studentId: string, datei: File): Promise<string | null> {
  if (!datei.type.startsWith("image/")) return "Bitte ein Bild auswählen.";
  let blob: Blob;
  try {
    blob = await aufbereiten(datei);
  } catch (e) {
    return (e as Error).message;
  }
  if (!hasSupabase) {
    const pfad = await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.readAsDataURL(blob);
    });
    const alle = demoLesen().filter((f) => f.student_id !== studentId);
    alle.push({ student_id: studentId, id: crypto.randomUUID(), pfad, status: "offen", created_at: new Date().toISOString() });
    try {
      localStorage.setItem(DEMO, JSON.stringify(alle));
    } catch {
      return "Im Testbetrieb ist kein Platz mehr für das Bild.";
    }
    await laden();
    return null;
  }
  const pfad = `${studentId}/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const { error } = await supabase!.storage.from(BUCKET).upload(pfad, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) return error.message;
  const { error: e2 } = await supabase!.rpc("album_foto_gesetzt", { p_pfad: pfad });
  if (e2) return e2.message;
  void pushAnTeam("📷 Neues Steckbrief-Foto", "Bitte prüfen – erst danach sehen es die anderen.", "./#anfrage-foto", { art: "anfrage" });
  await laden();
  return null;
}

export async function fotoEntfernen(studentId: string): Promise<string | null> {
  if (!hasSupabase) {
    try {
      localStorage.setItem(DEMO, JSON.stringify(demoLesen().filter((f) => f.student_id !== studentId)));
    } catch {
      /* privater Modus */
    }
    await laden();
    return null;
  }
  const { error } = await supabase!.rpc("album_foto_entfernen");
  if (error) return error.message;
  await laden();
  return null;
}

/** Stufenteam: freigeben (sammelt Zustimmungen) oder ablehnen */
export async function fotoEntscheiden(f: AlbumFoto, frei: boolean): Promise<string | null> {
  if (!hasSupabase) {
    const alle = demoLesen().map((x) => (x.id === f.id ? { ...x, status: (frei ? "frei" : "abgelehnt") as FotoStatus } : x));
    try {
      localStorage.setItem(DEMO, JSON.stringify(alle));
    } catch {
      /* privater Modus */
    }
    await laden();
    return null;
  }
  if (frei) {
    const z = await zustimmen("foto", f.id);
    if ("error" in z) return z.error;
    if (!z.fertig) return nochFehlend(z);
  }
  const { error } = await supabase!.rpc("album_foto_entscheiden", { p_id: f.id, p_frei: frei });
  if (error) return error.message;
  await laden();
  return null;
}
