import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { pushToUsers, sendePush } from "./lib/push";
import { lesbarerName } from "./lib/profil";
import { abonniere } from "./lib/realtime";
import { committeeIcon, committeeLabel } from "./lib/committees";

import { meldeFehler } from "./lib/melder";
/** Pop-up zu einer Chat-Nachricht. Wer es bekommt, entscheidet der Server. */
async function chatPush(itemId: string, angepinnt = false): Promise<void> {
  await sendePush({ chat_item_id: itemId, angepinnt });
}

/** "system": Zeile ohne Absender, z. B. „… wurde gesperrt“ – schreibt nur der Server. */
export type TopicItemType = "nachricht" | "todo" | "umfrage" | "system";

export type Visibility = "privat" | "personen" | "stufenteam" | "komitee" | "custom";
export type TopicKind = "ordner" | "chat" | "ticket";

export interface Topic {
  id: string;
  title: string;
  /** "ordner" = Planungs-Ordner (wie bisher), "chat" = Komitee-/Team-Chat, "ticket" = Frage ans Stufenteam */
  kind: TopicKind;
  /** nur für Tickets: "offen" | "erledigt" */
  status: string;
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
  kind?: TopicKind;
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
  /** Umfrage-Einstellungen */
  poll_multi?: boolean;
  poll_anon?: boolean;
  poll_deadline?: string | null;
  author: string;
  author_role: string | null; // Rolle des Autors beim Schreiben (schueler/stufenteam/kassenwart/admin)
  author_koms: string[] | null; // relevante Komitees des Autors (Slugs)
  created_by: string | null;
  created_at: string;
  /**
   * Nur im Browser gesetzt, steht in keiner Tabelle: die Nachricht konnte nicht
   * gespeichert werden. Vorher wurde sie dann einfach wieder entfernt und der
   * Grund gemeldet – ging der Hinweis unter, war die Nachricht kommentarlos weg.
   */
  nicht_gesendet?: string;
}

const LS = "sv-beitraege:topics";

/** Reaktionen, die es gibt – dieselbe Liste prüft die Datenbank. */
export const REAKTIONEN = ["👍", "👎", "🔥", "😢", "😂", "❓"] as const;
export type Reaktion = (typeof REAKTIONEN)[number];

/**
 * Gehört ein Eintrag in die Übersicht (Angepinntes, Abstimmungen, To-dos)
 * oder in den Chat? Beide haben einen eigenen roten Punkt und eine eigene
 * Gelesen-Marke.
 */
export const istUebersichtItem = (i: Pick<TopicItem, "type" | "pinned">) =>
  i.type === "todo" || i.type === "umfrage" || (i.type === "nachricht" && i.pinned);

export type LeseBereich = "chat" | "uebersicht";

/** Alte Zeilen ohne kind/status auffüllen, damit die Anzeige nicht bricht. */
const normTopic = (t: any): Topic => ({ ...t, kind: (t?.kind as Topic["kind"]) || "ordner", status: t?.status || "offen" });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

