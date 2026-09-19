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

const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // ---- Schlüssel prüfen, bevor irgendetwas anderes passiert -------------
    const oeffentlich = Deno.env.get("VAPID_PUBLIC_KEY");
    const privat = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!oeffentlich || !privat) {
      const fehlt = [!oeffentlich && "VAPID_PUBLIC_KEY", !privat && "VAPID_PRIVATE_KEY"].filter(Boolean).join(" und ");
      console.log("Schlüssel fehlen:", fehlt);
      return json(
        {
          sent: 0,
          error: `Auf dem Server fehlt ${fehlt}. Einmal setzen mit: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...`,
        },
        503,
      );
    }

    const koerper = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Kleiner Selbsttest: passt der Schlüssel der App zu dem auf dem Server?
    // Gibt nur ja oder nein zurück, niemals den Schlüssel selbst.
    if (typeof koerper.pruefe_schluessel === "string") {
      const passt = koerper.pruefe_schluessel === oeffentlich;
      console.log("Selbsttest Schlüssel:", passt ? "passt" : "passt nicht");
      return json({ passt });
    }

    const { probe, event_id, termin_id, an_team, user_ids, chat_item_id, angepinnt, title: directTitle, body: directBody, url: wunschUrl } = koerper as {
      probe?: boolean;
      chat_item_id?: string;
      angepinnt?: boolean;
      event_id?: string;
      termin_id?: string;
      an_team?: boolean;
      user_ids?: string[];
      title?: string;
      body?: string;
      url?: string;
    };
    // Wohin ein Tippen auf die Meldung führt – nur Ziele innerhalb der App.
    let ziel = typeof wunschUrl === "string" && /^\.\/(#[a-z-]+)?$/.test(wunschUrl) ? wunschUrl : "./";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:kasse@sv-beitraege.local",
      oeffentlich,
      privat,
    );

    // Nur angemeldete Personen dürfen Benachrichtigungen auslösen. Vorher
    // reichte der öffentliche Schlüssel der App – damit hätte jeder beliebigen
    // Text an alle Handys schicken können.
    const jwt = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    const { data: me } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
    const selbst = me?.user?.id;
    if (!selbst) {
      console.log("Abgelehnt: kein angemeldeter Absender");
      return json({ sent: 0, error: "nicht angemeldet" }, 401);
    }

    console.log("send-push aufgerufen, event_id:", event_id, "| direkt an:", user_ids?.length || 0);

    let userIds: string[] = [];
    let title = "";
    let body = "";

    const TEAM = ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"];

    if (Array.isArray(user_ids) && user_ids.length) {
      // Direkt-Modus (z. B. Themen-Benachrichtigungen, Schicht-Zuteilung)
      userIds = user_ids;
      title = String(directTitle || "Stufenkasse");
      body = String(directBody || "");
    } else if (an_team) {
      // An das Stufenteam, z. B. eine neue Terminanfrage
      const { data } = await supabase.from("profiles").select("user_id").in("role", TEAM);
      userIds = (data || []).map((p: { user_id: string }) => p.user_id);
      title = String(directTitle || "Stufenkasse");
      body = String(directBody || "");
    } else if (chat_item_id) {
      // Chat-Nachricht: Empfänger rechnet der Server aus. Im Browser sieht ein
      // Schüler nur seine eigene Komitee-Zeile – dort kam deshalb nie jemand an.
      const { data: it } = await supabase.from("topic_items")
        .select("id, topic_id, created_by, author, title, body, type, pinned").eq("id", chat_item_id).single();
      if (!it) return json({ error: "item not found" }, 404);
      const { data: tp } = await supabase.from("topics")
        .select("id, title, tag, visibility, kind, created_by, admin_only").eq("id", it.topic_id).single();
      if (!tp) return json({ error: "topic not found" }, 404);
      const { data: alle } = await supabase.from("profiles").select("user_id, role");
      const rolle = new Map<string, string>((alle || []).map((p: { user_id: string; role: string }) => [p.user_id, p.role] as [string, string]));
      const istTeam = (u: string) => TEAM.includes(rolle.get(u) || "");
      // Auslösen darf nur, wer die Nachricht geschrieben hat – oder das Team (Anheften).
      if (it.created_by !== selbst && !istTeam(selbst as string)) return json({ error: "nicht erlaubt" }, 403);

      const { data: mm } = await supabase.from("topic_members").select("user_id").eq("topic_id", tp.id);
      const mitglieder = (mm || []).map((x: { user_id: string }) => x.user_id);
      const teamIds = [...rolle.entries()].filter(([, r]) => TEAM.includes(r)).map(([u]) => u);

      if (tp.kind === "ticket") {
        // Gespräch Schüler <-> Stufenteam
        const person = [tp.created_by as string, ...mitglieder].filter((u) => u && !istTeam(u));
        userIds = istTeam(it.created_by as string) ? person : teamIds;
      } else if (tp.admin_only) {
        userIds = [...rolle.entries()].filter(([, r]) => r === "admin").map(([u]) => u);
      } else if (tp.visibility === "stufenteam") {
        userIds = teamIds;
      } else {
        const { data: tt } = await supabase.from("topic_tags").select("tag").eq("topic_id", tp.id);
        const tags = [...new Set([...(tt || []).map((x: { tag: string }) => x.tag), ...(tp.tag ? [tp.tag] : [])])];
        const { data: g } = tags.length
          ? await supabase.from("tag_members").select("user_id").in("tag", tags)
          : { data: [] };
        userIds = [...mitglieder, ...(g || []).map((x: { user_id: string }) => x.user_id)];
      }
      // Eltern sind in keinem Chat.
      userIds = [...new Set(userIds)].filter((u) => rolle.get(u) !== "eltern");

      // Chat-Schalter im Profil: gilt nur für normale Chat-Nachrichten.
      // Angepinntes und Gespräche mit dem Stufenteam kommen immer.
      const wichtig = Boolean(angepinnt) || Boolean(it.pinned) || tp.kind === "ticket";
      if (!wichtig && userIds.length) {
        const { data: aus } = await supabase.from("public_profiles").select("user_id").eq("push_chats", false).in("user_id", userIds);
        const weg = new Set((aus || []).map((x: { user_id: string }) => x.user_id));
        userIds = userIds.filter((u) => !weg.has(u));
      }

      const { data: pp } = await supabase.from("public_profiles").select("anzeigename").eq("user_id", it.created_by).maybeSingle();
      const von = (pp?.anzeigename || it.author || "Jemand").split(" ")[0];
      const text = (it.title && it.type !== "nachricht" ? it.title + ": " : "") + (it.body || "");
      const raum = tp.kind === "ticket" ? (istTeam(it.created_by as string) ? "Stufenteam" : `Frage: ${tp.title}`) : tp.title;
      title = (wichtig && tp.kind !== "ticket" ? "📌 " : "💬 ") + raum;
      body = tp.kind === "ticket" && istTeam(it.created_by as string) ? text : `${von}: ${text}`;
      if (it.type === "umfrage") body = `${von} fragt: ${it.body || it.title}`;
      if (ziel === "./") ziel = "./#chats";
    } else if (termin_id) {
      // Ein Termin oder eine Schichtreihe: an alle, die ihn sehen dürfen –
      // mit denselben Regeln wie im Kalender.
      const { data: t } = await supabase.from("termine").select("*").eq("id", termin_id).single();
      if (!t) return json({ error: "termin not found" }, 404);
      const { data: alle } = await supabase.from("profiles").select("user_id, role, student_id");
      const profile = (alle || []) as { user_id: string; role: string; student_id: string | null }[];
      const elternVon = async (sids: string[]) => {
        if (!t.fuer_eltern || !sids.length) return [] as string[];
        const { data: pc } = await supabase.from("parent_children").select("user_id").in("student_id", sids);
        return (pc || []).map((x: { user_id: string }) => x.user_id);
      };
      if (t.sichtbar === "alle") {
        userIds = profile.filter((p) => t.fuer_eltern || p.role !== "eltern").map((p) => p.user_id);
      } else if (t.sichtbar === "komitee") {
        const { data: tk } = await supabase.from("termin_komitees").select("tag").eq("termin_id", termin_id);
        const tags = (tk || []).map((x: { tag: string }) => x.tag);
        const { data: g } = tags.length
          ? await supabase.from("tag_members").select("user_id").in("tag", tags)
          : { data: [] };
        const mitglieder = (g || []).map((x: { user_id: string }) => x.user_id);
        const sids = profile.filter((p) => mitglieder.includes(p.user_id) && p.student_id).map((p) => p.student_id!);
        userIds = [...mitglieder, ...(await elternVon(sids))];
      } else {
        const { data: tp } = await supabase.from("termin_personen").select("student_id").eq("termin_id", termin_id);
        const sids = (tp || []).map((x: { student_id: string }) => x.student_id);
        userIds = [
          ...profile.filter((p) => p.student_id && sids.includes(p.student_id)).map((p) => p.user_id),
          ...(await elternVon(sids)),
        ];
      }
      // Das Team sieht ohnehin alles; es bekommt die Meldung nur, wenn es selbst gemeint ist.
      userIds = [...new Set(userIds)];
      title = String(directTitle || (t.icon ? t.icon + " " : "") + t.titel);
      body = String(directBody || "Neuer Termin im Kalender");
      if (ziel === "./") ziel = "./#events";
    } else {
      const { data: ev, error: evErr } = await supabase.from("events").select("*").eq("id", event_id).single();
      if (!ev) {
        console.log("Event nicht gefunden:", evErr?.message);
        return json({ error: "event not found" }, 404);
      }
      console.log("Event:", ev.title, "| audience:", ev.audience);
      if (ev.audience === "all") {
        // Eltern sehen keine Events – also bekommen sie auch keine Meldung dazu.
        const { data } = await supabase.from("profiles").select("user_id, role");
        userIds = (data || [])
          .filter((p: { role: string }) => p.role !== "eltern")
          .map((p: { user_id: string }) => p.user_id);
      } else if (ev.audience === "komitee") {
        // Alle Mitglieder der ausgewählten Komitees
        const { data: koms } = await supabase.from("event_committees").select("tag").eq("event_id", event_id);
        const tags = (koms || []).map((k: { tag: string }) => k.tag);
        if (tags.length) {
          const { data: g } = await supabase.from("tag_members").select("user_id").in("tag", tags);
          userIds = [...new Set((g || []).map((x: { user_id: string }) => x.user_id))];
        }
      } else {
        const { data: t } = await supabase.from("event_targets").select("student_id").eq("event_id", event_id);
        const sids = (t || []).map((x: { student_id: string }) => x.student_id);
        if (sids.length) {
          const { data: p } = await supabase.from("profiles").select("user_id").in("student_id", sids);
          userIds = (p || []).map((x: { user_id: string }) => x.user_id);
        }
      }
      title = ev.is_warning ? "⚠️ " + ev.title : ev.title;
      body = (ev.body || "").slice(0, 120);
      if (ziel === "./") ziel = "./#events";
    }

    // Niemand bekommt eine Benachrichtigung über die eigene Nachricht.
    userIds = userIds.filter((u) => u !== selbst);

    console.log("Empfänger (userIds):", userIds.length);
    // Probelauf: nur zählen, nichts verschicken (zum Testen).
    if (probe) return json({ probe: true, empfaenger: userIds.length, title, body, url: ziel });
    if (!userIds.length) return json({ sent: 0 });

    const { data: subs, error: subErr } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
    console.log("Push-Abos gefunden:", subs?.length || 0, subErr ? "Fehler: " + subErr.message : "");
    // tag: Meldungen zum selben Event ersetzen sich, statt sich zu stapeln.
    const payload = JSON.stringify({
      title,
      body: body.slice(0, 120),
      url: ziel,
      tag: event_id ? `event-${event_id}` : termin_id ? `termin-${termin_id}` : undefined,
    });

    let sent = 0;
    let entfernt = 0;
    await Promise.all(
      (subs || []).map(async (s: { endpoint: string; subscription: unknown }) => {
        try {
          // urgency high: Android stellt die Meldung sofort zu, auch im Energiesparmodus.
          // TTL 1 Tag: ist das Handy länger aus, ist die Meldung ohnehin veraltet.
          await webpush.sendNotification(s.subscription as webpush.PushSubscription, payload, {
            TTL: 86400,
            urgency: "high",
          });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          console.log("Versand-Fehler:", code, (err as Error)?.message, "endpoint:", s.endpoint.slice(0, 60));
          // 404/410: Gerät hat das Abo weggeworfen.
          // 403: Abo gehört zu einem alten Schlüsselpaar und ist damit tot.
          // In beiden Fällen wegräumen, dann meldet sich das Gerät beim nächsten
          // Öffnen von selbst neu an.
          if (code === 403 || code === 404 || code === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            entfernt++;
          }
        }
      }),
    );
    console.log("Gesendet:", sent, "| veraltete Abos entfernt:", entfernt);
    return json({ sent, entfernt });
  } catch (e) {
    console.log("FEHLER:", String(e));
    return json({ error: String(e) }, 500);
  }
});
