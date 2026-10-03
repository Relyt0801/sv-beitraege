import { hasSupabase, supabase } from "./supabase";

/**
 * „Ich bin gerade in der App“ – solange die App sichtbar ist, alle 30 s ein
 * kurzer Herzschlag an die Datenbank (bin_aktiv). send-push lässt diese
 * Personen aus: wer drin ist, sieht die roten Punkte und braucht kein Pop-up.
 * Beim Wechsel in den Hintergrund wird sofort abgemeldet.
 *
 * Außerdem: Beim Öffnen der App verschwinden die schon angezeigten
 * Mitteilungen – sonst zählt „3 neue Nachrichten“ beim nächsten Mal weiter.
 */
export function startAktiv(): void {
  if (!hasSupabase || typeof document === "undefined") return;
  const melden = (an: boolean) => {
    void supabase!.rpc("bin_aktiv", { p_an: an }).then(
      () => undefined,
      () => undefined,
    );
  };
  const aufraeumen = () => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then((r) => r.getNotifications())
      .then((liste) => liste.forEach((n) => n.close()))
      .catch(() => undefined);
  };
  const sichtbar = () => document.visibilityState === "visible";

  document.addEventListener("visibilitychange", () => {
    if (sichtbar()) {
      melden(true);
      aufraeumen();
    } else melden(false);
  });
  window.addEventListener("pagehide", () => melden(false));
  setInterval(() => sichtbar() && melden(true), 30000);
  // Nach dem Anmelden sofort melden (vorher gibt es keine Kennung)
  supabase!.auth.onAuthStateChange((event) => {
    if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && sichtbar()) melden(true);
  });
  if (sichtbar()) aufraeumen();
}
