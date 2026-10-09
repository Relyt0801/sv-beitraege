import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { useRole } from "../auth/RoleProvider";

/**
 * Wortfilter je Bereich an/aus (app_settings.wortfilter_bereiche,
 * supabase/runden-und-freigaben.sql). Zitate sind standardmäßig aus – dort
 * prüft das Team jedes Zitat selbst. Schalten darf, wer den Wortfilter pflegt
 * oder den Bereich verwaltet (z. B. Abizeitung die Zitate).
 */
export type WfBereich = "chat" | "kommentare" | "steckbrief" | "motto" | "zitate" | "rankings" | "umfragen" | "anfragen" | "team";

export const WF_BEREICHE: { key: WfBereich; titel: string; text: string }[] = [
  { key: "chat", titel: "Chats", text: "Nachrichten, To-dos, Abstimmungen in Chats" },
  { key: "kommentare", titel: "Kommentare", text: "Kommentare im Abi-Album" },
  { key: "steckbrief", titel: "Steckbriefe", text: "Stammdaten, Lebensmotto, Texte" },
  { key: "motto", titel: "Abimotto", text: "Vorschläge und Erklärungen" },
  { key: "zitate", titel: "Zitate", text: "Standard aus – das Team prüft jedes Zitat" },
  { key: "rankings", titel: "Rankings", text: "Ranking-Kategorien" },
  { key: "umfragen", titel: "Umfragen", text: "Fragen und freie Antworten" },
  { key: "anfragen", titel: "Anfragen", text: "Nachträge, Termin-, Kosten-, Komitee- und Entsperr-Anfragen" },
  { key: "team", titel: "Termine & Events", text: "Was das Team selbst einträgt" },
];

const STANDARD: Record<WfBereich, boolean> = {
  chat: true, kommentare: true, steckbrief: true, motto: true, zitate: false, rankings: true, umfragen: true, anfragen: true, team: true,
};
const DEMO = "sv-wf-bereiche-demo";

/** Darf die angemeldete Person den Filter für diesen Bereich schalten? */
export function useWfRecht() {
  const { can } = useRole();
  return useCallback(
    (b: WfBereich) =>
      can("wortfilter.verwalten") ||
      (b === "motto" && can("motto.verwalten")) ||
      (b === "zitate" && can("zitate.pruefen")) ||
      (b === "rankings" && can("rankings.verwalten")) ||
      (b === "umfragen" && can("umfragen.verwalten")) ||
      ((b === "steckbrief" || b === "kommentare") && can("album.moderieren")),
    [can],
  );
}

export function useWortfilterBereiche(aktiv = true) {
  const [an, setAn] = useState<Record<WfBereich, boolean>>(() => {
    if (hasSupabase) return STANDARD;
    try {
      return { ...STANDARD, ...JSON.parse(localStorage.getItem(DEMO) || "{}") };
    } catch {
      return STANDARD;
    }
  });

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("app_settings").select("wortfilter_bereiche").eq("id", 1).maybeSingle();
    const w = (data as { wortfilter_bereiche?: Partial<Record<WfBereich, boolean>> } | null)?.wortfilter_bereiche;
    if (w) setAn({ ...STANDARD, ...w });
  }, []);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    return abonniere({
      name: "sv-wf-bereiche",
      nachholen: laden,
      aufbauen: (k) =>
        k.on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p) => {
          const w = (p.new as { wortfilter_bereiche?: Partial<Record<WfBereich, boolean>> }).wortfilter_bereiche;
          if (w) setAn({ ...STANDARD, ...w });
        }),
    });
  }, [aktiv, laden]);

  const setzen = useCallback(async (b: WfBereich, wert: boolean): Promise<string | null> => {
    setAn((a) => ({ ...a, [b]: wert }));
    if (!hasSupabase) {
      setAn((a) => {
        try {
          localStorage.setItem(DEMO, JSON.stringify(a));
        } catch {
          /* privater Modus */
        }
        return a;
      });
      return null;
    }
    const { error } = await supabase!.rpc("wortfilter_bereich_setzen", { p_bereich: b, p_an: wert });
    if (error) {
      setAn((a) => ({ ...a, [b]: !wert }));
      return error.message;
    }
    return null;
  }, []);

  return { an, setzen };
}
