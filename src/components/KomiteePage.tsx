import { useEffect, useMemo, useState } from "react";
import { useTopics, type Topic, type TopicItem } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { PersonName } from "./Avatar";
import { ChatBlasen, ChatEbene, ChatEingabe, ChatKopf } from "./ChatBlasen";
import { BannHinweis } from "./BannHinweis";
import { Sheet, SheetKopf } from "./Sheet";
import { VorsitzZeile } from "./VorsitzSheet";
import { Icon, type IconName } from "./Icon";
import { Gruppe, Symbol, Zeile } from "./Liste";

import { frage } from "../lib/melder";
import { AbstimmungKarte, NeuEintragSheet, type NeuDaten } from "./Freitext";
type Neu = "pin" | "umfrage" | "todo" | null;

/** Die drei Dinge, die man im Komitee anlegen kann – für das „+“ im Chat und die Knöpfe in der Übersicht. */
const NEU_ARTEN: { art: Exclude<Neu, null>; label: string; unter: string; icon: IconName; farbe: string }[] = [
  { art: "umfrage", label: "Abstimmung", unter: "Alle im Komitee stimmen ab", icon: "umfrage", farbe: "bg-[#5E5CE6]" },
  { art: "todo", label: "To-do", unter: "Eine Aufgabe, die jemand abhakt", icon: "haken", farbe: "bg-[#248A3D]" },
  { art: "pin", label: "Anpinnen", unter: "Kurze Info, die oben stehen bleibt", icon: "pin", farbe: "bg-[#E8590C]" },
];

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
  // „+“ links in der Eingabezeile: Blatt „Abstimmung · To-do · Anpinnen“
  const [neuMenue, setNeuMenue] = useState(false);
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
  const icon = topic.tag ? committeeIcon(topic.tag) : <Icon name="chats" size={17} />;

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
      // Die Übersicht beginnt oben (Angepinntes zuerst), der Chat unten bei der neuesten Nachricht
      start={tab === "uebersicht" ? "oben" : "unten"}
      kopf={
        <ChatKopf onBack={onBack} symbol={icon} titel={titel} unter={topic.tag ? "Komitee" : "Chat"}>
          {segment}
        </ChatKopf>
      }
      fuss={
        banned ? undefined : tab === "chat" ? (
          <ChatEingabe
            wert={text}
            setWert={setText}
            onSenden={() => void senden()}
            links={
              <button
                type="button"
                onClick={() => setNeuMenue(true)}
                aria-label="Neu: Abstimmung, To-do oder Anpinnen"
                title="Abstimmung, To-do oder Anpinnen"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-brand-dark transition duration-200 ease-ios active:scale-90 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
              >
                <Icon name="plus" size={20} strich={2.4} />
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {NEU_ARTEN.map((n) => (
              <NeuKnopf key={n.art} icon={n.icon} label={n.label} onClick={() => setNeu(n.art)} />
            ))}
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
        // Am Rechner: Angepinnt und To-dos (kurze Listen) nebeneinander,
        // die Abstimmungen (Karten) darunter über die volle Breite
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 py-3 lg:grid-cols-2 lg:items-start">
          {/* Wer hier den Vorsitz hat, darf Termine anfragen. */}
          {topic.tag && (
            <div className="empty:hidden lg:col-span-2">
              <VorsitzZeile tag={topic.tag} />
            </div>
          )}

          <Abschnitt titel="Angepinnt" leer="Nichts angepinnt. Mit „Anpinnen“ bleibt eine Info hier oben stehen." zellen>
            {pins.map((p) => (
              <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className="mt-[3px] shrink-0 text-[#E8590C] dark:text-[#FF9F0A]">
                  <Icon name="pin" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.body}</div>
                  <PersonName userId={p.created_by} name={p.author} role={p.author_role} koms={p.author_koms} className="text-[12px] font-semibold" />
                  {(p.created_by === uid || darfLoeschen || darfEintraege) && (
                    <div className="-mb-2.5 mt-0.5 flex gap-5">
                      {(p.created_by === uid || darfLoeschen) && (
                        <button
                          onClick={() => void frage("Nicht mehr anpinnen? Die Nachricht wandert in den Chat.", "Loslösen").then((ok) => { if (ok) void updateItem(p.id, { pinned: false }); })}
                          className="py-2.5 text-[14px] font-semibold text-brand-dark dark:text-brand"
                          title="Loslösen – bleibt im Chat"
                        >
                          Loslösen
                        </button>
                      )}
                      <button
                        onClick={() => void frage("Diese angepinnte Nachricht ganz löschen?", "Löschen", true).then((ok) => { if (ok) void deleteItem(p.id); })}
                        className="py-2.5 text-[14px] font-semibold text-red-600 dark:text-red-400"
                      >
                        Löschen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Abschnitt>

          <Abschnitt titel="Abstimmungen" leer="Keine Abstimmung offen. Mit „Abstimmung“ unten startest du eine." className="lg:order-last lg:col-span-2">
            {umfragen.map((u) => (
              <UmfrageKarte key={u.id} item={u} kannLoeschen={u.created_by === uid || darfEintraege} onDelete={() => deleteItem(u.id)} />
            ))}
          </Abschnitt>

          <Abschnitt titel="To-dos" leer="Keine offenen Aufgaben. Mit „To-do“ unten legst du eine an." zellen>
            {todos.map((t) => (
              <div key={t.id} className="flex items-center">
                <button
                  onClick={() => !banned && updateItem(t.id, { done: !t.done })}
                  className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                  aria-pressed={t.done}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
                      t.done ? "bg-[#248A3D]" : "ring-[1.5px] ring-inset ring-black/25 dark:ring-white/35"
                    }`}
                  >
                    {t.done && <Icon name="haken" size={14} strich={3} />}
                  </span>
                  <span className={`min-w-0 flex-1 text-[15px] leading-snug [overflow-wrap:anywhere] ${t.done ? "text-tinte-leise line-through" : "font-semibold"}`}>
                    {t.body}
                  </span>
                  <PersonName userId={t.created_by} name={t.author} role={t.author_role} koms={t.author_koms} className="max-w-[7rem] shrink-0 truncate text-[12px] font-semibold" />
                </button>
                {(t.created_by === uid || darfEintraege) && (
                  <button
                    onClick={() => void frage("To-do löschen?", "Löschen", true).then((ok) => { if (ok) void deleteItem(t.id); })}
                    className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:scale-90"
                    aria-label="To-do löschen"
                    title="To-do löschen"
                  >
                    <Icon name="muell" size={17} />
                  </button>
                )}
              </div>
            ))}
          </Abschnitt>
        </div>
      ) : (
        <ChatBlasen liste={chat} uid={uid} darfLoeschen={darfLoeschen} onDelete={(id) => void deleteItem(id)} />
      )}

      {/* „+“ im Chat: erst wählen, was angelegt werden soll */}
      <Sheet open={neuMenue} onClose={() => setNeuMenue(false)}>
        <SheetKopf titel="Neu im Chat" onClose={() => setNeuMenue(false)} />
        <Gruppe
          className="mt-0"
          fuss="Abstimmungen, To-dos und Angepinntes stehen danach oben unter „Übersicht“."
        >
          {NEU_ARTEN.map((n) => (
            <Zeile
              key={n.art}
              label={n.label}
              unter={n.unter}
              symbol={
                <Symbol farbe={n.farbe}>
                  <Icon name={n.icon} size={17} strich={2.2} />
                </Symbol>
              }
              onClick={() => {
                setNeuMenue(false);
                setNeu(n.art);
              }}
            />
          ))}
        </Gruppe>
      </Sheet>

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

/**
 * Abschnitt der Übersicht: kleine Versalien-Überschrift (wie bei Gruppe), darunter
 * entweder eine Zellen-Gruppe (zellen: Angepinntes, To-dos) oder einzelne Karten
 * (Abstimmungen). Leer: ein ruhiger Satz, der sagt, wie man etwas anlegt.
 */
function Abschnitt({
  titel, leer, zellen, className = "", children,
}: { titel: string; leer: string; zellen?: boolean; className?: string; children: React.ReactNode }) {
  const hat = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className={`min-w-0 ${className}`}>
      <h3 className="mb-1.5 px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">{titel}</h3>
      {!hat ? (
        <div className="gruppe-zellen">
          <p className="px-4 py-3 text-[14px] leading-snug text-tinte-leise">{leer}</p>
        </div>
      ) : zellen ? (
        <div className="gruppe-zellen">{children}</div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

function NeuKnopf({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-full bg-[rgb(118_118_128/0.12)] px-2 text-center text-[13.5px] font-semibold text-brand-dark transition active:scale-[.97] dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
    >
      <Icon name={icon} size={16} strich={2.2} />
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

/** Blatt zum Anlegen (Angepinntes, Abstimmung, To-do) – gebaut in Freitext.tsx */
function NeuSheet({ art, onClose, onSave }: { art: Neu; onClose: () => void; onSave: (d: NeuDaten) => void }) {
  return <NeuEintragSheet art={art} onClose={onClose} onSave={onSave} />;
}
