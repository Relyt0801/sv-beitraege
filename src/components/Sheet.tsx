import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Ein Blatt, das von unten hochfaehrt – wie auf dem iPhone.
 *
 * Auf dem Handy: Griff oben, nach unten wischen schliesst. Auf dem Rechner
 * steht es als Fenster in der Mitte. Escape und ein Tipp daneben schliessen
 * immer.
 */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [zug, setZug] = useState(0);
  const [ziehend, setZiehend] = useState(false);
  const start = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Die Seite dahinter scrollt nicht mit.
  useEffect(() => {
    if (!open) return;
    const alt = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = alt;
    };
  }, [open]);

  useEffect(() => {
    if (open) setZug(0);
  }, [open]);

  if (!open) return null;

  const loslassen = () => {
    setZiehend(false);
    if (zug > 110) onClose();
    else setZug(0);
  };

  // Direkt an <body>: so liegt das Blatt immer ueber Kopf- und Tab-Leiste,
  // egal in welcher (animierten) Ebene es geoeffnet wurde.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Schließen"
        tabIndex={-1}
        className="absolute inset-0 animate-fadeIn cursor-default bg-black/40 dark:bg-black/60"
        style={{ opacity: 1 - Math.min(zug / 500, 0.6) }}
        onClick={onClose}
      />
      <div
        className="relative max-h-[92dvh] w-full max-w-2xl animate-sheetIn overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1.5 shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.75rem] sm:pt-5"
        style={{
          transform: zug ? `translateY(${zug}px)` : undefined,
          transition: ziehend ? "none" : "transform .38s cubic-bezier(.32,.72,0,1)",
        }}
      >
        {/* Griff: nach unten ziehen schliesst */}
        <div
          className="-mx-5 -mt-1.5 mb-2 flex h-6 cursor-grab touch-none items-center justify-center sm:hidden"
          onPointerDown={(e) => {
            start.current = e.clientY;
            setZiehend(true);
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => ziehend && setZug(Math.max(0, e.clientY - start.current))}
          onPointerUp={loslassen}
          onPointerCancel={loslassen}
        >
          <span className="h-[5px] w-9 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Überschrift im Blatt – links der Titel, rechts ein runder Schließen-Knopf. */
export function SheetKopf({ titel, unter, onClose }: { titel: ReactNode; unter?: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">{titel}</h2>
        {unter && <p className="mt-0.5 text-[13px] text-tinte-leise">{unter}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="-m-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
      >
        {/* Sichtbar 30 px, antippbar 44 px */}
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
          ✕
        </span>
      </button>
    </div>
  );
}
