import { useEffect, useMemo, useRef, useState } from "react";
import { useTopics, type Topic } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { UnbanRequests } from "./UnbanRequests";
import { KomiteeRequests } from "./KomiteeRequests";
import { ElternTeamTab } from "./ElternTeamTab";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { KomiteePage } from "./KomiteePage";
import { BannHinweis } from "./BannHinweis";
import { ChatBlasen, ChatEingabe } from "./ChatBlasen";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { normalize } from "../lib/logic";

const TEAM_CHAT_TITLE = "Stufenteam";

/**
 * Chats: pro Komitee ein Chat und der Stufenteam-Chat.
 * Für Schüler fühlt sich der Stufenteam-Chat wie ein normaler Chat an –
 * im Hintergrund entsteht daraus ein Ticket, das das Team beantwortet.
 */
export function ChatsTab() {
  const { topics, members, ready, unreadCount, createTopic, committeesOf, uid } = useTopics();
  const { can, isStaff } = useRole();
  const [anschreiben, setAnschreiben] = useState(false);
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
    // Schüler: eigene Fragen UND Gespräche, die das Team mit ihnen begonnen hat
    () =>
      topics.filter(
        (t) => t.kind === "ticket" && (isStaff || t.created_by === uid || (members[t.id] || []).includes(uid)),
      ),
    [topics, members, isStaff, uid],
  );

  if (!ready)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-tinte-leise">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
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
      {/* Der Chat des Stufenteams – nur fürs Team, ganz oben */}
      {isStaff && teamChat && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">Stufenteam</h3>
          <ChatCard
            titel="Stufenteam-Chat"
            icon="👑"
            unread={unreadCount(teamChat.id)}
            mine
            onOpen={() => setOpenId(teamChat.id)}
          />
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">
          {isStaff ? "Alle Komitees" : "Mein Komitee"}
        </h3>
        {komiteeChats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-papier-linie py-8 text-center text-sm text-tinte-leise dark:border-slate-700">
            {meineKoms.length
              ? "Der Chat wird gerade eingerichtet."
              : "Du bist noch in keinem Komitee. Das Stufenteam kann dich eintragen."}
          </div>
        ) : (
          <div className="grid items-start gap-2.5 lg:grid-cols-2">
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
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">
          {isStaff ? "Gespräche" : "Stufenteam"}
        </h3>

        {/* Bitten aus der Stufe: Komitee wechseln, Sperre aufheben.
            Der Abstand gehoert hierher: vorher stiessen die Elternkarten
            direkt an die Ticketkarte und der Anschreiben-Knopf sass auf ihr.
            grid-cols-1: sonst drueckt ein langer Titel die Seite auf kleinen
            Handys breiter als den Bildschirm. */}
        <div className="grid grid-cols-1 gap-2.5">
        {isStaff ? (
          <>
            <KomiteeRequests />
            <UnbanRequests />
            <TicketUebersichtKarte
              offene={offeneTickets}
              unread={ticketUngelesen}
              onOpen={() => setTicketListe(true)}
              onAnschreiben={() => setAnschreiben(true)}
            />
            <ElternTeamTab />
            <SchuelerAnschreiben open={anschreiben} onClose={() => setAnschreiben(false)} />
          </>
        ) : (
          <ChatCard
            titel="Frag das Stufenteam"
            icon="🛡️"
            unread={ticketUngelesen}
            mine
            onOpen={() => setTeamOffen(true)}
          />
        )}
        </div>
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

function TicketCard({
  topic, unread, onOpen, onDelete,
}: { topic: Topic; unread: number; onOpen: () => void; onDelete?: () => void }) {
  const { profile } = useProfiles();
  const person = useTicketPerson(topic);
  const name = person ? profile[person]?.anzeigename : "";
  return (
    <div className="card flex items-center">
    <button
      onClick={onOpen}
      className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left transition active:scale-[.99]"
    >
      <Avatar userId={person} name={name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{name || "Frage"}</span>
        <span className="block truncate text-[12px] text-tinte-leise">{topic.title}</span>
      </span>
      {unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      {topic.status === "erledigt" && <span className="text-emerald-500">✓</span>}
      <span className="text-slate-300">›</span>
    </button>
    {onDelete && (
      <button
        onClick={onDelete}
        className="mr-2 shrink-0 rounded-lg px-2 py-2 text-tinte-leise transition hover:text-red-500 active:scale-90"
        aria-label="Ticket löschen"
        title="Ticket löschen"
      >
        🗑
      </button>
    )}
    </div>
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
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-papier-linie bg-papier-matt/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="text-xl">🛡️</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold">Stufenteam</div>
          <div className="text-[11px] text-tinte-leise">Frag hier alles, das Team antwortet dir</div>
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
            leerText="Schreib dem Stufenteam, sie melden sich hier zurück."
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

  const person = useTicketPerson(topic);
  const name = person ? profile[person]?.anzeigename : "";

  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 flex items-center gap-2 border-b border-papier-linie bg-papier-matt/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <Avatar userId={person} name={name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold">{name || "Frage"}</div>
          <div className="truncate text-[11px] text-tinte-leise">
            {topic.status === "erledigt" ? "erledigt" : topic.title}
          </div>
        </div>
        {isStaff && (
          <>
            <button
              className="rounded-lg border border-papier-linie px-2.5 py-1.5 text-xs font-bold dark:border-slate-700"
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


/** Karte "Gespräche mit Schülern" – steht direkt über den Gesprächen mit Eltern. */
function TicketUebersichtKarte({
  offene, unread, onOpen, onAnschreiben,
}: { offene: Topic[]; unread: number; onOpen: () => void; onAnschreiben: () => void }) {
  const { profile } = useProfiles();
  const neueste = offene[0];
  const person = useTicketPerson(neueste ?? null);
  const name = person ? profile[person]?.anzeigename : "";
  const text =
    offene.length === 0
      ? "Gerade nichts offen"
      : offene.length === 1
        ? `${name || "Jemand"}: ${neueste.title}`
        : `${offene.length} offen`;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-bold">
          Gespräche mit Schülern
          {unread > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 align-middle text-[11px] font-bold text-white">
              {unread > 9 ? "9+" : unread} neu
            </span>
          )}
        </h2>
        <button onClick={onAnschreiben} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white">
          Anschreiben
        </button>
      </div>
      <button
        onClick={onOpen}
        className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-papier-linie p-3.5 text-left dark:border-slate-700"
      >
        <span className="min-w-0 flex-1 truncate text-[14px] text-tinte-matt dark:text-slate-300">{text}</span>
        <span className="shrink-0 text-[13px] font-bold text-brand">Alle ansehen ›</span>
      </button>
    </section>
  );
}

/** Mit wem läuft das Gespräch? Bei Team-Anfängen die angeschriebene Person. */
function useTicketPerson(topic: Topic | null): string | null {
  const { members } = useTopics();
  const { profiles } = useRole();
  if (!topic) return null;
  const team = new Set(
    profiles.filter((p) => ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"].includes(p.role)).map((p) => p.user_id),
  );
  const kandidaten = [topic.created_by, ...(members[topic.id] || [])].filter(Boolean) as string[];
  return kandidaten.find((u) => !team.has(u)) ?? topic.created_by ?? null;
}

/** Das Team schreibt eine Schülerin / einen Schüler direkt an. */
function SchuelerAnschreiben({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles } = useRole();
  const { students } = useStore();
  const { createTopic, postItem, committeesOf, uid } = useTopics();
  const { role } = useRole();
  const [q, setQ] = useState("");
  const [wer, setWer] = useState<string | null>(null);
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setWer(null);
    setBetreff("");
    setText("");
  }, [open]);

  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const liste = useMemo(() => {
    const n = normalize(q);
    return profiles
      .filter((p) => p.role !== "eltern" && p.student_id && p.user_id !== uid)
      .map((p) => {
        const s = nachId.get(p.student_id!);
        return { id: p.user_id, name: s ? `${s.vorname} ${s.nachname}` : p.username || "?" };
      })
      .filter((x) => !n || normalize(x.name).includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .slice(0, 30);
  }, [profiles, nachId, q, uid]);
  const gewaehlt = liste.find((x) => x.id === wer) ?? (wer ? { id: wer, name: "" } : null);

  async function senden() {
    if (!wer || !betreff.trim() || !text.trim() || busy) return;
    setBusy(true);
    const titel = betreff.trim().slice(0, 60);
    const id = await createTopic({
      title: titel, tag: "", visibility: "stufenteam", memberIds: [wer], komiteeSlugs: [], kind: "ticket",
    });
    if (id) {
      await postItem(
        { id, title: titel, tag: "", kind: "ticket", status: "offen", pinned: false, admin_only: false, visibility: "stufenteam", parent_id: null, created_by: uid, created_at: new Date().toISOString() },
        "nachricht",
        text,
        undefined,
        "",
        { role, koms: committeesOf(uid) },
      );
    }
    setBusy(false);
    if (id) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-extrabold">Schüler anschreiben</h2>
      {!wer ? (
        <>
          <input className="field mt-3" placeholder="Name suchen …" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 grid max-h-[50vh] grid-cols-1 gap-1 overflow-y-auto">
            {liste.map((x) => (
              <li key={x.id}>
                <button
                  onClick={() => setWer(x.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-papier-matt dark:hover:bg-slate-800"
                >
                  <Avatar userId={x.id} name={x.name} size={28} />
                  <span className="truncate text-[14px] font-semibold">{x.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <button onClick={() => setWer(null)} className="mt-3 flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2 text-[14px] font-semibold dark:bg-slate-800">
            <Avatar userId={wer} name={gewaehlt?.name} size={24} />
            {gewaehlt?.name || "Ausgewählt"} <span className="text-tinte-leise">· ändern</span>
          </button>
          <label className="mt-3 block text-[12px] font-semibold text-tinte-leise">Betreff</label>
          <input className="field mt-1" placeholder="z. B. Waffelstand 1. Pause" value={betreff} maxLength={60} onChange={(e) => setBetreff(e.target.value)} />
          <label className="mt-3 block text-[12px] font-semibold text-tinte-leise">Nachricht</label>
          <textarea className="field mt-1 min-h-[90px]" value={text} onChange={(e) => setText(e.target.value)} />
          <button disabled={busy || !betreff.trim() || !text.trim()} onClick={senden} className="btn-primary mt-4 disabled:opacity-40">
            {busy ? "…" : "Senden"}
          </button>
          <p className="mt-2 text-center text-[11px] text-tinte-leise">Kommt als Pop-up an – auch wenn Chat-Meldungen aus sind.</p>
        </>
      )}
    </Sheet>
  );
}

/** Alle Tickets der Stufe – nur fürs Team. */
function TicketListe({
  offene, erledigt, onBack, onOpen,
}: { offene: Topic[]; erledigt: Topic[]; onBack: () => void; onOpen: (id: string) => void }) {
  const { unreadCount, deleteTopic } = useTopics();
  const loeschen = (t: Topic) => () => {
    if (confirm(`Das Ticket „${t.title}" endgültig löschen?\n\nAlle Nachrichten darin verschwinden.`))
      void deleteTopic(t.id);
  };
  return (
    <div>
      <div className="sticky top-[52px] z-10 -mx-3 mb-3 flex items-center gap-2 border-b border-papier-linie bg-papier-matt/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-5 sm:px-5">
        <button className="iconbtn" onClick={onBack} aria-label="Zurück">‹</button>
        <span className="text-xl">🎓</span>
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold">Gespräche mit Schülern</div>
      </div>

      {offene.length === 0 ? (
        <p className="py-8 text-center text-sm text-tinte-leise">Gerade keine offenen Fragen.</p>
      ) : (
        <div className="grid items-start gap-2.5 lg:grid-cols-2">
          {offene.map((t) => (
            <TicketCard key={t.id} topic={t} unread={unreadCount(t.id)} onOpen={() => onOpen(t.id)} onDelete={loeschen(t)} />
          ))}
        </div>
      )}

      {erledigt.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-tinte-leise">
            Erledigt ({erledigt.length})
          </summary>
          <div className="mt-2 grid items-start gap-2.5 lg:grid-cols-2">
            {erledigt.map((t) => (
              <TicketCard key={t.id} topic={t} unread={0} onOpen={() => onOpen(t.id)} onDelete={loeschen(t)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
