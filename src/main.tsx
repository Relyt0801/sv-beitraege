import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store";
import { Fehlerfang } from "./components/Fehlerfang";
import { Verbindungshinweis } from "./components/Verbindungshinweis";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fehlerfang>
      {/* Ganz außen, damit auch die Datenspeicher Meldungen zeigen können. */}
      <MelderProvider>
        <Verbindungshinweis />
        <StoreProvider>
          <App />
        </StoreProvider>
      </MelderProvider>
    </Fehlerfang>
  </React.StrictMode>,
);
