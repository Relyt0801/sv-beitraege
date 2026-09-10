import { useEffect, useMemo, useRef, useState } from "react";
import { useTopics, type Topic } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { KomiteePage } from "./KomiteePage";
import { BannHinweis } from "./BannHinweis";
import { ChatBlasen, ChatEingabe } from "./ChatBlasen";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";

const TEAM_CHAT_TITLE = "Stufenteam";

/**
 * Chats: pro Komitee ein Chat und der Stufenteam-Chat.
 * Für Schüler fühlt sich der Stufenteam-Chat wie ein normaler Chat an –
 * im Hintergrund entsteht daraus ein Ticket, das das Team beantwortet.
 */
export function ChatsTab() {
  const { topics, ready, unreadCount, createTopic, committeesOf, uid } = useTopics();
  const { can, isStaff } = useRole();
  const darfVerwalten = can("chats.manage");
  const [openId, setOpenId] = useState<string | null>(null);
  const [teamOffen, setTeamOffen] = useState(false);
  const [ticketListe, setTicketListe] = useState(false);
  const angelegt = useRef(false);

  const chats = topics.filter((t) => t.kind === "chat");
  const teamChat = chats.find((t) => !t.tag) ?? null;
  const meineKoms = committeesOf(uid);

  // Fehlende Chats einmalig anlegen – nur wer Chats verwalten darf, kann das.
  useEffect(() => {
    if (!ready || !darfVerwalten || angelegt.current) return;
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

  const tickets = useMemo(
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

  if (ticketListe && isStaff)
    return (
      <TicketListe
        offene={tickets.filter((t) => t.status !== "erledigt")}
        erledigt={tickets.filter((t) => t.status === "erledigt")}
        onBack={() => setTicketListe(false)}
        onOpen={(id) => {
          setTicketListe(false);
          setOpenId(id);
        }}
      />
    );

  // Schüler: durchgehender Chat mit dem Stufenteam
  if (teamOffen && !isStaff)
    return <TeamChatSchueler tickets={tickets} onBack={() => setTeamOffen(false)} />;

  const offen = topics.find((t) => t.id === openId) ?? null;
  if (offen)
    return offen.kind === "chat" ? (
      <KomiteePage topic={offen} onBack={() => setOpenId(null)} />
    ) : (
      <TicketChat topic={offen} onBack={() => setOpenId(() => (isStaff ? null : null))} />
    );

  const reihenfolge = new Map(COMMITTEES.map((c, i) => [c.slug, i]));
  const komiteeChats = chats
    .filter((t) => t.tag)
    .sort((a, b) => {
      const meinA = meineKoms.includes(a.tag) ? 0 : 1;
      const meinB = meineKoms.includes(b.tag) ? 0 : 1;
      if (meinA !== meinB) return meinA - meinB;
      return (reihenfolge.get(a.tag) ?? 99) - (reihenfolge.get(b.tag) ?? 99);
    });
  const offeneTickets = tickets.filter((t) => t.status !== "erledigt");
  const erledigt = tickets.filter((t) => t.status === "erledigt");
  const ticketUngelesen = tickets.reduce((n, t) => n + unreadCount(t.id), 0);

  return (
    <div className="space-y-5 pb-4">
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
                icon={committeeIcon(t.tag)}
                unread={unreadCount(t.id)}
                mine={meineKoms.includes(t.tag)}
                onOpen={() => setOpenId(t.id)}
              />
            ))}
            {isStaff && teamChat && (
              <ChatCard
                titel="Stufenteam"
                icon="👑"
                unread={unreadCount(teamChat.id)}
                mine
                onOpen={() => setOpenId(teamChat.id)}
              />
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          {isStaff ? "Fragen an euch" : "Stufenteam"}
        </h3>

        {!isStaff ? (
          <ChatCard
            titel="Stufenteam"
            icon="🛡️"
            unread={ticketUngelesen}
            mine
            onOpen={() => setTeamOffen(true)}
          />
        ) : (
          <TicketUebersichtKarte
            offene={offeneTickets}
            unread={ticketUngelesen}
            onOpen={() => setTicketListe(true)}
          />
        )}
      </section>
    </div>
  );
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

function TicketCard({ topic, unread, onOpen }: { topic: Topic; unread: number; onOpen: () => void }) {
  const { profile } = useProfiles();
  const name = topic.created_by ? profile[topic.created_by]?.anzeigename : "";
  return (
    <button
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-4 text-left transition active:scale-[.99]"
    >
      <Avatar userId={topic.created_by} name={name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{name || "Frage"}</span>
        <span className="block truncate text-[12px] text-slate-400">{topic.title}</span>
      </span>
      {unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      {topic.status === "erledigt" && <span className="text-emerald-500">✓</span>}
      <span className="text-slate-300">›</span>
    </button>
  );
}

/**
 * Schüleransicht: ein einziger Verlauf. Neue Nachrichten landen im offenen
 * Ticket; gibt es keins, wird im Hintergrund ein neues eröffnet.
 */
function TeamChatSchueler({ tickets, onBack }: { tickets: Topic[]; onBack: () => void }) {
  const { items, postItem, deleteItem, markRead, createTopic, committeesOf, uid } = useTopics();
  const { role, banned } = useRole();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const meineIds = new Set(tickets.map((t) => t.id));
  const verlauf = items
    .filter((i) => meineIds.has(i.topic_id))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  useEffect(() => {
    for (const t of tickets) markRead(t.id);
  }, [tickets, verlauf.length, markRead]);

  async function senden() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const nachricht = text;
    setText("");
    const meta = { role, koms: committeesOf(uid) };
    const offenes = tickets.find((t) => t.status !== "erledigt");
    if (offenes) {
      await postItem(offenes, "nachricht", nachricht, undefined, "", meta);
    } else {
      const titel = nachricht.trim().slice(0, 60);
      const id = await createTopic({
        title: titel,
        tag: "",
        visibility: "stufenteam",
        memberIds: [],
        komiteeSlugs: [],
        kind: "ticket",
      });
      if (id) {
        await postItem(
          { id, title: titel, tag: "", kind: "ticket", status: "offen", pinned: false, admin_only: false, visibility: "stufenteam", parent_id: null, created_by: uid, created_at: new Date().toISOString() },
          "nachricht",
          nachricht,
          undefined,
          "",
          meta,
        );
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="text-xl">🛡️</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold">Stufenteam</div>
          <div className="text-[11px] text-slate-400">Frag hier alles – das Team antwortet dir</div>
        </div>
      </div>

      {banned ? (
        <div className="mt-3">
          <BannHinweis />
        </div>
      ) : (
        <>
          <ChatBlasen
            liste={verlauf}
            uid={uid}
            darfLoeschen={false}
            onDelete={deleteItem}
            leerText="Schreib dem Stufenteam – sie melden sich hier zurück."
          />
          <ChatEingabe wert={text} setWert={setText} onSenden={senden} />
        </>
      )}
    </div>
  );
}

/** Teamansicht: ein Ticket als Chat, mit Erledigt- und Löschen-Knopf. */
function TicketChat({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, deleteItem, deleteTopic, updateTopic, markRead, committeesOf, uid } = useTopics();
  const { role, can, isStaff, banned } = useRole();
  const { profile } = useProfiles();
  const [text, setText] = useState("");

  const liste = items
    .filter((i) => i.topic_id === topic.id)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  useEffect(() => {
    markRead(topic.id);
  }, [topic.id, liste.length, markRead]);

  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  const name = topic.created_by ? profile[topic.created_by]?.anzeigename : "";

  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <Avatar userId={topic.created_by} name={name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{name || "Frage"}</div>
          <div className="truncate text-[11px] text-slate-400">
            {topic.status === "erledigt" ? "erledigt" : topic.title}
          </div>
        </div>
        {isStaff && (
          <>
            <button
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold dark:border-slate-700"
              onClick={() => updateTopic(topic.id, { status: topic.status === "erledigt" ? "offen" : "erledigt" })}
            >
              {topic.status === "erledigt" ? "öffnen" : "erledigt"}
            </button>
            {can("chats.manage") && (
              <button
                className="iconbtn"
                title="Ticket löschen"
                onClick={() => {
                  if (confirm("Diese Frage samt Verlauf löschen?")) {
                    void deleteTopic(topic.id);
                    onBack();
                  }
                }}
              >
                🗑
              </button>
            )}
          </>
        )}
      </div>

      <ChatBlasen liste={liste} uid={uid} darfLoeschen={can("chats.delete_messages")} onDelete={deleteItem} />
      {!banned && <ChatEingabe wert={text} setWert={setText} onSenden={senden} platzhalter="Antworten…" />}
    </div>
  );
}


/** Karte "Stufenteam-Tickets" mit kurzer Statuszeile. */
function TicketUebersichtKarte({
  offene, unread, onOpen,
}: { offene: Topic[]; unread: number; onOpen: () => void }) {
  const { profile } = useProfiles();
  const neueste = offene[0];
  const name = neueste?.created_by ? profile[neueste.created_by]?.anzeigename : "";
  const text =
    offene.length === 0
      ? "gerade keine offenen Fragen"
      : offene.length === 1
        ? `Es gibt 1 neue Mitteilung von ${name || "einer Person"}: ${neueste.title}`
        : `Es gibt ${offene.length} neue Mitteilungen`;

  return (
    <button onClick={onOpen} className="card flex w-full items-center gap-3 p-4 text-left transition active:scale-[.99]">
      <span className="text-xl">🛡️</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">Stufenteam-Tickets</span>
        <span className="block truncate text-[12px] text-slate-400">{text}</span>
      </span>
      {unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      <span className="text-slate-300">›</span>
    </button>
  );
}

/** Alle Tickets der Stufe – nur fürs Team. */
function TicketListe({
  offene, erledigt, onBack, onOpen,
}: { offene: Topic[]; erledigt: Topic[]; onBack: () => void; onOpen: (id: string) => void }) {
  const { unreadCount } = useTopics();
  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 mb-3 flex items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="text-xl">🛡️</span>
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold">Stufenteam-Tickets</div>
      </div>

      {offene.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Gerade keine offenen Fragen.</p>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {offene.map((t) => (
            <TicketCard key={t.id} topic={t} unread={unreadCount(t.id)} onOpen={() => onOpen(t.id)} />
          ))}
        </div>
      )}

      {erledigt.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-400">
            Erledigt ({erledigt.length})
          </summary>
          <div className="mt-2 grid gap-2.5 lg:grid-cols-2">
            {erledigt.map((t) => (
              <TicketCard key={t.id} topic={t} unread={0} onOpen={() => onOpen(t.id)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
