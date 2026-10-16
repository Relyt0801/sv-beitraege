import { useEffect, useMemo, useState } from "react";
import { useWischen } from "../lib/wischen";
import { SkelettText } from "./Skelett";
import { useSchichtStatus, useTermine } from "../termine-store";
import { committeeIcon, committeeLabel } from "../lib/committees";
import {
  WOCHENTAGE, anTag, ausKey, betrifftMich, farbeVon, freiAn, heuteKey, istKlausur, montagVon, plusTage, tagKey,
  tagLang, umfangText, zeitText, type SchichtStatus, type Termin,
} from "../lib/termine";
import { SchichtSchild, Zeichen, punktKlasse } from "./TerminZeichen";
import { Icon } from "./Icon";
import { usePrivatTermine, useKalenderDemo } from "../lib/kalender-sync";
import { KalenderSyncSheet } from "./KalenderSyncSheet";

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
  onNeu,
  onTag,
}: {
  onKalender: (tag: string) => void;
  /** Termin antippen: ansehen – und fürs Team ändern oder löschen */
  onOeffnen?: (t: Termin) => void;
  /** Nur wer Termine eintragen darf: Knopf „＋ Termin“ in der Tageszeile, legt am gewählten Tag an */
  onNeu?: (tag: string) => void;
  /** Meldet nach oben, welcher Tag gerade gewählt ist – der Events-Reiter blendet
   *  dann die „Deine Schichten“-Tickets dieses Tages aus (steht schon hier). */
  onTag?: (tag: string) => void;
}) {
  const { termine: stufenTermine, meineKomitees, meineStudentIds, ready, neueTermine } = useTermine();
  // Testphase: eigene Termine aus dem Handy-Kalender grau dazu (nur Testkonten).
  // Solange KALENDER_SYNC_AN (lib/kalender-sync.ts) aus ist, ist kalenderDemo
  // immer false – dann gibt es weder den Einstieg noch die grauen Termine.
  const kalenderDemo = useKalenderDemo();
  const privat = usePrivatTermine(kalenderDemo);
  const termine = useMemo(
    () => (privat.termine.length ? [...stufenTermine, ...privat.termine] : stufenTermine),
    [stufenTermine, privat.termine],
  );
  const [syncOffen, setSyncOffen] = useState(false);
  // Das früheste Neue – dorthin springt der Hinweis
  const erstesNeues = useMemo(
    () => termine.filter((t) => neueTermine.has(t.id) && !t.aktion_id).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null,
    [termine, neueTermine],
  );
  const neueOhneAktion = useMemo(
    () => termine.filter((t) => neueTermine.has(t.id) && !t.aktion_id).length,
    [termine, neueTermine],
  );
  const heute = heuteKey();
  const [woStart, setWoStart] = useState(() => montagVon(heute));
  const [gewaehlt, setGewaehltIntern] = useState(heute);
  // Jede Änderung des gewählten Tags auch nach oben melden (und beim Start)
  const setGewaehlt = (k: string) => {
    setGewaehltIntern(k);
    onTag?.(k);
  };
  useEffect(() => {
    onTag?.(heute);
    // nur einmal beim Start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tage = useMemo(
    () => Array.from({ length: 7 }, (_, i) => plusTage(woStart, i)),
    [woStart],
  );
  const desTages = anTag(termine, gewaehlt);

  const meins = (t: Termin) => betrifftMich(t, meineKomitees, meineStudentIds);
  const st = useSchichtStatus();

  const [richtung, setRichtung] = useState(0);
  function woche(richtung: number) {
    setRichtung(richtung);
    const neu = plusTage(woStart, richtung * 7);
    setWoStart(neu);
    // Beim Blättern den ersten Tag der Woche zeigen, außer die aktuelle
    // Woche ist gemeint – dann bleibt heute stehen.
    setGewaehlt(neu === montagVon(heute) ? heute : neu);
  }

  // Wochen auch per Wischen über die Tagesleiste
  const { handler: wischen, zug } = useWischen(woche);

  const monatBeschriftung = () => {
    const a = ausKey(tage[0]);
    const b = ausKey(tage[6]);
    const kurz = (d: Date) => d.toLocaleDateString("de-DE", { month: "long" });
    return a.getMonth() === b.getMonth()
      ? `${kurz(a)} ${a.getFullYear()}`
      : `${kurz(a).slice(0, 3)}–${kurz(b).slice(0, 3)} ${b.getFullYear()}`;
  };
  const dieseWoche = woStart === montagVon(heute);
  // Heute ohne Eintrag und ohne „+ Termin“ (Schüler, Vorsitz): der Tagesblock
  // fällt ganz weg. „HEUTE · nichts eingetragen“ sagte nur, was der blaue
  // Kreis ohne Punkt schon zeigt – und schob am Handy das erste „Eintragen“
  // um 65 px nach unten (Prüfung Okt. 2026: am iPhone SE unter dem Rand).
  // Andere Tage, Tage mit Einträgen und das Team („+ Termin“) behalten ihn.
  const ohneTagesblock = ready && !onNeu && gewaehlt === heute && desTages.length === 0;

  return (
    <section className="card mb-5 overflow-hidden p-3 sm:p-4" data-tour="wochenstreifen">
      {/* ------------------------------------------------ Kopfzeile
          Nur Titel, Blättern und „Kalender“ – so bleibt „Diese Woche“ immer
          ganz lesbar. „Termin eintragen“ (Team) steht unten in der Tageszeile,
          direkt bei dem Tag, für den es gilt. */}
      <div className="mb-1 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate pl-1 text-[17px] font-bold tracking-[-0.02em] max-[339px]:text-[16px]">
          {dieseWoche ? "Diese Woche" : monatBeschriftung()}
        </h2>
        <button
          onClick={() => woche(-1)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand transition active:scale-90 active:bg-black/[0.04] max-[379px]:w-9 max-[379px]:after:absolute max-[379px]:after:inset-y-0 max-[379px]:after:-inset-x-1 max-[379px]:after:content-[''] dark:active:bg-white/[0.06]"
          aria-label="Woche zurück"
        >
          <span className="block rotate-180">
            <Icon name="chevron" size={20} strich={2.4} />
          </span>
        </button>
        <button
          onClick={() => woche(1)}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand transition active:scale-90 active:bg-black/[0.04] max-[379px]:w-9 max-[379px]:after:absolute max-[379px]:after:inset-y-0 max-[379px]:after:-inset-x-1 max-[379px]:after:content-[''] dark:active:bg-white/[0.06]"
          aria-label="Woche vor"
        >
          <Icon name="chevron" size={20} strich={2.4} />
        </button>
        {/* Beschriftung steht immer dabei. Ein Kalender-Icon allein sagt nicht,
            dass dahinter Monat, Woche und Tag stecken. */}
        <button
          onClick={() => onKalender(gewaehlt)}
          className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-3 text-[14px] font-semibold text-brand-dark max-[379px]:gap-1 max-[379px]:px-2.5 transition active:scale-95 dark:bg-brand/20 dark:text-brand-dark"
          aria-label="Ganzen Kalender öffnen"
          title="Ganzen Kalender öffnen – Monat, Woche und Tag"
        >
          {/* unter 360 px ohne Symbol – sonst blieb für „Diese Woche“ kein Platz */}
          <span className="max-[359px]:hidden">
            <Icon name="kalender" size={16} />
          </span>
          Kalender
          {neueTermine.size > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[12px] font-bold text-white">
              {neueTermine.size > 9 ? "9+" : neueTermine.size}
            </span>
          )}
        </button>
      </div>

      {/* Testphase: Kalender-Verbindung, nur für die Testkonten – zurzeit aus
          (KALENDER_SYNC_AN in lib/kalender-sync.ts, Wunsch 14.10.2026). */}
      {kalenderDemo && (
        <button
          onClick={() => setSyncOffen(true)}
          className="mb-2.5 flex w-full items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-left text-[13px] font-semibold text-brand dark:text-brand-dark transition active:scale-[0.99] dark:bg-brand/20"
        >
          <span className="min-w-0 flex-1 truncate">
            {privat.termine.length
              ? `Kalender verbunden · ${privat.termine.length} eigene Termine`
              : "Stufen-Termine ins Handy übernehmen"}
          </span>
          <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[12px] font-bold">Test</span>
        </button>
      )}
      {kalenderDemo && <KalenderSyncSheet open={syncOffen} onClose={() => setSyncOffen(false)} />}

      {/* Neu dazugekommen? Dann ein Tipp direkt dorthin. Schichten einer Aktion
          stehen schon unter „Mitmachen“ – die melden wir hier nicht noch einmal. */}
      {erstesNeues && (
        <button
          onClick={() => onKalender(erstesNeues.datum)}
          className="mb-2.5 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-left text-[13px] font-semibold text-red-700 transition active:scale-[0.99] dark:text-red-300"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="min-w-0 flex-1 leading-snug">
            {neueOhneAktion === 1
              ? `Neu: ${erstesNeues.titel} · ${tagLang(erstesNeues.datum)}`
              : `${neueOhneAktion} neue Termine – ab ${tagLang(erstesNeues.datum)}`}
          </span>
          <span className="shrink-0">ansehen ›</span>
        </button>
      )}

      {/* ------------------------------------------------ sieben Tage
          Wie die Wochenleiste im iOS-Kalender: Wochentag klein, Zahl groß,
          gewählter Tag als gefüllter Kreis, heute in Blau. */}
      <div
        {...wischen}
        key={woStart}
        className={`grid touch-pan-y grid-cols-7 gap-0.5 ${richtung > 0 ? "animate-vonRechts" : richtung < 0 ? "animate-vonLinks" : ""}`}
        style={zug ? { transform: `translateX(${zug}px)` } : undefined}
      >
        {tage.map((k) => {
          const liste = anTag(termine, k);
          const istHeute = k === heute;
          const aktiv = k === gewaehlt;
          const tag = ausKey(k);
          const fuerMich = liste.some(meins);
          const ferien = freiAn(termine, k);
          return (
            <button
              key={k}
              onClick={() => setGewaehlt(k)}
              title={ferien ? ferien.titel : undefined}
              aria-pressed={aktiv}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-95 ${
                ferien && !aktiv ? farbeVon(ferien)?.band ?? "bg-emerald-200/60 dark:bg-emerald-500/20" : ""
              }`}
            >
              <span className={`text-[12px] font-semibold ${istHeute ? "text-brand" : "text-tinte-leise"}`}>
                {WOCHENTAGE[(tag.getDay() + 6) % 7]}
              </span>
              <span
                className={`zahl flex h-9 w-9 items-center justify-center rounded-full text-[17px] font-semibold leading-none transition duration-200 ease-ios ${
                  aktiv
                    ? istHeute
                      ? "bg-brand text-white"
                      : "bg-tinte text-white dark:bg-slate-100 dark:text-black"
                    : istHeute
                      ? "text-brand"
                      : ""
                }`}
              >
                {tag.getDate()}
              </span>
              {/* Punkte: höchstens drei, damit die Spalte schmal bleibt */}
              <span className="flex h-1.5 items-center gap-0.5">
                {liste.filter((t) => !t.frei).slice(0, 3).map((t) => (
                  <span
                    key={t.id}
                    className={`h-1.5 w-1.5 rounded-full ${neueTermine.has(t.id) ? "bg-red-500" : punktKlasse(t, meins(t), st(t))}`}
                  />
                ))}
              </span>
              {fuerMich && <span className="sr-only">betrifft dich</span>}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------ der gewählte Tag */}
      {!ohneTagesblock && (
        <div className="mt-2.5 border-t border-black/[0.08] pt-2.5 dark:border-white/[0.1]">
          <div className="mb-1 flex min-h-[44px] items-center justify-between gap-2 px-1">
            <span className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.02em] text-tinte-leise">
              {gewaehlt === heute ? "Heute" : tagLang(gewaehlt)}
              {/* Leerer Tag heute (gibt es hier nur noch fürs Team, siehe
                  ohneTagesblock): in derselben Zeile statt einer eigenen darunter.
                  Andere Tage („DI, 21. OKTOBER“ + „Heute“-Knopf) hätten dafür
                  keinen Platz – dort bleibt die eigene Zeile. Neben „+ Termin“
                  reicht der Platz erst ab 360 px. */}
              {ready && desTages.length === 0 && gewaehlt === heute && (
                <span className="font-normal normal-case tracking-normal max-[359px]:hidden"> · nichts eingetragen</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {gewaehlt !== heute && (
                <button
                  onClick={() => {
                    setWoStart(montagVon(heute));
                    setGewaehlt(heute);
                  }}
                  className="btn-klein-grau"
                >
                  Heute
                </button>
              )}
              {/* Team: Termin am gewählten Tag – beschriftet, damit klar ist, was das „＋“ tut */}
              {onNeu && (
                <button
                  onClick={() => onNeu(gewaehlt)}
                  className="btn-klein"
                  aria-label="Termin am gewählten Tag eintragen"
                  title="Termin am gewählten Tag eintragen"
                >
                  <Icon name="plus" size={14} strich={2.6} />
                  Termin
                </button>
              )}
            </span>
          </div>

          {!ready ? (
            <div className="py-2">
              <SkelettText zeilen={2} />
            </div>
          ) : desTages.length === 0 ? (
            gewaehlt !== heute ? (
              <div className="px-1 py-2.5 text-[14px] text-tinte-leise">Nichts eingetragen.</div>
            ) : (
              // heute leer, Team: unter 360 px passt der Hinweis nicht neben „+ Termin“
              <div className="px-1 py-2.5 text-[14px] text-tinte-leise min-[360px]:hidden">Nichts eingetragen.</div>
            )
          ) : (
            <ul className="grid">
              {desTages.map((t) => (
                <TerminZeile key={t.id} t={t} meins={meins(t)} status={st(t)} onClick={onOeffnen ? () => onOeffnen(t) : undefined} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Eine Zeile wie im iOS-Kalender: farbiger Strich links, Uhrzeit, Titel, Ort.
 * Keine grau gefüllten Kästen – die Farbe des Termins steckt im Strich.
 */
export function TerminZeile({
  t, meins, status = null, onClick,
}: {
  t: Termin;
  meins: boolean;
  /** Schicht: bekommen / gemeldet / nicht bekommen */
  status?: SchichtStatus;
  onClick?: () => void;
}) {
  // Farbe des Strichs: Schicht bekommen = Grün, für mich = Blau, sonst die
  // Terminfarbe; eigene Handy-Termine gestrichelt.
  const strich = t.privat
    ? "border-l-2 border-dashed border-tinte-leise/60"
    : status === "eingeteilt"
      ? "bg-emerald-500"
      : meins
        ? "bg-brand"
        : farbeVon(t)?.punkt ?? (istKlausur(t) ? "bg-tinte dark:bg-slate-200" : "bg-tinte-leise/50");
  const inhalt = (
    <>
      <span aria-hidden className={`w-[3px] shrink-0 self-stretch rounded-full ${strich}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight">
          {t.privat ? (
            <span className="mr-1" aria-hidden>📱</span>
          ) : t.icon ? (
            <Zeichen icon={t.icon} klein />
          ) : (
            t.sichtbar === "komitee" && t.tags[0] && (
              <span className="mr-1">{committeeIcon(t.tags[0])}</span>
            )
          )}
          {t.titel}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-tinte-leise">
          {[
            t.von ? zeitText(t) : "ganztägig",
            t.ort,
            t.privat
              ? "dein Kalender"
              : t.plaetze
                ? `${t.personen.length}/${t.plaetze} eingeteilt`
                : umfangText(t, committeeLabel),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {status ? (
        <SchichtSchild status={status} klein />
      ) : (
        meins && (
          <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand-dark dark:bg-brand/20 dark:text-brand-dark">
            für dich
          </span>
        )
      )}
      {onClick && <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise/70">›</span>}
    </>
  );

  const klasse = `flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left ${status === "nicht" ? "opacity-60" : ""}`;

  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className={`${klasse} transition active:bg-black/[0.04] dark:active:bg-white/[0.06]`}>
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
