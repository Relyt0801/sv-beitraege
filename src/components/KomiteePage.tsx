import { useEffect, useMemo, useState } from "react";
import { useTopics, type Topic, type TopicItem } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { WerHatGestimmt } from "./WerHatGestimmt";
import { Avatar, PersonName } from "./Avatar";
import { ChatBlase, ChatBlasen, ChatEbene, ChatEingabe, ChatKopf, SystemZeile } from "./ChatBlasen";
import { BannHinweis } from "./BannHinweis";
import { Sheet, SheetKopf } from "./Sheet";
import { useChatEnde } from "../lib/gescrollt";
import { VorsitzZeile } from "./VorsitzSheet";
import { Icon } from "./Icon";

import { frage } from "../lib/melder";
import { AbstimmungKarte, NeuEintragSheet, type NeuDaten } from "./Freitext";
type Neu = "pin" | "umfrage" | "todo" | null;

/**
 * Eine Komitee-Seite: oben das Wichtige (Angepinntes, Abstimmungen, To-dos),
 * unten an fester Stelle der Chat.
 */
export function KomiteePage({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { items, postItem, updateItem, deleteItem, markRead, uid, committeesOf, unreadCount } = useTopics();
  const { role, can, banned } = useRole();
  const darfLoeschen = can("chats.delete_messages");
  // To-dos, Abstimmungen und Angepinntes anderer löschen (eigenes Recht, 28.09.)
  const darfEintraege = can("chats.delete_items");
  const [neu, setNeu] = useState<Neu>(null);
  // Man landet im Chat; die Übersicht (Angepinntes, Abstimmungen, To-dos)
  // ist der zweite Knopf daneben. Beide haben ihren eigenen roten Punkt und
  // ihre eigene Gelesen-Marke.
  const [tab, setTab] = useState<"uebersicht" | "chat">("chat");

  const alle = useMemo(
    () => items.filter((i) => i.topic_id === topic.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [items, topic.id],
  );
  const pins = alle.filter((i) => i.type === "nachricht" && i.pinned);
  const umfragen = alle.filter((i) => i.type === "umfrage");
  const todos = alle.filter((i) => i.type === "todo");
  const chat = alle.filter((i) => (i.type === "nachricht" && !i.pinned) || i.type === "system");

  // Gelesen wird nur, was man gerade sieht
  useEffect(() => {
    markRead(topic.id, tab);
  }, [topic.id, tab, alle.length, markRead]);

  const titel = topic.tag ? committeeLabel(topic.tag) : topic.title;
  const icon = topic.tag ? committeeIcon(topic.tag) : "💬";

  // Die Übersicht beginnt oben (der Chat dagegen unten bei der neuesten Nachricht)
  useEffect(() => {
    if (tab !== "uebersicht") return;
    const r = requestAnimationFrame(() => document.querySelector("[data-chat-scroller]")?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(r);
  }, [tab]);

  // Eigene Nachricht im Chat
  const [text, setText] = useState("");
  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  /* Zwei Knöpfe: Chat (Standard) und Übersicht – jeder mit eigenem roten Punkt.
     Als schlankes Segment direkt unter der Kopfleiste (vorher ein dunkler
     Balken mitten auf der Seite). */
  const segment = (
    <div className="seg">
      {(["chat", "uebersicht"] as const).map((k) => {
        const n = tab === k ? 0 : unreadCount(topic.id, k);
        return (
          <button
            key={k}
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`seg-item flex items-center justify-center gap-1.5 ${tab === k ? "seg-aktiv" : ""}`}
          >
            {k === "chat" ? "Chat" : "Übersicht"}
            {n > 0 && (
              <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold text-white">
                {n > 9 ? "9+" : n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  /* Wie ein Chat in iMessage: eine Vollbild-Ebene über der App mit EINER
     Glas-Kopfleiste (Zurück, Name, darunter Chat | Übersicht) und der
     Eingabe bzw. den Neu-Knöpfen unten. */
  return (
    <ChatEbene
      label={titel}
      kopf={
        <ChatKopf onBack={onBack} symbol={icon} titel={titel} unter={topic.tag ? "Komitee" : "Chat"}>
          {segment}
        </ChatKopf>
      }
      fuss={
        banned ? undefined : tab === "chat" ? (
          <ChatEingabe wert={text} setWert={setText} onSenden={() => void senden()} />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <NeuKnopf icon="📌" label="Anpinnen" onClick={() => setNeu("pin")} />
            <NeuKnopf icon="🗳️" label="Abstimmung" onClick={() => setNeu("umfrage")} />
            <NeuKnopf icon="✅" label="To-do" onClick={() => setNeu("todo")} />
          </div>
        )
      }
    >
      {banned && (
        <div className="mt-3">
          <BannHinweis />
        </div>
      )}

      {tab === "uebersicht" ? (
        <div className="space-y-5 py-3">
          {/* Wer hier den Vorsitz hat, darf Termine anfragen. */}
          {topic.tag && <VorsitzZeile tag={topic.tag} />}

          <Abschnitt titel="Angepinnt" icon="📌" leer="Nichts angepinnt.">
            {pins.map((p) => (
              <div key={p.id} className="card flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold [overflow-wrap:anywhere]">{p.body}</div>
                  <PersonName userId={p.created_by} name={p.author} role={p.author_role} koms={p.author_koms} className="text-[11px] font-semibold" />
                </div>
                {(p.created_by === uid || darfLoeschen || darfEintraege) && (
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    {(p.created_by === uid || darfLoeschen) && <button
                      onClick={() => void frage("Nicht mehr anpinnen? Die Nachricht wandert in den Chat.", "Loslösen").then((ok) => { if (ok) void updateItem(p.id, { pinned: false }); })}
                      className="text-[12px] font-semibold text-tinte-leise"
                      aria-label="Loslösen"
                      title="Loslösen – bleibt im Chat"
                    >
                      📌✕
                    </button>}
                    <button
                      onClick={() => void frage("Diese angepinnte Nachricht ganz löschen?", "Löschen", true).then((ok) => { if (ok) void deleteItem(p.id); })}
                      className="text-[12px] font-bold text-red-500"
                      aria-label="Löschen"
                    >
                      löschen
                    </button>
                  </span>
                )}
              </div>
            ))}
          </Abschnitt>

          <Abschnitt titel="Abstimmungen" icon="🗳️" leer="Keine Abstimmung offen.">
            {umfragen.map((u) => (
              <UmfrageKarte key={u.id} item={u} kannLoeschen={u.created_by === uid || darfEintraege} onDelete={() => deleteItem(u.id)} />
            ))}
          </Abschnitt>

          <Abschnitt titel="To-dos" icon="✅" leer="Keine offenen Aufgaben.">
            {todos.map((t) => (
              <div key={t.id} className="card flex w-full items-center gap-1 p-1.5">
                <button
                  onClick={() => !banned && updateItem(t.id, { done: !t.done })}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm text-white ${
                      t.done ? "border-emerald-500 bg-emerald-500" : "border-papier-linie dark:border-slate-600"
                    }`}
                  >
                    {t.done ? "✓" : ""}
                  </span>
                  <span className={`min-w-0 flex-1 text-[15px] [overflow-wrap:anywhere] ${t.done ? "text-tinte-leise line-through" : "font-semibold"}`}>
                    {t.body}
                  </span>
                  <PersonName userId={t.created_by} name={t.author} role={t.author_role} koms={t.author_koms} className="shrink-0 text-[11px] font-semibold" />
                </button>
                {(t.created_by === uid || darfEintraege) && (
                  <button
                    onClick={() => void frage("To-do löschen?", "Löschen", true).then((ok) => { if (ok) void deleteItem(t.id); })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:scale-90"
                    aria-label="To-do löschen"
                    title="To-do löschen"
                  >
                    <Icon name="muell" size={16} />
                  </button>
                )}
              </div>
            ))}
          </Abschnitt>


        </div>
      ) : (
        <ChatBlasen liste={chat} uid={uid} darfLoeschen={darfLoeschen} onDelete={(id) => void deleteItem(id)} />
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
              poll: { multi: daten.multi, anon: daten.anon, deadline: daten.frist, antwortArt: daten.antwortArt, eigene: daten.eigene },
            });
          setNeu(null);
        }}
      />
    </ChatEbene>
  );
}

function Abschnitt({
  titel, icon, leer, children,
}: { titel: string; icon: string; leer: string; children: React.ReactNode }) {
  const hat = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">
        {icon} {titel}
      </h3>
      {hat ? <div className="grid gap-2 lg:grid-cols-2">{children}</div> : <p className="text-sm text-tinte-leise">{leer}</p>}
    </section>
  );
}

function NeuKnopf({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-full bg-[rgb(118_118_128/0.12)] px-2 text-center text-[13.5px] font-semibold text-brand-dark transition active:scale-[.97] dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Karte einer Abstimmung – gebaut in Freitext.tsx (AbstimmungKarte): Ergebnis
 * mit Prozent und Anzahl, führende Möglichkeit hervorgehoben, „Eigene Antwort“
 * mit gruppierten Texten.
 */
function UmfrageKarte(props: { item: TopicItem; kannLoeschen: boolean; onDelete: () => void }) {
  return <AbstimmungKarte {...props} />;
}

function ChatBereich({
  topic, liste, banned, darfLoeschen, uid,
}: { topic: Topic; liste: TopicItem[]; banned: boolean; darfLoeschen: boolean; uid: string }) {
  const { postItem, deleteItem, committeesOf } = useTopics();
  const { role } = useRole();
  const [text, setText] = useState("");
  const ende = useChatEnde(liste.length, liste[liste.length - 1]?.created_by === uid);

  async function senden() {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await postItem(topic, "nachricht", t, undefined, "", { role, koms: committeesOf(uid) });
  }

  return (
    <div className="flex flex-col">
      <div className="space-y-2.5 py-3">
        {liste.length === 0 && <p className="py-12 text-center text-sm text-tinte-leise">Noch keine Nachricht.</p>}
        {liste.map((m) => {
          if (m.type === "system") return <SystemZeile key={m.id} m={m} darfLoeschen={darfLoeschen} onDelete={(id) => void deleteItem(id)} />;
          return <ChatBlase key={m.id} m={m} meins={m.created_by === uid} darfLoeschen={darfLoeschen} onDelete={(id) => void deleteItem(id)} />;
        })}
        {/* Platz für Eingabezeile und Tab-Leiste, Scroll-Marke dahinter */}
        <div aria-hidden className="h-8 lg:h-4" />
        <div ref={ende} />
      </div>

      {!banned && (
        <div className="fixed inset-x-0 bottom-[var(--leiste)] lg:bottom-0 lg:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 flex items-end gap-2 border-t border-papier-linie bg-papier-matt/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
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

/** Blatt zum Anlegen (Angepinntes, Abstimmung, To-do) – gebaut in Freitext.tsx */
function NeuSheet({ art, onClose, onSave }: { art: Neu; onClose: () => void; onSave: (d: NeuDaten) => void }) {
  return <NeuEintragSheet art={art} onClose={onClose} onSave={onSave} />;
}
