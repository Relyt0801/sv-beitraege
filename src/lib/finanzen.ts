import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { demoBuchungen } from "./demo";
import { useStore } from "../store";

/**
 * Das Kassenbuch der Stufe.
 *
 * Es gibt keine Verbindung zur Bank. Der Kontostand ist die Summe aller
 * Buchungen. Beiträge buchen sich in der Datenbank selbst (Trigger
 * `beitrag_buchen`), alles andere trägt der Kassenwart ein. Einmal mit dem
 * echten Kontostand abgleichen, danach stimmt er.
 *
 * Beträge sind Cent (ganze Zahlen) – 0,10 + 0,20 ergibt so wirklich 0,30.
 */

export type Quelle = "beitrag" | "aktion" | "spende" | "sonstiges" | "ausgabe" | "abgleich";

export interface Buchung {
  id: string;
  datum: string;
  cent: number;
  quelle: Quelle;
  titel: string;
  aktion_id: string | null;
  student_id: string | null;
  halbjahr: string | null;
  komitee: string | null;
  anfrage_id: string | null;
  automatisch: boolean;
  created_by: string | null;
  created_at: string;
  /** Selbst gewählte Kategorie mit Farbe (null = nach Quelle) */
  kategorie_id?: string | null;
}

/** Eine Kategorie fürs Kassenbuch: Name + Farbe. Mehrere dürfen dieselbe Farbe haben. */
export interface KassenKategorie {
  id: string;
  name: string;
  farbe: string;
  art: "ein" | "aus" | "beide";
  sort: number;
}

/**
 * Farben fürs Kassenbuch – hell und dunkel getrennt gewählt, damit Kreis,
 * Balken und Farbpunkte in beiden Modi gut unterscheidbar bleiben.
 */
export const KASSEN_FARBEN: { key: string; name: string; hell: string; dunkel: string }[] = [
  { key: "blau", name: "Blau", hell: "#2a78d6", dunkel: "#3987e5" },
  { key: "orange", name: "Orange", hell: "#eb6834", dunkel: "#d95926" },
  { key: "gruen", name: "Grün", hell: "#1baf7a", dunkel: "#199e70" },
  { key: "gelb", name: "Gelb", hell: "#eda100", dunkel: "#c98500" },
  { key: "lila", name: "Lila", hell: "#8b5cf6", dunkel: "#a78bfa" },
  { key: "pink", name: "Pink", hell: "#db2777", dunkel: "#ec4899" },
  { key: "tuerkis", name: "Türkis", hell: "#0891b2", dunkel: "#06b6d4" },
  { key: "rot", name: "Rot", hell: "#dc2626", dunkel: "#ef4444" },
  { key: "grau", name: "Grau", hell: "#8e8e93", dunkel: "#98989f" },
];

/** Farbe ohne eigene Kategorie – nach Herkunft. */
export const STANDARD_FARBE: Record<string, string> = {
  beitrag: "blau", aktion: "orange", spende: "gruen", sonstiges: "gelb",
  komitee: "lila", ausgabe: "grau", abgleich: "grau", kategorie: "blau",
};

export function farbHex(key: string | null | undefined, dunkel = false): string {
  const f = KASSEN_FARBEN.find((x) => x.key === key) ?? KASSEN_FARBEN.find((x) => x.key === "grau")!;
  return dunkel ? f.dunkel : f.hell;
}

/** Farbe einer Buchung: Kategorie vor Herkunft. */
export function buchungFarbe(b: Buchung, kategorien: KassenKategorie[]): string {
  const k = b.kategorie_id ? kategorien.find((x) => x.id === b.kategorie_id) : null;
  if (k) return k.farbe;
  if (b.cent < 0) return b.komitee ? "lila" : "grau";
  return STANDARD_FARBE[b.quelle] ?? "grau";
}

export interface KassenZiel {
  ziel_cent: number;
  ziel_titel: string;
}

