import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { scrollSperren } from "../lib/scrollsperre";
import { useBreit } from "../lib/gescrollt";
import { Icon } from "./Icon";
import { Sheet, SheetKopf, useEscapeSchliesst, ZurueckKnopf } from "./Sheet";
import { REAKTIONEN, erstesEmoji, useTopicsOptional, type Reaktion, type TopicItem } from "../topics-store";
import { Avatar, PersonName } from "./Avatar";
import { MuteKnopf } from "./MuteKnopf";
import { Gruppe, Zeile } from "./Liste";
import { useProfiles } from "../profiles-store";
import { lesbarerName } from "../lib/profil";
import { melden } from "../lib/melden";
import { fehlerText } from "../lib/netz";

import { frage, melde, meldeFehler } from "../lib/melder";
/**
 * Nachrichtenliste im WhatsApp-Stil: fremde Nachrichten links mit Kreis (oben, auf Höhe des Namens) und
 * farbigem Namen in der Blase, eigene rechts ohne Namen.
 */
/**
 * Eine Nachricht. Der Kreis mit den Initialen steht oben auf Höhe des Namens –
 * bei fremden Nachrichten links, bei eigenen rechts. Gilt für alle
 * Nachrichten, alte wie neue (die Darstellung kommt aus der App, nicht aus der
 * Nachricht).
 */
