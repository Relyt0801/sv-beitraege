import { useEffect, useState } from "react";

/**
 * „App installieren" – und warum das nicht überall gleich geht.
 *
 * Chrome, Edge und Samsung Internet melden sich von selbst mit dem Ereignis
 * `beforeinstallprompt`. Das fangen wir schon in index.html ab (React startet
 * dafür zu spät) und legen es unter window.__svInstall ab. Ein Tipp auf den
 * Knopf ruft dann den echten Installationsdialog des Browsers auf.
 *
 * Safari auf iPhone und iPad kennt dieses Ereignis NICHT – Apple hat es nie
 * eingebaut. Dort gibt es keinen Weg, die Installation aus der Seite heraus
 * anzustoßen; es bleibt nur „Teilen -> Zum Home-Bildschirm". Deshalb zeigt der
 * Knopf dort eine Anleitung statt eines Dialogs. Das ist keine Bequemlichkeit,
 * das ist die Grenze des Browsers.
 *
 * Und noch eine ehrliche Einschränkung: Ob die App auf einem iPhone/iPad
 * bereits auf dem Home-Bildschirm liegt, kann die Seite im Safari-Tab nicht
 * erkennen. Sie weiß nur, ob sie GERADE als installierte App läuft. Deshalb
 * gibt es den Knopf „Hab ich gemacht" – danach ist Ruhe.
 */

export interface InstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __svInstall?: InstallPrompt | null;
    __svInstalled?: boolean;
  }
}

const ERLEDIGT = "sv:install-erledigt";
const OVERLAY_GESEHEN = "sv:install-gezeigt";

/** Läuft die Seite gerade als installierte App? */
export function laeuftAlsApp(): boolean {
  if (typeof window === "undefined") return false;
  const alsApp = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((m) => {
    try {
      return window.matchMedia(`(display-mode: ${m})`).matches;
    } catch {
      return false;
    }
  });
  // Safari auf iOS meldet es über eine eigene Eigenschaft.
  const iosApp = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return alsApp || iosApp;
}

/** iPhone, iPod – und iPad, das sich seit iPadOS 13 als Mac ausgibt. */
export function istApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
}

/** Auf dem iPhone/iPad kann NUR Safari installieren – Chrome und Firefox dort nicht. */
export function appleAberNichtSafari(): boolean {
  if (!istApple()) return false;
  const ua = navigator.userAgent || "";
  return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Karte und Begrüßungs-Bildschirm sind zwei Bausteine, sollen aber denselben
 * Stand sehen. Deshalb liegt er hier im Modul und nicht in jedem Baustein
 * einzeln – sonst blieb die Karte nach dem Installieren aus dem Overlay heraus
 * stehen, bis jemand neu geladen hat.
 */
const hoerer = new Set<() => void>();
function melden() {
  for (const h of [...hoerer]) h();
}

function lies(schluessel: string): boolean {
  try {
    return localStorage.getItem(schluessel) === "1";
  } catch {
    return false; // privates Fenster o. Ä. – dann fragt es eben noch einmal
  }
}
function schreib(schluessel: string) {
  try {
    localStorage.setItem(schluessel, "1");
  } catch {
    /* nicht schlimm */
  }
}

const stand = {
  erledigt: typeof window === "undefined" ? false : lies(ERLEDIGT),
  overlayWeg: typeof window === "undefined" ? true : lies(OVERLAY_GESEHEN),
  alsApp: typeof window === "undefined" ? false : laeuftAlsApp(),
  prompt: (typeof window === "undefined" ? null : window.__svInstall) ?? null,
};

function merkeErledigt() {
  if (stand.erledigt) return;
  stand.erledigt = true;
  schreib(ERLEDIGT);
  melden();
}

export type Weg = "dialog" | "anleitung" | "anderer-browser";

export interface InstallStand {
  /** Soll überhaupt etwas angeboten werden? */
  zeigen: boolean;
  /** Wie wird installiert? */
  weg: Weg;
  /** Startet den Browser-Dialog (nur bei weg === "dialog"). */
  installieren: () => Promise<void>;
  /** Hinweis wegklicken und nicht wiederkommen lassen. */
  erledigen: () => void;
  /** Darf der einmalige Begrüßungs-Bildschirm jetzt kommen? */
  overlayFaellig: boolean;
  /** Merkt, dass der Begrüßungs-Bildschirm weg ist. */
  overlayGesehen: () => void;
}

// Einmal pro Seitenaufruf: auf die Meldungen des Browsers hören.
if (typeof window !== "undefined") {
  window.addEventListener("sv:installierbar", () => {
    stand.prompt = window.__svInstall ?? null;
    melden();
  });
  window.addEventListener("appinstalled", () => {
    stand.alsApp = true;
    stand.prompt = null;
    merkeErledigt();
    melden();
  });
  try {
    window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
      stand.alsApp = laeuftAlsApp();
      melden();
    });
  } catch {
    /* alter Browser – dann bleibt es beim Wert vom Start */
  }
}

export function useInstall(): InstallStand {
  const [, neuZeichnen] = useState(0);

  useEffect(() => {
    const h = () => neuZeichnen((n) => n + 1);
    hoerer.add(h);
    // Zwischen Modulstart und erstem Zeichnen kann sich etwas geändert haben.
    h();
    return () => {
      hoerer.delete(h);
    };
  }, []);

  const art: Weg = stand.prompt ? "dialog" : appleAberNichtSafari() ? "anderer-browser" : "anleitung";

  // Auf dem Rechner ohne Installationsangebot (Firefox, alte Browser) hätte ein
  // Knopf keinen Sinn – dann lieber gar nichts zeigen als eine Anleitung, die
  // zu nichts führt.
  const machbar = art === "dialog" || istApple();
  const zeigen = !stand.alsApp && !stand.erledigt && machbar;

  return {
    zeigen,
    weg: art,
    overlayFaellig: zeigen && !stand.overlayWeg,
    overlayGesehen: () => {
      if (stand.overlayWeg) return;
      stand.overlayWeg = true;
      schreib(OVERLAY_GESEHEN);
      melden();
    },
    erledigen: merkeErledigt,
    installieren: async () => {
      const p = stand.prompt;
      if (!p) return;
      await p.prompt();
      const { outcome } = await p.userChoice;
      // Der Browser gibt das Ereignis nur einmal her.
      window.__svInstall = null;
      stand.prompt = null;
      if (outcome === "accepted") merkeErledigt();
      else melden();
    },
  };
}
