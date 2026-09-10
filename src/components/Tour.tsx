import { useEffect, useLayoutEffect, useState } from "react";

export interface TourStep {
  /** data-tour-Wert des Elements, auf das gezeigt wird (fehlt es, wird der Schritt übersprungen). */
  anchor?: string;
  title: string;
  text: string;
}

interface Rect { top: number; left: number; width: number; height: number }

/**
 * Kurze Einführung: dunkelt die App ab, hebt genau ein Element hervor und
 * erklärt es in einem Satz. Kein Fließtext – man wird hingelotst.
 */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // Nur Schritte behalten, deren Element es in dieser Rolle wirklich gibt.
  const live = steps.filter((s) => !s.anchor || document.querySelector(`[data-tour="${s.anchor}"]`));
  const step = live[i];

  useEffect(() => { if (open) setI(0); }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const messen = () => {
      if (!step.anchor) { setRect(null); return; }
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    messen();
    const t = setTimeout(messen, 260); // nach dem Scrollen nachmessen
    window.addEventListener("resize", messen);
    return () => { clearTimeout(t); window.removeEventListener("resize", messen); };
  }, [open, step, i]);

  if (!open || !step) return null;

  const pad = 8;
  const oben = rect ? rect.top > window.innerHeight * 0.55 : false;
  const letzter = i >= live.length - 1;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Abdunkeln mit Loch um das Element */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-brand transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(2,6,23,.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/72" />
      )}

      {/* Erklärkarte */}
      <div
        className="absolute inset-x-3 mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:inset-x-6"
        style={
          rect
            ? oben
              ? { top: Math.max(12, rect.top - pad - 172) }
              : { top: Math.min(window.innerHeight - 190, rect.top + rect.height + pad + 14) }
            : { top: "35%" }
        }
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[11px] font-bold text-brand">
            {i + 1} / {live.length}
          </span>
          <span className="text-[15px] font-bold">{step.title}</span>
        </div>
        <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">{step.text}</p>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-slate-400">
            Überspringen
          </button>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <button
                onClick={() => setI((v) => v - 1)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700"
              >
                Zurück
              </button>
            )}
            <button
              onClick={() => (letzter ? onClose() : setI((v) => v + 1))}
              className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white"
            >
              {letzter ? "Fertig" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Schritte je Rolle – kurz, konkret, in der Reihenfolge des Bildschirms. */
export function tourSteps(opts: { staff: boolean; ziel: number; zusatz: number }): TourStep[] {
  if (!opts.staff)
    return [
      { anchor: "meine-karte", title: "Deine Kasse", text: "Hier steht, wie viel du der Stufenkasse noch schuldest." },
      { anchor: "meine-halbjahre", title: "Die sechs Halbjahre", text: "25 € pro Halbjahr. Grün = bezahlt, blau = erlassen, grau = noch offen." },
      { anchor: "meine-punkte", title: "Beitragspunkte", text: `Fürs Mithelfen gibt es Punkte. Tippe drauf und du siehst jede Aktion einzeln. Unter ${opts.ziel} Punkten kommen am Ende ${opts.zusatz} € dazu.` },
      { anchor: "tab-events", title: "Events", text: "Mitteilungen und Abstimmungen vom Stufenteam. Die rote Zahl heißt: ungelesen." },
      { anchor: "tab-themen", title: "Chats", text: "Der Chat deines Komitees – und hier stellst du Fragen ans Stufenteam." },
      { anchor: "einstellungen", title: "Einstellungen", text: "Passwort ändern, Nutzungsbedingungen und diese Einführung noch mal starten." },
    ];

  return [
    { anchor: "person", title: "Eine Person", text: "Betrag, Halbjahre und Beitragspunkte auf einen Blick. Antippen öffnet die Person – dort trägst du ihre Beiträge ein." },
    { anchor: "einstellungen", title: "Filter & Einstellungen", text: `Suche eingrenzen, Zielpunkte (${opts.ziel}) und Zusatzbetrag (${opts.zusatz} €) setzen, Import/Export.` },
    { anchor: "massen", title: "Mehrere auf einmal", text: "Personen auswählen und gemeinsam auf bezahlt setzen." },
    { anchor: "tab-events", title: "Events", text: "Nur euer Team postet hier – und legt fest, wer die Mitteilung bekommt." },
    { anchor: "tab-themen", title: "Chats & Tickets", text: "Alle Komitee-Chats seht ihr. Fragen der Stufe landen als Ticket im Stufenteam-Chat." },
    { anchor: "tab-rollen", title: "Rollen", text: "Wer ist Schüler, Stufenteam, Kassenwart oder Admin." },
    { anchor: "tab-rechte", title: "Berechtigungen", text: "Feinsteuerung, wer was darf – nur nötig, wenn ihr vom Standard abweichen wollt." },
  ];
}
