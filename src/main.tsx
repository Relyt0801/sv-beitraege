import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./store";
import { Fehlerfang } from "./components/Fehlerfang";
// Schriften selbst ausliefern statt von Google laden (DSGVO: keine IP an Dritte)
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
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
