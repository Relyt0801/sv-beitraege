import { useMemo, useState } from "react";
import { useStore } from "../store";
import { abiballVon, bonusGrenze, ticketPreise, sortStudents } from "../lib/logic";
import { useEntwurf } from "../lib/entwurf";
import type { Abiball, Settings } from "../lib/types";
import { bestellNummer, countdown, euroAusCent, useJetzt, useTicketBestellungen, verkaufStatus, type TicketBestellung } from "../lib/tickets";
import { frage } from "../lib/melder";
import { Gruppe, Zeile } from "./Liste";
import { Schalter } from "./Schalter";
import { zeitpunktSchoen } from "./AbiTicket";

/**
 * Abiball-Optionen im Reiter „Beiträge → Ticket“ – dort, wo auch Grundpreis
 * und Helferzuschuss stehen:
 *   • Bonus über 100 % (Standard aus) mit zwei Reglern
 *   • Ort und Datum (erscheinen erst dann auf dem Ticket)
 *   • Ticketverkauf starten: ab wann, wie viele je Person, wie viele insgesamt
 *   • Bestellungen: als bezahlt markieren oder stornieren
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

export function AbiballEinstellungen() {
  const { settings, setSettings } = useStore();
  const a = abiballVon(settings);
  const setze = (patch: Partial<Abiball>) => setSettings({ abiball: { ...abiballVon(settings), ...patch } });

  return (
    <>
      <BonusGruppe settings={settings} a={a} setze={setze} />
      <AbiballGruppe a={a} setze={setze} />
      <VerkaufGruppe settings={settings} a={a} setze={setze} />
      <BestellListe />
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
      <Zeile label="Über 100 % sammeln">
        <Schalter an={a.ueber100} onChange={(v) => setze({ ueber100: v })} label="Über 100 % sammeln" />
      </Zeile>
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
                      letzte ? "bg-gradient-to-br from-[#F6DD8B] via-[#D9A92B] to-[#A87A0C] text-[#2B1F00]" : "bg-white/70 dark:bg-white/[0.06]"
                    }`}
                  >
                    <div className="zahl text-[12px] font-bold">{p} %</div>
                    <div className="zahl text-[15px] font-extrabold">{grund > 0 ? `${t.erstes} €` : `−${t.rabatt} €`}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 text-[11.5px] text-tinte-leise">1. Ticket · ab {grenze} % kein weiterer Bonus</div>
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
      <span className="mt-0.5 flex justify-between text-[10.5px] text-tinte-leise">
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
  const abMs = a.verkaufAb ? Date.parse(a.verkaufAb) : NaN;
  const jetzt = useJetzt(Number.isFinite(abMs) && abMs > Date.now());
  const status = verkaufStatus(a, jetzt);
  const max = useEntwurf(a.maxProPerson, (w) => setze({ maxProPerson: w }));
  const kont = useEntwurf(a.kontingent, (w) => setze({ kontingent: w }));
  const grund = settings.ticket_preis || 0;

  return (
    <Gruppe titel="Ticketverkauf">
      <Zeile label="Verkauf freigeben">
        <Schalter
          an={status !== "aus"}
          onChange={(v) => setze({ verkaufAb: v ? morgenAbend() : null })}
          label="Ticketverkauf freigeben"
        />
      </Zeile>
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
          <div className="flex items-center gap-3 px-4 py-2.5">
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
                className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-[13px] font-bold text-white transition active:scale-95"
              >
                Jetzt starten
              </button>
            )}
          </div>
        </>
      )}
      <Zeile label="Höchstens je Person">
        <Zahl wert={max.wert} min={1} max={20} onChange={max.aendern} onBlur={max.jetztSpeichern} label="Tickets je Person" />
      </Zeile>
      <Zeile label="Tickets insgesamt">
        <Zahl wert={kont.wert} min={0} max={5000} onChange={kont.aendern} onBlur={kont.jetztSpeichern} label="Tickets insgesamt" leer="unbegrenzt" />
      </Zeile>
      {status !== "aus" && grund === 0 && (
        <div className="px-4 py-2.5 text-[12.5px] font-semibold text-offen">
          Ohne Grundpreis kann niemand bestellen.
        </div>
      )}
    </Gruppe>
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
  return (
    <span className="flex items-center gap-1.5">
      {leer && wert === 0 && <span className="text-[13px] text-tinte-leise">{leer}</span>}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        aria-label={label}
        className="w-16 rounded-lg bg-white px-2 py-1 text-right text-[15px] font-bold outline-none dark:bg-slate-800"
        value={wert}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))}
        onBlur={onBlur}
      />
    </span>
  );
}

// ---------------------------------------------------------------- Bestellungen

function BestellListe() {
  const { students } = useStore();
  const { liste, setzeStatus } = useTicketBestellungen(true);
  const [filter, setFilter] = useState<"offen" | "bezahlt" | "alle">("offen");
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

  async function aendern(b: TicketBestellung, s: TicketBestellung["status"]) {
    if (s === "storniert" && !(await frage(`Bestellung ${bestellNummer(b)} von ${name[b.student_id] || "?"} stornieren?`, "Stornieren", true))) return;
    await setzeStatus(b.id, s);
  }

  return (
    <Gruppe titel={`Bestellungen · ${tickets} Tickets`}>
      <div className="grid grid-cols-2 gap-2 px-4 py-3">
        <div className="rounded-xl bg-bezahlt-grund px-3 py-2">
          <div className="text-[11px] font-semibold text-bezahlt">Eingegangen</div>
          <div className="zahl text-[17px] font-extrabold">{euroAusCent(eingang)}</div>
        </div>
        <div className="rounded-xl bg-offen-grund px-3 py-2">
          <div className="text-[11px] font-semibold text-offen">Noch offen</div>
          <div className="zahl text-[17px] font-extrabold">{euroAusCent(offenSumme)}</div>
        </div>
      </div>
      <div className="flex gap-1 px-4 pb-2.5">
        {(["offen", "bezahlt", "alle"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition ${
              filter === f ? "bg-white shadow-sm dark:bg-slate-700" : "text-tinte-leise"
            }`}
          >
            {f === "offen" ? "Offen" : f === "bezahlt" ? "Bezahlt" : "Alle"}
          </button>
        ))}
      </div>
      {sichtbar.length === 0 && <div className="px-4 py-3 text-[13px] text-tinte-leise">Keine Bestellungen.</div>}
      {sichtbar.map((b) => (
        <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className={`truncate text-[14.5px] font-semibold ${b.status === "storniert" ? "text-tinte-leise line-through" : ""}`}>
              {name[b.student_id] || "Unbekannt"}
            </div>
            <div className="truncate text-[12px] text-tinte-leise">
              {b.anzahl} × · {euroAusCent(b.betrag_cent)} · {bestellNummer(b)} ·{" "}
              {new Date(b.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </div>
          </div>
          {b.status === "offen" && (
            <>
              <button
                onClick={() => void aendern(b, "storniert")}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold text-red-600 transition active:scale-95 dark:text-red-400"
              >
                Storno
              </button>
              <button
                onClick={() => void aendern(b, "bezahlt")}
                className="shrink-0 rounded-full bg-bezahlt px-3 py-1.5 text-[12.5px] font-bold text-white transition active:scale-95"
              >
                ✓ Bezahlt
              </button>
            </>
          )}
          {b.status !== "offen" && (
            <button
              onClick={() => void aendern(b, "offen")}
              className="shrink-0 rounded-full bg-[rgb(118_118_128/0.12)] px-3 py-1.5 text-[12.5px] font-semibold text-tinte-matt transition active:scale-95 dark:text-slate-300"
            >
              {b.status === "bezahlt" ? "✓ bezahlt" : "storniert"} · zurück
            </button>
          )}
        </div>
      ))}
    </Gruppe>
  );
}