export function ChatBlase({
  m, meins, darfLoeschen, onDelete,
}: {
  m: TopicItem;
  meins: boolean;
  darfLoeschen: boolean;
  onDelete: (id: string) => void;
}) {
  const kreis = (
    <span className="mt-0.5 shrink-0">
      <Avatar userId={m.created_by} name={m.author} size={28} />
    </span>
  );
  const topics = useTopicsOptional();
  const blase = useRef<HTMLDivElement>(null);
  const [menue, setMenue] = useState<DOMRect | null>(null);
  // true = über das Reaktions-Schildchen geöffnet: zeigt, wer wie reagiert hat
  const [werListe, setWerListe] = useState(false);
  const halten = useLangDruck(() => {
    if (!blase.current || m.nicht_gesendet) return;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* nicht überall erlaubt */
    }
    setWerListe(false);
    setMenue(blase.current.getBoundingClientRect());
  });
  const reaktionen = topics?.reaktionen[m.id] || [];
  const meine = reaktionen.find((r) => r.user_id === topics?.uid)?.emoji ?? null;
  const reagieren = (e: Reaktion | null) => void topics?.reagieren(m.id, e);

  return (
    <div className={`flex items-start gap-2 ${meins ? "justify-end" : "justify-start"}`}>
      {!meins && kreis}
      {/* min-w-0: sonst darf ein langes Wort/Link die Spalte über den Rand schieben (Flex-Kinder
          sind standardmäßig nie schmaler als ihr längstes Wort) */}
      <div className={`flex min-w-0 max-w-[78%] flex-col sm:max-w-[65%] lg:max-w-[50%] ${meins ? "items-end" : "items-start"}`}>
      <div className={`relative min-w-0 max-w-full ${reaktionen.length > 0 ? "mb-[18px]" : ""}`}>
      <div
        ref={blase}
        {...halten}
        className={`max-w-full select-none rounded-2xl px-3.5 py-2 transition [-webkit-touch-callout:none] ${
          menue ? "scale-[1.03]" : ""
        } ${meins ? "bg-brand text-white" : "bg-white shadow-card dark:bg-slate-900 dark:shadow-cardDark"}`}
      >
        <PersonName
          userId={m.created_by}
          name={m.author}
          role={m.author_role}
          koms={m.author_koms}
          className={`mb-0.5 block text-[12px] font-bold leading-tight ${meins ? "text-right" : ""}`}
          aufFarbig={meins}
        />
        {/* overflow-wrap:anywhere (statt break-words) zählt beim Berechnen der Mindestbreite mit –
            so brechen auch 100-Zeichen-Links ohne Leerzeichen um, statt die Blase aufzureißen */}
        <div className="whitespace-pre-wrap text-[15px] leading-snug [overflow-wrap:anywhere]">{m.body}</div>
        {m.nicht_gesendet && (
          <div
            className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 text-[12px] font-semibold ${
              meins ? "bg-white/20 text-white" : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
            }`}
            title={fehlerText(m.nicht_gesendet)}
          >
            <span>Nicht gesendet</span>
            {/* Der Text steht ja noch in der Blase – einmal tippen schickt ihn erneut ab */}
            <button
              type="button"
              onClick={() => void topics?.erneutSenden(m.id)}
              className="-my-1.5 py-2.5 underline underline-offset-2 active:opacity-60"
            >
              Erneut senden
            </button>
          </div>
        )}
        <div className={`mt-0.5 text-right text-[12px] ${meins ? "text-white/90" : "text-tinte-leise"}`}>
          {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          {!meins && <MuteKnopf userId={m.created_by} name={m.author} topicId={m.topic_id} />}
        </div>
      </div>
      {reaktionen.length > 0 && (
        <ReaktionsSchild
          liste={reaktionen}
          rechts={meins}
          onTippen={() => {
            if (!blase.current) return;
            setWerListe(true);
            setMenue(blase.current.getBoundingClientRect());
          }}
        />
      )}
      </div>
      </div>
      {meins && kreis}
      {menue &&
        createPortal(
          <ReaktionsMenue
            rect={menue}
            rechts={meins}
            meine={meine}
            liste={werListe ? reaktionen : null}
            uid={topics?.uid ?? null}
            onWahl={(e) => {
              reagieren(meine === e ? null : e);
              setMenue(null);
            }}
            onMelden={
              meins || !m.created_by
                ? undefined
                : () => {
                    setMenue(null);
                    melden("chat", m.id);
                  }
            }
            onKopieren={() => {
              void navigator.clipboard?.writeText(m.body).then(() => melde("Kopiert"), () => undefined);
              setMenue(null);
            }}
            // Löschen im Menü der Blase (lange drücken bzw. Rechtsklick) wie in
            // iMessage – vorher stand „löschen“ als Textlink in jeder eigenen Blase
            onLoeschen={
              meins || darfLoeschen
                ? () => {
                    setMenue(null);
                    void frage("Nachricht löschen?", "Löschen", true).then((ok) => {
                      if (ok) void onDelete(m.id);
                    });
                  }
                : undefined
            }
            onSchliessen={() => setMenue(null)}
          />,
          document.body,
        )}
    </div>
  );
}

/**
 * Gedrückt halten (Handy) oder Rechtsklick (Computer) – ohne dass dabei die
 * Textauswahl oder das System-Menü aufgeht. Wer beim Halten wischt (scrollt),
 * löst nichts aus.
 */
function useLangDruck(los: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const stopp = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => stopp, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        stopp();
        los();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) stopp();
    },
    onPointerUp: stopp,
    onPointerCancel: stopp,
    onPointerLeave: stopp,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      stopp();
      los();
    },
  };
}

/**
 * Reaktionen wie bei WhatsApp: ein kleines Schildchen, das unten über den Rand
 * der Blase ragt (nicht über den Text), mit bis zu drei Emojis und der Zahl.
 * Der Rand in Hintergrundfarbe trennt es sauber von der Blase. Antippen zeigt,
 * wer wie reagiert hat.
 */
function ReaktionsSchild({
  liste, rechts, onTippen,
}: {
  liste: { user_id: string; emoji: string }[];
  rechts: boolean;
  onTippen: () => void;
}) {
  const zahl = new Map<string, number>();
  for (const r of liste) zahl.set(r.emoji, (zahl.get(r.emoji) || 0) + 1);
  // Häufigste zuerst, bei Gleichstand in der Reihenfolge der Leiste (eigene Emojis dahinter)
  const rang = (e: string) => {
    const i = (REAKTIONEN as readonly string[]).indexOf(e);
    return i < 0 ? 99 : i;
  };
  const reihe = [...zahl.keys()].sort((x, y) => (zahl.get(y) || 0) - (zahl.get(x) || 0) || rang(x) - rang(y));
  return (
    <button
      type="button"
      onClick={onTippen}
      aria-label={`Reaktionen: ${reihe.map((e) => `${e} ${zahl.get(e)}`).join(", ")} – antippen für Details`}
      className={`absolute -bottom-[16px] flex h-[24px] items-center gap-[1px] rounded-full bg-white px-1.5 text-[13px] leading-none shadow-[0_1px_2px_rgba(0,0,0,.18)] ring-2 ring-papier transition active:scale-90 dark:bg-slate-800 dark:ring-slate-950 ${
        rechts ? "right-2" : "left-2"
      }`}
    >
      {reihe.slice(0, 3).map((e) => (
        <span key={e}>{e}</span>
      ))}
      {liste.length > 1 && <span className="zahl ml-0.5 text-[12px] font-semibold text-tinte-matt dark:text-slate-300">{liste.length}</span>}
    </button>
  );
}

/** Wer hat wie reagiert – die eigene Zeile lässt sich antippen zum Entfernen. */
function WerReagiert({
  liste, uid, onEntfernen,
}: {
  liste: { user_id: string; emoji: string }[];
  uid: string | null;
  onEntfernen: () => void;
}) {
  const { profile } = useProfiles();
  const sortiert = [...liste].sort((a, b) => (a.user_id === uid ? -1 : b.user_id === uid ? 1 : 0));
  return (
    <div className="max-h-[40vh] overflow-y-auto">
      <div className="px-4 pb-1 pt-3 text-[12px] font-semibold text-tinte-leise">
        {liste.length} {liste.length === 1 ? "Reaktion" : "Reaktionen"}
      </div>
      {sortiert.map((r) => {
        const ich = r.user_id === uid;
        const name = ich ? "Du" : lesbarerName(profile[r.user_id]?.anzeigename || "Jemand");
        const Tag = ich ? "button" : "div";
        return (
          <Tag
            key={r.user_id}
            onClick={ich ? onEntfernen : undefined}
            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            <Avatar userId={r.user_id} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{name}</span>
              {ich && <span className="block text-[12px] text-tinte-leise">Zum Entfernen tippen</span>}
            </span>
            <span className="text-[20px]">{r.emoji}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * Menü nach dem Gedrückthalten – wie bei iMessage: der Rest wird abgedunkelt,
 * über der Nachricht die Leiste mit den Reaktionen, darunter „Kopieren“.
 */
function ReaktionsMenue({
  rect, rechts, meine, liste, uid, onWahl, onKopieren, onMelden, onLoeschen, onSchliessen,
}: {
  rect: DOMRect;
  rechts: boolean;
  meine: string | null;
  /** gesetzt = über das Schildchen geöffnet: Liste „wer hat reagiert“ statt „Kopieren“ */
  liste: { user_id: string; emoji: string }[] | null;
  uid: string | null;
  onWahl: (e: Reaktion) => void;
  onKopieren: () => void;
  /** nur bei fremden Nachrichten */
  onMelden?: () => void;
  onLoeschen?: () => void;
  onSchliessen: () => void;
}) {
  // Im gemeinsamen Escape-Stapel (Sheet.tsx): Escape schließt nur das Menü,
  // nicht zusätzlich den Chat darunter
  useEscapeSchliesst(true, onSchliessen);
  const vw = window.innerWidth;
  // Leiste in zwei Zeilen à 5 (Schnellauswahl + „+“) – passt auch aufs
  // schmalste Handy und wird nicht zu breit
  const breite = Math.min(5 * 44 + 16, vw - 16);
  const eigenes = useRef<HTMLInputElement>(null);
  // Ein eigenes Emoji, das nicht in der Schnellauswahl steht, vorn mit anzeigen
  const extra = meine && !(REAKTIONEN as readonly string[]).includes(meine) ? [meine] : [];
  const links = Math.max(8, Math.min(vw - breite - 8, rechts ? rect.right - breite : rect.left));
  // Leiste über der Nachricht – passt sie oben nicht hin, darunter
  const oben = rect.top > 180 ? rect.top - 104 : rect.bottom + 10;
  const menueOben = rect.top > 180 ? rect.bottom + 10 : oben + 106;
  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label="Reagieren">
      <button
        className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px] animate-fadeIn"
        aria-label="Schließen"
        onClick={onSchliessen}
      />
      <div
        className="absolute grid animate-popIn grid-cols-5 gap-1 rounded-[1.6rem] bg-white/95 p-2 shadow-glas backdrop-blur-xl dark:bg-slate-800/95"
        style={{ left: links, top: oben, width: breite }}
      >
        {[...extra, ...REAKTIONEN].slice(0, 9).map((e) => (
          <button
            key={e}
            onClick={() => onWahl(e)}
            aria-label={meine === e ? `${e} zurücknehmen` : `Mit ${e} reagieren`}
            aria-pressed={meine === e}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-[22px] transition active:scale-90 ${
              meine === e ? "bg-black/[0.09] dark:bg-white/[0.16]" : "hover:bg-black/[0.05] dark:hover:bg-white/10"
            }`}
          >
            {e}
          </button>
        ))}
        {/* „+“: öffnet die Tastatur – das erste Emoji, das man tippt, wird die Reaktion */}
        <label
          className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/[0.06] text-[22px] font-light text-tinte-matt transition active:scale-90 dark:bg-white/10 dark:text-slate-200"
          aria-label="Anderes Emoji wählen"
          onClick={() => eigenes.current?.focus()}
        >
          +
          <input
            ref={eigenes}
            type="text"
            inputMode="text"
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            aria-label="Emoji eingeben"
            className="absolute inset-0 h-full w-full cursor-pointer rounded-full bg-transparent text-center text-transparent caret-transparent outline-none"
            onInput={(ev) => {
              const feld = ev.currentTarget;
              const e = erstesEmoji(feld.value);
              if (!feld.value) return;
              feld.value = "";
              if (!e) return meldeFehler("Bitte ein Emoji wählen.");
              feld.blur();
              onWahl(e);
            }}
          />
        </label>
      </div>
      {liste ? (
        <div
          className="absolute w-72 animate-popIn overflow-hidden rounded-2xl bg-white/95 pb-1 shadow-glas backdrop-blur-xl dark:bg-slate-800/95"
          style={{
            left: Math.max(8, Math.min(vw - 296, rechts ? rect.right - 288 : rect.left)),
            top: Math.max(8, Math.min(menueOben, window.innerHeight - Math.min(window.innerHeight * 0.4 + 40, 64 + liste.length * 46) - 16)),
          }}
        >
          <WerReagiert
            liste={liste}
            uid={uid}
            onEntfernen={() => {
              if (meine) onWahl(meine as Reaktion);
            }}
          />
        </div>
      ) : (
        <div
          className="absolute w-44 animate-popIn overflow-hidden rounded-2xl bg-white/95 shadow-glas backdrop-blur-xl dark:bg-slate-800/95"
          style={{ left: Math.max(8, Math.min(vw - 184, rechts ? rect.right - 176 : rect.left)), top: Math.min(menueOben, window.innerHeight - (60 + (onMelden ? 52 : 0) + (onLoeschen ? 52 : 0))) }}
        >
          <button
            onClick={onKopieren}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            Kopieren <span aria-hidden>⧉</span>
          </button>
          {onMelden && (
            <button
              onClick={onMelden}
              className="flex w-full items-center justify-between border-t border-black/[0.06] px-4 py-3 text-left text-[15px] font-medium text-red-600 hover:bg-black/[0.04] dark:border-white/[0.08] dark:text-red-400 dark:hover:bg-white/[0.06]"
            >
              Melden <span aria-hidden>⚑</span>
            </button>
          )}
          {onLoeschen && (
            <button
              onClick={onLoeschen}
              className="flex w-full items-center justify-between border-t border-black/[0.06] px-4 py-3 text-left text-[15px] font-medium text-red-600 hover:bg-black/[0.04] dark:border-white/[0.08] dark:text-red-400 dark:hover:bg-white/[0.06]"
            >
              Löschen <Icon name="muell" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatBlasen({
  liste,
  uid,
  darfLoeschen,
  onDelete,
  leerText = "Noch keine Nachricht.",
}: {
  liste: TopicItem[];
  uid: string;
  darfLoeschen: boolean;
  onDelete: (id: string) => void;
  leerText?: string;
}) {
  const ende = useChatEndeIn(liste.length, liste[liste.length - 1]?.created_by === uid);

  return (
    <div className="space-y-2 py-3">
      {liste.length === 0 && <LeererChat text={leerText} />}
      {liste.map((m) => {
        if (m.type === "system") return <SystemZeile key={m.id} m={m} darfLoeschen={darfLoeschen} onDelete={onDelete} />;
        return <ChatBlase key={m.id} m={m} meins={m.created_by === uid} darfLoeschen={darfLoeschen} onDelete={onDelete} />;
      })}
      {/* Scroll-Marke: Den Platz für Kopf- und Eingabeleiste hält die
          ChatEbene selbst frei – hier braucht es keinen Abstandhalter mehr. */}
      <div ref={ende} />
    </div>
  );
}

/** Leerer Verlauf: sagt, was als Nächstes zu tun ist – mittig, ruhig. */
export function LeererChat({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand dark:bg-brand/20">
        <Icon name="chats" size={26} />
      </span>
      <p className="auf-bild mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">{text}</p>
    </div>
  );
}

/**
 * Automatisch nach unten scrollen – in der ChatEbene (eigener Scroll-Bereich,
 * erkennbar an data-chat-scroller) statt im ganzen Fenster.
 *
 * Wie bei iMessage: Beim Öffnen steht man ganz unten. Kommt eine neue
 * Nachricht, geht es nur dann mit nach unten, wenn man ohnehin unten war
 * (sonst reißt es einen beim Nachlesen weg) – oder wenn man selbst
 * geschrieben hat. Liegt die Liste (noch) nicht in einer ChatEbene, wird wie
 * früher das Fenster gescrollt.
 */
export function useChatEndeIn(anzahl: number, letzteIstMeine: boolean) {
  const ende = useRef<HTMLDivElement | null>(null);
  const erstes = useRef(true);
  const warUnten = useRef(true);

  // Merken, ob man unten ist – VOR der nächsten Nachricht, nicht danach
  useEffect(() => {
    const el = ende.current;
    if (!el) return;
    const sc = el.closest<HTMLElement>("[data-chat-scroller]");
    const ziel: HTMLElement | Window = sc ?? window;
    const pruefen = () => {
      const rest = sc
        ? sc.scrollHeight - sc.scrollTop - sc.clientHeight
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      warUnten.current = rest < 120;
    };
    ziel.addEventListener("scroll", pruefen, { passive: true });
    return () => ziel.removeEventListener("scroll", pruefen);
  }, []);

  // Vor dem Zeichnen springen: kein sichtbares Zucken beim Öffnen
  useLayoutEffect(() => {
    const el = ende.current;
    if (!el) return;
    if (erstes.current || warUnten.current || letzteIstMeine) {
      const sc = el.closest<HTMLElement>("[data-chat-scroller]");
      if (sc) sc.scrollTop = sc.scrollHeight;
      else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      warUnten.current = true;
    }
    if (anzahl > 0) erstes.current = false;
  }, [anzahl, letzteIstMeine]);
  return ende;
}

/**
 * Zeile ohne Absender, mitten im Verlauf: „… wurde gesperrt“. Schmal, kursiv,
 * in Serifenschrift – damit sie niemand für eine Nachricht hält.
 */
export function SystemZeile({
  m, darfLoeschen, onDelete,
}: { m: TopicItem; darfLoeschen: boolean; onDelete: (id: string) => void }) {
  return (
    <div className="flex justify-center px-6 py-1" role="status">
      <p className="max-w-[34rem] text-center font-serif text-[12px] italic leading-snug tracking-wide text-tinte-leise">
        {m.body}
        <span className="ml-1.5 not-italic opacity-70">
          · {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {darfLoeschen && (
          <button
            onClick={() => void frage("Diese Zeile entfernen?", "Entfernen", true).then((ok) => { if (ok) onDelete(m.id); })}
            className="ml-1.5 not-italic underline opacity-70"
          >
            entfernen
          </button>
        )}
      </p>
    </div>
  );
}

/**
 * Eingabezeile wie in iMessage: rundes Feld, daneben der runde blaue
 * Senden-Knopf mit Pfeil nach oben. Sie sitzt NICHT mehr selbst fest am
 * Bildschirmrand, sondern im Fuß der ChatEbene – die schiebt sie über die
 * Tastatur bzw. an den unteren Rand (Sicherheitsabstand fürs iPhone).
 * Das Feld wächst mit bis zu fünf Zeilen mit. Enter sendet, Umschalt+Enter
 * macht eine neue Zeile (am Rechner).
 */
export function ChatEingabe({
  wert,
  setWert,
  onSenden,
  platzhalter = "Nachricht",
  links,
}: {
  wert: string;
  setWert: (v: string) => void;
  onSenden: () => void;
  platzhalter?: string;
  /** Knopf links neben dem Feld (z. B. „+“ für Abstimmung/To-do/Anpinnen) */
  links?: ReactNode;
}) {
  const feld = useRef<HTMLTextAreaElement>(null);
  // Höhe an den Inhalt anpassen (auch nach dem Senden wieder einzeilig)
  useLayoutEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [wert]);
  const leer = !wert.trim();
  return (
    <div className="flex items-end gap-2">
      {links}
      <textarea
        ref={feld}
        rows={1}
        aria-label={platzhalter}
        className="max-h-[8.25rem] min-h-[2.5rem] flex-1 resize-none rounded-[1.2rem] border-0 bg-[rgb(var(--zelle))] px-4 py-[0.5rem] text-[16px] leading-[1.35] text-tinte shadow-[0_0_0_0.5px_rgba(0,0,0,0.14)] outline-none transition placeholder:text-tinte-leise focus:shadow-[0_0_0_1px_rgb(var(--brand)/0.6)] dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-100 dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.12)]"
        placeholder={platzhalter}
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSenden();
          }
        }}
      />
      <button
        type="button"
        onClick={onSenden}
        disabled={leer}
        // Feld behält beim Tippen auf Senden den Fokus – die Tastatur bleibt offen
        onPointerDown={(e) => e.preventDefault()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition duration-200 ease-ios active:scale-90 disabled:bg-[rgb(118_118_128/0.24)] disabled:text-white/90 dark:disabled:bg-[rgb(118_118_128/0.32)]"
        aria-label="Senden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}

/* ======================================================================
 * Chat als eigene Ebene (Vollbild) – wie ein geöffneter Chat in iMessage
 * ====================================================================== */

/**
 * Sichtbarer Bereich des Fensters (ohne Tastatur).
 *
 * iPhone: Geht die Tastatur auf, bleibt das Fenster selbst gleich hoch; nur
 * der sichtbare Ausschnitt (visualViewport) wird kleiner und verschiebt sich.
 * Eine feste Ebene mit „inset-0“ ragte dann unter die Tastatur, und Safari
 * schob die ganze Ebene samt Kopfleiste nach oben aus dem Bild. Deshalb
 * folgt die Ebene genau dem sichtbaren Ausschnitt: Höhe und Abstand oben
 * kommen von hier. Am Rechner (ab 1024 px) gibt es keine Bildschirmtastatur –
 * dort gelten die CSS-Klassen allein.
 */
function useSichtfenster(aktiv: boolean) {
  const [s, setS] = useState<{ hoehe?: number; oben?: number; tastatur: boolean }>({ tastatur: false });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!aktiv || !vv) return;
    let raf = 0;
    const messen = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (window.innerWidth >= 1024) return setS({ tastatur: false });
        setS({
          hoehe: Math.round(vv.height),
          oben: Math.max(0, Math.round(vv.offsetTop)),
          // Deutlich kleiner als das Fenster = Tastatur ist offen
          tastatur: window.innerHeight - vv.height > 120,
        });
      });
    };
    messen();
    vv.addEventListener("resize", messen);
    vv.addEventListener("scroll", messen);
    window.addEventListener("resize", messen);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", messen);
      vv.removeEventListener("scroll", messen);
      window.removeEventListener("resize", messen);
    };
  }, [aktiv]);
  return s;
}

