import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { useRole } from "../auth/RoleProvider";

/**
 * Freigaben mit mehreren Zustimmungen (supabase/runden-und-freigaben.sql).
 *
 * Der Admin legt fest, wie viele Personen zustimmen müssen (Standard 1):
 * Termine, Kosten, Entsperren, Zitate. Wer annimmt, ruft erst zustimmen()
 * auf; erst wenn genug zusammen sind („fertig“), läuft das eigentliche
 * Annehmen. Die Datenbank prüft das zusätzlich (Trigger zustimmung).
 */
export type ZustimmungsArt = "termin" | "kosten" | "entsperren" | "zitat";

export interface ZustimmungErgebnis {
  stimmen: number;
  noetig: number;
  fertig: boolean;
}

export async function zustimmen(art: ZustimmungsArt, id: string): Promise<ZustimmungErgebnis | { error: string }> {
  if (!hasSupabase) return { stimmen: 1, noetig: 1, fertig: true };
  const { data, error } = await supabase!.rpc("zustimmen", { p_art: art, p_id: id });
  if (error) return { error: error.message };
  return data as ZustimmungErgebnis;
}

/** Text nach einer Zustimmung, wenn noch welche fehlen */
export function nochFehlend(e: ZustimmungErgebnis): string {
  const fehlt = e.noetig - e.stimmen;
  return `Deine Zustimmung ist gespeichert (${e.stimmen} von ${e.noetig}). Es ${fehlt === 1 ? "fehlt noch eine" : `fehlen noch ${fehlt}`}.`;
}

/** Zustimmungen je Anfrage und die nötige Zahl – für die Anzeige „1/2“ */
export function useZustimmungen(art: ZustimmungsArt, aktiv: boolean, uid: string | null) {
  // Der Owner entscheidet allein (supabase/owner-entscheidet-allein.sql)
  const { isOp: allein } = useRole();
  const [je, setJe] = useState<Record<string, string[]>>({});
  const [noetig, setNoetig] = useState(1);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [{ data: z }, { data: a }] = await Promise.all([
      supabase!.from("anfrage_zustimmungen").select("anfrage_id, user_id").eq("art", art),
      supabase!.from("app_settings").select("bestaetigungen").eq("id", 1).maybeSingle(),
    ]);
    const m: Record<string, string[]> = {};
    for (const r of (z as { anfrage_id: string; user_id: string }[]) || []) (m[r.anfrage_id] ||= []).push(r.user_id);
    setJe(m);
    const b = (a as { bestaetigungen?: Record<string, number> } | null)?.bestaetigungen || {};
    setNoetig(Math.max(1, Number(b[art]) || 1));
  }, [art]);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    return abonniere({
      name: `sv-zustimmung-${art}`,
      nachholen: laden,
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "anfrage_zustimmungen" }, () => void laden())
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, () => void laden()),
    });
  }, [aktiv, laden, art]);

  const zahl = (id: string) => (je[id] || []).length;
  const ichSchon = (id: string) => Boolean(uid && (je[id] || []).includes(uid));
  return { noetig, zahl, ichSchon, laden, allein };
}

/** Kleine Marke „1/2 Zustimmungen“ – nur, wenn mehr als eine nötig ist */
export function zustimmungText(zahl: number, noetig: number): string | null {
  if (noetig <= 1) return null;
  return `${zahl}/${noetig} Zustimmungen`;
}
