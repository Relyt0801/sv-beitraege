import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import type { Abiball } from "./types";

/**
 * Abiball-Tickets bestellen (supabase/abiball-tickets.sql).
 *
 * Bestellt wird nur über ticket_bestellen() – der Server prüft Freigabe,
 * Höchstzahl je Person und Kontingent und rechnet den Betrag selbst. Die App
 * zeigt dieselben Zahlen vorher an (lib/logic.ts → ticketPreise).
 *
 * Wer was sieht, regelt die Datenbank: Schüler ihre eigenen, Eltern die ihrer
 * Kinder, Team und Kasse alle.
 */
export interface TicketBestellung {
  id: string;
  user_id: string;
  student_id: string;
  anzahl: number;
  betrag_cent: number;
  status: "offen" | "bezahlt" | "storniert";
  created_at: string;
  bearbeitet_at: string | null;
}

export type VerkaufStatus = "aus" | "bald" | "laeuft";

/** Ist der Verkauf freigegeben, startet er bald oder läuft er schon? */
export function verkaufStatus(a: Abiball, jetzt: number): VerkaufStatus {
  if (!a.verkaufAb) return "aus";
  const ab = Date.parse(a.verkaufAb);
  if (!Number.isFinite(ab)) return "aus";
  return ab > jetzt ? "bald" : "laeuft";
}

/** Die aktuelle Uhrzeit, die jede Sekunde nachläuft – nur solange `an`. */
export function useJetzt(an: boolean, takt = 1000): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    if (!an) return;
    setJetzt(Date.now());
    const t = setInterval(() => setJetzt(Date.now()), takt);
    return () => clearInterval(t);
  }, [an, takt]);
  return jetzt;
}

/** „2 T 04:12:09“ bzw. „04:12:09“ */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const t = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sek = s % 60;
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${t > 0 ? `${t} T ` : ""}${zwei(h)}:${zwei(m)}:${zwei(sek)}`;
}

/** 6500 → „65 €“, 6550 → „65,50 €“ */
export function euroAusCent(cent: number): string {
  const e = cent / 100;
  return Number.isInteger(e) ? `${e} €` : `${e.toFixed(2).replace(".", ",")} €`;
}

/** Kurze Nummer einer Bestellung für den Verwendungszweck, z. B. „T-3F9A“. */
export function bestellNummer(b: Pick<TicketBestellung, "id">): string {
  return `T-${b.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

// ---------------------------------------------------------------- Demo
// Ohne Datenbank (npm run demo) liegen Bestellungen nur im Speicher.
const DEMO_KEY = "demo-tickets";
function demoLesen(): TicketBestellung[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]") as TicketBestellung[];
  } catch {
    return [];
  }
}
function demoSchreiben(l: TicketBestellung[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(l));
  } catch {
    /* egal im Demo */
  }
}

export function useTicketBestellungen(aktiv = true) {
  const [liste, setListe] = useState<TicketBestellung[]>(() => (hasSupabase ? [] : demoLesen()));
  const [verkauft, setVerkauft] = useState(0);
  const [bereit, setBereit] = useState(!hasSupabase);

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const l = demoLesen();
      setListe(l);
      setVerkauft(l.filter((b) => b.status !== "storniert").reduce((n, b) => n + b.anzahl, 0));
      return;
    }
    const [{ data, error }, stand] = await Promise.all([
      supabase!.from("ticket_bestellungen").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase!.rpc("ticket_stand"),
    ]);
    if (!error) setListe((data as TicketBestellung[]) || []);
    if (!stand.error && stand.data) setVerkauft(Number((stand.data as { verkauft?: number }).verkauft) || 0);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    return abonniere({
      name: "sv-tickets",
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "ticket_bestellungen" }, () => void laden()),
    });
  }, [aktiv, laden]);

  /** Bestellen. Gibt die neue Bestellung zurück oder einen Fehlertext. */
  const bestellen = useCallback(
    async (anzahl: number, demo?: { student_id: string; betrag_cent: number }): Promise<TicketBestellung | string> => {
      if (!hasSupabase) {
        if (!demo) return "Im Demo geht das nicht.";
        const neu: TicketBestellung = {
          id: crypto.randomUUID(),
          user_id: "demo",
          student_id: demo.student_id,
          anzahl,
          betrag_cent: demo.betrag_cent,
          status: "offen",
          created_at: new Date().toISOString(),
          bearbeitet_at: null,
        };
        demoSchreiben([neu, ...demoLesen()]);
        void laden();
        return neu;
      }
      const { data, error } = await supabase!.rpc("ticket_bestellen", { p_anzahl: anzahl });
      if (error) return error.message;
      const r = data as { id: string; betrag_cent: number };
      await laden();
      const { data: zeile } = await supabase!.from("ticket_bestellungen").select("*").eq("id", r.id).maybeSingle();
      return (zeile as TicketBestellung) || {
        id: r.id,
        user_id: "",
        student_id: demo?.student_id || "",
        anzahl,
        betrag_cent: r.betrag_cent,
        status: "offen",
        created_at: new Date().toISOString(),
        bearbeitet_at: null,
      };
    },
    [laden],
  );

  /** Team/Kasse: als bezahlt markieren, stornieren oder zurück auf offen. */
  const setzeStatus = useCallback(
    async (id: string, status: TicketBestellung["status"]): Promise<string | null> => {
      if (!hasSupabase) {
        demoSchreiben(demoLesen().map((b) => (b.id === id ? { ...b, status, bearbeitet_at: new Date().toISOString() } : b)));
        void laden();
        return null;
      }
      const { data: s } = await supabase!.auth.getSession();
      const { error } = await supabase!
        .from("ticket_bestellungen")
        .update({ status, bearbeitet_at: new Date().toISOString(), bearbeitet_von: s.session?.user.id ?? null })
        .eq("id", id);
      if (error) return error.message;
      void laden();
      return null;
    },
    [laden],
  );

  return { liste, verkauft, bereit, laden, bestellen, setzeStatus };
}
