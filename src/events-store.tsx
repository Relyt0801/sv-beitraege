import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import type { EventItem, NewEvent } from "./lib/events";

const LS = "sv-beitraege:events";
const LOCAL_UID = "local-user";

interface EventsValue {
  events: EventItem[];
  ready: boolean;
  myVotes: Record<string, string[]>; // eventId -> optionIds
  voteCounts: Record<string, Record<string, number>>; // eventId -> optionId -> count
  /** eventId -> Stimmen mit Person, für die Initialen-Kreise */
  voters: Record<string, { option_id: string; user_id: string }[]>;
  reads: Set<string>;
  createEvent: (e: NewEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  vote: (eventId: string, optionId: string, multiple: boolean) => Promise<void>;
  markRead: (eventId: string) => void;
}

const Ctx = createContext<EventsValue | null>(null);
export const useEvents = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvents outside provider");
  return v;
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, string[]>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, Record<string, number>>>({});
  const [voters, setVoters] = useState<Record<string, { option_id: string; user_id: string }[]>>({});
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(!hasSupabase);
  const uidRef = useRef<string>(LOCAL_UID);
  // Realtime feuert bei jeder Stimme – Nachladen bündeln statt sechs Abfragen je Klick
  const nachladeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- LOCAL MODE ----------
  const saveLocal = useCallback(
    (evs: EventItem[], votes: Record<string, string[]>, rd: Set<string>) => {
      localStorage.setItem(LS, JSON.stringify({ events: evs, votes, reads: [...rd] }));
    },
    [],
  );

  useEffect(() => {
    if (hasSupabase) return;
    try {
      const d = JSON.parse(localStorage.getItem(LS) || "{}");
      setEvents(d.events || []);
      setMyVotes(d.votes || {});
      setReads(new Set(d.reads || []));
      const counts: Record<string, Record<string, number>> = {};
      for (const [eid, opts] of Object.entries((d.votes || {}) as Record<string, string[]>)) {
        counts[eid] = {};
        for (const o of opts) counts[eid][o] = (counts[eid][o] || 0) + 1;
      }
      setVoteCounts(counts);
      const vs: Record<string, { option_id: string; user_id: string }[]> = {};
      for (const [eid, opts] of Object.entries((d.votes || {}) as Record<string, string[]>))
        vs[eid] = opts.map((option_id) => ({ option_id, user_id: LOCAL_UID }));
      setVoters(vs);
    } catch {
      /* ignore */
    }
  }, []);

  // ---------- SUPABASE MODE ----------
  const loadAll = useCallback(async () => {
    const uid = uidRef.current;
    const [{ data: evs }, { data: opts }, { data: tgts }, { data: koms }, { data: votes }, { data: rd }] = await Promise.all([
      supabase!.from("events").select("*").order("created_at", { ascending: false }),
      supabase!.from("poll_options").select("*").order("position"),
      supabase!.from("event_targets").select("*"),
      supabase!.from("event_committees").select("*"),
      supabase!.from("poll_votes").select("*"),
      supabase!.from("event_reads").select("event_id"),
    ]);
    const optsByEvent: Record<string, { id: string; label: string }[]> = {};
    for (const o of opts || []) (optsByEvent[o.event_id] ||= []).push({ id: o.id, label: o.label });
    const tgtByEvent: Record<string, string[]> = {};
    for (const t of tgts || []) (tgtByEvent[t.event_id] ||= []).push(t.student_id);
    const komByEvent: Record<string, string[]> = {};
    for (const k of koms || []) (komByEvent[k.event_id] ||= []).push(k.tag);
    setEvents(
      (evs || []).map((e: any) => ({
        ...e,
        options: optsByEvent[e.id] || [],
        target_ids: tgtByEvent[e.id] || [],
        tags: komByEvent[e.id] || [],
      })),
    );
    const mine: Record<string, string[]> = {};
    const counts: Record<string, Record<string, number>> = {};
    const vs: Record<string, { option_id: string; user_id: string }[]> = {};
    for (const v of votes || []) {
      counts[v.event_id] ||= {};
      counts[v.event_id][v.option_id] = (counts[v.event_id][v.option_id] || 0) + 1;
      (vs[v.event_id] ||= []).push({ option_id: v.option_id, user_id: v.user_id });
      if (v.user_id === uid) (mine[v.event_id] ||= []).push(v.option_id);
    }
    setMyVotes(mine);
    setVoteCounts(counts);
    setVoters(vs);
    setReads(new Set((rd || []).map((r: any) => r.event_id)));
    setReady(true);
  }, []);

