import { useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import {
  WOCHENTAGE, anTag, ausKey, betrifftMich, heuteKey, montagVon, plusTage, tagKey,
  tagLang, umfangText, zeitText, type Termin,
} from "../lib/termine";
import { Icon } from "./Icon";

/**
 * Die kleine Übersicht ganz oben im Events-Reiter.
 *
 * Sieben Tagesfelder, Punkte an den Tagen mit Terminen, darunter der
 * angetippte Tag ausgeschrieben. Gedacht für den Blick zwischendurch:
 * "wann ist was und wo" – ohne den großen Kalender zu öffnen.
 */
export function Wochenstreifen({
  onKalender,
  onOeffnen,
}: {
  onKalender: (tag: string) => void;
  /** Termin antippen: ansehen – und fürs Team ändern oder löschen */
  onOeffnen?: (t: Termin) => void;
}) {
  const { termine, meineKomitees, meineStudentIds, ready, neueTermine } = useTermine();
  // Das früheste Neue – dorthin springt der Hinweis
  const erstesNeues = useMemo(
    () => termine.filter((t) => neueTermine.has(t.id)).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null,
    [termine, neueTermine],
  );
  const heute = heuteKey();
  const [woStart, setWoStart] = useState(() => montagVon(heute));
  const [gewaehlt, setGewaehlt] = useState(heute);

  const tage = useMemo(
    () => Array.from({ length: 7 }, (_, i) => plusTage(woStart, i)),
    [woStart],
  );
  const desTages = anTag(termine, gewaehlt);

  const meins = (t: Termin) => betrifftMich(t, meineKomitees, meineStudentIds);

  function woche(richtung: number) {
    const neu = plusTage(woStart, richtung * 7);
    setWoStart(neu);
    // Beim Blättern den ersten Tag der Woche zeigen, außer die aktuelle
    // Woche ist gemeint – dann bleibt heute stehen.
    setGewaehlt(neu === montagVon(heute) ? heute : neu);
  }

  const monatBeschriftung = () => {
    const a = ausKey(tage[0]);
    const b = ausKey(tage[6]);
    const kurz = (d: Date) => d.toLocaleDateString("de-DE", { month: "short" });
    return a.getMonth() === b.getMonth()
      ? `${kurz(a)} ${a.getFullYear()}`
      : `${kurz(a)}–${kurz(b)} ${b.getFullYear()}`;
  };

  return (
    <section className="card mb-3 p-3 sm:p-4" data-tour="wochenstreifen">
      {/* ------------------------------------------------ Kopfzeile */}
      <div className="mb-2.5 flex items-center gap-1.5">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tinte-matt">
          {woStart === montagVon(heute) ? "Diese Woche" : monatBeschriftung()}
        </h2>
        <button
          onClick={() => woche(-1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition hover:bg-black/[0.04] active:scale-90 dark:hover:bg-white/[0.06]"
          aria-label="Woche zurück"
        >
          ‹
        </button>
        <button
          onClick={() => woche(1)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition hover:bg-black/[0.04] active:scale-90 dark:hover:bg-white/[0.06]"
          aria-label="Woche vor"
        >
          ›
        </button>
        {/* Beschriftung steht immer dabei. Ein Kalender-Icon allein sagt nicht,
            dass dahinter Monat, Woche und Tag stecken. */}
        <button
          onClick={() => onKalender(gewaehlt)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 text-[12px] font-semibold text-brand-dark transition active:scale-95 dark:bg-brand/20 dark:text-brand-soft"
          aria-label="Ganzen Kalender öffnen"
          title="Ganzen Kalender öffnen – Monat, Woche und Tag"
        >
          <Icon name="kalender" size={15} />
          Kalender
          {neueTermine.size > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {neueTermine.size > 9 ? "9+" : neueTermine.size}
            </span>
          )}
        </button>
      </div>

      {/* Neu dazugekommen? Dann ein Tipp direkt dorthin. */}
      {erstesNeues && (
        <button
          onClick={() => onKalender(erstesNeues.datum)}
          className="mb-2.5 flex w-full items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-left text-[12px] font-semibold text-red-700 transition active:scale-[0.99] dark:bg-red-500/10 dark:text-red-300"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="min-w-0 flex-1 truncate">
            {neueTermine.size === 1
              ? `Neu: ${erstesNeues.icon ? erstesNeues.icon + " " : ""}${erstesNeues.titel} · ${tagLang(erstesNeues.datum)}`
              : `${neueTermine.size} neue Termine – ab ${tagLang(erstesNeues.datum)}`}
          </span>
          <span className="shrink-0">ansehen ›</span>
        </button>
      )}

      {/* ------------------------------------------------ sieben Tage */}
      <div className="grid grid-cols-7 gap-1">
        {tage.map((k) => {
          const liste = anTag(termine, k);
          const istHeute = k === heute;
          const aktiv = k === gewaehlt;
          const tag = ausKey(k);
          const fuerMich = liste.some(meins);
          return (
            <button
              key={k}
              onClick={() => setGewaehlt(k)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border py-1.5 transition active:scale-95 ${
                aktiv
                  ? "border-brand bg-brand text-white"
                  : istHeute
                    ? "border-brand/40 bg-brand/5 dark:bg-brand/10"
                    : "border-transparent hover:bg-papier-matt dark:hover:bg-slate-800"
              }`}
            >
              <span className={`text-[10px] font-semibold ${aktiv ? "text-white/70" : "text-tinte-leise"}`}>
                {WOCHENTAGE[(tag.getDay() + 6) % 7]}
              </span>
              <span className={`zahl text-[15px] font-bold leading-none ${aktiv ? "" : istHeute ? "text-brand" : ""}`}>
                {tag.getDate()}
              </span>
              {/* Punkte: höchstens drei, damit die Spalte schmal bleibt */}
              <span className="flex h-1.5 items-center gap-0.5">
                {liste.slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      neueTermine.has(t.id) ? "bg-red-500" : aktiv ? "bg-white/80" : meins(t) ? "bg-brand" : "bg-tinte-leise/50"
                    }`}
                  />
                ))}
              </span>
              {fuerMich && !aktiv && <span className="sr-only">betrifft dich</span>}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------ der gewählte Tag */}
      <div className="mt-3 border-t border-papier-linie pt-2.5 dark:border-slate-800">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-tinte-matt">
            {gewaehlt === heute ? "Heute" : tagLang(gewaehlt)}
          </span>
          {gewaehlt !== heute && (
            <button
              onClick={() => {
                setWoStart(montagVon(heute));
                setGewaehlt(heute);
              }}
              className="shrink-0 text-[11px] font-semibold text-brand"
            >
              zu heute
            </button>
          )}
        </div>

        {!ready ? (
          <div className="py-3 text-center text-[12px] text-tinte-leise">Termine werden geladen …</div>
        ) : desTages.length === 0 ? (
          <div className="py-3 text-center text-[12px] text-tinte-leise">Nichts eingetragen.</div>
        ) : (
          <ul className="grid gap-1.5">
            {desTages.map((t) => (
              <TerminZeile key={t.id} t={t} meins={meins(t)} onClick={onOeffnen ? () => onOeffnen(t) : undefined} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Eine Zeile: Uhrzeit, Bezeichnung, Ort. Mehr braucht der schnelle Blick nicht. */
export function TerminZeile({ t, meins, onClick }: { t: Termin; meins: boolean; onClick?: () => void }) {
  const inhalt = (
    <>
      <span
        className={`zahl w-[4.2rem] shrink-0 text-[12px] font-bold ${meins ? "text-brand" : "text-tinte-matt"}`}
      >
        {t.von ? zeitText(t).replace(" – ", "–") : "ganztägig"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">
          {t.icon ? (
            <span className="mr-1">{t.icon}</span>
          ) : (
            t.sichtbar === "komitee" && t.tags[0] && (
              <span className="mr-1">{committeeIcon(t.tags[0])}</span>
            )
          )}
          {t.titel}
        </span>
        <span className="block truncate text-[11px] text-tinte-leise">
          {[
            t.ort,
            t.plaetze ? `${t.personen.length}/${t.plaetze} eingeteilt` : umfangText(t, committeeLabel),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {meins && (
        <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand dark:bg-brand/20">
          für dich
        </span>
      )}
    </>
  );

  const klasse = `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${
    meins ? "bg-brand/5 dark:bg-brand/10" : "bg-papier-matt dark:bg-slate-800/60"
  }`;

  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className={`${klasse} transition active:scale-[.99]`}>
          {inhalt}
        </button>
      ) : (
        <div className={klasse}>{inhalt}</div>
      )}
    </li>
  );
}

/** Damit der Kalender denselben Tagesschlüssel benutzt wie der Streifen. */
export { tagKey };
