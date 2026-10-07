import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { pushAnTeam } from "./push";
import { sprungUrl } from "./sprung";

/**
 * Melden (supabase/wortfilter-melden.sql, Tabelle meldungen).
 *
 * Jede Person kann fremde Inhalte melden: Chat-Nachricht, Album-Kommentar,
 * Steckbrief, Motto-Vorschlag, Zitat. Auszug und betroffene Person holt die
 * Datenbank selbst aus dem Original. Wer meldet, sieht das Team nicht.
 * Bearbeiten: Recht meldungen.bearbeiten (Standard Stufenteam + Sprecher).
 */
export type MeldeArt = "chat" | "kommentar" | "steckbrief" | "motto" | "zitat";
export type MeldeGrund = "beleidigung" | "mobbing" | "unangemessen" | "sonstiges";

export const ART_TEXT: Record<MeldeArt, string> = {
  chat: "Chat-Nachricht",
  kommentar: "Kommentar im Abi-Album",
  steckbrief: "Steckbrief",
  motto: "Motto-Vorschlag",
  zitat: "Zitat",
};
export const GRUENDE: { key: MeldeGrund; text: string; zeichen: string }[] = [
  { key: "beleidigung", text: "Beleidigung", zeichen: "🤬" },
  { key: "mobbing", text: "Mobbing oder bloßstellen", zeichen: "🎯" },
  { key: "unangemessen", text: "Unangemessen / anstößig", zeichen: "🔞" },
  { key: "sonstiges", text: "Etwas anderes", zeichen: "💬" },
];

export interface Meldung {
  id: string;
  art: MeldeArt;
  ziel_id: string;
  grund: MeldeGrund;
  notiz: string;
  gemeldet_user: string | null;
  auszug: string;
  status: "offen" | "ok" | "entfernt";
  created_at: string;
}

/** Von überall: öffnet das Melden-Blatt (components/Melden.tsx) */
export function melden(art: MeldeArt, zielId: string) {
  window.dispatchEvent(new CustomEvent("sv:melden", { detail: { art, zielId } }));
}

export async function meldungSenden(art: MeldeArt, zielId: string, grund: MeldeGrund, notiz: string): Promise<string | null> {
  if (!hasSupabase) return null;
  const { error } = await supabase!
    .from("meldungen")
    .upsert({ art, ziel_id: zielId, grund, notiz: notiz.trim().slice(0, 300) }, { onConflict: "von,art,ziel_id", ignoreDuplicates: true });
  if (error) return error.message;
  void pushAnTeam("🚩 Neue Meldung", `${ART_TEXT[art]} – bitte ansehen.`, sprungUrl("meldung"), { art: "anfrage" });
  return null;
}

/** Offene Meldungen für das Team */
export function useMeldungen(aktiv: boolean) {
  const [liste, setListe] = useState<Meldung[]>([]);
  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("meldungen").select("*").eq("status", "offen").order("created_at", { ascending: true }).limit(100);
    setListe((data as Meldung[]) || []);
  }, []);
  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    return abonniere({
      name: "sv-meldungen",
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "meldungen" }, () => void laden()),
    });
  }, [aktiv, laden]);

  const erledigen = useCallback(
    async (id: string, status: "ok" | "entfernt"): Promise<string | null> => {
      setListe((l) => l.filter((m) => m.id !== id));
      if (!hasSupabase) return null;
      // Alle Meldungen zum selben Inhalt gleich mit erledigen
      const m = liste.find((x) => x.id === id);
      const q = supabase!.from("meldungen").update({ status }).eq("status", "offen");
      const { error } = m ? await q.eq("art", m.art).eq("ziel_id", m.ziel_id) : await q.eq("id", id);
      if (error) {
        void laden();
        return error.message;
      }
      return null;
    },
    [liste, laden],
  );

  /** Den gemeldeten Inhalt entfernen – je nach Art auf dem passenden Weg */
  const inhaltEntfernen = useCallback(async (m: Meldung): Promise<string | null> => {
    if (!hasSupabase) return null;
    let error: { message: string } | null = null;
    if (m.art === "chat") ({ error } = await supabase!.from("topic_items").delete().eq("id", m.ziel_id));
    else if (m.art === "kommentar") ({ error } = await supabase!.rpc("album_kommentar_entfernen", { p_id: m.ziel_id }));
    else if (m.art === "steckbrief") ({ error } = await supabase!.rpc("album_text_entfernen", { p_student: m.ziel_id }));
    else if (m.art === "motto") ({ error } = await supabase!.from("motto_vorschlaege").update({ ausgeblendet: true }).eq("id", m.ziel_id));
    else if (m.art === "zitat") ({ error } = await supabase!.from("zitate").update({ status: "abgelehnt" }).eq("id", m.ziel_id));
    return error ? error.message : null;
  }, []);

  return { liste, laden, erledigen, inhaltEntfernen };
}

/** Wortfilter-Treffer prüfen (z. B. beim Zitate-Prüfen): maskiertes Wort oder null */
export async function wortfilterFinden(text: string): Promise<string | null> {
  if (!hasSupabase || !text.trim()) return null;
  const { data } = await supabase!.rpc("wortfilter_finden", { p_text: text });
  return (data as string | null) || null;
}