  /** Nachladen anstoßen – mehrere Anstöße innerhalb 300 ms werden zu einem. */
  const planeNachladen = useCallback(() => {
    if (nachladeTimer.current) clearTimeout(nachladeTimer.current);
    nachladeTimer.current = setTimeout(() => {
      nachladeTimer.current = null;
      void loadAll();
    }, 300);
  }, [loadAll]);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    const start = async () => {
      const { data } = await supabase!.auth.getSession();
      uidRef.current = data.session?.user.id || LOCAL_UID;
      if (!data.session) {
        if (alive) setReady(true);
        return;
      }
      await loadAll();
      if (channel) return;
      channel = supabase!
        .channel("sv-events")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, planeNachladen)
        .subscribe();
    };
    void start();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setEvents([]);
        setMyVotes({});
        setVoteCounts({});
        if (channel) {
          supabase!.removeChannel(channel);
          channel = null;
        }
        void start();
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (nachladeTimer.current) clearTimeout(nachladeTimer.current);
      if (channel) supabase!.removeChannel(channel);
    };
  }, [loadAll, planeNachladen]);

  // ---------- actions ----------
  const createEvent = useCallback(
    async (e: NewEvent) => {
      if (!hasSupabase) {
        const item: EventItem = {
          id: uuid(),
          type: e.type,
          title: e.title,
          body: e.body,
          is_warning: e.is_warning,
          audience: e.audience,
          poll_multiple: e.poll_multiple,
          poll_min_one: e.poll_min_one,
          poll_show_results: e.poll_show_results,
          poll_anon: e.poll_anon,
          created_by: LOCAL_UID,
          created_at: new Date().toISOString(),
          options: e.options.filter(Boolean).map((label) => ({ id: uuid(), label })),
          target_ids: e.target_ids,
          tags: e.tags,
        };
        setEvents((prev) => {
          const next = [item, ...prev];
          saveLocal(next, myVotes, reads);
          return next;
        });
        return;
      }
      const { data: ev, error } = await supabase!
        .from("events")
        .insert({
          type: e.type,
          title: e.title,
          body: e.body,
          is_warning: e.is_warning,
          audience: e.audience,
          poll_multiple: e.poll_multiple,
          poll_min_one: e.poll_min_one,
          poll_show_results: e.poll_show_results,
          poll_anon: e.poll_anon,
          created_by: uidRef.current,
        })
        .select()
        .single();
      if (error || !ev) {
        alert("Event anlegen fehlgeschlagen: " + (error?.message || ""));
        return;
      }
      if (e.options.filter(Boolean).length)
        await supabase!
          .from("poll_options")
          .insert(e.options.filter(Boolean).map((label, i) => ({ event_id: ev.id, label, position: i })));
      if (e.audience === "selected" && e.target_ids.length)
        await supabase!.from("event_targets").insert(e.target_ids.map((student_id) => ({ event_id: ev.id, student_id })));
      if (e.audience === "komitee" && e.tags.length)
        await supabase!.from("event_committees").insert(e.tags.map((tag) => ({ event_id: ev.id, tag })));
      // Push-Benachrichtigung auslösen (Function optional – Fehler ignorieren, falls noch nicht deployt)
      try {
        await supabase!.functions.invoke("send-push", { body: { event_id: ev.id } });
      } catch {
        /* Function evtl. noch nicht deployt */
      }
      await loadAll();
    },
    [loadAll, myVotes, reads, saveLocal],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (!hasSupabase) {
        setEvents((prev) => {
          const next = prev.filter((x) => x.id !== id);
          saveLocal(next, myVotes, reads);
          return next;
        });
        return;
      }
      const { error } = await supabase!.from("events").delete().eq("id", id);
      if (error) alert("Löschen fehlgeschlagen: " + error.message);
      await loadAll();
    },
    [loadAll, myVotes, reads, saveLocal],
  );

  const vote = useCallback(
    async (eventId: string, optionId: string, multiple: boolean) => {
      const has = (myVotes[eventId] || []).includes(optionId);
      if (!hasSupabase) {
        setMyVotes((prev) => {
          let cur = prev[eventId] || [];
          if (has) cur = cur.filter((o) => o !== optionId);
          else cur = multiple ? [...cur, optionId] : [optionId];
          const next = { ...prev, [eventId]: cur };
          // counts neu
          setVoteCounts((vc) => {
            const c: Record<string, number> = {};
            for (const o of cur) c[o] = (c[o] || 0) + 1;
            return { ...vc, [eventId]: c };
          });
          setVoters((vv) => ({ ...vv, [eventId]: cur.map((option_id) => ({ option_id, user_id: LOCAL_UID })) }));
          saveLocal(events, next, reads);
          return next;
        });
        return;
      }
      const uid = uidRef.current;
      // sofort anzeigen, damit der Knopf nicht erst nach dem Server reagiert
      const vorher = myVotes[eventId] || [];
      const nachher = has ? vorher.filter((o) => o !== optionId) : multiple ? [...vorher, optionId] : [optionId];
      setMyVotes((p) => ({ ...p, [eventId]: nachher }));
      setVoteCounts((c) => {
        const n = { ...(c[eventId] || {}) };
        for (const opt of vorher) n[opt] = Math.max(0, (n[opt] || 0) - 1);
        for (const opt of nachher) n[opt] = (n[opt] || 0) + 1;
        return { ...c, [eventId]: n };
      });
      setVoters((v) => {
        const ohneMich = (v[eventId] || []).filter((x) => x.user_id !== uid);
        return { ...v, [eventId]: [...ohneMich, ...nachher.map((option_id) => ({ option_id, user_id: uid }))] };
      });
      if (has) {
        await supabase!.from("poll_votes").delete().eq("event_id", eventId).eq("option_id", optionId).eq("user_id", uid);
      } else {
        if (!multiple)
          await supabase!.from("poll_votes").delete().eq("event_id", eventId).eq("user_id", uid);
        await supabase!.from("poll_votes").insert({ event_id: eventId, option_id: optionId, user_id: uid });
      }
      planeNachladen();
    },
    [events, myVotes, planeNachladen, reads, saveLocal],
  );

  const markRead = useCallback(
    (eventId: string) => {
      if (reads.has(eventId)) return;
      setReads((prev) => {
        const next = new Set(prev).add(eventId);
        if (!hasSupabase) saveLocal(events, myVotes, next);
        return next;
      });
      if (hasSupabase) supabase!.from("event_reads").upsert({ event_id: eventId, user_id: uidRef.current }).then(({ error }) => { if (error) console.warn("[speichern]", error.message); }); // then() nötig, sonst wird nie gesendet
    },
    [events, myVotes, reads, saveLocal],
  );

  const value: EventsValue = { events, ready, myVotes, voteCounts, voters, reads, createEvent, deleteEvent, vote, markRead };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
