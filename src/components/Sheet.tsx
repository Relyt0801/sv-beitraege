import {
  createContext,
  isValidElement,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { scrollSperren } from "../lib/scrollsperre";

/**
 * Escape schliesst immer nur das OBERSTE Fenster (Update 1.4, U3).
 *
 * Vorher hing jedes offene Blatt mit einem eigenen Tasten-Griff am Fenster –
 * bei Profil → Funktionen → Einstellungen schloss ein einziges Escape alle
 * drei auf einmal. Jetzt tragen sich alle Fenster (Blätter, Patch-Notes,
 * „Du bist gemeldet“ …) in einen gemeinsamen Stapel ein; reagieren darf nur
 * das zuletzt geöffnete. Die Rückfragen (Melder.tsx) und die Einführung
 * (Tour.tsx) greifen noch davor ab (capture) und sind damit ohnehin obenauf.
 */
const stapel: number[] = [];
let naechsteKennung = 1;
const stapelZu = new Map<number, MutableRefObject<() => void>>();

/*
 * Zurück-Taste (Android, Browser, Wischgeste) wie Escape (Rollen-Prüfung
 * Okt. 2026: sie verliess die App, statt Chat, Kalender oder Blatt zu
 * schliessen). Solange irgendeine Ebene offen ist, liegt GENAU EIN eigener
 * Eintrag („Wache“) in der Browser-History. Zurück entfernt ihn – das
 * schliesst die oberste Ebene; liegen darunter noch welche, kommt eine neue
 * Wache. Schliesst sich die letzte Ebene anders (✕, Esc, Tipp daneben),
 * wird die Wache wieder entfernt – aber nur, wenn sie noch oben liegt (ein
 * Sprung per #reiter darüber bleibt unangetastet). Gleiche Adresse, daher
 * kein hashchange.
 */
let wache = false;
let wacheIgnorieren = false;
function wacheSetzen() {
  if (wache) return;
  try {
    history.pushState({ svEbene: 1 }, "");
    wache = true;
  } catch {
    /* z. B. in eingebetteten Ansichten ohne History */
  }
}
function wacheLoesen() {
  // Erst nach dem Zug: schliesst ein Blatt und öffnet im selben Zug ein
  // anderes (Neu erstellen → Aktion), bleibt die Wache einfach stehen
  setTimeout(() => {
    if (stapel.length || !wache) return;
    wache = false;
    if ((history.state as { svEbene?: number } | null)?.svEbene) {
      wacheIgnorieren = true;
      history.back();
    }
  }, 0);
}
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (wacheIgnorieren) {
      wacheIgnorieren = false;
      return;
    }
    if (!wache) return;
    wache = false;
    const oben = stapel[stapel.length - 1];
    if (oben !== undefined) stapelZu.get(oben)?.current();
    // Noch Ebenen offen (oder die oberste blieb, z. B. Entwurfsschutz): neue Wache
    setTimeout(() => {
      if (stapel.length) wacheSetzen();
    }, 60);
  });
}

export function useEscapeSchliesst(aktiv: boolean, onClose: () => void) {
  // Immer die neueste Funktion aufrufen, ohne den Stapel-Platz zu verlieren
  const zu = useRef(onClose);
  zu.current = onClose;
  useEffect(() => {
    if (!aktiv) return;
    const id = naechsteKennung++;
    stapel.push(id);
    stapelZu.set(id, zu);
    wacheSetzen();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stapel[stapel.length - 1] !== id) return;
      zu.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stapel.indexOf(id);
      if (i >= 0) stapel.splice(i, 1);
      stapelZu.delete(id);
      if (!stapel.length) wacheLoesen();
    };
  }, [aktiv]);
}

/**
 * Entwurfsschutz für Escape/Zurück: Steht im fokussierten Textfeld des
 * Bereichs noch Text, nimmt der erste Druck nur den Fokus heraus (wie in
 * ChatEbene) – sonst wäre Getipptes mit einem Tastendruck weg.
 */
function entwurfZuerst(bereich: HTMLElement | null): boolean {
  const f = document.activeElement;
  if (!bereich || !f || !bereich.contains(f)) return false;
  const text = f instanceof HTMLTextAreaElement || (f instanceof HTMLInputElement && /^(text|search|email|url|tel|number|password)$/.test(f.type));
  if (!text || !(f as HTMLInputElement | HTMLTextAreaElement).value.trim()) return false;
  (f as HTMLElement).blur();
  return true;
}