/** Höhe eines Elements in Pixeln, laufend gemessen (Kopf/Fuß der Ebene). */
function useHoehe() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!el) return setH(0);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, h] as const;
}

/**
 * Stapel der sichtbaren Ebenen – nur die OBERSTE legt am Rechner ihren Kopf
 * in die Kopfzeile der App (#kopf-ebene).
 *
 * Anlass (Okt. 2026): Liste „Schüler“ offen, darin ein Gespräch geöffnet –
 * am Laptop standen plötzlich zwei Köpfe mit zwei Zurück-Knöpfen in der
 * Kopfzeile, und der linke schloss die verdeckte Liste statt des Chats.
 * Die Liste bleibt absichtlich eingehängt und sichtbar (Scrollstand, kein
 * erneutes Hereinschieben beim Zurückgehen), sie ist nur verdeckt.
 *
 * Reihenfolge = Reihenfolge des Sichtbarwerdens. Das passt zur Reihenfolge
 * der Portale an <body>: eine später geöffnete Ebene liegt auch oben.
 */
const offeneEbenen: object[] = [];
const ebenenHoerer = new Set<() => void>();
const ebenenMelden = () => ebenenHoerer.forEach((f) => f());
const ebenenAbo = (f: () => void) => {
  ebenenHoerer.add(f);
  return () => {
    ebenenHoerer.delete(f);
  };
};
function useObersteEbene(sichtbar: boolean): boolean {
  const [ich] = useState<object>(() => ({}));
  useLayoutEffect(() => {
    if (!sichtbar) return;
    offeneEbenen.push(ich);
    ebenenMelden();
    return () => {
      const i = offeneEbenen.indexOf(ich);
      if (i >= 0) offeneEbenen.splice(i, 1);
      ebenenMelden();
    };
  }, [sichtbar, ich]);
  return useSyncExternalStore(ebenenAbo, () => offeneEbenen[offeneEbenen.length - 1] === ich);
}

