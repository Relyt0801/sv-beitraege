import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { melde, meldeFehler } from "./melder";
import { useRole } from "../auth/RoleProvider";

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
 * Verschieben: nach inoffiziell reicht EINE Zustimmung (die eigene), nach
 * offiziell braucht es so viele, wie unter Profil → Freigaben → „Verschieben“
 * steht; der Owner allein reicht immer. Gewinner küren: gewinner-Tabelle.
 *
 * Aufteilung je Bereich schaltbar (supabase/teile-schaltbar.sql,
 * app_settings.teile): Ist sie aus, gibt es nur EINEN Bereich ohne das Wort
 * „offiziell“ (mitTeil lässt den Teil im Titel weg) – Neues landet im Teil
 * „offiziell“, Runden und Gewinner laufen dort, angezeigt wird alles zusammen.
 * Den „Gewinner der Herzen“ gibt es nur ohne Aufteilung: mit Aufteilung
 * übernimmt der inoffizielle Teil diese Rolle.
 */
export type Teil = "offiziell" | "inoffiziell";
export const TEILE: Teil[] = ["offiziell", "inoffiziell"];

export const TEIL_NAME: Record<Teil, string> = { offiziell: "Offiziell", inoffiziell: "Inoffiziell" };

/** Bereiche mit offiziell/inoffiziell (Schlüssel in app_settings.teile) */
export type TeilBereich = "motto" | "zitate" | "rankings" | "kommentare";

/**
 * Was kommt wohin? – je Bereich, für das Info-Symbol neben dem Umschalter.
 * Bewusst konkret: Was davon kann gedruckt werden, wer sieht es.
 */
export const TEIL_INFO: Record<TeilBereich, { titel: string; offiziell: string; inoffiziell: string }> = {
  motto: {
    titel: "Abimotto",
    offiziell: "Kann unser Abimotto werden – auf Abizeitung, Pullis, Banner und zum Abiball. Das gekürte Motto sehen später auch Eltern und Lehrkräfte. Der Wortfilter prüft jeden Vorschlag.",
    inoffiziell: "Insider und Spaß-Mottos nur für unsere Stufe. Wird nirgends gedruckt, Eltern sehen es nie.",
  },
  zitate: {
    titel: "Zitate",
    offiziell: "Kann in die Abizeitung (Zitate-Seite). Gedruckt lesen es auch Eltern und Lehrkräfte – darum prüft der Wortfilter.",
    inoffiziell: "Bleibt in der App, nur für unsere Stufe. Kommt nicht in die Abizeitung.",
  },
  rankings: {
    titel: "Rankings",
    offiziell: "Diese Kategorien und ihre Gewinner können in die Abizeitung (Rankings-Seite).",
    inoffiziell: "Nur für die Stufe – Ergebnisse werden nicht gedruckt.",
  },
  kommentare: {
    titel: "Kommentare im Steckbrief",
    offiziell: "Kann im Steckbrief der Abizeitung abgedruckt werden – also auch von Eltern und Lehrkräften gelesen.",
    inoffiziell: "Bleibt im Album der App, nur unsere Stufe sieht es.",
  },
};

/** Gehört ein Eintrag (Spalte bereich) zur gewählten Ansicht? Ohne Aufteilung: alles. */
export const imTeil = (bereich: Teil | null | undefined, teil: Teil, aufgeteilt: boolean) =>
  !aufgeteilt || (bereich ?? "inoffiziell") === teil;

/** „Gewinner · Offiziell“ – ohne Aufteilung nur „Gewinner“ */
export const mitTeil = (text: string, teil: Teil, aufgeteilt: boolean) => (aufgeteilt ? `${text} · ${TEIL_NAME[teil]}` : text);

/* ---------------------------------------------------------------------- */
/* Einstellung: Aufteilung je Bereich (EIN Stand für die ganze App)        */
/* ---------------------------------------------------------------------- */
const TEILE_STANDARD: Record<TeilBereich, boolean> = { motto: true, zitate: true, rankings: true, kommentare: true };
const TEILE_DEMO = "sv-teile-demo";
let teileStand: Record<TeilBereich, boolean> = (() => {
  if (hasSupabase) return TEILE_STANDARD;
  try {
    return { ...TEILE_STANDARD, ...JSON.parse(localStorage.getItem(TEILE_DEMO) || "{}") };
  } catch {
    return TEILE_STANDARD;
  }
})();
const teileHoerer = new Set<() => void>();
let teileGeladen = false;
let teileAbo: (() => void) | null = null;

