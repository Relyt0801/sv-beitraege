import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TourStep {
  /**
   * data-tour-Wert des Elements, auf das gezeigt wird. Gibt es das Element
   * mehrfach (Tab-Leiste unten auf dem Handy, oben am Rechner), wird das
   * sichtbare genommen. Fehlt es ganz, steht die Karte in der Mitte.
   */
  anchor?: string;
  /** Vorher zu diesem Reiter wechseln – so sieht man, was dort steht. */
  tab?: string;
  /** Großes Zeichen über dem Titel (nur für Begrüßung und Abschluss). */
  zeichen?: string;
  title: string;
  text: string;
}

interface Rect { top: number; left: number; width: number; height: number }

/** Das sichtbare Element zu einem Anker – auf jedem Gerät das richtige. */
function finde(anchor: string): HTMLElement | null {
  const alle = document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`);
  for (const el of alle) {
    if (el.getClientRects().length === 0) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none") continue;
    return el;
  }
  return null;
}

const PAD = 8;

/**
 * Kurze Einführung: dunkelt die App ab, hebt genau ein Element hervor und
 * erklärt es in zwei Sätzen. Wechselt dabei selbst die Reiter.
 *
 * Auf dem Handy liegt die Erklärkarte unten oder oben am Rand – dort, wo sie
 * nichts verdeckt. Am Rechner steht sie direkt neben dem Element.
 * Tastatur: Pfeile blättern, Enter weiter, Escape beendet.
 */
export function Tour({
  steps,
  open,
  onClose,
  onTab,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  onTab?: (tab: string) => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [breit, setBreit] = useState(() => window.innerWidth >= 640);
  const [hoehe, setHoehe] = useState(() => window.innerHeight);
  const ziel = useRef<HTMLElement | null>(null);
  const karte = useRef<HTMLDivElement | null>(null);

  const step = steps[i];
  const letzter = i >= steps.length - 1;

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const messen = useCallback(() => {
    setBreit(window.innerWidth >= 640);
    setHoehe(window.innerHeight);
    const el = ziel.current;
    if (!el || !el.isConnected) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Schritt wechselt: erst den Reiter umschalten, dann auf das Element warten.
  useLayoutEffect(() => {
    if (!open || !step) return;
    if (step.tab) onTab?.(step.tab);
    ziel.current = null;
    setRect(null);
    if (!step.anchor) return;

    let versuche = 0;
    let raf = 0;
    let nachScroll: ReturnType<typeof setTimeout> | undefined;
    const suchen = () => {
      const el = finde(step.anchor!);
      if (!el) {
        // Nach einem Reiterwechsel ist das Element evtl. noch nicht gezeichnet.
        if (++versuche < 45) raf = requestAnimationFrame(suchen);
        return;
      }
      ziel.current = el;
      const r = el.getBoundingClientRect();
      const fest = getComputedStyle(el).position === "fixed" || el.closest("nav, header") !== null;
      if (!fest) {
        if (window.innerWidth < 640) {
          // Handy: das Element direkt unter den Kopf, darunter bleibt Platz für die Karte
          if (Math.abs(r.top - 84) > 8) window.scrollBy({ top: r.top - 84, behavior: "smooth" });
        } else if (r.top < 80 || r.bottom > window.innerHeight - 100) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
      messen();
      nachScroll = setTimeout(messen, 380);
    };
    suchen();
    return () => {
      cancelAnimationFrame(raf);
      if (nachScroll) clearTimeout(nachScroll);
    };
    // onTab absichtlich nicht: sonst liefe der Schritt bei jedem Zeichnen neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i, step?.anchor, step?.tab, messen]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", messen);
    window.addEventListener("scroll", messen, { passive: true });
    return () => {
      window.removeEventListener("resize", messen);
      window.removeEventListener("scroll", messen);
    };
  }, [open, messen]);

  const weiter = useCallback(() => (letzter ? onClose() : setI((v) => v + 1)), [letzter, onClose]);
  const zurueck = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    if (!open) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        // Fokus-Falle: sonst landet man mit Tab in der App dahinter
        const knoepfe = [...(karte.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        if (!knoepfe.length) return;
        e.preventDefault();
        const jetzt = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
        const naechster = (jetzt + (e.shiftKey ? -1 : 1) + knoepfe.length) % knoepfe.length;
        knoepfe[naechster].focus();
        return;
      }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") weiter();
      else if (e.key === "ArrowLeft") zurueck();
      else if (e.key === "Enter" && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        weiter();
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [open, weiter, zurueck, onClose]);

  if (!open || !step) return null;

  // ------------------------------------------------ Wo steht die Karte?
  // Karte auf die Seite mit mehr Platz: liegt über dem Element mehr frei, kommt sie darüber.
  const unten = rect ? rect.top > hoehe - (rect.top + rect.height) : false;
  let kartenStil: React.CSSProperties;
  if (!rect) {
    kartenStil = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (!breit) {
    // Handy: an den Rand, der dem Element gegenüberliegt
    kartenStil = unten
      ? { top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }
      : { bottom: "calc(env(safe-area-inset-bottom) + 12px)", left: 12, right: 12 };
  } else {
    // Rechner/Tablet: direkt über oder unter dem Element, mittig ausgerichtet
    const w = 360;
    const links = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 16);
    kartenStil = unten
      ? { bottom: hoehe - rect.top + PAD + 12, left: links, width: w }
      : { top: rect.top + rect.height + PAD + 12, left: links, width: w };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Einführung">
      {/* Abdunkeln mit Loch um das Element */}
      {rect ? (
        <>
          <div
            className="pointer-events-none absolute rounded-[1.25rem] transition-all duration-300 ease-ios"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 9999px rgba(0,0,0,.66)",
            }}
          />
          <div
            className="pointer-events-none absolute animate-puls rounded-[1.25rem] ring-[2.5px] ring-brand transition-all duration-300 ease-ios"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 animate-fadeIn bg-black/60" />
      )}

      {/* Klicks auf die App sind während der Einführung gesperrt */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Erklärkarte: aussen die Lage, innen die Einblend-Bewegung – sonst
          überschreibt die Animation die Zentrierung. */}
      <div className={`absolute ${rect ? "" : "w-[min(24rem,calc(100vw-24px))]"}`} style={kartenStil}>
      <div
        key={i}
        ref={karte}
        className={`relative animate-aufsteigen rounded-[1.5rem] border border-white/40 bg-white/90 p-5 shadow-glas backdrop-blur-2xl backdrop-saturate-[1.8] dark:border-white/10 dark:bg-slate-900/90 ${
          rect ? "" : "text-center"
        }`}
      >
        {!letzter && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full px-3 py-2 text-[13px] font-semibold text-tinte-leise transition active:scale-95"
          >
            Überspringen
          </button>
        )}

        {step.zeichen && <div className="mb-2 mt-1 text-[2.5rem] leading-none">{step.zeichen}</div>}
        <h3 className={`text-[17px] font-semibold leading-snug tracking-[-0.01em] ${letzter ? "" : rect ? "pr-24" : "px-6"}`}>{step.title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{step.text}</p>

        <div className={`mt-4 flex items-center gap-3 ${rect ? "" : "justify-center"}`}>
          {/* Seitenpunkte wie auf dem iPhone-Homescreen */}
          <div className={`flex items-center gap-1.5 ${rect ? "mr-auto" : "absolute bottom-[1.6rem] left-5"}`} aria-label={`Schritt ${i + 1} von ${steps.length}`}>
            {steps.map((_, k) => (
              <span
                key={k}
                className={`h-[7px] rounded-full transition-all duration-300 ease-ios ${
                  k === i ? "w-4 bg-brand" : "w-[7px] bg-slate-300 dark:bg-slate-600"
                }`}
              />
            ))}
          </div>
          <div className={`flex items-center gap-1 ${rect ? "" : "ml-auto"}`}>
            {i > 0 && (
              <button onClick={zurueck} className="rounded-full px-4 py-2.5 text-[15px] font-semibold text-brand transition active:scale-95">
                Zurück
              </button>
            )}
            <button
              onClick={weiter}
              autoFocus
              className="rounded-full bg-brand px-5 py-2.5 text-[15px] font-semibold text-white outline-none transition focus-visible:ring-4 focus-visible:ring-brand/30 active:scale-95"
            >
              {letzter ? "Fertig" : i === 0 && !step.anchor ? "Los geht’s" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ==================================================================== Inhalte

type Staffel = { ab: number; betrag: number }[];

const kette = (st: Staffel) => st.map((x) => `${x.ab} % → ${x.betrag} €`).join(", ");

/** Schüler: die eigene Kasse, Events, Chats, Profil. */
export function schuelerSchritte(staffel: Staffel): TourStep[] {
  const voll = staffel[0]?.betrag ?? 50;
  return [
    {
      zeichen: "👋",
      title: "Willkommen in der Stufenkasse",
      text: "In einer Minute weißt du, wo du was findest. Du kannst jederzeit überspringen.",
    },
    { tab: "kasse", anchor: "meine-karte", title: "Was du noch zahlst", text: "Oben steht dein offener Betrag. Steht dort 0 €, ist alles erledigt." },
    {
      tab: "kasse",
      anchor: "meine-halbjahre",
      title: "Deine sechs Halbjahre",
      text: "✓ heißt bezahlt, € offen, / erlassen. Blau umrandet ist das laufende Halbjahr, graue sind noch nicht fällig.",
    },
    {
      tab: "kasse",
      anchor: "meine-punkte",
      title: "Mithelfen lohnt sich",
      text: `Hilfst du bei Aktionen mit, sammelst du Prozent. Je mehr Prozent, desto kleiner der Aufschlag auf dein Abiball-Ticket – ohne Mithilfe ${voll} €, bei 100 % keiner.`,
    },
    { tab: "events", anchor: "tab-events", title: "Events", text: "Termine, Aktionen und Abstimmungen vom Stufenteam. Für Aktionen trägst du dich hier ein." },
    { tab: "themen", anchor: "tab-themen", title: "Chats", text: "Hier chattest du mit deinem Komitee und stellst dem Stufenteam Fragen." },
    { tab: "kasse", anchor: "profil", title: "Dein Profil", text: "Bild, Namensfarbe, Passwort und Mitteilungen. Dort startest du diese Einführung auch neu." },
  ];
}

/** Stufenteam und alle mit Sonderrolle – je nach Rechten mehr oder weniger Reiter. */
export function teamSchritte(o: {
  kasseBearbeiten: boolean;
  mehrere: boolean;
  beitraege: boolean;
  finanzen: boolean;
  rollen: boolean;
  rechte: boolean;
}): TourStep[] {
  const s: TourStep[] = [
    {
      zeichen: "👋",
      title: "Willkommen im Stufenteam",
      text: "Ein kurzer Rundgang durch alle Reiter – nur das Wichtigste. Du kannst jederzeit überspringen.",
    },
    { tab: "kasse", anchor: "kassenkopf", title: "Die Lage auf einen Blick", text: "Wie viel in der Stufe noch offen ist und wie viele noch zahlen müssen." },
    {
      tab: "kasse",
      anchor: "person",
      title: "Eine Person",
      text: o.kasseBearbeiten
        ? "Ein Tipp auf ein Halbjahr schaltet zwischen offen, bezahlt und erlassen. Ein Tipp auf den Namen öffnet alle Details und die Mithilfe."
        : "Ein Tipp auf den Namen öffnet alle Details – dort trägst du auch ein, wobei jemand geholfen hat.",
    },
  ];
  if (o.mehrere)
    s.push({ tab: "kasse", anchor: "massen", title: "Mehrere auf einmal", text: "Personen auswählen und allen gleichzeitig eine Mithilfe oder einen Status geben." });
  s.push(
    { tab: "events", anchor: "tab-events", title: "Events", text: "Mitteilungen, Aktionen und Abstimmungen. Mit ＋ erstellst du neue und legst fest, wer sie bekommt." },
    { tab: "themen", anchor: "tab-themen", title: "Chats", text: "Alle Komitee-Chats, der Stufenteam-Chat und die Fragen der Eltern an einem Ort." },
  );
  if (o.beitraege)
    s.push({ tab: "beitraege", anchor: "tab-beitraege", title: "Beiträge & Abiball", text: "Was jedes Halbjahr kostet, die Prozent-Staffel fürs Ticket und die Vorlagen für Mithilfe." });
  if (o.finanzen)
    s.push({ tab: "finanzen", anchor: "tab-finanzen", title: "Finanzen", text: "Das Kassenbuch: Kontostand, Einnahmen und Ausgaben. Ein Tipp auf eine Buchung zeigt alle Details." });
  if (o.rollen)
    s.push({ tab: "rollen", anchor: "tab-rollen", title: "Rollen", text: "Wer welche Rolle hat. Mit dem Schalter „Elternzugänge anzeigen“ holst du die Eltern dazu und legst fest, welche Kinder sie sehen." });
  if (o.rechte)
    s.push({ tab: "rechte", anchor: "tab-rechte", title: "Rechte", text: "Feineinstellung, wer was darf. Nur nötig, wenn ihr vom Standard abweichen wollt." });
  s.push({ tab: "kasse", anchor: "profil", title: "Dein Profil", text: "Bild, Passwort und Mitteilungen. Dort startest du diese Einführung jederzeit neu." });
  return s;
}

/** Eltern: siezen, nur drei Reiter. */
export function elternSchritte(o: { mehrereKinder: boolean }): TourStep[] {
  const kind = o.mehrereKinder ? "Ihre Kinder" : "Ihr Kind";
  return [
    {
      zeichen: "👋",
      title: "Willkommen bei der Stufenkasse",
      text: `Hier sehen Sie auf einen Blick, was für ${kind} offen ist und wie es beim Abiball-Ticket steht.`,
    },
    {
      tab: "uebersicht",
      anchor: "familie-offen",
      title: "Was noch offen ist",
      text: o.mehrereKinder
        ? "Die Summe für alle Ihre Kinder. Überweisen Sie bitte für jedes Kind einzeln."
        : "Der Betrag, der noch zu zahlen ist. Steht hier 0 €, ist alles bezahlt.",
    },
    {
      tab: "uebersicht",
      anchor: "kind-halbjahre",
      title: "Sechs Halbjahre",
      text: "✓ bezahlt, € offen, / erlassen. Blau umrandet ist das laufende Halbjahr, graue sind noch nicht fällig. EF ist die 11, Q1 und Q2 die 12 und 13.",
    },
    {
      tab: "uebersicht",
      anchor: "kind-prozent",
      title: "Mithelfen senkt den Ticketpreis",
      text: "Hilft Ihr Kind bei Aktionen, sammelt es Prozent. Je mehr, desto kleiner der Aufschlag auf das erste Abiball-Ticket.",
    },
    { tab: "infos", anchor: "tab-infos", title: "Infos & Fragen", text: "Mitteilungen des Stufenteams. Hier können Sie auch direkt eine Frage stellen." },
    { tab: "konto", anchor: "konto-daten", title: "Überweisen", text: "Kontodaten und Verwendungszweck zum Kopieren – mit einem Tipp in der Zwischenablage." },
    { tab: "uebersicht", anchor: "profil", title: "Ihr Zugang", text: "Hier oben rechts: Passwort ändern, Mitteilungen einschalten und diese Einführung erneut starten." },
  ];
}
