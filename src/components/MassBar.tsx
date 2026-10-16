import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HY, type Halbjahr, type Student } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { idx, isActive, sortStudents } from "../lib/logic";
import { melde } from "../lib/melder";
import { useHoeheAlsVariable } from "../lib/gescrollt";
import { MithilfeBlatt } from "./MithilfeBlatt";
import { Sheet, SheetKopf, useEscapeSchliesst } from "./Sheet";
import { Gruppe, ZeileHaken } from "./Liste";
import { Icon } from "./Icon";

/**
 * Leiste im Auswahl-Modus der Kasse.
 *
 * Oben stehen immer die Namen aller Ausgewählten – auch derer, die Suche oder
 * Filter gerade ausblenden. Vorher stand hier nur „5 ausgewählt“: Im
 * Auswahl-Modus wählt ein Tipp irgendwo auf eine Zeile die Person aus, und
 * eine Auswahl aus einer früheren Suche bleibt stehen. So bekam jemand
 * Mithilfe samt „Danke fürs Mithelfen“-Mitteilung, ohne irgendwo
 * eingetragen zu sein – und niemand sah es vor dem Tippen.
 *
 * Update 1.4 (U3): schwebt als Glas-Karte (am Laptop nicht mehr über die ganze
 * Fensterbreite), Knöpfe im Stil der App, Escape beendet den Auswahl-Modus
 * (solange nicht das Mithilfe-Blatt darüber offen ist).
 *
 * Halbjahr (Prüfung Okt. 2026): stand fest auf EF.1 – auch wenn längst Q1.1
 * lief. Wer dann „bezahlt“ tippte, buchte ins falsche Halbjahr. Jetzt steht
 * hier immer das laufende Halbjahr; ändern geht über eine Liste mit Häkchen
 * im Blatt (kein natives Auswahlfeld). Nach dem Tippen sagt eine Meldung,
 * was wofür eingetragen wurde.
 *
 * Kompakt (Rollen-Prüfung Okt. 2026): Mit allen acht Personen war die Leiste
 * am iPhone SE 258 px hoch (40 % des Bildschirms), die dritte Namenszeile
 * halb abgeschnitten und „Fertig“ stand allein in einer Zeile. Jetzt immer
 * drei feste Zeilen wie eine iOS-Werkzeugleiste:
 *   1. „8 ausgewählt“ · Halbjahr · Fertig
 *   2. Namen in EINER Zeile („Anna Berg, Ben Kurz +3 ›“), ein Tipp zeigt alle
 *      im Blatt; ohne Auswahl steht dort ein Hinweis – die Leiste springt nicht
 *   3. bezahlt · erlassen · offen · Mithilfe, gleich breit
 * Ab iPad-Breite stehen die Aktionen mit in Zeile 1, die Namen darunter.
 * Die Namens-Kapseln (im Blatt) sind 36 px hoch und über ::after 44 px
 * antippbar (vorher 22 px – man traf leicht den Nachbarn).
 *
 * Runde 8 (Handy): Die Namen standen als seitlich wischbare Reihe aus Kapseln
 * in der Leiste – unschön, und was rechts außerhalb stand, sah man nicht.
 * Jetzt eine abgeschnittene Zeile mit „+3“, die ganze Liste im Blatt.
 */
