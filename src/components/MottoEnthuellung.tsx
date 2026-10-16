import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasSupabase, supabase } from "../lib/supabase";
import { scrollSperren } from "../lib/scrollsperre";
import { useRole } from "../auth/RoleProvider";

/**
 * Enthüllung des Abimottos – Variante „Bühne“ (vom Auftraggeber gewählt).
 *
 * Sobald das offizielle Motto gekürt ist (gewinner_kueren setzt
 * motto_vorschlaege.gewaehlt), sieht es jede Person – Schüler, Team und
 * Eltern – genau EINMAL beim nächsten Öffnen der App:
 *
 *   1. Die App dahinter wird weichgezeichnet und dunkel, ein Farblicht
 *      leuchtet auf und dreht sich langsam.
 *   2. „Euer Abimotto steht fest“ blendet ein und wieder aus (Eltern lesen
 *      „Das Abimotto steht fest“ – es ist ja nicht ihres).
 *   3. Jahrgang, dann das Motto Wort für Wort, ein Lichtschimmer läuft
 *      darüber, Konfetti von beiden Seiten.
 *   4. „Gewählt mit N Stimmen“ (wenn bekannt), Knopf „Weiter“ schließt.
 *
 * Antippen überspringt zum Endbild; im Endbild schließt Antippen (irgendwo)
 * ebenfalls – nicht nur der Knopf „Weiter“. Das Konfetti liegt hinter dem
 * Motto-Text, nie darüber. Mit „Bewegung reduzieren“ steht sofort das
 * Endbild da (ohne Konfetti).
 *
 * Datenquelle: RPC motto_enthuellung() – für alle angemeldeten Zugänge, auch
 * Eltern. Realtime auf motto_vorschlaege dürfen Eltern nicht lesen, darum wird
 * beim Start und jedes Mal, wenn die App wieder sichtbar wird, neu gefragt.
 * Gesehen-Merker je Person (Gerät) und Motto: localStorage
 * „sv:motto-gesehen:<motto-id>“.
 *
 * Demo-Modus (ohne Datenbank): nur mit ?enthuellung=1 in der Adresse, dann mit
 * einem erfundenen Motto.
 *
 * Eingebunden wird <MottoEnthuellung /> (ohne Props) einmal in App.tsx und
 * ElternApp.tsx. zeigeMottoEnthuellung() spielt sie erneut ab (z. B. aus den
 * Motto-Einstellungen „Enthüllung ansehen“).
 *
 * Danach gibt es einen Weg, das Motto wiederzusehen: <MottoFeststehend />
 * (kleine Karte, z. B. in der Eltern-Übersicht) zeigt das feststehende Motto;
 * Antippen spielt die Enthüllung erneut ab.
 *
 * Vorlage: scratchpad/anim/motto-enthuellung.html (keynote() + konfetti()).
 * Die Stile stehen hier selbst (Präfix „enth-“), damit Ablauf und Aussehen
 * genau der Vorlage folgen und nichts mit der App kollidiert.
 */

/** Ist die Person ein Elternteil? (Ohne Rollen-Provider, z. B. im Test: nein) */
function useIstEltern(): boolean {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRole().isEltern;
  } catch {
    return false;
  }
}

/** Jahrgangs-Zeile über dem Motto. Steht in App.tsx bisher hart als „Abi 28“ –
 *  sobald es dafür eine Einstellung gibt, von dort holen. */
const JAHRGANG = "Abi 2028";

export interface EnthuellungDaten {
  id: string;
  motto: string;
  /** Stimmen des Gewinners (falls beim Küren bekannt) */
  stimmen: number | null;
}

/** Erfundenes Motto für den Demo-Modus (?enthuellung=1) */
const DEMO: EnthuellungDaten = { id: "demo-enthuellung", motto: "Abikalypse – wir haben überlebt", stimmen: 87 };

/** Das feststehende Motto holen (RPC) – null, wenn keins feststeht oder (noch) nicht erlaubt */
async function holeMotto(): Promise<EnthuellungDaten | null> {
  if (!hasSupabase) return demoGewuenscht() ? DEMO : null;
  const { data, error } = await supabase!.rpc("motto_enthuellung");
  if (error) return null;
  const zeile = (Array.isArray(data) ? data[0] : data) as { id?: string; motto?: string; stimmen?: number | null } | null | undefined;
  if (!zeile?.id || !zeile.motto) return null;
  return { id: zeile.id, motto: zeile.motto, stimmen: zeile.stimmen ?? null };
}