/**
 * Die vier Einnahmequellen im Kreisdiagramm – feste Reihenfolge, feste Farbe.
 * Die Farben sind die ersten vier Plätze der geprüften Kategorien-Palette
 * (farbenblind-sicher geprüft, hell und dunkel getrennt gewählt).
 */
export const EINNAHME_QUELLEN: { key: Exclude<Quelle, "ausgabe" | "abgleich">; label: string; hell: string; dunkel: string }[] = [
  { key: "beitrag", label: "Stufenbeiträge", hell: "#2a78d6", dunkel: "#3987e5" },
  { key: "aktion", label: "Aktionen", hell: "#eb6834", dunkel: "#d95926" },
  { key: "spende", label: "Spenden", hell: "#1baf7a", dunkel: "#199e70" },
  { key: "sonstiges", label: "Sonstiges", hell: "#eda100", dunkel: "#c98500" },
];

export const QUELLE_NAME: Record<Quelle, string> = {
  beitrag: "Stufenbeitrag",
  aktion: "Aktion",
  spende: "Spende",
  sonstiges: "Sonstiges",
  ausgabe: "Ausgabe",
  abgleich: "Abgleich mit der Bank",
};

const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const fmtRund = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** 123456 -> "1.234,56 €" */
export function euro(cent: number): string {
  return fmt.format(cent / 100);
}
/** Für große Zahlen ohne Nachkommastellen, wenn sie glatt sind. */
export function euroKurz(cent: number): string {
  return cent % 100 === 0 ? fmtRund.format(cent / 100) : fmt.format(cent / 100);
}

/** "12,50" oder "12.5" -> 1250. Leer/ungültig -> null. */
export function centAus(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!t) return null;
  // Deutsch: Punkt = Tausender, Komma = Dezimal. "1.234,56" und "1234.56" gehen beide.
  // "1.500" oder "12.000" (Punkt vor genau drei Ziffern) ist ein Tausenderpunkt –
  // sonst wuerden daraus 1,50 € bzw. 12,00 €.
  const norm = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export interface FinanzenValue {
  buchungen: Buchung[];
  kategorien: KassenKategorie[];
  kategorieSpeichern: (k: Partial<KassenKategorie> & { name: string; farbe: string }) => Promise<string | null>;
  kategorieLoeschen: (id: string) => Promise<string | null>;
  /** Kategorie einer vorhandenen Buchung ändern (nicht bei automatischen). */
  buchungKategorie: (id: string, kategorieId: string | null) => Promise<string | null>;
  ziel: KassenZiel;
  bereit: boolean;
  fehler: string;
  buchen: (b: {
    datum: string;
    cent: number;
    quelle: Quelle;
    titel: string;
    aktion_id?: string | null;
    komitee?: string | null;
    kategorie_id?: string | null;
  }) => Promise<string | null>;
  loeschen: (id: string) => Promise<string | null>;
  zielSetzen: (z: KassenZiel) => Promise<string | null>;
  /** Sofort neu laden – z. B. nach einer genehmigten Kostenanfrage. */
  neuLaden: () => Promise<void>;
}

/**
 * Lädt Buchungen und Ziel und hält sie per Realtime aktuell. Wird ein
 * Beitrag im Kasse-Reiter auf "bezahlt" gesetzt, erscheint die Buchung hier
 * ohne Neuladen.
 */