/**
 * Ein geöffneter Chat (oder eine Unterseite wie „Anfragen“) als Vollbild-Ebene.
 *
 * Vorher hing der Chat mitten in der Seite: oben die App-Kopfleiste mit
 * Profilbild, darunter der große Titel „Chats“ und erst dann – etwa im
 * zweiten Fünftel des Bildschirms – der dunkle Balken mit „Chat | Übersicht“
 * (heute „Chat | Pinnwand“).
 * Jetzt liegt der Chat wie in iMessage/WhatsApp als eigene Ebene ÜBER allem:
 *
 *   - oben EINE Glas-Kopfleiste (Zurück, Name, Umschalter) – der Verlauf
 *     scrollt milchig darunter durch,
 *   - unten die Eingabezeile als Glas-Leiste; die Reiterleiste ist im Chat
 *     ausgeblendet (wie bei WhatsApp), zurück geht es mit dem Pfeil,
 *   - die Ebene folgt dem sichtbaren Bereich, damit die Eingabe genau über
 *     der Tastatur sitzt und die Kopfleiste oben bleibt (useSichtfenster).
 *
 * Ebenen-Reihenfolge: über App-Kopf (z-20) und Reiterleiste (z-40), unter
 * Blättern (Sheet, z-50) und Rückfragen (z-90). Am Rechner/iPad quer
 * beginnt die Ebene unter der App-Kopfleiste, damit die Reiter oben
 * erreichbar bleiben.
 *
 * Am Rechner/iPad quer gibt es KEINE zweite Kopfleiste (Okt. 2026: „die
 * Headbar ist nach unten verschoben“ – unter der App-Leiste stand ein
 * zweites Band mit Zurück, Name und „Chat | Pinnwand“). Dort wandert der
 * Kopf in die Kopfzeile der App (Platzhalter #kopf-ebene in App.tsx) und
 * ersetzt Seitentitel und Seiten-Knöpfe – Zurück steht genau dort, wo
 * sonst der Titel steht. Gibt es den Platzhalter nicht (Eltern-App), bleibt
 * es beim eigenen Band.
 *
 * Direkt an <body> gehängt (Portal): sonst sperrt eine animierte Elternebene
 * (animate-fadeIn am <main>) die Ebene in ihren eigenen Stapel ein, und die
 * App-Kopfleiste läge doch wieder darüber.
 *
 * sichtbar=false: bleibt eingehängt, aber unsichtbar – z. B. damit die
 * Anfragen im Hintergrund weiter zählen und auf Benachrichtigungen reagieren.
 *
 * Mehrere Ebenen übereinander (Liste → Gespräch): Nur die oberste zeigt am
 * Rechner ihren Kopf in der Kopfzeile (useObersteEbene). onSchliessen:
 * Escape schließt die oberste Ebene (gemeinsamer Stapel mit den Blättern –
 * ein offenes Blatt schließt zuerst). Steht noch ein Entwurf in der Eingabe,
 * nimmt Escape nur den Fokus heraus und schließt nicht.
 */
