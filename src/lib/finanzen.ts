import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

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
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export interface FinanzenValue {
  buchungen: Buchung[];
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
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [ziel, setZiel] = useState<KassenZiel>({ ziel_cent: 0, ziel_titel: "Abiball" });
  const [bereit, setBereit] = useState(!hasSupabase);
  const [fehler, setFehler] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [b, z] = await Promise.all([
      supabase!.from("kasse_buchungen").select("*").order("datum", { ascending: false }).order("created_at", { ascending: false }),
      supabase!.from("kasse_einstellungen").select("ziel_cent, ziel_titel").eq("id", 1).maybeSingle(),
    ]);
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
    const kanal = supabase!
      .channel("sv-finanzen")
      .on("postgres_changes", { event: "*", schema: "public", table: "kasse_buchungen" }, nach)
      .on("postgres_changes", { event: "*", schema: "public", table: "kasse_einstellungen" }, nach)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase!.removeChannel(kanal);
    };
  }, [aktiv, laden]);

  const buchen = useCallback<FinanzenValue["buchen"]>(
    async (b) => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { data: s } = await supabase!.auth.getSession();
      const { error } = await supabase!.from("kasse_buchungen").insert({
        datum: b.datum,
        cent: b.cent,
        quelle: b.quelle,
        titel: b.titel.trim(),
        aktion_id: b.aktion_id ?? null,
        komitee: b.komitee ?? null,
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
      if (!hasSupabase) return null;
      setBuchungen((prev) => prev.filter((x) => x.id !== id));
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
      if (!hasSupabase) return null;
      setZiel(z);
      const { error } = await supabase!.from("kasse_einstellungen").update(z).eq("id", 1);
      return error ? error.message : null;
    },
    [],
  );

  return useMemo(
    () => ({ buchungen, ziel, bereit, fehler, buchen, loeschen, zielSetzen, neuLaden: laden }),
    [buchungen, ziel, bereit, fehler, buchen, loeschen, zielSetzen, laden],
  );
}
