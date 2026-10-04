import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";

/**
 * Zitatwand (supabase/funktionen-zitate.sql)
 *
 *   einreichen  wer zitate.nutzen hat – landet erst „offen“
 *   prüfen      wer zitate.pruefen hat – freigeben oder ablehnen (wird geleert)
 *   🔥          eine Stimme je Person und Zitat, umschaltbar
 *
 * Ohne Datenbank (Demo) liegt alles im Browser.
 */
export type ZitatArt = "lehrer" | "schueler";
export type ZitatStatus = "offen" | "frei" | "abgelehnt";

export interface Zitat {
  id: string;
  text: string;
  wer: string;
  art: ZitatArt;
  kontext: string;
  status: ZitatStatus;
  eingereicht_von: string;
  eingereicht_name: string;
  created_at: string;
  geprueft_at?: string | null;
}

interface Stimme {
  zitat_id: string;
  user_id: string;
}

const DEMO = "sv-zitate-demo";
interface DemoDaten {
  zitate: Zitat[];
  stimmen: Stimme[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  // Erfundene Beispiele, damit die Demo nicht leer ist
  const jetzt = Date.now();
  const z = (i: number, text: string, wer: string, art: ZitatArt, kontext: string): Zitat => ({
    id: `demo-z${i}`,
    text,
    wer,
    art,
    kontext,
    status: "frei",
    eingereicht_von: "demo",
    eingereicht_name: "Demo",
    created_at: new Date(jetzt - i * 36e5 * 20).toISOString(),
  });
  return {
    zitate: [
      z(1, "Das ist keine Meinung, das ist Chemie.", "Frau Beispiel", "lehrer", "Chemie"),
      z(2, "Ich hab nicht verschlafen, ich war nur früh für morgen.", "Max M.", "schueler", "Q1"),
      z(3, "Sie können gerne gehen – aber nur, wenn Sie wiederkommen.", "Herr Muster", "lehrer", "Deutsch-LK"),
    ],
    stimmen: [
      { zitat_id: "demo-z1", user_id: "a" },
      { zitat_id: "demo-z1", user_id: "b" },
      { zitat_id: "demo-z3", user_id: "a" },
    ],
  };
}
function demoSchreiben(d: DemoDaten) {
  try {
    localStorage.setItem(DEMO, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}

export function useZitate(aktiv: boolean, uid: string | null) {
  const [zitate, setZitate] = useState<Zitat[]>([]);
  const [stimmen, setStimmen] = useState<Stimme[]>([]);
  const [bereit, setBereit] = useState(false);
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = uid || "local-user";

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setZitate(d.zitate.filter((z) => z.status !== "abgelehnt"));
      setStimmen(d.stimmen);
      setBereit(true);
      return;
    }
    const [z, s] = await Promise.all([
      supabase!.from("zitate").select("*").neq("status", "abgelehnt").order("created_at", { ascending: false }).limit(1000),
      supabase!.from("zitat_stimmen").select("zitat_id, user_id").eq("an", true),
    ]);
    if (!z.error) setZitate((z.data as Zitat[]) || []);
    if (!s.error) setStimmen((s.data as Stimme[]) || []);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    const bald = () => {
      if (zeit.current) clearTimeout(zeit.current);
      zeit.current = setTimeout(() => void laden(), 350);
    };
    return abonniere({
      name: "sv-zitate",
      nachholen: laden,
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "zitate" }, bald)
          .on("postgres_changes", { event: "*", schema: "public", table: "zitat_stimmen" }, bald),
    });
  }, [aktiv, laden]);

  const einreichen = useCallback(
    async (z: { text: string; wer: string; art: ZitatArt; kontext: string }): Promise<string | null> => {
      const sauber = { text: z.text.trim().slice(0, 300), wer: z.wer.trim().slice(0, 60), art: z.art, kontext: z.kontext.trim().slice(0, 60) };
      if (!sauber.text || !sauber.wer) return "Zitat und Name fehlen";
      if (!hasSupabase) {
        const d = demoLesen();
        d.zitate.unshift({
          ...sauber,
          id: crypto.randomUUID(),
          status: "offen",
          eingereicht_von: me,
          eingereicht_name: "Ich",
          created_at: new Date().toISOString(),
        });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("zitate").insert(sauber);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden, me],
  );

  const pruefen = useCallback(
    async (id: string, status: "frei" | "abgelehnt"): Promise<string | null> => {
      setZitate((l) => (status === "abgelehnt" ? l.filter((z) => z.id !== id) : l.map((z) => (z.id === id ? { ...z, status } : z))));
      if (!hasSupabase) {
        const d = demoLesen();
        d.zitate = d.zitate.map((z) => (z.id === id ? { ...z, status, geprueft_at: new Date().toISOString() } : z));
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!.from("zitate").update({ status }).eq("id", id);
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  /** Nachträglich ändern (Recht zitate.pruefen) */
  const bearbeiten = useCallback(
    async (id: string, z: { text: string; wer: string; kontext: string }): Promise<string | null> => {
      const sauber = { text: z.text.trim().slice(0, 300), wer: z.wer.trim().slice(0, 60), kontext: z.kontext.trim().slice(0, 60) };
      if (!sauber.text || !sauber.wer) return "Zitat und Name fehlen";
      setZitate((l) => l.map((x) => (x.id === id ? { ...x, ...sauber } : x)));
      if (!hasSupabase) {
        const d = demoLesen();
        d.zitate = d.zitate.map((x) => (x.id === id ? { ...x, ...sauber } : x));
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!.from("zitate").update(sauber).eq("id", id);
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  /** 🔥 an/aus – sofort sichtbar, dann gespeichert */
  const abstimmen = useCallback(
    async (id: string) => {
      const an = !stimmen.some((s) => s.zitat_id === id && s.user_id === me);
      setStimmen((l) => (an ? [...l, { zitat_id: id, user_id: me }] : l.filter((s) => !(s.zitat_id === id && s.user_id === me))));
      if (!hasSupabase) {
        const d = demoLesen();
        d.stimmen = an ? [...d.stimmen, { zitat_id: id, user_id: me }] : d.stimmen.filter((s) => !(s.zitat_id === id && s.user_id === me));
        demoSchreiben(d);
        return;
      }
      await supabase!.from("zitat_stimmen").upsert({ zitat_id: id, user_id: me, an }, { onConflict: "zitat_id,user_id" });
    },
    [stimmen, me],
  );

  const stimmenVon = useCallback((id: string) => stimmen.filter((s) => s.zitat_id === id).length, [stimmen]);
  const meineStimme = useCallback((id: string) => stimmen.some((s) => s.zitat_id === id && s.user_id === me), [stimmen, me]);

  return { bereit, zitate, me, einreichen, pruefen, bearbeiten, abstimmen, stimmenVon, meineStimme };
}

export type Zitatwand = ReturnType<typeof useZitate>;
