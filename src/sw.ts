/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

// Offline-Precache (wie bisher)
precacheAndRoute(self.__WB_MANIFEST);
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Pfad relativ zum Scope aufloesen (funktioniert auch unter /sv-beitraege/ auf GitHub Pages).
const asset = (file: string) => new URL(file, self.registration.scope).href;

// Push: Nachricht anzeigen, auch wenn die App geschlossen ist
self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }

  // icon  = grosses, buntes App-Icon (steht rechts in der Benachrichtigung)
  // badge = kleine Silhouette in der Statusleiste. Android nutzt davon NUR die
  //         Alpha-Maske und faerbt sie ein -> muss weiss auf transparent sein,
  //         sonst erscheint ein grauer Kasten.
  const options: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
    timestamp?: number;
  } = {
    body: data.body || "",
    icon: asset("icon-192.png"),
    badge: asset("badge-96.png"),
    lang: "de",
    timestamp: Date.now(),
    vibrate: [80, 40, 80],
    data: { url: data.url || "./" },
  };
  // Gleiche Quelle (z. B. dasselbe Event) ersetzt die alte Meldung statt zu stapeln.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(data.title || "Stufenkasse", options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  const target = new URL(url, self.registration.scope).href;
  // Bereits offenen Tab fokussieren statt jedes Mal einen neuen zu oeffnen.
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if (w.url !== target && "navigate" in w) await w.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
