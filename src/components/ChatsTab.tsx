import { useEffect, useMemo, useRef, useState } from "react";
import { useTopics, type Topic } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { COMMITTEES, committeeLabel } from "../lib/committees";
import { TopicsTab } from "./TopicsTab";

const TEAM_CHAT_TITLE = "Stufenteam";

/**
 * Chats: pro Komitee ein Chat (nur Mitglieder sehen ihn) und der Stufenteam-Chat,
 * in dem jede Person eine Frage als Ticket stellen kann. Planungs-Ordner liegen
 * dahinter und stören niemanden, der sie nicht braucht.
 */
export function ChatsTab() {
  const { topics, ready, unreadCount, createTopic, committeesOf, uid } = useTopics();
  const { can, isStaff } = useRole();
  const darfVerwalten = can("chats.manage");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOrdner, setShowOrdner] = useState(false);
  const [neueFrage, setNeueFrage] = useState(false);
  const angelegt = useRef(false);

  const chats = topics.filter((t) => t.kind === "chat");
  const teamChat = chats.find((t) => !t.tag) ?? null;
  const meineKoms = committeesOf(uid);

  // Fehlende Chats einmalig anlegen – nur wer Ordner verwalten darf, kann das.
  useEffect(() => {
    if (!ready || !darfVerwalten || angelegt.current || !hatAlleDaten(topics)) return;
    const fehlend = COMMITTEES.filter((c) => !chats.some((t) => t.tag === c.slug));
    const brauchtTeam = !teamChat;
    if (!fehlend.length && !brauchtTeam) return;
    angelegt.current = true;
    void (async () => {
      for (const c of fehlend) {
        await createTopic({ title: c.label, tag: c.slug, visibility: "komitee", memberIds: [], komiteeSlugs: [], kind: "chat" });
      }
      if (brauchtTeam) {
        await createTopic({ title: TEAM_CHAT_TITLE, tag: "", visibility: "stufenteam", memberIds: [], komiteeSlugs: [], kind: "chat" });
      }
    })();
  }, [ready, darfVerwalten, topics, chats, teamChat, createTopic]);

  const meineTickets = useMemo(
    () => topics.filter((t) => t.kind === "ticket" && (isStaff || t.created_by === uid)),
    [topics, isStaff, uid],
  );

  if (!ready)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Chats werden geladen …</div>
      </div>
    );

  if (showOrdner)
    return (
      <div>
        <button
          onClick={() => setShowOrdner(false)}
          className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand"
        >
          ‹ zurück zu den Chats
        </button>
        <TopicsTab />
      </div>
    );

  const offen = topics.find((t) => t.id === openId) ?? null;
  if (offen) return <ChatPage topic={offen} onBack={() => setOpenId(null)} />;

  const reihenfolge = new Map(COMMITTEES.map((c, i) => [c.slug, i]));
  const komiteeChats = chats
    .filter((t) => t.tag)
    .sort((a, b) => {
      const meinA = meineKoms.includes(a.tag) ? 0 : 1;
      const meinB = meineKoms.includes(b.tag) ? 0 : 1;
      if (meinA !== meinB) return meinA - meinB;
      return (reihenfolge.get(a.tag) ?? 99) - (reihenfolge.get(b.tag) ?? 99);
    });
  const offeneTickets = meineTickets.filter((t) => t.status !== "erledigt");
  const erledigt = meineTickets.filter((t) => t.status === "erledigt");

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {isStaff ? "Alle Komitees" : "Mein Komitee"}
        </h3>
        {komiteeChats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
            {meineKoms.length
              ? "Der Chat wird gerade eingerichtet."
              : "Du bist noch keinem Komitee zugeordnet – das Stufenteam kann dich eintragen."}
          </div>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {komiteeChats.map((t) => (
              <ChatCard
                key={t.id}
                titel={committeeLabel(t.tag)}
                icon="💬"
                unread={unreadCount(t.id)}
                mine={meineKoms.includes(t.tag)}
                onOpen={() => setOpenId(t.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {isStaff ? "Fragen an euch" : "Frage ans Stufenteam"}
        </h3>

        {!isStaff && (
          <>
            {neueFrage ? (
              <TicketForm
                teamChatId={teamChat?.id ?? null}
                onDone={(id) => {
                  setNeueFrage(false);
                  if (id) setOpenId(id);
                }}
                onCancel={() => setNeueFrage(false)}
              />
            ) : (
              <button
                onClick={() => setNeueFrage(true)}
                className="w-full rounded-2xl border border-dashed border-brand/50 py-3.5 text-sm font-bold text-brand transition active:scale-[.99]"
              >
                ＋ Frage stellen
              </button>
            )}
          </>
        )}

        {teamChat && isStaff && (
          <div className="mb-2.5">
            <ChatCard titel="Stufenteam-Chat" icon="🛡️" unread={unreadCount(teamChat.id)} mine onOpen={() => setOpenId(teamChat.id)} />
          </div>
        )}

        <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
          {offeneTickets.map((t) => (
            <ChatCard key={t.id} titel={t.title} icon="❓" unread={unreadCount(t.id)} mine onOpen={() => setOpenId(t.id)} />
          ))}
        </div>
        {erledigt.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-400">
              Erledigt ({erledigt.length})
            </summary>
            <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
              {erledigt.map((t) => (
                <ChatCard key={t.id} titel={t.title} icon="✓" unread={0} mine={false} onOpen={() => setOpenId(t.id)} />
              ))}
            </div>
          </details>
        )}
      </section>

      {darfVerwalten && (
        <button
          onClick={() => setShowOrdner(true)}
          className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 dark:border-slate-700"
        >
          📁 Planungs-Ordner öffnen
        </button>
      )}
    </div>
  );
}

/** Erst anlegen, wenn die Ordnerliste wirklich geladen ist (sonst Doppel-Chats). */
function hatAlleDaten(topics: Topic[]): boolean {
  return Array.isArray(topics);
}

function ChatCard({
  titel, icon, unread, mine, onOpen,
}: { titel: string; icon: string; unread: number; mine: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className={`card flex w-full items-center gap-3 p-4 text-left transition active:scale-[.99] ${mine ? "" : "opacity-70"}`}
    >
      <span className="text-xl">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{titel}</span>
      {unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      <span className="text-slate-300">›</span>
    </button>
  );
}

function TicketForm({
  teamChatId, onDone, onCancel,
}: { teamChatId: string | null; onDone: (id: string | null) => void; onCancel: () => void }) {
  const { createTopic } = useTopics();
  const [titel, setTitel] = useState("");
  const [busy, setBusy] = useState(false);

  async function senden() {
    if (!titel.trim()) return;
    setBusy(true);
    await createTopic({
      title: titel.trim().slice(0, 80),
      tag: "",
      visibility: "stufenteam",
      memberIds: [],
      komiteeSlugs: [],
      parentId: teamChatId,
      kind: "ticket",
    });
    setBusy(false);
    onDone(null); // das neue Ticket erscheint gleich in der Liste
  }

  return (
    <div className="rounded-2xl border border-brand/40 bg-brand/5 p-3">
      <input
        className="field mb-2"
        autoFocus
        placeholder="Worum geht es? z. B. Abrechnung Mottowoche"
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && senden()}
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">Das Stufenteam antwortet dir hier im Chat.</span>
        <button onClick={onCancel} className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-700">
          Abbrechen
        </button>
        <button onClick={senden} disabled={!titel.trim() || busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "…" : "Senden"}
        </button>
      </div>
    </div>
  );
}

/** Chat-Ansicht: Nachrichten von unten nach oben, ein Eingabefeld, sonst nichts. */
function ChatPage({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, deleteItem, markRead, uid, committeesOf, updateTopic } = useTopics();
  const { role, can, isStaff, profiles, banned, bannedUntil } = useRole();
  const darfLoeschen = can("chats.delete_messages");
  const [text, setText] = useState("");
  const ende = useRef<HTMLDivElement | null>(null);

  const liste = items
    .filter((i) => i.topic_id === topic.id)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  useEffect(() => {
    markRead(topic.id);
    ende.current?.scrollIntoView({ block: "end" });
  }, [topic.id, liste.length, markRead]);

  const nameVon = (userId: string | null) =>
    profiles.find((p) => p.user_id === userId)?.username || "";

  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  const titel = topic.kind === "ticket" ? topic.title : topic.tag ? committeeLabel(topic.tag) : topic.title;

  return (
    <div className="flex flex-col" style={{ minHeight: "60vh" }}>
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold">{titel}</div>
          <div className="text-[11px] text-slate-400">
            {topic.kind === "ticket"
              ? topic.status === "erledigt" ? "erledigt" : "Frage ans Stufenteam"
              : topic.tag ? "Komitee-Chat" : "Stufenteam"}
          </div>
        </div>
        {topic.kind === "ticket" && isStaff && (
          <button
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold dark:border-slate-700"
            onClick={() => updateTopic(topic.id, { status: topic.status === "erledigt" ? "offen" : "erledigt" })}
          >
            {topic.status === "erledigt" ? "wieder öffnen" : "erledigt"}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2.5 py-3">
        {liste.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">
            Noch keine Nachricht. Schreib die erste.
          </p>
        )}
        {liste.map((m) => {
          const meins = m.created_by === uid;
          return (
            <div key={m.id} className={`flex ${meins ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  meins ? "bg-brand text-white" : "bg-white shadow-card dark:bg-slate-900 dark:shadow-cardDark"
                }`}
              >
                {!meins && (
                  <div className="mb-0.5 text-[11px] font-bold text-slate-400">
                    {m.author || nameVon(m.created_by)}
                    {m.author_role && m.author_role !== "schueler" && (
                      <span className="ml-1.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">Team</span>
                    )}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</div>
                <div className={`mt-1 text-right text-[10px] ${meins ? "text-white/70" : "text-slate-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  {(meins || darfLoeschen) && (
                    <button
                      onClick={() => confirm("Nachricht löschen?") && deleteItem(m.id)}
                      className="ml-2 underline"
                    >
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

      {banned ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+3.9rem)] rounded-2xl bg-red-500/10 p-3 text-center text-sm font-semibold text-red-500">
          Du bist bis {bannedUntil ? new Date(bannedUntil).toLocaleString("de-DE") : "auf Weiteres"} gesperrt.
        </div>
      ) : (
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
