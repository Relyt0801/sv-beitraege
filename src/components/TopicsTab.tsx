import { useMemo, useState } from "react";
import { useTopics, type Topic, type TopicItem, type TopicItemType } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";
import { normalize } from "../lib/logic";

export function TopicsTab() {
  const { topics, ready, unreadCount, createTopic, items } = useTopics();
  const { canEditData } = useRole();
  const [stack, setStack] = useState<string[]>([]); // Navigations-Pfad (Ordner in Ordnern)
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("");
  const [manageTag, setManageTag] = useState<string | null>(null);

  const openTopic = stack.length ? (topics.find((t) => t.id === stack[stack.length - 1]) ?? null) : null;
  const roots = useMemo(() => topics.filter((t) => !t.parent_id), [topics]);

  // Ungelesen inkl. aller Unterordner
  const unreadDeep = (id: string): number =>
    unreadCount(id) + topics.filter((t) => t.parent_id === id).reduce((s, t) => s + unreadDeep(t.id), 0);

  const grouped = useMemo(() => {
    const pinned = roots.filter((t) => t.pinned);
    const rest = roots.filter((t) => !t.pinned);
    const byTag = new Map<string, Topic[]>();
    for (const t of rest) byTag.set(t.tag || "", [...(byTag.get(t.tag || "") || []), t]);
    const tags = [...byTag.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "de")));
    return { pinned, tags, byTag };
  }, [roots]);

  if (!ready)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Übersicht wird geladen …</div>
      </div>
    );

  const card = (t: Topic) => {
    const unread = unreadDeep(t.id);
    const subCount = topics.filter((x) => x.parent_id === t.id).length;
    const itemCount = items.filter((i) => i.topic_id === t.id).length;
    return (
      <button key={t.id} onClick={() => setStack([t.id])} className="card flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {t.pinned && <span title="angeheftet">📌</span>}
            <span className="truncate text-[16px] font-semibold">{t.title}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {subCount > 0 && <span className="mr-2">📁 {subCount}</span>}
            {itemCount > 0 && <span>{itemCount} Beitr{itemCount === 1 ? "ag" : "äge"}</span>}
          </div>
        </div>
        {unread > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <span className="text-slate-300 dark:text-slate-600">›</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {roots.length === 0 && (
        <div className="py-16 text-center text-sm text-slate-400">
          Noch keine Ordner. {canEditData ? "Lege mit ＋ den ersten an (z. B. Sportfest)." : ""}
        </div>
      )}

      {grouped.pinned.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">📌 Angeheftet</h3>
          <div className="grid gap-2.5 lg:grid-cols-2">{grouped.pinned.map(card)}</div>
        </section>
      )}
      {grouped.tags.map((tg) => (
        <section key={tg || "_"}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            {tg ? `#${tg}` : "Ohne Tag"}
            {tg && canEditData && (
              <button onClick={() => setManageTag(tg)} title="Komitee-Mitglieder verwalten"
                className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                👥 Komitee
              </button>
            )}
          </h3>
          <div className="grid gap-2.5 lg:grid-cols-2">{grouped.byTag.get(tg)!.map(card)}</div>
        </section>
      ))}

      {canEditData && (
        <button
          onClick={() => setShowNew(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Ordner erstellen"
        >
          ＋
        </button>
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)}>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex-1 text-xl font-bold">Neuer Ordner</span>
          <button className="iconbtn" onClick={() => setShowNew(false)}>✕</button>
        </div>
        <input className="field mb-3" placeholder="Titel (z. B. Sportfest)" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field mb-4" placeholder="Komitee-Tag (z. B. abikomitee) – optional" value={tag} onChange={(e) => setTag(e.target.value)} />
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            await createTopic(title, tag.toLowerCase());
            setTitle(""); setTag(""); setShowNew(false);
          }}
        >
          Erstellen
        </button>
      </Sheet>

      {manageTag && <TagMembersSheet tag={manageTag} onClose={() => setManageTag(null)} />}

      <TopicView
        topic={openTopic}
        onOpenSub={(id) => setStack((s) => [...s, id])}
        onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
        onClose={() => setStack([])}
      />
    </div>
  );
}

/* ================= Komitee-Mitglieder (Tag) ================= */

