import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { netzMelden, serverPruefungSetzen } from "./netz";

// BOM, Zero-Width- und Steuerzeichen entfernen. Windows/PowerShell schreibt .env
// gern mit UTF-8-BOM; ein solches Zeichen im anon-Key sprengt sonst den
// fetch-Header ("String contains non ISO-8859-1 code point").
const clean = (v?: string): string | undefined => {
  if (!v) return undefined;
  const out = Array.from(v)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return false; // C0/C1-Steuerzeichen
      if (c === 0xfeff || (c >= 0x200b && c <= 0x200d)) return false; // BOM / Zero-Width
      return true;
    })
    .join("")
    .trim();
  return out || undefined;
};

const url = clean(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * `npm run demo` startet die App ohne Datenbank, auch wenn eine .env mit den
 * echten Zugangsdaten daliegt. So laesst sich jede Rolle gefahrlos
 * durchklicken (siehe src/lib/demo.ts). Im fertigen Build ist MODE immer
 * "production" – dort greift das nie.
 */
const demoBuild = import.meta.env.MODE === "demo";

export const hasSupabase = !demoBuild && Boolean(url && key);
/**
 * @deprecated Der Zugangscode war fuer die Selbstregistrierung gedacht. Die
 * gibt es nicht mehr: der Code stand im ausgelieferten JavaScript und war
 * damit fuer jeden lesbar. Konten legt jetzt nur noch das Stufenteam an.
 */
export const ACCESS_CODE = clean(import.meta.env.VITE_ACCESS_CODE) || "";

/*
 * ---------------------------------------------------------------------------
 * Anfragen mit Zeitlimit (Update 1.4)
 * ---------------------------------------------------------------------------
 * fetch() wartet von sich aus beliebig lange. Im Schul-WLAN, das „verbunden“
 * anzeigt, aber nichts durchlässt, drehte sich der Knopf deshalb minutenlang
 * – oder für immer. Jetzt bricht jede Anfrage an Supabase nach einer festen
 * Zeit ab und liefert einen Fehler, den lib/netz.ts verständlich übersetzt
 * („Keine Verbindung zum Server …“).
 *
 * Die Zeit hängt davon ab, was übertragen wird:
 *   - normale Abfragen, Anmelden, RPCs:          15 s
 *   - Edge Functions (Push, Konten anlegen):     30 s
 *   - Dateien hoch-/herunterladen (Bilder):      120 s  (mehrere MB übers Handynetz)
 *
 * Bricht der Aufrufer selbst ab (eigenes signal), wird das durchgereicht.
 * AbortSignal.timeout/any gibt es erst in neueren Browsern (Safari 17.4) –
 * darunter übernimmt ein eigener AbortController mit setTimeout.
 *
 * Nebenbei meldet der Wrapper an lib/netz.ts, ob der Server erreicht wurde.
 * Daraus entsteht das Band „Keine Verbindung zum Server“, auch wenn das Gerät
 * meint, online zu sein.
 */
function zeitlimitFuer(adresse: string): number {
  if (adresse.includes("/storage/v1/object")) return 120_000;
  if (adresse.includes("/functions/v1/")) return 30_000;
  return 15_000;
}

function signalMitZeitlimit(ms: number, eigenes?: AbortSignal | null): { signal: AbortSignal; aufraeumen: () => void } {
  const A = AbortSignal as typeof AbortSignal & {
    timeout?: (ms: number) => AbortSignal;
    any?: (signale: AbortSignal[]) => AbortSignal;
  };
  // Neuere Browser: eingebaut
  if (typeof A.timeout === "function" && (!eigenes || typeof A.any === "function")) {
    const zeit = A.timeout(ms);
    return { signal: eigenes ? A.any!([eigenes, zeit]) : zeit, aufraeumen: () => {} };
  }
  // Ältere Browser: selbst gebaut
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try {
      ctrl.abort(new DOMException("Zeitüberschreitung", "TimeoutError"));
    } catch {
      ctrl.abort();
    }
  }, ms);
  const weiter = () => ctrl.abort((eigenes as AbortSignal & { reason?: unknown }).reason);
  if (eigenes) {
    if (eigenes.aborted) weiter();
    else eigenes.addEventListener("abort", weiter, { once: true });
  }
  return {
    signal: ctrl.signal,
    aufraeumen: () => {
      clearTimeout(timer);
      eigenes?.removeEventListener("abort", weiter);
    },
  };
}

const fetchMitZeitlimit: typeof fetch = async (input, init) => {
  const adresse = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const { signal, aufraeumen } = signalMitZeitlimit(zeitlimitFuer(adresse), init?.signal);
  try {
    const antwort = await fetch(input, { ...init, signal });
    // Erreicht – außer ein vorgeschalteter Server meldet eine Störung
    netzMelden(!(antwort.status === 502 || antwort.status === 503 || antwort.status === 504));
    return antwort;
  } catch (e) {
    // Selbst abgebrochen (z. B. Abfrage überholt): kein Netzproblem
    if (!init?.signal?.aborted) netzMelden(false);
    throw e;
  } finally {
    aufraeumen();
  }
};

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string, { global: { fetch: fetchMitZeitlimit } })
  : null;

// Für das Band „Keine Verbindung zum Server“: ist der Server wieder da?
// /auth/v1/health ist winzig und braucht nur den öffentlichen Schlüssel.
if (hasSupabase) {
  serverPruefungSetzen(async () => {
    try {
      const r = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key as string },
        cache: "no-store",
        signal: signalMitZeitlimit(8000).signal,
      });
      return r.status < 500;
    } catch {
      return false;
    }
  });
}

/** Username -> technische Pseudo-Adresse (kein echter Mailversand nötig). */
export function usernameToEmail(username: string): string {
  const c = username
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  return `${c}@sv-beitraege.local`;
}
