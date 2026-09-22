import { useState } from "react";
import { appleAberNichtSafari, istApple, useInstall } from "../lib/install";

/**
 * Zwei Dinge, die auf denselben Daten sitzen:
 *
 *  - <InstallKarte />   die Karte oben auf der Startseite
 *  - <InstallOverlay /> der einmalige Bildschirm beim allerersten Öffnen
 *
 * Beide verschwinden, sobald die App installiert ist – und auf iPhone/iPad,
 * sobald jemand „Hab ich gemacht" tippt. Warum das dort nötig ist, steht
 * ausführlich in src/lib/install.ts.
 */

function Schritte() {
  const apple = istApple();
  const falscherBrowser = appleAberNichtSafari();

  if (falscherBrowser)
    return (
      <ol className="grid gap-2 text-[13.5px] leading-relaxed text-tinte-matt">
        <li>
          <b>1.</b> Auf iPhone und iPad kann nur <b>Safari</b> Apps auf den Home-Bildschirm legen – Chrome und
          Firefox dürfen das dort nicht.
        </li>
        <li>
          <b>2.</b> Öffne diese Seite noch einmal in Safari und tipp dort unten auf <b>Teilen</b>{" "}
          <span className="font-zahl">⬆︎</span>.
        </li>
        <li>
          <b>3.</b> Dann auf <b>Zum Home-Bildschirm</b> und oben rechts auf <b>Hinzufügen</b>.
        </li>
      </ol>
    );

  if (apple)
    return (
      <ol className="grid gap-2 text-[13.5px] leading-relaxed text-tinte-matt">
        <li>
          <b>1.</b> Tipp auf <b>Teilen</b> <span className="font-zahl">⬆︎</span> – auf dem iPad oben rechts in der
          Adressleiste, auf dem iPhone unten in der Mitte.
        </li>
        <li>
          <b>2.</b> Scroll in der Liste nach unten bis <b>Zum Home-Bildschirm</b> und tipp darauf.
        </li>
        <li>
          <b>3.</b> Oben rechts auf <b>Hinzufügen</b>. Fertig – die Stufenkasse liegt jetzt neben deinen anderen
          Apps.
        </li>
      </ol>
    );

  return (
    <ol className="grid gap-2 text-[13.5px] leading-relaxed text-tinte-matt">
      <li>
        <b>1.</b> Tipp auf <b>App installieren</b>.
      </li>
      <li>
        <b>2.</b> Dein Browser fragt einmal nach – dort auf <b>Installieren</b>.
      </li>
    </ol>
  );
}

/** Die Karte auf der Startseite. */
export function InstallKarte() {
  const inst = useInstall();
  const [offen, setOffen] = useState(false);

  if (!inst.zeigen) return null;

  return (
    <div className="mt-2.5 rounded-2xl border border-brand/30 bg-brand/5 p-3.5">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">📲</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">Stufenkasse als App</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinte-matt">
            Dann startet sie mit einem Tipp vom Home-Bildschirm, ohne Adressleiste – und Benachrichtigungen
            kommen zuverlässiger an.
          </p>
        </div>
        <button
          onClick={inst.erledigen}
          aria-label="Hinweis ausblenden"
          className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-tinte-leise"
        >
          ✕
        </button>
      </div>

      {offen && (
        <div className="mt-3 rounded-xl bg-white p-3 dark:bg-slate-900">
          <Schritte />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {inst.weg === "dialog" ? (
          <button
            onClick={() => void inst.installieren()}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            App installieren
          </button>
        ) : (
          <button
            onClick={() => setOffen((v) => !v)}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            {offen ? "Anleitung zuklappen" : "So geht's"}
          </button>
        )}
        {inst.weg !== "dialog" && offen && (
          <button
            onClick={inst.erledigen}
            className="rounded-xl border border-papier-linie px-4 py-2.5 text-sm font-bold text-tinte-matt dark:border-slate-600"
          >
            Hab ich gemacht
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Der einmalige Bildschirm beim allerersten Öffnen. Danach nie wieder – wer
 * ihn wegklickt, findet den Weg weiter über die Karte auf der Startseite.
 */
export function InstallOverlay() {
  const inst = useInstall();
  if (!inst.overlayFaellig) return null;

  const zu = () => inst.overlayGesehen();

  return (
    <div className="fixed inset-0 z-[60] flex animate-fadeIn items-end justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-md animate-sheetIn overflow-y-auto rounded-t-3xl bg-white p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
        <div className="mb-3 text-center text-4xl">📲</div>
        <div className="mb-1 text-center text-xl font-bold">Auf den Home-Bildschirm legen</div>
        <p className="mb-5 text-center text-[13.5px] leading-relaxed text-tinte-matt">
          Die Stufenkasse läuft als richtige App: eigenes Symbol, Vollbild, und Benachrichtigungen kommen
          zuverlässiger an. Dauert zehn Sekunden.
        </p>

        <div className="mb-5 rounded-2xl bg-papier-matt p-4 dark:bg-slate-800/70">
          <Schritte />
        </div>

        {inst.weg === "dialog" ? (
          <button
            className="btn-primary"
            onClick={async () => {
              await inst.installieren();
              zu();
            }}
          >
            Jetzt installieren
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={() => {
              inst.erledigen();
              zu();
            }}
          >
            Hab ich gemacht
          </button>
        )}

        <button onClick={zu} className="mt-3 w-full text-center text-sm font-semibold text-tinte-leise">
          Später
        </button>
      </div>
    </div>
  );
}