function teileMelden(neu: Record<TeilBereich, boolean>) {
  teileStand = neu;
  teileHoerer.forEach((f) => f());
}
async function teileLaden() {
  if (!hasSupabase) return;
  const { data } = await supabase!.from("app_settings").select("teile").eq("id", 1).maybeSingle();
  const t = (data as { teile?: Partial<Record<TeilBereich, boolean>> } | null)?.teile;
  if (t) teileMelden({ ...TEILE_STANDARD, ...t });
}
function teileAbonnieren(f: () => void) {
  teileHoerer.add(f);
  if (!teileGeladen && hasSupabase) {
    teileGeladen = true;
    void teileLaden();
    teileAbo = abonniere({
      name: "sv-teile",
      nachholen: () => void teileLaden(),
      aufbauen: (k) => k.on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, () => void teileLaden()),
    });
  }
  return () => {
    teileHoerer.delete(f);
    if (teileHoerer.size === 0 && teileAbo) {
      teileAbo();
      teileAbo = null;
      teileGeladen = false;
    }
  };
}

/** Ist ein Bereich in offiziell/inoffiziell aufgeteilt? (Standard: ja) */
export function useAufgeteilt(bereich: TeilBereich): boolean {
  return useSyncExternalStore(teileAbonnieren, () => teileStand[bereich] !== false);
}

/** Schalten (Einstellungen des Bereichs) – wer darf, wie in der Datenbank (teile_recht) */
export function useTeileSchalten() {
  const { can, isAdmin } = useRole();
  const darf = useCallback(
    (b: TeilBereich) =>
      isAdmin ||
      (b === "motto" && can("motto.verwalten")) ||
      (b === "zitate" && can("zitate.pruefen")) ||
      (b === "rankings" && can("rankings.verwalten")) ||
      (b === "kommentare" && can("album.moderieren")),
    [can, isAdmin],
  );
  const setzen = useCallback(async (b: TeilBereich, an: boolean): Promise<boolean> => {
    const vorher = teileStand;
    teileMelden({ ...teileStand, [b]: an });
    if (!hasSupabase) {
      try {
        localStorage.setItem(TEILE_DEMO, JSON.stringify(teileStand));
      } catch {
        /* egal */
      }
      return true;
    }
    const { error } = await supabase!.rpc("teile_setzen", { p_bereich: b, p_an: an });
    if (error) {
      teileMelden(vorher);
      meldeFehler(error.message);
      return false;
    }
    return true;
  }, []);
  return { darf, setzen };
}

/** Tabelle in der Datenbank je Bereich (für Verschieben) */
export type TeilTabelle = "zitate" | "ranking_kategorien" | "motto_vorschlaege" | "album_kommentare";

/** Wortfilter-Schlüssel je Bereich und Teil (wortfilter_bereich_setzen) */
export function wortfilterSchluessel(basis: "motto" | "zitate" | "rankings" | "kommentare", teil: Teil): string {
  return teil === "offiziell" ? basis : `${basis}_inoffiziell`;
}

/**
 * Zuletzt gewählter Teil je Bereich – nur eine Bequemlichkeit pro Gerät.
 * Dritter Wert: ist der Bereich aufgeteilt? Ohne Aufteilung ist der Teil
 * immer „offiziell“ (dort landet Neues, dort laufen Runden und Gewinner).
 */
