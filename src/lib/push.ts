import { hasSupabase, supabase } from "./supabase";

/** Notnagel aus der Build-Umgebung. Wird nur genutzt, wenn der Server schweigt. */
const VAPID_AUS_ENV = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || "";

/**
 * Den öffentlichen Schlüssel holen wir uns vom Server.
 *
 * Grund: In der App und auf dem Server muss derselbe Schlüssel stecken, sonst
 * nimmt kein Handy die Benachrichtigung an. Solange die App ihren Schlüssel aus
 * einer Einstellung bei Vercel bezieht, können die beiden auseinanderlaufen –
 * und man merkt es erst, wenn nichts mehr ankommt. Fragt die App direkt beim
 * Server nach, kann das nicht mehr passieren.
 *
 * Der öffentliche Schlüssel ist kein Geheimnis, er steht ohnehin in der
 * ausgelieferten App. Der private bleibt auf dem Server.
 */
let serverSchluessel: string | null | undefined = undefined; // undefined = noch nicht gefragt
let abfrage: Promise<string> | null = null;

async function schluessel(): Promise<string> {
  if (!hasSupabase) return VAPID_AUS_ENV;
  if (serverSchluessel !== undefined) return serverSchluessel || VAPID_AUS_ENV;
  if (!abfrage) {
    abfrage = (async () => {
      try {
        const { data } = await supabase!.functions.invoke("vapid-info");
        const k = (data as { public_key?: string } | null)?.public_key;
        serverSchluessel = typeof k === "string" && k.length > 20 ? k : null;
      } catch {
        serverSchluessel = null;
      }
      if (serverSchluessel && VAPID_AUS_ENV && serverSchluessel !== VAPID_AUS_ENV) {
        console.log("[push] Server hat einen anderen Schlüssel als die App – der vom Server gilt");
      }
      return serverSchluessel || VAPID_AUS_ENV;
    })();
  }
  return abfrage;
}

export const pushSupported =
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;

/**
 * Sind Benachrichtigungen auf dieser Seite überhaupt eingerichtet?
 * Solange wir den Server noch nicht gefragt haben, gehen wir von ja aus –
 * wenn doch nichts hinterlegt ist, sagt enablePush() es deutlich.
 */
export const pushConfigured = () => hasSupabase && (Boolean(VAPID_AUS_ENV) || serverSchluessel !== null);

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Der letzte Fehler beim Verschicken einer Benachrichtigung.
 *
 * Hintergrund: functions.invoke() wirft in supabase-js v2 **nicht**, sondern
 * gibt { data, error } zurück. Der alte Code hat den Aufruf in try/catch
 * gesteckt und den error nie gelesen. Fehlende VAPID-Schlüssel, eine nicht
 * hochgeladene Function, ein abgelehnter Zugriff – alles blieb unsichtbar.
 * Genau deshalb konnte niemand sagen, warum keine Benachrichtigungen kommen.
 *
 * Der Text landet in der Diagnose-Zeile im Profil.
 */
let letzterSendefehler: string | null = null;
export const sendeFehler = () => letzterSendefehler;

/** Push direkt an bestimmte Nutzer senden (via Edge Function). */
export async function pushToUsers(user_ids: string[], title: string, body: string): Promise<void> {
  if (!hasSupabase || !user_ids.length) return;
  try {
    const { error } = await supabase!.functions.invoke("send-push", { body: { user_ids, title, body } });
    if (error) {
      letzterSendefehler = error.message || String(error);
      console.warn("[push] send-push meldet:", letzterSendefehler);
      return;
    }
    letzterSendefehler = null;
  } catch (e) {
    letzterSendefehler = (e as Error).message;
    console.warn("[push] send-push nicht erreichbar:", letzterSendefehler);
  }
}

/**
 * Was ist hier eigentlich los?
 *
 * Fragt der Reihe nach ab, woran es hängen kann, und gibt einen Satz zurück,
 * den man jemandem vorlesen kann. Steht im Profil unter den Benachrichtigungen.
 */
