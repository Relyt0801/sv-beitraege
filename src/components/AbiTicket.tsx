import { useFunktionen } from "../lib/funktionen";
import { AusHinweis } from "./Funktionen";
import { useEffect, useState } from "react";
import type { Abiball, Settings, Student } from "../lib/types";
import { abiballVon, bestellBetrag, ticketPreise } from "../lib/logic";
import {
  bestellNummer,
  countdown,
  euroAusCent,
  useJetzt,
  useTicketBestellungen,
  verkaufStatus,
  type TicketBestellung,
} from "../lib/tickets";
import { KontoTab, jahrgangKurz } from "./KontoTab";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Symbol, Zeile } from "./Liste";
import { Icon } from "./Icon";
import { StaffelKacheln } from "./Staffel";

/**
 * Das Abiball-Ticket – personalisiert, so wie es später auch aussehen soll.
 *
 * Auf dem eigenen Ticket steht der Listenpreis (Grundpreis + Aufschlag
 * bei 0 %) durchgestrichen und darunter, was es bei diesem Stand wirklich
 * kostet. Das zweite Ticket (schwarz-gold) zeigt den Preis für jedes weitere –
 * Eltern und Gäste. Rechts daneben (am Handy darunter) liegt die Kasse.
 */

const SERIF = { fontFamily: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif' };
const GOLD_TEXT = "bg-gradient-to-b from-[#FBE7A1] via-[#E2B744] to-[#B8860B] bg-clip-text text-transparent";
const GOLD = "#E2B744";

/** „Sa., 26. Juni 2027“ */
function tagSchoen(d: string | null): string | null {
  if (!d) return null;
  const t = new Date(`${d.slice(0, 10)}T12:00`);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

/** Fürs Ticket kurz: „Sa., 26.06.2027 · 19:00“ – Uhrzeit nur, wenn angegeben. */
export function abiballWann(a: Abiball): string | null {
  if (!a.datum) return null;
  const t = new Date(`${a.datum.slice(0, 10)}T12:00`);
  if (Number.isNaN(t.getTime())) return null;
  const tag = t.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  return a.uhrzeit ? `${tag} · ${a.uhrzeit}` : tag;
}

/** Zeitpunkt (ISO mit Zeitzone) in Ortszeit: „Fr., 10. Oktober 2026 · 18:00 Uhr“ */
export function zeitpunktSchoen(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return `${t.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })} · ${t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

function jahrVon(d: string | null): string {
  if (!d) return "";
  const j = d.slice(0, 4);
  return /^\d{4}$/.test(j) ? ` ${j}` : "";
}

// ================================================================ Ticket

export function AbiTicket({
  art,
  student,
  settings,
  prozent,
  onClick,
  klein,
  fuerEltern,
}: {
  art: "erstes" | "weiteres";
  student: Student;
  settings: Settings;
  prozent: number;
  onClick?: () => void;
  klein?: boolean;
  fuerEltern?: boolean;
}) {
  const p = ticketPreise(prozent, settings);
  const a = abiballVon(settings);
  const erstes = art === "erstes";
  const wann = abiballWann(a);
  const Tag = onClick ? "button" : "div";

  // Kerben der Perforation in der Farbe der Karte, auf der das Ticket liegt
  const kerbe = "absolute left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-white dark:bg-slate-900";

  return (
    <Tag
      onClick={onClick}
      aria-label={onClick ? (erstes ? "Abiball-Ticket ansehen" : "Gäste-Ticket ansehen") : undefined}
      className={`group relative flex w-full overflow-hidden text-left text-white ring-1 ring-[#E2B744]/45 transition duration-300 ${
        onClick ? "active:scale-[.985] sm:hover:-translate-y-0.5" : ""
      } ${klein ? "rounded-[18px]" : "rounded-[22px]"} ${
        erstes ? "shadow-[0_10px_30px_-10px_rgba(10,25,60,.55)]" : "shadow-[0_10px_30px_-12px_rgba(0,0,0,.6)]"
      }`}
      style={{
        background: erstes
          ? "radial-gradient(120% 140% at 0% 0%, #23467F 0%, #12284D 45%, #0A1730 100%)"
          : "radial-gradient(120% 140% at 0% 0%, #2A2622 0%, #141210 50%, #050505 100%)",
      }}
    >
      {/* feines Guilloche-Muster wie auf Wertpapieren */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${erstes ? "opacity-[0.16]" : "opacity-[0.2]"}`}
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 85% 120%, transparent 0 9px, currentColor 9px 10px), repeating-radial-gradient(circle at -10% -30%, transparent 0 13px, currentColor 13px 14px)",
          color: GOLD,
          maskImage: "linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.25))",
          WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.25))",
        }}
      />
      {/* goldene Kante oben beim Gäste-Ticket */}
      {!erstes && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E2B744]/80 to-transparent" />}
      {/* Glanz, der beim Drüberfahren über das Ticket wandert */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-y-6 -left-1/3 w-1/4 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[520%]"
      />

      {/* ------------------------------------------ linker Teil */}
      <div className={`relative min-w-0 flex-1 ${klein ? "px-4 py-3" : "px-4 py-4 sm:px-5"}`}>
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[#E9C460]">
          <span aria-hidden>✦</span> Abiball{jahrVon(a.datum)}
        </div>
        <div
          className={`mt-1.5 truncate font-semibold leading-tight tracking-[-0.01em] ${klein ? "text-[18px]" : "text-[21px] sm:text-[23px]"}`}
          style={SERIF}
        >
          {erstes ? `${student.vorname} ${student.nachname}` : "Eltern & Gäste"}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-white/60">
          {erstes ? "Persönliches Ticket · 1. Karte" : "Jedes weitere Ticket"}
        </div>

        {(a.ort || wann) && (
          <div className={`grid gap-0.5 text-white/85 ${klein ? "mt-1.5 text-[12px]" : "mt-2.5 text-[12px]"}`}>
            {wann && (
              <span className="truncate">
                <span aria-hidden className="mr-1.5 text-[#E9C460]">◷</span>
                {wann}
              </span>
            )}
            {a.ort && (
              <span className="truncate">
                <span aria-hidden className="mr-1.5 text-[#E9C460]">⌖</span>
                {a.ort}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------ Perforation */}
      <div aria-hidden className="relative w-0 shrink-0">
        <span className={`${kerbe} -top-2.5`} />
        <span className={`${kerbe} -bottom-2.5`} />
        <span className="absolute inset-y-3 left-0 border-l-[1.5px] border-dashed border-white/25" />
      </div>

      {/* ------------------------------------------ Abriss mit Preis */}
      <div className="relative flex w-[36%] shrink-0 flex-col items-center justify-center px-2 py-3 text-center sm:w-[32%]">
        <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/60">
          {erstes ? (fuerEltern ? "1. Ticket" : "Dein Preis") : "je Karte"}
        </div>
        {!p.preisSteht ? (
          <div className={`mt-0.5 font-semibold ${klein ? "text-[15px]" : "text-[17px]"}`} style={SERIF}>
            Preis folgt
          </div>
        ) : erstes ? (
          <>
            {p.standard > p.erstes && (
              <div className="zahl mt-0.5 text-[13px] font-semibold text-white/50 line-through decoration-[#E2B744]/80 decoration-2">
                {p.standard} €
              </div>
            )}
            <div className={`zahl font-extrabold leading-none tracking-[-0.03em] ${GOLD_TEXT} ${klein ? "text-[26px]" : "text-[34px]"}`}>
              {p.erstes}&nbsp;€
            </div>
            {p.gespart > 0 && (
              <div className="mt-1.5 whitespace-nowrap rounded-full bg-[#E2B744]/20 px-2 py-0.5 text-[12px] font-bold text-[#F6DD8B]">
                −{p.gespart} € gespart
              </div>
            )}
          </>
        ) : (
          <div className={`zahl mt-0.5 font-extrabold leading-none tracking-[-0.03em] ${GOLD_TEXT} ${klein ? "text-[26px]" : "text-[30px]"}`}>
            {p.weiteres}&nbsp;€
          </div>
        )}
      </div>
    </Tag>
  );
}

// ================================================================ Kasse

const STATUS_TEXT: Record<TicketBestellung["status"], string> = {
  offen: "Überweisung offen",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
};

/** Kleine Info-Zeile statt großer Kästen */
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl zelle px-3 py-2 text-[12px] text-tinte-matt dark:text-slate-300">
      {children}
    </div>
  );
}

/** Der Verkaufsstand – damit der Bereich weiß, ob rechts eine Kasse steht. */
function useVerkauf(settings: Settings) {
  const a = abiballVon(settings);
  const abMs = a.verkaufAb ? Date.parse(a.verkaufAb) : NaN;
  const jetzt = useJetzt(Number.isFinite(abMs) && abMs > Date.now());
  return { a, abMs, jetzt, status: verkaufStatus(a, jetzt) };
}

/**
 * Die Kasse: vor dem Start grauer Knopf mit Countdown, danach bestellen und
 * überweisen. Eltern bestellen nicht selbst, sehen aber die Bestellungen und
 * können sie bezahlen. Ist der Verkauf nicht freigegeben, gibt es hier nichts.
 */
export function TicketKasse({
  student,
  settings,
  prozent,
  fuerEltern,
}: {
  student: Student;
  settings: Settings;
  prozent: number;
  fuerEltern?: boolean;
}) {
  const { a, abMs, jetzt, status } = useVerkauf(settings);
  const p = ticketPreise(prozent, settings);
  const { liste, verkauft, bestellen } = useTicketBestellungen(true);

  const meine = liste.filter((b) => b.student_id === student.id);
  const aktiv = meine.filter((b) => b.status !== "storniert");
  const schon = aktiv.reduce((n, b) => n + b.anzahl, 0);
  const restPerson = Math.max(0, a.maxProPerson - schon);
  const restGesamt = a.kontingent > 0 ? Math.max(0, a.kontingent - verkauft) : Infinity;
  const moeglich = Math.min(restPerson, restGesamt);

  const [anzahl, setAnzahl] = useState(1);
  const n = Math.max(1, Math.min(anzahl, Math.max(1, moeglich)));
  const betrag = schon === 0 ? bestellBetrag(n, prozent, settings) : n * p.weiteres;
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const [zahlen, setZahlen] = useState<TicketBestellung | null>(null);

  async function los() {
    setBusy(true);
    setFehler("");
    const r = await bestellen(n, { student_id: student.id, betrag_cent: betrag * 100 });
    setBusy(false);
    if (typeof r === "string") setFehler(r);
    else {
      setAnzahl(1);
      setZahlen(r);
    }
  }

  if (status === "aus" && meine.length === 0) return null;

  return (
    <div className="grid content-start gap-2.5">
      {status === "bald" && (
        <div className="rounded-2xl zelle p-4 text-center">
          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-tinte-leise">Verkauf startet in</div>
          <div className="zahl mt-1 text-[1.9rem] font-extrabold leading-none tracking-[-0.02em]">{countdown(abMs - jetzt)}</div>
          <div className="mt-1 text-[12px] text-tinte-leise">{zeitpunktSchoen(a.verkaufAb!)}</div>
          {!fuerEltern && (
            <button
              disabled
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-300 py-3 text-[15px] font-bold text-white dark:bg-slate-700 dark:text-slate-400"
            >
              Bestellen (ab Start möglich)
            </button>
          )}
        </div>
      )}

      {status === "laeuft" && !fuerEltern && (
        <div className="rounded-2xl bg-gradient-to-b from-[#12284D] to-[#0A1730] p-4 text-white ring-1 ring-[#E2B744]/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#E9C460]">Tickets bestellen</span>
            {a.kontingent > 0 && (
              <span className="text-[12px] font-semibold text-white/60">noch {Math.max(0, a.kontingent - verkauft)} frei</span>
            )}
          </div>

          {!p.preisSteht ? (
            <div className="mt-2 text-[13px] text-white/75">Preis steht noch nicht fest.</div>
          ) : moeglich <= 0 ? (
            <div className="mt-2 text-[13px] text-white/75">
              {restPerson <= 0 ? `Höchstens ${a.maxProPerson} je Person – du hast alle.` : "Alle Tickets sind vergeben."}
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center rounded-full bg-white/10 p-1">
                  <button
                    onClick={() => setAnzahl(Math.max(1, n - 1))}
                    disabled={n <= 1}
                    aria-label="Ein Ticket weniger"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold transition active:scale-90 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="zahl w-8 text-center text-[19px] font-extrabold" aria-live="polite">{n}</span>
                  <button
                    onClick={() => setAnzahl(Math.min(moeglich, n + 1))}
                    disabled={n >= moeglich}
                    aria-label="Ein Ticket mehr"
                    className="flex h-11 w-11 items-center justify-center rounded-full text-xl font-bold transition active:scale-90 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <div className="text-right">
                  <div className={`zahl text-[1.7rem] font-extrabold leading-none ${GOLD_TEXT}`}>{betrag} €</div>
                  <div className="mt-0.5 text-[12px] text-white/55">
                    {schon === 0 ? (n > 1 ? `${p.erstes} € + ${n - 1} × ${p.weiteres} €` : "dein 1. Ticket") : `${n} × ${p.weiteres} €`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => void los()}
                disabled={busy}
                className="mt-3 w-full rounded-2xl bg-gradient-to-b from-[#F6DD8B] to-[#D9A92B] py-3 text-[15px] font-extrabold text-[#2B1F00] shadow-[0_6px_18px_-6px_rgba(217,169,43,.7)] transition active:scale-[.98] disabled:opacity-50"
              >
                {busy ? "Einen Moment …" : `${n} ${n === 1 ? "Ticket" : "Tickets"} bestellen`}
              </button>
              <div className="mt-1.5 text-center text-[12px] text-white/50">
                Max. {a.maxProPerson} je Person{schon > 0 ? ` · du hast ${schon}` : ""}
              </div>
            </>
          )}
          {fehler && <p className="mt-2 text-center text-[12px] font-semibold text-red-300">Das hat nicht geklappt: {fehler}</p>}
        </div>
      )}

      {status === "laeuft" && fuerEltern && aktiv.length === 0 && (
        <Info>Verkauf läuft – {student.vorname} bestellt über den eigenen Zugang.</Info>
      )}

      {meine.length > 0 && (
        <div className="overflow-hidden rounded-2xl zelle">
          <div className="px-4 pb-1 pt-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tinte-leise">
            {fuerEltern ? `Bestellungen von ${student.vorname}` : "Deine Bestellungen"}
          </div>
          {meine.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-t border-black/[0.05] px-4 py-2.5 first:border-0 dark:border-white/[0.06]">
              <div className="min-w-0 flex-1">
                <div className={`text-[14px] font-semibold ${b.status === "storniert" ? "text-tinte-leise line-through" : ""}`}>
                  {b.anzahl} {b.anzahl === 1 ? "Ticket" : "Tickets"} · {euroAusCent(b.betrag_cent)}
                </div>
                <div
                  className={`text-[12px] font-semibold ${
                    b.status === "bezahlt" ? "text-bezahlt" : b.status === "offen" ? "text-offen" : "text-tinte-leise"
                  }`}
                >
                  {b.status === "bezahlt" ? "✓ " : ""}
                  {STATUS_TEXT[b.status]} · {bestellNummer(b)}
                </div>
              </div>
              {b.status === "offen" && (
                <button
                  onClick={() => setZahlen(b)}
                  className="btn-klein shrink-0"
                >
                  Überweisen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {zahlen && <TicketUeberweisen bestellung={zahlen} student={student} settings={settings} du={!fuerEltern} onClose={() => setZahlen(null)} />}
    </div>
  );
}

/** Überweisen einer Bestellung: Betrag, Kontodaten und eigener Verwendungszweck. */
export function TicketUeberweisen({
  bestellung,
  student,
  settings,
  du,
  onClose,
}: {
  bestellung: TicketBestellung;
  student: Student;
  settings: Settings;
  du: boolean;
  onClose: () => void;
}) {
  const zweck = `Abiball ${student.nachname}, ${student.vorname} ${jahrgangKurz(settings.aktuelles_halbjahr)} ${bestellNummer(bestellung)}`;
  return (
    <Sheet open onClose={onClose}>
      <SheetKopf
        titel="Tickets überweisen"
        unter={`${bestellung.anzahl} ${bestellung.anzahl === 1 ? "Ticket" : "Tickets"} · ${bestellNummer(bestellung)}`}
        onClose={onClose}
      />
      <div className="mb-4 flex flex-col items-center rounded-2xl bg-gradient-to-b from-[#12284D] to-[#0A1730] px-4 py-5 text-center text-white ring-1 ring-[#E2B744]/40">
        <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#E9C460]">Zu überweisen</div>
        <div className={`zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] ${GOLD_TEXT}`}>
          {euroAusCent(bestellung.betrag_cent)}
        </div>
      </div>
      <KontoTab
        personen={[student]}
        du={du}
        zweck={zweck}
        betrag={euroAusCent(bestellung.betrag_cent)}
        hinweis="Bitte genau diesen Verwendungszweck angeben."
      />
    </Sheet>
  );
}

// ================================================================ Ansicht

/** Die Ticket-Ansicht: großes Ticket, darunter Preis und Abiball wie überall in der App gruppiert. */
function TicketAnsicht({
  student,
  settings,
  prozent,
  fuerEltern,
  onClose,
}: {
  student: Student;
  settings: Settings;
  prozent: number;
  fuerEltern?: boolean;
  onClose: () => void;
}) {
  const p = ticketPreise(prozent, settings);
  const a = abiballVon(settings);
  const wert = (t: string, klasse = "") => <span className={`zahl text-[15px] font-semibold ${klasse}`}>{t}</span>;
  return (
    <Sheet open onClose={onClose}>
      <SheetKopf titel={fuerEltern ? `Ticket von ${student.vorname}` : "Dein Abiball-Ticket"} onClose={onClose} />
      <AbiTicket art="erstes" student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />

      <Gruppe titel="1. Ticket">
        <Zeile label="Grundpreis">{wert(p.preisSteht ? `${p.grund} €` : "folgt", "text-tinte-matt dark:text-slate-300")}</Zeile>
        <Zeile label={`Aufschlag bei ${Math.min(prozent, 100)} % Mithilfe`}>{wert(`+${p.aufschlag} €`, "text-tinte-matt dark:text-slate-300")}</Zeile>
        {a.ueber100 && (
          <Zeile label="✦ Bonus">{wert(p.rabatt > 0 ? `−${p.rabatt} €` : "0 €", "text-[#8A650A] dark:text-[#E9C460]")}</Zeile>
        )}
        {/* Steht der Grundpreis noch nicht fest, gibt es auch keinen Endpreis –
            „Preis +50 €“ las sich wie ein Endpreis (Prüfung Okt. 2026). */}
        <Zeile
          label="Preis"
          unter={
            p.preisSteht
              ? undefined
              : p.aufschlag - p.rabatt > 0
                ? `Grundpreis + ${p.aufschlag - p.rabatt} € Aufschlag`
                : "nur der Grundpreis, kein Aufschlag"
          }
        >
          <span className="zahl text-[17px] font-extrabold">{p.preisSteht ? `${p.erstes} €` : "folgt"}</span>
        </Zeile>
      </Gruppe>

      <Gruppe titel="Weitere Tickets">
        <Zeile label="Eltern & Gäste, je Karte">{wert(p.preisSteht ? `${p.weiteres} €` : "folgt")}</Zeile>
      </Gruppe>

      {(a.datum || a.ort) && (
        <Gruppe titel="Abiball">
          {a.datum && <Zeile label="Tag">{wert(tagSchoen(a.datum) || "", "text-tinte-matt dark:text-slate-300")}</Zeile>}
          {a.uhrzeit && <Zeile label="Uhrzeit">{wert(`${a.uhrzeit} Uhr`, "text-tinte-matt dark:text-slate-300")}</Zeile>}
          {a.ort && <Zeile label="Ort">{wert(a.ort, "text-tinte-matt dark:text-slate-300")}</Zeile>}
        </Gruppe>
      )}

      <div className="mt-4">
        <TicketKasse student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />
      </div>
    </Sheet>
  );
}

// ================================================================ Eltern

/** Kleines Ticket-Symbol für Zeilen: Nachtblau mit goldenem Funken wie das Ticket selbst */
function TicketSymbol() {
  return (
    <Symbol farbe="bg-gradient-to-br from-[#23467F] to-[#0A1730] !text-[#E9C460] ring-1 ring-inset ring-[#E2B744]/45">
      <Icon name="funke" size={16} strich={2.2} />
    </Symbol>
  );
}

/**
 * Eltern-Übersicht: das Ticket EINES Kindes als Zeile in dessen Karte (eine
 * `gruppe-zellen`) – „Abiball-Ticket · Preis“, darunter der Stand. Ein Tipp
 * öffnet die Ticket-Ansicht mit dem großen Ticket. Offene Bestellungen stehen
 * als eigene Zeile mit „Überweisen“ darunter – das ist das, was Eltern tun.
 *
 * Prüfung Okt. 2026: Vorher stand bei jedem Kind eine eigene Ticket-Karte mit
 * großer Grafik „Preis folgt“ und beim ersten Kind zusätzlich das Gäste-
 * Ticket – zusammen über einen Bildschirm, das zweite Kind kam erst nach 1,5
 * Bildschirmen. Was für alle gilt (Gäste-Ticket, Countdown, Staffel), steht
 * jetzt EINMAL in `TicketFamilie`.
 */
export function TicketZeilen({ student, settings, prozent }: { student: Student; settings: Settings; prozent: number }) {
  const { sichtbar } = useFunktionen();
  const zeigen = sichtbar("abiball");
  const [auf, setAuf] = useState(false);
  const [zahlen, setZahlen] = useState<TicketBestellung | null>(null);
  const a = abiballVon(settings);
  const abMs = a.verkaufAb ? Date.parse(a.verkaufAb) : NaN;
  // Kein Countdown in der Zeile – nur der Wechsel „bald“ → „läuft“ zählt
  const jetzt = useJetzt(Number.isFinite(abMs) && abMs > Date.now(), 30_000);
  const status = verkaufStatus(a, jetzt);
  const { liste } = useTicketBestellungen(zeigen);
  if (!zeigen) return null;

  const p = ticketPreise(prozent, settings);
  const aktiv = liste.filter((b) => b.student_id === student.id && b.status !== "storniert");
  const offene = aktiv.filter((b) => b.status === "offen");
  const anzahl = aktiv.reduce((n, b) => n + b.anzahl, 0);
  const stand =
    anzahl > 0
      ? `${anzahl} ${anzahl === 1 ? "Ticket" : "Tickets"} bestellt · ${offene.length ? "Überweisung offen" : "bezahlt"}`
      : status === "laeuft"
        ? `Verkauf läuft – ${student.vorname} bestellt selbst`
        : status === "bald"
          ? `Verkauf ab ${zeitpunktSchoen(a.verkaufAb!)}`
          : "Verkauf noch nicht gestartet";

  return (
    <>
      <Zeile symbol={<TicketSymbol />} label="Abiball-Ticket" unter={stand} onClick={() => setAuf(true)}>
        <span className="zahl text-[15px] font-semibold text-tinte-matt dark:text-slate-300">{p.preisSteht ? `${p.erstes} €` : "Preis folgt"}</span>
      </Zeile>
      {offene.map((b) => (
        // Eingerückt bis zum Text der Ticket-Zeile darüber (16 + 30 + 12 px) –
        // so gehört die Bestellung sichtbar zum Ticket
        <div key={b.id} className="flex min-h-[52px] items-center gap-3 py-2 pl-[58px] pr-4 before:!left-[58px]">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-snug">
              {b.anzahl} {b.anzahl === 1 ? "Ticket" : "Tickets"} · {euroAusCent(b.betrag_cent)}
            </span>
            <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-offen">Überweisung offen · {bestellNummer(b)}</span>
          </span>
          <button
            onClick={() => setZahlen(b)}
            className="btn-klein min-h-[44px] shrink-0"
            aria-label={`${b.anzahl} ${b.anzahl === 1 ? "Ticket" : "Tickets"} für ${student.vorname} überweisen`}
          >
            Überweisen
          </button>
        </div>
      ))}
      {auf && <TicketAnsicht student={student} settings={settings} prozent={prozent} fuerEltern onClose={() => setAuf(false)} />}
      {zahlen && <TicketUeberweisen bestellung={zahlen} student={student} settings={settings} du={false} onClose={() => setZahlen(null)} />}
    </>
  );
}

/**
 * Eltern-Übersicht: was für die ganze Familie gilt, EINMAL – das Ticket für
 * Eltern & Gäste, der Verkaufsstand (mit Countdown) und die Staffel, in der
 * bei Geschwistern jedes Kind mit Vornamen an seiner Stufe steht.
 *
 * Vorher stand das Gäste-Ticket nur in der Karte des ersten Kindes (wirkte
 * wie dessen Ticket, die Spalten waren ungleich hoch) und die Staffel bei
 * jedem Kind einzeln.
 *
 * `breit`: Die Karte geht über die volle Breite (Geschwister) – ab 700 px dann
 * Ticket links, Staffel rechts. Bei einem Kind steht sie neben dessen Karte.
 */
export function TicketFamilie({
  settings,
  kinder,
  breit,
}: {
  settings: Settings;
  kinder: { student: Student; prozent: number }[];
  breit?: boolean;
}) {
  const { sichtbar } = useFunktionen();
  const zeigen = sichtbar("abiball");
  const { a, abMs, jetzt, status } = useVerkauf(settings);
  const erstes = kinder[0];
  if (!erstes) return null;
  const mehrere = kinder.length > 1;

  return (
    <section className="card p-4 sm:p-5" aria-label="Abiball-Tickets">
      <AusHinweis funktion="abiball" className="mb-2" />
      <h2 className="text-[15px] font-semibold">{zeigen ? "Abiball-Tickets" : "Mithilfe senkt den Ticketpreis"}</h2>
      {/* Am Laptop behält das Ticket Ticket-Maße (vorher ~780 px breit gezogen) */}
      <div
        className={`grid ${zeigen && breit ? "min-[700px]:grid-cols-2 min-[700px]:items-start min-[700px]:gap-x-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-x-10" : ""}`}
      >
        {zeigen && (
          <div className="mt-3 grid content-start gap-2.5">
            {/* Das Ticket der Eltern selbst: hängt von keinem Kind ab */}
            <AbiTicket art="weiteres" student={erstes.student} settings={settings} prozent={erstes.prozent} klein />
            <Info>
              {status === "bald" ? (
                <span>
                  Verkauf startet in <b className="zahl font-bold text-tinte dark:text-slate-100">{countdown(abMs - jetzt)}</b> ·{" "}
                  {zeitpunktSchoen(a.verkaufAb!)}
                </span>
              ) : status === "laeuft" ? (
                <span>
                  Verkauf läuft – {mehrere ? "jedes Kind bestellt" : `${erstes.student.vorname} bestellt`} über den eigenen Zugang, auch die
                  Karten für Eltern & Gäste.
                </span>
              ) : (
                <span>Der Verkauf ist noch nicht gestartet.</span>
              )}
            </Info>
          </div>
        )}
        <StaffelKacheln
          pct={erstes.prozent}
          settings={settings}
          kinder={mehrere ? kinder.map((k) => ({ name: k.student.vorname, pct: k.prozent })) : undefined}
          className={zeigen && breit ? "mt-4 min-[700px]:mt-3" : zeigen ? "mt-4" : "mt-2"}
        />
      </div>
    </section>
  );
}

// ================================================================ Bereich

/**
 * Der Ticket-Bereich auf der eigenen Seite (und bei den Eltern). Links die
 * Tickets, rechts die Kasse – die gibt es erst, wenn der Verkauf freigegeben
 * ist; vorher nur eine kleine Info. Eltern sehen ihr Gäste-Ticket zuerst.
 *
 * Prüfung Okt. 2026:
 *   • Vor dem Verkauf standen auf der Übersicht zwei große Tickets mit „Preis
 *     folgt“ über die volle Breite (~300 px ohne Information). Jetzt: nur
 *     das eigene Ticket in klein und eine Zeile – die Karte passt neben
 *     „Mithilfe bei Aktionen“ (davon hängt der Preis ja ab).
 *   • `onMitKasse` sagt der Übersicht, ob rechts eine Kasse steht (dann
 *     braucht der Bereich die volle Breite).
 *   • `ohneGaeste`: Bei mehreren Kindern zeigen Eltern das Gäste-Ticket nur
 *     einmal (es hängt nicht vom Kind ab).
 *   • `eineSpalte`: Steht der Bereich in einer halben Spalte (Geschwister
 *     nebeneinander), kommen Tickets und Kasse untereinander statt gequetscht.
 *   • Die Eltern-Übersicht nutzt seit der Prüfung Okt. 2026 `TicketZeilen` (je
 *     Kind eine Zeile) und `TicketFamilie` (Gäste-Ticket und Staffel einmal).
 */
export function TicketBereich({
  student,
  settings,
  prozent,
  fuerEltern,
  ohneGaeste,
  eineSpalte,
  onMitKasse,
  className = "",
}: {
  student: Student;
  settings: Settings;
  prozent: number;
  fuerEltern?: boolean;
  /** Gäste-Ticket ausblenden (z. B. beim zweiten Kind) */
  ohneGaeste?: boolean;
  /** Tickets und Kasse immer untereinander (schmale Spalte) */
  eineSpalte?: boolean;
  /** Meldet, ob der Verkauf läuft bzw. Bestellungen da sind (rechts die Kasse) */
  onMitKasse?: (mitKasse: boolean) => void;
  className?: string;
}) {
  // Profil → Funktionen: Tickets ganz ausgeblendet (nur wer verwaltet, sieht sie mit Hinweis)
  const { sichtbar } = useFunktionen();
  const zeigen = sichtbar("abiball");
  const [auf, setAuf] = useState(false);
  const { status } = useVerkauf(settings);
  const { liste } = useTicketBestellungen(zeigen);
  const mitKasse = status !== "aus" || liste.some((b) => b.student_id === student.id);
  useEffect(() => {
    onMitKasse?.(zeigen && mitKasse);
  }, [zeigen, mitKasse, onMitKasse]);

  if (!zeigen) return null;
  const p = ticketPreise(prozent, settings);
  // Vor dem Verkauf (nicht bei Eltern): klein und knapp
  const knapp = !mitKasse && !fuerEltern;

  const eigenes = (
    <AbiTicket art="erstes" student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} onClick={() => setAuf(true)} klein={knapp} />
  );
  const gaeste = <AbiTicket art="weiteres" student={student} settings={settings} prozent={prozent} onClick={() => setAuf(true)} klein />;

  return (
    <section className={`card p-4 sm:p-5 ${className}`} data-tour="abiball-ticket">
      <AusHinweis funktion="abiball" className="mb-2" />
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Abiball-Ticket</h2>
        <button onClick={() => setAuf(true)} className="-my-3 -mr-3 flex min-h-[44px] items-center gap-0.5 px-3 text-[14px] font-semibold text-brand-dark dark:text-brand">
          Details <Icon name="chevron" size={14} strich={2.4} />
        </button>
      </div>
      <div className={`mt-3 grid gap-4 ${mitKasse && !eineSpalte ? "md:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)]" : ""}`}>
        <div className="grid content-start gap-2.5">
          {knapp ? (
            <>
              {eigenes}
              {/* Ab iPad steht die Karte neben „Mithilfe“ – dort ist Platz für
                  das Gäste-Ticket, am Handy reicht eine Zeile */}
              {!ohneGaeste && <div className="hidden md:block">{gaeste}</div>}
              <Info>
                {/* EIN Textstück – Info ist eine flex-Zeile, zwei Kinder stünden nebeneinander */}
                <span>
                  Verkauf noch nicht gestartet
                  <span className="md:hidden"> · weitere Tickets: {p.preisSteht ? `je ${p.weiteres} €` : "Preis folgt"}</span>
                </span>
              </Info>
            </>
          ) : fuerEltern ? (
            <>
              {!ohneGaeste && gaeste}
              {eigenes}
            </>
          ) : (
            <>
              {eigenes}
              {!ohneGaeste && gaeste}
            </>
          )}
          {!mitKasse && fuerEltern && <Info>Der Ticketverkauf ist noch nicht gestartet.</Info>}
        </div>
        {mitKasse && <TicketKasse student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />}
      </div>

      {auf && <TicketAnsicht student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} onClose={() => setAuf(false)} />}
    </section>
  );
}
