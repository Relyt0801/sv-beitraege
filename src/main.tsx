import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store";
import { Fehlerfang } from "./components/Fehlerfang";
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
      <StoreProvider>
        <App />
      </StoreProvider>
    </Fehlerfang>
  </React.StrictMode>,
);
