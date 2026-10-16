import { hatVerlassen } from "./logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { useStore } from "../store";
import type { Teil } from "./teile";

/**
 * Abi-Rankings und Lehrkräfte (supabase/rankings-lehrer.sql)
 *
 *   Kategorien  „Wird am ehesten berühmt“ – je Kategorie Schüler ODER Lehrer
 *   Stimmen     eine je Person und Kategorie, änderbar; null = „weiß nicht“
 *   Stand       Top 3 je Kategorie, gezählt (ranking_stand) – alle 15 s neu
 *   Lehrer      Liste fürs Lehrer-Ranking und für Zitate
 *   Teil        jede Kategorie ist offiziell (kommt ins Abibuch) oder
 *               inoffiziell (nur die Stufe) – Spalte bereich
 *               (supabase/offiziell-inoffiziell.sql). Angelegt wird im
 *               gerade offenen Teil; den Teil wechseln geht nur über
 *               „Verschieben“ mit Zustimmungen (lib/teile.ts).
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
  /** Offiziell (Abibuch) oder inoffiziell (nur die Stufe). Alte Zeilen: inoffiziell. */
  bereich: Teil;
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
// Neuer Schlüssel seit 1.4 (Teile + mehr Beispiele) – alte Demo-Stände
// ohne „bereich“ werden so einmal frisch angelegt.
const DEMO = "sv-rankings-demo-2";
interface DemoDaten {
  kategorien: RankingKategorie[];
  lehrer: Lehrer[];
  /** ziel „s:3“ = vierte Person der Demo-Stufe (die IDs entstehen erst im Browser) */
  stimmen: { kategorie_id: string; user_id: string; ziel: string | null }[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) {
      const d = JSON.parse(roh) as DemoDaten;
      // Sicherheitshalber: ohne Teil = inoffiziell (wie in der Datenbank)
      d.kategorien = d.kategorien.map((k) => ({ ...k, bereich: k.bereich === "offiziell" ? "offiziell" : "inoffiziell" }));
      return d;
    }
  } catch {
    /* privater Modus */
  }
  // Erfundene Beispiele – genug Kategorien, damit man Gruppen und Suche sieht
  const lehrer = ["Frau Beispiel", "Herr Muster", "Frau Probe", "Herr Test"].map((name, i) => ({ id: `demo-l${i}`, name, faecher: "", aktiv: true }));
  const k = (i: number, titel: string, art: RankingArt, bereich: Teil): RankingKategorie => ({ id: `demo-r${i}`, titel, art, sort: i, aktiv: true, bereich });
  const kategorien = [
    k(1, "Wird am ehesten berühmt", "schueler", "offiziell"),
    k(2, "Kommt garantiert zu spät zur eigenen Hochzeit", "schueler", "inoffiziell"),
    k(3, "Hat immer Snacks dabei", "schueler", "inoffiziell"),
    k(4, "Bester Ausrede-Erfinder", "lehrer", "inoffiziell"),
    k(5, "Wäre der beste Klassenfahrt-Begleiter", "lehrer", "offiziell"),
    k(6, "Wird zuerst Millionär", "schueler", "offiziell"),
    k(7, "Bester Sitznachbar", "schueler", "offiziell"),
    k(8, "Wird Lehrerin oder Lehrer", "schueler", "offiziell"),
    k(9, "Schläft im Unterricht am besten", "schueler", "inoffiziell"),
    k(10, "Hat die besten Ausreden", "schueler", "inoffiziell"),
    k(11, "Erklärt am verständlichsten", "lehrer", "offiziell"),
  ];
  // Ein paar erfundene Stimmen, damit Plätze und Podest etwas zeigen
  const stimmen: DemoDaten["stimmen"] = [];
  const st = (kat: number, ziele: (string | null)[]) => ziele.forEach((ziel, i) => stimmen.push({ kategorie_id: `demo-r${kat}`, user_id: `demo-u${i}`, ziel }));
  st(1, ["s:2", "s:2", "s:2", "s:5", "s:5", "s:0", null]);
  st(2, ["s:4", "s:4", "s:1", "s:6"]);
  st(6, ["s:7", "s:7", "s:3", "s:3", "s:3", "s:1"]);
  st(7, ["s:0", "s:6", "s:6"]);
  st(9, ["s:4", "s:4", "s:4", "s:2"]);
  st(4, ["demo-l1", "demo-l1", "demo-l0"]);
  st(5, ["demo-l2", "demo-l2", "demo-l3"]);
  st(11, ["demo-l0", "demo-l2", "demo-l0", "demo-l0"]);
  return { kategorien, lehrer, stimmen };
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
  const { students, settings } = useStore();
  const [liste, setListe] = useState<StufenPerson[]>([]);
  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void supabase!.rpc("stufe_personen").then(({ data }) => setListe((data as StufenPerson[]) || []));
  }, [aktiv]);
  return useMemo(
    () =>
      hasSupabase
        ? liste
        : [...students]
            .filter((s) => !hatVerlassen(s, settings.aktuelles_halbjahr))
            .sort((a, b) => a.vorname.localeCompare(b.vorname))
            .map((s) => ({ id: s.id, vorname: s.vorname, nachname: s.nachname })),
    [liste, students, settings.aktuelles_halbjahr],
  );
}

