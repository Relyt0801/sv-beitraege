import { useEffect, useState } from "react";
import { appleAberNichtSafari, istApple, istMobil, useInstall } from "../lib/install";
import { useRoleOptional } from "../auth/RoleProvider";
import { Icon } from "./Icon";
import { useTourOffen } from "./Tour";
import { useEscapeSchliesst } from "./Sheet";
import { scrollSperren } from "../lib/scrollsperre";

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

/**
 * Die Anleitung in drei kurzen Schritten. Eltern werden gesiezt (U3, p4) –
 * die Rolle ist hier bekannt, der Text unterscheidet sich nur in der Anrede.
 */
function Schritte({ sie }: { sie: boolean }) {
  const apple = istApple();
  const falscherBrowser = appleAberNichtSafari();
  const klasse = "grid gap-2 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300";

  if (falscherBrowser)
    return (
      <ol className={klasse}>
        <li>
          <b>1.</b> Auf iPhone und iPad kann nur <b>Safari</b> Apps auf den Home-Bildschirm legen – Chrome und
          Firefox dürfen das dort nicht.
        </li>
        <li>
          <b>2.</b> {sie ? "Öffnen Sie diese Seite noch einmal in Safari und tippen Sie dort unten auf" : "Öffne diese Seite noch einmal in Safari und tipp dort unten auf"} <b>Teilen</b>{" "}
          <span className="font-zahl">⬆︎</span>.
        </li>
        <li>
          <b>3.</b> Dann auf <b>Zum Home-Bildschirm</b> und oben rechts auf <b>Hinzufügen</b>.
        </li>
      </ol>
    );

  if (apple)
    return (
      <ol className={klasse}>
        <li>
          <b>1.</b> {sie ? "Tippen Sie auf" : "Tipp auf"} <b>Teilen</b> <span className="font-zahl">⬆︎</span> – auf dem iPad oben rechts in der
          Adressleiste, auf dem iPhone unten in der Mitte.
        </li>
        <li>
          <b>2.</b> {sie ? "Scrollen Sie in der Liste nach unten bis" : "Scroll in der Liste nach unten bis"} <b>Zum Home-Bildschirm</b>{" "}
          {sie ? "und tippen Sie darauf." : "und tipp darauf."}
        </li>
        <li>
          <b>3.</b> Oben rechts auf <b>Hinzufügen</b>. Fertig – die Stufenkasse liegt jetzt neben {sie ? "Ihren" : "deinen"} anderen
          Apps.
        </li>
      </ol>
    );

  return (
    <ol className={klasse}>
      <li>
        <b>1.</b> {sie ? "Tippen Sie auf" : "Tipp auf"} <b>App installieren</b>.
      </li>
      <li>
        <b>2.</b> {sie ? "Ihr" : "Dein"} Browser fragt einmal nach – dort auf <b>Installieren</b>.
      </li>
    </ol>
  );
}

/**
 * Die Karte auf der Startseite. `className` = Abstand nach außen (Standard
 * mt-2.5). In einem Raster mit gap (Eltern-Übersicht) leer lassen – dann
 * sorgt das Raster für denselben Abstand wie zwischen den anderen Karten.
 */
