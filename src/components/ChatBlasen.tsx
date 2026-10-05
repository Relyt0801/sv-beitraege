import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatEnde } from "../lib/gescrollt";
import { REAKTIONEN, useTopicsOptional, type Reaktion, type TopicItem } from "../topics-store";
import { Avatar, PersonName } from "./Avatar";
import { MuteKnopf } from "./MuteKnopf";
import { useProfiles } from "../profiles-store";
import { lesbarerName } from "../lib/profil";

import { frage, melde } from "../lib/melder";
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
      <div className={`flex max-w-[78%] flex-col sm:max-w-[65%] lg:max-w-[50%] ${meins ? "items-end" : "items-start"}`}>
      <div className={`relative ${reaktionen.length > 0 ? "mb-[18px]" : ""}`}>
      <div
        ref={blase}
        {...halten}
        className={`select-none rounded-2xl px-3.5 py-2 transition [-webkit-touch-callout:none] ${
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
        <div className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</div>
        {m.nicht_gesendet && (
          <div
            className={`mt-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
              meins ? "bg-white/20 text-white" : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
            }`}
            title={m.nicht_gesendet}
          >
            ⚠ Nicht gesendet – bitte noch einmal schreiben
          </div>
        )}
        <div className={`mt-0.5 text-right text-[10px] ${meins ? "text-white/90" : "text-tinte-leise"}`}>
          {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          {(meins || darfLoeschen) && (
            <button
              onClick={() => void frage("Nachricht löschen?", "Löschen", true).then((ok) => { if (ok) void onDelete(m.id); })}
              className="ml-2 underline"
            >
              löschen
            </button>
          )}
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
            onKopieren={() => {
              void navigator.clipboard?.writeText(m.body).then(() => melde("Kopiert"), () => undefined);
              setMenue(null);
            }}
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
  // Häufigste zuerst, bei Gleichstand in der Reihenfolge der Leiste
  const reihe = REAKTIONEN.filter((e) => zahl.has(e)).sort((x, y) => (zahl.get(y) || 0) - (zahl.get(x) || 0));
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
      {liste.length > 1 && <span className="zahl ml-0.5 text-[11.5px] font-semibold text-tinte-matt dark:text-slate-300">{liste.length}</span>}
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
  rect, rechts, meine, liste, uid, onWahl, onKopieren, onSchliessen,
}: {
  rect: DOMRect;
  rechts: boolean;
  meine: string | null;
  /** gesetzt = über das Schildchen geöffnet: Liste „wer hat reagiert“ statt „Kopieren“ */
  liste: { user_id: string; emoji: string }[] | null;
  uid: string | null;
  onWahl: (e: Reaktion) => void;
  onKopieren: () => void;
  onSchliessen: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSchliessen();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onSchliessen]);
  const breite = 6 * 44 + 16;
  const vw = window.innerWidth;
  const links = Math.max(8, Math.min(vw - breite - 8, rechts ? rect.right - breite : rect.left));
  // Leiste über der Nachricht – passt sie oben nicht hin, darunter
  const oben = rect.top > 140 ? rect.top - 60 : rect.bottom + 10;
  const menueOben = rect.top > 140 ? rect.bottom + 10 : oben + 62;
  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label="Reagieren">
      <button
        className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px] animate-fadeIn"
        aria-label="Schließen"
        onClick={onSchliessen}
      />
      <div
        className="absolute flex animate-popIn gap-1 rounded-full bg-white/95 p-2 shadow-glas backdrop-blur-xl dark:bg-slate-800/95"
        style={{ left: links, top: oben }}
      >
        {REAKTIONEN.map((e) => (
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
          style={{ left: Math.max(8, Math.min(vw - 184, rechts ? rect.right - 176 : rect.left)), top: Math.min(menueOben, window.innerHeight - 60) }}
        >
          <button
            onClick={onKopieren}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            Kopieren <span aria-hidden>⧉</span>
          </button>
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
  const ende = useChatEnde(liste.length, liste[liste.length - 1]?.created_by === uid);

  return (
    <div className="space-y-2 py-3">
      {liste.length === 0 && <p className="py-12 text-center text-sm text-tinte-leise">{leerText}</p>}
      {liste.map((m) => {
        if (m.type === "system") return <SystemZeile key={m.id} m={m} darfLoeschen={darfLoeschen} onDelete={onDelete} />;
        return <ChatBlase key={m.id} m={m} meins={m.created_by === uid} darfLoeschen={darfLoeschen} onDelete={onDelete} />;
      })}
      {/* Platz für Eingabezeile und Tab-Leiste. Die Marke fürs Scrollen steht
          dahinter – so landet die letzte Nachricht über der Eingabe statt
          dahinter (vorher lag der Freiraum als padding hinter der Marke). */}
      <div aria-hidden className="h-[calc(var(--leiste)+5rem)] lg:h-24" />
      <div ref={ende} />
    </div>
  );
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

/** Eingabezeile, fest unten über der Reiter-Leiste. */
export function ChatEingabe({
  wert,
  setWert,
  onSenden,
  platzhalter = "Nachricht…",
}: {
  wert: string;
  setWert: (v: string) => void;
  onSenden: () => void;
  platzhalter?: string;
}) {
  return (
    <div className="glas fixed inset-x-0 bottom-[var(--leiste)] z-30 flex items-end gap-2 border-t border-black/[0.06] px-3 py-2 dark:border-white/10 sm:px-5 lg:bottom-0 lg:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <textarea
        rows={1}
        className="field max-h-28 flex-1 resize-none py-2.5"
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
        onClick={onSenden}
        disabled={!wert.trim()}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg text-white disabled:opacity-40"
        aria-label="Senden"
      >
        ➤
      </button>
    </div>
  );
}
