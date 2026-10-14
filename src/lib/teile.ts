import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { melde, meldeFehler } from "./melder";

/**
 * Offiziell / Inoffiziell (supabase/offiziell-inoffiziell.sql)
 *
 * Rankings, Zitate, Mottos und Steckbrief-Kommentare haben zwei Teile.
 *   offiziell    kommt später gedruckt raus – auch Eltern bekommen es.
 *                Wortfilter standardmäßig an.
 *   inoffiziell  nur für die Stufe, wird nicht gedruckt. Wortfilter
 *                standardmäßig aus.
 * Eltern sehen keinen der beiden Teile (die Lese-Regeln der Datenbank
 * schließen sie aus).
 *
 * Verschieben geht nur mit Zustimmungen (Profil → Freigaben → Verschieben);
 * Admins allein reichen. Gewinner küren: gewinner-Tabelle.
 */
export type Teil = "offiziell" | "inoffiziell";
export const TEILE: Teil[] = ["offiziell", "inoffiziell"];

export const TEIL_NAME: Record<Teil, string> = { offiziell: "Offiziell", inoffiziell: "Inoffiziell" };
export const TEIL_ERKLAERUNG: Record<Teil, string> = {
  offiziell: "Kommt ins Abibuch. Später sehen es auch Eltern und Lehrkräfte – bitte ohne Beleidigungen.",
  inoffiziell: "Nur für unsere Stufe. Wird nicht gedruckt, Eltern sehen es nie.",
};

/** Tabelle in der Datenbank je Bereich (für Verschieben) */
export type TeilTabelle = "zitate" | "ranking_kategorien" | "motto_vorschlaege" | "album_kommentare";

/** Wortfilter-Schlüssel je Bereich und Teil (wortfilter_bereich_setzen) */
export function wortfilterSchluessel(basis: "motto" | "zitate" | "rankings" | "kommentare", teil: Teil): string {
  return teil === "offiziell" ? basis : `${basis}_inoffiziell`;
}

/** Zuletzt gewählter Teil je Bereich – nur eine Bequemlichkeit pro Gerät. */
export function useTeil(bereich: string): [Teil, (t: Teil) => void] {
  const schluessel = `sv:teil:${bereich}`;
  const [teil, setTeilRoh] = useState<Teil>(() => {
    try {
      const t = localStorage.getItem(schluessel);
      return t === "offiziell" ? "offiziell" : "inoffiziell";
    } catch {
      return "inoffiziell";
    }
  });
  const setTeil = useCallback(
    (t: Teil) => {
      setTeilRoh(t);
      try {
        localStorage.setItem(schluessel, t);
      } catch {
        /* egal */
      }
    },
    [schluessel],
  );
  return [teil, setTeil];
}

/* ====================================================================== */
/* Verschieben mit Zustimmungen                                           */
/* ====================================================================== */
export interface Verschiebung {
  id: string;
  ziel_id: string;
  nach: Teil;
  titel: string;
  von: string;
  created_at: string;
  stimmen: number;
  noetig: number;
  ich: boolean;
}

/**
 * Offene Verschiebe-Anträge einer Tabelle. Nur wer dort verschieben darf,
 * bekommt etwas zurück (sonst leere Liste).
 */
export function useVerschiebungen(tabelle: TeilTabelle, aktiv: boolean, nachErfolg?: () => void) {
  const [liste, setListe] = useState<Verschiebung[]>([]);
  const laden = useCallback(async () => {
    if (!aktiv || !hasSupabase) return;
    const { data } = await supabase!.rpc("verschiebungen_offen", { p_tabelle: tabelle });
    setListe((data as Verschiebung[]) || []);
  }, [aktiv, tabelle]);

  useEffect(() => {
    void laden();
    if (!aktiv || !hasSupabase) return;
    return abonniere({
      name: `sv-verschieben-${tabelle}`,
      nachholen: laden,
      aufbauen: (k) =>
        k.on("postgres_changes", { event: "*", schema: "public", table: "verschiebungen", filter: `tabelle=eq.${tabelle}` }, () => {
          void laden();
          nachErfolg?.();
        }),
    });
  }, [aktiv, tabelle, laden, nachErfolg]);

  /** Verschieben beantragen (zählt gleich als eigene Zustimmung). */
  const beantragen = useCallback(
    async (id: string, nach: Teil): Promise<boolean> => {
      if (!hasSupabase) {
        melde(`Verschoben nach „${TEIL_NAME[nach]}“`);
        return true;
      }
      const { data, error } = await supabase!.rpc("verschieben_beantragen", { p_tabelle: tabelle, p_id: id, p_nach: nach });
      if (error) {
        meldeFehler(error.message);
        return false;
      }
      const r = data as { fertig: boolean; stimmen: number; noetig: number };
      melde(r.fertig ? `Verschoben nach „${TEIL_NAME[nach]}“` : `Beantragt – ${r.stimmen} von ${r.noetig} Zustimmungen`);
      void laden();
      if (r.fertig) nachErfolg?.();
      return r.fertig;
    },
    [tabelle, laden, nachErfolg],
  );

  const zustimmen = useCallback(
    async (antrag: string) => {
      if (!hasSupabase) return;
      const { data, error } = await supabase!.rpc("verschieben_zustimmen", { p_id: antrag });
      if (error) return meldeFehler(error.message);
      const r = data as { fertig: boolean; stimmen: number; noetig: number };
      melde(r.fertig ? "Verschoben" : `Zugestimmt – ${r.stimmen} von ${r.noetig}`);
      void laden();
      if (r.fertig) nachErfolg?.();
    },
    [laden, nachErfolg],
  );

  const ablehnen = useCallback(
    async (antrag: string) => {
      if (!hasSupabase) return;
      const { error } = await supabase!.rpc("verschieben_ablehnen", { p_id: antrag });
      if (error) return meldeFehler(error.message);
      melde("Antrag verworfen");
      void laden();
    },
    [laden],
  );

  /** Offener Antrag zu einem Eintrag (oder null) */
  const antragZu = useCallback((zielId: string) => liste.find((v) => v.ziel_id === zielId) || null, [liste]);

  return { liste, beantragen, zustimmen, ablehnen, antragZu, laden };
}