/* ====================================================================== */
/* Stapel der offenen Blätter – Unterseiten wie in iOS                    */
/* ====================================================================== */
/*
 * Prüfung Okt. 2026: Profil → Funktionen legte ein zweites, kleineres Fenster
 * mittig über „Mein Profil“; beide Köpfe mit ✕ waren zu sehen, das ✕ des
 * oberen führte nur zurück, das des unteren schloss alles. Jetzt gilt:
 *
 *   - Ein Blatt, das über einem anderen aufgeht (Profil → Funktionen,
 *     Person → Rechte), ERSETZT es an derselben Stelle – wie eine Unterseite
 *     in den iOS-Einstellungen. Das Blatt darunter bleibt gemountet (Scroll-
 *     stand und Eingaben bleiben), wird nur unsichtbar.
 *   - Sein Kopf zeigt von selbst „‹ <Titel der Seite davor>“ (zurück) und
 *     rechts das ✕, das den GANZEN Stapel schliesst. Escape und „‹“ gehen
 *     eine Seite zurück, ein Tipp daneben oder nach unten wischen schliesst
 *     alles.
 *   - Unterseite ist NUR, was über einem noch offenen Blatt aufgeht. Wer ein
 *     Blatt schliesst und im selben Zug ein anderes öffnet (z. B. „Neu
 *     erstellen“ → „Aktion mit Schichten“ in App.tsx), bekommt ein normales
 *     Blatt ohne „‹“ – ein Zurück-Knopf, der alles schliesst, wäre schlimmer
 *     als keiner (Gegenprüfung Okt. 2026). Für echte Unterseiten das untere
 *     Blatt offen lassen (nicht `open={offen && !unterseite}`).
 *   - Unterblätter ohne Kopf (SheetKopf/RechnungKopf) bleiben wie früher ein
 *     eigenes Fenster darüber – sonst gäbe es keinen Weg zurück.
 *
 * Am Handy behält ein Blatt beim Umblättern und Auf-/Zuklappen seine Höhe
 * (es wird nie kleiner, solange es offen ist) – der Kopf bleibt stehen.
 */
type Blatt = {
  /** Neueste onClose-Funktion des Blatts */
  zu: MutableRefObject<() => void>;
  /** Text des Kopfs – wird zum „‹ …“ einer Unterseite */
  titel?: string;
  /** Wie viele Köpfe (SheetKopf/RechnungKopf) gerade im Blatt stehen */
  koepfe: number;
  /** Größte gemessene Höhe in diesem Durchgang (px, nur am Handy benutzt) */
  hoehe: number;
  /** Blatt, in dessen Inhalt dieses steht (React-Baum) */
  eltern: Blatt | null;
};

const blaetter: Blatt[] = [];
let blattStand = 0;
const blattHoerer = new Set<() => void>();
function blattMelden() {
  blattStand++;
  for (const h of [...blattHoerer]) h();
}
const blattAbo = (h: () => void) => {
  blattHoerer.add(h);
  return () => {
    blattHoerer.delete(h);
  };
};
const blattStandLesen = () => blattStand;
const nichtsLesen = () => 0;

/** Schliesst alle gestapelten Blätter – von oben nach unten. */
function alleSchliessen() {
  for (const b of [...blaetter].reverse()) {
    try {
      b.zu.current();
    } catch (e) {
      console.error(e);
    }
  }
}

/** Reiner Text eines Titels (auch aus <span>…</span>), sonst undefined */
function textVon(n: ReactNode): string | undefined {
  if (typeof n === "string") return n;
  if (typeof n === "number") return String(n);
  if (Array.isArray(n)) {
    const teile = n.map(textVon);
    return teile.every((t) => t !== undefined) ? teile.join("") : undefined;
  }
  if (isValidElement<{ children?: ReactNode }>(n)) return textVon(n.props.children);
  return undefined;
}

