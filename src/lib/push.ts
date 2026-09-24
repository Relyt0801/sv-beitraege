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
      // Zwei Versuche: die Funktion braucht nach einer Pause manchmal einen
      // Moment zum Aufwachen.
      for (let versuch = 0; versuch < 2 && !serverSchluessel; versuch++) {
        try {
          const { data } = await supabase!.functions.invoke("vapid-info");
          const k = (data as { public_key?: string } | null)?.public_key;
          serverSchluessel = typeof k === "string" && k.length > 20 ? k : null;
        } catch {
          serverSchluessel = null;
        }
      }
      if (serverSchluessel && VAPID_AUS_ENV && serverSchluessel !== VAPID_AUS_ENV) {
        console.log("[push] Server hat einen anderen Schlüssel als die App – der vom Server gilt");
      }
      const k = serverSchluessel || VAPID_AUS_ENV;
      if (!serverSchluessel) {
        // beim nächsten Mal wieder fragen, statt den Fehlschlag zu merken
        serverSchluessel = undefined;
        abfrage = null;
      }
      return k;
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
 * functions.invoke() wirft in supabase-js v2 **nicht**, sondern gibt
 * { data, error } zurück. Der alte Code hat den Aufruf in try/catch gesteckt
 * und den error nie gelesen: fehlender VAPID-Schlüssel, nicht hochgeladene
 * Function, abgelehnter Zugriff – alles blieb unsichtbar. Genau deshalb konnte
 * niemand sagen, warum keine Benachrichtigungen kommen.
 *
 * Der Text landet in der Prüfung im Profil ("Kommt nichts an?").
 */
let letzterSendefehler: string | null = null;

/**
 * send-push aufrufen. Eine Benachrichtigung ist nie so wichtig, dass die
 * eigentliche Aktion daran scheitern darf – aber sichtbar muss der Fehler sein.
 */