export function MassBar({
  selected,
  onAbwaehlen,
  onDone,
}: {
  selected: Set<string>;
  onAbwaehlen: (id: string) => void;
  onDone: () => void;
}) {
  const { massApply, addContributionMany, students, settings } = useStore();
  const { canEditHilfen } = useRole();
  const laeuft = settings.aktuelles_halbjahr;
  const [h, setH] = useState<Halbjahr>(laeuft);
  // Stellt jemand das laufende Halbjahr um, zieht die Auswahl mit
  useEffect(() => setH(laeuft), [laeuft]);
  const [hjOffen, setHjOffen] = useState(false);
  const [punkteOffen, setPunkteOffen] = useState(false);
  const [namenOffen, setNamenOffen] = useState(false);
  // Höhe der Leiste als --massleiste: damit die Liste darüber genau so viel
  // Luft unten bekommt, wie die Leiste braucht (App.tsx)
  const hoeheRef = useHoeheAlsVariable("--massleiste");

  // Nur Personen, die es noch gibt – alphabetisch wie in der Liste.
  const ausgewaehlt = useMemo(() => sortStudents(students.filter((s) => selected.has(s.id))), [students, selected]);

  // Escape beendet den Modus. Ist das Mithilfe-Blatt offen, liegt es im Escape-
  // Stapel (Sheet.tsx) weiter oben und schließt zuerst – dieses Escape bekommt nur das oberste.
  useEscapeSchliesst(true, onDone);

  const disabled = ausgewaehlt.length === 0;
  const n = ausgewaehlt.length;
  // Den Letzten im Blatt abgewählt: Blatt zu (sonst ginge es beim nächsten
  // Auswählen von selbst wieder auf)
  useEffect(() => {
    if (n === 0) setNamenOffen(false);
  }, [n]);

  // Eintragen und kurz sagen, was passiert ist. Wer im Halbjahr nicht dabei
  // ist (noch nicht oder nicht mehr), wird übersprungen – auch das steht da.
  const setzen = (status: "bezahlt" | "erlassen" | "offen") => {
    const i = idx(h);
    const dabei = ausgewaehlt.filter((s) => isActive(s, i)).length;
    massApply(selected, h, status);
    const rest = ausgewaehlt.length - dabei;
    melde(
      `${h}: ${dabei} ${dabei === 1 ? "Person" : "Personen"} auf „${status}“${rest > 0 ? ` · ${rest} in ${h} nicht dabei` : ""}`,
      dabei > 0 ? "erfolg" : "info",
    );
  };

  // Aktionen: am Handy gleich breit in einer eigenen Zeile, ab iPad mit in Zeile 1
  const aktion = "btn-klein-grau w-full !px-2 md:w-auto md:!px-3.5";
  const aktionen: { text: string; los: () => void }[] = [
    { text: "bezahlt", los: () => setzen("bezahlt") },
    { text: "erlassen", los: () => setzen("erlassen") },
    { text: "offen", los: () => setzen("offen") },
    ...(canEditHilfen ? [{ text: "Mithilfe", los: () => setPunkteOffen(true) }] : []),
  ];

  return (
    <div ref={hoeheRef} data-unterkante className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      {/* Deckend (--glas ohne Alpha): darunter scheint keine Liste durch */}
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[1.5rem] border border-white/60 bg-[rgb(var(--glas))] p-3 shadow-[0_8px_32px_-8px_rgba(0,0,0,.28),0_0_0_.5px_rgba(0,0,0,.08)] dark:border-white/10">
        <span className="order-1 mr-auto min-w-0 truncate text-[15px] font-semibold" aria-live="polite">
          {n} ausgewählt
        </span>
        {/* Halbjahr: Kapsel wie die übrigen Knöpfe, öffnet eine Häkchen-Liste */}
        <button
          type="button"
          className={`btn-klein-grau order-2 shrink-0 !px-3.5 ${h !== laeuft ? "!bg-brand/15" : ""}`}
          onClick={() => setHjOffen(true)}
          aria-haspopup="dialog"
          aria-label={`Halbjahr ${h}${h === laeuft ? " (läuft gerade)" : ""} – ändern`}
        >
          {h}
          <span aria-hidden className="rotate-90">
            <Icon name="chevron" size={13} strich={2.6} />
          </span>
        </button>
        <div
          className={`order-5 grid w-full gap-2 md:order-3 md:flex md:w-auto md:gap-1.5 ${aktionen.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}
        >
          {aktionen.map((a) => (
            <button key={a.text} type="button" disabled={disabled} className={aktion} onClick={a.los}>
              {a.text}
            </button>
          ))}
        </div>
        <button type="button" className="btn-klein order-3 shrink-0 !px-5 md:order-4" onClick={onDone}>
          Fertig
        </button>
        <div className="order-4 w-full min-w-0 md:order-5">
          <NamenZeile ausgewaehlt={ausgewaehlt} onOeffnen={() => setNamenOffen(true)} />
        </div>

        {/* Alle Ausgewählten: hier brechen die Namen um, antippen wählt ab */}
        <Sheet open={namenOffen} onClose={() => setNamenOffen(false)}>
          <SheetKopf titel={`${n} ausgewählt`} onClose={() => setNamenOffen(false)} />
          <div className="rounded-2xl zelle px-3 py-2">
            <Namen ausgewaehlt={ausgewaehlt} onAbwaehlen={onAbwaehlen} />
          </div>
        </Sheet>

        <Sheet open={hjOffen} onClose={() => setHjOffen(false)}>
          <SheetKopf titel="Halbjahr" unter="Dafür gelten „bezahlt“, „erlassen“ und „offen“." onClose={() => setHjOffen(false)} />
          <Gruppe className="">
            {HY.map((x) => (
              <ZeileHaken
                key={x}
                label={x}
                unter={x === laeuft ? "läuft gerade" : undefined}
                gewaehlt={x === h}
                onClick={() => {
                  setH(x);
                  setHjOffen(false);
                }}
              />
            ))}
          </Gruppe>
        </Sheet>

        {/* Mithilfe für mehrere: dasselbe Blatt wie für eine Person. Unten
            stehen die Ausgewählten (antippen = abwählen). */}
        <MithilfeBlatt
          open={punkteOffen}
          onClose={() => setPunkteOffen(false)}
          fuer={`${n} Person${n === 1 ? "" : "en"}`}
          knopf={`Für ${n} eintragen`}
          zusatz={
            <div className="mt-4">
              <div className="mb-1.5 px-4 text-[13px] font-semibold uppercase tracking-[0.02em] text-tinte-leise">Wer war dabei?</div>
              <div className="rounded-2xl zelle px-3 py-2">
                <Namen ausgewaehlt={ausgewaehlt} onAbwaehlen={onAbwaehlen} />
              </div>
              <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Antippen zum Abwählen. Alle bekommen eine Mitteilung.</p>
            </div>
          }
          onEintragen={(titel, p, datum) => {
            if (!ausgewaehlt.length) return;
            addContributionMany(
              ausgewaehlt.map((x) => x.id),
              titel,
              p,
              datum,
            );
            onDone();
          }}
        />
      </div>
    </div>
  );
}

/**
 * Die Ausgewählten in der Leiste: EINE Zeile „Anna Berg, Ben Kurz +3 ›“ – so
 * viele Namen, wie hineinpassen, der Rest als Zahl. Gemessen wird an einer
 * unsichtbaren Kopie (je Name ein Stück), neu bei jeder Änderung der Auswahl
 * und der Breite (Drehen). Ein Tipp öffnet die ganze Liste im Blatt.
 */
function NamenZeile({ ausgewaehlt, onOeffnen }: { ausgewaehlt: Student[]; onOeffnen: () => void }) {
  const platzRef = useRef<HTMLSpanElement>(null);
  const messRef = useRef<HTMLSpanElement>(null);
  const namen = ausgewaehlt.map((s) => `${s.vorname} ${s.nachname}`.trim());
  const [passen, setPassen] = useState(namen.length);
  const schluessel = namen.join("\n");
  const messen = useCallback(() => {
    const platz = platzRef.current?.clientWidth ?? 0;
    const teile = Array.from(messRef.current?.children ?? []) as HTMLElement[];
    if (!platz || !teile.length) return;
    const ende = (i: number) => teile[i].offsetLeft + teile[i].offsetWidth;
    let k = teile.length;
    if (ende(k - 1) > platz) {
      // Passen nicht alle, braucht „+12“ rechts noch Platz
      k = 0;
      while (k < teile.length - 1 && ende(k) + 46 <= platz) k++;
    }
    // Mindestens ein Name – notfalls mit „…“ gekürzt
    setPassen(Math.max(1, k));
  }, []);
  useLayoutEffect(messen, [messen, schluessel]);
  // `leer` gehört dazu: ohne Auswahl steht hier nur der Hinweis (ref leer) –
  // sonst hinge der Beobachter nie an der Namenszeile
  const leer = namen.length === 0;
  useEffect(() => {
    const el = platzRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [messen, leer]);

  if (leer)
    return <p className="flex min-h-[44px] items-center text-[13px] text-tinte-leise">Personen in der Liste antippen, um sie auszuwählen.</p>;

  const zeigen = Math.min(passen, namen.length);
  const rest = namen.length - zeigen;
  return (
    <button
      type="button"
      onClick={onOeffnen}
      aria-haspopup="dialog"
      aria-label={`Ausgewählt: ${namen.join(", ")} – alle anzeigen`}
      className="flex min-h-[44px] w-full items-center gap-2 text-left transition active:opacity-60"
    >
      <span ref={platzRef} className="relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <span ref={messRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap text-[14px] font-medium">
          {namen.map((x, i) => (
            <span key={i}>{(i ? ", " : "") + x}</span>
          ))}
        </span>
        <span className="min-w-0 truncate text-[14px] font-medium text-tinte-matt dark:text-slate-300">{namen.slice(0, zeigen).join(", ")}</span>
        {rest > 0 && (
          <span className="zahl shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[13px] font-semibold text-brand-dark dark:bg-brand/20 dark:text-brand">
            +{rest}
          </span>
        )}
      </span>
      <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">
        ›
      </span>
    </button>
  );
}

/**
 * Namen der Ausgewählten als Kapseln (antippen = abwählen), umbrechend – im
 * Blatt „… ausgewählt“ und im Mithilfe-Blatt. 36 px hoch, antippbar 44 px
 * (::after 4 px darüber und darunter; 8 px Abstand, damit sich die Flächen
 * nicht überdecken).
 */
function Namen({ ausgewaehlt, onAbwaehlen }: { ausgewaehlt: Student[]; onAbwaehlen: (id: string) => void }) {
  if (ausgewaehlt.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 py-1">
      {ausgewaehlt.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onAbwaehlen(s.id)}
          aria-label={`${s.vorname} ${s.nachname} abwählen`}
          className="relative flex min-h-9 max-w-full items-center gap-1 rounded-full bg-brand/10 pl-3 pr-2 text-[13px] font-semibold text-tinte transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-95 dark:bg-brand/20 dark:text-slate-200"
        >
          <span className="truncate">
            {s.nachname}, {s.vorname}
          </span>
          <span aria-hidden className="shrink-0 text-tinte-leise">
            <Icon name="x" size={14} strich={2.4} />
          </span>
        </button>
      ))}
    </div>
  );
}
