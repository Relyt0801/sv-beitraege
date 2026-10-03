import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store";
import { Fehlerfang } from "./components/Fehlerfang";
import { startAktiv } from "./lib/aktiv";
import { MelderProvider } from "./components/Melder";
// Keine eigenen Schriften: Die App nutzt die Systemschrift des Geraets –
// San Francisco auf iPhone, iPad und Mac. Nichts wird nachgeladen, also
// auch keine IP-Adresse an Dritte (DSGVO).
import "./index.css";

/**
 * Immer die neueste Version (Wunsch 28.09.):
 *
 * 1. Der Service Worker sucht regelmäßig nach einem neuen Stand – alle 5
 *    Minuten und jedes Mal, wenn die App wieder in den Vordergrund kommt.
 *    Ohne das prüft der Browser nur beim Öffnen, und eine App, die tagelang
 *    im Hintergrund offen bleibt, bliebe auf dem alten Stand.
 * 2. Ist ein neuer Stand da, übernimmt er sofort (skipWaiting + clients.claim
 *    in sw.ts) und die Seite lädt einmal neu.
 * 3. Tippt man gerade etwas (Eingabefeld hat den Fokus), wird nicht mitten im
 *    Satz neu geladen, sondern sobald das Feld verlassen wird oder die App in
 *    den Hintergrund geht – so geht keine Eingabe verloren.
 */
if ("serviceWorker" in navigator) {
  let neugeladen = false;
  const tipptGerade = () => {
    const el = document.activeElement as HTMLElement | null;
    return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
  };
  const neuLaden = () => {
    if (neugeladen) return;
    neugeladen = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tipptGerade()) return neuLaden();
    const spaeter = () => {
      setTimeout(() => {
        if (!tipptGerade() || document.visibilityState === "hidden") neuLaden();
      }, 400);
    };
    document.addEventListener("focusout", spaeter);
    document.addEventListener("visibilitychange", spaeter);
  });

  void navigator.serviceWorker.ready.then((reg) => {
    const pruefen = () => {
      if (navigator.onLine) void reg.update().catch(() => {});
    };
    setInterval(pruefen, 5 * 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pruefen();
    });
    window.addEventListener("online", pruefen);
  });
}

/**
 * Sicherheitsnetz ohne Service Worker (28.09.): Auf manchen iPhones/iPads
 * bleibt der Service Worker hängen und die App läuft tagelang mit einem alten
 * Stand – dann fehlen z. B. Reiter, die es erst seit Kurzem gibt. Darum liegt
 * bei jedem Build /version.json mit dem Bau-Zeitpunkt. Ist online ein neuerer
 * Stand als der laufende, wird zuerst das normale Update versucht; kommt es
 * nicht binnen 15 s, werden Service Worker und Zwischenspeicher gelöscht und
 * die Seite neu geladen – nie beim Tippen, pro neuem Stand höchstens einmal.
 */
if (typeof __BAU_ZEIT__ === "string" && __BAU_ZEIT__ && import.meta.env.PROD) {
  const tipptGerade = () => {
    const el = document.activeElement as HTMLElement | null;
    return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
  };
  let laeuft = false;
  const hartNeu = async (stand: string) => {
    try {
      if (sessionStorage.getItem("sv:hart-neu") === stand) return; // schon versucht
      sessionStorage.setItem("sv:hart-neu", stand);
    } catch {
      /* ohne Speicher trotzdem */
    }
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    } catch {
      /* dann eben nur neu laden */
    }
    window.location.reload();
  };
  const vergleichen = async () => {
    if (laeuft || !navigator.onLine || document.visibilityState !== "visible") return;
    laeuft = true;
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const online = (await r.json()) as { zeit?: string };
      if (!online.zeit || online.zeit <= __BAU_ZEIT__) return;
      // Neuer Stand da: erst der normale Weg (Service Worker), dann hart
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        await reg?.update();
      } catch {
        /* egal */
      }
      setTimeout(() => {
        const los = () => void hartNeu(online.zeit!);
        if (!tipptGerade()) return los();
        document.addEventListener("focusout", () => setTimeout(() => !tipptGerade() && los(), 400), { once: true });
      }, 15_000);
    } catch {
      /* offline o. Ä. – beim nächsten Mal */
    } finally {
      laeuft = false;
    }
  };
  setTimeout(() => void vergleichen(), 3000);
  setInterval(() => void vergleichen(), 5 * 60_000);
  document.addEventListener("visibilitychange", () => void vergleichen());
}

// Wer in der App ist, bekommt keine Pop-ups (siehe lib/aktiv.ts)
startAktiv();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fehlerfang>
      {/* Ganz außen, damit auch die Datenspeicher Meldungen zeigen können. */}
      <MelderProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </MelderProvider>
    </Fehlerfang>
  </React.StrictMode>,
);