export async function pushDiagnose(): Promise<string> {
  if (!pushSupported) return "Dieses Gerät kann keine Benachrichtigungen anzeigen.";
  if (!hasSupabase) return "Ohne Server-Verbindung gibt es keine Benachrichtigungen.";

  const key = await schluessel();
  if (!key) {
    return (
      "Auf dem Server ist kein Schlüssel hinterlegt. In Supabase müssen unter " +
      "Edge Functions → Secrets VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY gesetzt " +
      "und die Functions send-push und vapid-info hochgeladen sein."
    );
  }

  const erlaubnis = pushPermission();
  if (erlaubnis === "denied") {
    return "Du hast Benachrichtigungen für diese Seite abgelehnt. Das lässt sich nur in den Browser-Einstellungen wieder erlauben.";
  }
  if (erlaubnis === "default") return "Benachrichtigungen sind noch nicht eingeschaltet.";

  try {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return "Erlaubnis liegt vor, aber es ist kein Abo eingetragen. Schalte die Benachrichtigungen einmal aus und wieder an.";
  } catch {
    return "Der Hintergrunddienst der App antwortet nicht. Ein Neuladen hilft meistens.";
  }

  if (letzterSendefehler) return `Zuletzt meldete der Server beim Versenden: ${letzterSendefehler}`;
  return "Alles eingerichtet.";
}

/** Benachrichtigungen aktivieren: Erlaubnis holen, Abo anlegen, in Supabase speichern. */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported) return { ok: false, error: "Dein Gerät kann keine Benachrichtigungen" };
  const VAPID = await schluessel();
  if (!VAPID) return { ok: false, error: "Für diese Seite ist noch kein Schlüssel hinterlegt" };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, error: "keine Erlaubnis" };
    const reg = await navigator.serviceWorker.ready;
    const want = urlBase64ToUint8Array(VAPID);

    let sub = await reg.pushManager.getSubscription();
    // Altes Abo mit anderem VAPID-Schlüssel? -> kündigen und frisch anlegen.
    if (sub) {
      const curKey = sub.options?.applicationServerKey
        ? new Uint8Array(sub.options.applicationServerKey as ArrayBuffer)
        : null;
      const same = !!curKey && curKey.length === want.length && curKey.every((v, i) => v === want[i]);
      if (!same) {
        console.log("[push] altes Abo mit anderem Schlüssel – wird erneuert");
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: want as BufferSource,
      });
    }

    const { data } = await supabase!.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return { ok: false, error: "nicht eingeloggt" };
    const { error } = await supabase!
      .from("push_subscriptions")
      .upsert({ user_id: uid, endpoint: sub.endpoint, subscription: sub.toJSON() }, { onConflict: "endpoint" });
    if (error) return { ok: false, error: error.message };
    console.log("[push] Abo registriert für", uid);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Abo nach dem Anmelden still (wieder) eintragen.
 *
 * Wichtig, weil send-push tote Abos serverseitig loescht (bei 403/404/410).
 * Danach muss sich jedes Geraet neu eintragen, sonst kommt dort nie wieder
 * etwas an. Bisher stand dieser Code nur in Main - **die Elternansicht hat ihn
 * nie ausgefuehrt.** Wurde das Abo eines Elternteils einmal aufgeraeumt, bekam
 * es nie wieder eine Benachrichtigung.
 *
 * Bewusst keine React-Datei: so koennen Main und ElternApp denselben Hook
 * benutzen, ohne einander zu importieren.
 */
export function pushAboAuffrischen(): void {
  const optin = localStorage.getItem("sv:push-optin") === "1";
  if (!pushConfigured() || (pushPermission() !== "granted" && !optin)) {
    console.log("[push] kein Auto-Abo:", { konfiguriert: pushConfigured(), erlaubnis: pushPermission() });
    return;
  }
  localStorage.removeItem("sv:push-optin");
  void enablePush().then((r) => {
    if (!r.ok) console.warn("[push] Auto-Registrierung fehlgeschlagen:", r.error);
  });
}
