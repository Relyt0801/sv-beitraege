import { hasSupabase, supabase } from "./supabase";

const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || "";

export const pushSupported =
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;

export const pushConfigured = () => Boolean(VAPID) && hasSupabase;

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

/** Benachrichtigungen aktivieren: Erlaubnis holen, Abo anlegen, in Supabase speichern. */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported || !VAPID) return { ok: false, error: "nicht unterstützt/konfiguriert" };
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
