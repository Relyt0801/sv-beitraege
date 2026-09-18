import { useEffect, useRef } from "react";
import type { TopicItem } from "../topics-store";
import { Avatar, PersonName } from "./Avatar";
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
  const ende = useRef<HTMLDivElement | null>(null);
  const stehtUnten = useRef(true);
  const erstesMal = useRef(true);
  // Bis zu diesem Zeitpunkt scrollt die App selbst. Scroll-Meldungen aus dem
  // Zeitraum stammen nicht vom Leser und duerfen nicht als "er ist weggerollt"
  // gewertet werden - sonst bremst die sanfte Bewegung sich selbst aus.
  const eigenerSprung = useRef(0);

  // Steht der Leser gerade ganz unten?
  //
  // Vorher wurde bei jeder eingehenden Nachricht nach unten gesprungen - auch
  // mitten im Nachlesen alter Nachrichten. Wer oben liest, bleibt jetzt oben
  // und bekommt den neuen Stand, sobald er selbst wieder nach unten scrollt.
  useEffect(() => {
    const pruefen = () => {
      if (Date.now() < eigenerSprung.current) return;
      const rest = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stehtUnten.current = rest < 180;
    };
    pruefen();
    window.addEventListener("scroll", pruefen, { passive: true });
    return () => window.removeEventListener("scroll", pruefen);
  }, []);

  useEffect(() => {
    if (!stehtUnten.current) return;
    // Der Platzhalter unten ist so hoch wie Eingabezeile plus Reiter-Leiste.
    // Deshalb landet die letzte Blase ueber der Eingabe statt dahinter - genau
    // das war der gemeldete Fehler.
    eigenerSprung.current = Date.now() + 900;
    ende.current?.scrollIntoView({
      block: "end",
      behavior: erstesMal.current ? "auto" : "smooth",
    });
    erstesMal.current = false;
  }, [liste.length]);

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
                  ⚠ Nicht gesendet – nochmal abschicken
                </div>
              )}
              <div className={`mt-0.5 text-right text-[10px] ${meins ? "text-white/70" : "text-tinte-leise"}`}>
                {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                {(meins || darfLoeschen) && (
                  <button
                    onClick={() =>
                      void frage("Nachricht löschen?", "Löschen", true).then((ok) => ok && onDelete(m.id))
                    }
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
      {/* Platzhalter statt padding-bottom: scrollIntoView richtet sich nach der
          Unterkante dieses Elements. Ein blosses pb-28 lag dahinter und wurde
          einfach mitgescrollt. */}
      <div ref={ende} aria-hidden className="h-[calc(var(--leiste)+var(--eingabe))]" />
    </div>
  );
}

/**
 * Eingabezeile, fest unten über der Reiter-Leiste.
 *
 * Zwei Dinge waren hier falsch: der Abstand nach unten war fest auf die Höhe
 * der Handy-Reiterleiste gesetzt, die es am Rechner gar nicht gibt – dort
 * schwebte die Zeile grundlos über dem Rand. Und die Leiste lief über die
 * ganze Fensterbreite, während der Inhalt auf max-w-5xl begrenzt ist. Auf dem
 * Laptop sah das aus, als hinge sie frei im Bild.
 */
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
    <div className="fixed inset-x-0 bottom-[var(--leiste)] z-30 border-t border-papier-linie bg-papier-matt/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex max-w-5xl items-end gap-2 px-3 py-2 sm:px-5">
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
    </div>
  );
}