export function ChatEbene({
  kopf,
  fuss,
  children,
  sichtbar = true,
  label,
  start = "unten",
  onSchliessen,
}: {
  kopf: ReactNode;
  fuss?: ReactNode;
  children: ReactNode;
  sichtbar?: boolean;
  /** Escape schließt die Ebene (wie Zurück) – meist dieselbe Funktion wie onBack im ChatKopf */
  onSchliessen?: () => void;
  /** Vorlesetext der Ebene, z. B. der Chat-Name */
  label?: string;
  /**
   * Wo der Inhalt beim Öffnen beginnt: "unten" = bei der neuesten Nachricht (Chat, Standard),
   * "oben" = ganz oben (Übersichten und Listen – Angepinntes darf nicht übersprungen werden).
   * Darf sich im Betrieb ändern (Chat ⇄ Pinnwand): beim Wechsel springt die Ebene an
   * den passenden Rand und merkt sich, dass sie bei „oben“ nicht mit der Tastatur nach unten soll.
   */
  start?: "unten" | "oben";
}) {
  const sicht = useSichtfenster(sichtbar);
  const oben = useObersteEbene(sichtbar);
  const seite = useContext(ChatSeitenleiste);
  const ebeneRef = useRef<HTMLDivElement>(null);
  useEscapeSchliesst(sichtbar && Boolean(onSchliessen), () => {
    // Ein angefangener Text geht mit Esc nicht verloren: Steht noch etwas in
    // der Eingabe unten (oder im Feld, in dem man gerade tippt), nimmt Esc nur
    // den Fokus heraus – schließen geht dann mit Zurück.
    const ebene = ebeneRef.current;
    const fokus = document.activeElement;
    const fokusFeld =
      (fokus instanceof HTMLTextAreaElement || fokus instanceof HTMLInputElement) && ebene?.contains(fokus) ? fokus : null;
    const entwurf = ebene?.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      "[data-ebene-fuss] textarea, [data-ebene-fuss] input[type=text], [data-ebene-fuss] input:not([type])",
    );
    if (fokusFeld?.value.trim() || entwurf?.value.trim()) {
      fokusFeld?.blur();
      return;
    }
    onSchliessen?.();
  });
  const [kopfRef, kopfH] = useHoehe();
  const [fussRef, fussH] = useHoehe();
  const scroller = useRef<HTMLDivElement>(null);
  const warUnten = useRef(start !== "oben");
  // Am Rechner: Kopf in die Kopfzeile der App statt als eigenes Band
  const breit = useBreit();
  const [kopfZiel, setKopfZiel] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setKopfZiel(breit && sichtbar ? document.getElementById("kopf-ebene") : null);
  }, [breit, sichtbar]);

  // Am Laptop mit Seitenleiste: Liste links in der Spalte, der Chat rechts
  // daneben – Verlauf und Eingabe nur über der rechten Seite.
  const mitSeite = Boolean(kopfZiel && seite);

  // Die Seite dahinter scrollt nicht mit
  useEffect(() => {
    if (!sichtbar) return;
    return scrollSperren();
  }, [sichtbar]);

  // Beginn der Ebene (und bei jedem Wechsel von start): oben oder ganz unten
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    sc.scrollTop = start === "oben" ? 0 : sc.scrollHeight;
    warUnten.current = start !== "oben";
  }, [start]);

  // Wird der sichtbare Bereich kleiner (Tastatur geht auf) oder wächst die
  // Eingabe, bleibt man unten, wenn man unten war – wie in iMessage.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const merken = () => {
      warUnten.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
    };
    sc.addEventListener("scroll", merken, { passive: true });
    return () => sc.removeEventListener("scroll", merken);
  }, []);
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (sc && warUnten.current) sc.scrollTop = sc.scrollHeight;
  }, [sicht.hoehe, fussH]);

  const spalte = mitSeite ? "px-3 sm:px-5" : "mx-auto max-w-5xl px-3 sm:px-5";
  const verlauf = (
    <>
      {/* Verlauf: läuft unter Kopf- und Fußleiste durch (Glas) */}
      <div
        ref={scroller}
        data-chat-scroller
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: kopfZiel ? 4 : kopfH,
          paddingBottom: fuss ? fussH : "calc(env(safe-area-inset-bottom) + 1.5rem)",
        }}
      >
        <div className={spalte}>{children}</div>
      </div>

      {/* Am Rechner: nur die oberste Ebene legt ihren Kopf in die Kopfzeile –
          eine verdeckte zeigt dort nichts (sonst zwei Zurück-Knöpfe) */}
      {kopfZiel ? (
        oben ? createPortal(<KopfArt.Provider value="zeile">{kopf}</KopfArt.Provider>, kopfZiel) : null
      ) : (
        <div
          ref={kopfRef}
          // Deckend (Design-Regeln 3): darunter scrollt der Verlauf, nichts davon darf lesbar durchscheinen
          className="glas absolute inset-x-0 top-0 z-10 !bg-[rgb(var(--glas))] pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] shadow-[0_0.5px_0_rgba(0,0,0,0.16)] dark:shadow-[0_0.5px_0_rgba(255,255,255,0.14)] lg:pt-2"
        >
          <div className="mx-auto max-w-5xl px-3 sm:px-5">{kopf}</div>
        </div>
      )}
    </>
  );
  // Eingabe: immer ein Band über die volle Breite der Ebene, wie die Kopfzeile.
  // Mit Seitenleiste steht nur das Feld unter dem Chat (ml-72 = Breite der
  // Liste) – ein Band nur über der rechten Seite endete mitten im Bild.
  const fussBand = fuss && (
    <div
      ref={fussRef}
      data-ebene-fuss
      className={`glas absolute inset-x-0 bottom-0 z-10 !bg-[rgb(var(--glas))] pt-2 shadow-[0_-0.5px_0_rgba(0,0,0,0.16)] dark:shadow-[0_-0.5px_0_rgba(255,255,255,0.14)] ${
        sicht.tastatur ? "pb-2" : "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
      }`}
    >
      {mitSeite ? (
        <div className="mx-auto max-w-5xl px-3 sm:px-5">
          <div className={`ml-72 ${spalte}`}>{fuss}</div>
        </div>
      ) : (
        <div className={spalte}>{fuss}</div>
      )}
    </div>
  );

  return createPortal(
    <div
      ref={ebeneRef}
      role="region"
      aria-label={label}
      className={`ebene-grund fixed inset-x-0 top-0 z-[45] flex h-[100dvh] flex-col bg-papier dark:bg-slate-950 lg:bottom-0 lg:top-[var(--kopf)] lg:z-[15] lg:h-auto ${
        sichtbar ? "animate-vonRechts" : "hidden"
      }`}
      style={sicht.hoehe ? { height: sicht.hoehe, top: sicht.oben } : undefined}
    >
      {mitSeite ? (
        // Liste und Chat in derselben Spalte wie Kopfzeile und Seiten (max-w-5xl):
        // die Liste fluchtet links mit dem Titel, der Chat füllt den Rest. Die
        // Liste ist eine Karte (ChatsTab) nur so hoch wie ihr Inhalt: lesbar auf
        // dem Hintergrundbild, und zwei Einträge wirken nicht wie eine leere Spalte.
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 px-3 sm:px-5">
          <div
            className="w-72 shrink-0 overflow-y-auto overscroll-contain pr-2 pt-3"
            style={{ paddingBottom: (fuss ? fussH : 0) + 12 }}
          >
            {seite}
          </div>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{verlauf}</div>
        </div>
      ) : (
        verlauf
      )}
      {fussBand}
    </div>,
    document.body,
  );
}

