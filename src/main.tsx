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
 * Nach einem Deploy übernimmt der neue Service Worker sofort (skipWaiting +
 * clients.claim). Die offene Seite läuft dann noch mit den alten Dateien –
 * das ergab die leere Seite. Deshalb: einmal automatisch neu laden.
 */
if ("serviceWorker" in navigator) {
  let neugeladen = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (neugeladen) return;
    neugeladen = true;
    window.location.reload();
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
