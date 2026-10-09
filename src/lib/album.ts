import { hatVerlassen } from "./logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { pushAlbum } from "./push";
import { useStore } from "../store";

/**
 * Abi-Album (supabase/abi-album.sql)
 *
 *   Stammdaten  schreibt nur die Person selbst (Kategorien legt das Team fest)
 *   Text        schreibt die Person selbst – oder, wenn sie ihn freigibt,
 *               alle bzw. ausgewählte Mitschüler
 *   Kommentare  wie bei Instagram, mit Likes; Likes auch auf den Steckbrief
 *
 * Ohne Datenbank (Demo) liegt alles im Browser.
 */
export interface AlbumKategorie {
  id: string;
  titel: string;
  platzhalter: string;
  sort: number;
  aktiv: boolean;
}

export type Freigabe = "niemand" | "alle" | "gezielt";

export interface Steckbrief {
  student_id: string;
  stammdaten: Record<string, string>;
  text: string;
  text_von_name: string;
  text_at: string | null;
  freigabe: Freigabe;
  freigabe_an: string[];
  updated_at: string;
  /** Korrigiert durch die Abizeitung (Recht album.redigieren) */
  korrigiert_von_name?: string;
  korrigiert_at?: string | null;
}

export interface AlbumKommentar {
  id: string;
  student_id: string;
  user_id: string;
  autor_name: string;
  text: string;
  created_at: string;
}

export interface AlbumPerson {
  id: string;
  vorname: string;
  nachname: string;
}

interface Like {
  student_id: string;
  user_id: string;
}
interface KLike {
  kommentar_id: string;
  user_id: string;
}

const DEMO = "sv-album-demo";
interface DemoDaten {
  kategorien: AlbumKategorie[];
  steckbriefe: Steckbrief[];
  kommentare: AlbumKommentar[];
  likes: Like[];
  klikes: KLike[];
}
const DEMO_KATEGORIEN: AlbumKategorie[] = [
  ["Spitzname", "Wie nennen dich alle?"],
  ["Nach dem Abi", "Studium, Ausbildung, Reisen …"],
  ["Lieblingslied", "Titel – Interpret"],
  ["Lieblingsfach", "Und warum?"],
  ["Lebensmotto", "Ein Satz"],
  ["Werde ich vermissen", "An der Schule …"],
].map(([titel, platzhalter], i) => ({ id: `k${i + 1}`, titel, platzhalter, sort: i + 1, aktiv: true }));