/* ====================================================================== */
/* Gewinner                                                               */
/* ====================================================================== */
export type GewinnerBereich = "motto" | "zitate" | "rankings";
export type GewinnerArt = "gewinner" | "herzen";

export interface Gewinner {
  bereich: GewinnerBereich;
  /** 'offiziell' / 'inoffiziell' (Motto, Zitate) bzw. Kategorie-ID (Rankings) */
  gruppe: string;
  art: GewinnerArt;
  ziel_id: string;
  label: string;
  unter: string;
  stimmen: number | null;
  gekuert_at: string;
}

const demoGewinner: Gewinner[] = [];

export function useGewinner(bereich: GewinnerBereich, aktiv: boolean) {
  const [liste, setListe] = useState<Gewinner[]>([]);
  const laden = useCallback(async () => {
    if (!aktiv) return;
    if (!hasSupabase) {
      setListe(demoGewinner.filter((g) => g.bereich === bereich));
      return;
    }
    const { data } = await supabase!.from("gewinner").select("*").eq("bereich", bereich);
    // Zurückgenommene Einträge haben eine leere ziel_id
    setListe(((data as Gewinner[]) || []).filter((g) => g.ziel_id));
  }, [aktiv, bereich]);

  useEffect(() => {
    void laden();
    if (!aktiv || !hasSupabase) return;
    return abonniere({
      name: `sv-gewinner-${bereich}`,
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "gewinner", filter: `bereich=eq.${bereich}` }, () => void laden()),
    });
  }, [aktiv, bereich, laden]);

  const von = useCallback((gruppe: string, art: GewinnerArt) => liste.find((g) => g.gruppe === gruppe && g.art === art) || null, [liste]);

  const kueren = useCallback(
    async (g: { gruppe: string; art: GewinnerArt; ziel_id: string; label: string; unter?: string; stimmen?: number | null }) => {
      if (!hasSupabase) {
        const i = demoGewinner.findIndex((x) => x.bereich === bereich && x.gruppe === g.gruppe && x.art === g.art);
        const neu: Gewinner = { bereich, unter: "", stimmen: null, gekuert_at: new Date().toISOString(), ...g } as Gewinner;
        if (i >= 0) demoGewinner[i] = neu;
        else demoGewinner.push(neu);
        void laden();
        melde(g.art === "herzen" ? "Gewinner der Herzen gekürt" : "Gewinner gekürt");
        return true;
      }
      const { error } = await supabase!.rpc("gewinner_kueren", {
        p_bereich: bereich,
        p_gruppe: g.gruppe,
        p_art: g.art,
        p_ziel: g.ziel_id,
        p_label: g.label,
        p_unter: g.unter || "",
        p_stimmen: g.stimmen ?? null,
      });
      if (error) {
        meldeFehler(error.message);
        return false;
      }
      melde(g.art === "herzen" ? "Gewinner der Herzen gekürt" : "Gewinner gekürt");
      void laden();
      return true;
    },
    [bereich, laden],
  );

  const zuruecknehmen = useCallback(
    async (gruppe: string, art: GewinnerArt) => {
      if (!hasSupabase) {
        const i = demoGewinner.findIndex((x) => x.bereich === bereich && x.gruppe === gruppe && x.art === art);
        if (i >= 0) demoGewinner.splice(i, 1);
        void laden();
        return;
      }
      const { error } = await supabase!.rpc("gewinner_zuruecknehmen", { p_bereich: bereich, p_gruppe: gruppe, p_art: art });
      if (error) return meldeFehler(error.message);
      melde("Zurückgenommen");
      void laden();
    },
    [bereich, laden],
  );

  return { liste, von, kueren, zuruecknehmen, laden };
}
