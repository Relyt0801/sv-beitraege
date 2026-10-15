import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNetz } from "../lib/netz";

/**
 * Wo unten ist Platz für kurze Hinweise (Offline-Kapsel, Meldungen)?
 *
 * Update 1.4 (U3): Beides lag vorher oben und überdeckte genau die Kopfleiste
 * (Nachtragen, Hell/Dunkel, Profil – im Chat sogar Zurück-Pfeil und Name).
 * Jetzt stehen sie unten, knapp über der Reiterleiste:
 *   - normal:    `calc(var(--leiste) + 12px)` (die Höhe misst App.tsx)
 *   - Vollbild-Chat (ChatEbene, ChatBlasen.tsx): die Reiterleiste ist dort
 *     weg, dafür sitzt unten die Eingabe. Deren Höhe steht als Innenabstand am
 *     Verlauf (data-chat-scroller); die Kapsel rückt darüber – auch wenn die
 *     Tastatur offen ist (die Ebene folgt dem sichtbaren Ausschnitt).
 * `aktiv`: nur messen, solange wirklich etwas angezeigt wird.
 */
export function useUnterkante(aktiv: boolean): string {
  const [px, setPx] = useState<number | null>(null);
  useEffect(() => {
    if (!aktiv) return;
    const messen = () => {
      let wert: number | null = null;
      document.querySelectorAll<HTMLElement>("[data-chat-scroller]").forEach((el) => {
        // Nur der sichtbare Chat zählt (versteckte bleiben im DOM, display:none)
        if (!el.getClientRects().length) return;
        const r = el.getBoundingClientRect();
        const fuss = parseFloat(getComputedStyle(el).paddingBottom) || 0;
        wert = Math.max(0, window.innerHeight - r.bottom) + fuss;
      });
      setPx(wert);
    };
    messen();
    const t = setInterval(messen, 250);
    window.addEventListener("resize", messen);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", messen);
    };
  }, [aktiv]);
  return px === null ? "calc(var(--leiste) + 12px)" : `${Math.round(px) + 12}px`;
}

/**
 * Das Offline-Band (Update 1.4): eine kleine Glas-Kapsel unten, mittig über
 * der Reiterleiste – wie die Hinweise von iOS („Kein Internet“), nicht wie ein
 * roter Warnbalken. Oben würde sie die Kopfleiste verdecken.
 *
 *   - Gerät offline:          „Offline – nichts wird gespeichert“
 *   - Server nicht erreichbar: „Keine Verbindung zum Server“
 *     (Gerät meint online zu sein, aber Anfragen scheitern – z. B. Schul-WLAN
 *     ohne Internet; erkannt in lib/netz.ts über den fetch-Wrapper)
 *   - danach kurz:            „Wieder online“ (grün), dann verschwindet es
 *
 * Steht in AuthGate und umschließt damit die ganze App – auch das
 * Anmeldeformular, wo „Failed to fetch“ bisher am meisten verwirrt hat.
 * Liegt per Portal an <body>, über Blättern (z-50), unter Rückfragen (z-90).
 * Antippen geht durch (pointer-events-none), damit nichts verdeckt wird,
 * was man gerade braucht.
 */
export function OfflineBand() {
  const { zustand, wieder } = useNetz();
  const zeigen = zustand !== "online" || wieder;
  const unten = useUnterkante(zeigen);
  if (!zeigen) return null;

  const offline = zustand === "offline";
  const text = offline
    ? "Offline – nichts wird gespeichert"
    : zustand === "server"
      ? "Keine Verbindung zum Server"
      : "Wieder online";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[86] flex justify-center px-4"
      style={{ bottom: unten }}
      role="status"
      aria-live="polite"
    >
      <div
        key={zustand}
        className="glas flex max-w-full animate-aufsteigen items-center gap-2 rounded-full px-3.5 py-[7px] text-[13px] font-semibold leading-tight text-tinte shadow-[0_8px_24px_-6px_rgba(0,0,0,0.22),0_0_0_0.5px_rgba(0,0,0,0.08)] dark:text-slate-100 dark:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.7),0_0_0_0.5px_rgba(255,255,255,0.12)]"
      >
        {zustand === "online" ? <SymbolHaken /> : <SymbolKeinNetz warn={!offline} />}
        <span>{text}</span>
      </div>
    </div>,
    document.body,
  );
}

/** WLAN-Fächer, durchgestrichen – das Zeichen, das man von iOS kennt. */
function SymbolKeinNetz({ warn }: { warn: boolean }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${warn ? "text-[#FF9500]" : "text-tinte-leise"}`}
    >
      <path d="M2 8.8a15 15 0 0 1 20 0" />
      <path d="M5.5 12.4a10 10 0 0 1 13 0" />
      <path d="M9 16a5 5 0 0 1 6 0" />
      <circle cx="12" cy="19.5" r="0.6" fill="currentColor" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function SymbolHaken() {
  return (
    <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#34C759] text-white dark:bg-[#30D158]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
