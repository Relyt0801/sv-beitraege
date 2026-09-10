import { hasSupabase, supabase } from "./supabase";

export interface UnbanRequest {
  id: string;
  user_id: string;
  nachricht: string;
  status: "offen" | "angenommen" | "abgelehnt";
  created_at: string;
}

/** Offene Anfragen laden – Schüler sehen nur die eigene, Moderation alle. */
export async function ladeAnfragen(): Promise<UnbanRequest[]> {
  if (!hasSupabase) return [];
  const { data } = await supabase!
    .from("unban_requests")
    .select("*")
    .eq("status", "offen")
    .order("created_at", { ascending: false });
  return (data as UnbanRequest[]) || [];
}

/** Eine Anfrage pro Sperre – die Datenbank lässt nur eine offene zu. */
export async function stelleAnfrage(nachricht: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: true };
  const { data: s } = await supabase!.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return { ok: false, error: "nicht angemeldet" };
  const { error } = await supabase!
    .from("unban_requests")
    .insert({ user_id: uid, nachricht: nachricht.trim().slice(0, 300) });
  if (error)
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message)
        ? "Du hast für diese Sperre schon eine Anfrage gestellt."
        : error.message,
    };
  return { ok: true };
}

/** Annehmen hebt die Sperre auf, Ablehnen lässt sie bestehen. */
export async function entscheide(
  req: UnbanRequest,
  annehmen: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: true };
  const { data: s } = await supabase!.auth.getSession();
  if (annehmen) {
    const { error } = await supabase!
      .from("profiles")
      .update({ chat_banned_until: null, chat_ban_permanent: false })
      .eq("user_id", req.user_id);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase!
    .from("unban_requests")
    .update({
      status: annehmen ? "angenommen" : "abgelehnt",
      decided_by: s.session?.user.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Text für die Sperr-Anzeige: "noch 42 Minuten" statt Datum im Jahr 2099. */
export function sperrText(bannedUntil: string | null, permanent: boolean): string {
  if (permanent) return "dauerhaft gesperrt";
  if (!bannedUntil) return "gesperrt";
  const ms = new Date(bannedUntil).getTime() - Date.now();
  if (ms <= 0) return "nicht mehr gesperrt";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `noch ${min} Minute${min === 1 ? "" : "n"} gesperrt`;
  const std = Math.ceil(min / 60);
  if (std < 24) return `noch ${std} Stunde${std === 1 ? "" : "n"} gesperrt`;
  const tage = Math.ceil(std / 24);
  return `noch ${tage} Tag${tage === 1 ? "" : "e"} gesperrt`;
}
