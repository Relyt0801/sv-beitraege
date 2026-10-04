import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";

/**
 * Update bei allen erzwingen.
 *
 * Normalerweise lädt die App von selbst neu, sobald ein neuer Stand online
 * ist (main.tsx). Für den Notfall kann der Admin im Profil „Update bei allen
 * erzwingen“ drücken: Dann steht in app_settings.neu_laden_ab ein Zeitpunkt.
 * Jede offene App, die VOR diesem Zeitpunkt geladen wurde, löscht Service
 * Worker und Zwischenspeicher und lädt neu – nie mitten beim Tippen, pro
 * Zeitpunkt höchstens einmal.
 */
const GELADEN = Date.now();
const MERKER = "sv:neu-geladen";

function tipptGerade(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

async function hartNeu(stand: string) {
  try {
    if (localStorage.getItem(MERKER) === stand) return;
    localStorage.setItem(MERKER, stand);
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
}

function pruefen(wert: string | null | undefined) {
  if (!wert) return;
  const t = Date.parse(wert);
  if (!Number.isFinite(t) || t <= GELADEN) return; // diese Seite ist schon neuer
  const los = () => void hartNeu(wert);
  if (!tipptGerade()) return los();
  document.addEventListener("focusout", () => setTimeout(() => !tipptGerade() && los(), 400), { once: true });
}

/** Einmal beim Start aufrufen (nach dem Anmelden). Gibt die Abmeldung zurück. */
export function neuLadenBeobachten(): () => void {
  if (!hasSupabase) return () => {};
  const holen = async () => {
    const { data } = await supabase!.from("app_settings").select("neu_laden_ab").eq("id", 1).maybeSingle();
    pruefen((data as { neu_laden_ab?: string | null } | null)?.neu_laden_ab);
  };
  void holen();
  return abonniere({
    name: "sv-neu-laden",
    nachholen: holen,
    aufbauen: (k) =>
      k.on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p) =>
        pruefen((p.new as { neu_laden_ab?: string | null }).neu_laden_ab),
      ),
  });
}

/** Admin: alle offenen Apps neu laden lassen. Gibt einen Fehlertext oder null zurück. */
export async function neuLadenErzwingen(): Promise<string | null> {
  if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
  const { error } = await supabase!.rpc("neu_laden_erzwingen");
  return error ? error.message : null;
}