export async function sendePush(body: Record<string, unknown>): Promise<void> {
  if (!hasSupabase) return;
  try {
    const { error } = await supabase!.functions.invoke("send-push", { body });
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

/** Push an das Stufenteam (z. B. neue Terminanfrage). */
export async function pushAnTeam(title: string, body: string, url = "./#events"): Promise<void> {
  await sendePush({ an_team: true, title, body, url });
}

/**
 * Meldung an Schüler UND ihre Eltern, z. B. "Q1.1 bezahlt" oder "Mithilfe
 * eingetragen". Je Person eigener Text; der Server sucht Konten und Eltern.
 */
export async function pushAnPersonen(
  liste: { student_id: string; title: string; body: string }[],
  url = "./#kasse",
): Promise<void> {
  if (!liste.length) return;
  await sendePush({ an_personen: liste, url });
}

/** Push zu einem Termin an alle, die ihn sehen dürfen. */
export async function pushZuTermin(termin_id: string, title?: string, body?: string): Promise<void> {
  await sendePush({ termin_id, title, body, url: "./#events" });
}

/** Push direkt an bestimmte Nutzer senden (via Edge Function). */
export async function pushToUsers(user_ids: string[], title: string, body: string, url = "./"): Promise<void> {
  if (!user_ids.length) return;
  await sendePush({ user_ids, title, body, url });
}

/**
 * "Warum kommt bei mir nichts an?"
 *
 * Fragt der Reihe nach ab, woran es hängen kann, und gibt einen Satz zurück,
 * den man jemandem vorlesen kann. Steht im Profil unter den Benachrichtigungen.
 */
export async function pushDiagnose(): Promise<string> {
  if (!pushSupported) return "Dieses Gerät kann keine Benachrichtigungen anzeigen. Auf dem iPhone geht es nur, wenn die App zum Home-Bildschirm hinzugefügt ist.";
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
  if (erlaubnis === "denied")
    return "Benachrichtigungen sind für diese Seite abgelehnt. Das lässt sich nur in den Einstellungen des Geräts bzw. Browsers wieder erlauben.";
  if (erlaubnis === "default") return "Benachrichtigungen sind noch nicht eingeschaltet.";
  try {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return "Erlaubnis liegt vor, aber es ist kein Abo eingetragen. Einmal „Benachrichtigungen anschalten“ antippen oder die App neu öffnen.";
  } catch {
    return "Der Hintergrunddienst der App antwortet nicht. Ein Neuladen hilft meistens.";
  }
  if (letzterSendefehler) return `Zuletzt meldete der Server beim Versenden: ${letzterSendefehler}`;
  return "Alles eingerichtet.";
}

/**
 * Die Erlaubnis erfragen – SOFORT, ohne vorher irgendetwas abzuwarten.
 *
 * Safari (iPhone), Firefox und zunehmend auch Chrome zeigen die Frage nur,
 * wenn sie direkt aus einem Tippen heraus kommt. Wartet man vorher auf eine
 * Serverantwort, ist das Tippen "verbraucht" und der Browser lehnt still ab.
 * Genau daran scheiterten die Knöpfe bisher: erst Schlüssel holen, dann fragen.
 */
function erlaubnisSofort(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return Promise.resolve("denied");
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  try {
    return Notification.requestPermission();
  } catch {
    // ganz alte Safari-Versionen kennen nur die Rückruf-Form
    return new Promise((r) => Notification.requestPermission(r));
  }
}

/**
 * Jeder Anmeldeversuch landet mit Browser-Kennung in der Datenbank.
 * Grund: Firefox verhält sich anders, und ohne diese Zeilen sieht man auf
 * dem Server nur "es kam kein Abo an" – nicht, woran es scheiterte.
 */
function diagnose(schritt: string, fehler = ""): void {
  if (!hasSupabase) return;
  void (async () => {
    try {
      const { data } = await supabase!.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      await supabase!.from("push_diagnose").insert({
        user_id: uid,
        ua: navigator.userAgent.slice(0, 300),
        schritt,
        fehler: fehler.slice(0, 500),
        erlaubnis: pushPermission(),
      });
    } catch {
      /* Diagnose darf nie selbst stören */
    }
  })();
}

/** Benachrichtigungen aktivieren: Erlaubnis holen, Abo anlegen, in Supabase speichern.
 *  MUSS direkt aus einem Klick/Tippen aufgerufen werden, wenn noch nicht erlaubt. */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported) return { ok: false, error: istIphoneImBrowser() ? IPHONE_HINWEIS : "Dein Gerät kann keine Benachrichtigungen" };
  // Zuerst fragen, dann erst Netzwerk – siehe erlaubnisSofort().
  const erlaubnis = erlaubnisSofort();
  const [perm, VAPID] = await Promise.all([erlaubnis, schluessel()]);
  if (perm !== "granted") {
    diagnose("einschalten", "Erlaubnis: " + perm);
    return { ok: false, error: perm === "denied" ? "blockiert" : "keine Erlaubnis" };
  }
  const r = await aboAnlegen(VAPID);
  diagnose("einschalten", r.ok ? "" : r.error || "?");
  return r;
}

/**
 * Stilles Auffrischen beim Öffnen der App. Fragt NIE nach Erlaubnis, sondern
 * legt nur dann ein Abo an, wenn der Browser es schon erlaubt hat. So stehen
 * Geräte, deren Abo der Server wegräumen musste, beim nächsten Öffnen wieder
 * in der Liste.
 */
export async function pushAuffrischen(): Promise<void> {
  if (!pushSupported || pushPermission() !== "granted") return;
  const VAPID = await schluessel();
  const r = await aboAnlegen(VAPID);
  if (!r.ok) {
    console.warn("[push] Auffrischen fehlgeschlagen:", r.error);
    diagnose("auffrischen", r.error || "?");
  }
}

const ABO_KEY = "sv:push-endpoint";