const EREIGNIS = "sv:motto-enthuellung";
const merkerSchluessel = (id: string) => `sv:motto-gesehen:${id}`;

function gesehen(id: string): boolean {
  try {
    return localStorage.getItem(merkerSchluessel(id)) === "1";
  } catch {
    return false;
  }
}
function merken(id: string) {
  try {
    localStorage.setItem(merkerSchluessel(id), "1");
  } catch {
    /* privater Modus – dann eben beim nächsten Mal noch einmal */
  }
}
function vergessen(id: string) {
  try {
    localStorage.removeItem(merkerSchluessel(id));
  } catch {
    /* egal */
  }
}

function demoGewuenscht(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("enthuellung") === "1";
  } catch {
    return false;
  }
}

/**
 * Enthüllung (erneut) abspielen – setzt den Gesehen-Merker zurück.
 * Mit Daten wird genau dieses Motto gezeigt, ohne neu zu fragen; ohne Daten
 * fragt die Komponente die Datenbank (bzw. im Demo-Modus das Demo-Motto).
 */
export function zeigeMottoEnthuellung(daten?: EnthuellungDaten) {
  window.dispatchEvent(new CustomEvent<EnthuellungDaten | undefined>(EREIGNIS, { detail: daten }));
}

/* ====================================================================== */
/* Rahmen: wann zeigen?                                                   */
/* ====================================================================== */
export function MottoEnthuellung() {
  const [daten, setDaten] = useState<EnthuellungDaten | null>(null);
  // Zähler je Abspielen: neuer Schlüssel = Bühne startet frisch
  const [lauf, setLauf] = useState(0);
  const offen = useRef(false);

  const zeigen = useCallback((d: EnthuellungDaten) => {
    offen.current = true;
    setDaten(d);
    setLauf((n) => n + 1);
  }, []);

  /** Nachsehen, ob ein Motto feststeht, das ich noch nicht gesehen habe */
  const pruefen = useCallback(
    async (erzwingen = false) => {
      if (offen.current && !erzwingen) return;
      // Im Demo-Modus ist ?enthuellung=1 ausdrücklich gewünscht → immer zeigen
      if (!hasSupabase) erzwingen = erzwingen || demoGewuenscht();
      const d = await holeMotto();
      if (!d) return; // keins gekürt, noch nicht angemeldet … – später wieder
      if (!erzwingen && gesehen(d.id)) return;
      if (offen.current && !erzwingen) return;
      zeigen(d);
    },
    [zeigen],
  );

  useEffect(() => {
    void pruefen();
    // Eltern bekommen keine Live-Meldung – also bei jedem Zurückkommen fragen
    const sichtbar = () => {
      if (document.visibilityState === "visible") void pruefen();
    };
    const abspielen = (e: Event) => {
      const d = (e as CustomEvent<EnthuellungDaten | undefined>).detail;
      if (d) {
        vergessen(d.id);
        zeigen(d);
      } else void pruefen(true);
    };
    document.addEventListener("visibilitychange", sichtbar);
    window.addEventListener(EREIGNIS, abspielen);
    return () => {
      document.removeEventListener("visibilitychange", sichtbar);
      window.removeEventListener(EREIGNIS, abspielen);
    };
  }, [pruefen, zeigen]);

  const fertig = useCallback(() => {
    if (daten) merken(daten.id);
    offen.current = false;
    setDaten(null);
  }, [daten]);

  if (!daten || typeof document === "undefined") return null;
  return createPortal(<Buehne key={lauf} daten={daten} onFertig={fertig} />, document.body);
}

/* ====================================================================== */
/* Die Bühne                                                              */
/* ====================================================================== */
type Phase = "laeuft" | "ende" | "zu";