/** Wo ein ChatKopf steht: im eigenen Band der Ebene oder in der App-Kopfzeile. */
const KopfArt = createContext<"band" | "zeile">("band");

/**
 * Seitenleiste neben einem geöffneten Chat am Laptop/iPad quer (ab 1024 px) –
 * wie Nachrichten am Mac: links alle Chats, der offene markiert, rechts der
 * Chat (Runde 11, Okt. 2026). ChatsTab stellt sie bereit; Ebenen außerhalb
 * (Kalender) haben keine und bleiben, wie sie sind. Am Handy ist sie null.
 */
export const ChatSeitenleiste = createContext<ReactNode>(null);

/**
 * Kopfleiste einer ChatEbene: links der runde Zurück-Knopf, in der Mitte
 * Symbol + Name (+ eine kleine Zeile, z. B. „8 Mitglieder“), rechts Platz
 * für Knöpfe. Darunter optional z. B. der Umschalter „Chat | Pinnwand“.
 * Der Name steht mittig wie in iOS – die Spalten links/rechts sind gleich
 * breit, solange rechts nicht mehr Knöpfe stehen als links.
 *
 * zurueckText: statt des runden „‹“ ein beschrifteter Zurück-Knopf wie in
 * iOS („‹ Events“) – für Ebenen, in deren Kopf noch andere Pfeile stehen
 * (Kalender: Monat vor/zurück). Dort waren Zurück und „Vorheriger Monat“
 * zwei gleiche graue Kreise (Rollen-Prüfung Okt. 2026).
 */
