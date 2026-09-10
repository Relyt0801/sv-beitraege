import { useEffect, useRef } from "react";
import type { TopicItem } from "../topics-store";
import { Avatar, PersonName } from "./Avatar";

/**
 * Nachrichtenliste im WhatsApp-Stil: fremde Nachrichten links mit Kreis und
 * farbigem Namen in der Blase, eigene rechts ohne Namen.
 */
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
  const ende = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "end" });
  }, [liste.length]);

  return (
    <div className="space-y-2 py-3 pb-28">
      {liste.length === 0 && <p className="py-12 text-center text-sm text-slate-400">{leerText}</p>}
      {liste.map((m) => {
        const meins = m.created_by === uid;
        return (
          <div key={m.id} className={`flex items-end gap-2 ${meins ? "justify-end" : "justify-start"}`}>
            {!meins && <Avatar userId={m.created_by} name={m.author} size={28} />}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 sm:max-w-[65%] lg:max-w-[50%] ${
                meins ? "bg-brand text-white" : "bg-white shadow-card dark:bg-slate-900 dark:shadow-cardDark"
              }`}
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
              <div className={`mt-0.5 text-right text-[10px] ${meins ? "text-white/70" : "text-slate-400"}`}>
                {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                {(meins || darfLoeschen) && (
                  <button
                    onClick={() => confirm("Nachricht löschen?") && onDelete(m.id)}
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
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.6rem)] z-30 flex items-end gap-2 border-t border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
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
