import { useMemo, useState } from "react";
import { useTopics, type NewTopic, type Topic, type TopicItem, type TopicItemType, type Visibility } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";
import { normalize } from "../lib/logic";
import { COMMITTEES, committeeLabel } from "../lib/committees";

const PERMANENT_UNTIL = "2099-12-31T00:00:00.000Z";

const VIS_LABEL: Record<Visibility, string> = {
  privat: "Nur ich",
  stufenteam: "Stufenteam",
  personen: "Bestimmte Personen",
  komitee: "Komitee",
  custom: "Ausgewählte Personen / Komitees",
};

export function TopicsTab() {
  const { topics, ready, unreadCount } = useTopics();
  const { canEditData } = useRole();
  const [stack, setStack] = useState<string[]>([]);
  const [createParent, setCreateParent] = useState<{ parentId: string | null; tag: string } | null>(null);

  const current = stack.length ? topics.find((t) => t.id === stack[stack.length - 1]) ?? null : null;

  if (!ready)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Übersicht wird geladen …</div>
      </div>
    );

  // ---- volle Ordner-Seite ----
  if (current) {
    return (
      <>
        <FolderPage
          topic={current}
          onOpen={(id) => setStack((s) => [...s, id])}
          onBack={() => setStack((s) => s.slice(0, -1))}
          onCreateSub={() => setCreateParent({ parentId: current.id, tag: current.tag })}
          onDeleted={() => setStack((s) => s.slice(0, -1))}
        />
        {createParent && <CreateFolderSheet init={createParent} onClose={() => setCreateParent(null)} />}
      </>
    );
  }

  // ---- Wurzel-Liste ----
  const roots = topics.filter((t) => !t.parent_id);
  const unreadDeep = (id: string): number =>
    unreadCount(id) + topics.filter((t) => t.parent_id === id).reduce((s, t) => s + unreadDeep(t.id), 0);

  const pinned = roots.filter((t) => t.pinned);
  const rest = roots.filter((t) => !t.pinned);
  const byTag = new Map<string, Topic[]>();
  for (const t of rest) byTag.set(t.tag || "", [...(byTag.get(t.tag || "") || []), t]);
  const tags = [...byTag.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : committeeLabel(a).localeCompare(committeeLabel(b), "de")));

  const card = (t: Topic) => (
    <FolderCard key={t.id} t={t} unread={unreadDeep(t.id)} subCount={topics.filter((x) => x.parent_id === t.id).length} onOpen={() => setStack([t.id])} />
  );

  return (
    <div className="space-y-4">
      {roots.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-400">
          Noch keine Ordner. {canEditData ? "Lege mit ＋ den ersten an." : ""}
        </div>
      )}
      {pinned.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">📌 Angeheftet</h3>
          <div className="grid gap-2.5 lg:grid-cols-2">{pinned.map(card)}</div>
        </section>
      )}
      {tags.map((tg) => (
        <section key={tg || "_"}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{tg ? committeeLabel(tg) : "Allgemein"}</h3>
          <div className="grid gap-2.5 lg:grid-cols-2">{byTag.get(tg)!.map(card)}</div>
        </section>
      ))}

      {canEditData && (
        <button
          onClick={() => setCreateParent({ parentId: null, tag: "" })}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Ordner erstellen"
        >
          ＋
        </button>
      )}
      {createParent && <CreateFolderSheet init={createParent} onClose={() => setCreateParent(null)} />}
    </div>
  );
}