type BlattLage = {
  /** Unterseite: steht an der Stelle eines anderen Blatts */
  kind: boolean;
  /** Text für „‹ …“ */
  zurueckText: string;
  /** Den ganzen Stapel schliessen (✕) */
  alleSchliessen: () => void;
  /** id für die Überschrift (aria-labelledby des Fensters) */
  titelId: string;
};
const BlattKontext = createContext<BlattLage | null>(null);
/**
 * Unterseite im SELBEN Blatt (SheetKopf/RechnungKopf mit `zurueck`): der Kopf
 * trägt hier seine Zurück-Funktion ein – Escape und die Zurück-Taste gehen
 * dann eine Seite zurück statt das ganze Blatt zu schliessen.
 */
const ZurueckKontext = createContext<MutableRefObject<(() => void) | null> | null>(null);

/** Für Köpfe mit eigenem `zurueck` (siehe ZurueckKontext) */
export function useZurueckKanal(zurueck: (() => void) | undefined) {
  const kanal = useContext(ZurueckKontext);
  useLayoutEffect(() => {
    if (!kanal || !zurueck) return;
    kanal.current = zurueck;
    return () => {
      if (kanal.current === zurueck) kanal.current = null;
    };
  }, [kanal, zurueck]);
}
/** Kopf meldet sich im Blatt an – stabil je Blatt, damit nichts im Kreis läuft */
const KopfKontext = createContext<((titel: string | undefined) => () => void) | null>(null);
const ElternKontext = createContext<Blatt | null>(null);

/**
 * Für Köpfe in Blättern (SheetKopf, RechnungKopf): Lage des Blatts im Stapel
 * und Anmeldung als Kopf. Ausserhalb eines Blatts: null bzw. nichts.
 */
export function useBlattKopf(titel: ReactNode): BlattLage | null {
  const lage = useContext(BlattKontext);
  const kopf = useContext(KopfKontext);
  const text = textVon(titel)?.trim() || undefined;
  useLayoutEffect(() => kopf?.(text), [kopf, text]);
  return lage;
}

const KURVE = "cubic-bezier(.32,.72,0,1)";

