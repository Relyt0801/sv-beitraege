import { useChatEnde } from "../lib/gescrollt";
import type { TopicItem } from "../topics-store";
import { Avatar, PersonName } from "./Avatar";
import { MuteKnopf } from "./MuteKnopf";

import { frage } from "../lib/melder";
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
  const ende = useChatEnde(liste.length, liste[liste.length - 1]?.created_by === uid);

  return (
    <div className="space-y-2 py-3">
      {liste.length === 0 && <p className="py-12 text-center text-sm text-tinte-leise">{leerText}</p>}
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
              <div className={`mt-0.5 text-right text-[10px] ${meins ? "text-white/70" : "text-tinte-leise"}`}>
                {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                {(meins || darfLoeschen) && (
                  <button
                    onClick={() => void frage("Nachricht löschen?", "Löschen", true).then((ok) => { if (ok) void onDelete(m.id); })}
                    className="ml-2 underline"
                  >
                    löschen
                  </button>
                )}
                {!meins && <MuteKnopf userId={m.created_by} name={m.author} />}
              </div>
            </div>
          </div>
        );
      })}
      {/* Platz für Eingabezeile und Tab-Leiste. Die Marke fürs Scrollen steht
          dahinter – so landet die letzte Nachricht über der Eingabe statt
          dahinter (vorher lag der Freiraum als padding hinter der Marke). */}
      <div aria-hidden className="h-[calc(var(--leiste)+5rem)] lg:h-24" />
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