async function aboAnlegen(VAPID: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const { data } = await supabase!.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return { ok: false, error: "nicht eingeloggt" };

    // Ein vorhandenes Abo nur dann ersetzen, wenn wir SICHER wissen, dass es
    // zu einem anderen Schlüssel gehört – also nur mit der Antwort des Servers.
    // Früher wurde bei einem kurzen Aussetzer des Servers auf einen anderen
    // Schlüssel ausgewichen, das Abo gekündigt und neu angelegt. Das erzeugte
    // bei einer Person 22 tote Abos, und mit dem falschen Schlüssel kam nichts an.
    if (sub && serverSchluessel) {
      const want = urlBase64ToUint8Array(serverSchluessel);
      const curKey = sub.options?.applicationServerKey
        ? new Uint8Array(sub.options.applicationServerKey as ArrayBuffer)
        : null;
      const same = !!curKey && curKey.length === want.length && curKey.every((v, i) => v === want[i]);
      if (!same) {
        console.log("[push] Abo gehört zu einem alten Schlüssel – wird erneuert");
        await supabase!.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }
    // Hat der Server "unser" Abo als tot weggeräumt? Dann liefert der Browser
    // es trotzdem noch – Firefox tut das nachweislich. Wir merken uns deshalb
    // das zuletzt gemeldete Abo: steht es nicht mehr in der Datenbank, wird es
    // hier gekündigt und frisch angelegt, statt die tote Adresse erneut
    // einzutragen.
    if (sub) {
      let gemerkt = "";
      try {
        gemerkt = localStorage.getItem(ABO_KEY) || "";
      } catch {
        /* egal */
      }
      if (gemerkt === sub.endpoint) {
        const { data: da } = await supabase!
          .from("push_subscriptions")
          .select("endpoint")
          .eq("endpoint", sub.endpoint)
          .maybeSingle();
        if (!da) {
          console.log("[push] Server hatte das Abo als tot entfernt – wird erneuert");
          await sub.unsubscribe().catch(() => {});
          sub = null;
        }
      }
    }
    if (!sub) {
      // Neu anlegen NUR mit dem Schlüssel des Servers. Der Notnagel aus der
      // Build-Umgebung passt nachweislich nicht mehr zum Server – ein Abo damit
      // wäre von Anfang an tot.
      if (!serverSchluessel) {
        return { ok: false, error: VAPID ? "Server gerade nicht erreichbar – bitte gleich noch einmal" : "Für diese Seite ist noch kein Schlüssel hinterlegt" };
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(serverSchluessel) as BufferSource,
      });
    }

    // Über die Datenbank-Funktion statt direkt: gehört dieses Gerät noch zu
    // einem anderen Konto (jemand hat sich umgemeldet), wird es übernommen.
    const { error } = await supabase!.rpc("push_abo_uebernehmen", {
      p_endpoint: sub.endpoint,
      p_subscription: sub.toJSON(),
    });
    if (error) return { ok: false, error: error.message };
    try {
      localStorage.setItem(ABO_KEY, sub.endpoint);
    } catch {
      /* egal */
    }
    console.log("[push] Abo registriert für", uid);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- iPhone

/** iPhone/iPad im normalen Safari-Tab: dort gibt es gar keine Benachrichtigungen.
 *  Apple erlaubt sie nur, wenn die Seite zum Home-Bildschirm hinzugefügt wurde. */
export function istIphoneImBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const alsApp = window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !alsApp;
}

export const IPHONE_HINWEIS =
  "Auf dem iPhone gehen Benachrichtigungen nur, wenn die Stufenkasse auf dem Home-Bildschirm liegt: in Safari unten auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach die App von dort öffnen.";

// ---------------------------------------------------------------- Zähler am App-Symbol

/** Roter Zähler am App-Symbol (Android, Windows, Mac, iPhone als Home-App). */
export function appZaehler(n: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* nicht unterstützt – dann eben ohne */
  }
}

// ---------------------------------------------------------------- Abmelden

/**
 * Abmelden MIT Abmeldung des Geräts von den Benachrichtigungen. Sonst bekäme
 * das alte Konto auf einem geteilten oder weitergegebenen Handy weiter alles.
 */
export async function abmelden(): Promise<void> {
  if (!hasSupabase) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase!.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    localStorage.removeItem(ABO_KEY);
  } catch {
    /* Abmelden soll nie daran scheitern */
  }
  await supabase!.auth.signOut();
}
