import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";

/**
 * Abimotto (supabase/komitees-motto.sql)
 *
 *   vorschlagen   wer motto.nutzen hat – sofort sichtbar
 *   👍            beliebig vielen Mottos, umschaltbar
 *   🔥            nur einem Motto je Person (dein Favorit) – ein neues 🔥
 *                 nimmt das alte zurück (macht die Datenbank)
 *   verwalten     motto.verwalten (Standard: Komitee Motto & Pullis):
 *                 ändern, ausblenden, als Motto festlegen
 *
 * Reihenfolge: 🔥 zählen doppelt, dann 👍. Ohne Datenbank liegt alles im Browser.
 */
export type MottoArt = "like" | "feuer";

export interface Motto {
  id: string;
  text: string;
  erklaerung: string;
  von: string;
  von_name: string;
  created_at: string;
  ausgeblendet: boolean;
  gewaehlt: boolean;
}

interface Stimme {
  vorschlag_id: string;
  user_id: string;
  art: MottoArt;
}

const DEMO = "sv-motto-demo";
interface DemoDaten {
  mottos: Motto[];
  stimmen: Stimme[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  const jetzt = Date.now();
  const m = (i: number, text: string, erklaerung: string): Motto => ({
    id: `demo-m${i}`,
    text,
    erklaerung,
    von: "demo",
    von_name: "Demo",
    created_at: new Date(jetzt - i * 36e5 * 30).toISOString(),
    ausgeblendet: false,
    gewaehlt: false,
  });
  return {
    mottos: [
      m(1, "ABIgeschlossen", "Wortspiel mit abgeschlossen"),
      m(2, "Abi Wan Kenobi – möge der Schnitt mit uns sein", ""),
      m(3, "Abiversum – 12 Jahre, ein Ziel", ""),
    ],
    stimmen: [
      { vorschlag_id: "demo-m1", user_id: "a", art: "feuer" },
      { vorschlag_id: "demo-m1", user_id: "b", art: "like" },
      { vorschlag_id: "demo-m2", user_id: "a", art: "like" },
      { vorschlag_id: "demo-m3", user_id: "c", art: "feuer" },
      { vorschlag_id: "demo-m3", user_id: "d", art: "feuer" },
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

export function useMotto(aktiv: boolean, uid: string | null) {
  const [mottos, setMottos] = useState<Motto[]>([]);
  const [stimmen, setStimmen] = useState<Stimme[]>([]);
  const [bereit, setBereit] = useState(false);
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = uid || "local-user";

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setMottos(d.mottos);
      setStimmen(d.stimmen);
      setBereit(true);
      return;
    }
    const [m, s] = await Promise.all([
      supabase!.from("motto_vorschlaege").select("*").order("created_at", { ascending: false }).limit(500),
      supabase!.from("motto_stimmen").select("vorschlag_id, user_id, art").eq("an", true),
    ]);
    if (!m.error) setMottos((m.data as Motto[]) || []);
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
      name: "sv-motto",
      nachholen: laden,
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "motto_vorschlaege" }, bald)
          .on("postgres_changes", { event: "*", schema: "public", table: "motto_stimmen" }, bald),
    });
  }, [aktiv, laden]);

  const vorschlagen = useCallback(
    async (text: string, erklaerung: string): Promise<string | null> => {
      const t = text.trim().slice(0, 80);
      const e = erklaerung.trim().slice(0, 200);
      if (t.length < 2) return "Das Motto ist zu kurz";
      if (mottos.some((x) => x.text.toLowerCase() === t.toLowerCase())) return "Dieses Motto gibt es schon";
      if (!hasSupabase) {
        const d = demoLesen();
        d.mottos.unshift({ id: crypto.randomUUID(), text: t, erklaerung: e, von: me, von_name: "Ich", created_at: new Date().toISOString(), ausgeblendet: false, gewaehlt: false });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("motto_vorschlaege").insert({ text: t, erklaerung: e });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden, me, mottos],
  );

  /** Verwalten: Text ändern, aus-/einblenden, als Motto festlegen */
  const aendern = useCallback(
    async (id: string, patch: Partial<Pick<Motto, "text" | "erklaerung" | "ausgeblendet" | "gewaehlt">>): Promise<string | null> => {
      setMottos((l) =>
        l.map((x) => (x.id === id ? { ...x, ...patch } : patch.gewaehlt ? { ...x, gewaehlt: false } : x)),
      );
      if (!hasSupabase) {
        const d = demoLesen();
        d.mottos = d.mottos.map((x) => (x.id === id ? { ...x, ...patch } : patch.gewaehlt ? { ...x, gewaehlt: false } : x));
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!.from("motto_vorschlaege").update(patch).eq("id", id);
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  /** 👍 oder 🔥 an/aus – sofort sichtbar, dann gespeichert */
  const stimmen_ = stimmen;
  const abstimmen = useCallback(
    async (id: string, art: MottoArt): Promise<string | null> => {
      const an = !stimmen_.some((s) => s.vorschlag_id === id && s.user_id === me && s.art === art);
      const neu = (l: Stimme[]) => {
        let x = l.filter((s) => !(s.vorschlag_id === id && s.user_id === me && s.art === art));
        // 🔥 nur einmal: das alte geht weg
        if (an && art === "feuer") x = x.filter((s) => !(s.user_id === me && s.art === "feuer"));
        return an ? [...x, { vorschlag_id: id, user_id: me, art }] : x;
      };
      setStimmen(neu);
      if (!hasSupabase) {
        const d = demoLesen();
        d.stimmen = neu(d.stimmen);
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!
        .from("motto_stimmen")
        .upsert({ vorschlag_id: id, user_id: me, art, an }, { onConflict: "vorschlag_id,user_id,art" });
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [stimmen_, me, laden],
  );

  const zahl = useCallback((id: string, art: MottoArt) => stimmen.filter((s) => s.vorschlag_id === id && s.art === art).length, [stimmen]);
  const meine = useCallback((id: string, art: MottoArt) => stimmen.some((s) => s.vorschlag_id === id && s.user_id === me && s.art === art), [stimmen, me]);
  const punkte = useCallback((id: string) => 2 * zahl(id, "feuer") + zahl(id, "like"), [zahl]);
  const meinFavorit = mottos.find((m) => meine(m.id, "feuer")) || null;

  return { bereit, mottos, me, vorschlagen, aendern, abstimmen, zahl, meine, punkte, meinFavorit };
}

export type MottoWahl = ReturnType<typeof useMotto>;
