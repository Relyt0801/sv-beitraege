import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { pushToUsers } from "./lib/push";

export type TopicItemType = "nachricht" | "todo" | "umfrage";

export type Visibility = "privat" | "personen" | "stufenteam" | "komitee" | "custom";
export interface Topic {
  id: string;
  title: string;
  tag: string; // Komitee-Slug (oder "")
  pinned: boolean;
  admin_only: boolean;
  visibility: Visibility;
  parent_id: string | null;
  created_by: string | null;
  created_at: string;
}
export interface NewTopic {
  title: string;
  tag: string;
  visibility: Visibility;
  memberIds: string[];
  komiteeSlugs: string[];
  parentId?: string | null;
}
export interface TopicItem {
  id: string;
  topic_id: string;
  type: TopicItemType;
  title: string;
  body: string;
  options: { id: string; label: string }[] | null;
  done: boolean;
  pinned: boolean;
  author: string;
  created_by: string | null;
  created_at: string;
}

const LS = "sv-beitraege:topics";
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

interface TopicsValue {
  topics: Topic[];
  items: TopicItem[];
  members: Record<string, string[]>; // topicId -> userIds
  topicTags: Record<string, string[]>; // topicId -> Komitee-Slugs (Sichtbarkeit)
  tagMembers: Record<string, string[]>; // tag -> userIds (Komitee)
  myVotes: Record<string, string[]>; // itemId -> optionIds
  voteCounts: Record<string, Record<string, number>>;
  reads: Record<string, string>; // topicId -> last_read ISO
  uid: string;
  ready: boolean;
  createTopic: (t: NewTopic) => Promise<void>;
  updateTopic: (id: string, patch: Partial<Pick<Topic, "title" | "tag" | "pinned" | "admin_only" | "visibility">>) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
  setMembers: (topicId: string, topicTitle: string, userIds: string[]) => Promise<void>;
  setTagMembers: (tag: string, userIds: string[]) => Promise<void>;
  setUserCommittee: (userId: string, slug: string, on: boolean) => Promise<void>;
  committeesOf: (userId: string) => string[];
  postItem: (topic: Topic, type: TopicItemType, body: string, options?: string[], title?: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<Pick<TopicItem, "done" | "pinned">>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  vote: (itemId: string, optionId: string) => Promise<void>;
  markRead: (topicId: string) => void;
  unreadCount: (topicId: string) => number;
}

const Ctx = createContext<TopicsValue | null>(null);
export const useTopics = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTopics outside provider");
  return v;
};