function TagMembersSheet({ tag, onClose }: { tag: string; onClose: () => void }) {
  const { tagMembers, setTagMembers } = useTopics();
  const { profiles } = useRole();
  const [q, setQ] = useState("");
  const current = tagMembers[tag] || [];

  return (
    <Sheet open onClose={onClose}>
      <div className="mb-1 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Komitee #{tag}</span>
        <button className="iconbtn" onClick={onClose}>✕</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Mitglieder sehen <b>alle</b> Ordner mit diesem Tag, können dort schreiben und bekommen Push bei Neuigkeiten.
      </p>
      <input className="field mb-2" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-72 overflow-y-auto">
        {profiles
          .filter((p) => !q || normalize(p.username || "").includes(normalize(q)))
          .map((p) => {
            const on = current.includes(p.user_id);
            return (
              <button
                key={p.user_id}
                onClick={() => setTagMembers(tag, on ? current.filter((x) => x !== p.user_id) : [...current, p.user_id])}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>
                  {on ? "✓" : ""}
                </span>
                {p.username}
              </button>
            );
          })}
      </div>
      <div className="pt-2 text-xs text-slate-400">{current.length} Mitglied{current.length === 1 ? "" : "er"}</div>
    </Sheet>
  );
}

/* ================= Ordner-Ansicht ================= */

const TYPE_TABS: { t: TopicItemType; label: string }[] = [
  { t: "nachricht", label: "💬 Nachricht" },
  { t: "todo", label: "☑️ To-Do" },
  { t: "umfrage", label: "🗳️ Abstimmung" },
];