function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  return { kategorien: DEMO_KATEGORIEN, steckbriefe: [], kommentare: [], likes: [], klikes: [] };
}
function demoSchreiben(d: DemoDaten) {
  try {
    localStorage.setItem(DEMO, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}

const leer = (student_id: string): Steckbrief => ({
  student_id,
  stammdaten: {},
  text: "",
  text_von_name: "",
  text_at: null,
  freigabe: "niemand",
  freigabe_an: [],
  updated_at: new Date().toISOString(),
});

/** Kurzer Name für Kommentare: „Lena M.“ */
export const kurzName = (p: { vorname: string; nachname: string }) =>
  `${p.vorname} ${p.nachname ? p.nachname[0] + "." : ""}`.trim();

/** Wie weit ist ein Steckbrief? (Stammdaten + Text) in Prozent */
export function fortschritt(s: Steckbrief | undefined, kategorien: AlbumKategorie[]): number {
  const aktiv = kategorien.filter((k) => k.aktiv);
  const teile = aktiv.length + 1;
  if (!s) return 0;
  const voll = aktiv.filter((k) => (s.stammdaten[k.id] || "").trim()).length + (s.text.trim() ? 1 : 0);
  return Math.round((voll / teile) * 100);
}

/** Feste Farbe je Person – für Polaroid-Rahmen und Initialen. */
// Bunt wie bis 1.2: Verläufe zwischen zwei kräftigen Farben. 16 Paare, damit
// in einer Stufe mit 130 Leuten nicht ständig dieselbe Farbe nebeneinander steht.
const VERLAEUFE = [
  "from-[#FF9F0A] to-[#FF375F]",
  "from-[#5E5CE6] to-[#BF5AF2]",
  "from-[#30D158] to-[#0A84FF]",
  "from-[#FF375F] to-[#BF5AF2]",
  "from-[#0A84FF] to-[#64D2FF]",
  "from-[#FFD60A] to-[#FF9F0A]",
  "from-[#64D2FF] to-[#30D158]",
  "from-[#BF5AF2] to-[#FF9F0A]",
  "from-[#FF453A] to-[#FFD60A]",
  "from-[#32D74B] to-[#FFD60A]",
  "from-[#0A84FF] to-[#5E5CE6]",
  "from-[#FF2D55] to-[#FF9F0A]",
  "from-[#30B0C7] to-[#5E5CE6]",
  "from-[#AC8E68] to-[#FF9F0A]",
  "from-[#FF6482] to-[#64D2FF]",
  "from-[#00C7BE] to-[#0A84FF]",
];
export function personVerlauf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  // Durchmischen, damit ähnliche IDs nicht dieselbe Farbe bekommen
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0; // >>> 0: sonst negativ → kein Eintrag, weiße Kachel
  return VERLAEUFE[h % VERLAEUFE.length];
}

export function useAlbum(aktiv: boolean, uid: string | null, meineStudentId: string | null) {
  const { students, settings } = useStore();
  const [personen, setPersonen] = useState<AlbumPerson[]>([]);
  const [kategorien, setKategorien] = useState<AlbumKategorie[]>([]);
  const [steckbriefe, setSteckbriefe] = useState<Steckbrief[]>([]);
  const [kommentare, setKommentare] = useState<AlbumKommentar[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [klikes, setKlikes] = useState<KLike[]>([]);
  const [bereit, setBereit] = useState(false);
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);

  const demoLaden = useCallback(() => {
    const d = demoLesen();
    setKategorien(d.kategorien);
    setSteckbriefe(d.steckbriefe);
    setKommentare(d.kommentare);
    setLikes(d.likes);
    setKlikes(d.klikes);
    setBereit(true);
  }, []);

  const laden = useCallback(async () => {
    if (!hasSupabase) return demoLaden();
    const sb = supabase!;
    const [p, k, s, c, l, kl] = await Promise.all([
      sb.rpc("album_personen"),
      sb.from("album_kategorien").select("*").order("sort"),
      sb.from("album_steckbriefe").select("*"),
      sb.from("album_kommentare").select("id, student_id, user_id, autor_name, text, created_at").order("created_at").limit(3000),
      sb.from("album_likes").select("student_id, user_id").eq("an", true),
      sb.from("album_kommentar_likes").select("kommentar_id, user_id").eq("an", true),
    ]);
    if (!p.error) setPersonen((p.data as AlbumPerson[]) || []);
    if (!k.error) setKategorien((k.data as AlbumKategorie[]) || []);
    if (!s.error) setSteckbriefe((s.data as Steckbrief[]) || []);
    if (!c.error) setKommentare((c.data as AlbumKommentar[]) || []);
    if (!l.error) setLikes((l.data as Like[]) || []);
    if (!kl.error) setKlikes((kl.data as KLike[]) || []);
    setBereit(true);
  }, [demoLaden]);

  // Mehrere Änderungen kurz hintereinander = einmal laden
  const bald = useCallback(() => {
    if (zeit.current) clearTimeout(zeit.current);
    zeit.current = setTimeout(() => void laden(), 350);
  }, [laden]);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    return abonniere({
      name: "sv-album",
      nachholen: laden,
      aufbauen: (kanal) =>
        ["album_steckbriefe", "album_kommentare", "album_likes", "album_kommentar_likes"].reduce(
          (k, table) => k.on("postgres_changes", { event: "*", schema: "public", table }, bald),
          kanal,
        ),
    });
  }, [aktiv, laden, bald]);

  // Demo: Personen = alle Einträge im Gerät
  const alle: AlbumPerson[] = useMemo(
    () =>
      hasSupabase
        ? personen
        : [...students]
            .filter((s) => !hatVerlassen(s, settings.aktuelles_halbjahr))
            .sort((a, b) => a.vorname.localeCompare(b.vorname))
            .map((s) => ({ id: s.id, vorname: s.vorname, nachname: s.nachname })),
    [personen, students, settings.aktuelles_halbjahr],
  );

  const demoAendern = (fn: (d: DemoDaten) => void) => {
    const d = demoLesen();
    fn(d);
    demoSchreiben(d);
    demoLaden();
  };

  const steckbriefVon = useCallback(
    (id: string) => steckbriefe.find((s) => s.student_id === id),
    [steckbriefe],
  );

  /** Nur die eigenen Stammdaten. Gibt Fehlertext oder null zurück. */
  const stammdatenSpeichern = useCallback(
    async (daten: Record<string, string>): Promise<string | null> => {
      if (!meineStudentId) return "Kein eigener Eintrag";
      if (!hasSupabase) {
        demoAendern((d) => {
          const alt = d.steckbriefe.find((s) => s.student_id === meineStudentId) || leer(meineStudentId);
          const neu = { ...alt, stammdaten: Object.fromEntries(Object.entries(daten).filter(([, v]) => v.trim())) };
          d.steckbriefe = [...d.steckbriefe.filter((s) => s.student_id !== meineStudentId), neu];
        });
        return null;
      }
      const { error } = await supabase!.rpc("album_stammdaten_speichern", { p_daten: daten });
      if (error) return error.message;
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meineStudentId, laden],
  );

  const textSchreiben = useCallback(
    async (studentId: string, text: string, vonName: string): Promise<string | null> => {
      if (!hasSupabase) {
        demoAendern((d) => {
          const alt = d.steckbriefe.find((s) => s.student_id === studentId) || leer(studentId);
          const neu = { ...alt, text, text_von_name: studentId === meineStudentId ? "" : vonName, text_at: new Date().toISOString() };
          d.steckbriefe = [...d.steckbriefe.filter((s) => s.student_id !== studentId), neu];
        });
        return null;
      }
      const { error } = await supabase!.rpc("album_text_schreiben", { p_student: studentId, p_text: text });
      if (error) return error.message.includes("freigegeben") ? "Dafür bist du (nicht mehr) freigegeben." : error.message;
      // Besitzer kurz Bescheid geben, wenn jemand anderes schreibt
      if (studentId !== meineStudentId) void pushAlbum({ art: "text", student_id: studentId });
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meineStudentId, laden],
  );

  /**
   * Korrigieren (Recht album.redigieren, Standard: Komitee Abizeitung und
   * Admin): Stammdaten und Text eines beliebigen Steckbriefs, z. B. für
   * Rechtschreibung. Wer den Text geschrieben hat, bleibt stehen; dazu
   * „korrigiert von …“.
   */
  const redigieren = useCallback(
    async (studentId: string, daten: Record<string, string>, text: string): Promise<string | null> => {
      if (!hasSupabase) {
        demoAendern((d) => {
          const alt = d.steckbriefe.find((s) => s.student_id === studentId) || leer(studentId);
          const neu = {
            ...alt,
            stammdaten: Object.fromEntries(Object.entries(daten).filter(([, v]) => v.trim())),
            text,
            korrigiert_von_name: "Abizeitung",
            korrigiert_at: new Date().toISOString(),
          };
          d.steckbriefe = [...d.steckbriefe.filter((s) => s.student_id !== studentId), neu];
        });
        return null;
      }
      const { error } = await supabase!.rpc("album_redigieren", { p_student: studentId, p_daten: daten, p_text: text });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const freigabeSetzen = useCallback(
    async (modus: Freigabe, an: string[]): Promise<string | null> => {
      if (!meineStudentId) return "Kein eigener Eintrag";
      if (!hasSupabase) {
        demoAendern((d) => {
          const alt = d.steckbriefe.find((s) => s.student_id === meineStudentId) || leer(meineStudentId);
          d.steckbriefe = [
            ...d.steckbriefe.filter((s) => s.student_id !== meineStudentId),
            { ...alt, freigabe: modus, freigabe_an: modus === "gezielt" ? an : [] },
          ];
        });
        return null;
      }
      const { error } = await supabase!.rpc("album_freigabe_setzen", { p_modus: modus, p_personen: an });
      if (error) return error.message;
      // Wer neu freigegeben wurde, bekommt eine Mitteilung
      const alt = steckbriefVon(meineStudentId);
      const vorher = new Set(alt?.freigabe === "gezielt" ? alt.freigabe_an : []);
      const neu = modus === "gezielt" ? an.filter((x) => !vorher.has(x)) : [];
      if (neu.length) void pushAlbum({ art: "freigabe", an: neu });
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meineStudentId, laden, steckbriefVon, alle],
  );

  const kommentieren = useCallback(
    async (studentId: string, text: string, vonName: string): Promise<string | null> => {
      const t = text.trim();
      if (!t) return null;
      if (!hasSupabase) {
        demoAendern((d) => {
          d.kommentare.push({
            id: crypto.randomUUID(),
            student_id: studentId,
            user_id: uid || "local-user",
            autor_name: vonName,
            text: t.slice(0, 500),
            created_at: new Date().toISOString(),
          });
        });
        return null;
      }
      const { data: neu, error } = await supabase!.from("album_kommentare").insert({ student_id: studentId, text: t.slice(0, 500) }).select("id").single();
      if (error) return error.message;
      if (studentId !== meineStudentId && neu) void pushAlbum({ art: "kommentar", kommentar_id: (neu as { id: string }).id });
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, meineStudentId, laden],
  );

  const kommentarEntfernen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        demoAendern((d) => {
          d.kommentare = d.kommentare.filter((k) => k.id !== id);
        });
        return null;
      }
      const { error } = await supabase!.rpc("album_kommentar_entfernen", { p_id: id });
      if (error) return error.message;
      setKommentare((l) => l.filter((k) => k.id !== id));
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const textEntfernen = useCallback(
    async (studentId: string): Promise<string | null> => {
      if (!hasSupabase) return textSchreiben(studentId, "", "");
      const { error } = await supabase!.rpc("album_text_entfernen", { p_student: studentId });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden, textSchreiben],
  );

  const me = uid || "local-user";

  /** Herz am Steckbrief an/aus – sofort sichtbar, dann gespeichert. */
  const liken = useCallback(
    async (studentId: string) => {
      const an = !likes.some((l) => l.student_id === studentId && l.user_id === me);
      setLikes((l) => (an ? [...l, { student_id: studentId, user_id: me }] : l.filter((x) => !(x.student_id === studentId && x.user_id === me))));
      if (!hasSupabase) {
        const d = demoLesen();
        d.likes = an ? [...d.likes, { student_id: studentId, user_id: me }] : d.likes.filter((x) => !(x.student_id === studentId && x.user_id === me));
        demoSchreiben(d);
        return;
      }
      await supabase!.from("album_likes").upsert({ student_id: studentId, user_id: me, an }, { onConflict: "student_id,user_id" });
    },
    [likes, me],
  );

  const kommentarLiken = useCallback(
    async (kommentarId: string) => {
      const an = !klikes.some((l) => l.kommentar_id === kommentarId && l.user_id === me);
      setKlikes((l) => (an ? [...l, { kommentar_id: kommentarId, user_id: me }] : l.filter((x) => !(x.kommentar_id === kommentarId && x.user_id === me))));
      if (!hasSupabase) {
        const d = demoLesen();
        d.klikes = an ? [...d.klikes, { kommentar_id: kommentarId, user_id: me }] : d.klikes.filter((x) => !(x.kommentar_id === kommentarId && x.user_id === me));
        demoSchreiben(d);
        return;
      }
      await supabase!.from("album_kommentar_likes").upsert({ kommentar_id: kommentarId, user_id: me, an }, { onConflict: "kommentar_id,user_id" });
    },
    [klikes, me],
  );

  // ------------------------------------------------ Kategorien (Team)
  const kategorieSpeichern = useCallback(
    async (k: Partial<AlbumKategorie> & { titel: string }): Promise<string | null> => {
      if (!hasSupabase) {
        demoAendern((d) => {
          if (k.id) d.kategorien = d.kategorien.map((x) => (x.id === k.id ? { ...x, ...k } : x));
          else d.kategorien.push({ id: crypto.randomUUID(), platzhalter: "", aktiv: true, sort: d.kategorien.length + 1, ...k });
        });
        return null;
      }
      const zeile = { titel: k.titel.trim().slice(0, 60), platzhalter: (k.platzhalter || "").slice(0, 80), aktiv: k.aktiv ?? true, sort: k.sort ?? kategorien.length + 1 };
      const { error } = k.id
        ? await supabase!.from("album_kategorien").update(zeile).eq("id", k.id)
        : await supabase!.from("album_kategorien").insert(zeile);
      if (error) return error.message;
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kategorien.length, laden],
  );

  /** Kategorie ganz entfernen (Einträge dazu werden nicht mehr angezeigt) */
  const kategorieLoeschen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        demoAendern((d) => {
          d.kategorien = d.kategorien.filter((k) => k.id !== id);
        });
        return null;
      }
      const { error } = await supabase!.from("album_kategorien").delete().eq("id", id);
      if (error) return error.message;
      await laden();
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laden],
  );

  /** Reihenfolge tauschen (hoch/runter) */
  const kategorieVerschieben = useCallback(
    async (id: string, richtung: -1 | 1) => {
      const liste = [...kategorien].sort((a, b) => a.sort - b.sort);
      const i = liste.findIndex((k) => k.id === id);
      const j = i + richtung;
      if (i < 0 || j < 0 || j >= liste.length) return;
      const a = liste[i];
      const b = liste[j];
      await kategorieSpeichern({ ...a, sort: b.sort === a.sort ? b.sort + richtung : b.sort });
      await kategorieSpeichern({ ...b, sort: a.sort });
    },
    [kategorien, kategorieSpeichern],
  );

  return {
    bereit,
    personen: alle,
    kategorien: [...kategorien].sort((a, b) => a.sort - b.sort),
    steckbriefe,
    kommentare,
    likes,
    klikes,
    me,
    steckbriefVon,
    stammdatenSpeichern,
    textSchreiben,
    redigieren,
    freigabeSetzen,
    kommentieren,
    kommentarEntfernen,
    textEntfernen,
    liken,
    kommentarLiken,
    kategorieSpeichern,
    kategorieVerschieben,
    kategorieLoeschen,
    neuLaden: laden,
  };
}

export type Album = ReturnType<typeof useAlbum>;

/** Album von überall öffnen (z. B. aus einer Mitteilung) */
export function oeffneAlbum(studentId?: string) {
  window.dispatchEvent(new CustomEvent("sv:album", { detail: studentId ?? null }));
}