export function useFinanzen(aktiv: boolean): FinanzenValue {
  const { students } = useStore();
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [kategorien, setKategorien] = useState<KassenKategorie[]>([]);
  const [ziel, setZiel] = useState<KassenZiel>({ ziel_cent: 0, ziel_titel: "Abiball" });
  const [bereit, setBereit] = useState(!hasSupabase);
  const [fehler, setFehler] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ohne Datenbank (Demo): ein paar erfundene Buchungen zum Ausprobieren.
  const demo = useRef(false);
  useEffect(() => {
    if (hasSupabase || demo.current || !students.length) return;
    demo.current = true;
    setBuchungen(demoBuchungen(students));
    setZiel({ ziel_cent: 800000, ziel_titel: "Abiball" });
  }, [students]);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [b, z, k] = await Promise.all([
      supabase!.from("kasse_buchungen").select("*").order("datum", { ascending: false }).order("created_at", { ascending: false }),
      supabase!.from("kasse_einstellungen").select("ziel_cent, ziel_titel").eq("id", 1).maybeSingle(),
      supabase!.from("kasse_kategorien").select("*").order("sort").order("name"),
    ]);
    if (!k.error) setKategorien((k.data as KassenKategorie[]) || []);
    if (b.error) setFehler(b.error.message);
    else setFehler("");
    setBuchungen((b.data as Buchung[]) || []);
    if (z.data) setZiel(z.data as KassenZiel);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    // Viele Beiträge auf einmal (Massenbearbeitung) -> ein Nachladen statt hundert
    const nach = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void laden(), 250);
    };
    const abmelden = abonniere({
      name: "sv-finanzen",
      nachholen: nach,
      aufbauen: (kanal) =>
        kanal
          .on("postgres_changes", { event: "*", schema: "public", table: "kasse_buchungen" }, nach)
          .on("postgres_changes", { event: "*", schema: "public", table: "kasse_einstellungen" }, nach)
          .on("postgres_changes", { event: "*", schema: "public", table: "kasse_kategorien" }, nach),
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abmelden();
    };
  }, [aktiv, laden]);

  const buchen = useCallback<FinanzenValue["buchen"]>(
    async (b) => {
      if (!hasSupabase) {
        const neu: Buchung = {
          id: crypto.randomUUID(),
          datum: b.datum,
          cent: b.cent,
          quelle: b.quelle,
          titel: b.titel.trim(),
          aktion_id: b.aktion_id ?? null,
          komitee: b.komitee ?? null,
          kategorie_id: b.kategorie_id ?? null,
          student_id: null,
          halbjahr: null,
          anfrage_id: null,
          automatisch: false,
          created_by: "local-user",
          created_at: new Date().toISOString(),
        };
        setBuchungen((prev) => [neu, ...prev].sort((x, y) => (x.datum < y.datum ? 1 : -1)));
        return null;
      }
      const { data: s } = await supabase!.auth.getSession();
      const { error } = await supabase!.from("kasse_buchungen").insert({
        datum: b.datum,
        cent: b.cent,
        quelle: b.quelle,
        titel: b.titel.trim(),
        aktion_id: b.aktion_id ?? null,
        komitee: b.komitee ?? null,
        kategorie_id: b.kategorie_id ?? null,
        created_by: s.session?.user.id ?? null,
      });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const loeschen = useCallback<FinanzenValue["loeschen"]>(
    async (id) => {
      setBuchungen((prev) => prev.filter((x) => x.id !== id));
      if (!hasSupabase) return null;
      const { error } = await supabase!.from("kasse_buchungen").delete().eq("id", id);
      if (error) {
        void laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  const zielSetzen = useCallback<FinanzenValue["zielSetzen"]>(
    async (z) => {
      setZiel(z);
      if (!hasSupabase) return null;
      const { error } = await supabase!.from("kasse_einstellungen").update(z).eq("id", 1);
      return error ? error.message : null;
    },
    [],
  );

  const kategorieSpeichern = useCallback<FinanzenValue["kategorieSpeichern"]>(
    async (k) => {
      const zeile = { name: k.name.trim().slice(0, 40), farbe: k.farbe, art: k.art ?? "beide", sort: k.sort ?? 100 };
      if (!zeile.name) return "Bitte einen Namen eingeben.";
      if (!hasSupabase) {
        setKategorien((prev) =>
          k.id ? prev.map((x) => (x.id === k.id ? { ...x, ...zeile } : x)) : [...prev, { id: crypto.randomUUID(), ...zeile }],
        );
        return null;
      }
      const { error } = k.id
        ? await supabase!.from("kasse_kategorien").update(zeile).eq("id", k.id)
        : await supabase!.from("kasse_kategorien").insert(zeile);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const kategorieLoeschen = useCallback<FinanzenValue["kategorieLoeschen"]>(
    async (id) => {
      setKategorien((prev) => prev.filter((x) => x.id !== id));
      setBuchungen((prev) => prev.map((b) => (b.kategorie_id === id ? { ...b, kategorie_id: null } : b)));
      if (!hasSupabase) return null;
      const { error } = await supabase!.from("kasse_kategorien").delete().eq("id", id);
      if (error) {
        void laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  const buchungKategorie = useCallback<FinanzenValue["buchungKategorie"]>(
    async (id, kategorieId) => {
      setBuchungen((prev) => prev.map((b) => (b.id === id ? { ...b, kategorie_id: kategorieId } : b)));
      if (!hasSupabase) return null;
      const { error } = await supabase!.from("kasse_buchungen").update({ kategorie_id: kategorieId }).eq("id", id);
      if (error) {
        void laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  return useMemo(
    () => ({
      buchungen, kategorien, ziel, bereit, fehler, buchen, loeschen, zielSetzen, neuLaden: laden,
      kategorieSpeichern, kategorieLoeschen, buchungKategorie,
    }),
    [buchungen, kategorien, ziel, bereit, fehler, buchen, loeschen, zielSetzen, laden, kategorieSpeichern, kategorieLoeschen, buchungKategorie],
  );
}

// ==================================================================== Standard-Ansicht

/**
 * Die Finanzen ohne Namen und ohne Einzelbuchungen – für alle mit
 * "Finanzen ansehen – Standard" (Schüler, Eltern). Die Summen rechnet die
 * Datenbank (finanz_uebersicht(), supabase/finanzen-standard-ansicht.sql);
 * die Buchungen selbst kommen gar nicht erst aufs Gerät.
 */
export interface FinanzPosten {
  /** kategorie (selbst gewählt) | aktion | spende | sonstiges | komitee (Ausgaben eines Komitees) | ausgabe */
  art: "kategorie" | "aktion" | "spende" | "sonstiges" | "komitee" | "ausgabe";
  /** Farbe der Kategorie (nur bei art "kategorie") */
  farbe?: string | null;
  /** Name der Aktion – bei art "komitee" der Komitee-Schlüssel */
  titel: string;
  ein_cent: number;
  aus_cent: number;
  anzahl: number;
  zuletzt: string;
}

export interface FinanzUebersicht {
  erweitert: boolean;
  stand_cent: number;
  einnahmen_cent: number;
  ausgaben_cent: number;
  abgleich_cent: number;
  letzte_buchung: string | null;
  ziel_cent: number;
  ziel_titel: string;
  halbjahr: string;
  offen_cent: number;
  offen_personen: number;
  /** Stufenbeiträge je Phase: EF, Q1, Q2 */
  beitraege: { phase: string; cent: number }[];
  posten: FinanzPosten[];
}

/** Dieselbe Zusammenfassung ohne Datenbank (Demo), aus erfundenen Buchungen. */
export function uebersichtAus(
  buchungen: Buchung[],
  ziel: KassenZiel,
  offen: { cent: number; personen: number },
  halbjahr: string,
  aktionName: (id: string) => string,
  kategorien: KassenKategorie[] = [],
): FinanzUebersicht {
  let stand = 0, ein = 0, aus = 0, abgleich = 0;
  let letzte: string | null = null;
  const phasen: Record<string, number> = {};
  const posten = new Map<string, FinanzPosten>();
  for (const b of buchungen) {
    stand += b.cent;
    if (!letzte || b.datum > letzte) letzte = b.datum;
    if (b.quelle === "abgleich") { abgleich += b.cent; continue; }
    if (b.quelle === "beitrag") {
      ein += b.cent;
      const p = b.halbjahr ? b.halbjahr.slice(0, 2) : "–";
      phasen[p] = (phasen[p] || 0) + b.cent;
      continue;
    }
    if (b.cent > 0) ein += b.cent; else aus += -b.cent;
    const kat = b.kategorie_id ? kategorien.find((x) => x.id === b.kategorie_id) : null;
    const [art, titel]: [FinanzPosten["art"], string] = kat
      ? ["kategorie", kat.name]
      : b.aktion_id
      ? ["aktion", aktionName(b.aktion_id) || "Aktion"]
      : b.quelle === "aktion" ? ["aktion", b.titel]
      : b.quelle === "spende" ? ["spende", "Spenden"]
      : b.quelle === "sonstiges" ? ["sonstiges", "Sonstige Einnahmen"]
      : b.komitee ? ["komitee", b.komitee]
      : ["ausgabe", "Sonstige Ausgaben"];
    const k = `${art}|${titel}`;
    const p = posten.get(k) || { art, titel, farbe: kat?.farbe ?? null, ein_cent: 0, aus_cent: 0, anzahl: 0, zuletzt: b.datum };
    if (b.cent > 0) p.ein_cent += b.cent; else p.aus_cent += -b.cent;
    p.anzahl++;
    if (b.datum > p.zuletzt) p.zuletzt = b.datum;
    posten.set(k, p);
  }
  return {
    erweitert: false,
    stand_cent: stand,
    einnahmen_cent: ein,
    ausgaben_cent: aus,
    abgleich_cent: abgleich,
    letzte_buchung: letzte,
    ziel_cent: ziel.ziel_cent,
    ziel_titel: ziel.ziel_titel,
    halbjahr,
    offen_cent: offen.cent,
    offen_personen: offen.personen,
    beitraege: Object.entries(phasen).sort().map(([phase, cent]) => ({ phase, cent })),
    posten: [...posten.values()].sort((a, b) => (a.zuletzt < b.zuletzt ? 1 : -1)),
  };
}

/**
 * Lädt die Standard-Ansicht. Schüler und Eltern bekommen keine Live-Meldungen
 * aus dem Kassenbuch (das dürfen sie nicht lesen) – darum neu laden, sobald
 * die App wieder in den Vordergrund kommt, und jede Minute, solange sie offen ist.
 */
export function useFinanzUebersicht(aktiv: boolean): {
  daten: FinanzUebersicht | null;
  fehler: string;
  neuLaden: () => Promise<void>;
} {
  const [daten, setDaten] = useState<FinanzUebersicht | null>(null);
  const [fehler, setFehler] = useState("");

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data, error } = await supabase!.rpc("finanz_uebersicht");
    if (error) setFehler(error.message);
    else {
      setFehler("");
      setDaten(data as FinanzUebersicht);
    }
  }, []);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    const sichtbar = () => {
      if (document.visibilityState === "visible") void laden();
    };
    document.addEventListener("visibilitychange", sichtbar);
    const t = setInterval(sichtbar, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", sichtbar);
      clearInterval(t);
    };
  }, [aktiv, laden]);

  return { daten, fehler, neuLaden: laden };
}

/** Farbschlüssel eines Postens der Standard-Ansicht. */
export function postenFarbe(p: FinanzPosten): string {
  if (p.farbe) return p.farbe;
  if (p.art === "komitee") return "lila";
  if (p.art === "ausgabe") return "grau";
  return STANDARD_FARBE[p.art] ?? "grau";
}

/** Abi-Jahrgang: Q2 endet im Sommer 2028 – daraus das Schuljahr eines Halbjahrs. */
const ABI_JAHR = 2028;
export function schuljahrVon(halbjahr: string): string {
  const phase = halbjahr.slice(0, 2);
  const ende = ABI_JAHR - (phase === "Q2" ? 0 : phase === "Q1" ? 1 : 2);
  return `${ende - 1}/${String(ende).slice(2)}`;
}
