import { useEffect, useState } from "react";
import {
  IPHONE_HINWEIS, enablePush, istIphoneImBrowser, pushAuffrischen, pushConfigured, pushPermission, pushSupported,
} from "../lib/push";

const SPAETER = "sv:push-spaeter";
const SPAETER_TAGE = 7;

function vertagt(): boolean {
  try {
    return Number(localStorage.getItem(SPAETER) || 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Beim Öffnen: ein schon erlaubtes Abo still auffrischen – und einmal das
 * Häkchen vom Anmelden einlösen. Fragt selbst nie nach Erlaubnis.
 */
export function usePushAuffrischen() {
  useEffect(() => {
    try {
      localStorage.removeItem("sv:push-optin");
    } catch {
      /* egal */
    }
    void pushAuffrischen();
    // Kommt die Erlaubnis erst später (Frage beim Anmelden noch offen), dann
    // genau in dem Moment das Abo anlegen – nicht erst beim nächsten Öffnen.
    let status: PermissionStatus | null = null;
    const neu = () => void pushAuffrischen();
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((p) => {
        status = p;
        p.addEventListener("change", neu);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", neu);
  }, []);
}

/**
 * Die Karte "Benachrichtigungen einschalten".
 *
 * Seit der Zustimmungsbildschirm weg ist (17.09.), wurde niemand mehr gefragt –
 * deshalb waren am 18.09. von 260 Konten genau eines angemeldet. Diese Karte
 * steht oben, bis man eingeschaltet oder "später" gesagt hat. Der Knopf fragt
 * den Browser direkt aus dem Tippen heraus, sonst lehnen iPhone und Firefox ab.
 */
export function PushHinweis({ fuerEltern }: { fuerEltern?: boolean }) {
  const [perm, setPerm] = useState(pushPermission());
  const [weg, setWeg] = useState(vertagt());
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const iphone = istIphoneImBrowser();

  if (weg || !pushConfigured()) return null;
  if (!iphone && (!pushSupported || perm === "granted" || perm === "unsupported")) return null;

  const sie = fuerEltern;
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-3 border-brand/40 bg-brand/5 p-3.5">
      <span className="text-[20px]">🔔</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold">
          {perm === "denied" ? "Benachrichtigungen sind blockiert" : "Benachrichtigungen einschalten"}
        </div>
        <div className="text-[12px] leading-relaxed text-tinte-matt dark:text-slate-400">
          {iphone
            ? IPHONE_HINWEIS
            : perm === "denied"
              ? `${sie ? "Ihr" : "Dein"} Browser hat sie gesperrt. In den Seiteneinstellungen (Schloss-Symbol neben der Adresse) „Benachrichtigungen: Erlauben“ wählen.`
              : sie
                ? "Dann erfahren Sie sofort, wenn das Stufenteam antwortet."
                : "Dann bekommst du Bescheid bei neuen Nachrichten, Events und Schichten."}
        </div>
        {fehler && <div className="mt-1 text-[12px] font-semibold text-amber-600">{fehler}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => {
            try {
              localStorage.setItem(SPAETER, String(Date.now() + SPAETER_TAGE * 864e5));
            } catch {
              /* egal */
            }
            setWeg(true);
          }}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-tinte-leise"
        >
          Später
        </button>
        {!iphone && perm !== "denied" && (
          <button
            disabled={busy}
            // KEIN await davor: enablePush fragt den Browser als Allererstes.
            onClick={() => {
              setBusy(true);
              setFehler("");
              void enablePush().then((r) => {
                setBusy(false);
                setPerm(pushPermission());
                if (!r.ok && r.error && r.error !== "keine Erlaubnis" && r.error !== "blockiert")
                  setFehler("Hat nicht geklappt: " + r.error);
              });
            }}
            className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "…" : "Einschalten"}
          </button>
        )}
      </div>
    </div>
  );
}