export function useTeil(bereich: TeilBereich): [Teil, (t: Teil) => void, boolean] {
  const aufgeteilt = useAufgeteilt(bereich);
  const schluessel = `sv:teil:${bereich}`;
  // Beim Abimotto geht es zuerst um das echte Motto (offiziell); Zitate und
  // Rankings starten im lockeren Teil der Stufe
  const standard: Teil = bereich === "motto" ? "offiziell" : "inoffiziell";
  const [teil, setTeilRoh] = useState<Teil>(() => {
    try {
      const t = localStorage.getItem(schluessel);
      return t === "offiziell" || t === "inoffiziell" ? t : standard;
    } catch {
      return standard;
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
  return [aufgeteilt ? teil : "offiziell", setTeil, aufgeteilt];
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
    async (g: { gruppe: string; art: GewinnerArt; ziel_id: string; label: string; unter?: string; stimmen?: number | null }, leise = false) => {
      // leise = true: keine eigene Meldung – das Küren-Blatt zeigt am Ende EINE für alles
      if (!hasSupabase) {
        const i = demoGewinner.findIndex((x) => x.bereich === bereich && x.gruppe === g.gruppe && x.art === g.art);
        const neu: Gewinner = { bereich, unter: "", stimmen: null, gekuert_at: new Date().toISOString(), ...g } as Gewinner;
        if (i >= 0) demoGewinner[i] = neu;
        else demoGewinner.push(neu);
        void laden();
        if (!leise) melde(g.art === "herzen" ? "Gewinner der Herzen gekürt" : "Gewinner gekürt");
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
      if (!leise) melde(g.art === "herzen" ? "Gewinner der Herzen gekürt" : "Gewinner gekürt");
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

/* ====================================================================== */
/* Für alle Bereiche zusammen (Chats → Anfragen) und die nötige Zahl      */
/* ====================================================================== */
export const TABELLE_NAME: Record<TeilTabelle, string> = {
  zitate: "Zitat",
  ranking_kategorien: "Ranking",
  motto_vorschlaege: "Motto",
  album_kommentare: "Kommentar",
};

/**
 * Rückfrage vor einem Verschiebe-Antrag – in Motto, Zitaten, Rankings und
 * Kommentaren wörtlich gleich, mit der Zahl der nötigen Zustimmungen.
 *   noetig  aus useVerschiebenNoetig() (gilt nur für „nach offiziell“)
 *   allein  der Owner braucht keine weiteren Zustimmungen (zustimmung_allein)
 * Nach inoffiziell reicht immer eine Stimme – es wird sofort verschoben.
 */
export function verschiebenFrage(nach: Teil, noetig: number, allein: boolean, titel?: string): string {
  const kopf = titel ? `„${titel}“ nach „${TEIL_NAME[nach]}“ verschieben?` : `Nach „${TEIL_NAME[nach]}“ verschieben?`;
  if (nach === "inoffiziell") return `${kopf} Dafür reicht eine Stimme – es wird sofort verschoben.`;
  if (allein) return `${kopf} Deine Zustimmung reicht – es wird sofort verschoben.`;
  if (noetig <= 1) return `${kopf} Dafür reicht eine Zustimmung (deine).`;
  return `${kopf} Das braucht ${noetig} Zustimmungen aus dem Team (du zählst schon mit). Du siehst den Antrag unter Chats → Anfragen.`;
}

/** Wirkt das Verschieben sofort? (nach inoffiziell immer, sonst nur mit genug Rechten) */
export const verschiebenSofort = (nach: Teil, noetig: number, allein: boolean) => nach === "inoffiziell" || allein || noetig <= 1;

/**
 * Wie viele Zustimmungen braucht ein Verschieben nach offiziell? (Profil →
 * Freigaben → „Verschieben“, Standard 3). Für die Rückfrage vor dem Antrag.
 */
export function useVerschiebenNoetig(): number {
  const [n, setN] = useState(3);
  useEffect(() => {
    if (!hasSupabase) return;
    void supabase!
      .from("app_settings")
      .select("bestaetigungen")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const b = (data as { bestaetigungen?: Record<string, number> } | null)?.bestaetigungen;
        if (b?.verschieben) setN(b.verschieben);
      });
  }, []);
  return n;
}

/**
 * Alle offenen Verschiebe-Anträge, denen ich zustimmen darf – über alle vier
 * Tabellen. Für die Kachel „Anfragen“ im Chats-Reiter, damit Anträge nicht
 * nur zufällig gefunden werden.
 */
export function useAlleVerschiebungen(aktiv: boolean) {
  const [liste, setListe] = useState<(Verschiebung & { tabelle: TeilTabelle })[]>([]);
  const laden = useCallback(async () => {
    if (!aktiv || !hasSupabase) return;
    const tabellen: TeilTabelle[] = ["zitate", "ranking_kategorien", "motto_vorschlaege", "album_kommentare"];
    const teile = await Promise.all(
      tabellen.map(async (t) => {
        const { data } = await supabase!.rpc("verschiebungen_offen", { p_tabelle: t });
        return ((data as Verschiebung[]) || []).map((v) => ({ ...v, tabelle: t }));
      }),
    );
    setListe(teile.flat().sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }, [aktiv]);
  useEffect(() => {
    void laden();
    if (!aktiv || !hasSupabase) return;
    return abonniere({
      name: "sv-verschieben-alle",
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "verschiebungen" }, () => void laden()),
    });
  }, [aktiv, laden]);
  const zustimmen = useCallback(
    async (id: string) => {
      const { data, error } = await supabase!.rpc("verschieben_zustimmen", { p_id: id });
      if (error) return meldeFehler(error.message);
      const r = data as { fertig: boolean; stimmen: number; noetig: number };
      melde(r.fertig ? "Verschoben" : `Zugestimmt – ${r.stimmen} von ${r.noetig}`);
      void laden();
    },
    [laden],
  );
  const ablehnen = useCallback(
    async (id: string) => {
      const { error } = await supabase!.rpc("verschieben_ablehnen", { p_id: id });
      if (error) return meldeFehler(error.message);
      melde("Antrag verworfen");
      void laden();
    },
    [laden],
  );
  return { liste, zustimmen, ablehnen, laden };
}
