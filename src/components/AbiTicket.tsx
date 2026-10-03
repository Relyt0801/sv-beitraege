import { useState, type ReactNode } from "react";
import type { Settings, Student } from "../lib/types";
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

/**
 * Das Abiball-Ticket – personalisiert, so wie es später auch aussehen soll.
 *
 * Es ersetzt die alten Texte („Dein erstes Ticket kostet …“): Auf dem Ticket
 * steht der Listenpreis (Grundpreis + voller Helferzuschuss bei 0 %)
 * durchgestrichen und darunter, was es bei diesem Stand wirklich kostet. Das
 * zweite Ticket zeigt den Preis für jedes weitere (Eltern, Gäste).
 *
 * Rechts daneben (bzw. darunter auf dem Handy) liegt die Kasse: bestellen,
 * sobald der Verkauf freigegeben ist, vorher ein grauer Knopf mit Countdown.
 */

const SERIF = { fontFamily: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif' };
const GOLD_TEXT = "bg-gradient-to-b from-[#FBE7A1] via-[#E2B744] to-[#B8860B] bg-clip-text text-transparent";

/** „Sa, 26. Juni 2027 · 19:00 Uhr“ – Uhrzeit nur, wenn eine angegeben ist. */
function datumSchoen(d: string | null): string | null {
  if (!d) return null;
  const mitZeit = d.includes("T");
  const t = new Date(mitZeit ? d : `${d}T12:00`);
  if (Number.isNaN(t.getTime())) return null;
  const tag = t.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  return mitZeit ? `${tag} · ${t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : tag;
}

/** Zeitpunkt (ISO mit Zeitzone) in Ortszeit: „Fr, 10. Oktober 2026 · 18:00 Uhr“ */
export function zeitpunktSchoen(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return `${t.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" })} · ${t.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
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
  fuerEltern?: boolean;
  student: Student;
  settings: Settings;
  prozent: number;
  onClick?: () => void;
  klein?: boolean;
}) {
  const p = ticketPreise(prozent, settings);
  const a = abiballVon(settings);
  const erstes = art === "erstes";
  const datum = datumSchoen(a.datum);
  const Tag = onClick ? "button" : "div";

  // Kerben der Perforation in der Farbe der Karte, auf der das Ticket liegt
  const kerbe = "absolute left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-white dark:bg-slate-900";

  return (
    <Tag
      onClick={onClick}
      aria-label={onClick ? (erstes ? "Dein Abiball-Ticket ansehen" : "Weiteres Ticket ansehen") : undefined}
      className={`group relative flex w-full overflow-hidden text-left transition duration-300 ${
        onClick ? "active:scale-[.985] sm:hover:-translate-y-0.5" : ""
      } ${klein ? "rounded-[18px]" : "rounded-[22px]"} ${
        erstes
          ? "text-white shadow-[0_10px_30px_-10px_rgba(10,25,60,.55)] ring-1 ring-[#E2B744]/45"
          : "text-[#14233F] shadow-[0_6px_20px_-10px_rgba(10,25,60,.35)] ring-1 ring-[#14233F]/10 dark:text-slate-100 dark:ring-white/10"
      }`}
      style={{
        background: erstes
          ? "radial-gradient(120% 140% at 0% 0%, #23467F 0%, #12284D 45%, #0A1730 100%)"
          : undefined,
      }}
    >
      {/* Hintergrund des zweiten Tickets: Perlmutt hell, im Dunkelmodus Graphit */}
      {!erstes && (
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(135deg,#FDFCF8_0%,#EEF1F7_60%,#E3E8F1_100%)] dark:bg-[linear-gradient(135deg,#2C2C2E_0%,#232326_100%)]"
        />
      )}
      {/* feines Guilloche-Muster wie auf Wertpapieren */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${erstes ? "opacity-[0.16]" : "opacity-[0.07] dark:opacity-[0.1]"}`}
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 85% 120%, transparent 0 9px, currentColor 9px 10px), repeating-radial-gradient(circle at -10% -30%, transparent 0 13px, currentColor 13px 14px)",
          color: erstes ? "#E2B744" : "#14233F",
          maskImage: "linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.25))",
          WebkitMaskImage: "linear-gradient(90deg, rgba(0,0,0,.9), rgba(0,0,0,.25))",
        }}
      />
      {/* Glanz, der beim Drüberfahren über das Ticket wandert */}
      {erstes && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-y-6 -left-1/3 w-1/4 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-[520%]"
        />
      )}

      {/* ------------------------------------------ linker Teil */}
      <div className={`relative min-w-0 flex-1 ${klein ? "px-4 py-3" : "px-4 py-4 sm:px-5"}`}>
        <div
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${
            erstes ? "text-[#E9C460]" : "text-[#5B6B87] dark:text-slate-400"
          }`}
        >
          <span aria-hidden>✦</span> Abiball{jahrVon(a.datum)}
        </div>
        <div
          className={`mt-1.5 truncate font-semibold leading-tight tracking-[-0.01em] ${klein ? "text-[17px]" : "text-[21px] sm:text-[23px]"}`}
          style={SERIF}
        >
          {erstes ? `${student.vorname} ${student.nachname}` : "Eltern & Gäste"}
        </div>
        <div className={`mt-0.5 truncate text-[11.5px] ${erstes ? "text-white/60" : "text-[#5B6B87] dark:text-slate-400"}`}>
          {erstes ? "Persönliches Ticket · 1. Karte" : "Jedes weitere Ticket"}
        </div>

        {(a.ort || datum) && !klein && (
          <div className={`mt-2.5 grid gap-0.5 text-[12px] ${erstes ? "text-white/85" : "text-[#2A3B5C] dark:text-slate-300"}`}>
            {datum && (
              <span>
                <span aria-hidden className="mr-1.5 opacity-70">◷</span>
                {datum}
              </span>
            )}
            {a.ort && (
              <span className="truncate">
                <span aria-hidden className="mr-1.5 opacity-70">⌖</span>
                {a.ort}
              </span>
            )}
          </div>
        )}
        {erstes && !klein && (
          <div className="mt-2.5 flex items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-[#E2B744]/60 to-transparent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
              {prozent} % mitgeholfen
            </span>
          </div>
        )}
      </div>

      {/* ------------------------------------------ Perforation */}
      <div aria-hidden className="relative w-0 shrink-0">
        <span className={`${kerbe} -top-2.5`} />
        <span className={`${kerbe} -bottom-2.5`} />
        <span
          className={`absolute inset-y-3 left-0 border-l-[1.5px] border-dashed ${
            erstes ? "border-white/25" : "border-[#14233F]/20 dark:border-white/20"
          }`}
        />
      </div>

      {/* ------------------------------------------ Abriss mit Preis */}
      <div
        className={`relative flex shrink-0 flex-col items-center justify-center text-center ${
          klein ? "w-[36%] px-2 py-3 sm:w-[32%]" : "w-[36%] px-2.5 py-4 sm:w-[32%]"
        }`}
      >
        <div className={`text-[9.5px] font-bold uppercase tracking-[0.18em] ${erstes ? "text-white/55" : "text-[#5B6B87] dark:text-slate-400"}`}>
          {erstes && !fuerEltern ? "Dein Preis" : "Preis"}
        </div>
        {erstes ? (
          p.preisSteht ? (
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
                <div className="mt-1.5 whitespace-nowrap rounded-full bg-[#E2B744]/20 px-2 py-0.5 text-[10.5px] font-bold text-[#F6DD8B]">
                  −{p.gespart} € gespart
                </div>
              )}
            </>
          ) : (
            <>
              <div className={`mt-0.5 font-semibold ${klein ? "text-[15px]" : "text-[17px]"}`} style={SERIF}>
                Preis folgt
              </div>
              <div className="mt-1 text-[10.5px] leading-tight text-white/70">
                Zuschlag{" "}
                {p.aufschlag0 > p.aufschlag && <span className="line-through opacity-60">{p.aufschlag0} €</span>}{" "}
                <b className="text-[#F6DD8B]">{p.aufschlag - p.rabatt} €</b>
              </div>
            </>
          )
        ) : p.preisSteht ? (
          <>
            <div className={`zahl font-extrabold leading-none tracking-[-0.03em] ${klein ? "text-[24px]" : "text-[30px]"}`}>
              {p.weiteres}&nbsp;€
            </div>
            <div className="mt-1.5 text-[10.5px] font-semibold text-[#5B6B87] dark:text-slate-400">je Karte</div>
          </>
        ) : (
          <div className={`mt-0.5 font-semibold ${klein ? "text-[15px]" : "text-[17px]"}`} style={SERIF}>
            Preis folgt
          </div>
        )}
      </div>
    </Tag>
  );
}