/* ---------------------------------------------------------------- Lehrkräfte */
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
  // Nur für die Demo: „s:3“ in den Beispiel-Stimmen → ID der vierten Person
  const { students } = useStore();
  const demoIds = useRef<string[]>([]);
  demoIds.current = students.map((s) => s.id);

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      const ziel = (z: string | null) => (z && z.startsWith("s:") ? demoIds.current[Number(z.slice(2))] ?? null : z);
      setKategorien(d.kategorien);
      setMeine(Object.fromEntries(d.stimmen.filter((s) => s.user_id === ME_DEMO).map((s) => [s.kategorie_id, s.ziel])));
      setStand(
        d.kategorien.map((k) => {
          const z: Record<string, number> = {};
          for (const s of d.stimmen) {
            const zi = ziel(s.ziel);
            if (s.kategorie_id === k.id && zi) z[zi] = (z[zi] || 0) + 1;
          }
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
    // bereich kommt mit „*“ mit; fehlt die Spalte noch (alter Stand), gilt inoffiziell
    if (!k.error) setKategorien(((k.data as RankingKategorie[]) || []).map((x) => ({ ...x, bereich: x.bereich === "offiziell" ? "offiziell" : "inoffiziell" })));
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

  /**
   * Kategorie anlegen oder ändern. Der Teil (bereich) zählt nur beim
   * Anlegen – beim Ändern wird er bewusst NICHT mitgeschickt, sonst würde der
   * Schutz-Trigger (bereich_schuetzen) das Speichern ablehnen.
   */
  const kategorieSpeichern = useCallback(
    async (k: Partial<RankingKategorie> & { titel: string; art: RankingArt }): Promise<string | null> => {
      const zeile = { titel: k.titel.trim().slice(0, 120), art: k.art, aktiv: k.aktiv ?? true, sort: k.sort ?? Date.now() % 1_000_000 };
      if (!zeile.titel) return "Titel fehlt";
      const bereich: Teil = k.bereich === "offiziell" ? "offiziell" : "inoffiziell";
      if (!hasSupabase) {
        const d = demoLesen();
        if (k.id) d.kategorien = d.kategorien.map((x) => (x.id === k.id ? { ...x, ...zeile } : x));
        else d.kategorien.push({ id: crypto.randomUUID(), ...zeile, bereich });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = k.id
        ? await supabase!.from("ranking_kategorien").update(zeile).eq("id", k.id)
        : await supabase!.from("ranking_kategorien").insert({ ...zeile, bereich });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  /**
   * Mehrere auf einmal anlegen (z. B. aus einem Umfrage-Ergebnis); doppelte
   * Titel werden übersprungen. Ohne Teil landen sie wie bisher im
   * inoffiziellen Teil (Standard der Datenbank).
   */
  const kategorienAnlegen = useCallback(
    async (titel: string[], art: RankingArt, bereich: Teil = "inoffiziell"): Promise<{ neu: number; fehler?: string }> => {
      const vorhanden = new Set(kategorien.filter((k) => k.art === art).map((k) => k.titel.trim().toLowerCase()));
      const liste = [...new Set(titel.map((t) => t.trim()).filter(Boolean))].filter((t) => !vorhanden.has(t.toLowerCase()));
      if (!liste.length) return { neu: 0 };
      const basis = Math.max(0, ...kategorien.map((k) => k.sort)) + 1;
      if (!hasSupabase) {
        const d = demoLesen();
        liste.forEach((t, i) => d.kategorien.push({ id: crypto.randomUUID(), titel: t.slice(0, 120), art, sort: basis + i, aktiv: true, bereich }));
        demoSchreiben(d);
        await laden();
        return { neu: liste.length };
      }
      const { error } = await supabase!.from("ranking_kategorien").insert(liste.map((t, i) => ({ titel: t.slice(0, 120), art, sort: basis + i, bereich })));
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

  /**
   * Nach einem erfolgreichen Verschieben (useVerschiebungen). Mit Datenbank
   * hat die RPC den Teil schon geändert – dann nur neu laden. In der Demo gibt
   * es keine Anträge, dort wird direkt umgesetzt.
   */
  const nachVerschieben = useCallback(
    async (id: string, nach: Teil) => {
      if (!hasSupabase) {
        const d = demoLesen();
        d.kategorien = d.kategorien.map((k) => (k.id === id ? { ...k, bereich: nach } : k));
        demoSchreiben(d);
      }
      await laden();
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
    nachVerschieben,
    neuLaden: laden,
  };
}

export type Rankings = ReturnType<typeof useRankings>;
