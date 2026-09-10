import { useEffect, useMemo, useRef, useState } from "react";
import { useTopics, type Topic, type TopicItem } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { Avatar, PersonName } from "./Avatar";
import { BannHinweis } from "./BannHinweis";
import { Sheet } from "./Sheet";

type Neu = "pin" | "umfrage" | "todo" | null;

/**
 * Eine Komitee-Seite: oben das Wichtige (Angepinntes, Abstimmungen, To-dos),
 * unten an fester Stelle der Chat.
 */
export function KomiteePage({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, updateItem, deleteItem, markRead, uid, committeesOf } = useTopics();
  const { role, can, banned } = useRole();
  const darfLoeschen = can("chats.delete_messages");
  const [neu, setNeu] = useState<Neu>(null);
  const [tab, setTab] = useState<"uebersicht" | "chat">("uebersicht");

  const alle = useMemo(
    () => items.filter((i) => i.topic_id === topic.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [items, topic.id],
  );
  const pins = alle.filter((i) => i.type === "nachricht" && i.pinned);
  const umfragen = alle.filter((i) => i.type === "umfrage");
  const todos = alle.filter((i) => i.type === "todo");
  const chat = alle.filter((i) => i.type === "nachricht" && !i.pinned);

  useEffect(() => markRead(topic.id), [topic.id, alle.length, markRead]);

  const titel = topic.tag ? committeeLabel(topic.tag) : topic.title;
  const icon = topic.tag ? committeeIcon(topic.tag) : "💬";

  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="text-xl">{icon}</span>
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold">{titel}</div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setTab("uebersicht")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${tab === "uebersicht" ? "bg-white text-brand shadow-card dark:bg-slate-900" : "text-slate-500"}`}
          >
            Übersicht
          </button>
          <button
            onClick={() => setTab("chat")}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${tab === "chat" ? "bg-white text-brand shadow-card dark:bg-slate-900" : "text-slate-500"}`}
          >
            Chat
          </button>
        </div>
      </div>

      {banned && (
        <div className="mt-3">
          <BannHinweis />
        </div>
      )}

      {tab === "uebersicht" ? (
        <div className="mt-3 space-y-5 pb-4">
          <Abschnitt titel="Angepinnt" icon="📌" leer="Nichts angepinnt.">
            {pins.map((p) => (
              <div key={p.id} className="card flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{p.body}</div>
                  <PersonName userId={p.created_by} name={p.author} role={p.author_role} koms={p.author_koms} className="text-[11px] font-semibold" />
                </div>
                {(p.created_by === uid || darfLoeschen) && (
                  <button onClick={() => confirm("Loslösen?") && updateItem(p.id, { pinned: false })} className="text-slate-400">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </Abschnitt>

          <Abschnitt titel="Abstimmungen" icon="🗳️" leer="Keine Abstimmung offen.">
            {umfragen.map((u) => (
              <UmfrageKarte key={u.id} item={u} kannLoeschen={u.created_by === uid || darfLoeschen} onDelete={() => deleteItem(u.id)} />
            ))}
          </Abschnitt>

          <Abschnitt titel="To-dos" icon="✅" leer="Keine offenen Aufgaben.">
            {todos.map((t) => (
              <button
                key={t.id}
                onClick={() => !banned && updateItem(t.id, { done: !t.done })}
                className="card flex w-full items-center gap-3 p-3 text-left"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm text-white ${
                    t.done ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {t.done ? "✓" : ""}
                </span>
                <span className={`min-w-0 flex-1 text-[15px] ${t.done ? "text-slate-400 line-through" : "font-semibold"}`}>
                  {t.body}
                </span>
                <PersonName userId={t.created_by} name={t.author} role={t.author_role} koms={t.author_koms} className="shrink-0 text-[11px] font-semibold" />
              </button>
            ))}
          </Abschnitt>

          {!banned && (
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              <NeuKnopf icon="📌" label="Anpinnen" onClick={() => setNeu("pin")} />
              <NeuKnopf icon="🗳️" label="Abstimmung" onClick={() => setNeu("umfrage")} />
              <NeuKnopf icon="✅" label="To-do" onClick={() => setNeu("todo")} />
            </div>
          )}
        </div>
      ) : (
        <ChatBereich topic={topic} liste={chat} banned={banned} darfLoeschen={darfLoeschen} uid={uid} />
      )}

      <NeuSheet
        art={neu}
        onClose={() => setNeu(null)}
        onSave={async (daten) => {
          const meta = { role, koms: committeesOf(uid) };
          if (daten.art === "pin") await postItem(topic, "nachricht", daten.text, undefined, "", { ...meta, pinned: true });
          if (daten.art === "todo") await postItem(topic, "todo", daten.text, undefined, "", meta);
          if (daten.art === "umfrage")
            await postItem(topic, "umfrage", daten.text, daten.optionen, daten.text.slice(0, 60), {
              ...meta,
              poll: { multi: daten.multi, anon: daten.anon, deadline: daten.frist },
            });
          setNeu(null);
        }}
      />
    </div>
  );
}

function Abschnitt({
  titel, icon, leer, children,
}: { titel: string; icon: string; leer: string; children: React.ReactNode }) {
  const hat = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
        {icon} {titel}
      </h3>
      {hat ? <div className="grid gap-2 lg:grid-cols-2">{children}</div> : <p className="text-sm text-slate-400">{leer}</p>}
    </section>
  );
}

function NeuKnopf({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-dashed border-brand/50 py-3 text-center text-[13px] font-bold text-brand transition active:scale-[.98]"
    >
      <div className="text-lg">{icon}</div>
      {label}
    </button>
  );
}

function UmfrageKarte({
  item, kannLoeschen, onDelete,
}: { item: TopicItem; kannLoeschen: boolean; onDelete: () => void }) {
  const { myVotes, voteCounts, voters, vote } = useTopics();
  const { isAdmin } = useRole();
  const meine = myVotes[item.id] || [];
  const counts = voteCounts[item.id] || {};
  const gesamt = Object.values(counts).reduce((a, b) => a + b, 0);
  const abgelaufen = item.poll_deadline ? new Date(item.poll_deadline) < new Date() : false;

  // anonym = nur Admins sehen, wer gestimmt hat
  const zeigeWaehler = !item.poll_anon || isAdmin;

  return (
    <div className="card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{item.body}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
            <span>{item.poll_multi ? "Mehrfachwahl" : "Einfachwahl"}</span>
            <span>·</span>
            <span>{item.poll_anon ? "anonym" : "nicht anonym"}</span>
            {item.poll_deadline && (
              <>
                <span>·</span>
                <span className={abgelaufen ? "font-bold text-red-500" : ""}>
                  {abgelaufen ? "beendet" : `bis ${new Date(item.poll_deadline).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                </span>
              </>
            )}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
          <Avatar userId={item.created_by} name={item.author} size={20} />
          <PersonName userId={item.created_by} name={item.author} role={item.author_role} koms={item.author_koms} className="font-semibold" />
        </span>
        {kannLoeschen && (
          <button onClick={() => confirm("Abstimmung löschen?") && onDelete()} className="shrink-0 text-slate-400">
            🗑
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-1.5">
        {(item.options || []).map((o) => {
          const n = counts[o.id] || 0;
          const pct = gesamt ? Math.round((n / gesamt) * 100) : 0;
          const gewaehlt = meine.includes(o.id);
          const waehler = zeigeWaehler
            ? (voters[item.id] || []).filter((v) => v.option_id === o.id).map((v) => v.user_id)
            : [];
          return (
            <button
              key={o.id}
              disabled={abgelaufen}
              onClick={() => vote(item.id, o.id, item.poll_multi)}
              className={`relative overflow-hidden rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${
                gewaehlt ? "border-brand" : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="absolute inset-y-0 left-0 bg-brand/10" style={{ width: `${pct}%` }} />
              <div className="relative flex items-center gap-2">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-white ${item.poll_multi ? "rounded" : "rounded-full"} ${gewaehlt ? "bg-brand" : "border border-slate-300 dark:border-slate-600"}`}>
                  {gewaehlt ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{o.label}</span>
                <span className="shrink-0 text-[12px] text-slate-500">{n}</span>
              </div>
              {waehler.length > 0 && (
                <div className="relative mt-1.5 flex items-center pl-6">
                  {waehler.slice(0, 12).map((u, i) => (
                    <span key={u} style={{ marginLeft: i === 0 ? -24 : -8 }} className="relative">
                      <Avatar userId={u} size={22} ring />
                    </span>
                  ))}
                  {waehler.length > 12 && (
                    <span className="ml-1 text-[11px] font-semibold text-slate-400">+{waehler.length - 12}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[11px] text-slate-400">{gesamt} Stimme{gesamt === 1 ? "" : "n"}</div>
    </div>
  );
}

function ChatBereich({
  topic, liste, banned, darfLoeschen, uid,
}: { topic: Topic; liste: TopicItem[]; banned: boolean; darfLoeschen: boolean; uid: string }) {
  const { postItem, deleteItem, committeesOf } = useTopics();
  const { role } = useRole();
  const [text, setText] = useState("");
  const ende = useRef<HTMLDivElement | null>(null);

  useEffect(() => ende.current?.scrollIntoView({ block: "end" }), [liste.length]);

  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "55vh" }}>
      <div className="flex-1 space-y-2.5 py-3">
        {liste.length === 0 && <p className="py-12 text-center text-sm text-slate-400">Noch keine Nachricht.</p>}
        {liste.map((m) => {
          const meins = m.created_by === uid;
          return (
            <div key={m.id} className={`flex ${meins ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%] lg:max-w-[55%] ${meins ? "bg-brand text-white" : "bg-white shadow-card dark:bg-slate-900 dark:shadow-cardDark"}`}>
                {!meins && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <Avatar userId={m.created_by} name={m.author} size={20} />
                    <PersonName userId={m.created_by} name={m.author} role={m.author_role} koms={m.author_koms} className="text-[11px] font-bold" />
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</div>
                <div className={`mt-1 text-right text-[10px] ${meins ? "text-white/70" : "text-slate-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  {(meins || darfLoeschen) && (
                    <button onClick={() => confirm("Nachricht löschen?") && deleteItem(m.id)} className="ml-2 underline">
                      löschen
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={ende} />
      </div>

      {!banned && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+3.9rem)] -mx-3 flex items-end gap-2 border-t border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
          <textarea
            rows={1}
            className="field max-h-28 flex-1 resize-none py-2.5"
            placeholder="Nachricht…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void senden();
              }
            }}
          />
          <button
            onClick={senden}
            disabled={!text.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg text-white disabled:opacity-40"
            aria-label="Senden"
          >
            ➤
          </button>
        </div>
      )}
    </div>
  );
}

interface NeuDaten {
  art: Exclude<Neu, null>;
  text: string;
  optionen: string[];
  multi: boolean;
  anon: boolean;
  frist: string | null;
}

function NeuSheet({ art, onClose, onSave }: { art: Neu; onClose: () => void; onSave: (d: NeuDaten) => void }) {
  const [text, setText] = useState("");
  const [optionen, setOptionen] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(true);
  const [frist, setFrist] = useState("");

  useEffect(() => {
    if (art) {
      setText("");
      setOptionen(["", ""]);
      setMulti(false);
      setAnon(true);
      setFrist("");
    }
  }, [art]);

  if (!art) return null;
  const maxLen = art === "pin" ? 100 : 200;
  const titel = art === "pin" ? "Kurz anpinnen" : art === "todo" ? "Neues To-do" : "Neue Abstimmung";
  const gueltig = text.trim() && (art !== "umfrage" || optionen.filter((o) => o.trim()).length >= 2);

  return (
    <Sheet open onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">{titel}</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      <textarea
        rows={art === "pin" ? 2 : 2}
        autoFocus
        maxLength={maxLen}
        className="field mb-1 resize-none"
        placeholder={art === "pin" ? "Kurze Info, die oben stehen bleibt" : art === "todo" ? "Was ist zu tun?" : "Worüber wird abgestimmt?"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mb-3 text-right text-[11px] text-slate-400">
        {text.length} / {maxLen}
      </div>

      {art === "umfrage" && (
        <>
          <div className="mb-2 text-sm font-semibold text-slate-500">Antworten</div>
          {optionen.map((o, i) => (
            <input
              key={i}
              className="field mb-2"
              placeholder={`Antwort ${i + 1}`}
              value={o}
              onChange={(e) => setOptionen((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button onClick={() => setOptionen((p) => [...p, ""])} className="mb-4 text-sm font-bold text-brand">
            ＋ Antwort
          </button>

          <div className="mb-4 grid gap-2 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800/70">
            <Schalter label="Mehrfachauswahl erlauben" on={multi} set={setMulti} />
            <Schalter label="Anonym abstimmen" on={anon} set={setAnon} />
            <label className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-slate-600 dark:text-slate-300">Frist (optional)</span>
              <input
                type="datetime-local"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={frist}
                onChange={(e) => setFrist(e.target.value)}
              />
            </label>
          </div>
        </>
      )}

      <button
        className="btn-primary"
        disabled={!gueltig}
        onClick={() =>
          onSave({
            art,
            text: text.trim(),
            optionen: optionen.map((o) => o.trim()).filter(Boolean),
            multi,
            anon,
            frist: frist ? new Date(frist).toISOString() : null,
          })
        }
      >
        {art === "pin" ? "Anpinnen" : art === "todo" ? "To-do anlegen" : "Abstimmung starten"}
      </button>
    </Sheet>
  );
}

function Schalter({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex items-center gap-2 text-left text-sm">
      <span className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] text-white ${on ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>
        {on ? "✓" : ""}
      </span>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </button>
  );
}