export function ChatKopf({
  onBack,
  zurueckText,
  symbol,
  titel,
  unter,
  rechts,
  children,
}: {
  onBack: () => void;
  zurueckText?: string;
  symbol?: ReactNode;
  titel: ReactNode;
  unter?: ReactNode;
  rechts?: ReactNode;
  children?: ReactNode;
}) {
  // Am Rechner in der Kopfzeile der App: alles in EINER Zeile – Zurück und
  // Name links (wo sonst der Seitentitel steht), Umschalter und Knöpfe rechts.
  const art = useContext(KopfArt);
  const zurueck = (zeile: boolean) =>
    zurueckText ? (
      // auf-bild: steht am Rechner direkt auf dem Hintergrundbild. Dort ohne
      // inneren Abstand rechts (danach kommt ohnehin gap-2.5) – der Titel
      // braucht bei 1024 px jeden Pixel („Mi, 30. September“)
      <ZurueckKnopf text={zurueckText} onClick={onBack} className={`shrink-0 ${zeile ? "auf-bild !pr-0" : ""}`} />
    ) : (
      <button type="button" className={`iconbtn ${zeile ? "shrink-0" : ""}`} onClick={onBack} aria-label="Zurück" title="Zurück">
        <span className="block rotate-180">
          <Icon name="chevron" size={20} strich={2.4} />
        </span>
      </button>
    );
  if (art === "zeile")
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {zurueck(true)}
        {symbol && (
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[18px] leading-none dark:bg-[rgb(118_118_128/0.24)]">
            {symbol}
          </span>
        )}
        <div className="min-w-0">
          {/* Am Rechner ist das die einzige Seitenüberschrift (das h1 im Inhalt ist dort ausgeblendet) */}
          <div role="heading" aria-level={1} className="auf-bild truncate text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">
            {titel}
          </div>
          {unter && <div className="auf-bild truncate text-[12px] leading-tight text-tinte-leise">{unter}</div>}
        </div>
        {/* Knöpfe („+ Neu“) VOR dem Umschalter (wie K3 in App.tsx): So endet
            „Chat | Pinnwand“ immer direkt links vor den App-Knöpfen und steht in
            Chat und Pinnwand an derselben Stelle – auch wenn „Neu“ nur auf der
            Pinnwand da ist (vorher sprang er um 89 px). */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {rechts}
          {children && <div className="w-[19rem]">{children}</div>}
        </div>
      </div>
    );
  return (
    <>
      <div className="grid grid-cols-[minmax(min-content,1fr)_minmax(0,max-content)_minmax(min-content,1fr)] items-center gap-2">
        <div className="flex">{zurueck(false)}</div>
        <div className="flex min-w-0 items-center justify-center gap-2">
          {symbol && (
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[17px] leading-none dark:bg-[rgb(118_118_128/0.24)]">
              {symbol}
            </span>
          )}
          {/* text-center: auch mit langem Untertitel steht der Name mittig (wie iOS) */}
          <div className="min-w-0 text-center">
            <div className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em]">{titel}</div>
            {unter && <div className="truncate text-[12px] leading-tight text-tinte-leise">{unter}</div>}
          </div>
        </div>
        {/* min-w-11 = so breit wie Zurück links – ohne Knöpfe rechts bleibt die Mitte mittig */}
        <div className="flex min-w-11 items-center justify-end gap-1.5">{rechts}</div>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </>
  );
}

