import { useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { useStore } from "../store";

/**
 * Abi-Rankings und Lehrerliste (supabase/rankings-lehrer.sql)
 *
 *   Kategorien  „Wird am ehesten berühmt“ – je Kategorie Schüler ODER Lehrer
 *   Stimmen     eine je Person und Kategorie, änderbar; null = „weiß nicht“
 *   Stand       Top 3 je Kategorie, gezählt (ranking_stand) – alle 15 s neu
 *   Lehrer      Liste fürs Lehrer-Ranking und für Zitate
 *
 * Ohne Datenbank (Demo) liegt alles im Browser.
 */
export type RankingArt = "schueler" | "lehrer";

export interface RankingKategorie {
  id: string;
  titel: string;
  art: RankingArt;
  sort: number;
  aktiv: boolean;
}

export interface Lehrer {
  id: string;
  name: string;
  faecher: string;
  aktiv: boolean;
}

export interface StufenPerson {
  id: string;
  vorname: string;
  nachname: string;
}

export interface RankingStand {
  kategorie_id: string;
  stimmen: number;
  top: { ziel: string; n: number }[];
}

/* ---------------------------------------------------------------- Demo */
const DEMO = "sv-rankings-demo";
interface DemoDaten {
  kategorien: RankingKategorie[];
  lehrer: Lehrer[];
  stimmen: { kategorie_id: string; user_id: string; ziel: string | null }[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  // Erfundene Beispiele
  const lehrer = ["Frau Beispiel", "Herr Muster", "Frau Probe", "Herr Test"].map((name, i) => ({ id: `demo-l${i}`, name, faecher: "", aktiv: true }));
  const k = (i: number, titel: string, art: RankingArt): RankingKategorie => ({ id: `demo-r${i}`, titel, art, sort: i, aktiv: true });
  return {
    kategorien: [
      k(1, "Wird am ehesten berühmt", "schueler"),
      k(2, "Kommt garantiert zu spät zur eigenen Hochzeit", "schueler"),
      k(3, "Hat immer Snacks dabei", "schueler"),
      k(4, "Bester Ausrede-Erfinder", "lehrer"),
      k(5, "Wäre der beste Klassenfahrt-Begleiter", "lehrer"),
    ],
    lehrer,
    stimmen: [
      { kategorie_id: "demo-r4", user_id: "a", ziel: "demo-l1" },
      { kategorie_id: "demo-r4", user_id: "b", ziel: "demo-l1" },
      { kategorie_id: "demo-r4", user_id: "c", ziel: "demo-l0" },
      { kategorie_id: "demo-r5", user_id: "a", ziel: "demo-l2" },
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
const ME_DEMO = "local-user";

/* ---------------------------------------------------------------- Personen der Stufe */
export function useStufePersonen(aktiv: boolean): StufenPerson[] {
  const { students } = useStore();
  const [liste, setListe] = useState<StufenPerson[]>([]);
  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void supabase!.rpc("stufe_personen").then(({ data }) => setListe((data as StufenPerson[]) || []));
  }, [aktiv]);
  return useMemo(
    () =>
      hasSupabase
        ? liste
        : [...students].sort((a, b) => a.vorname.localeCompare(b.vorname)).map((s) => ({ id: s.id, vorname: s.vorname, nachname: s.nachname })),
    [liste, students],
  );
}

/* ---------------------------------------------------------------- Lehrerliste */
export function useLehrer(aktiv: boolean) {
  const [lehrer, setLehrer] = useState<Lehrer[]>([]);

  const laden = useCallback(async () => {
    if (!hasSupabase) return setLehrer(demoLesen().lehrer);
    const { data, error } = await supabase!.from("lehrer").select("*").order("name");
    if (!error) setLehrer((data as Lehrer[]) || []);
  }, []);

  useEffect(() => {
    if (aktiv) void laden();
  }, [aktiv, laden]);

  const speichern = useCallback(
    async (l: Partial<Lehrer> & { name: string }): Promise<string | null> => {
      const zeile = { name: l.name.trim().slice(0, 60), faecher: (l.faecher || "").trim().slice(0, 60), aktiv: l.aktiv ?? true };
      if (!zeile.name) return "Name fehlt";
      if (!hasSupabase) {
        const d = demoLesen();
        if (l.id) d.lehrer = d.lehrer.map((x) => (x.id === l.id ? { ...x, ...zeile } : x));
        else d.lehrer.push({ id: crypto.randomUUID(), ...zeile });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = l.id ? await supabase!.from("lehrer").update(zeile).eq("id", l.id) : await supabase!.from("lehrer").insert(zeile);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const loeschen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        const d = demoLesen();
        d.lehrer = d.lehrer.filter((x) => x.id !== id);
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("lehrer").delete().eq("id", id);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  return { lehrer: [...lehrer].sort((a, b) => a.name.localeCompare(b.name)), speichern, loeschen, neuLaden: laden };
}

/* ---------------------------------------------------------------- Rankings */
export function useRankings(aktiv: boolean, uid: string | null, live = false) {
  const [kategorien, setKategorien] = useState<RankingKategorie[]>([]);
  const [stand, setStand] = useState<RankingStand[]>([]);
  const [meine, setMeine] = useState<Record<string, string | null>>({});
  const [bereit, setBereit] = useState(false);
  const me = uid || ME_DEMO;

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setKategorien(d.kategorien);
      setMeine(Object.fromEntries(d.stimmen.filter((s) => s.user_id === ME_DEMO).map((s) => [s.kategorie_id, s.ziel])));
      setStand(
        d.kategorien.map((k) => {
          const z: Record<string, number> = {};
          for (const s of d.stimmen) if (s.kategorie_id === k.id && s.ziel) z[s.ziel] = (z[s.ziel] || 0) + 1;
          const top = Object.entries(z)
            .map(([ziel, n]) => ({ ziel, n }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 3);
          return { kategorie_id: k.id, stimmen: Object.values(z).reduce((a, b) => a + b, 0), top };
        }),
      );
      setBereit(true);
      return;
    }
    const sb = supabase!;
    const [k, s, m] = await Promise.all([
      sb.from("ranking_kategorien").select("*").order("sort"),
      sb.rpc("ranking_stand"),
      sb.from("ranking_stimmen").select("kategorie_id, ziel"),
    ]);
    if (!k.error) setKategorien((k.data as RankingKategorie[]) || []);
    if (!s.error) setStand((s.data as RankingStand[]) || []);
    if (!m.error) setMeine(Object.fromEntries(((m.data as { kategorie_id: string; ziel: string | null }[]) || []).map((x) => [x.kategorie_id, x.ziel])));
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!live) return;
    // Plätze aktualisieren sich von selbst (Stimmen anderer sind geheim und
    // kommen deshalb nicht per Live-Kanal, sondern gezählt alle 15 s).
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void laden();
    }, 15000);
    return () => clearInterval(t);
  }, [aktiv, live, laden]);

  /** Stimme abgeben oder ändern; null = „weiß nicht“ */
  const abstimmen = useCallback(
    async (kategorieId: string, ziel: string | null): Promise<string | null> => {
      setMeine((m) => ({ ...m, [kategorieId]: ziel }));
      if (!hasSupabase) {
        const d = demoLesen();
        d.stimmen = [...d.stimmen.filter((s) => !(s.kategorie_id === kategorieId && s.user_id === ME_DEMO)), { kategorie_id: kategorieId, user_id: ME_DEMO, ziel }];
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!
        .from("ranking_stimmen")
        .upsert({ kategorie_id: kategorieId, user_id: me, ziel }, { onConflict: "kategorie_id,user_id" });
      if (error) {
        await laden();
        return error.message;
      }
      void laden();
      return null;
    },
    [laden, me],
  );

  const kategorieSpeichern = useCallback(
    async (k: Partial<RankingKategorie> & { titel: string; art: RankingArt }): Promise<string | null> => {
      const zeile = { titel: k.titel.trim().slice(0, 120), art: k.art, aktiv: k.aktiv ?? true, sort: k.sort ?? Date.now() % 1_000_000 };
      if (!zeile.titel) return "Titel fehlt";
      if (!hasSupabase) {
        const d = demoLesen();
        if (k.id) d.kategorien = d.kategorien.map((x) => (x.id === k.id ? { ...x, ...zeile } : x));
        else d.kategorien.push({ id: crypto.randomUUID(), ...zeile });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = k.id
        ? await supabase!.from("ranking_kategorien").update(zeile).eq("id", k.id)
        : await supabase!.from("ranking_kategorien").insert(zeile);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  /** Mehrere auf einmal anlegen (z. B. aus einem Umfrage-Ergebnis); doppelte Titel werden übersprungen */
  const kategorienAnlegen = useCallback(
    async (titel: string[], art: RankingArt): Promise<{ neu: number; fehler?: string }> => {
      const vorhanden = new Set(kategorien.filter((k) => k.art === art).map((k) => k.titel.trim().toLowerCase()));
      const liste = [...new Set(titel.map((t) => t.trim()).filter(Boolean))].filter((t) => !vorhanden.has(t.toLowerCase()));
      if (!liste.length) return { neu: 0 };
      const basis = Math.max(0, ...kategorien.map((k) => k.sort)) + 1;
      if (!hasSupabase) {
        const d = demoLesen();
        liste.forEach((t, i) => d.kategorien.push({ id: crypto.randomUUID(), titel: t.slice(0, 120), art, sort: basis + i, aktiv: true }));
        demoSchreiben(d);
        await laden();
        return { neu: liste.length };
      }
      const { error } = await supabase!.from("ranking_kategorien").insert(liste.map((t, i) => ({ titel: t.slice(0, 120), art, sort: basis + i })));
      await laden();
      return error ? { neu: 0, fehler: error.message } : { neu: liste.length };
    },
    [kategorien, laden],
  );

  const kategorieLoeschen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        const d = demoLesen();
        d.kategorien = d.kategorien.filter((k) => k.id !== id);
        d.stimmen = d.stimmen.filter((s) => s.kategorie_id !== id);
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("ranking_kategorien").delete().eq("id", id);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  return {
    bereit,
    kategorien: [...kategorien].sort((a, b) => a.sort - b.sort),
    stand,
    meine,
    abstimmen,
    kategorieSpeichern,
    kategorienAnlegen,
    kategorieLoeschen,
    neuLaden: laden,
  };
}

export type Rankings = ReturnType<typeof useRankings>;
