import { useEffect, useMemo, useState } from "react";
import { useWischen } from "../lib/wischen";
import { useSchichtStatus, useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import {
  MONATE, WOCHENTAGE, anTag, ausKey, betrifftMich, farbeVon, freiAn, heuteKey, istKlausur, laeuftAn, monatLang,
  montagVon, plusTage, tagKey, tagLang, uhr, umfangText, zeitText, type SchichtStatus, type Termin,
} from "../lib/termine";
import { KuerzelLeiste, SchichtLegende, SchichtSchild, Zeichen, chipKlasse, punktKlasse, schichtRahmen, schichtVorzeichen } from "./TerminZeichen";
import { Icon } from "./Icon";
import { TerminZeile } from "./Wochenstreifen";
import { ChatEbene, ChatKopf } from "./ChatBlasen";
import { useEscapeSchliesst } from "./Sheet";
import { useBreit } from "../lib/gescrollt";

import { usePrivatTermine, useKalenderDemo } from "../lib/kalender-sync";
import { KalenderSyncSheet } from "./KalenderSyncSheet";
type Ansicht = "monat" | "woche" | "tag";

/** Was auf dem Umschalter steht und was die Pfeile bewegen. */
const ANSICHT_NAME: Record<Ansicht, string> = { monat: "Monat", woche: "Woche", tag: "Tag" };
const SCHRITT: Record<Ansicht, string> = { monat: "Monat", woche: "Woche", tag: "Tag" };

/**
 * Der große Kalender.
 *
 * Bewusst ruhig gehalten: keine Stundenraster mit 24 Zeilen, in denen auf dem
 * Handy nichts mehr lesbar ist. Die Wochenansicht zeigt sieben Spalten mit den
 * Terminen als Kärtchen, die Tagesansicht eine Liste. Wer es genauer braucht,
 * tippt den Termin an.
 */
export function Kalender({
  startTag,
  onSchliessen,
  onNeu,
  onOeffnen,
}: {
  /** Tag, auf dem der Kalender aufgeht – der im Streifen angetippte. */
  startTag?: string;
  onSchliessen: () => void;
  onNeu?: (datum: string) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const { termine: stufenTermine, meineKomitees, meineStudentIds } = useTermine();
  // Testphase: eigene Termine aus dem Handy-Kalender grau dazu (nur Testkonten).
  // Zurzeit aus: KALENDER_SYNC_AN in lib/kalender-sync.ts (Wunsch 14.10.2026).
  const kalenderDemo = useKalenderDemo();
  const privat = usePrivatTermine(kalenderDemo);
  const termine = useMemo(
    () => (privat.termine.length ? [...stufenTermine, ...privat.termine] : stufenTermine),
    [stufenTermine, privat.termine],
  );
  const [syncOffen, setSyncOffen] = useState(false);
  const { can, isStaff } = useRole();
  const darfAnlegen = Boolean(onNeu) && (isStaff || can("termine.manage"));

  const heute = heuteKey();
  const [ansicht, setAnsicht] = useState<Ansicht>("monat");
  const [anker, setAnker] = useState(startTag || heute);

  const meins = (t: Termin) => betrifftMich(t, meineKomitees, meineStudentIds);
  // Schichten: bekommen / gemeldet / nicht bekommen – eigene Optik im Kalender
  const st = useSchichtStatus();
  const hatSchichten = useMemo(() => stufenTermine.some((t) => st(t) !== null), [stufenTermine, st]);

  // ---------------------------------------------------------- blättern
  // Richtung der letzten Bewegung – danach gleitet die neue Ansicht von
  // rechts (vor) oder links (zurück) herein.
  const [richtung, setRichtung] = useState(0);
  function weiter(richtung: number) {
    setRichtung(richtung);
    if (ansicht === "monat") {
      const d = ausKey(anker);
      d.setMonth(d.getMonth() + richtung, 1);
      setAnker(tagKey(d));
    } else if (ansicht === "woche") {
      setAnker(plusTage(anker, richtung * 7));
    } else {
      setAnker(plusTage(anker, richtung));
    }
  }

  // Escape schliesst den Kalender – aber nur, wenn darüber kein Blatt offen ist
  // (gemeinsamer Stapel aus Sheet.tsx; vorher schloss ein Escape im Termin-Blatt
  // Blatt UND Kalender).
  useEscapeSchliesst(true, onSchliessen);

  // Ab 640 px öffnet ein Tag im Monat die Tagesansicht; am Handy wird er nur
  // gewählt und steht unter dem Raster als Liste (wie im iOS-Kalender).
  const abSm = useAbSm();
  // Am Laptop/iPad quer steht der Kopf in der Kopfzeile der App (ChatEbene).
  const breit = useBreit();

  // Nach links wischen = weiter, nach rechts = zurück (Monat, Woche, Tag)
  const { handler: wischen, zug } = useWischen(weiter);

  /** „12.–18. Oktober“ bzw. „29. Sep. – 5. Okt.“ – kurz genug für schmale Handys. */
  function wochenTitel(mo: Date): string {
    const so = new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + 6);
    if (mo.getMonth() === so.getMonth()) return `${mo.getDate()}.–${so.getDate()}. ${MONATE[so.getMonth()]}`;
    return `${mo.getDate()}. ${MONATE[mo.getMonth()].slice(0, 3)}. – ${so.getDate()}. ${MONATE[so.getMonth()].slice(0, 3)}.`;
  }

  const titel =
    ansicht === "monat"
      ? monatLang(anker)
      : ansicht === "woche"
        ? wochenTitel(ausKey(montagVon(anker)))
        : tagLang(anker);

  /** Zu einem Tag springen – gleitet nur, wenn sich dabei der Monat ändert. */
  function springe(k: string) {
    setRichtung(k.slice(0, 7) === anker.slice(0, 7) ? 0 : k < anker ? -1 : 1);
    setAnker(k);
  }

  // ---------------------------------------------------------- Kopf
  // Wie ein geöffneter Chat (ChatEbene + ChatKopf): am Handy eigene Kopfzeile,
  // am Laptop/iPad quer in der EINEN Kopfzeile der App – App-Knöpfe und
  // Reiterleiste bleiben sichtbar (Design-Regeln 3).
  // Zurück ist beschriftet („‹ Events“), die Pfeile zum Blättern sind blau und
  // ohne Kreis wie bei „Diese Woche“ (Wochenstreifen) – vorher waren Zurück
  // und „Vorheriger Monat“ zwei gleiche graue Kreise mit demselben „‹“.
  // Am Laptop stehen sie direkt auf dem Hintergrundbild: dort mit Lichthof wie
  // auf-bild (am Handy liegt der Kopf auf deckendem Glas – kein Lichthof).
  // 44 × 44 px Trefferfläche (Design-Regel 5) – das Paar rückt nur über die
  // Pfeil-Zeichen zusammen, nicht über kleinere Knöpfe
  const pfeil = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-dark transition active:scale-90 active:bg-black/[0.04] dark:text-brand dark:active:bg-white/[0.06] ${
    breit ? "[.mit-hintergrund_&]:[filter:drop-shadow(0_0_2px_rgb(var(--papier)))_drop-shadow(0_0_6px_rgb(var(--papier)))]" : ""
  }`;
  // Eng beieinander (ein Paar wie „Diese Woche ‹ ›“), deutlich getrennt vom Zurück links
  const blaettern = (
    <div className="flex shrink-0 items-center">
      <button
        onClick={() => weiter(-1)}
        className={pfeil}
        aria-label={`Vorheriger ${SCHRITT[ansicht]}`}
        title={`Vorheriger ${SCHRITT[ansicht]}`}
      >
        <span className="block rotate-180">
          <Icon name="chevron" size={22} strich={2.6} />
        </span>
      </button>
      <button
        onClick={() => weiter(1)}
        className={pfeil}
        aria-label={`Nächster ${SCHRITT[ansicht]}`}
        title={`Nächster ${SCHRITT[ansicht]}`}
      >
        <Icon name="chevron" size={22} strich={2.6} />
      </button>
    </div>
  );
  // Sichtbarer Umschalter mit Rahmen: so erkennt man, dass es drei Ansichten
  // gibt und welche gerade läuft. Am Laptop füllt er die Breite, die ChatKopf
  // dem Umschalter gibt (17rem).
  const segment = (
    <div className={`seg ${breit ? "" : "shrink-0"}`} role="tablist" aria-label="Ansicht">
      {(["monat", "woche", "tag"] as Ansicht[]).map((a) => (
        <button
          key={a}
          role="tab"
          onClick={() => setAnsicht(a)}
          aria-selected={ansicht === a}
          className={`seg-item whitespace-nowrap ${breit ? "" : "!flex-none !px-2.5 min-[380px]:!px-3.5"} ${ansicht === a ? "seg-aktiv" : ""}`}
        >
          {ANSICHT_NAME[a]}
        </button>
      ))}
    </div>
  );
  // In der App-Kopfzeile (Laptop) liegt „Heute“ direkt auf dem Hintergrundbild:
  // dort deckend wie das Segment (sonst grau-durchsichtig auf dem Foto).
  const heuteKnopf = (
    <button
      onClick={() => springe(heute)}
      className={`btn-klein-grau shrink-0 !px-3 ${
        breit ? "[.mit-hintergrund_&]:!bg-[rgb(227_227_232)] [.dark.mit-hintergrund_&]:!bg-[rgb(var(--glas))]" : ""
      }`}
    >
      Heute
    </button>
  );
  const terminKnopf = darfAnlegen && (
    <button
      onClick={() => onNeu!(anker)}
      aria-label="Termin eintragen"
      className="btn-klein shrink-0 gap-1 whitespace-nowrap !px-3"
    >
      {/* Beschriftung bleibt auch auf schmalen Handys – ein „＋“ allein
          sagt nicht, was es tut. Dafür sind die Abstände knapp. */}
      <Icon name="plus" size={14} strich={2.6} />
      Termin
    </button>
  );
  const kopf = (
    <ChatKopf
      onBack={onSchliessen}
      zurueckText="Events"
      titel={<span className="font-zahl">{titel}</span>}
      // Am Handy keine zweite Zeile: die Ansicht zeigt der Umschalter darunter,
      // und ChatKopf setzt sie dort in 11,5 px (unter der 12-px-Grenze).
      unter={breit ? "Kalender der Stufe" : undefined}
      rechts={
        breit ? (
          <>
            {/* Schmaler als die 17rem, die ChatKopf einem Umschalter gibt –
                sonst bleibt am iPad quer vom Monatsnamen nur „Oktober 2…“.
                12,5rem: „‹ Events“ und die 44-px-Pfeile brauchen mehr Platz
                als der alte runde Zurück-Knopf (iPad quer: „30. Aug. – 5. Sep.“) */}
            <div className="w-[12.5rem]">{segment}</div>
            {blaettern}
            {heuteKnopf}
            {terminKnopf}
          </>
        ) : (
          blaettern
        )
      }
    >
      {breit ? null : (
        <div className="flex items-center gap-2">
          {segment}
          <div className="ml-auto flex items-center gap-2">
            {heuteKnopf}
            {terminKnopf}
          </div>
        </div>
      )}
    </ChatKopf>
  );

  // Im Monat bleibt der Inhalt beim Antippen eines Tages stehen (nur die Wahl
  // wandert); er gleitet erst, wenn ein anderer Monat dran ist.
  const inhaltSchluessel = `${ansicht}-${ansicht === "monat" ? anker.slice(0, 7) : anker}`;

  return (
    <ChatEbene label="Kalender" start="oben" kopf={kopf}>
      {/* ------------------------------------------------ Inhalt */}
      <div className="overflow-x-hidden pb-2 pt-2" {...wischen}>
        <div
          key={inhaltSchluessel}
          className={richtung > 0 ? "animate-vonRechts" : richtung < 0 ? "animate-vonLinks" : ""}
          style={zug ? { transform: `translateX(${zug}px)`, transition: "none" } : undefined}
        >
          {/* Testphase: Kalender-Verbindung, nur für die Testkonten – zurzeit
              aus (KALENDER_SYNC_AN in lib/kalender-sync.ts) */}
          {kalenderDemo && (
            <button
              onClick={() => setSyncOffen(true)}
              className="mb-2.5 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-left text-[13px] font-semibold text-brand-dark transition active:scale-[0.99] dark:bg-brand/20 dark:text-brand-soft"
            >
              <span aria-hidden>📱⇄</span>
              <span className="min-w-0 flex-1 truncate">
                {privat.termine.length
                  ? `Kalender verbunden · eigene Termine gestrichelt`
                  : "Stufen-Termine ins Handy übernehmen"}
              </span>
              <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[12px] font-bold">Test</span>
            </button>
          )}
          {hatSchichten && <SchichtLegende />}
          {ansicht === "monat" && (
            <MonatsAnsicht
              anker={anker}
              termine={termine}
              heute={heute}
              meins={meins}
              st={st}
              onTag={(k) => {
                if (abSm) {
                  setAnker(k);
                  setAnsicht("tag");
                } else springe(k);
              }}
              onOeffnen={onOeffnen}
            />
          )}
          {ansicht === "woche" && (
            <WochenAnsicht
              anker={anker}
              termine={termine}
              heute={heute}
              meins={meins}
              st={st}
              onOeffnen={onOeffnen}
              onTag={(k) => {
                setAnker(k);
                setAnsicht("tag");
              }}
            />
          )}
          {ansicht === "tag" && (
            <TagesAnsicht anker={anker} termine={termine} meins={meins} st={st} onOeffnen={onOeffnen} />
          )}
        </div>
      </div>
      {kalenderDemo && <KalenderSyncSheet open={syncOffen} onClose={() => setSyncOffen(false)} />}
    </ChatEbene>
  );
}

/** Mindestens 640 px breit (Tailwind „sm“)? Folgt dem Drehen des Geräts. */
function useAbSm(): boolean {
  const abfrage = "(min-width: 640px)";
  const [ab, setAb] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(abfrage).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(abfrage);
    if (!mq) return;
    const neu = () => setAb(mq.matches);
    neu();
    mq.addEventListener("change", neu);
    return () => mq.removeEventListener("change", neu);
  }, []);
  return ab;
}

// ================================================================ Monat

/**
 * Monat: am Handy wie im iOS-Kalender – die Zahl, darunter farbige Punkte
 * (vorher Schilder mit „Waf“, „Kuc“, „Stufen“ – unlesbar), der gewählte Tag
 * als gefüllter Kreis und unter dem Raster dessen Termine als Liste. So füllt
 * der Monat den Bildschirm, ohne dass man ihn verlassen muss. Ab 640 px stehen
 * die Termine als Schilder in den Feldern, ein Tipp öffnet die Tagesansicht.
 * `anker` ist zugleich der gewählte Tag.
 */
function MonatsAnsicht({
  anker, termine, heute, meins, st, onTag, onOeffnen,
}: {
  anker: string;
  termine: Termin[];
  heute: string;
  meins: (t: Termin) => boolean;
  st: (t: Termin) => SchichtStatus;
  onTag: (k: string) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const d = ausKey(anker);
  const monat = d.getMonth();
  // Das Raster beginnt immer am Montag vor dem Monatsersten und läuft in
  // vollen Wochen – sonst springen die Spalten von Monat zu Monat.
  const start = montagVon(tagKey(new Date(d.getFullYear(), monat, 1, 12)));
  const wochen = useMemo(() => {
    const alle: string[][] = [];
    let k = start;
    for (let w = 0; w < 6; w++) {
      const zeile = Array.from({ length: 7 }, (_, i) => plusTage(k, i));
      alle.push(zeile);
      k = plusTage(k, 7);
      // Abbrechen, sobald die nächste Woche komplett im Folgemonat liegt
      if (ausKey(k).getMonth() !== monat && ausKey(k) > d) break;
    }
    return alle;
  }, [start, monat, d]);

  const desTages = anTag(termine, anker);

  // Ab 640 px wachsen die Felder mit der Höhe des Bildschirms (iPad hoch: der
  // Monat füllt die Seite statt unten ein Drittel frei zu lassen), nie unter 7.5rem.
  return (
    <div>
      <div className="auf-bild mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
        {WOCHENTAGE.map((w) => (
          <div key={w} className="text-center text-[12px] font-bold uppercase tracking-[0.04em] text-tinte-leise">
            {w}
          </div>
        ))}
      </div>

      <div className="grid gap-1 sm:gap-1.5">
        {wochen.map((zeile, i) => (
          <div key={i} className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {zeile.map((k, spalte) => {
              const alle = anTag(termine, k);
              // Ferien laufen als Farbband durch, Klausuren als Kürzel-Zeile –
              // beides nimmt den normalen Terminen keinen Platz weg.
              const ferien = freiAn(termine, k);
              const klausuren = alle.filter((t) => !t.frei && istKlausur(t));
              const liste = alle.filter((t) => !t.frei && !istKlausur(t));
              const platz = klausuren.length ? 2 : 3;
              const imMonat = ausKey(k).getMonth() === monat;
              const istHeute = k === heute;
              const gewaehlt = k === anker;
              const band = ferien ? farbeVon(ferien)?.band ?? "bg-emerald-200/60 dark:bg-emerald-500/20" : "";
              // Name der Ferien am ersten Tag und am Wochenanfang
              const ferienName = ferien && (k === ferien.datum || spalte === 0) ? ferien.titel : "";
              // Ab 640 px stehen die Termine als Schilder im Feld – ein Tipp auf
              // ein Schild öffnet den Termin direkt (wie in der Woche), ein Tipp
              // auf die Zahl oder die freie Fläche den Tag. Deshalb ist das Feld
              // kein <button> (keine Knöpfe in Knöpfen), sondern ein Bereich mit
              // Knopf-Rolle.
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  onClick={() => onTag(k)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                    e.preventDefault();
                    onTag(k);
                  }}
                  aria-label={`${tagLang(k)}${ferien ? `, ${ferien.titel}` : ""}${alle.length ? `, ${alle.length} Termine` : ""}`}
                  aria-pressed={gewaehlt}
                  className={`flex min-h-[3.25rem] cursor-pointer select-none min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-left transition active:scale-[.98] sm:min-h-[max(7.5rem,calc((100dvh_-_16rem)/5.5))] sm:items-stretch sm:gap-0.5 sm:p-2 ${
                    istHeute ? "sm:ring-2 sm:ring-inset sm:ring-brand" : ""
                  } ${ferien ? band : "zelle"} ${imMonat ? "" : "opacity-40"}`}
                >
                  {/* Handy: Zahl mittig, gewählter Tag als gefüllter Kreis (heute blau) */}
                  <span
                    className={`zahl flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold leading-none sm:hidden ${
                      gewaehlt
                        ? istHeute
                          ? "bg-brand text-white"
                          : "bg-tinte text-white dark:bg-slate-100 dark:text-black"
                        : istHeute
                          ? "font-bold text-brand"
                          : ""
                    }`}
                  >
                    {ausKey(k).getDate()}
                  </span>
                  <span
                    className={`zahl hidden text-[14px] font-bold leading-none sm:block ${istHeute ? "text-brand" : ""}`}
                  >
                    {ausKey(k).getDate()}
                  </span>
                  {/* Handy: Klausur-Kürzel und bis zu drei Punkte in der Farbe
                      der Termine – was genau, steht in der Liste darunter. */}
                  <span className="flex min-w-0 flex-col items-center gap-[3px] sm:hidden" aria-hidden>
                    {klausuren.length > 0 && <MiniKuerzel liste={klausuren} />}
                    {liste.length > 0 && (
                      <span className="flex h-1.5 items-center gap-[3px]">
                        {liste.slice(0, 3).map((t) => (
                          <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${punktKlasse(t, meins(t), st(t))}`} />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="hidden min-w-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
                    {ferienName && (
                      <span className="truncate text-[12px] font-bold leading-tight text-tinte-matt dark:text-slate-200">
                        {ferien?.icon && !istKlausur(ferien) ? `${ferien.icon} ` : ""}
                        {ferienName}
                      </span>
                    )}
                    {klausuren.length > 0 && <KuerzelLeiste liste={klausuren} klein max={3} />}
                    {liste.slice(0, platz).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOeffnen(t);
                        }}
                        aria-label={`${t.titel}${t.von ? `, ${uhr(t.von)}` : ""} öffnen`}
                        // Bis zu zwei Einträge dürfen zweizeilig sein – die Zellen sind
                        // am Laptop hoch genug; vorher blieb nur ein Wort („Waf…“)
                        className={`min-w-0 rounded px-1 py-0.5 text-left text-[12px] font-semibold leading-tight transition hover:brightness-95 active:scale-[.97] ${liste.length <= 2 ? "line-clamp-2 break-words" : "block truncate"} ${chipKlasse(t, meins(t), st(t))}`}
                      >
                        {schichtVorzeichen(st(t))}
                        {t.icon ? `${t.icon} ` : t.von ? `${uhr(t.von)} ` : ""}
                        {t.titel}
                      </button>
                    ))}
                    {liste.length > platz && (
                      <span className="px-1 text-[12px] font-semibold text-tinte-leise">
                        +{liste.length - platz} weitere
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Handy: die Termine des gewählten Tages direkt unter dem Monat */}
      <section className="mt-4 sm:hidden">
        <h3 className="auf-bild mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
          {anker === heute ? `Heute · ${tagLang(anker)}` : tagLang(anker)}
        </h3>
        <div className="card px-2 py-1">
          {desTages.length === 0 ? (
            <p className="px-1 py-3 text-[14px] text-tinte-leise">Nichts eingetragen.</p>
          ) : (
            <ul className="grid">
              {desTages.map((t) => (
                <TerminZeile key={t.id} t={t} meins={meins(t)} status={st(t)} onClick={() => onOeffnen(t)} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** Handy-Monat: die Klausur-Kürzel eines Tages in einer winzigen Zeile. */
function MiniKuerzel({ liste }: { liste: Termin[] }) {
  const kuerzel = [...new Set(liste.map((t) => (t.icon || "").toUpperCase()).filter(Boolean))];
  // In der schmalen Handy-Zelle passt bei 12 px Schrift nur ein Kürzel; der Rest als „+n“
  return (
    <span className="flex min-w-0 items-center gap-[2px] overflow-hidden">
      {kuerzel.slice(0, 1).map((k) => (
        <span
          key={k}
          className="shrink-0 rounded-[3px] bg-tinte/85 px-[3px] py-[2px] font-zahl text-[12px] font-extrabold uppercase leading-none text-white dark:bg-slate-200 dark:text-slate-900"
        >
          {k}
        </span>
      ))}
      {kuerzel.length > 1 && <span className="text-[12px] font-bold leading-none text-tinte-leise">+{kuerzel.length - 1}</span>}
    </span>
  );
}

// ================================================================ Woche

function WochenAnsicht({
  anker, termine, heute, meins, st, onTag, onOeffnen,
}: {
  anker: string;
  termine: Termin[];
  heute: string;
  meins: (t: Termin) => boolean;
  st: (t: Termin) => SchichtStatus;
  onTag: (k: string) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const start = montagVon(anker);
  const tage = Array.from({ length: 7 }, (_, i) => plusTage(start, i));

  // Auf dem Handy stehen die Tage als flache Zeilen untereinander: sieben
  // hohe Karten mit "–" drin sind viel Platz fuer nichts. Erst ab lg wird
  // daraus das klassische Sieben-Spalten-Raster – dann so hoch wie der
  // Bildschirm (wie ein Wochenplaner), statt eines flachen Streifens mit
  // einer leeren Fläche darunter.
  return (
    <div className="grid gap-1.5 lg:grid-cols-7">
      {tage.map((k) => {
        const alle = anTag(termine, k);
        const ferien = freiAn(termine, k);
        const klausuren = alle.filter((t) => !t.frei && istKlausur(t));
        const liste = alle.filter((t) => !t.frei && !istKlausur(t));
        const istHeute = k === heute;
        const d = ausKey(k);
        return (
          <div
            key={k}
            className={`flex min-w-0 gap-2 rounded-xl p-2 lg:min-h-[max(12rem,calc(100dvh_-_14.5rem))] lg:flex-col ${
              istHeute
                ? `ring-2 ring-inset ring-brand ${ferien ? farbeVon(ferien)?.band ?? "bg-emerald-200/60 dark:bg-emerald-500/20" : "zelle"}`
                : ferien
                  ? farbeVon(ferien)?.band ?? "bg-emerald-200/60 dark:bg-emerald-500/20"
                  : "zelle"
            }`}
          >
            <button
              onClick={() => onTag(k)}
              className="flex w-14 shrink-0 items-baseline gap-1.5 text-left lg:mb-1.5 lg:w-auto lg:flex-col lg:gap-0"
            >
              <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-tinte-leise">
                {WOCHENTAGE[(d.getDay() + 6) % 7]}
              </span>
              <span className={`zahl text-[16px] font-bold leading-none ${istHeute ? "text-brand-dark dark:text-brand" : ""}`}>
                {d.getDate()}.
              </span>
            </button>

            {liste.length === 0 && klausuren.length === 0 && !ferien ? (
              <span className="flex-1 self-center text-[13px] text-tinte-leise lg:py-2 lg:text-center">–</span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {ferien && (
                  <button
                    onClick={() => onOeffnen(ferien)}
                    className="min-h-[24px] min-w-0 truncate text-left text-[13px] font-bold text-tinte-matt dark:text-slate-200"
                  >
                    {ferien.icon && !istKlausur(ferien) ? `${ferien.icon} ` : ""}
                    {ferien.titel}
                  </button>
                )}
                {klausuren.length > 0 && (
                  <KlausurKarte liste={klausuren} onOeffnen={onOeffnen} />
                )}
                {liste.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOeffnen(t)}
                    className={`min-h-[44px] min-w-0 rounded-lg px-2 py-1.5 text-left transition active:scale-[.98] ${chipKlasse(t, meins(t), st(t))}`}
                  >
                    <span className="block truncate text-[13px] font-bold leading-tight">
                      {schichtVorzeichen(st(t))}
                      {t.privat ? "📱 " : <Zeichen icon={t.icon} auf={meins(t) || st(t) === "eingeteilt"} klein />}
                      {t.titel}
                    </span>
                    <span
                      className={`block truncate text-[12px] ${
                        (meins(t) && st(t) !== "nicht") || st(t) === "eingeteilt" ? "text-white" : "opacity-80"
                      }`}
                    >
                      {[
                        t.von ? zeitText(t) : "ganztägig",
                        t.ort,
                        st(t) === "eingeteilt" ? "eingeteilt" : st(t) === "nicht" ? "nicht bekommen" : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ================================================================ Tag

function TagesAnsicht({
  anker, termine, meins, st, onOeffnen,
}: {
  anker: string;
  termine: Termin[];
  meins: (t: Termin) => boolean;
  st: (t: Termin) => SchichtStatus;
  onOeffnen: (t: Termin) => void;
}) {
  const liste = anTag(termine, anker);
  const mehrtaegig = liste.filter((t) => !laeuftAn(t, anker) || (t.bis_datum && t.bis_datum !== t.datum));

  // Volle Spaltenbreite wie Monat, Woche und Legende (Design-Regel 1) – vorher
  // eine schmale Karte mitten am Laptop, darunter alles leer.
  return (
    <div>
      {mehrtaegig.length > 0 && (
        <p className="auf-bild mb-2 px-1 text-[12px] text-tinte-leise">
          Mehrtägige Termine stehen an jedem Tag, an dem sie laufen.
        </p>
      )}
      {liste.length === 0 ? (
        <div className="card p-10 text-center text-[15px] text-tinte-leise">
          An diesem Tag steht nichts an.
        </div>
      ) : (
        <ul className="grid gap-2">
          {liste.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOeffnen(t)}
                className={`card relative flex w-full items-start gap-3 overflow-hidden p-4 text-left transition active:scale-[.99] ${
                  t.privat
                    ? "!border-dashed !border-tinte-leise/40 !bg-transparent !shadow-none"
                    : st(t)
                      ? schichtRahmen(st(t))
                      : meins(t)
                        ? "!border-brand/40 bg-brand/5 dark:bg-brand/10"
                        : ""
                }`}
              >
                {st(t) === "eingeteilt" ? (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-emerald-500" />
                ) : (
                  farbeVon(t) && !t.privat && st(t) !== "nicht" && (
                    <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${farbeVon(t)!.punkt}`} />
                  )
                )}
                <span
                  className={`zahl w-[4.6rem] shrink-0 pt-0.5 text-[13px] font-bold ${
                    st(t) === "eingeteilt" ? "text-emerald-700 dark:text-emerald-300" : "text-brand"
                  }`}
                >
                  {t.von ? uhr(t.von) : "ganztägig"}
                  {t.von && t.bis && (
                    <span className="block text-[12px] font-semibold text-tinte-leise">bis {uhr(t.bis)}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-tight">
                    {t.privat ? (
                      <span className="mr-1" aria-hidden>📱</span>
                    ) : t.icon ? (
                      <Zeichen icon={t.icon} />
                    ) : (
                      t.sichtbar === "komitee" && t.tags[0] && (
                        <span className="mr-1">{committeeIcon(t.tags[0])}</span>
                      )
                    )}
                    {t.titel}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-tinte-matt dark:text-slate-300">
                    {[
                      t.ort,
                      t.privat
                        ? "aus deinem Kalender – nur du siehst ihn"
                        : t.plaetze
                          ? `${t.personen.length}/${t.plaetze} eingeteilt`
                          : umfangText(t, committeeLabel),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {/* Schicht-Stand unter dem Titel – rechts daneben bricht sonst
                      ein langer Titel mitten im Wort um. */}
                  {st(t) && (
                    <span className="mt-1.5 block">
                      <SchichtSchild status={st(t)} klein />
                    </span>
                  )}
                  {t.beschreibung && (
                    <span className="mt-1 block line-clamp-2 text-[13px] leading-relaxed text-tinte-leise">
                      {t.beschreibung}
                    </span>
                  )}
                </span>
                {!st(t) && meins(t) && (
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand-dark dark:bg-brand/20 dark:text-brand">
                    für dich
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Alle Klausuren eines Tages in einem Kärtchen: Kürzel antippen = Details. */
function KlausurKarte({ liste, onOeffnen }: { liste: Termin[]; onOeffnen: (t: Termin) => void }) {
  // Je Kürzel der früheste Termin – M GK und M LK sind ein Schild.
  const je = new Map<string, Termin>();
  for (const t of liste) {
    const k = (t.icon || "").toUpperCase();
    if (!je.has(k)) je.set(k, t);
  }
  const beginn = liste.map((t) => uhr(t.von)).filter(Boolean).sort()[0];
  return (
    <div className="min-w-0 rounded-lg bg-[rgb(118_118_128/0.12)] px-2 py-1.5 dark:bg-[rgb(118_118_128/0.24)]">
      <span className="mb-1 block text-[12px] font-bold text-tinte-leise">
        {liste.length === 1 ? "Klausur" : `${liste.length} Klausuren`}
        {beginn ? ` · ab ${beginn}` : ""}
      </span>
      <span className="flex flex-wrap gap-1">
        {[...je.entries()].map(([k, t]) => (
          <button
            key={k}
            onClick={() => onOeffnen(t)}
            className="min-h-[28px] rounded bg-tinte/85 px-2 py-1 font-zahl text-[12px] font-extrabold leading-none text-white transition active:scale-95 dark:bg-slate-200 dark:text-slate-900"
            aria-label={t.titel}
            title={`${t.titel} · ${zeitText(t)}`}
          >
            {k}
          </button>
        ))}
      </span>
    </div>
  );
}

export { TerminZeile };