function Buehne({ daten, onFertig }: { daten: EnthuellungDaten; onFertig: () => void }) {
  const wurzel = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>("laeuft");
  const [an, setAn] = useState(false); // Schleier und Unschärfe eingeblendet
  const anis = useRef<Animation[]>([]);
  const timer = useRef<number[]>([]);
  const raf = useRef(0);
  const phaseRef = useRef<Phase>("laeuft");
  phaseRef.current = phase;
  const ruhig = useRef(typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const eltern = useIstEltern();
  // Wann das Endbild erschien – ein zweiter, hastiger Tipp direkt nach dem Überspringen schließt noch nicht
  const endeSeit = useRef(0);

  const woerter = daten.motto.trim().split(/\s+/).filter(Boolean);
  // Lange Mottos etwas kleiner, damit sie auf das Handy passen
  const laenge = daten.motto.length;
  const groesse = laenge <= 22 ? 40 : laenge <= 40 ? 34 : laenge <= 60 ? 30 : 26;

  // Seite dahinter nicht mitscrollen lassen
  useEffect(() => scrollSperren(), []);

  /* -------------------------------------------------------------- Werkzeuge */
  const ani = (el: Element | null | undefined, frames: Keyframe[], opt: KeyframeAnimationOptions) => {
    if (!el || typeof (el as HTMLElement).animate !== "function") return;
    const a = (el as HTMLElement).animate(frames, { fill: "forwards", easing: "cubic-bezier(.22,1,.36,1)", ...opt });
    anis.current.push(a);
    return a;
  };
  const spaeter = (ms: number, f: () => void) => {
    timer.current.push(window.setTimeout(f, ms));
  };
  const q = (sel: string) => wurzel.current?.querySelector(sel) ?? null;

  /** Endbild: „Weiter“ einblenden */
  const zeigeEnde = (sofort: boolean) => {
    endeSeit.current = Date.now();
    setPhase("ende");
    ani(q(".enth-weiter"), [{ opacity: 0 }, { opacity: 1 }], { duration: sofort ? 1 : 500 });
    window.setTimeout(() => weiterKnopf.current?.focus({ preventScroll: true }), sofort ? 0 : 520);
  };

  /** Alles auf das Ende setzen; Konfetti, das noch nicht losging, fällt aus */
  const ueberspringen = () => {
    for (const a of anis.current) {
      try {
        a.finish();
      } catch {
        // endlose Animation (Drehung des Lichts) – mit „Bewegung reduzieren“ anhalten
        if (ruhig.current) a.cancel();
      }
    }
    timer.current.forEach(clearTimeout);
    timer.current = [];
    zeigeEnde(true);
  };

  /* -------------------------------------------------------------- Konfetti */
  const konfetti = () => {
    const cv = leinwand.current;
    if (ruhig.current || !cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr;
    cv.height = r.height * dpr;
    const c = cv.getContext("2d");
    if (!c) return;
    const farben = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#ffd60a", "#30d158", "#ffffff"];
    type Teil = { x: number; y: number; vx: number; vy: number; g: number; w: number; h: number; rot: number; vr: number; farbe: string; leben: number };
    let teile: Teil[] = [];
    // Breitere Bildschirme bekommen etwas mehr
    const anzahl = Math.round(170 * Math.min(1.8, Math.max(1, r.width / 420)));
    for (let i = 0; i < anzahl; i++) {
      const links = i % 2 === 0;
      teile.push({
        x: (links ? 0.08 : 0.92) * cv.width,
        y: cv.height * 0.62,
        vx: (links ? 1 : -1) * (4 + Math.random() * 9) * dpr,
        vy: -(10 + Math.random() * 12) * dpr,
        g: 0.32 * dpr,
        w: (5 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 8) * dpr,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.35,
        farbe: farben[i % farben.length],
        leben: 0,
      });
    }
    const schritt = () => {
      c.clearRect(0, 0, cv.width, cv.height);
      teile = teile.filter((t) => t.y < cv.height + 40 && t.leben < 260);
      for (const t of teile) {
        t.leben++;
        t.vx *= 0.985;
        t.vy = t.vy * 0.985 + t.g;
        t.x += t.vx;
        t.y += t.vy;
        t.rot += t.vr;
        c.save();
        c.translate(t.x, t.y);
        c.rotate(t.rot);
        c.scale(1, Math.cos(t.leben * 0.18)); // Flattern
        c.fillStyle = t.farbe;
        c.globalAlpha = Math.min(1, (260 - t.leben) / 60);
        c.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);
        c.restore();
      }
      if (teile.length) raf.current = requestAnimationFrame(schritt);
    };
    cancelAnimationFrame(raf.current);
    schritt();
  };

  /* -------------------------------------------------------------- Ablauf (keynote) */
  useLayoutEffect(() => {
    // Schleier und Unschärfe im nächsten Bild einblenden (CSS-Übergang)
    const f = requestAnimationFrame(() => setAn(true));

    const orb = q(".enth-orb");
    ani(orb, [{ opacity: 0, transform: "scale(.4) rotate(0deg)" }, { opacity: 0.75, transform: "scale(1) rotate(120deg)" }], { duration: 2600, delay: 300 });
    if (orb && !ruhig.current) anis.current.push((orb as HTMLElement).animate([{ rotate: "0deg" }, { rotate: "360deg" }], { duration: 14000, iterations: Infinity }));
    ani(
      q(".enth-vorwort"),
      [
        { opacity: 0, transform: "translateY(10px)", filter: "blur(8px)" },
        { opacity: 1, transform: "none", filter: "blur(0)", offset: 0.35 },
        { opacity: 1, offset: 0.75 },
        { opacity: 0, transform: "translateY(-8px)", filter: "blur(6px)" },
      ],
      { duration: 2000, delay: 700 },
    );
    ani(q(".enth-augen"), [{ opacity: 0, letterSpacing: ".6em" }, { opacity: 1, letterSpacing: ".32em" }], { duration: 1200, delay: 2500 });
    const ws = Array.from(wurzel.current?.querySelectorAll(".enth-wort") ?? []);
    ws.forEach((w, i) => {
      ani(w, [{ opacity: 0, transform: "translateY(26px) scale(.96)", filter: "blur(18px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], {
        duration: 1100,
        delay: 2900 + i * 140,
      });
    });
    const ende = 2900 + ws.length * 140 + 700;
    // Lichtschimmer über alle Wörter
    ws.forEach((w) => ani(w, [{ backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0" }], { duration: 1500, delay: ende, easing: "ease-in-out" }));
    spaeter(ende + 150, () => {
      ani(q(".enth-motto"), [{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.35 }, { transform: "scale(1)" }], {
        duration: 700,
        easing: "cubic-bezier(.34,1.56,.64,1)",
      });
      konfetti();
    });
    ani(q(".enth-fuss"), [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: ende + 700 });
    spaeter(ende + 1500, () => zeigeEnde(false));
    if (ruhig.current) ueberspringen();

    return () => {
      cancelAnimationFrame(f);
      anis.current.forEach((a) => a.cancel());
      anis.current = [];
      timer.current.forEach(clearTimeout);
      timer.current = [];
      cancelAnimationFrame(raf.current);
    };
    // Einmal je Bühne (neuer Lauf = neuer key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** „Weiter“: ausblenden, dann zurück in die App */
  const schliessen = () => {
    if (phaseRef.current === "zu") return;
    setPhase("zu");
    setAn(false);
    ani(q(".enth-inhalt"), [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.04)" }], { duration: ruhig.current ? 200 : 450 });
    ani(q(".enth-konfetti"), [{ opacity: 1 }, { opacity: 0 }], { duration: ruhig.current ? 200 : 450 });
    window.setTimeout(onFertig, ruhig.current ? 220 : 650);
  };

  // Escape: erst überspringen, dann schließen
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phaseRef.current === "laeuft") ueberspringen();
      else schliessen();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wurzel}
      className={`enth ${an ? "enth-an" : ""} ${ruhig.current ? "enth-ruhig" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${eltern ? "Das" : "Euer"} Abimotto: ${daten.motto}`}
      // Läuft noch: zum Endbild springen. Endbild: Antippen schließt (wie „Weiter“).
      onClick={() => {
        if (phaseRef.current === "laeuft") ueberspringen();
        else if (Date.now() - endeSeit.current > 500) schliessen();
      }}
    >
      <style>{STIL}</style>
      <div className="enth-hinten" aria-hidden />
      <div className="enth-schleier" aria-hidden />
      <canvas ref={leinwand} className="enth-konfetti" aria-hidden />
      {phase === "laeuft" && <div className="enth-ueberspringen">Antippen zum Überspringen</div>}
      {phase === "ende" && <div className="enth-schliessen-hinweis" aria-hidden>Antippen zum Schließen</div>}
      <div className="enth-inhalt">
        <div className="enth-orb" aria-hidden />
        <div className="enth-vorwort" aria-hidden>
          {eltern ? "Das" : "Euer"} Abimotto steht fest
        </div>
        <div className="enth-mitte">
          <div className="enth-augen">{JAHRGANG}</div>
          <div className="enth-motto" style={{ ["--g" as string]: `${groesse}px` }}>
            {woerter.map((w, i) => (
              <span key={i} className="enth-wort">
                {w}
              </span>
            ))}
          </div>
          <div className="enth-fuss">{daten.stimmen != null && daten.stimmen > 0 ? `Gewählt mit ${daten.stimmen} ${daten.stimmen === 1 ? "Stimme" : "Stimmen"}` : ""}</div>
        </div>
        <button
          ref={weiterKnopf}
          type="button"
          className="enth-weiter"
          tabIndex={phase === "laeuft" ? -1 : 0}
          onClick={(e) => {
            e.stopPropagation();
            if (phaseRef.current === "laeuft") ueberspringen();
            else schliessen();
          }}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Stile – wie in der Vorlage (Variante Keynote)                          */
/* ====================================================================== */
const STIL = `
.enth { position: fixed; inset: 0; z-index: 300; color: #fff; cursor: pointer; isolation: isolate;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
/* Die App dahinter: weichgezeichnet (statt sie selbst zu verändern) */
.enth-hinten { position: absolute; inset: 0; -webkit-backdrop-filter: blur(0px); backdrop-filter: blur(0px);
  transition: backdrop-filter .9s ease, -webkit-backdrop-filter .9s ease; }
.enth-an .enth-hinten { -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); }
.enth-schleier { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity .8s ease; }
.enth-an .enth-schleier { opacity: .92; }
/* Stapelfolge: Licht < Konfetti (5) < Text und Vorwort (6) < Knopf (7) < Hinweis (8).
   .enth-inhalt hat bewusst KEIN z-index – sonst wäre es eine Ebene für sich und das
   Konfetti läge über dem Motto statt dahinter. */
.enth-konfetti { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 5; pointer-events: none; }
.enth-inhalt { position: absolute; inset: 0; }
.enth-orb { position: absolute; left: 50%; top: 42%; width: 320px; height: 320px; margin: -160px 0 0 -160px; border-radius: 50%;
  background: conic-gradient(from 0deg, #0a84ff, #5e5ce6, #bf5af2, #ff375f, #ff9f0a, #0a84ff);
  filter: blur(60px); opacity: 0; transform: scale(.4); pointer-events: none; }
.enth-mitte { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 0 26px; gap: 14px; z-index: 6; }
.enth-augen { font-size: 13px; font-weight: 600; letter-spacing: .32em; text-transform: uppercase; opacity: 0; color: rgba(255,255,255,.75); }
.enth-vorwort { font-size: 22px; font-weight: 600; letter-spacing: -.01em; opacity: 0; position: absolute; top: 50%; left: 0; right: 0;
  margin-top: -14px; text-align: center; padding: 0 26px; z-index: 6; }
.enth-motto { font-size: var(--g, 40px); line-height: 1.04; font-weight: 800; letter-spacing: -.035em; text-wrap: balance;
  display: flex; flex-wrap: wrap; justify-content: center; column-gap: .26em; max-width: 640px; overflow-wrap: anywhere; }
.enth-wort { display: inline-block; opacity: 0;
  background: linear-gradient(100deg, #fff 0%, #fff 38%, #ffe7b3 46%, #ffffff 52%, #cfe3ff 58%, #fff 66%, #fff 100%);
  background-size: 300% 100%; background-position: 100% 0; -webkit-background-clip: text; background-clip: text; color: transparent; }
.enth-fuss { font-size: 14px; color: rgba(255,255,255,.7); opacity: 0; min-height: 1.2em; }
.enth-weiter { position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 44px); transform: translateX(-50%);
  opacity: 0; z-index: 7; padding: 13px 34px; border: 0; border-radius: 999px; font: inherit; font-size: 16px; font-weight: 600; color: #fff;
  background: rgba(255,255,255,.16); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
  box-shadow: 0 0 0 .5px rgba(255,255,255,.35) inset; cursor: pointer; transition: background .2s; }
.enth-weiter:active { background: rgba(255,255,255,.26); }
.enth-weiter:focus-visible { outline: 2px solid rgba(255,255,255,.55); outline-offset: 3px; }
.enth-ueberspringen { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 18px); right: 18px; z-index: 8;
  font-size: 13px; font-weight: 600; color: rgba(255,255,255,.75); animation: enth-ein .4s ease both; }
.enth-schliessen-hinweis { position: absolute; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom, 0px) + 14px); z-index: 7;
  text-align: center; font-size: 12px; font-weight: 500; color: rgba(255,255,255,.55); pointer-events: none; animation: enth-ein .6s ease both; }
@keyframes enth-ein { from { opacity: 0 } to { opacity: 1 } }
/* Bewegung reduzieren: Übergänge kurz halten */
.enth-ruhig .enth-hinten, .enth-ruhig .enth-schleier { transition-duration: .2s; }
/* Größere Bildschirme (iPad, Rechner): Licht und Schrift größer */
@media (min-width: 700px) {
  .enth-orb { width: 480px; height: 480px; margin: -240px 0 0 -240px; filter: blur(80px); }
  .enth-motto { font-size: calc(var(--g, 40px) * 1.45); }
  .enth-augen { font-size: 15px; }
  .enth-vorwort { font-size: 28px; }
  .enth-fuss { font-size: 16px; }
}
`;

/* ====================================================================== */
/* Karte „Das Abimotto steht fest“ – der Weg, die Enthüllung wiederzusehen */
/* ====================================================================== */
/**
 * Kleine Karte mit dem feststehenden Motto. Antippen spielt die Enthüllung
 * erneut ab. Zeigt nichts, solange kein Motto gekürt ist. Gedacht für die
 * Eltern-Übersicht (dort sieht man die Enthüllung sonst nur einmal), geht aber
 * überall. Fragt beim Einblenden und beim Zurückkommen in die App nach, weil
 * Eltern keine Live-Meldungen bekommen.
 */
export function MottoFeststehend({ className = "" }: { className?: string }) {
  const eltern = useIstEltern();
  const [daten, setDaten] = useState<EnthuellungDaten | null>(null);
  useEffect(() => {
    let weg = false;
    const laden = () => void holeMotto().then((d) => !weg && setDaten(d));
    laden();
    const sichtbar = () => {
      if (document.visibilityState === "visible") laden();
    };
    document.addEventListener("visibilitychange", sichtbar);
    return () => {
      weg = true;
      document.removeEventListener("visibilitychange", sichtbar);
    };
  }, []);
  if (!daten) return null;
  return (
    <button
      type="button"
      onClick={() => zeigeMottoEnthuellung(daten)}
      aria-label={`${eltern ? "Das" : "Euer"} Abimotto steht fest: ${daten.motto}. Antippen für die Enthüllung`}
      className={`relative w-full overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#5E5CE6] via-[#7B4FD8] to-[#BF5AF2] p-4 text-left text-white shadow-[0_12px_28px_-14px_rgba(94,92,230,.85)] transition duration-200 ease-ios active:scale-[.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-papier ${className}`}
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <span className="relative block text-[12px] font-semibold uppercase tracking-[0.12em] text-white/80">
        {eltern ? "Das" : "Euer"} Abimotto steht fest
      </span>
      <span className="relative mt-1 block text-[1.45rem] font-extrabold leading-[1.1] tracking-[-0.02em] [overflow-wrap:anywhere]">{daten.motto}</span>
      <span className="relative mt-2.5 inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-white/20 px-3 text-[13px] font-semibold">
        Enthüllung noch einmal ansehen <span aria-hidden>›</span>
      </span>
    </button>
  );
}