export function TopicsProvider({ children }: { children: ReactNode }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [items, setItems] = useState<TopicItem[]>([]);
  const [members, setMembersState] = useState<Record<string, string[]>>({});
  const [topicTags, setTopicTagsState] = useState<Record<string, string[]>>({});
  const [tagMembers, setTagMembersState] = useState<Record<string, string[]>>({});
  const [myVotes, setMyVotes] = useState<Record<string, string[]>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, Record<string, number>>>({});
  const [reads, setReads] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(!hasSupabase);
  const uidRef = useRef("local-user");
  const nameRef = useRef("du");
  const stateRef = useRef({ topics, items, members, topicTags, tagMembers, myVotes, reads });
  stateRef.current = { topics, items, members, topicTags, tagMembers, myVotes, reads };

  // ---------- lokal (Testmodus) ----------
  const saveLocal = useCallback(() => {
    if (hasSupabase) return;
    const s = stateRef.current;
    localStorage.setItem(LS, JSON.stringify(s));
  }, []);
  useEffect(() => {
    if (hasSupabase) return;
    try {
      const d = JSON.parse(localStorage.getItem(LS) || "{}");
      setTopics(d.topics || []);
      setItems(d.items || []);
      setMembersState(d.members || {});
      setTopicTagsState(d.topicTags || {});
      setTagMembersState(d.tagMembers || {});
      setMyVotes(d.myVotes || {});
      setReads(d.reads || {});
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!hasSupabase) {
      const counts: Record<string, Record<string, number>> = {};
      for (const [iid, opts] of Object.entries(myVotes)) {
        counts[iid] = {};
        for (const o of opts) counts[iid][o] = 1;
      }
      setVoteCounts(counts);
      saveLocal();
    }
  }, [myVotes, topics, items, members, topicTags, reads, saveLocal]);

  // ---------- Supabase ----------
  const loadAll = useCallback(async () => {
    const [{ data: t }, { data: it }, { data: m }, { data: tt }, { data: g }, { data: v }, { data: r }] = await Promise.all([
      supabase!.from("topics").select("*").order("created_at", { ascending: false }),
      supabase!.from("topic_items").select("*").order("created_at"),
      supabase!.from("topic_members").select("*"),
      supabase!.from("topic_tags").select("*"),
      supabase!.from("tag_members").select("*"),
      supabase!.from("topic_votes").select("*"),
      supabase!.from("topic_reads").select("*"),
    ]);
    setTopics((t as Topic[]) || []);
    setItems((it as TopicItem[]) || []);
    const mm: Record<string, string[]> = {};
    for (const row of m || []) (mm[row.topic_id] ||= []).push(row.user_id);
    setMembersState(mm);
    const tg: Record<string, string[]> = {};
    for (const row of tt || []) (tg[row.topic_id] ||= []).push(row.tag);
    setTopicTagsState(tg);
    const gg: Record<string, string[]> = {};
    for (const row of g || []) (gg[row.tag] ||= []).push(row.user_id);
    setTagMembersState(gg);
    const mine: Record<string, string[]> = {};
    const counts: Record<string, Record<string, number>> = {};
    for (const row of v || []) {
      counts[row.item_id] ||= {};
      counts[row.item_id][row.option_id] = (counts[row.item_id][row.option_id] || 0) + 1;
      if (row.user_id === uidRef.current) (mine[row.item_id] ||= []).push(row.option_id);
    }
    setMyVotes(mine);
    setVoteCounts(counts);
    const rr: Record<string, string> = {};
    for (const row of r || []) if (row.user_id === uidRef.current) rr[row.topic_id] = row.last_read;
    setReads(rr);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    const start = async () => {
      const { data } = await supabase!.auth.getSession();
      if (!data.session) {
        setReady(true);
        return;
      }
      uidRef.current = data.session.user.id;
      const { data: prof } = await supabase!.from("profiles").select("username").eq("user_id", uidRef.current).maybeSingle();
      nameRef.current = prof?.username || "unbekannt";
      await loadAll();
      if (channel) return;
      channel = supabase!
        .channel("sv-topics")
        .on("postgres_changes", { event: "*", schema: "public", table: "topics" }, () => void loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_items" }, () => void loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_members" }, () => void loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_tags" }, () => void loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "tag_members" }, () => void loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_votes" }, () => void loadAll())
        .subscribe();
    };
    void start();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTopics([]); setItems([]); setMembersState({}); setTopicTagsState({}); setMyVotes({}); setReads({});
        if (channel) { supabase!.removeChannel(channel); channel = null; }
        void start();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
      if (channel) supabase!.removeChannel(channel);
    };
  }, [loadAll]);

  // ---------- Aktionen ----------
  const createTopic: TopicsValue["createTopic"] = useCallback(async (nt) => {
    const id = uuid();
    const topic: Topic = {
      id, title: nt.title.trim(), tag: nt.tag.trim(), pinned: false, admin_only: false,
      visibility: nt.visibility, parent_id: nt.parentId ?? null, created_by: uidRef.current, created_at: new Date().toISOString(),
    };
    if (!hasSupabase) {
      setTopics((p) => [topic, ...p]);
      if (nt.memberIds.length) setMembersState((m) => ({ ...m, [id]: nt.memberIds }));
      if (nt.komiteeSlugs.length) setTopicTagsState((m) => ({ ...m, [id]: nt.komiteeSlugs }));
      return;
    }
    const { error } = await supabase!.from("topics").insert({
      id, title: topic.title, tag: topic.tag, visibility: nt.visibility, parent_id: topic.parent_id, created_by: uidRef.current,
    });
    if (error) { alert("Ordner anlegen fehlgeschlagen: " + error.message); return; }
    if (nt.memberIds.length)
      await supabase!.from("topic_members").insert(nt.memberIds.map((user_id) => ({ topic_id: id, user_id })));
    if (nt.komiteeSlugs.length)
      await supabase!.from("topic_tags").insert(nt.komiteeSlugs.map((tag) => ({ topic_id: id, tag })));
    // Betroffene Komitee-Mitglieder benachrichtigen
    if (nt.komiteeSlugs.length) {
      const s = stateRef.current;
      const recip = [...new Set(nt.komiteeSlugs.flatMap((slug) => s.tagMembers[slug] || []))].filter((u) => u !== uidRef.current);
      if (recip.length) void pushToUsers(recip, "Neuer Ordner für dich", `„${topic.title}" wurde für dein Komitee freigegeben.`);
    }
    await loadAll();
  }, [loadAll]);

  const updateTopic: TopicsValue["updateTopic"] = useCallback(async (id, patch) => {
    setTopics((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (hasSupabase) await supabase!.from("topics").update(patch).eq("id", id);
  }, []);

  const deleteTopic: TopicsValue["deleteTopic"] = useCallback(async (id) => {
    setTopics((p) => p.filter((t) => t.id !== id));
    setItems((p) => p.filter((i) => i.topic_id !== id));
    if (hasSupabase) await supabase!.from("topics").delete().eq("id", id);
  }, []);

  const setMembers: TopicsValue["setMembers"] = useCallback(async (topicId, topicTitle, userIds) => {
    const before = stateRef.current.members[topicId] || [];
    const added = userIds.filter((u) => !before.includes(u));
    setMembersState((p) => ({ ...p, [topicId]: userIds }));
    if (hasSupabase) {
      await supabase!.from("topic_members").delete().eq("topic_id", topicId);
      if (userIds.length)
        await supabase!.from("topic_members").insert(userIds.map((user_id) => ({ topic_id: topicId, user_id })));
      if (added.length)
        void pushToUsers(added, "Neues Thema für dich", `Du wurdest zu „${topicTitle}" hinzugefügt.`);
    }
  }, []);

  const setTagMembers: TopicsValue["setTagMembers"] = useCallback(async (tag, userIds) => {
    const before = stateRef.current.tagMembers[tag] || [];
    const added = userIds.filter((u) => !before.includes(u));
    setTagMembersState((p) => ({ ...p, [tag]: userIds }));
    if (hasSupabase) {
      await supabase!.from("tag_members").delete().eq("tag", tag);
      if (userIds.length)
        await supabase!.from("tag_members").insert(userIds.map((user_id) => ({ tag, user_id })));
      if (added.length)
        void pushToUsers(added, `Komitee #${tag}`, "Du wurdest zum Komitee hinzugefügt – schau in die Übersicht!");
    }
  }, []);

  const setUserCommittee: TopicsValue["setUserCommittee"] = useCallback(async (userId, slug, on) => {
    setTagMembersState((p) => {
      const cur = new Set(p[slug] || []);
      on ? cur.add(userId) : cur.delete(userId);
      return { ...p, [slug]: [...cur] };
    });
    if (hasSupabase) {
      if (on) {
        await supabase!.from("tag_members").upsert({ tag: slug, user_id: userId });
        void pushToUsers([userId], `Komitee`, "Du wurdest einem Komitee hinzugefügt – schau in die Übersicht!");
      } else {
        await supabase!.from("tag_members").delete().eq("tag", slug).eq("user_id", userId);
      }
    }
  }, []);

  const committeesOf = useCallback(
    (userId: string) =>
      Object.entries(stateRef.current.tagMembers).filter(([, ids]) => ids.includes(userId)).map(([slug]) => slug),
    [tagMembers],
  );

  const postItem: TopicsValue["postItem"] = useCallback(async (topic, type, body, options, title = "") => {
    const item: TopicItem = {
      id: uuid(), topic_id: topic.id, type, title: title.trim(), body: body.trim(),
      options: type === "umfrage" ? (options || []).filter(Boolean).map((label) => ({ id: uuid(), label })) : null,
      done: false, pinned: false, author: nameRef.current, created_by: uidRef.current, created_at: new Date().toISOString(),
    };
    if (!hasSupabase) { setItems((p) => [...p, item]); return; }
    const { error } = await supabase!.from("topic_items").insert({
      id: item.id, topic_id: item.topic_id, type: item.type, title: item.title, body: item.body,
      options: item.options, author: item.author, created_by: uidRef.current,
    });
    if (error) { alert("Senden fehlgeschlagen: " + error.message); return; }
    // Empfänger: Ordner-Mitglieder + Komitee-Mitglieder (Tag), ohne Autor
    const s = stateRef.current;
    const komSlugs = [...(s.topicTags[topic.id] || []), ...(topic.tag ? [topic.tag] : [])];
    const komRecipients = komSlugs.flatMap((slug) => s.tagMembers[slug] || []);
    const recipients = [...new Set([...(s.members[topic.id] || []), ...komRecipients])]
      .filter((u) => u !== uidRef.current);
    void pushToUsers(recipients, `Neues in „${topic.title}"`, (item.title ? item.title + ": " : "") + body.slice(0, 100));
    await loadAll();
  }, [loadAll]);

  const updateItem: TopicsValue["updateItem"] = useCallback(async (id, patch) => {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    if (hasSupabase) await supabase!.from("topic_items").update(patch).eq("id", id);
  }, []);

  const deleteItem: TopicsValue["deleteItem"] = useCallback(async (id) => {
    setItems((p) => p.filter((i) => i.id !== id));
    if (hasSupabase) await supabase!.from("topic_items").delete().eq("id", id);
  }, []);

  const vote: TopicsValue["vote"] = useCallback(async (itemId, optionId) => {
    const had = (stateRef.current.myVotes[itemId] || []).includes(optionId);
    if (!hasSupabase) {
      setMyVotes((p) => ({ ...p, [itemId]: had ? [] : [optionId] }));
      return;
    }
    await supabase!.from("topic_votes").delete().eq("item_id", itemId).eq("user_id", uidRef.current);
    if (!had) await supabase!.from("topic_votes").insert({ item_id: itemId, option_id: optionId, user_id: uidRef.current });
    await loadAll();
  }, [loadAll]);

  const markRead: TopicsValue["markRead"] = useCallback((topicId) => {
    const now = new Date().toISOString();
    setReads((p) => ({ ...p, [topicId]: now }));
    if (hasSupabase)
      void supabase!.from("topic_reads").upsert({ topic_id: topicId, user_id: uidRef.current, last_read: now });
  }, []);

  const unreadCount: TopicsValue["unreadCount"] = useCallback(
    (topicId) => {
      const last = stateRef.current.reads[topicId] || "1970-01-01";
      return stateRef.current.items.filter(
        (i) => i.topic_id === topicId && i.created_at > last && i.created_by !== uidRef.current,
      ).length;
    },
    // items/reads über stateRef aktuell
    [items, reads],
  );

  const value: TopicsValue = {
    topics, items, members, topicTags, tagMembers, myVotes, voteCounts, reads, uid: uidRef.current, ready,
    createTopic, updateTopic, deleteTopic, setMembers, setTagMembers, setUserCommittee, committeesOf, postItem, updateItem, deleteItem, vote, markRead, unreadCount,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