function TopicView({
  topic, onOpenSub, onBack, onClose,
}: {
  topic: Topic | null;
  onOpenSub: (id: string) => void;
  onBack?: () => void;
  onClose: () => void;
}) {
  const { topics, items, members, tagMembers, uid, postItem, updateItem, deleteItem, updateTopic, deleteTopic, createTopic, markRead, myVotes, voteCounts, vote, setMembers, unreadCount } = useTopics();
  const { canEditData, profiles } = useRole();
  const [type, setType] = useState<TopicItemType>("nachricht");
  const [itemTitle, setItemTitle] = useState("");
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [showMembers, setShowMembers] = useState(false);
  const [q, setQ] = useState("");

  if (!topic) return null;
  const list = items.filter((i) => i.topic_id === topic.id);
  const pinnedItems = list.filter((i) => i.pinned);
  const stream = list.filter((i) => !i.pinned);
  const memberIds = members[topic.id] || [];
  const komitee = topic.tag ? (tagMembers[topic.tag] || []).length : 0;
  const children = topics.filter((t) => t.parent_id === topic.id);

  markReadOnce(topic.id, markRead);

  async function send() {
    if (!text.trim()) return;
    await postItem(topic!, type, text, type === "umfrage" ? opts : undefined, itemTitle);
    setText(""); setItemTitle(""); setOpts(["", ""]); setType("nachricht");
  }

  function addSubfolder() {
    const name = prompt("Titel des Unterordners:");
    if (name?.trim()) void createTopic(name, topic!.tag, topic!.id);
  }

  return (
    <Sheet open onClose={onClose}>
      {/* Kopf */}
      <div className="mb-1 flex items-center gap-2">
        {onBack && <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>}
        <span className="flex-1 truncate text-xl font-bold">{topic.title}</span>
        {canEditData && (
          <>
            <button className="iconbtn" title={topic.pinned ? "Lösen" : "Anheften"} onClick={() => updateTopic(topic.id, { pinned: !topic.pinned })}>
              {topic.pinned ? "📌" : "📍"}
            </button>
            <button className="iconbtn" title="Ordner-Mitglieder" onClick={() => setShowMembers((v) => !v)}>👥</button>
            <button className="iconbtn" title="Ordner löschen"
              onClick={() => { if (confirm("Ordner samt Unterordnern und Inhalt löschen?")) { void deleteTopic(topic.id); onClose(); } }}>
              🗑
            </button>
          </>
        )}
        <button className="iconbtn" onClick={onClose}>✕</button>
      </div>
      <div className="mb-3 text-xs text-slate-400">
        {topic.tag && <span className="mr-2 rounded-full bg-brand/10 px-2 py-0.5 font-bold text-brand">#{topic.tag}</span>}
        {topic.tag && <span className="mr-2">{komitee} im Komitee</span>}
        {memberIds.length > 0 && <span>+{memberIds.length} direkt</span>}
      </div>

      {/* Ordner-Mitglieder (zusätzlich zum Komitee) */}
      {showMembers && canEditData && (
        <div className="mb-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Direkte Mitglieder (nur dieser Ordner) – Komitee-Mitglieder (#{topic.tag || "–"}) haben automatisch Zugriff
          </div>
          <input className="field mb-2" placeholder="Person suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-44 overflow-y-auto">
            {profiles
              .filter((p) => !q || normalize(p.username || "").includes(normalize(q)))
              .map((p) => {
                const on = memberIds.includes(p.user_id);
                return (
                  <button
                    key={p.user_id}
                    onClick={() => setMembers(topic.id, topic.title, on ? memberIds.filter((x) => x !== p.user_id) : [...memberIds, p.user_id])}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>
                      {on ? "✓" : ""}
                    </span>
                    {p.username}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Unterordner */}
      {(children.length > 0 || canEditData) && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            📁 Unterordner
            {canEditData && (
              <button onClick={addSubfolder} className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold normal-case text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                + Neu
              </button>
            )}
          </div>
          {children.length > 0 && (
            <div className="grid gap-2">
              {children.map((c) => {
                const unread = unreadCount(c.id);
                return (
                  <button key={c.id} onClick={() => onOpenSub(c.id)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold dark:border-slate-700">
                    📁 <span className="flex-1 truncate">{c.title}</span>
                    {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{unread}</span>}
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
        <div className="mb-4 rounded-2xl border-2 border-brand/30 bg-brand/5 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-brand">📌 Key-Infos</div>
          <div className="space-y-2">
            {pinnedItems.map((i) => (
              <ItemRow key={i.id} i={i} uid={uid} canEditData={canEditData} myVotes={myVotes} voteCounts={voteCounts}
                onVote={vote} onUpdate={updateItem} onDelete={deleteItem} />
            ))}
          </div>
        </div>
      )}

      {/* Stream */}
      <div className="space-y-2">
        {stream.length === 0 && pinnedItems.length === 0 && children.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-400">Noch nichts hier – schreib den ersten Beitrag.</div>
        )}
        {stream.map((i) => (
          <ItemRow key={i.id} i={i} uid={uid} canEditData={canEditData} myVotes={myVotes} voteCounts={voteCounts}
            onVote={vote} onUpdate={updateItem} onDelete={deleteItem} />
        ))}
      </div>

      {/* Composer */}
      <div className="mt-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
        <div className="mb-2 flex gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {TYPE_TABS.map(({ t, label }) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 rounded-lg py-1.5 text-[13px] font-bold transition ${type === t ? "bg-brand text-white" : "text-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
        <input className="field mb-2" placeholder="Titel (optional)" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
        <textarea
          className="field min-h-[60px] resize-y"
          placeholder={type === "todo" ? "Was ist zu tun?" : type === "umfrage" ? "Frage…" : "Nachricht…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {type === "umfrage" && (
          <div className="mt-2 space-y-2">
            {opts.map((o, i) => (
              <input key={i} className="field" placeholder={`Option ${i + 1}`} value={o}
                onChange={(e) => setOpts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
            <button onClick={() => setOpts((p) => [...p, ""])} className="text-sm font-semibold text-brand">+ Option</button>
          </div>
        )}
        <button className="btn-primary mt-3" disabled={!text.trim()} onClick={send}>Senden</button>
      </div>
    </Sheet>
  );
}

const markedOnce = new Set<string>();
function markReadOnce(topicId: string, markRead: (id: string) => void) {
  if (markedOnce.has(topicId)) return;
  markedOnce.add(topicId);
  setTimeout(() => {
    markRead(topicId);
    markedOnce.delete(topicId);
  }, 800);
}

function ItemRow({
  i, uid, canEditData, myVotes, voteCounts, onVote, onUpdate, onDelete,
}: {
  i: TopicItem;
  uid: string;
  canEditData: boolean;
  myVotes: Record<string, string[]>;
  voteCounts: Record<string, Record<string, number>>;
  onVote: (itemId: string, optionId: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<TopicItem, "done" | "pinned">>) => void;
  onDelete: (id: string) => void;
}) {
  const time = new Date(i.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) +
    " " + new Date(i.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const mayDelete = canEditData || i.created_by === uid;
  const counts = voteCounts[i.id] || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className={`rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${i.done ? "opacity-60" : ""}`}>
      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
        <span className="font-semibold">{i.author}</span>
        <span>{time}</span>
        <span className="ml-auto flex gap-1">
          {canEditData && (
            <button title={i.pinned ? "Lösen" : "Als Key-Info anheften"} onClick={() => onUpdate(i.id, { pinned: !i.pinned })}>
              {i.pinned ? "📌" : "📍"}
            </button>
          )}
          {mayDelete && <button title="Löschen" onClick={() => onDelete(i.id)}>🗑</button>}
        </span>
      </div>

      {i.title && <div className="mb-0.5 text-[15px] font-bold">{i.title}</div>}

      {i.type === "todo" ? (
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand" checked={i.done}
            onChange={(e) => onUpdate(i.id, { done: e.target.checked })} />
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
              <button key={o.id} onClick={() => onVote(i.id, o.id)}
                className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-semibold ${picked ? "border-brand" : "border-slate-200 dark:border-slate-700"}`}>
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
