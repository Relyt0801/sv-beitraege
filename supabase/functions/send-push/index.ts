// Supabase Edge Function: verschickt Web-Push bei einem neuen Event.
// Deploy:  supabase functions deploy send-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:du@example.com
// (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind in Edge Functions automatisch gesetzt.)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { event_id } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:kasse@sv-beitraege.local",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    console.log("send-push aufgerufen, event_id:", event_id);
    console.log("VAPID keys gesetzt:", Boolean(Deno.env.get("VAPID_PUBLIC_KEY")), Boolean(Deno.env.get("VAPID_PRIVATE_KEY")));

    const { data: ev, error: evErr } = await supabase.from("events").select("*").eq("id", event_id).single();
    if (!ev) {
      console.log("Event nicht gefunden:", evErr?.message);
      return new Response(JSON.stringify({ error: "event not found" }), { status: 404, headers: cors });
    }
    console.log("Event:", ev.title, "| audience:", ev.audience);

    // Empfänger bestimmen
    let userIds: string[] = [];
    if (ev.audience === "all") {
      const { data } = await supabase.from("profiles").select("user_id");
      userIds = (data || []).map((p: { user_id: string }) => p.user_id);
    } else {
      const { data: t } = await supabase.from("event_targets").select("student_id").eq("event_id", event_id);
      const sids = (t || []).map((x: { student_id: string }) => x.student_id);
      if (sids.length) {
        const { data: p } = await supabase.from("profiles").select("user_id").in("student_id", sids);
        userIds = (p || []).map((x: { user_id: string }) => x.user_id);
      }
    }
    console.log("Empfänger (userIds):", userIds.length);
    if (!userIds.length) return new Response(JSON.stringify({ sent: 0 }), { headers: cors });

    const { data: subs, error: subErr } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
    console.log("Push-Abos gefunden:", subs?.length || 0, subErr ? "Fehler: " + subErr.message : "");
    const title = ev.is_warning ? "⚠️ " + ev.title : ev.title;
    const payload = JSON.stringify({ title, body: (ev.body || "").slice(0, 120), url: "/" });

    let sent = 0;
    await Promise.all(
      (subs || []).map(async (s: { endpoint: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(s.subscription as webpush.PushSubscription, payload);
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          console.log("Versand-Fehler:", code, (err as Error)?.message, "endpoint:", s.endpoint.slice(0, 60));
          if (code === 404 || code === 410) await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }),
    );
    console.log("Gesendet:", sent);
    return new Response(JSON.stringify({ sent }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    console.log("FEHLER:", String(e));
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
