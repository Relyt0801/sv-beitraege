import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { pushAnTeam, pushToUsers } from "./push";

/**
 * Mithilfe nachtragen: Antrag auf eine vergangene Mithilfe
 * (supabase/mithilfe-nachtrag.sql). Schüler sehen ihre eigenen Anträge, das
 * Team (bzw. „Mithilfe eintragen“) alle.
 */
export interface Nachtrag {
  id: string;
  user_id: string;
  student_id: string;
  vorlage_id: string | null;
  titel: string;
  /** null = „Sonstiges“ – den Wert legt das Team fest */
  punkte: number | null;
  datum: string;
  beschreibung: string;
  status: "offen" | "angenommen" | "abgelehnt";
  antwort: string;
  vergeben: number | null;
  created_at: string;
  decided_at: string | null;
}

export function useNachtraege(aktiv = true) {
  const [liste, setListe] = useState<Nachtrag[]>([]);
  const [bereit, setBereit] = useState(!hasSupabase);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data, error } = await supabase!
      .from("mithilfe_nachtraege")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error) setListe((data as Nachtrag[]) || []);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    const ab = abonniere({
      name: "sv-nachtraege",
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "mithilfe_nachtraege" }, () => void laden()),
    });
    return ab;
  }, [aktiv, laden]);

  /** Antrag stellen. Gibt einen Fehlertext zurück oder null. */
  const stellen = useCallback(
    async (a: {
      student_id: string;
      vorlage_id: string | null;
      titel: string;
      punkte: number | null;
      datum: string;
      beschreibung: string;
    }): Promise<string | null> => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return "Du bist nicht angemeldet.";
      const { error } = await supabase!.from("mithilfe_nachtraege").insert({
        user_id: uid,
        student_id: a.student_id,
        vorlage_id: a.vorlage_id,
        titel: a.titel.trim().slice(0, 80),
        punkte: a.punkte,
        datum: a.datum,
        beschreibung: a.beschreibung.trim().slice(0, 500),
      });
      if (error) return error.message;
      void laden();
      void pushAnTeam("🙌 Mithilfe nachtragen", `${a.titel.trim()} – bitte prüfen.`, "./#chats", { art: "anfrage" });
      return null;
    },
    [laden],
  );

  const zurueckziehen = useCallback(
    async (id: string) => {
      setListe((l) => l.filter((x) => x.id !== id));
      if (hasSupabase) await supabase!.from("mithilfe_nachtraege").delete().eq("id", id);
      void laden();
    },
    [laden],
  );

  /** Annehmen (mit Wert in %) oder ablehnen. Gibt einen Fehlertext zurück oder null. */
  const entscheiden = useCallback(
    async (n: Nachtrag, annehmen: boolean, punkte: number | null, antwort: string): Promise<string | null> => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { data, error } = await supabase!.rpc("nachtrag_entscheiden", {
        p_id: n.id,
        p_annehmen: annehmen,
        p_punkte: punkte,
        p_antwort: antwort.trim(),
      });
      if (error) return error.message;
      void laden();
      const wert = Number(data) || 0;
      void pushToUsers(
        [n.user_id],
        annehmen ? `🙌 Nachtrag angenommen (+${wert} %)` : "Nachtrag abgelehnt",
        annehmen
          ? `${n.titel} ist jetzt als Mithilfe eingetragen.${antwort.trim() ? ` „${antwort.trim().slice(0, 70)}“` : ""}`
          : `${n.titel}${antwort.trim() ? ` – „${antwort.trim().slice(0, 80)}“` : " – frag im Chat beim Stufenteam nach."}`,
        "./#chats",
      );
      return null;
    },
    [laden],
  );

  return { liste, bereit, laden, stellen, zurueckziehen, entscheiden };
}
