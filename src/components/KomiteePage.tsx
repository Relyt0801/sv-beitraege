import { Children, isValidElement, useEffect, useMemo, useState } from "react";
import { useTopics, type Topic, type TopicItem } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { useBreit } from "../lib/gescrollt";
import { PersonName } from "./Avatar";
import { ChatBlasen, ChatEbene, ChatEingabe, ChatKopf } from "./ChatBlasen";
import { BannHinweis } from "./BannHinweis";
import { Sheet, SheetKopf } from "./Sheet";
import { VorsitzZeile } from "./VorsitzSheet";
import { Icon, type IconName } from "./Icon";
import { Gruppe, Symbol, Zeile, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";

import { frage } from "../lib/melder";
import { AbstimmungKarte, NeuEintragSheet, type NeuDaten } from "./Freitext";
type Neu = "pin" | "umfrage" | "todo" | null;
/** Die beiden Teile einer Komitee-Seite. Intern heißt die Pinnwand weiter „uebersicht“ (Gelesen-Marken, Datenbank). */
export type KomiteeTeil = "chat" | "uebersicht";

/** Die drei Dinge, die man im Komitee anlegen kann – für das „+“ im Chat und die Knöpfe auf der Pinnwand. */
const NEU_ARTEN: { art: Exclude<Neu, null>; label: string; unter: string; icon: IconName; farbe: string }[] = [
  { art: "umfrage", label: "Abstimmung", unter: "Alle im Komitee stimmen ab", icon: "umfrage", farbe: "bg-[#5E5CE6]" },
  { art: "todo", label: "To-do", unter: "Eine Aufgabe, die jemand abhakt", icon: "haken", farbe: "bg-[#248A3D]" },
  { art: "pin", label: "Anpinnen", unter: "Kurze Info, die oben stehen bleibt", icon: "pin", farbe: "bg-[#E8590C]" },
];

const abgelaufen = (u: TopicItem) => Boolean(u.poll_deadline) && new Date(u.poll_deadline!).getTime() < Date.now();
const datumKurz = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Eine Komitee-Seite: Chat und Pinnwand (Angepinntes, To-dos, Abstimmungen).
 *
 * Die Pinnwand hieß bis Okt. 2026 „Übersicht“ – am Laptop stand dann
 * „Chat | Übersicht“ direkt über dem App-Reiter „Übersicht“ (Startseite).
 */
export function KomiteePage({
  topic,
  onBack,
  startTeil,
  onTeil,
}: {
  topic: Topic;
  onBack: () => void;
  /** Mit welchem Teil die Seite aufgeht (z. B. aus der Vorschau im Chats-Reiter) */
  startTeil?: KomiteeTeil;
  /** Meldet jeden Wechsel Chat ⇄ Pinnwand (der Chats-Reiter merkt sich den Stand) */
  onTeil?: (t: KomiteeTeil) => void;
}) {
  const { items, postItem, updateItem, deleteItem, markRead, uid, committeesOf, unreadCount, myVotes } = useTopics();
  const { role, can, banned } = useRole();
  const breit = useBreit();
  const darfLoeschen = can("chats.delete_messages");
  // To-dos, Abstimmungen und Angepinntes anderer löschen (eigenes Recht, 28.09.)
  const darfEintraege = can("chats.delete_items");
  const [neu, setNeu] = useState<Neu>(null);
  // „+“ links in der Eingabezeile (am Laptop auf der Pinnwand: „Neu“ oben rechts):
  // Blatt „Abstimmung · To-do · Anpinnen“
  const [neuMenue, setNeuMenue] = useState(false);
  // Angepinntes oder To-do im Blatt (Details, Loslösen, Löschen)
  const [eintragId, setEintragId] = useState<string | null>(null);
  // Man landet im Chat; die Pinnwand ist der zweite Knopf daneben. Beide haben
  // ihren eigenen roten Punkt und ihre eigene Gelesen-Marke. Ist im Chat nichts
  // Neues, auf der Pinnwand aber schon, geht die Seite gleich dort auf – sonst
  // landete man im leeren Chat, und die rote Zahl der Kachel war nirgends zu sehen.
  const [tab, setTab] = useState<KomiteeTeil>(
    () => startTeil ?? (unreadCount(topic.id, "chat") === 0 && unreadCount(topic.id, "uebersicht") > 0 ? "uebersicht" : "chat"),
  );
  useEffect(() => {
    onTeil?.(tab);
    // onTeil ist meist eine neue Funktion je Zeichnen – nur der Wechsel zählt
  }, [tab]);

  const alle = useMemo(
    () => items.filter((i) => i.topic_id === topic.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [items, topic.id],
  );
  // Angepinntes: das Neueste oben
  const pins = alle.filter((i) => i.type === "nachricht" && i.pinned).reverse();
  // Abstimmungen: erst die offenen ohne eigene Stimme, dann die offenen, zuletzt
  // die beendeten (vorher stand eine beendete ganz oben); jeweils die neueste zuerst
  // Die Reihenfolge wird nur beim Öffnen und bei neuen Abstimmungen festgelegt –
  // sonst spränge eine Karte direkt nach dem Abstimmen nach unten weg.
  const alleUmfragen = alle.filter((i) => i.type === "umfrage");
  const umfrageIds = alleUmfragen.map((u) => u.id).join(",");
  const reihe = useMemo(() => {
    const rang = (u: TopicItem) => (abgelaufen(u) ? 2 : !u.antwort_art && !(myVotes[u.id] || []).length ? 0 : 1);
    const sortiert = [...alleUmfragen].sort((a, b) => rang(a) - rang(b) || (a.created_at < b.created_at ? 1 : -1));
    return new Map(sortiert.map((u, i) => [u.id, i]));
    // Absichtlich nur bei neuen/entfernten Abstimmungen neu (myVotes bewusst nicht)
  }, [umfrageIds]);
  const umfragen = [...alleUmfragen].sort((a, b) => (reihe.get(a.id) ?? -1) - (reihe.get(b.id) ?? -1));
  // To-dos: offene vor erledigten, sonst in der Reihenfolge des Anlegens
  const todos = alle.filter((i) => i.type === "todo").sort((a, b) => Number(a.done) - Number(b.done));
  const chat = alle.filter((i) => (i.type === "nachricht" && !i.pinned) || i.type === "system");
  const eintrag = eintragId ? alle.find((i) => i.id === eintragId) ?? null : null;

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

  /* Zwei Knöpfe: Chat (Standard) und Pinnwand – jeder mit eigenem roten Punkt.
     Als schlankes Segment direkt unter der Kopfleiste (am Laptop rechts in
     der Kopfzeile). */
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
            {k === "chat" ? "Chat" : "Pinnwand"}
            {n > 0 && (
              <span className="zahl flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[12px] font-bold leading-none text-white">
                {n > 9 ? "9+" : n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Am Laptop: „Neu“ oben rechts in der Kopfzeile (wie „+ Neu“ der App) statt
  // drei seitenbreiter Knöpfe unten. Am Handy bleiben sie unten, genau dort,
  // wo im Chat die Eingabe steht.
  const neuOben = tab === "uebersicht" && breit && !banned;
  const wo = neuOben ? "über „Neu“ oben rechts" : null;

  return (
    <ChatEbene
      label={titel}
      onSchliessen={onBack}
      // Die Pinnwand beginnt oben (Angepinntes zuerst), der Chat unten bei der neuesten Nachricht
      start={tab === "uebersicht" ? "oben" : "unten"}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={icon}
          titel={titel}
          unter={topic.tag ? "Komitee" : "Chat"}
          rechts={
            neuOben ? (
              <button type="button" className="btn-klein" onClick={() => setNeuMenue(true)}>
                <Icon name="plus" size={16} strich={2.6} />
                Neu
              </button>
            ) : undefined
          }
        >
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
        ) : breit ? undefined : (
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
        // Auf jedem Gerät dieselbe Reihenfolge: Angepinnt → To-dos → Abstimmungen.
        // Am Rechner stehen Angepinnt und To-dos (kurze Listen) nebeneinander,
        // die Abstimmungen (Karten) darunter über die volle Breite – DOM und
        // Anzeige stimmen überein (Tab-Taste, Vorlesen).
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 py-3 lg:grid-cols-2 lg:items-start">
          <Abschnitt
            titel="Angepinnt"
            leer={`Nichts angepinnt. ${wo ? `Eine Info, die oben stehen bleibt, legst du ${wo} an.` : "Mit „Anpinnen“ unten bleibt eine Info hier oben stehen."}`}
            zellen
          >
            {pins.map((p) => {
              const darf = p.created_by === uid || darfLoeschen || darfEintraege;
              const inhalt = (
                <>
                  <span aria-hidden className="mt-[3px] shrink-0 text-[#E8590C] dark:text-[#FF9F0A]">
                    <Icon name="pin" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{p.body}</span>
                    <PersonName userId={p.created_by} name={p.author} role={p.author_role} koms={p.author_koms} className="text-[12px] font-semibold" />
                  </span>
                </>
              );
              // Mit Recht: ganze Zeile antippbar → Blatt (Loslösen, Löschen) – keine Textknöpfe je Zeile
              return darf ? (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEintragId(p.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                >
                  {inhalt}
                  <span aria-hidden className="shrink-0 self-center text-[17px] leading-none text-tinte-leise">›</span>
                </button>
              ) : (
                <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                  {inhalt}
                </div>
              );
            })}
          </Abschnitt>

          <Abschnitt
            titel="To-dos"
            leer={`Keine offenen Aufgaben. ${wo ? `Eine neue legst du ${wo} an.` : "Mit „To-do“ unten legst du eine an."}`}
            zellen
          >
            {todos.map((t) => (
              // Wie in „Erinnerungen“: der Kreis hakt ab, ein Tipp auf den Text öffnet das To-do
              <div key={t.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => !banned && updateItem(t.id, { done: !t.done })}
                  disabled={banned}
                  aria-pressed={t.done}
                  aria-label={t.done ? `„${t.body}“ wieder öffnen` : `„${t.body}“ abhaken`}
                  className="flex h-[52px] w-12 shrink-0 items-center justify-end pr-1 transition active:scale-90"
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${
                      t.done ? "bg-[#248A3D]" : "ring-[1.5px] ring-inset ring-black/25 dark:ring-white/35"
                    }`}
                  >
                    {t.done && <Icon name="haken" size={14} strich={3} />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setEintragId(t.id)}
                  className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2 pl-2 pr-4 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                >
                  <span className={`min-w-0 flex-1 text-[15px] leading-snug [overflow-wrap:anywhere] ${t.done ? "text-tinte-leise line-through" : "font-semibold"}`}>
                    {t.body}
                  </span>
                  <PersonName userId={t.created_by} name={t.author} role={t.author_role} koms={t.author_koms} className="max-w-[7rem] shrink-0 truncate text-[12px] font-semibold" />
                  <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
                </button>
              </div>
            ))}
          </Abschnitt>

          <Abschnitt
            titel="Abstimmungen"
            leer={`Keine Abstimmung offen. ${wo ? `Eine neue startest du ${wo}.` : "Mit „Abstimmung“ unten startest du eine."}`}
            className="lg:col-span-2"
            zweiSpalten={breit}
          >
            {umfragen.map((u) => (
              <AbstimmungKarte
                key={u.id}
                item={u}
                kannLoeschen={u.created_by === uid || darfEintraege}
                onDelete={() => deleteItem(u.id)}
                // Beendete nur mit Frage und Ergebnis – antippen klappt sie auf
                kompakt
              />
            ))}
          </Abschnitt>

          {/* Wer den Vorsitz hat (darf Termine anfragen) – selten gebraucht, darum am Ende.
              Für Mitglieder ohne festgelegten Vorsitz fällt die Zeile ganz weg. */}
          {topic.tag && (
            <div className="empty:hidden lg:col-span-2">
              <VorsitzZeile tag={topic.tag} />
            </div>
          )}
        </div>
      ) : (
        <ChatBlasen liste={chat} uid={uid} darfLoeschen={darfLoeschen} onDelete={(id) => void deleteItem(id)} />
      )}

      {/* „+“ im Chat bzw. „Neu“ am Laptop: erst wählen, was angelegt werden soll */}
      <Sheet open={neuMenue} onClose={() => setNeuMenue(false)}>
        <SheetKopf titel={topic.tag ? "Neu im Komitee" : "Neu im Chat"} onClose={() => setNeuMenue(false)} />
        <Gruppe className="mt-0" fuss="Abstimmungen, To-dos und Angepinntes stehen danach auf der „Pinnwand“.">
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

      <EintragBlatt
        eintrag={eintrag}
        onClose={() => setEintragId(null)}
        kannLosloesen={Boolean(eintrag && (eintrag.created_by === uid || darfLoeschen))}
        kannLoeschen={Boolean(
          eintrag && (eintrag.created_by === uid || darfEintraege || (eintrag.type === "nachricht" && darfLoeschen)),
        )}
        banned={banned}
        onUpdate={(id, patch) => void updateItem(id, patch)}
        onDelete={(id) => void deleteItem(id)}
      />

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
 * Abschnitt der Pinnwand: kleine Versalien-Überschrift (wie bei Gruppe), darunter
 * entweder eine Zellen-Gruppe (zellen: Angepinntes, To-dos) oder einzelne Karten
 * (Abstimmungen). Leer: ein ruhiger Satz, der sagt, wie man etwas anlegt.
 *
 * zweiSpalten (Laptop): Karten im Spaltensatz statt Raster – im Raster wurde
 * jede Karte so hoch wie ihre Nachbarin (200 px Weiß unter einer kurzen
 * Abstimmung), und eine dritte Karte stand allein in der Mitte.
 */
function Abschnitt({
  titel, leer, zellen, zweiSpalten, className = "", children,
}: { titel: string; leer: string; zellen?: boolean; zweiSpalten?: boolean; className?: string; children: React.ReactNode }) {
  const kinder = Children.toArray(children);
  return (
    <section className={`min-w-0 ${className}`}>
      <h3 className="auf-bild mb-1.5 px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">{titel}</h3>
      {kinder.length === 0 ? (
        <div className="gruppe-zellen">
          <p className="px-4 py-3 text-[14px] leading-snug text-tinte-leise">{leer}</p>
        </div>
      ) : zellen ? (
        <div className="gruppe-zellen">{kinder}</div>
      ) : zweiSpalten && kinder.length > 1 ? (
        // Spaltensatz wie in einer Zeitung: der Browser verteilt die Karten so,
        // dass beide Spalten etwa gleich hoch enden; keine Karte wird geteilt.
        // gap-5 = Spaltenabstand des Rasters darüber (Angepinnt | To-dos) –
        // so fluchten die Karten links und rechts mit den Gruppen oben.
        <div className="columns-2 gap-5">
          {kinder.map((k, i) => (
            <div key={isValidElement(k) && k.key != null ? k.key : i} className="mb-2 break-inside-avoid">
              {k}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">{kinder}</div>
      )}
    </section>
  );
}

/**
 * Ein angepinnter Eintrag oder ein To-do im Blatt: ganzer Text, wer ihn
 * angelegt hat, und die seltenen Aktionen – Loslösen, Abhaken, Löschen (ganz
 * unten, mit Rückfrage). Vorher standen „Loslösen | Löschen“ unter jedem
 * Angepinnten und ein Mülleimer an jedem To-do.
 */
function EintragBlatt({
  eintrag, onClose, kannLosloesen, kannLoeschen, banned, onUpdate, onDelete,
}: {
  eintrag: TopicItem | null;
  onClose: () => void;
  kannLosloesen: boolean;
  kannLoeschen: boolean;
  banned: boolean;
  onUpdate: (id: string, patch: Partial<Pick<TopicItem, "done" | "pinned">>) => void;
  onDelete: (id: string) => void;
}) {
  const e = eintrag;
  const todo = e?.type === "todo";
  return (
    <Sheet open={Boolean(e)} onClose={onClose}>
      {e && (
        <>
          <SheetKopf titel={todo ? "To-do" : "Angepinnt"} onClose={onClose} />
          <div className="gruppe-zellen">
            <div className="px-4 py-3">
              <p className="whitespace-pre-wrap text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{e.body}</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-tinte-leise">
                <PersonName userId={e.created_by} name={e.author} role={e.author_role} koms={e.author_koms} className="min-w-0 truncate font-semibold" />
                <span aria-hidden>·</span>
                <span>{datumKurz(e.created_at)}</span>
              </div>
            </div>
          </div>
          {todo && !banned && (
            <Gruppe>
              <ZeileMitSchalter label="Erledigt">
                <Schalter an={e.done} onChange={(an) => onUpdate(e.id, { done: an })} label="Erledigt" />
              </ZeileMitSchalter>
            </Gruppe>
          )}
          {!todo && kannLosloesen && (
            <Gruppe fuss="Die Nachricht bleibt im Chat stehen, nur nicht mehr oben.">
              <Zeile
                label="Loslösen"
                blau
                onClick={() => {
                  onUpdate(e.id, { pinned: false });
                  onClose();
                }}
              />
            </Gruppe>
          )}
          {kannLoeschen && (
            <Gruppe>
              <Zeile
                label={todo ? "To-do löschen" : "Angepinnte Nachricht löschen"}
                rot
                onClick={() =>
                  void frage(todo ? "To-do löschen?" : "Diese angepinnte Nachricht ganz löschen?", "Löschen", true).then((ok) => {
                    if (!ok) return;
                    onDelete(e.id);
                    onClose();
                  })
                }
              />
            </Gruppe>
          )}
        </>
      )}
    </Sheet>
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

/** Blatt zum Anlegen (Angepinntes, Abstimmung, To-do) – gebaut in Freitext.tsx */
function NeuSheet({ art, onClose, onSave }: { art: Neu; onClose: () => void; onSave: (d: NeuDaten) => void }) {
  return <NeuEintragSheet art={art} onClose={onClose} onSave={onSave} />;
}