/** Einblenden per Web Animations (keine neuen CSS-Regeln nötig) */
function einblenden(p: HTMLElement | null, grund: HTMLElement | null, art: "neu" | "vor" | "zurueck") {
  if (!p || typeof p.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const gross = window.matchMedia?.("(min-width: 640px)").matches;
  if (art === "neu") {
    p.animate(
      gross
        ? [{ transform: "scale(.96)", opacity: 0 }, { transform: "none", opacity: 1 }]
        : [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: gross ? 280 : 420, easing: KURVE },
    );
    grund?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease" });
  } else {
    const x = art === "vor" ? 28 : -28;
    p.animate([{ transform: `translateX(${x}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 280, easing: KURVE });
  }
}

/**
 * Klebender Fuß (FussLeiste) am unteren Rand halten, auch wenn das Blatt am
 * Handy wegen der festgehaltenen Höhe größer ist als sein Inhalt – sonst
 * stünde der Knopf mitten im Blatt.
 */
function fussRichten(p: HTMLElement) {
  let f = p.lastElementChild as HTMLElement | null;
  for (let t = 0; f && t < 4 && getComputedStyle(f).position !== "sticky"; t++) f = f.lastElementChild as HTMLElement | null;
  if (!f || getComputedStyle(f).position !== "sticky") return;
  const fuss = f;
  const basis = fuss.dataset.fussBasis !== undefined ? Number(fuss.dataset.fussBasis) : parseFloat(getComputedStyle(fuss).marginTop) || 0;
  const setzen = (n: number) => {
    if (n > 0) {
      fuss.dataset.fussBasis = String(basis);
      fuss.style.marginTop = `${basis + n}px`;
    } else {
      delete fuss.dataset.fussBasis;
      fuss.style.marginTop = "";
    }
  };
  setzen(0);
  let y = 0;
  let el: HTMLElement | null = fuss;
  while (el && el !== p) {
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  if (el !== p) return;
  let frei = Math.floor(p.clientHeight - (y + fuss.offsetHeight));
  if (frei <= 0) return;
  setzen(frei);
  // Hüllen mit eigenem Abstand unten: was überläuft, wieder abziehen
  const ueber = p.scrollHeight - p.clientHeight;
  if (ueber > 0) {
    frei = Math.max(0, frei - ueber);
    setzen(frei);
  }
}

/**
 * Ein Blatt, das von unten hochfaehrt – wie auf dem iPhone.
 *
 * Auf dem Handy: Griff oben, nach unten wischen schliesst. Ab Tablet steht
 * es als Fenster OBEN angedockt (nicht senkrecht mittig): der Kopf mit ✕ ist
 * auf jedem Blatt an derselben Stelle und springt beim Auf-/Zuklappen nicht.
 * Escape (nur das oberste Blatt) und ein Tipp daneben schliessen immer. Der
 * Kopf (SheetKopf) bleibt beim Scrollen oben stehen, damit das ✕ immer
 * erreichbar ist. Blätter über Blättern: siehe „Stapel“ oben.
 *
 * `hoch`: am Handy gleich in voller Höhe – für Blätter mit eigenen
 * Unterseiten (Motto, Zitate, Rankings, Album), damit der Kopf beim
 * Umblättern nicht wandert.
 */
export function Sheet({ open, onClose, children, hoch }: { open: boolean; onClose: () => void; children: ReactNode; hoch?: boolean }) {
  const [zug, setZug] = useState(0);
  const [ziehend, setZiehend] = useState(false);
  const start = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const grund = useRef<HTMLButtonElement>(null);
  const zu = useRef(onClose);
  zu.current = onClose;
  const eltern = useContext(ElternKontext);
  const ichRef = useRef<Blatt | null>(null);
  if (!ichRef.current) ichRef.current = { zu, koepfe: 0, hoehe: 0, eltern };
  const ich = ichRef.current;
  ich.eltern = eltern;
  const einstieg = useRef<"neu" | "vor">("neu");
  const titelId = useId();

  // Neu zeichnen, wenn sich der Stapel ändert (nur solange offen)
  useSyncExternalStore(blattAbo, open ? blattStandLesen : nichtsLesen, nichtsLesen);

  // Escape/Zurück: erst Entwurf schützen, dann eine Unterseite im selben
  // Blatt zurück (ZurueckKontext), sonst das Blatt schliessen
  const zurueckRef = useRef<(() => void) | null>(null);
  useEscapeSchliesst(open, () => {
    if (entwurfZuerst(panel.current)) return;
    (zurueckRef.current ?? zu.current)();
  });

  // Die Seite dahinter scrollt nicht mit.
  useEffect(() => {
    if (!open) return;
    return scrollSperren();
  }, [open]);

  useEffect(() => {
    if (open) setZug(0);
  }, [open]);

  // Anmelden im Stapel
  useLayoutEffect(() => {
    if (!open) return;
    const unten = blaetter[blaetter.length - 1];
    // Unterseite: gleich so hoch wie die Seite darunter (Kopf springt nicht)
    ich.hoehe = unten ? unten.hoehe : 0;
    einstieg.current = unten ? "vor" : "neu";
    // Kinder (React-Baum) melden sich vor den Eltern an – Eltern dann davor einreihen
    const kindStelle = blaetter.findIndex((b) => b.eltern === ich);
    if (kindStelle >= 0) blaetter.splice(kindStelle, 0, ich);
    else blaetter.push(ich);

    // Fokus ins Blatt, beim Schliessen zurück zum Auslöser
    const vorher = document.activeElement as HTMLElement | null;
    const p = panel.current;
    if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true });
    einblenden(p, einstieg.current === "neu" ? grund.current : null, einstieg.current);
    blattMelden();
    return () => {
      const i = blaetter.indexOf(ich);
      if (i >= 0) {
        const warOben = i === blaetter.length - 1;
        blaetter.splice(i, 1);
        // Höhe weitergeben: die Seite darunter kommt in derselben Höhe zurück
        const darunter = blaetter[i - 1];
        if (warOben && darunter) darunter.hoehe = Math.max(darunter.hoehe, ich.hoehe);
      }
      blattMelden();
      requestAnimationFrame(() => {
        const a = document.activeElement;
        if (vorher?.isConnected && (!a || a === document.body) && !/^(INPUT|TEXTAREA|SELECT)$/.test(vorher.tagName)) vorher.focus({ preventScroll: true });
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Höhe festhalten (Handy) und den Fuß unten halten
  useLayoutEffect(() => {
    if (!open) return;
    const p = panel.current;
    if (!p || typeof ResizeObserver === "undefined") return;
    p.style.setProperty("--blatt-min", `${ich.hoehe}px`);
    let rahmen = 0;
    const ro = new ResizeObserver(() => {
      const h = p.offsetHeight;
      if (h > ich.hoehe + 0.5) {
        ich.hoehe = h;
        p.style.setProperty("--blatt-min", `${h}px`);
      }
      cancelAnimationFrame(rahmen);
      rahmen = requestAnimationFrame(() => fussRichten(p));
    });
    const beobachten = () => {
      ro.disconnect();
      ro.observe(p);
      for (const k of Array.from(p.children)) ro.observe(k);
    };
    beobachten();
    const mo = new MutationObserver(beobachten);
    mo.observe(p, { childList: true });
    fussRichten(p);
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(rahmen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const kopf = useCallback(
    (titel: string | undefined) => {
      ich.koepfe++;
      ich.titel = titel;
      blattMelden();
      return () => {
        ich.koepfe = Math.max(0, ich.koepfe - 1);
        blattMelden();
      };
    },
    [ich],
  );

  // Lage im Stapel
  const idx = open ? blaetter.indexOf(ich) : -1;
  const ersetzt = idx > 0 && ich.koepfe > 0;
  const verdeckt = idx >= 0 && blaetter.slice(idx + 1).some((b) => b.koepfe > 0);
  const dunkel = !ersetzt;
  const davor = idx > 0 ? blaetter[idx - 1] : undefined;
  const zurueckText = davor?.titel && davor.titel.length <= 22 ? davor.titel : "Zurück";

  const lage = useMemo<BlattLage>(() => ({ kind: ersetzt, zurueckText, alleSchliessen, titelId }), [ersetzt, zurueckText, titelId]);

  // Eine Unterseite geht darüber auf: dieses Blatt gleitet etwas nach links
  // und blendet aus (wie in iOS), danach unsichtbar. Geht sie wieder zu:
  // von links zurück herein.
  const warVerdeckt = useRef(false);
  const wegAnim = useRef<Animation | null>(null);
  const [versteckt, setVersteckt] = useState(false);
  useLayoutEffect(() => {
    const p = panel.current;
    if (!open) {
      warVerdeckt.current = false;
      wegAnim.current = null;
      setVersteckt(false);
      return;
    }
    if (verdeckt && !warVerdeckt.current) {
      if (p && typeof p.animate === "function" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        const a = p.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-28px)" }], { duration: 280, easing: KURVE, fill: "forwards" });
        wegAnim.current = a;
        a.onfinish = () => setVersteckt(true);
      } else setVersteckt(true);
    } else if (!verdeckt && warVerdeckt.current) {
      wegAnim.current?.cancel();
      wegAnim.current = null;
      setVersteckt(false);
      // Höhe der Unterseite übernehmen (der Beobachter wächst nur mit eigener Höhe)
      p?.style.setProperty("--blatt-min", `${ich.hoehe}px`);
      einblenden(p, null, "zurueck");
    }
    warVerdeckt.current = verdeckt;
  }, [open, verdeckt]);

  if (!open) return null;

  const schliessen = ersetzt ? alleSchliessen : onClose;
  const loslassen = () => {
    setZiehend(false);
    if (zug > 110) schliessen();
    else setZug(0);
  };

  // Direkt an <body>: so liegt das Blatt immer ueber Kopf- und Tab-Leiste,
  // egal in welcher (animierten) Ebene es geoeffnet wurde.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:px-6 sm:pb-6 sm:pt-[6dvh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ich.koepfe > 0 ? titelId : undefined}
      aria-hidden={verdeckt || undefined}
    >
      <button
        ref={grund}
        type="button"
        aria-label="Schließen"
        tabIndex={-1}
        className={`absolute inset-0 cursor-default ${dunkel ? "bg-black/40 dark:bg-black/60" : "bg-transparent"}`}
        style={{ opacity: 1 - Math.min(zug / 500, 0.6) }}
        onClick={schliessen}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain outline-none blatt rounded-t-[1.75rem] bg-papier px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1.5 shadow-2xl dark:bg-slate-900 max-sm:min-h-[min(var(--blatt-min,0px),92dvh)] sm:max-h-[88dvh] sm:origin-top sm:rounded-[1.75rem] sm:pt-5 ${
          hoch ? "max-sm:!min-h-[92dvh]" : ""
        } ${verdeckt && versteckt ? "invisible" : ""}`}
        style={{
          transform: zug ? `translateY(${zug}px)` : undefined,
          transition: ziehend ? "none" : "transform .38s cubic-bezier(.32,.72,0,1)",
        }}
      >
        {/* Griff: nach unten ziehen schliesst */}
        <div
          className="-mx-5 -mt-1.5 flex h-6 cursor-grab touch-none items-center justify-center sm:hidden"
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
        <ElternKontext.Provider value={ich}>
          <KopfKontext.Provider value={kopf}>
            <ZurueckKontext.Provider value={zurueckRef}>
              <BlattKontext.Provider value={lage}>{children}</BlattKontext.Provider>
            </ZurueckKontext.Provider>
          </KopfKontext.Provider>
        </ElternKontext.Provider>
      </div>
    </div>,
    document.body,
  );
}

/** Runder Knopf „✕“ (sichtbar 30 px, antippbar 44 px) */
export function SchliessenKnopf({ onClick, className = "-m-1.5" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Schließen"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${className}`}
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
        ✕
      </span>
    </button>
  );
}

/** Blauer Zurück-Knopf „‹ Titel“ wie in iOS */
export function ZurueckKnopf({ text, onClick, className = "" }: { text: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-ml-1.5 flex min-h-[44px] max-w-full items-center gap-0.5 rounded-full pr-2 text-[15px] font-medium text-brand-dark transition active:opacity-50 dark:text-brand ${className}`}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="m15 6-6 6 6 6" />
      </svg>
      <span className="truncate">{text}</span>
    </button>
  );
}

/**
 * Überschrift im Blatt – links der Titel, rechts ein runder Schließen-Knopf.
 *
 * Bleibt beim Scrollen oben stehen (sticky, leicht milchig): In langen Blättern
 * (Funktionen, Einstellungen, Rechte) war nach einem Bildschirm kein ✕ mehr zu
 * sehen. Wirkt, wenn der Kopf direkt im Blatt steht – Sheet scrollt als Ganzes.
 *
 * Steht das Blatt als Unterseite über einem anderen, kommt „‹ <Seite davor>“
 * von selbst dazu, und ✕ schliesst den ganzen Stapel.
 */
export function SheetKopf({
  titel,
  unter,
  onClose,
  extra,
  zurueck,
  name,
}: {
  titel: ReactNode;
  unter?: ReactNode;
  onClose: () => void;
  /** Kurzname für „‹ …“ der nächsten Unterseite, wenn der Titel kein reiner Text ist */
  name?: string;
  /** Weitere runde Knöpfe links neben dem Schließen (z. B. Einstellungen) */
  extra?: ReactNode;
  /**
   * Unterseite im selben Blatt (wie „‹ Einstellungen“ in iOS): blauer
   * Zurück-Knopf über dem Titel. `text` ist der Name der Seite davor.
   */
  zurueck?: { text: string; onClick: () => void };
}) {
  const lage = useBlattKopf(name ?? titel);
  useZurueckKanal(zurueck?.onClick);
  const zurueckJetzt = zurueck ?? (lage?.kind ? { text: lage.zurueckText, onClick: onClose } : undefined);
  return (
    <div className="sticky top-0 z-10 -mx-5 mb-2 flex items-start gap-3 bg-papier px-5 pb-2 pt-2 shadow-[0_-24px_0_0_rgb(var(--papier))] dark:bg-slate-900 dark:shadow-[0_-24px_0_0_#1C1C1E]">
      <div className="min-w-0 flex-1">
        {zurueckJetzt && <ZurueckKnopf text={zurueckJetzt.text} onClick={zurueckJetzt.onClick} className="-mt-1.5 mb-0.5" />}
        <h2 id={lage?.titelId} className="text-[1.375rem] font-bold leading-tight tracking-[-0.02em]">
          {titel}
        </h2>
        {unter && <p className="mt-0.5 text-[13px] text-tinte-leise">{unter}</p>}
      </div>
      {extra}
      <SchliessenKnopf onClick={lage?.kind ? lage.alleSchliessen : onClose} />
    </div>
  );
}