export function InstallKarte({ className = "mt-2.5" }: { className?: string } = {}) {
  const inst = useInstall();
  // Auch auf der Anmeldeseite (ohne RoleProvider) – dann ohne Rolle
  const role = useRoleOptional()?.role ?? null;
  const sie = role === "eltern";
  const [offen, setOffen] = useState(false);

  if (!inst.zeigen) return null;

  // Deckende Karte mit blauem Rand (vorher bg-brand/7 %: auf dem eigenen
  // Hintergrundbild schien das Foto durch). Ab Tablet-Breite eine Zeile:
  // Symbol, Text, Knöpfe – statt eines halben Bildschirms am Laptop.
  return (
    <div className={`card ${className} !border-brand/30 p-3.5 sm:p-4`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2.5 sm:items-center">
        <span aria-hidden className="symbol bg-brand">
          <Icon name="haus" size={17} strich={2.2} />
        </span>
        <div className="min-w-0 flex-1 basis-[12rem]">
          <div className="text-[16px] font-semibold">Stufenkasse als App</div>
          <p className="mt-0.5 text-[14px] leading-snug text-tinte-matt dark:text-slate-300">
            Dann startet sie mit einem Tipp vom Home-Bildschirm, ohne Adressleiste – und Benachrichtigungen
            kommen zuverlässiger an.
          </p>
        </div>
        {/* ✕ wie in iOS oben rechts; am Handy stehen die Knöpfe darunter,
            ab Tablet-Breite in derselben Zeile vor dem ✕ */}
        <button
          onClick={inst.erledigen}
          aria-label="Hinweis ausblenden"
          className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:scale-90 sm:order-last sm:mt-0"
        >
          <Icon name="x" size={16} strich={2.4} />
        </button>
        <div className="flex basis-full flex-wrap items-center gap-2 pl-[42px] sm:basis-auto sm:pl-0">
          {inst.weg === "dialog" ? (
            <button onClick={() => void inst.installieren()} className="btn-klein">
              App installieren
            </button>
          ) : (
            <button onClick={() => setOffen((v) => !v)} className="btn-klein">
              {offen ? "Anleitung zuklappen" : "So geht's"}
            </button>
          )}
          {inst.weg !== "dialog" && offen && (
            <button onClick={inst.erledigen} className="btn-klein-grau">
              Hab ich gemacht
            </button>
          )}
        </div>
      </div>

      {offen && (
        <div className="feld-grau mt-3 p-3.5">
          <Schritte sie={sie} />
        </div>
      )}
    </div>
  );
}

/**
 * Der einmalige Bildschirm beim allerersten Öffnen. Danach nie wieder – wer
 * ihn wegklickt, findet den Weg weiter über die Karte auf der Startseite.
 */
export function InstallOverlay() {
  const inst = useInstall();
  // Auch auf der Anmeldeseite (ohne RoleProvider) – dann ohne Rolle
  const role = useRoleOptional()?.role ?? null;
  const sie = role === "eltern";
  // Nie gleichzeitig mit einer Einführung (Update 1.4, U3): Die Einführung
  // startet beim ersten Öffnen ~0,7 s nach dem Laden, der Home-Bildschirm-
  // Hinweis wartet deshalb etwas länger und tritt zurück, solange eine läuft.
  // Wirkt auch in der Elternansicht, deren Einführung in ElternApp.tsx läuft.
  const tourOffen = useTourOffen();
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBereit(true), 1600);
    return () => clearTimeout(t);
  }, []);
  // Das große Fenster nur auf Handy/Tablet – am Rechner reicht die Karte
  const sichtbar = inst.overlayFaellig && bereit && !tourOffen && istMobil();
  const zu = () => inst.overlayGesehen();
  // Escape = „Später“; die Seite dahinter bleibt stehen
  useEscapeSchliesst(sichtbar, zu);
  useEffect(() => (sichtbar ? scrollSperren() : undefined), [sichtbar]);
  if (!sichtbar) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Auf den Home-Bildschirm legen" className="fixed inset-0 z-[60] flex animate-fadeIn items-end justify-center bg-black/40 p-0 backdrop-blur-sm dark:bg-black/60 sm:items-center sm:p-6">
      <div className="max-h-[92dvh] w-full max-w-md animate-sheetIn overflow-y-auto rounded-t-[1.75rem] bg-papier p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-2xl dark:bg-slate-900 sm:rounded-[1.75rem]">
        <span aria-hidden className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
          <Icon name="haus" size={28} strich={2} />
        </span>
        <div className="mb-1 text-center text-[1.375rem] font-bold tracking-[-0.02em]">Auf den Home-Bildschirm legen</div>
        <p className="mb-5 text-center text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">
          Die Stufenkasse läuft als richtige App: eigenes Symbol, Vollbild, und Benachrichtigungen kommen
          zuverlässiger an. Dauert zehn Sekunden.
        </p>

        <div className="mb-5 rounded-[1.25rem] bg-[rgb(var(--zelle))] p-4">
          <Schritte sie={sie} />
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

        <button onClick={zu} className="mt-1 flex min-h-[48px] w-full items-center justify-center text-[15px] font-semibold text-tinte-leise">
          Später
        </button>
      </div>
    </div>
  );
}
