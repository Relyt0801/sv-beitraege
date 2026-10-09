import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";

/**
 * Wer sieht die Ergebnisse? (supabase/honorable-mentions.sql)
 *
 * Für Motto, Zitate und Rankings gilt eine Einstellung je Bereich
 * (app_settings.ergebnisse): „nur das Komitee“ oder „alle“. Abstimmungsrunden
 * und Umfragen haben die Wahl je Runde bzw. je Umfrage.
 *
 * Die Zahlen selbst kommen aus stimmen_zahlen() – die Datenbank gibt sie nur
 * heraus, wenn man sie sehen darf, und verrät nie, wer was gewählt hat.
 */
export type ErgebnisBereich = "motto" | "zitate" | "rankings";

const STANDARD: Record<ErgebnisBereich, boolean> = { motto: false, zitate: true, rankings: true };
const DEMO = "sv-ergebnisse-demo";

function demoLesen(): Record<ErgebnisBereich, boolean> {
  try {
    return { ...STANDARD, ...JSON.parse(localStorage.getItem(DEMO) || "{}") };
  } catch {
    return STANDARD;
  }
}

// Ein gemeinsamer Stand für alle Stellen der App (sonst lädt jede Karte selbst)
let geteilt: Record<ErgebnisBereich, boolean> = hasSupabase ? STANDARD : demoLesen();
let geladenUm = 0;
const hoerer = new Set<(e: Record<ErgebnisBereich, boolean>) => void>();
function verteilen(e: Record<ErgebnisBereich, boolean>) {
  geteilt = e;
  for (const h of hoerer) h(e);
}
async function holen(erzwingen = false) {
  if (!hasSupabase) return verteilen(demoLesen());
  if (!erzwingen && Date.now() - geladenUm < 10_000) return;
  geladenUm = Date.now();
  const { data } = await supabase!.from("app_settings").select("ergebnisse").eq("id", 1).maybeSingle();
  const e = (data as { ergebnisse?: Partial<Record<ErgebnisBereich, boolean>> } | null)?.ergebnisse;
  if (e) verteilen({ ...STANDARD, ...e });
}

/**
 * Einstellung „Ergebnisse für alle?“ je Bereich. Ohne eigenen Live-Kanal
 * (davon gibt es schon genug): geladen wird beim Öffnen eines Bereichs;
 * ändert das Komitee etwas, gilt es bei den anderen ab dem nächsten Öffnen.
 */
export function useErgebnisSichtbarkeit(aktiv: boolean) {
  const [alle, setAlle] = useState(geteilt);

  useEffect(() => {
    hoerer.add(setAlle);
    setAlle(geteilt);
    return () => {
      hoerer.delete(setAlle);
    };
  }, []);

  useEffect(() => {
    if (aktiv) void holen();
  }, [aktiv]);

  const setzen = useCallback(async (b: ErgebnisBereich, wert: boolean): Promise<string | null> => {
    const vorher = geteilt;
    verteilen({ ...geteilt, [b]: wert });
    if (!hasSupabase) {
      try {
        localStorage.setItem(DEMO, JSON.stringify(geteilt));
      } catch {
        /* privater Modus */
      }
      return null;
    }
    const { data, error } = await supabase!.rpc("ergebnisse_setzen", { p_bereich: b, p_alle: wert });
    if (error) {
      verteilen(vorher);
      return error.message;
    }
    if (data) verteilen({ ...STANDARD, ...(data as Partial<Record<ErgebnisBereich, boolean>>) });
    return null;
  }, []);

  return { alle, setzen };
}

/**
 * Gezählte Stimmen eines Bereichs (Motto 👍, Zitate 🔥).
 * sichtbar = false: man darf die Zahlen nicht sehen – dann nichts anzeigen.
 * Im Demo-Modus zählt die App selbst (zaehleDemo).
 */
export function useStimmenZahlen(bereich: "motto" | "zitate", aktiv: boolean, zaehleDemo: () => Record<string, number>, darfDemo: boolean) {
  const [stand, setStand] = useState<{ sichtbar: boolean; zahlen: Record<string, number>; personen: number }>({ sichtbar: false, zahlen: {}, personen: 0 });
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demo = useRef(zaehleDemo);
  demo.current = zaehleDemo;

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const z = demo.current();
      setStand({ sichtbar: darfDemo, zahlen: darfDemo ? z : {}, personen: 0 });
      return;
    }
    const { data, error } = await supabase!.rpc("stimmen_zahlen", { p_bereich: bereich });
    if (error || !data) return;
    const d = data as { sichtbar: boolean; zahlen: Record<string, number>; personen: number };
    setStand({ sichtbar: !!d.sichtbar, zahlen: d.zahlen || {}, personen: d.personen || 0 });
  }, [bereich, darfDemo]);

  /** Nach einer eigenen Stimme oder einer Änderung kurz verzögert neu zählen */
  const bald = useCallback(() => {
    if (zeit.current) clearTimeout(zeit.current);
    zeit.current = setTimeout(() => void laden(), 300);
  }, [laden]);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
  }, [aktiv, laden]);

  return { ...stand, laden, bald };
}
