import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { abiballVon, bonusGrenze, ticketPreise, sortStudents } from "../lib/logic";
import { useEntwurf } from "../lib/entwurf";
import type { Abiball, Settings } from "../lib/types";
import { bestellNummer, countdown, euroAusCent, useJetzt, useTicketBestellungen, verkaufStatus, type TicketBestellung } from "../lib/tickets";
import { frage, melde } from "../lib/melder";
import { pushAnPersonen } from "../lib/push";
import { Gruppe, RechnungKopf, Symbol, Wert, Zeile, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { Sheet } from "./Sheet";
import { FussLeiste } from "./Kachel";
import { Icon } from "./Icon";
import { zeitpunktSchoen } from "./AbiTicket";

/**
 * Abiball-Optionen unter Kasse → „Beiträge & Abiball“ (Ticket) – dort, wo auch Grundpreis
 * und Helferzuschuss stehen:
 *   • Bonus über 100 % (Standard aus) mit zwei Reglern
 *   • Ort und Datum (erscheinen erst dann auf dem Ticket)
 *   • Ticketverkauf starten: ab wann, wie viele je Person, wie viele insgesamt
 *   • Bestellungen: als bezahlt markieren oder stornieren
 *
 * Rollen-Prüfung Okt. 2026 (Design-Regeln): Schalter-Zeilen über
 * ZeileMitSchalter (ganze Zeile tippbar), „Alle informieren“ mit Symbol statt
 * Emoji, und Bestellungen ohne zwei Knöpfe je Zeile – die Zeile öffnet ein
 * Blatt, dort stehen „Als bezahlt markieren“, Storno und Zurücknehmen.
 */

/** ISO (UTC) → Wert für <input type="datetime-local"> in Ortszeit */
function alsLokal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** Morgen, 18:00 Uhr – Vorschlag, wenn man den Verkauf einschaltet */
function morgenAbend(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

export type AbiballTeil = "bonus" | "abiball" | "verkauf" | "bestellungen";

/**
 * `nur`: nur diese Gruppen zeigen. Am Laptop verteilt BeitraegeTab die Gruppen
 * auf die drei Spalten (vorher hing alles in der dritten, die beiden anderen
 * waren nach ~400 px leer). Ohne `nur` kommt alles wie bisher.
 */
export function AbiballEinstellungen({ nur }: { nur?: AbiballTeil[] } = {}) {
  const { settings, setSettings } = useStore();
  const a = abiballVon(settings);
  const setze = (patch: Partial<Abiball>) => setSettings({ abiball: { ...abiballVon(settings), ...patch } });
  const zeig = (t: AbiballTeil) => !nur || nur.includes(t);

  return (
    <>
      {zeig("bonus") && <BonusGruppe settings={settings} a={a} setze={setze} />}
      {zeig("abiball") && <AbiballGruppe a={a} setze={setze} />}
      {zeig("verkauf") && <VerkaufGruppe settings={settings} a={a} setze={setze} />}
      {zeig("bestellungen") && <BestellListe />}
    </>
  );
}

// ---------------------------------------------------------------- Bonus

function BonusGruppe({ settings, a, setze }: { settings: Settings; a: Abiball; setze: (p: Partial<Abiball>) => void }) {
  const schritt = useEntwurf(a.bonusSchritt, (w) => setze({ bonusSchritt: w }), 350);
  const pro = useEntwurf(a.bonusProSchritt, (w) => setze({ bonusProSchritt: w }), 350);
  const max = useEntwurf(a.bonusMax, (w) => setze({ bonusMax: w }), 350);
  const vorschauA = { ...a, bonusSchritt: schritt.wert, bonusProSchritt: pro.wert, bonusMax: max.wert };
  const vorschau = { ...settings, abiball: vorschauA };
  const grenze = bonusGrenze(vorschauA);
  const grund = settings.ticket_preis || 0;
  // Vier Beispiele: 100 %, zwei Schritte dazwischen, Höchstwert
  const punkte = [...new Set([100, 100 + schritt.wert, 100 + 2 * schritt.wert, grenze])].filter((x) => x <= grenze).slice(0, 4);

  return (
    <Gruppe titel="Bonus über 100 %">
      <ZeileMitSchalter label="Über 100 % sammeln">
        <Schalter an={a.ueber100} onChange={(v) => setze({ ueber100: v })} label="Über 100 % sammeln" />
      </ZeileMitSchalter>
      {a.ueber100 && (
        <>
          <Regler label="Alle" wert={schritt.wert} einheit="%" min={5} max={50} schritt={5} onChange={schritt.aendern} onFertig={schritt.jetztSpeichern} />
          <Regler label="… günstiger um" wert={pro.wert} einheit="€" min={1} max={20} schritt={1} onChange={pro.aendern} onFertig={pro.jetztSpeichern} />
          <Regler label="Höchstens" wert={max.wert} einheit="€" min={1} max={Math.max(50, grund)} schritt={1} onChange={max.aendern} onFertig={max.jetztSpeichern} />
          <div className="px-4 py-3">
            <div className={`grid gap-1.5 text-center`} style={{ gridTemplateColumns: `repeat(${punkte.length}, minmax(0, 1fr))` }}>
              {punkte.map((p, i) => {
                const t = ticketPreise(p, vorschau);
                const letzte = i === punkte.length - 1;
                return (
                  <div
                    key={p}
                    className={`rounded-xl px-1 py-2 ${
                      letzte ? "bg-gradient-to-br from-[#F6DD8B] via-[#D9A92B] to-[#A87A0C] text-[#2B1F00]" : "bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]"
                    }`}
                  >
                    <div className="zahl text-[12px] font-bold">{p} %</div>
                    <div className="zahl text-[15px] font-extrabold">{grund > 0 ? `${t.erstes} €` : `−${t.rabatt} €`}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 text-[12px] text-tinte-leise">1. Ticket · ab {grenze} % kein weiterer Bonus</div>
          </div>
        </>
      )}
    </Gruppe>
  );
}

function Regler({
  label,
  wert,
  einheit,
  min,
  max,
  schritt,
  onChange,
  onFertig,
}: {
  label: string;
  wert: number;
  einheit: string;
  min: number;
  max: number;
  schritt: number;
  onChange: (w: number) => void;
  onFertig: () => void;
}) {
  return (
    <label className="block px-4 py-3">
      <span className="flex items-baseline justify-between">
        <span className="text-[15px]">{label}</span>
        <span className="zahl text-[15px] font-bold text-[#8A650A] dark:text-[#E9C460]">
          {wert} {einheit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={schritt}
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onFertig}
        onKeyUp={onFertig}
        onBlur={onFertig}
        className="mt-2 h-2 w-full cursor-pointer accent-[#D9A92B]"
        aria-label={label}
      />
      <span className="mt-0.5 flex justify-between text-[12px] text-tinte-leise">
        <span>
          {min} {einheit}
        </span>
        <span>
          {max} {einheit}
        </span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- Ort/Datum

function AbiballGruppe({ a, setze }: { a: Abiball; setze: (p: Partial<Abiball>) => void }) {
  const ort = useEntwurf(a.ort, (w) => setze({ ort: w.trim().slice(0, 80) }));
  const feld = "min-w-0 bg-transparent text-right text-[15px] text-tinte-matt outline-none placeholder:text-tinte-leise dark:text-slate-300";
  return (
    <Gruppe titel="Abiball (steht auf dem Ticket)">
      <Zeile label="Tag">
        <input type="date" className={feld} value={a.datum ?? ""} onChange={(e) => setze({ datum: e.target.value || null })} aria-label="Tag des Abiballs" />
      </Zeile>
      <Zeile label="Uhrzeit">
        <input type="time" className={feld} value={a.uhrzeit} onChange={(e) => setze({ uhrzeit: e.target.value })} aria-label="Uhrzeit des Abiballs" />
      </Zeile>
      <Zeile label="Ort">
        <input
          className={`w-full ${feld}`}
          placeholder="noch offen"
          value={ort.wert}
          maxLength={80}
          onChange={(e) => ort.aendern(e.target.value)}
          onBlur={ort.jetztSpeichern}
          aria-label="Ort des Abiballs"
        />
      </Zeile>
    </Gruppe>
  );
}

// ---------------------------------------------------------------- Verkauf

function VerkaufGruppe({ settings, a, setze }: { settings: Settings; a: Abiball; setze: (p: Partial<Abiball>) => void }) {
  const { students } = useStore();
  const abMs = a.verkaufAb ? Date.parse(a.verkaufAb) : NaN;
  const jetzt = useJetzt(Number.isFinite(abMs) && abMs > Date.now());
  const status = verkaufStatus(a, jetzt);
  const max = useEntwurf(a.maxProPerson, (w) => setze({ maxProPerson: w }));
  const kont = useEntwurf(a.kontingent, (w) => setze({ kontingent: w }));
  const grund = settings.ticket_preis || 0;

  return (
    <Gruppe titel="Ticketverkauf">
      <ZeileMitSchalter label="Verkauf freigeben">
        <Schalter
          an={status !== "aus"}
          onChange={(v) => setze({ verkaufAb: v ? morgenAbend() : null })}
          label="Ticketverkauf freigeben"
        />
      </ZeileMitSchalter>
      {status !== "aus" && (
        <>
          <Zeile label="Start">
            <input
              type="datetime-local"
              className="min-w-0 bg-transparent text-right text-[15px] text-tinte-matt outline-none dark:text-slate-300"
              value={alsLokal(a.verkaufAb)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                if (!Number.isNaN(d.getTime())) setze({ verkaufAb: d.toISOString() });
              }}
              aria-label="Start des Ticketverkaufs"
            />
          </Zeile>
          <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">
              {status === "bald" ? (
                <>
                  Startet in <b className="zahl">{countdown(abMs - jetzt)}</b>
                </>
              ) : (
                <>Läuft seit {zeitpunktSchoen(a.verkaufAb!)}.</>
              )}
            </span>
            {status === "bald" && (
              <button
                onClick={() =>
                  void frage("Ticketverkauf jetzt sofort starten?", "Jetzt starten").then((ok) => {
                    if (ok) setze({ verkaufAb: new Date().toISOString() });
                  })
                }
                className="btn-klein shrink-0 !px-3.5"
              >
                Jetzt starten
              </button>
            )}
          </div>
        </>
      )}
      {status !== "aus" && (
        <Zeile
          label="Alle informieren"
          unter="Mitteilung an alle Schüler und Eltern"
          blau
          symbol={
            <Symbol farbe="bg-[#FF9500]">
              <Icon name="glocke" size={17} strich={2.2} />
            </Symbol>
          }
          onClick={() =>
            void frage(
              status === "bald"
                ? `Allen Schülern und Eltern Bescheid geben, dass der Verkauf ${zeitpunktSchoen(a.verkaufAb!)} startet?`
                : "Allen Schülern und Eltern Bescheid geben, dass der Ticketverkauf läuft?",
              "Senden",
            ).then((ok) => {
              if (!ok) return;
              const titel = "🎟️ Abiball-Tickets";
              const text =
                status === "bald" ? `Der Verkauf startet ${zeitpunktSchoen(a.verkaufAb!)}.` : "Der Ticketverkauf läuft – jetzt in der App bestellen.";
              void pushAnPersonen(
                students.map((x) => ({ student_id: x.id, title: titel, body: text })),
                "./#kasse",
              ).then(() => melde("Mitteilung verschickt"));
            })
          }
        />
      )}
      <ZahlZeile titel="Höchstens je Person">
        <Zahl wert={max.wert} min={1} max={20} onChange={max.aendern} onBlur={max.jetztSpeichern} label="Tickets je Person" />
      </ZahlZeile>
      <ZahlZeile titel="Tickets insgesamt">
        <Zahl wert={kont.wert} min={0} max={5000} onChange={kont.aendern} onBlur={kont.jetztSpeichern} label="Tickets insgesamt" leer="unbegrenzt" />
      </ZahlZeile>
      {status !== "aus" && grund === 0 && (
        <div className="px-4 py-2.5 text-[12.5px] font-semibold text-offen">
          Ohne Grundpreis kann niemand bestellen.
        </div>
      )}
    </Gruppe>
  );
}

/**
 * Zeile mit Zahlenfeld rechts – die GANZE Zeile ist ein <label>: Ein Tipp
 * irgendwo darauf setzt den Cursor ins Feld (wie „Grundpreis je Ticket“).
 * Gegenprüfung Okt. 2026: Das Feld ist nur so breit wie die Zahl (bei „4“
 * etwa 11 × 20 px); in einer normalen Zeile traf man es kaum.
 */
function ZahlZeile({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <label className="flex min-h-[48px] cursor-text items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1 text-[15px]">{titel}</span>
      {children}
    </label>
  );
}

function Zahl({
  wert,
  min,
  max,
  onChange,
  onBlur,
  label,
  leer,
}: {
  wert: number;
  min: number;
  max: number;
  onChange: (w: number) => void;
  onBlur: () => void;
  label: string;
  /** Text, wenn 0 drinsteht */
  leer?: string;
}) {
  // Kapsel wie die Zahlen unter „Beiträge & Abiball“ (ZahlFeld): so breit wie
  // die Zahl, grau hinterlegt – zeigt, dass man sie antippen und ändern kann
  return (
    <span className="flex items-center gap-1.5">
      {leer && wert === 0 && <span className="text-[13px] text-tinte-leise">{leer}</span>}
      <span className="zahl inline-flex shrink-0 cursor-text items-baseline rounded-lg bg-[rgb(118_118_128/0.12)] px-2.5 py-1 text-[16px] font-semibold leading-tight text-brand-dark transition focus-within:ring-2 focus-within:ring-brand/40 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          aria-label={label}
          style={{ width: `${Math.max(1, String(wert).length)}ch` }}
          className="bg-transparent p-0 text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={wert}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))}
          onBlur={onBlur}
        />
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Bestellungen

/** Status einer Bestellung als farbige Kapsel – Farben wie im Personen-Blatt */
const STATUS: Record<TicketBestellung["status"], { text: string; klasse: string }> = {
  offen: { text: "offen", klasse: "bg-offen-grund text-offen dark:bg-amber-500/20 dark:text-amber-300" },
  bezahlt: { text: "✓ bezahlt", klasse: "bg-bezahlt-grund text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300" },
  storniert: { text: "storniert", klasse: "bg-[rgb(118_118_128/0.12)] text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]" },
};

function StatusKapsel({ status }: { status: TicketBestellung["status"] }) {
  const s = STATUS[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${s.klasse}`}>{s.text}</span>;
}

const tag = (iso: string, jahr = false) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", ...(jahr ? { year: "numeric" } : {}) });

function BestellListe() {
  const { students } = useStore();
  const { liste, setzeStatus } = useTicketBestellungen(true);
  const [filter, setFilter] = useState<"offen" | "bezahlt" | "alle">("offen");
  const [offenId, setOffenId] = useState<string | null>(null);
  const name = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sortStudents(students)) m[s.id] = `${s.vorname} ${s.nachname}`;
    return m;
  }, [students]);

  if (liste.length === 0) return null;
  const aktiv = liste.filter((b) => b.status !== "storniert");
  const tickets = aktiv.reduce((n, b) => n + b.anzahl, 0);
  const bezahlt = aktiv.filter((b) => b.status === "bezahlt");
  const eingang = bezahlt.reduce((n, b) => n + b.betrag_cent, 0);
  const offenSumme = aktiv.filter((b) => b.status === "offen").reduce((n, b) => n + b.betrag_cent, 0);
  const sichtbar = liste.filter((b) => filter === "alle" || b.status === filter);
  const zahl = { offen: liste.filter((b) => b.status === "offen").length, bezahlt: bezahlt.length, alle: liste.length };
  const gewaehlt = offenId ? liste.find((b) => b.id === offenId) : undefined;

  async function aendern(b: TicketBestellung, s: TicketBestellung["status"]) {
    if (s === "storniert" && !(await frage(`Bestellung ${bestellNummer(b)} von ${name[b.student_id] || "?"} stornieren?`, "Stornieren", true))) return;
    const fehler = await setzeStatus(b.id, s);
    if (fehler) {
      melde(fehler, "fehler");
      return;
    }
    setOffenId(null);
    melde(
      s === "bezahlt" ? `${bestellNummer(b)} als bezahlt markiert` : s === "storniert" ? `${bestellNummer(b)} storniert` : `${bestellNummer(b)} wieder offen`,
      "erfolg",
    );
  }

  return (
    <Gruppe titel={`Bestellungen · ${tickets} ${tickets === 1 ? "Ticket" : "Tickets"}`}>
      <div className="space-y-3 px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-bezahlt-grund px-3 py-2 dark:bg-emerald-500/15">
            <div className="text-[12px] font-semibold text-bezahlt dark:text-emerald-300">Eingegangen</div>
            <div className="zahl text-[17px] font-extrabold">{euroAusCent(eingang)}</div>
          </div>
          <div className="rounded-xl bg-offen-grund px-3 py-2 dark:bg-amber-500/15">
            <div className="text-[12px] font-semibold text-offen dark:text-amber-300">Noch offen</div>
            <div className="zahl text-[17px] font-extrabold">{euroAusCent(offenSumme)}</div>
          </div>
        </div>
        {/* Segment wie überall (steht in der Zelle, nicht auf dem Foto: eigene Bahn) */}
        <div className="seg !bg-[rgb(118_118_128/0.12)] !shadow-none dark:!bg-[rgb(118_118_128/0.24)]" role="tablist" aria-label="Bestellungen filtern">
          {(["offen", "bezahlt", "alle"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`seg-item min-h-[2.75rem] !py-2 !text-[14px] ${filter === f ? "seg-aktiv" : ""}`}
            >
              {f === "offen" ? "Offen" : f === "bezahlt" ? "Bezahlt" : "Alle"}
              <span className="zahl ml-1 font-medium text-tinte-leise">{zahl[f]}</span>
            </button>
          ))}
        </div>
      </div>
      {sichtbar.length === 0 && <div className="px-4 py-3 text-[13px] text-tinte-leise">Keine Bestellungen.</div>}
      {sichtbar.map((b) => (
        <Zeile
          key={b.id}
          label={<span className={b.status === "storniert" ? "text-tinte-leise line-through" : ""}>{name[b.student_id] || "Unbekannt"}</span>}
          unter={`${b.anzahl} × · ${euroAusCent(b.betrag_cent)} · ${bestellNummer(b)} · ${tag(b.created_at)}`}
          onClick={() => setOffenId(b.id)}
        >
          <StatusKapsel status={b.status} />
        </Zeile>
      ))}

      {gewaehlt && (
        <BestellBlatt
          key={gewaehlt.id}
          b={gewaehlt}
          name={name[gewaehlt.student_id] || "Unbekannt"}
          onClose={() => setOffenId(null)}
          onStatus={(s) => void aendern(gewaehlt, s)}
        />
      )}
    </Gruppe>
  );
}

/**
 * Eine Bestellung – aufgebaut wie eine Rechnung: oben Betrag und Name,
 * darunter der Stand. Die häufigste Aktion („Als bezahlt markieren“) klebt
 * unten, Stornieren steht als rote Zeile darüber (mit Rückfrage).
 */
function BestellBlatt({
  b,
  name,
  onClose,
  onStatus,
}: {
  b: TicketBestellung;
  name: string;
  onClose: () => void;
  onStatus: (s: TicketBestellung["status"]) => void;
}) {
  return (
    <Sheet open onClose={onClose}>
      <RechnungKopf
        bild={
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
            <Icon name="kasse" size={26} strich={2} />
          </span>
        }
        oben={`Bestellung ${bestellNummer(b)}`}
        wert={euroAusCent(b.betrag_cent)}
        wertKlasse={b.status === "storniert" ? "text-tinte-leise line-through" : b.status === "bezahlt" ? "text-bezahlt dark:text-emerald-300" : ""}
        titel={name}
        unter={`${b.anzahl} ${b.anzahl === 1 ? "Ticket" : "Tickets"} · bestellt am ${tag(b.created_at, true)}`}
        onClose={onClose}
      />
      <Gruppe className="mt-5">
        <Zeile label="Status">
          <StatusKapsel status={b.status} />
        </Zeile>
        {b.bearbeitet_at && (
          <Zeile label="Zuletzt geändert">
            <Wert>{tag(b.bearbeitet_at, true)}</Wert>
          </Zeile>
        )}
      </Gruppe>
      {b.status === "offen" ? (
        <>
          <Gruppe className="mt-8">
            <Zeile label="Bestellung stornieren" rot onClick={() => onStatus("storniert")} />
          </Gruppe>
          <FussLeiste>
            <button type="button" className="btn-primary" onClick={() => onStatus("bezahlt")}>
              Als bezahlt markieren
            </button>
          </FussLeiste>
        </>
      ) : (
        <Gruppe fuss={b.status === "bezahlt" ? "Zum Beispiel, wenn das Geld doch nicht angekommen ist." : "Die Bestellung zählt dann wieder mit."}>
          <Zeile label={b.status === "bezahlt" ? "Zahlung zurücknehmen" : "Storno zurücknehmen"} blau onClick={() => onStatus("offen")} />
        </Gruppe>
      )}
    </Sheet>
  );
}
