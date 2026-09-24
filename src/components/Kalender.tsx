import { useEffect, useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { committeeIcon, committeeLabel } from "../lib/committees";
import {
  MONATE, WOCHENTAGE, anTag, ausKey, betrifftMich, heuteKey, laeuftAn, monatLang,
  montagVon, plusTage, tagKey, tagLang, uhr, umfangText, zeitText, type Termin,
} from "../lib/termine";
import { Icon } from "./Icon";
import { TerminZeile } from "./Wochenstreifen";

type Ansicht = "monat" | "woche" | "tag";

/** Was auf dem Umschalter steht und was die Pfeile bewegen. */
const ANSICHT_NAME: Record<Ansicht, string> = { monat: "Monat", woche: "Woche", tag: "Tag" };
const SCHRITT: Record<Ansicht, string> = { monat: "Monat", woche: "Woche", tag: "Tag" };
const ANSICHT_LANG: Record<Ansicht, string> = {
  monat: "Monatsansicht",
  woche: "Wochenansicht",
  tag: "Tagesansicht",
};

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
  const { termine, meineKomitees, meineStudentIds } = useTermine();
  const { can, isStaff } = useRole();
  const darfAnlegen = Boolean(onNeu) && (isStaff || can("termine.manage"));

  const heute = heuteKey();
  const [ansicht, setAnsicht] = useState<Ansicht>("monat");
  const [anker, setAnker] = useState(startTag || heute);

  const meins = (t: Termin) => betrifftMich(t, meineKomitees, meineStudentIds);

  // ---------------------------------------------------------- blättern
  function weiter(richtung: number) {
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

  // Escape schliesst den Kalender – wie jedes andere Fenster
  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && onSchliessen();
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [onSchliessen]);

  const titel =
    ansicht === "monat"
      ? monatLang(anker)
      : ansicht === "woche"
        ? `Woche ab ${ausKey(montagVon(anker)).getDate()}. ${MONATE[ausKey(montagVon(anker)).getMonth()]}`
        : tagLang(anker);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-papier dark:bg-slate-950">
      {/* ------------------------------------------------ Kopfzeile */}
      <header className="shrink-0 border-b border-papier-linie bg-white px-3 pt-[calc(env(safe-area-inset-top)+0.6rem)] dark:border-slate-800 dark:bg-slate-900 sm:px-5">
        <div className="mx-auto flex max-w-5xl items-center gap-2 pb-2.5">
          <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Kalender schließen">
            ✕
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">{titel}</div>
            <div className="truncate text-[11px] text-tinte-leise">{ANSICHT_LANG[ansicht]} · Termine der Stufe</div>
          </div>
          <button
            onClick={() => weiter(-1)}
            className="iconbtn shrink-0"
            aria-label={`Vorheriger ${SCHRITT[ansicht]}`}
            title={`Vorheriger ${SCHRITT[ansicht]}`}
          >
            ‹
          </button>
          <button
            onClick={() => weiter(1)}
            className="iconbtn shrink-0"
            aria-label={`Nächster ${SCHRITT[ansicht]}`}
            title={`Nächster ${SCHRITT[ansicht]}`}
          >
            ›
          </button>
        </div>

        <div className="mx-auto flex max-w-5xl items-center gap-2 pb-2.5">
          {/* Sichtbarer Umschalter mit Rahmen: so erkennt man, dass es drei
              Ansichten gibt und welche gerade laeuft. */}
          <div className="flex shrink-0 gap-0.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
            {(["monat", "woche", "tag"] as Ansicht[]).map((a) => (
              <button
                key={a}
                onClick={() => setAnsicht(a)}
                aria-pressed={ansicht === a}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
                  ansicht === a
                    ? "bg-white text-brand-dark shadow-card dark:bg-slate-900 dark:text-brand-soft"
                    : "text-tinte-matt dark:text-slate-300"
                }`}
              >
                {ANSICHT_NAME[a]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAnker(heute)}
            className="ml-auto rounded-lg border border-papier-linie px-3 py-1.5 text-[12px] font-semibold text-tinte-matt transition active:scale-95 dark:border-slate-700 dark:text-slate-300"
          >
            Heute
          </button>
          {darfAnlegen && (
            <button
              onClick={() => onNeu!(anker)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white transition active:scale-95"
            >
              ＋ Termin
            </button>
          )}
        </div>
      </header>

      {/* ------------------------------------------------ Inhalt */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:px-5">
        <div className="mx-auto max-w-5xl">
          {ansicht === "monat" && (
            <MonatsAnsicht
              anker={anker}
              termine={termine}
              heute={heute}
              meins={meins}
              onTag={(k) => {
                setAnker(k);
                setAnsicht("tag");
              }}
            />
          )}
          {ansicht === "woche" && (
            <WochenAnsicht
              anker={anker}
              termine={termine}
              heute={heute}
              meins={meins}
              onOeffnen={onOeffnen}
              onTag={(k) => {
                setAnker(k);
                setAnsicht("tag");
              }}
            />
          )}
          {ansicht === "tag" && (
            <TagesAnsicht anker={anker} termine={termine} meins={meins} onOeffnen={onOeffnen} />
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================ Monat

function MonatsAnsicht({
  anker, termine, heute, meins, onTag,
}: {
  anker: string;
  termine: Termin[];
  heute: string;
  meins: (t: Termin) => boolean;
  onTag: (k: string) => void;
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

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-1.5">
        {WOCHENTAGE.map((w) => (
          <div key={w} className="text-center text-[11px] font-bold uppercase tracking-[0.04em] text-tinte-leise">
            {w}
          </div>
        ))}
      </div>

      <div className="grid gap-1 sm:gap-1.5">
        {wochen.map((zeile, i) => (
          <div key={i} className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {zeile.map((k) => {
              const liste = anTag(termine, k);
              const imMonat = ausKey(k).getMonth() === monat;
              const istHeute = k === heute;
              return (
                <button
                  key={k}
                  onClick={() => onTag(k)}
                  className={`flex min-h-[3.2rem] min-w-0 flex-col gap-0.5 rounded-xl border p-1.5 text-left transition active:scale-[.98] sm:min-h-[6.5rem] sm:p-2 ${
                    istHeute
                      ? "border-brand bg-brand/5 dark:bg-brand/10"
                      : "border-papier-linie bg-white hover:bg-papier-matt dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                  } ${imMonat ? "" : "opacity-40"}`}
                >
                  <span
                    className={`zahl text-[12px] font-bold leading-none sm:text-[13px] ${
                      istHeute ? "text-brand" : ""
                    }`}
                  >
                    {ausKey(k).getDate()}
                  </span>
                  {/* Handy: nur Punkte. In eine 50 px breite Zelle passt
                      "14:0…" – das sagt niemandem etwas. Ab sm die Titel. */}
                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {liste.slice(0, 4).map((t) => (
                      <span
                        key={t.id}
                        className={`h-1.5 w-1.5 rounded-full ${meins(t) ? "bg-brand" : "bg-tinte-leise/60"}`}
                      />
                    ))}
                  </span>
                  <span className="hidden min-w-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex">
                    {liste.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight ${
                          meins(t)
                            ? "bg-brand text-white"
                            : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {t.icon ? `${t.icon} ` : t.von ? `${uhr(t.von)} ` : ""}
                        {t.titel}
                      </span>
                    ))}
                    {liste.length > 3 && (
                      <span className="px-1 text-[10px] font-semibold text-tinte-leise">
                        +{liste.length - 3} weitere
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================ Woche

function WochenAnsicht({
  anker, termine, heute, meins, onTag, onOeffnen,
}: {
  anker: string;
  termine: Termin[];
  heute: string;
  meins: (t: Termin) => boolean;
  onTag: (k: string) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const start = montagVon(anker);
  const tage = Array.from({ length: 7 }, (_, i) => plusTage(start, i));

  // Auf dem Handy stehen die Tage als flache Zeilen untereinander: sieben
  // hohe Karten mit "–" drin sind viel Platz fuer nichts. Erst ab lg wird
  // daraus das klassische Sieben-Spalten-Raster.
  return (
    <div className="grid gap-1.5 lg:grid-cols-7">
      {tage.map((k) => {
        const liste = anTag(termine, k);
        const istHeute = k === heute;
        const d = ausKey(k);
        return (
          <div
            key={k}
            className={`flex min-w-0 gap-2 rounded-xl border p-2 lg:flex-col ${
              istHeute
                ? "border-brand bg-brand/5 dark:bg-brand/10"
                : "border-papier-linie bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            <button
              onClick={() => onTag(k)}
              className="flex w-14 shrink-0 items-baseline gap-1.5 text-left lg:mb-1.5 lg:w-auto lg:flex-col lg:gap-0"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-tinte-leise">
                {WOCHENTAGE[(d.getDay() + 6) % 7]}
              </span>
              <span className={`zahl text-[15px] font-bold leading-none ${istHeute ? "text-brand" : ""}`}>
                {d.getDate()}.
              </span>
            </button>

            {liste.length === 0 ? (
              <span className="flex-1 self-center text-[11px] text-tinte-leise lg:py-2 lg:text-center">–</span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {liste.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOeffnen(t)}
                    className={`min-w-0 rounded-lg px-1.5 py-1 text-left transition active:scale-[.98] ${
                      meins(t)
                        ? "bg-brand text-white"
                        : "bg-papier-matt text-tinte dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <span className="block truncate text-[11px] font-bold leading-tight">
                      {t.icon ? `${t.icon} ` : ""}
                      {t.titel}
                    </span>
                    <span
                      className={`block truncate text-[10px] ${
                        meins(t) ? "text-white/70" : "text-tinte-leise"
                      }`}
                    >
                      {[t.von ? zeitText(t) : "ganztägig", t.ort].filter(Boolean).join(" · ")}
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
  anker, termine, meins, onOeffnen,
}: {
  anker: string;
  termine: Termin[];
  meins: (t: Termin) => boolean;
  onOeffnen: (t: Termin) => void;
}) {
  const liste = anTag(termine, anker);
  const mehrtaegig = liste.filter((t) => !laeuftAn(t, anker) || (t.bis_datum && t.bis_datum !== t.datum));

  return (
    <div className="mx-auto max-w-2xl">
      {mehrtaegig.length > 0 && (
        <p className="mb-2 text-[11px] text-tinte-leise">
          Mehrtägige Termine stehen an jedem Tag, an dem sie laufen.
        </p>
      )}
      {liste.length === 0 ? (
        <div className="card p-10 text-center text-sm text-tinte-leise">
          An diesem Tag steht nichts an.
        </div>
      ) : (
        <ul className="grid gap-2">
          {liste.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOeffnen(t)}
                className={`card flex w-full items-start gap-3 p-4 text-left transition active:scale-[.99] ${
                  meins(t) ? "!border-brand/40 bg-brand/5 dark:bg-brand/10" : ""
                }`}
              >
                <span className="zahl w-[4.6rem] shrink-0 pt-0.5 text-[13px] font-bold text-brand">
                  {t.von ? uhr(t.von) : "ganztägig"}
                  {t.von && t.bis && (
                    <span className="block text-[11px] font-semibold text-tinte-leise">bis {uhr(t.bis)}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-tight">
                    {t.icon ? (
                      <span className="mr-1">{t.icon}</span>
                    ) : (
                      t.sichtbar === "komitee" && t.tags[0] && (
                        <span className="mr-1">{committeeIcon(t.tags[0])}</span>
                      )
                    )}
                    {t.titel}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-tinte-matt">
                    {[
                      t.ort,
                      t.plaetze ? `${t.personen.length}/${t.plaetze} eingeteilt` : umfangText(t, committeeLabel),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {t.beschreibung && (
                    <span className="mt-1 block line-clamp-2 text-[12px] leading-relaxed text-tinte-leise">
                      {t.beschreibung}
                    </span>
                  )}
                </span>
                {meins(t) && (
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand dark:bg-brand/20">
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

export { TerminZeile };
