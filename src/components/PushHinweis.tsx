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
      {/* Glocke als Linien-Symbol statt Emoji (Update 1.4, U3) */}
      <span aria-hidden className="symbol bg-[#FF3B30]">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 basis-[12rem]">
        <div className="text-[15px] font-semibold">
          {perm === "denied" ? "Benachrichtigungen sind blockiert" : "Benachrichtigungen einschalten"}
        </div>
        <div className="text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          {iphone
            ? IPHONE_HINWEIS
            : perm === "denied"
              ? `${sie ? "Ihr" : "Dein"} Browser hat sie gesperrt. In den Seiteneinstellungen (Schloss-Symbol neben der Adresse) „Benachrichtigungen: Erlauben“ wählen.`
              : sie
                ? "Dann erfahren Sie sofort, wenn das Stufenteam antwortet."
                : "Dann bekommst du Bescheid bei neuen Nachrichten, Events und Schichten."}
        </div>
        {fehler && <div className="mt-1 text-[13px] font-semibold text-amber-700 dark:text-amber-400">{fehler}</div>}
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
          className="btn-klein-grau"
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
            className="btn-klein"
          >
            {busy ? "…" : "Einschalten"}
          </button>
        )}
      </div>
    </div>
  );
}
