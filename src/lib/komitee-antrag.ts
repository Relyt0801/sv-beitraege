import { hasSupabase, supabase } from "./supabase";

export interface KomiteeRequest {
  id: string;
  user_id: string;
  wunsch_tag: string;
  nachricht: string;
  status: "offen" | "angenommen" | "abgelehnt";
  created_at: string;
}

export async function ladeKomiteeAntraege(): Promise<KomiteeRequest[]> {
  if (!hasSupabase) return [];
  const { data } = await supabase!
    .from("komitee_requests")
    .select("*")
    .eq("status", "offen")
    .order("created_at", { ascending: false });
  return (data as KomiteeRequest[]) || [];
}

export async function stelleKomiteeAntrag(tag: string, nachricht: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: true };
  const { data: s } = await supabase!.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return { ok: false, error: "nicht angemeldet" };
  const { error } = await supabase!
    .from("komitee_requests")
    .insert({ user_id: uid, wunsch_tag: tag, nachricht: nachricht.trim().slice(0, 300) });
  if (error)
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message)
        ? "Du hast schon einen offenen Antrag."
        : error.message,
    };
  return { ok: true };
}

/** Annehmen setzt das neue Komitee (altes wird ersetzt). */
export async function entscheideKomitee(
  req: KomiteeRequest,
  annehmen: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: true };
  const { data: s } = await supabase!.auth.getSession();
  if (annehmen) {
    await supabase!.from("tag_members").delete().eq("user_id", req.user_id);
    const { error } = await supabase!.from("tag_members").insert({ tag: req.wunsch_tag, user_id: req.user_id });
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase!
    .from("komitee_requests")
    .update({
      status: annehmen ? "angenommen" : "abgelehnt",
      decided_by: s.session?.user.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", req.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