function FolderCard({ t, unread, subCount, onOpen }: { t: Topic; unread: number; subCount: number; onOpen: () => void }) {
  const { items } = useTopics();
  const itemCount = items.filter((i) => i.topic_id === t.id).length;
  return (
    <button onClick={onOpen} className="card flex w-full items-center gap-3 p-4 text-left">
      <span className="text-2xl">📁</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {t.pinned && <span title="angeheftet">📌</span>}
          {t.admin_only && <span title="nur Admin">🔒</span>}
          {t.visibility === "privat" && !t.admin_only && <span title="nur ich">👤</span>}
          <span className="truncate text-[16px] font-semibold">{t.title}</span>
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          {subCount > 0 && <span className="mr-2">📁 {subCount}</span>}
          {itemCount > 0 && <span>{itemCount} Beitr{itemCount === 1 ? "ag" : "äge"}</span>}
        </div>
      </div>
      {unread > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      <span className="text-slate-300 dark:text-slate-600">›</span>
    </button>
  );
}

/* ================= Ordner erstellen ================= */

type VisMode = "privat" | "stufenteam" | "custom";

function CreateFolderSheet({ init, onClose }: { init: { parentId: string | null; tag: string }; onClose: () => void }) {
  const { createTopic, committeesOf, uid } = useTopics();
  const { profiles, role } = useRole();
  const myKoms = committeesOf(uid);
  // Kategorie automatisch = eigenes Komitee des Erstellers; Stufenteam/Kassenwart bekommen keine.
  const teamRole = role === "stufenteam" || role === "kassenwart";
  const tag = init.tag || (teamRole ? "" : myKoms[0] || "");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<VisMode>("privat");
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [koms, setKoms] = useState<Set<string>>(new Set());
  const [showPersons, setShowPersons] = useState(false);
  const [showKoms, setShowKoms] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const nothingPicked = mode === "custom" && members.size === 0 && koms.size === 0;

  const pickBase = (m: "privat" | "stufenteam") => {
    setMode(m);
    setMembers(new Set());
    setKoms(new Set());
    setShowPersons(false);
    setShowKoms(false);
  };

  async function submit() {
    if (!title.trim() || nothingPicked) return;
    const custom = mode === "custom";
    setBusy(true);
    const nt: NewTopic = {
      title,
      tag,
      visibility: custom ? "custom" : mode,
      memberIds: custom ? [...members] : [],
      komiteeSlugs: custom ? [...koms] : [],
      parentId: init.parentId,
    };
    await createTopic(nt);
    setBusy(false);
    onClose();
  }

  const btn = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`rounded-xl border py-2 text-sm font-bold transition ${
        active ? "border-brand bg-brand text-white" : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Sheet open onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">{init.parentId ? "Neuer Unterordner" : "Neuer Ordner"}</span>
        <button className="iconbtn" onClick={onClose}>✕</button>
      </div>
      <input className="field mb-1" placeholder="Titel (z. B. Sportfest)" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      {tag && <p className="mb-3 text-xs text-slate-400">Kategorie: <b>{committeeLabel(tag)}</b> (dein Komitee)</p>}
      {!tag && <div className="mb-3" />}

      <label className="mb-1 block text-sm font-semibold text-slate-500">Wer kann das sehen?</label>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {btn(mode === "privat", "Nur ich", () => pickBase("privat"))}
        {btn(mode === "stufenteam", "Stufenteam", () => pickBase("stufenteam"))}
        {btn(mode === "custom" && (showPersons || members.size > 0), "Bestimmte Personen", () => { setMode("custom"); setShowPersons((v) => !v); })}
        {btn(mode === "custom" && (showKoms || koms.size > 0), "Komitees", () => { setMode("custom"); setShowKoms((v) => !v); })}
      </div>
      <p className="mb-3 text-xs text-slate-400">
        {mode === "privat" && "Nur du (und der Admin) siehst diesen Ordner."}
        {mode === "stufenteam" && "Das ganze Stufenteam sieht & schreibt hier."}
        {mode === "custom" && "Wähle beliebig viele Personen und/oder Komitees – alle können sehen & schreiben."}
      </p>

      {mode === "custom" && showPersons && (
        <div className="mb-3 rounded-2xl border border-slate-200 p-2 dark:border-slate-700">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-500">Personen</span>
            <span className="ml-auto text-xs text-slate-400">{members.size} gewählt</span>
          </div>
          <input className="field mb-2" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-44 overflow-y-auto">
            {profiles.filter((p) => !q || normalize(p.username || "").includes(normalize(q))).map((p) => {
              const on = members.has(p.user_id);
              return (
                <button key={p.user_id} onClick={() => setMembers((s) => { const n = new Set(s); on ? n.delete(p.user_id) : n.add(p.user_id); return n; })}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>{on ? "✓" : ""}</span>
                  {p.username}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "custom" && showKoms && (
        <div className="mb-3 rounded-2xl border border-slate-200 p-2 dark:border-slate-700">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-500">Komitees</span>
            <span className="ml-auto text-xs text-slate-400">{koms.size} gewählt</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMITTEES.map((c) => {
              const on = koms.has(c.slug);
              return (
                <button key={c.slug} onClick={() => setKoms((s) => { const n = new Set(s); on ? n.delete(c.slug) : n.add(c.slug); return n; })}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${on ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                  {on ? "✓ " : ""}{c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn-primary" disabled={busy || !title.trim() || nothingPicked} onClick={submit}>
        {busy ? "…" : nothingPicked ? "Personen oder Komitees wählen" : "Erstellen"}
      </button>
    </Sheet>
  );
}

/* ================= Ordner-Seite (voll) ================= */

const TYPE_TABS: { t: TopicItemType; label: string }[] = [
  { t: "nachricht", label: "💬 Nachricht" },
  { t: "todo", label: "☑️ To-Do" },
  { t: "umfrage", label: "🗳️ Abstimmung" },
];

function FolderPage({
  topic, onOpen, onBack, onCreateSub, onDeleted,
}: {
  topic: Topic;
  onOpen: (id: string) => void;
  onBack: () => void;
  onCreateSub: () => void;
  onDeleted: () => void;
}) {
  const { topics, items, members, topicTags, uid, postItem, updateItem, deleteItem, updateTopic, deleteTopic, markRead, myVotes, voteCounts, vote, setMembers, committeesOf, unreadCount } = useTopics();
  const { role, canEditData, isAdmin, profiles, banned, bannedUntil } = useRole();
  const [type, setType] = useState<TopicItemType>("nachricht");
  const [itemTitle, setItemTitle] = useState("");
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [showMembers, setShowMembers] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [q, setQ] = useState("");

  const list = items.filter((i) => i.topic_id === topic.id);
  const pinnedItems = list.filter((i) => i.pinned);
  const stream = list.filter((i) => !i.pinned);
  const memberIds = members[topic.id] || [];
  const children = topics.filter((t) => t.parent_id === topic.id);

  // Komitees dieses Ordners (Sichtbarkeit + Kategorie) → für die Autoren-Markierung
  const folderKoms = new Set([...(topicTags[topic.id] || []), ...(topic.tag ? [topic.tag] : [])]);
  const myAll = committeesOf(uid);
  const myFolderKoms = folderKoms.size ? myAll.filter((s) => folderKoms.has(s)) : myAll;

  markReadOnce(topic.id, markRead);

  async function send() {
    if (!text.trim()) return;
    await postItem(topic, type, text, type === "umfrage" ? opts : undefined, itemTitle, { role, koms: myFolderKoms });
    setText(""); setItemTitle(""); setOpts(["", ""]); setType("nachricht");
    setComposerOpen(false);
  }

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="min-w-0 flex-1 truncate text-lg font-bold">{topic.title}</span>
        {canEditData && (
          <>
            {isAdmin && (
              <button className={`iconbtn ${topic.admin_only ? "iconbtn-active" : ""}`} title={topic.admin_only ? "nur Admin – freigeben" : "nur für Admin sichtbar"}
                onClick={() => updateTopic(topic.id, { admin_only: !topic.admin_only })}>{topic.admin_only ? "🔒" : "🔓"}</button>
            )}
            <button className="iconbtn" title={topic.pinned ? "Lösen" : "Anheften"} onClick={() => updateTopic(topic.id, { pinned: !topic.pinned })}>{topic.pinned ? "📌" : "📍"}</button>
            {(topic.visibility === "personen" || topic.visibility === "custom") && <button className="iconbtn" title="Personen verwalten" onClick={() => setShowMembers((v) => !v)}>👥</button>}
            <button className="iconbtn" title="Ordner löschen" onClick={() => { if (confirm("Ordner samt Inhalt löschen?")) { void deleteTopic(topic.id); onDeleted(); } }}>🗑</button>
          </>
        )}
      </div>

      <div className="text-xs text-slate-400">
        {topic.admin_only && <span className="mr-2 rounded-full bg-red-500/10 px-2 py-0.5 font-bold text-red-500">🔒 nur Admin</span>}
        {topic.tag && <span className="mr-2 rounded-full bg-brand/10 px-2 py-0.5 font-bold text-brand">{committeeLabel(topic.tag)}</span>}
        <span>Sichtbar: {VIS_LABEL[topic.visibility]}</span>
      </div>

      {showMembers && canEditData && (topic.visibility === "personen" || topic.visibility === "custom") && (
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-sm font-semibold text-slate-500">Wer darf rein?</div>
          <input className="field mb-2" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-44 overflow-y-auto">
            {profiles.filter((p) => !q || normalize(p.username || "").includes(normalize(q))).map((p) => {
              const on = memberIds.includes(p.user_id);
              return (
                <button key={p.user_id} onClick={() => setMembers(topic.id, topic.title, on ? memberIds.filter((x) => x !== p.user_id) : [...memberIds, p.user_id])}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                  <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>{on ? "✓" : ""}</span>
                  {p.username}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Unterordner */}
      {(children.length > 0 || canEditData) && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            📁 Unterordner
            {canEditData && <button onClick={onCreateSub} className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white" aria-label="Unterordner erstellen">＋</button>}
          </div>
          {children.length > 0 && (
            <div className="grid gap-2 lg:grid-cols-2">
              {children.map((c) => {
                const u = unreadCount(c.id);
                return (
                  <button key={c.id} onClick={() => onOpen(c.id)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold dark:border-slate-700">
                    📁 <span className="flex-1 truncate">{c.title}</span>
                    {u > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{u}</span>}
                    <span className="text-slate-300 dark:text-slate-600">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Key-Infos */}
      {pinnedItems.length > 0 && (
        <div className="rounded-2xl border-2 border-brand/30 bg-brand/5 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand">📌 Key-Infos</div>
          <div className="space-y-2">
            {pinnedItems.map((i) => <ItemRow key={i.id} i={i} uid={uid} canEditData={canEditData} myVotes={myVotes} voteCounts={voteCounts} onVote={vote} onUpdate={updateItem} onDelete={deleteItem} />)}
          </div>
        </div>
      )}

      {/* Stream */}
      <div className="space-y-2">
        {stream.length === 0 && pinnedItems.length === 0 && children.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">Noch nichts hier – schreib den ersten Beitrag oder leg einen Unterordner an.</div>
        )}
        {stream.map((i) => <ItemRow key={i.id} i={i} uid={uid} canEditData={canEditData} myVotes={myVotes} voteCounts={voteCounts} onVote={vote} onUpdate={updateItem} onDelete={deleteItem} />)}
      </div>

      {/* Gesperrt-Hinweis statt Composer */}
      {banned && (
        <div className="rounded-2xl border-2 border-red-300 bg-red-500/5 p-4 text-center text-sm dark:border-red-500/40">
          <div className="mb-1 text-2xl">🚫</div>
          <div className="font-bold text-red-500">Du bist aktuell vom Posten gesperrt.</div>
          {bannedUntil && bannedUntil !== PERMANENT_UNTIL && (
            <div className="mt-1 text-xs text-slate-400">
              Gesperrt bis {new Date(bannedUntil).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          {bannedUntil === PERMANENT_UNTIL && <div className="mt-1 text-xs text-slate-400">Wende dich an das Stufenteam.</div>}
        </div>
      )}

      {/* Neuer Beitrag: schwebender ＋ statt fest angehängtem Formular */}
      {!banned && (
        <button
          onClick={() => setComposerOpen(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Neuer Beitrag"
        >
          ＋
        </button>
      )}

      {composerOpen && (
        <Sheet open onClose={() => setComposerOpen(false)}>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex-1 text-xl font-bold">Neuer Beitrag</span>
            <button className="iconbtn" onClick={() => setComposerOpen(false)}>✕</button>
          </div>
          <div className="mb-2 flex gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {TYPE_TABS.map(({ t, label }) => (
              <button key={t} onClick={() => setType(t)} className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold transition ${type === t ? "bg-brand text-white" : "text-slate-500"}`}>{label}</button>
            ))}
          </div>
          <input className="field mb-2" placeholder="Titel (optional)" autoFocus value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
          <textarea className="field min-h-[90px] resize-y" placeholder={type === "todo" ? "Was ist zu tun?" : type === "umfrage" ? "Frage…" : "Nachricht…"} value={text} onChange={(e) => setText(e.target.value)} />
          {type === "umfrage" && (
            <div className="mt-2 space-y-2">
              {opts.map((o, i) => <input key={i} className="field" placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOpts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />)}
              <button onClick={() => setOpts((p) => [...p, ""])} className="text-sm font-semibold text-brand">+ Option</button>
            </div>
          )}
          <button className="btn-primary mt-3" disabled={!text.trim()} onClick={send}>Senden</button>
        </Sheet>
      )}
    </div>
  );
}