interface TopicsValue {
  topics: Topic[];
  items: TopicItem[];
  members: Record<string, string[]>; // topicId -> userIds
  topicTags: Record<string, string[]>; // topicId -> Komitee-Slugs (Sichtbarkeit)
  tagMembers: Record<string, string[]>; // tag -> userIds (Komitee)
  myVotes: Record<string, string[]>; // itemId -> optionIds
  voteCounts: Record<string, Record<string, number>>;
  /** Rohe Stimmen je Beitrag – für nicht-anonyme Abstimmungen (nur sichtbar, wer Profile sieht). */
  voters: Record<string, { user_id: string; option_id: string }[]>;
  reads: Record<string, string>; // topicId -> last_read ISO
  /** topicId -> zuletzt gelesen in der Übersicht (Angepinntes, Abstimmungen, To-dos) */
  readsUebersicht: Record<string, string>;
  /** itemId -> Reaktionen */
  reaktionen: Record<string, { user_id: string; emoji: string }[]>;
  /** Eigene Reaktion setzen (null = zurücknehmen). */
  reagieren: (itemId: string, emoji: Reaktion | null) => Promise<void>;
  uid: string;
  ready: boolean;
  createTopic: (t: NewTopic) => Promise<string | null>;
  updateTopic: (id: string, patch: Partial<Pick<Topic, "title" | "tag" | "pinned" | "admin_only" | "visibility" | "status">>) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
  setMembers: (topicId: string, topicTitle: string, userIds: string[]) => Promise<void>;
  setTagMembers: (tag: string, userIds: string[]) => Promise<void>;
  setUserCommittee: (userId: string, slug: string, on: boolean) => Promise<void>;
  selfAssignCommittee: (slug: string) => Promise<boolean>;
  committeesOf: (userId: string) => string[];
  postItem: (topic: Topic, type: TopicItemType, body: string, options?: string[], title?: string, meta?: { role?: string | null; koms?: string[]; pinned?: boolean; poll?: { multi?: boolean; anon?: boolean; deadline?: string | null } }) => Promise<void>;
  updateItem: (id: string, patch: Partial<Pick<TopicItem, "done" | "pinned">>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  vote: (itemId: string, optionId: string, multi?: boolean) => Promise<void>;
  /** Als gelesen markieren – Chat und Übersicht getrennt (ohne Angabe: beides). */
  markRead: (topicId: string, bereich?: LeseBereich) => void;
  /** Ungelesene fremde Einträge – nur Chat, nur Übersicht oder (ohne Angabe) beides. */
  unreadCount: (topicId: string, bereich?: LeseBereich) => number;
}

const Ctx = createContext<TopicsValue | null>(null);
/**
 * Wie useTopics, gibt aber null zurueck statt zu meckern, wenn es den
 * Speicher gar nicht gibt. Die Elternansicht laedt keine Chats, deshalb
 * braucht es diesen Weg fuer Bauteile, die beide Ansichten teilen.
 */
export const useTopicsOptional = () => useContext(Ctx);

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
  const [voters, setVoters] = useState<Record<string, { user_id: string; option_id: string }[]>>({});
  const [reads, setReads] = useState<Record<string, string>>({});
  const [readsUebersicht, setReadsUebersicht] = useState<Record<string, string>>({});
  const [reaktionen, setReaktionen] = useState<Record<string, { user_id: string; emoji: string }[]>>({});
  const [ready, setReady] = useState(!hasSupabase);
  const uidRef = useRef("local-user");
  const nameRef = useRef("du");
  const stateRef = useRef({ topics, items, members, topicTags, tagMembers, myVotes, reads, readsUebersicht });
  stateRef.current = { topics, items, members, topicTags, tagMembers, myVotes, reads, readsUebersicht };
  // Realtime feuert oft mehrfach hintereinander – Nachladen bündeln statt
  // für jedes Ereignis sieben Abfragen zu starten.
  const nachladeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setTopics((d.topics || []).map(normTopic));
      setItems(d.items || []);
      setMembersState(d.members || {});
      setTopicTagsState(d.topicTags || {});
      setTagMembersState(d.tagMembers || {});
      setMyVotes(d.myVotes || {});
      setReads(d.reads || {});
      setReadsUebersicht(d.readsUebersicht || {});
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!hasSupabase) {
      const counts: Record<string, Record<string, number>> = {};
      const roh: Record<string, { user_id: string; option_id: string }[]> = {};
      for (const [iid, opts] of Object.entries(myVotes)) {
        counts[iid] = {};
        for (const o of opts) {
          counts[iid][o] = 1;
          (roh[iid] ||= []).push({ user_id: uidRef.current, option_id: o });
        }
      }
      setVoteCounts(counts);
      setVoters(roh);
      saveLocal();
    }
  }, [myVotes, topics, items, members, topicTags, reads, readsUebersicht, saveLocal]);

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
    setTopics(((t as any[]) || []).map(normTopic));
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
    const roh: Record<string, { user_id: string; option_id: string }[]> = {};
    // Zahlen vom Server ohne Namen – anonyme Stimmen anderer sind per RLS unsichtbar.
    const umfragen = ((it as TopicItem[]) || [])
      .filter((x) => Array.isArray(x.options) && x.options.length > 0)
      .map((x) => x.id);
    const { data: zahl } = umfragen.length
      ? await supabase!.rpc("stimmen_topics", { p_ids: umfragen })
      : { data: [] as { item_id: string; option_id: string; n: number }[] };
    for (const z of (zahl as { item_id: string; option_id: string; n: number }[] | null) || []) {
      (counts[z.item_id] ||= {})[z.option_id] = z.n;
    }
    for (const row of v || []) {
      if (!zahl) {
        counts[row.item_id] ||= {};
        counts[row.item_id][row.option_id] = (counts[row.item_id][row.option_id] || 0) + 1;
      }
      (roh[row.item_id] ||= []).push({ user_id: row.user_id, option_id: row.option_id });
      if (row.user_id === uidRef.current) (mine[row.item_id] ||= []).push(row.option_id);
    }
    setMyVotes(mine);
    setVoteCounts(counts);
    setVoters(roh);
    const rr: Record<string, string> = {};
    const ru: Record<string, string> = {};
    for (const row of r || []) {
      if (row.user_id !== uidRef.current) continue;
      rr[row.topic_id] = row.last_read;
      // Ohne eigene Übersicht-Marke galt bisher: beim Öffnen alles gelesen
      ru[row.topic_id] = row.last_read_uebersicht || row.last_read;
    }
    setReads(rr);
    setReadsUebersicht(ru);
    // Reaktionen: eigene Abfrage, damit ein Fehler (z. B. Tabelle fehlt noch)
    // den Rest nicht aufhält
    const { data: re, error: reFehler } = await supabase!.from("topic_reaktionen").select("item_id, user_id, emoji");
    if (!reFehler) {
      const rk: Record<string, { user_id: string; emoji: string }[]> = {};
      for (const row of (re as { item_id: string; user_id: string; emoji: string }[]) || [])
        (rk[row.item_id] ||= []).push({ user_id: row.user_id, emoji: row.emoji });
      setReaktionen(rk);
    }
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
    let abmelden: (() => void) | null = null;
    const start = async () => {
      const { data } = await supabase!.auth.getSession();
      if (!data.session) {
        setReady(true);
        return;
      }
      uidRef.current = data.session.user.id;
      const { data: prof } = await supabase!
        .from("profiles")
        .select("username, student_id")
        .eq("user_id", uidRef.current)
        .maybeSingle();
      // Anzeigename: "Vorname Nachname" (die eigene Zeile darf jeder lesen)
      nameRef.current = lesbarerName(prof?.username || "") || "unbekannt";
      if (prof?.student_id) {
        const { data: st } = await supabase!
          .from("students")
          .select("vorname, nachname")
          .eq("id", prof.student_id)
          .maybeSingle();
        if (st) nameRef.current = `${st.vorname ?? ""} ${st.nachname ?? ""}`.trim() || nameRef.current;
      }
      await loadAll();
      // Der Kanal entsteht erst nach mehreren awaits. Ohne diese Prüfung wird er
      // auch dann noch angelegt, wenn die Ansicht längst weg ist – die
      // Aufräumfunktion hat ihn dann nie gesehen (StrictMode: alles doppelt).
      if (!alive || abmelden) return;
      abmelden = abonniere({
        name: "sv-topics",
        nachholen: planeNachladen,
        aufbauen: (kanal) =>
          kanal
        .on("postgres_changes", { event: "*", schema: "public", table: "topics" }, planeNachladen)
        // Chat-Nachrichten kommen einzeln an und werden einzeln eingefügt –
        // das ist der Unterschied zwischen "sofort da" und "lädt kurz".
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_items" }, (p) => {
          if (p.eventType === "DELETE") {
            const alt = p.old as { id?: string };
            if (alt?.id) setItems((prev) => prev.filter((i) => i.id !== alt.id));
            return;
          }
          const row = p.new as TopicItem;
          if (!row?.id) return;
          setItems((prev) => {
            const i = prev.findIndex((x) => x.id === row.id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = { ...next[i], ...row };
            return next;
          });
        })
        // Reaktionen einzeln einarbeiten – kein Nachladen der ganzen Chats
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_reaktionen" }, (p) => {
          const alt = p.old as { item_id?: string; user_id?: string };
          const neu = p.new as { item_id?: string; user_id?: string; emoji?: string };
          setReaktionen((prev) => {
            const next = { ...prev };
            if (alt?.item_id && alt.user_id)
              next[alt.item_id] = (next[alt.item_id] || []).filter((x) => x.user_id !== alt.user_id);
            if (p.eventType !== "DELETE" && neu?.item_id && neu.user_id && neu.emoji)
              next[neu.item_id] = [
                ...(next[neu.item_id] || []).filter((x) => x.user_id !== neu.user_id),
                { user_id: neu.user_id, emoji: neu.emoji },
              ];
            return next;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_members" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_tags" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "tag_members" }, planeNachladen)
        // Die eigene Stimme ist im Bildschirm schon gesetzt, bevor sie beim Server
        // ankommt. Wuerde man auf das eigene Echo hin alles neu laden, ruckelt die
        // ganze Seite bei jedem Kreuz. Fremde Stimmen laden weiterhin nach.
        .on("postgres_changes", { event: "*", schema: "public", table: "topic_votes" }, (p) => {
          const wer = ((p.eventType === "DELETE" ? p.old : p.new) as { user_id?: string })?.user_id;
          if (wer && wer === uidRef.current) return;
          planeNachladen();
        }),
      });
    };
    void start();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTopics([]); setItems([]); setMembersState({}); setTopicTagsState({}); setMyVotes({}); setReads({});
        setReadsUebersicht({}); setReaktionen({});
        abmelden?.();
        abmelden = null;
        void start();
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (nachladeTimer.current) clearTimeout(nachladeTimer.current);
      abmelden?.();
    };
  }, [loadAll, planeNachladen]);

  // ---------- Aktionen ----------
  const createTopic: TopicsValue["createTopic"] = useCallback(async (nt) => {
    const id = uuid();
    const topic: Topic = {
      id, title: nt.title.trim(), tag: nt.tag.trim(), pinned: false, admin_only: false,
      kind: nt.kind ?? "ordner", status: "offen",
      visibility: nt.visibility, parent_id: nt.parentId ?? null, created_by: uidRef.current, created_at: new Date().toISOString(),
    };
    if (!hasSupabase) {
      setTopics((p) => [topic, ...p]);
      if (nt.memberIds.length) setMembersState((m) => ({ ...m, [id]: nt.memberIds }));
      if (nt.komiteeSlugs.length) setTopicTagsState((m) => ({ ...m, [id]: nt.komiteeSlugs }));
      return id;
    }
    const { error } = await supabase!.from("topics").insert({
      id, title: topic.title, tag: topic.tag, kind: topic.kind, visibility: nt.visibility,
      parent_id: topic.parent_id, created_by: uidRef.current,
    });
    if (error) { meldeFehler((topic.kind === "ticket" ? "Frage senden" : "Ordner anlegen") + " fehlgeschlagen: " + error.message); return null; }
    if (nt.memberIds.length)
      await supabase!.from("topic_members").insert(nt.memberIds.map((user_id) => ({ topic_id: id, user_id })));
    if (nt.komiteeSlugs.length)
      await supabase!.from("topic_tags").insert(nt.komiteeSlugs.map((tag) => ({ topic_id: id, tag })));
    // Betroffene Komitee-Mitglieder benachrichtigen
    if (nt.komiteeSlugs.length) {
      const s = stateRef.current;
      const recip = [...new Set(nt.komiteeSlugs.flatMap((slug) => s.tagMembers[slug] || []))].filter((u) => u !== uidRef.current);
      if (recip.length) void pushToUsers(recip, "Neuer Ordner für dich", `„${topic.title}" wurde für dein Komitee freigegeben.`, "./#chats");
    }
    await loadAll();
    return id;
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
        void pushToUsers(added, "Neues Thema für dich", `Du wurdest zu „${topicTitle}" hinzugefügt.`, "./#chats");
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
        void pushToUsers(added, `${committeeIcon(tag)} Komitee ${committeeLabel(tag)}`, "Du bist jetzt dabei – schau in die Übersicht!", "./#chats");
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
        void pushToUsers([userId], `${committeeIcon(slug)} Komitee ${committeeLabel(slug)}`, "Das Stufenteam hat dich hinzugefügt – schau in die Übersicht!", "./#chats");
      } else {
        await supabase!.from("tag_members").delete().eq("tag", slug).eq("user_id", userId);
      }
    }
  }, []);

  // Selbstzuweisung genau einmal: nur erlaubt, solange man in KEINEM Komitee ist.
  const selfAssignCommittee: TopicsValue["selfAssignCommittee"] = useCallback(async (slug) => {
    const uid = uidRef.current;
    if ((stateRef.current.tagMembers && Object.values(stateRef.current.tagMembers).some((ids) => ids.includes(uid)))) return false;
    setTagMembersState((p) => {
      const cur = new Set(p[slug] || []);
      cur.add(uid);
      return { ...p, [slug]: [...cur] };
    });
    if (hasSupabase) {
      const { error } = await supabase!.from("tag_members").insert({ tag: slug, user_id: uid });
      if (error) { meldeFehler("Komitee setzen fehlgeschlagen: " + error.message); return false; }
    }
    return true;
  }, []);

  const committeesOf = useCallback(
    (userId: string) =>
      Object.entries(stateRef.current.tagMembers).filter(([, ids]) => ids.includes(userId)).map(([slug]) => slug),
    [tagMembers],
  );

  const postItem: TopicsValue["postItem"] = useCallback(async (topic, type, body, options, title = "", meta) => {
    const item: TopicItem = {
      id: uuid(), topic_id: topic.id, type, title: title.trim(), body: body.trim(),
      options: type === "umfrage" ? (options || []).filter(Boolean).map((label) => ({ id: uuid(), label })) : null,
      done: false, pinned: Boolean(meta?.pinned), author: nameRef.current,
      poll_multi: Boolean(meta?.poll?.multi), poll_anon: Boolean(meta?.poll?.anon),
      poll_deadline: meta?.poll?.deadline ?? null,
      author_role: meta?.role ?? null, author_koms: meta?.koms?.length ? meta.koms : null,
      created_by: uidRef.current, created_at: new Date().toISOString(),
    };
    // Sofort anzeigen – die Nachricht steht da, bevor der Server geantwortet hat.
    setItems((p) => [...p, item]);
    if (!hasSupabase) return;
    const { error } = await supabase!.from("topic_items").insert({
      id: item.id, topic_id: item.topic_id, type: item.type, title: item.title, body: item.body,
      options: item.options, pinned: item.pinned, author: item.author,
      poll_multi: item.poll_multi, poll_anon: item.poll_anon, poll_deadline: item.poll_deadline,
      author_role: item.author_role, author_koms: item.author_koms, created_by: uidRef.current,
    });
    if (error) {
      // Stehen lassen und markieren statt löschen: so sieht man, dass etwas
      // geschrieben wurde und dass es nicht angekommen ist.
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, nicht_gesendet: error.message } : i)));
      meldeFehler("Die Nachricht ging nicht raus: " + error.message);
      return;
    }
    // Empfänger rechnet der Server aus (send-push, chat_item_id). Im Browser
    // sieht ein Schüler nur seine eigene Komitee-Zeile – vorher landeten
    // Chat-Pop-ups deshalb nur bei den Nachrichten des Teams.
    void chatPush(item.id);
  }, []);

  const updateItem: TopicsValue["updateItem"] = useCallback(async (id, patch) => {
    setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    if (!hasSupabase) return;
    const { error } = await supabase!.from("topic_items").update(patch).eq("id", id);
    // Frisch angepinnt: alle Bescheid geben – auch wer Chat-Meldungen aus hat.
    if (!error && patch.pinned === true) void chatPush(id, true);
  }, []);

  const deleteItem: TopicsValue["deleteItem"] = useCallback(async (id) => {
    setItems((p) => p.filter((i) => i.id !== id));
    if (hasSupabase) await supabase!.from("topic_items").delete().eq("id", id);
  }, []);

  const vote: TopicsValue["vote"] = useCallback(async (itemId, optionId, multi = false) => {
    const bisher = stateRef.current.myVotes[itemId] || [];
    const had = bisher.includes(optionId);
    if (!hasSupabase) {
      setMyVotes((p) => ({
        ...p,
        [itemId]: multi
          ? had ? bisher.filter((x) => x !== optionId) : [...bisher, optionId]
          : had ? [] : [optionId],
      }));
      return;
    }
    // Kreuz sofort setzen, damit der Knopf nicht erst nach dem Server reagiert
    const neueWahl = multi
      ? had ? bisher.filter((x) => x !== optionId) : [...bisher, optionId]
      : had ? [] : [optionId];
    setMyVotes((p) => ({ ...p, [itemId]: neueWahl }));
    setVoteCounts((c) => {
      const alt2 = { ...(c[itemId] || {}) };
      for (const o of bisher) alt2[o] = Math.max(0, (alt2[o] || 0) - 1);
      for (const o of neueWahl) alt2[o] = (alt2[o] || 0) + 1;
      return { ...c, [itemId]: alt2 };
    });
    setVoters((v) => {
      const ohneMich = (v[itemId] || []).filter((x) => x.user_id !== uidRef.current);
      return { ...v, [itemId]: [...ohneMich, ...neueWahl.map((option_id) => ({ user_id: uidRef.current, option_id }))] };
    });
    let schiefgegangen: string | null = null;
    if (multi) {
      // Mehrfachwahl: nur diese eine Option umschalten
      const { error } = had
        ? await supabase!.from("topic_votes").delete()
            .eq("item_id", itemId).eq("user_id", uidRef.current).eq("option_id", optionId)
        : await supabase!.from("topic_votes")
            .insert({ item_id: itemId, option_id: optionId, user_id: uidRef.current });
      if (error) schiefgegangen = error.message;
    } else {
      const weg = await supabase!.from("topic_votes").delete().eq("item_id", itemId).eq("user_id", uidRef.current);
      if (weg.error) schiefgegangen = weg.error.message;
      if (!had && !schiefgegangen) {
        const neu2 = await supabase!.from("topic_votes")
          .insert({ item_id: itemId, option_id: optionId, user_id: uidRef.current });
        if (neu2.error) schiefgegangen = neu2.error.message;
      }
    }
    // Der Bildschirm zeigt das Ergebnis schon. Nur wenn beim Server etwas
    // schieflief, holen wir den echten Stand zurueck – sonst wuerde jedes Kreuz
    // die ganze Seite neu laden lassen.
    if (schiefgegangen) {
      console.error("[Abstimmung]", schiefgegangen);
      planeNachladen();
    }
  }, [planeNachladen]);

  const markRead: TopicsValue["markRead"] = useCallback((topicId, bereich) => {
    // Die Gerätezeit kann nachgehen – dann blieben gerade gelesene Nachrichten
    // (Serverzeit) „ungelesen“. Darum lokal mindestens bis zur jüngsten
    // Nachricht, gespeichert wird mit der Uhr des Servers (chat_gelesen).
    const jungste = stateRef.current.items
      .filter((i) => i.topic_id === topicId)
      .reduce((m, i) => (i.created_at > m ? i.created_at : m), "");
    const jetzt = new Date().toISOString();
    const marke = jungste > jetzt ? jungste : jetzt;
    const bereiche: LeseBereich[] = bereich ? [bereich] : ["chat", "uebersicht"];
    for (const b of bereiche) {
      (b === "chat" ? setReads : setReadsUebersicht)((p) => ({ ...p, [topicId]: marke }));
      if (hasSupabase)
        void supabase!.rpc("chat_gelesen", { p_topic: topicId, p_bereich: b }).then(({ error }) => {
          if (error) console.warn("[gelesen]", error.message);
        });
    }
  }, []);

  const unreadCount: TopicsValue["unreadCount"] = useCallback(
    (topicId, bereich) => {
      const st = stateRef.current;
      const lastChat = st.reads[topicId] || "1970-01-01";
      // Ältere Lese-Marken ohne Übersicht-Wert sind schon in loadAll mit
      // last_read aufgefüllt – hier darf nicht auf den Chat zurückgefallen
      // werden, sonst gilt die Übersicht mit dem Chat als gelesen.
      const lastUeb = st.readsUebersicht[topicId] || "1970-01-01";
      const istTicket = st.topics.find((t) => t.id === topicId)?.kind === "ticket";
      let n = 0;
      for (const i of st.items) {
        if (i.topic_id !== topicId || i.created_by === uidRef.current) continue;
        // Gespräche mit dem Team haben keine Übersicht – alles ist Chat
        const ueb = !istTicket && istUebersichtItem(i);
        if (ueb ? bereich === "chat" : bereich === "uebersicht") continue;
        if (i.created_at > (ueb ? lastUeb : lastChat)) n++;
      }
      return n;
    },
    // items/reads über stateRef aktuell
    [items, reads, readsUebersicht, topics],
  );

  const reagieren: TopicsValue["reagieren"] = useCallback(async (itemId, emoji) => {
    const ich = uidRef.current;
    setReaktionen((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []).filter((x) => x.user_id !== ich), ...(emoji ? [{ user_id: ich, emoji }] : [])],
    }));
    if (!hasSupabase) return;
    const { error } = emoji
      ? await supabase!.from("topic_reaktionen").upsert({ item_id: itemId, user_id: ich, emoji })
      : await supabase!.from("topic_reaktionen").delete().eq("item_id", itemId).eq("user_id", ich);
    if (error) {
      meldeFehler("Reaktion ging nicht: " + error.message);
      planeNachladen();
    }
  }, [planeNachladen]);

  const value: TopicsValue = {
    topics, items, members, topicTags, tagMembers, myVotes, voteCounts, voters, reads, readsUebersicht, reaktionen, reagieren,
    uid: uidRef.current, ready,
    createTopic, updateTopic, deleteTopic, setMembers, setTagMembers, setUserCommittee, selfAssignCommittee, committeesOf, postItem, updateItem, deleteItem, vote, markRead, unreadCount,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