/**
 * Rechts im Kopf eines Gesprächs mit einem Schüler oder einem Elternhaus:
 * „Erledigt“ und „…“. Löschen (und „Wieder öffnen“) liegen im Blatt hinter
 * „…“ (GespraechMehrBlatt) – kein Mülleimer im Kopf. Am Handy ist „Erledigt“
 * ein grüner Haken-Kreis: vorher standen dort „✓ Erledigt“ und der
 * Mülleimer, und vom Betreff blieben am iPhone nur etwa 12 Zeichen.
 * Am Rechner (Kopfzeile der App, genug Platz) bleibt die Beschriftung.
 */
export function GespraechKnoepfe({
  erledigt,
  onErledigt,
  onMehr,
}: {
  erledigt: boolean;
  /** Umschalten offen ⇄ erledigt */
  onErledigt: () => void;
  onMehr: () => void;
}) {
  const breit = useBreit();
  return (
    <>
      {breit ? (
        <button
          type="button"
          className={`flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition active:scale-95 ${
            erledigt
              ? "bg-[rgb(118_118_128/0.12)] text-brand-dark dark:bg-[rgb(118_118_128/0.24)] dark:text-brand"
              : "bg-[#248A3D] text-white dark:bg-[#30D158] dark:text-black"
          }`}
          onClick={onErledigt}
          title={erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
        >
          {!erledigt && <Icon name="haken" size={15} strich={2.6} />}
          {erledigt ? "Öffnen" : "Erledigt"}
        </button>
      ) : (
        // Handy: nur solange offen – erledigt zeigt die Zeile darunter, „Wieder öffnen“ steht hinter „…“
        !erledigt && (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
            onClick={onErledigt}
            aria-label="Als erledigt markieren"
            title="Als erledigt markieren"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#248A3D] text-white dark:bg-[#30D158] dark:text-black">
              <Icon name="haken" size={18} strich={2.8} />
            </span>
          </button>
        )
      )}
      <button type="button" className="iconbtn shrink-0" onClick={onMehr} aria-label="Weitere Aktionen" title="Weitere Aktionen">
        <Icon name="mehr" size={22} strich={2.6} />
      </button>
    </>
  );
}

/** Blatt hinter „…“ im Kopf eines Gesprächs: offen/erledigt umschalten, ganz unten Löschen (mit Rückfrage). */
export function GespraechMehrBlatt({
  open,
  onClose,
  titel,
  unter,
  erledigt,
  onErledigt,
  loeschen,
}: {
  open: boolean;
  onClose: () => void;
  titel: string;
  unter?: string;
  erledigt: boolean;
  onErledigt: () => void;
  /** Ohne Recht zum Löschen weglassen */
  loeschen?: { frage: string; fuss?: string; onLoeschen: () => void };
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={titel} unter={unter} onClose={onClose} />
      <Gruppe
        className="mt-0"
        fuss={erledigt ? "Wieder offen steht das Gespräch oben in der Liste." : "Erledigte Gespräche stehen unten in der Liste unter „Erledigt“."}
      >
        <Zeile
          blau
          label={erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
          onClick={() => {
            onErledigt();
            onClose();
          }}
        />
      </Gruppe>
      {loeschen && (
        <Gruppe className="mt-8" fuss={loeschen.fuss}>
          <Zeile
            rot
            label="Gespräch löschen …"
            onClick={async () => {
              if (await frage(loeschen.frage, "Löschen", true)) {
                onClose();
                loeschen.onLoeschen();
              }
            }}
          />
        </Gruppe>
      )}
    </Sheet>
  );
}