const markedOnce = new Set<string>();
function markReadOnce(topicId: string, markRead: (id: string) => void) {
  if (markedOnce.has(topicId)) return;
  markedOnce.add(topicId);
  setTimeout(() => { markRead(topicId); markedOnce.delete(topicId); }, 800);
}

/** Twitch-ähnliches Mod-Icon: grünes Schild-Quadrat mit weißem Schwert. */
function ModBadge() {
  return (
    <span title="Admin (Moderator)" className="inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] bg-emerald-500">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4v5l-9 9-4-4 9-9z" />
        <path d="M6.5 11.5l6 6" />
        <path d="M3 21l3-3" />
      </svg>
    </span>
  );
}

/** Rollen- und Komitee-Markierung hinter dem Autor-Namen. */
function AuthorBadges({ role, koms }: { role: string | null; koms: string[] | null }) {
  return (
    <>
      {role === "admin" && <ModBadge />}
      {role === "stufenteam" && (
        <span className="rounded bg-brand/15 px-1.5 py-px text-[10px] font-bold text-brand">Stufenteam</span>
      )}
      {(koms || []).map((s) => (
        <span key={s} className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-600 dark:text-amber-400">
          {committeeLabel(s)}
        </span>
      ))}
    </>
  );
}

function ItemRow({
  i, uid, canEditData, myVotes, voteCounts, onVote, onUpdate, onDelete,
}: {
  i: TopicItem; uid: string; canEditData: boolean;
  myVotes: Record<string, string[]>; voteCounts: Record<string, Record<string, number>>;
  onVote: (itemId: string, optionId: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<TopicItem, "done" | "pinned">>) => void;
  onDelete: (id: string) => void;
}) {
  const time = new Date(i.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + new Date(i.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const mayDelete = canEditData || i.created_by === uid;
  const counts = voteCounts[i.id] || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className={`rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${i.done ? "opacity-60" : ""}`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
        <span className="font-semibold text-slate-500 dark:text-slate-300">{i.author}</span>
        <AuthorBadges role={i.author_role} koms={i.author_koms} />
        <span>{time}</span>
        <span className="ml-auto flex gap-1">
          {canEditData && <button title={i.pinned ? "Lösen" : "Als Key-Info anheften"} onClick={() => onUpdate(i.id, { pinned: !i.pinned })}>{i.pinned ? "📌" : "📍"}</button>}
          {mayDelete && <button title="Löschen" onClick={() => onDelete(i.id)}>🗑</button>}
        </span>
      </div>
      {i.title && <div className="mb-0.5 text-[15px] font-bold">{i.title}</div>}
      {i.type === "todo" ? (
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" checked={i.done} onChange={(e) => onUpdate(i.id, { done: e.target.checked })} />
          <span className={`text-[15px] ${i.done ? "line-through" : ""}`}>{i.body}</span>
        </label>
      ) : (
        <div className="whitespace-pre-wrap text-[15px]">{i.body}</div>
      )}
      {i.type === "umfrage" && i.options && (
        <div className="mt-2 space-y-1.5">
          {i.options.map((o) => {
            const c = counts[o.id] || 0;
            const pct = total ? Math.round((c / total) * 100) : 0;
            const picked = (myVotes[i.id] || []).includes(o.id);
            return (
              <button key={o.id} onClick={() => onVote(i.id, o.id)} className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-semibold ${picked ? "border-brand" : "border-slate-200 dark:border-slate-700"}`}>
                <span className="absolute inset-y-0 left-0 bg-brand/10 dark:bg-brand/20" style={{ width: `${pct}%` }} />
                <span className="relative flex items-center gap-2">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-white ${picked ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>{picked ? "✓" : ""}</span>
                  <span className="flex-1">{o.label}</span>
                  <span className="text-xs text-slate-400">{c} · {pct}%</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
