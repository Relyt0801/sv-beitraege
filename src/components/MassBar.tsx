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
 *   2. Namen in EINER Zeile, waagerecht wischbar (Rand blendet aus, wenn mehr
 *      kommt); ohne Auswahl steht dort ein Hinweis – die Leiste springt nicht
 *   3. bezahlt · erlassen · offen · Mithilfe, gleich breit
 * Ab iPad-Breite stehen die Aktionen mit in Zeile 1, die Namen darunter.
 * Die Namens-Kapseln sind 36 px hoch und über ::after 44 px antippbar
 * (vorher 22 px – man traf leicht den Nachbarn).
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
    <div ref={hoeheRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
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
        <div className="order-4 w-full md:order-5">
          <Namen ausgewaehlt={ausgewaehlt} onAbwaehlen={onAbwaehlen} />
        </div>

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
                <Namen ausgewaehlt={ausgewaehlt} onAbwaehlen={onAbwaehlen} umbrechen />
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
 * Namen der Ausgewählten als Kapseln (antippen = abwählen).
 *
 * In der Leiste EINE Zeile, waagerecht wischbar: Wo noch mehr Namen kommen,
 * blendet der Rand aus. Im Mithilfe-Blatt (`umbrechen`) brechen sie um – dort
 * ist Platz. 36 px hoch, antippbar 44 px (::after 4 px darüber und darunter;
 * 8 px Abstand, damit sich die Flächen nicht überdecken).
 */
function Namen({
  ausgewaehlt,
  onAbwaehlen,
  umbrechen,
}: {
  ausgewaehlt: Student[];
  onAbwaehlen: (id: string) => void;
  umbrechen?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState({ links: false, rechts: false });
  const messen = useCallback(() => {
    const el = ref.current;
    if (!el || umbrechen) return;
    const links = el.scrollLeft > 2;
    const rechts = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setRand((r) => (r.links === links && r.rechts === rechts ? r : { links, rechts }));
  }, [umbrechen]);
  useLayoutEffect(messen, [messen, ausgewaehlt]);
  // `leer` gehört dazu: Ohne Auswahl steht hier nur der Hinweis (ref leer) –
  // sonst hinge der Beobachter nie an der Namenszeile, und nach dem Drehen
  // bliebe der ausblendende Rand stehen, obwohl nichts mehr übersteht.
  const leer = ausgewaehlt.length === 0;
  useEffect(() => {
    const el = ref.current;
    if (!el || umbrechen || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [messen, umbrechen, leer]);

  if (ausgewaehlt.length === 0)
    return umbrechen ? null : (
      <p className="flex min-h-[44px] items-center text-[13px] text-tinte-leise">Personen in der Liste antippen, um sie auszuwählen.</p>
    );

  const maske =
    rand.links || rand.rechts
      ? `linear-gradient(to right, ${rand.links ? "transparent, #000 1.5rem" : "#000"}, ${rand.rechts ? "#000 calc(100% - 1.5rem), transparent" : "#000"})`
      : undefined;

  return (
    <div
      ref={ref}
      onScroll={messen}
      className={umbrechen ? "flex flex-wrap gap-2 py-1" : "no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1"}
      style={maske ? { maskImage: maske, WebkitMaskImage: maske } : undefined}
    >
      {ausgewaehlt.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onAbwaehlen(s.id)}
          aria-label={`${s.vorname} ${s.nachname} abwählen`}
          className={`relative flex min-h-9 items-center gap-1 rounded-full bg-brand/10 pl-3 pr-2 text-[13px] font-semibold text-tinte transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-95 dark:bg-brand/20 dark:text-slate-200 ${
            umbrechen ? "max-w-full" : "shrink-0 whitespace-nowrap"
          }`}
        >
          <span className={umbrechen ? "truncate" : ""}>
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