// ================================================================ Rechnung

/** So setzt sich der Preis zusammen – wie eine Rechnung, Zeile für Zeile. */
export function TicketRechnung({ settings, prozent, fuerEltern }: { settings: Settings; prozent: number; fuerEltern?: boolean }) {
  const p = ticketPreise(prozent, settings);
  const a = abiballVon(settings);
  const g = (n: number) => (p.preisSteht ? `${n} €` : "folgt");
  return (
    <div className="overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.16)]">
      <RZeile label="Grundpreis" wert={g(p.grund)} />
      {p.aufschlag0 > p.aufschlag && (
        <RZeile label="Helferzuschuss bei 0 %" wert={<span className="text-tinte-leise line-through">+{p.aufschlag0} €</span>} />
      )}
      <RZeile
        label={fuerEltern ? `Helferzuschuss bei ${Math.min(prozent, 100)} %` : `Helferzuschuss bei deinen ${Math.min(prozent, 100)} %`}
        wert={`+${p.aufschlag} €`}
      />
      {a.ueber100 && (
        <RZeile
          label={<span className="text-[#8A650A] dark:text-[#E9C460]">✦ Bonus über 100 %{prozent > 100 ? ` (${prozent} %)` : ""}</span>}
          wert={
            <span className="text-[#8A650A] dark:text-[#E9C460]">
              {p.rabatt > 0 ? `−${p.rabatt} €` : <span className="font-medium opacity-70">bis −{a.bonusRabatt} €</span>}
            </span>
          }
        />
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-black/[0.06] bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
        <span className="text-[14px] font-bold">{fuerEltern ? "1. Ticket" : "Dein 1. Ticket"}</span>
        <span className="zahl text-[17px] font-extrabold">
          {p.preisSteht ? `${p.erstes} €` : `${p.aufschlag - p.rabatt} € Zuschlag`}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 bg-white/60 px-4 pb-3 dark:bg-white/[0.04]">
        <span className="text-[13px] text-tinte-matt dark:text-slate-400">Jedes weitere Ticket</span>
        <span className="zahl text-[14px] font-bold text-tinte-matt dark:text-slate-300">{g(p.weiteres)}</span>
      </div>
    </div>
  );
}

function RZeile({ label, wert }: { label: ReactNode; wert: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-black/[0.05] px-4 py-2.5 last:border-0 dark:border-white/[0.06]">
      <span className="text-[13.5px] text-tinte-matt dark:text-slate-300">{label}</span>
      <span className="zahl shrink-0 text-[14px] font-semibold">{wert}</span>
    </div>
  );
}

// ================================================================ Kasse

const STATUS_TEXT: Record<TicketBestellung["status"], string> = {
  offen: "Überweisung offen",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
};

/**
 * Rechte Seite: bestellen und überweisen. Vor dem Start ein grauer Knopf mit
 * Countdown; ist der Verkauf nicht freigegeben, nur ein leiser Hinweis.
 * Eltern bestellen nicht selbst, sehen aber die Bestellungen und können sie
 * bezahlen.
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
  const a = abiballVon(settings);
  const p = ticketPreise(prozent, settings);
  const { liste, verkauft, bestellen } = useTicketBestellungen(true);
  const abMs = a.verkaufAb ? Date.parse(a.verkaufAb) : NaN;
  const jetzt = useJetzt(Number.isFinite(abMs) && abMs > Date.now());
  const status = verkaufStatus(a, jetzt);

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

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* ---------------- Knopf je nach Verkaufsstand */}
      {status === "aus" && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-papier-linie px-4 py-5 text-center dark:border-slate-700">
          <div className="text-[22px]" aria-hidden>🎟️</div>
          <div className="mt-1 text-[14px] font-semibold">Ticketverkauf noch nicht gestartet</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-tinte-leise">
            {fuerEltern
              ? `Sobald es losgeht, bestellt ${student.vorname} hier – Sie können dann direkt überweisen.`
              : "Sobald das Stufenteam den Verkauf startet, bestellst du hier."}
          </div>
        </div>
      )}

      {status === "bald" && (
        <div className="rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 text-center dark:bg-[rgb(118_118_128/0.16)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-tinte-leise">Verkauf startet in</div>
          <div className="zahl mt-1 text-[1.9rem] font-extrabold leading-none tracking-[-0.02em]" aria-live="off">
            {countdown(abMs - jetzt)}
          </div>
          <div className="mt-1 text-[12px] text-tinte-leise">{zeitpunktSchoen(a.verkaufAb!)}</div>
          {!fuerEltern && (
            <button
              disabled
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-300 py-3 text-[15px] font-bold text-white dark:bg-slate-700 dark:text-slate-400"
            >
              <span aria-hidden>🔒</span> Bestellen
            </button>
          )}
        </div>
      )}

      {status === "laeuft" && !fuerEltern && (
        <div className="rounded-2xl bg-gradient-to-b from-[#12284D] to-[#0A1730] p-4 text-white ring-1 ring-[#E2B744]/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E9C460]">Tickets bestellen</span>
            {a.kontingent > 0 && (
              <span className="text-[11px] font-semibold text-white/60">
                noch {Math.max(0, a.kontingent - verkauft)} frei
              </span>
            )}
          </div>

          {!p.preisSteht ? (
            <div className="mt-2 text-[13px] text-white/75">Der Ticketpreis steht noch nicht fest. Bestellen geht, sobald er eingetragen ist.</div>
          ) : moeglich <= 0 ? (
            <div className="mt-2 text-[13px] text-white/75">
              {restPerson <= 0
                ? `Du hast schon ${schon} Tickets – mehr als ${a.maxProPerson} je Person gehen nicht.`
                : "Alle Tickets sind vergeben."}
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center rounded-full bg-white/10 p-1">
                  <button
                    onClick={() => setAnzahl(Math.max(1, n - 1))}
                    disabled={n <= 1}
                    aria-label="Ein Ticket weniger"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold transition active:scale-90 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="zahl w-8 text-center text-[19px] font-extrabold" aria-live="polite">{n}</span>
                  <button
                    onClick={() => setAnzahl(Math.min(moeglich, n + 1))}
                    disabled={n >= moeglich}
                    aria-label="Ein Ticket mehr"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold transition active:scale-90 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <div className="text-right">
                  <div className={`zahl text-[1.7rem] font-extrabold leading-none ${GOLD_TEXT}`}>{betrag} €</div>
                  <div className="mt-0.5 text-[11px] text-white/55">
                    {schon === 0
                      ? n > 1
                        ? `${p.erstes} € + ${n - 1} × ${p.weiteres} €`
                        : "dein 1. Ticket"
                      : `${n} × ${p.weiteres} €`}
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
              <div className="mt-1.5 text-center text-[11px] text-white/50">
                Höchstens {a.maxProPerson} je Person{schon > 0 ? ` · du hast schon ${schon}` : ""}. Danach überweisen.
              </div>
            </>
          )}
          {fehler && <p className="mt-2 text-center text-[12.5px] font-semibold text-red-300">Das hat nicht geklappt: {fehler}</p>}
        </div>
      )}

      {status === "laeuft" && fuerEltern && aktiv.length === 0 && (
        <div className="rounded-2xl bg-[rgb(118_118_128/0.08)] p-4 text-center text-[13px] leading-relaxed text-tinte-matt dark:bg-[rgb(118_118_128/0.16)] dark:text-slate-300">
          Der Ticketverkauf läuft. Bestellen kann {student.vorname} über den eigenen Zugang – danach sehen Sie die
          Bestellung hier und können überweisen.
        </div>
      )}

      {/* ---------------- eigene Bestellungen */}
      {meine.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.16)]">
          <div className="px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinte-leise">
            {fuerEltern ? `Bestellungen von ${student.vorname}` : "Deine Bestellungen"}
          </div>
          {meine.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-t border-black/[0.05] px-4 py-2.5 first:border-0 dark:border-white/[0.06]">
              <div className="min-w-0 flex-1">
                <div className={`text-[14px] font-semibold ${b.status === "storniert" ? "text-tinte-leise line-through" : ""}`}>
                  {b.anzahl} {b.anzahl === 1 ? "Ticket" : "Tickets"} · {euroAusCent(b.betrag_cent)}
                </div>
                <div
                  className={`text-[11.5px] font-semibold ${
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
                  className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-bold text-white transition active:scale-95"
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
        unter={`${bestellung.anzahl} ${bestellung.anzahl === 1 ? "Ticket" : "Tickets"} · Bestellung ${bestellNummer(bestellung)}`}
        onClose={onClose}
      />
      <div className="mb-4 flex flex-col items-center rounded-2xl bg-gradient-to-b from-[#12284D] to-[#0A1730] px-4 py-5 text-center text-white ring-1 ring-[#E2B744]/40">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E9C460]">Zu überweisen</div>
        <div className={`zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] ${GOLD_TEXT}`}>
          {euroAusCent(bestellung.betrag_cent)}
        </div>
        <div className="mt-1.5 text-[12px] text-white/60">
          Sobald das Geld da ist, markiert das Stufenteam die Bestellung als bezahlt.
        </div>
      </div>
      <KontoTab
        personen={[student]}
        du={du}
        zweck={zweck}
        betrag={euroAusCent(bestellung.betrag_cent)}
        hinweis="Bitte genau diesen Verwendungszweck angeben – nur so können wir die Überweisung deiner Bestellung zuordnen."
      />
    </Sheet>
  );
}

// ================================================================ Bereich

/**
 * Der Ticket-Bereich auf der eigenen Seite (und bei den Eltern): links beide
 * Tickets, rechts die Kasse. Antippen eines Tickets öffnet die Ticket-Ansicht
 * mit der genauen Rechnung.
 */
export function TicketBereich({
  student,
  settings,
  prozent,
  fuerEltern,
  className = "",
}: {
  student: Student;
  settings: Settings;
  prozent: number;
  fuerEltern?: boolean;
  className?: string;
}) {
  const [auf, setAuf] = useState(false);
  return (
    <section className={`card p-4 sm:p-5 ${className}`} data-tour="abiball-ticket">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Abiball-Ticket</h2>
        <button onClick={() => setAuf(true)} className="-my-2 py-2 text-[13px] font-semibold text-brand-dark dark:text-brand">
          Ticket ansehen ›
        </button>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <div className="grid content-start gap-2.5">
          <AbiTicket art="erstes" student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} onClick={() => setAuf(true)} />
          <AbiTicket art="weiteres" student={student} settings={settings} prozent={prozent} onClick={() => setAuf(true)} klein />
          <p className="px-1 text-[11.5px] leading-relaxed text-tinte-leise">
            {fuerEltern
              ? "Der Helferzuschuss gilt nur für das 1. Ticket Ihres Kindes. Ihre Karten kosten den normalen Preis. Hat nichts mit dem Stufenbeitrag zu tun."
              : "Mithilfe senkt nur dein eigenes 1. Ticket. Karten für Eltern und Gäste kosten den normalen Preis. Hat nichts mit dem Stufenbeitrag zu tun."}
          </p>
        </div>
        <TicketKasse student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />
      </div>

      <Sheet open={auf} onClose={() => setAuf(false)}>
        <SheetKopf
          titel={fuerEltern ? `Abiball-Ticket von ${student.vorname}` : "Dein Abiball-Ticket"}
          unter="So setzt sich der Preis zusammen"
          onClose={() => setAuf(false)}
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-2.5 sm:col-span-2">
            <AbiTicket art="erstes" student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />
          </div>
          <TicketRechnung settings={settings} prozent={prozent} fuerEltern={fuerEltern} />
          <div className="grid content-start gap-2.5">
            <AbiTicket art="weiteres" student={student} settings={settings} prozent={prozent} klein />
            <TicketKasse student={student} settings={settings} prozent={prozent} fuerEltern={fuerEltern} />
          </div>
        </div>
      </Sheet>
    </section>
  );
}
