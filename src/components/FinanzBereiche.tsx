import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { committeeLabel } from "../lib/committees";
import {
  KASSEN_FARBEN, centAus, euro, euroKurz, farbHex, postenFarbe, schuljahrVon, useGeplant,
  type FinanzPosten, type FinanzUebersicht, type FinanzenValue, type KassenGeplant, type PostenRef, type Quelle,
} from "../lib/finanzen";
import { useDunkel } from "../lib/dunkel";
import { frage, meldeFehler } from "../lib/melder";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";

/**
 * Finanzen unter dem Kontostand:
 *  1. „Aktionen, Beiträge und Sonstiges“ – alles, was Geld bewegt: Elternbeiträge
 *     (blau), jede Aktion/Kategorie in ihrer Farbe mit ihren Ausgaben verrechnet,
 *     Komitees, Spenden, Sonstiges (grau). Jede Zeile antippbar (ⓘ).
 *  2. „Geplante Aktionen“ – was noch ansteht, mit Tag, Infos und Erwartung.
 *
 * Mit `fin` (Kassenwart/Admin, „Kassenbuch führen“) wird gebucht, gelöscht,
 * umbenannt und geplant – immer mit demselben Buchungsformular.
 */

const PHASEN = ["EF", "Q1", "Q2"] as const;

type Auswahl = { typ: "beitraege" } | { typ: "posten"; key: string } | null;
/** Was das Buchungsformular vorbelegt: Seite und – falls aus einem Posten geöffnet – der Posten. */
export type BuchungStart = { typ: "ein" | "aus"; ref?: PostenRef; name?: string; zurueck?: string };

export function postenKey(p: FinanzPosten): string {
  if (p.ref?.typ === "kategorie") return `k:${p.ref.id}`;
  if (p.ref?.typ === "aktion") return `a:${p.ref.id}`;
  return `${p.art}|${p.titel}`;
}

function anzeigeName(p: FinanzPosten): string {
  return p.art === "komitee" ? committeeLabel(p.titel) : p.titel;
}

const REIHENFOLGE: Record<FinanzPosten["art"], number> = { kategorie: 0, aktion: 0, komitee: 1, spende: 2, ausgabe: 3, sonstiges: 4 };

/** "+12,00 €" / "−12,00 €" – Einnahmen und Ausgaben auf einen Blick. */
export function mitVorzeichen(cent: number, kurz = false): string {
  const f = kurz ? euroKurz : euro;
  return cent > 0 ? `+${f(cent)}` : cent < 0 ? `−${f(-cent)}` : f(0);
}

export function PostenBereiche({ d, fin }: { d: FinanzUebersicht; fin?: FinanzenValue | null }) {
  const dunkel = useDunkel();
  const [auswahl, setAuswahl] = useState<Auswahl>(null);
  const [neu, setNeu] = useState(false);
  const [buchung, setBuchung] = useState<BuchungStart | null>(null);

  const beitraegeSumme = d.beitraege.reduce((n, b) => n + b.cent, 0);
  const liste = [...d.posten].sort(
    (a, b) => REIHENFOLGE[a.art] - REIHENFOLGE[b.art] || Math.abs(b.ein_cent - b.aus_cent) - Math.abs(a.ein_cent - a.aus_cent),
  );
  const gewaehlt = auswahl?.typ === "posten" ? d.posten.find((p) => postenKey(p) === auswahl.key) ?? null : null;

  return (
    <>
      <section className="card p-5">
        <BereichKopf titel="Aktionen, Beiträge und Sonstiges" onNeu={fin ? () => setNeu(true) : undefined} neuText="Kategorie" />
        <ul className="grid gap-1.5">
          <PostenZeile
            hex={farbHex("blau", dunkel)}
            name="Elternbeiträge"
            unter={beitraegeSumme > 0 ? d.beitraege.map((b) => b.phase).join(" · ") : "noch nichts verbucht"}
            betrag={beitraegeSumme}
            onClick={() => setAuswahl({ typ: "beitraege" })}
          />
          {liste.map((p) => (
            <PostenZeile
              key={postenKey(p)}
              hex={farbHex(postenFarbe(p), dunkel)}
              name={anzeigeName(p)}
              unter={unterzeile(p)}
              betrag={p.ein_cent - p.aus_cent}
              onClick={() => setAuswahl({ typ: "posten", key: postenKey(p) })}
            />
          ))}
        </ul>
      </section>

      <GeplantKarte darf={Boolean(fin)} fin={fin ?? null} />

      <BeitraegeDetail open={auswahl?.typ === "beitraege"} d={d} onClose={() => setAuswahl(null)} />
      <PostenDetail
        p={gewaehlt}
        fin={fin ?? null}
        onClose={() => setAuswahl(null)}
        onUmgezogen={(key) => setAuswahl({ typ: "posten", key })}
        onBuchen={(start) => {
          setAuswahl(null);
          setBuchung(start);
        }}
      />
      {fin && (
        <>
          <NeuSheet
            open={neu}
            fin={fin}
            onClose={() => setNeu(false)}
            onAngelegt={(id) => {
              setNeu(false);
              setAuswahl({ typ: "posten", key: `k:${id}` });
            }}
          />
          <BuchungSheet
            start={buchung}
            fin={fin}
            onClose={() => {
              const zurueck = buchung?.zurueck;
              setBuchung(null);
              if (zurueck) setAuswahl({ typ: "posten", key: zurueck });
            }}
          />
        </>
      )}
    </>
  );
}

function unterzeile(p: FinanzPosten): string | undefined {
  if (p.ein_cent > 0 && p.aus_cent > 0) return `${mitVorzeichen(p.ein_cent, true)} · ${mitVorzeichen(-p.aus_cent, true)}`;
  const n = p.eintraege?.length ?? 0;
  if (n > 1) return `${n} Einträge`;
  if (p.anzahl === 0) return "noch leer – antippen";
  return undefined;
}

function BereichKopf({ titel, onNeu, neuText = "Neu" }: { titel: string; onNeu?: () => void; neuText?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="min-w-0 flex-1 text-[17px] font-bold leading-tight">{titel}</h2>
      {onNeu && (
        <button
          type="button"
          onClick={onNeu}
          aria-label={`${neuText} anlegen`}
          className="flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-[13px] font-bold text-brand active:scale-95 dark:bg-brand/20 dark:text-blue-300"
        >
          <Icon name="plus" size={14} strich={2.4} />
          {neuText}
        </button>
      )}
    </div>
  );
}

function Punkt({ hex, gross }: { hex: string; gross?: boolean }) {
  return <span aria-hidden className={`${gross ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} shrink-0 rounded-full`} style={{ background: hex }} />;
}

/** Betrag mit + / −; rot nur beim Verlust eines Postens. */
function Betrag({ cent, className = "", warnen }: { cent: number; className?: string; warnen?: boolean }) {
  return <span className={`zahl ${warnen && cent < 0 ? "text-red-600 dark:text-red-400" : ""} ${className}`}>{mitVorzeichen(cent)}</span>;
}

function PostenZeile({
  hex, name, unter, betrag, onClick,
}: {
  hex: string;
  name: string;
  unter?: string;
  betrag: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl bg-papier-matt px-3 py-2.5 text-left transition active:scale-[.98] dark:bg-slate-800"
      >
        <Punkt hex={hex} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{name}</span>
          {unter && <span className="zahl block truncate text-[12px] text-tinte-leise">{unter}</span>}
        </span>
        <Betrag cent={betrag} className="shrink-0 text-[15px] font-bold" />
        <span className="shrink-0 text-tinte-leise" aria-hidden>
          <Icon name="info" size={17} />
        </span>
      </button>
    </li>
  );
}

// ==================================================================== Details

function Kopf({ hex, titel, onClose, rechts }: { hex: string; titel: string; onClose: () => void; rechts?: ReactNode }) {
  return (
    <SheetKopf
      titel={
        <span className="flex items-center gap-2.5">
          <Punkt hex={hex} gross />
          <span className="min-w-0 truncate">{titel}</span>
          {rechts}
        </span>
      }
      onClose={onClose}
    />
  );
}

function BeitraegeDetail({ open, d, onClose }: { open: boolean; d: FinanzUebersicht; onClose: () => void }) {
  const dunkel = useDunkel();
  const summe = d.beitraege.reduce((n, b) => n + b.cent, 0);
  return (
    <Sheet open={open} onClose={onClose}>
      <Kopf hex={farbHex("blau", dunkel)} titel="Elternbeiträge" onClose={onClose} />
      <div className="rounded-2xl bg-papier-matt p-4 dark:bg-slate-800">
        <ul className="grid gap-2.5">
          {PHASEN.map((k) => {
            const c = d.beitraege.find((b) => b.phase === k)?.cent ?? 0;
            return (
              <li key={k} className="flex items-baseline gap-3 text-[15px]">
                <span className={`min-w-0 flex-1 ${c ? "font-semibold" : "text-tinte-leise"}`}>Elternbeiträge der {k}</span>
                <span className={`zahl shrink-0 ${c ? "font-bold" : "text-tinte-leise"}`}>{c ? mitVorzeichen(c) : "–"}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-baseline gap-3 border-t border-papier-linie pt-3 dark:border-slate-700">
          <span className="min-w-0 flex-1 text-[15px] font-bold">Zusammen</span>
          <span className="zahl shrink-0 text-[1.5rem] font-bold tracking-tight">{mitVorzeichen(summe)}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-tinte-leise">
        Noch offen bis {d.halbjahr} ({schuljahrVon(d.halbjahr)}): {euroKurz(d.offen_cent)}
      </p>
    </Sheet>
  );
}

/** Welche Seiten ein Posten beim Buchen anbietet. */
function seiten(p: FinanzPosten): ("ein" | "aus")[] {
  const r = p.ref;
  if (!r || r.typ === "aktionTitel") return [];
  if (r.typ === "kategorie") return r.art === "ein" ? ["ein"] : r.art === "aus" ? ["aus"] : ["ein", "aus"];
  if (r.typ === "komitee" || r.typ === "ausgabe") return ["aus"];
  if (r.typ === "spende") return ["ein"];
  return ["ein", "aus"];
}

const tagKurz = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

function PostenDetail({
  p, fin, onClose, onUmgezogen, onBuchen,
}: {
  p: FinanzPosten | null;
  fin: FinanzenValue | null;
  onClose: () => void;
  onUmgezogen: (key: string) => void;
  onBuchen: (start: BuchungStart) => void;
}) {
  const dunkel = useDunkel();
  const [bearbeiten, setBearbeiten] = useState(false);
  // Beim Schließen bleibt der letzte Posten stehen, damit das Sheet sauber wegfährt
  const letzter = useRef<FinanzPosten | null>(null);
  if (p) letzter.current = p;
  const x = p ?? letzter.current;
  const key = p ? postenKey(p) : "";
  useEffect(() => setBearbeiten(false), [key]);

  if (!x) return null;
  const gewinn = x.ein_cent - x.aus_cent;
  const hex = farbHex(postenFarbe(x), dunkel);
  const darf = Boolean(fin && x.ref);
  const umbenennbar = darf && (x.ref!.typ === "kategorie" || x.ref!.typ === "aktion");
  const moeglich = darf ? seiten(x) : [];
  const start = (typ: "ein" | "aus") => onBuchen({ typ, ref: x.ref, name: anzeigeName(x), zurueck: postenKey(x) });

  return (
    <Sheet open={p !== null} onClose={onClose}>
      <Kopf
        hex={hex}
        titel={anzeigeName(x)}
        onClose={onClose}
        rechts={
          umbenennbar && !bearbeiten ? (
            <button type="button" onClick={() => setBearbeiten(true)} className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold text-brand">
              Ändern
            </button>
          ) : null
        }
      />

      {bearbeiten && fin && <Bearbeiten p={x} fin={fin} onFertig={() => setBearbeiten(false)} onUmgezogen={onUmgezogen} onGeloescht={onClose} />}

      {/* Die Rechnung: Einnahmen − Ausgaben = Gewinn */}
      <div className="rounded-2xl bg-papier-matt p-4 dark:bg-slate-800">
        <Balken ein={x.ein_cent} aus={x.aus_cent} hex={hex} />
        <dl className="mt-3 grid gap-1.5 text-[15px]">
          <div className="flex items-baseline gap-3">
            <dt className="min-w-0 flex-1 font-semibold">Einnahmen</dt>
            <dd className="zahl shrink-0 font-semibold">{mitVorzeichen(x.ein_cent)}</dd>
          </div>
          <div className="flex items-baseline gap-3">
            <dt className="min-w-0 flex-1 font-semibold">Ausgaben</dt>
            <dd className="zahl shrink-0 font-semibold">{mitVorzeichen(-x.aus_cent)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-baseline gap-3 border-t border-papier-linie pt-3 dark:border-slate-700">
          <span className="min-w-0 flex-1 text-[15px] font-bold">{gewinn < 0 ? "Verlust" : "Gewinn"}</span>
          <Betrag cent={gewinn} warnen className="shrink-0 text-[1.5rem] font-bold tracking-tight" />
        </div>
      </div>

      {moeglich.length > 0 && (
        <div className={`mt-4 grid gap-2 ${moeglich.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {moeglich.includes("ein") && (
            <button
              type="button"
              onClick={() => start("ein")}
              className="flex min-h-[3rem] items-center justify-center gap-1.5 rounded-full bg-bezahlt/[0.12] text-[15px] font-semibold text-bezahlt active:scale-[.97]"
            >
              <Icon name="plus" size={16} strich={2.4} />
              Einnahme
            </button>
          )}
          {moeglich.includes("aus") && (
            <button
              type="button"
              onClick={() => start("aus")}
              className="flex min-h-[3rem] items-center justify-center gap-1.5 rounded-full bg-red-500/[0.12] text-[15px] font-semibold text-red-600 active:scale-[.97] dark:text-red-400"
            >
              <span className="text-[18px] leading-none">−</span>
              Ausgabe
            </button>
          )}
        </div>
      )}

      <Unterpunkte p={x} fin={darf ? fin : null} />
    </Sheet>
  );
}

/** Ein Balken: ganz = Einnahmen, rot = Ausgaben, Farbe = was übrig bleibt. */
function Balken({ ein, aus, hex }: { ein: number; aus: number; hex: string }) {
  if (ein <= 0 && aus <= 0) return <div className="h-2.5 rounded-full bg-papier-linie dark:bg-slate-700" />;
  const ganz = Math.max(ein, aus);
  const rot = (Math.min(aus, ganz) / ganz) * 100;
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-papier-linie dark:bg-slate-700" aria-hidden>
      <div className="h-full bg-red-500/80" style={{ width: `${rot}%` }} />
      <div className="h-full" style={{ width: `${Math.max(0, ((ein - aus) / ganz) * 100)}%`, background: hex }} />
    </div>
  );
}

/**
 * Die Unterpunkte eines Postens (Bezeichnung, Tag, Betrag). Alle sehen die
 * Summen je Tag und Bezeichnung; der Kassenwart sieht jede Buchung einzeln und
 * kann sie löschen.
 */
function Unterpunkte({ p, fin }: { p: FinanzPosten; fin: FinanzenValue | null }) {
  const dunkel = useDunkel();
  const einzeln = fin && p.buchungen
    ? [...p.buchungen]
        .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.created_at < b.created_at ? 1 : -1))
        .map((b) => ({ key: b.id, datum: b.datum, titel: b.titel, cent: b.cent, farbe: b.farbe, buchung: b }))
    : (p.eintraege ?? []).map((e, i) => ({ key: String(i), datum: e.datum, titel: e.titel, cent: e.cent, farbe: null, buchung: null }));
  if (!einzeln.length) return null;
  return (
    <>
      <h3 className="mb-1 mt-5 text-[13px] font-semibold uppercase tracking-wide text-tinte-leise">
        {einzeln.length === 1 ? "Eintrag" : `${einzeln.length} Einträge`}
      </h3>
      <ul className="divide-y divide-papier-linie dark:divide-slate-800">
        {einzeln.map((e) => (
          <li key={e.key} className="flex items-center gap-2.5 py-2">
            {e.farbe && <Punkt hex={farbHex(e.farbe, dunkel)} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{e.titel}</span>
              <span className="block text-[12px] text-tinte-leise">{tagKurz(e.datum)}</span>
            </span>
            <Betrag cent={e.cent} className="shrink-0 text-[14px] font-bold" />
            {fin && e.buchung && !e.buchung.automatisch && e.buchung.quelle !== "abgleich" && (
              <button
                type="button"
                aria-label="Eintrag löschen"
                onClick={async () => {
                  if (!(await frage(`„${e.titel}“ (${mitVorzeichen(e.cent)}) löschen?`, "Löschen", true))) return;
                  const f = await fin.loeschen(e.buchung!.id);
                  if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
                }}
                className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-tinte-leise active:bg-papier-matt dark:active:bg-slate-800"
              >
                <Icon name="muell" size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Name und Farbe ändern. Eine Aktion bekommt dabei eine eigene Kategorie mit Farbe. */
function Bearbeiten({
  p, fin, onFertig, onUmgezogen, onGeloescht,
}: {
  p: FinanzPosten;
  fin: FinanzenValue;
  onFertig: () => void;
  onUmgezogen: (key: string) => void;
  onGeloescht: () => void;
}) {
  const r = p.ref!;
  const [name, setName] = useState(anzeigeName(p));
  const [farbe, setFarbe] = useState(postenFarbe(p));
  const [busy, setBusy] = useState(false);

  async function speichern() {
    setBusy(true);
    let f: string | null | undefined = null;
    if (r.typ === "kategorie") {
      f = await fin.kategorieSpeichern({ id: r.id, name, farbe, art: r.art });
    } else {
      // Aktion → eigene Kategorie mit Farbe; die bisherigen Buchungen ziehen mit
      const neu = await fin.postenAnlegen(name, farbe);
      f = neu.fehler;
      if (neu.id) {
        for (const b of p.buchungen ?? []) {
          if (b.automatisch) continue;
          const g = await fin.buchungKategorie(b.id, neu.id);
          if (g) f = g;
        }
        onUmgezogen(`k:${neu.id}`);
      }
    }
    setBusy(false);
    if (f) return meldeFehler("Hat nicht geklappt: " + f);
    onFertig();
  }

  return (
    <div className="mb-4 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
      <input className="field" aria-label="Name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <FarbWahl wert={farbe} setzen={setFarbe} />
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void speichern()} className="flex-1 rounded-xl bg-brand py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
          {busy ? "…" : "Speichern"}
        </button>
        <button type="button" onClick={onFertig} className="rounded-xl px-3 py-2.5 text-[14px] font-semibold text-tinte-leise">
          Abbrechen
        </button>
        {r.typ === "kategorie" && (
          <button
            type="button"
            aria-label="Kategorie löschen"
            onClick={async () => {
              if (!(await frage(`„${p.titel}“ löschen? Die Einträge bleiben im Kassenbuch, nur ohne Kategorie.`, "Löschen", true))) return;
              const f = await fin.kategorieLoeschen(r.id);
              if (f) return meldeFehler("Löschen hat nicht geklappt: " + f);
              onGeloescht();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-500"
          >
            <Icon name="muell" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function freieFarbe(fin: FinanzenValue): string {
  const belegt = new Set(fin.kategorien.map((k) => k.farbe));
  return KASSEN_FARBEN.find((f) => !["blau", "grau"].includes(f.key) && !belegt.has(f.key))?.key ?? "orange";
}

/** Neue Kategorie: Name + Farbe, sonst nichts. Danach öffnet sie sich. */
function NeuSheet({ open, fin, onClose, onAngelegt }: { open: boolean; fin: FinanzenValue; onClose: () => void; onAngelegt: (id: string) => void }) {
  const [name, setName] = useState("");
  const [farbe, setFarbe] = useState("orange");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName("");
    setFarbe(freieFarbe(fin));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anlegen() {
    setBusy(true);
    const r = await fin.postenAnlegen(name, farbe, "beide");
    setBusy(false);
    if (r.fehler) return meldeFehler(r.fehler);
    if (r.id) onAngelegt(r.id);
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Neue Kategorie" onClose={onClose} />
      <input
        className="field"
        placeholder="z. B. Lehrerkarten, Kuchenverkauf"
        maxLength={40}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void anlegen()}
      />
      <FarbWahl wert={farbe} setzen={setFarbe} />
      <button disabled={busy || !name.trim()} onClick={() => void anlegen()} className="btn-primary mt-4 disabled:opacity-40">
        {busy ? "…" : "Anlegen"}
      </button>
    </Sheet>
  );
}

// ==================================================================== Buchen

const heute = () => new Date().toISOString().slice(0, 10);

/**
 * Eine Einnahme oder Ausgabe buchen – überall dasselbe Formular:
 * Betrag → Wofür (Kategorie, Sonstiges oder neue Kategorie) → Bezeichnung → Tag.
 * Die Farbe kommt von der Kategorie und lässt sich für diesen Eintrag ändern.
 */
export function BuchungSheet({ start, fin, onClose }: { start: BuchungStart | null; fin: FinanzenValue; onClose: () => void }) {
  const dunkel = useDunkel();
  const [typ, setTyp] = useState<"ein" | "aus">("ein");
  const [betrag, setBetrag] = useState("");
  const [wahl, setWahl] = useState<string>(""); // "k:<id>" | "sonstiges" | "ref"
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(heute());
  const [farbe, setFarbe] = useState<string | null>(null); // null = wie die Kategorie
  const [farbeOffen, setFarbeOffen] = useState(false);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuName, setNeuName] = useState("");
  const [neuFarbe, setNeuFarbe] = useState("orange");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    if (!start) return;
    setTyp(start.typ);
    setBetrag("");
    setTitel("");
    setDatum(heute());
    setFarbe(null);
    setFarbeOffen(false);
    setNeuOffen(false);
    setFehler("");
    const r = start.ref;
    setWahl(!r ? "" : r.typ === "kategorie" ? `k:${r.id}` : r.typ === "sonstiges" ? "sonstiges" : "ref");
  }, [start]);

  const aus = typ === "aus";
  const kategorien = fin.kategorien.filter((k) => k.art === "beide" || k.art === typ || wahl === `k:${k.id}`);
  const refFremd = start?.ref && start.ref.typ !== "kategorie" && start.ref.typ !== "sonstiges" ? start.ref : null;
  const kat = wahl.startsWith("k:") ? fin.kategorien.find((k) => `k:${k.id}` === wahl) : null;
  const vorschlag = kat ? kat.farbe : wahl === "sonstiges" ? "grau" : refFremd?.typ === "komitee" ? "lila" : refFremd ? "orange" : null;
  const farbeJetzt = farbe ?? vorschlag;

  async function neueKategorie() {
    const r = await fin.postenAnlegen(neuName, neuFarbe, "beide");
    if (r.fehler) return setFehler(r.fehler);
    if (r.id) {
      setWahl(`k:${r.id}`);
      setFarbe(null);
      setNeuOffen(false);
      setNeuName("");
    }
  }

  async function speichern() {
    setFehler("");
    const c = centAus(betrag);
    if (!c || c <= 0) return setFehler("Bitte einen Betrag über 0 eingeben.");
    if (!wahl) return setFehler("Wofür? Bitte eine Kategorie oder Sonstiges wählen.");
    if (!titel.trim()) return setFehler("Bitte eine Bezeichnung eingeben.");
    const cent = aus ? -c : c;
    const q = (ein: Quelle): Quelle => (aus ? "ausgabe" : ein);
    let b: Parameters<FinanzenValue["buchen"]>[0];
    if (kat) b = { datum, cent, quelle: q("aktion"), titel, kategorie_id: kat.id };
    else if (wahl === "sonstiges") b = { datum, cent, quelle: q("sonstiges"), titel };
    else if (refFremd?.typ === "aktion") b = { datum, cent, quelle: q("aktion"), titel, aktion_id: refFremd.id };
    else if (refFremd?.typ === "komitee") b = { datum, cent, quelle: "ausgabe", titel, komitee: refFremd.komitee };
    else if (refFremd?.typ === "spende") b = { datum, cent, quelle: "spende", titel };
    else b = { datum, cent, quelle: q("sonstiges"), titel };
    // Eigene Farbe nur, wenn sie vom Vorschlag abweicht
    if (farbe && farbe !== vorschlag) b.farbe = farbe;
    setBusy(true);
    const f = await fin.buchen(b);
    setBusy(false);
    if (f) return setFehler("Hat nicht geklappt: " + f);
    onClose();
  }

  const chip = (aktiv: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-2 text-[14px] font-semibold transition active:scale-95 ${
      aktiv ? "border-brand bg-brand/10 text-tinte dark:text-white" : "border-papier-linie dark:border-slate-700"
    }`;

  return (
    <Sheet open={start !== null} onClose={onClose}>
      <SheetKopf titel={aus ? "Ausgabe" : "Einnahme"} onClose={onClose} />

      <div className="seg" role="radiogroup" aria-label="Einnahme oder Ausgabe">
        <button role="radio" aria-checked={!aus} onClick={() => setTyp("ein")} className={`seg-item !py-2 !text-[14px] ${!aus ? "seg-aktiv !text-bezahlt" : ""}`}>
          + Einnahme
        </button>
        <button role="radio" aria-checked={aus} onClick={() => setTyp("aus")} className={`seg-item !py-2 !text-[14px] ${aus ? "seg-aktiv !text-red-600 dark:!text-red-400" : ""}`}>
          − Ausgabe
        </button>
      </div>

      <div className="mt-3 flex items-center gap-1 rounded-2xl bg-[rgb(118_118_128/0.12)] px-4 dark:bg-[rgb(118_118_128/0.24)]">
        <span className={`zahl text-[1.6rem] font-bold ${aus ? "text-red-600 dark:text-red-400" : "text-bezahlt"}`}>{aus ? "−" : "+"}</span>
        <input
          className="zahl min-w-0 flex-1 bg-transparent py-3 text-[1.75rem] font-bold outline-none"
          inputMode="decimal"
          placeholder="0,00"
          aria-label="Betrag in Euro"
          value={betrag}
          onChange={(e) => setBetrag(e.target.value)}
        />
        <span className="text-xl font-bold text-tinte-matt">€</span>
      </div>

      <div className="mt-4 text-[13px] font-semibold text-tinte-leise">Wofür?</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Wofür">
        {refFremd && (
          <button type="button" role="radio" aria-checked={wahl === "ref"} onClick={() => { setWahl("ref"); setFarbe(null); }} className={chip(wahl === "ref")}>
            <Punkt hex={farbHex(refFremd.typ === "komitee" ? "lila" : "orange", dunkel)} />
            {start?.name}
          </button>
        )}
        {kategorien.map((k) => (
          <button type="button" role="radio" aria-checked={wahl === `k:${k.id}`} key={k.id} onClick={() => { setWahl(`k:${k.id}`); setFarbe(null); }} className={chip(wahl === `k:${k.id}`)}>
            <Punkt hex={farbHex(k.farbe, dunkel)} />
            {k.name}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={wahl === "sonstiges"} onClick={() => { setWahl("sonstiges"); setFarbe(null); }} className={chip(wahl === "sonstiges")}>
          <Punkt hex={farbHex("grau", dunkel)} />
          Sonstiges
        </button>
        {!neuOffen && (
          <button
            type="button"
            onClick={() => { setNeuOffen(true); setNeuFarbe(freieFarbe(fin)); }}
            className="flex items-center gap-1 rounded-full px-3 py-2 text-[14px] font-bold text-brand"
          >
            <Icon name="plus" size={14} strich={2.4} />
            Neue Kategorie
          </button>
        )}
      </div>
      {neuOffen && (
        <div className="mt-2 rounded-2xl border border-papier-linie p-2.5 dark:border-slate-700">
          <input className="field" placeholder="z. B. Lehrerkarten" maxLength={40} value={neuName} autoFocus onChange={(e) => setNeuName(e.target.value)} />
          <FarbWahl wert={neuFarbe} setzen={setNeuFarbe} />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={!neuName.trim()} onClick={() => void neueKategorie()} className="flex-1 rounded-xl bg-brand py-2 text-[14px] font-bold text-white disabled:opacity-40">
              Anlegen
            </button>
            <button type="button" onClick={() => setNeuOffen(false)} className="rounded-xl px-3 text-[14px] font-semibold text-tinte-leise">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-[13px] font-semibold text-tinte-leise">Bezeichnung</div>
      <input
        className="field mt-1.5"
        placeholder={aus ? "z. B. Verpackungsmaterial" : "z. B. Verkauf 2. Pause"}
        maxLength={80}
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void speichern()}
      />
      <p className="mt-1 text-[12px] text-tinte-leise">Für alle sichtbar – bitte keine Namen.</p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <input type="date" aria-label="Tag" className="field h-12 min-w-0" value={datum} onChange={(e) => setDatum(e.target.value)} />
        <button
          type="button"
          disabled={!farbeJetzt}
          onClick={() => setFarbeOffen(!farbeOffen)}
          className="flex h-12 min-w-0 items-center gap-2 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 text-[14px] font-semibold disabled:opacity-40 dark:bg-[rgb(118_118_128/0.24)]"
          aria-expanded={farbeOffen}
        >
          <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: farbeJetzt ? farbHex(farbeJetzt, dunkel) : "transparent" }} />
          <span className="min-w-0 flex-1 truncate text-left">Farbe</span>
          <span className="text-[13px] font-bold text-brand">{farbeOffen ? "fertig" : "ändern"}</span>
        </button>
      </div>
      {farbeOffen && farbeJetzt && <FarbWahl wert={farbeJetzt} setzen={(f) => setFarbe(f)} />}

      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
      <button disabled={busy} onClick={() => void speichern()} className="btn-primary mt-4 disabled:opacity-50">
        {busy ? "…" : aus ? "Ausgabe buchen" : "Einnahme buchen"}
      </button>
    </Sheet>
  );
}

export function FarbWahl({ wert, setzen }: { wert: string; setzen: (f: string) => void }) {
  const dunkel = useDunkel();
  return (
    <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Farbe">
      {KASSEN_FARBEN.map((f) => (
        <button
          type="button"
          key={f.key}
          role="radio"
          aria-checked={wert === f.key}
          aria-label={f.name}
          title={f.name}
          onClick={() => setzen(f.key)}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition ${wert === f.key ? "ring-2 ring-tinte/70 ring-offset-2 ring-offset-white dark:ring-white/80 dark:ring-offset-slate-900" : ""}`}
          style={{ background: dunkel ? f.dunkel : f.hell }}
        >
          {wert === f.key && <Icon name="haken" size={15} strich={3} />}
        </button>
      ))}
    </div>
  );
}

// ==================================================================== Geplante Aktionen

const heuteKey = () => new Date().toISOString().slice(0, 10);

function GeplantKarte({ darf, fin }: { darf: boolean; fin: FinanzenValue | null }) {
  const dunkel = useDunkel();
  const { liste, speichern, loeschen } = useGeplant(true);
  const [offen, setOffen] = useState<KassenGeplant | "neu" | null>(null);
  const h = heuteKey();
  // Vorbei ist vorbei – nur der Kassenwart sieht sie noch (zum Aufräumen)
  const sichtbar = liste.filter((g) => darf || !g.datum || g.datum >= h);
  const katFarbe = (id: string | null) => fin?.kategorien.find((k) => k.id === id)?.farbe ?? null;

  return (
    <section className="card p-5">
      <BereichKopf titel="Geplante Aktionen" onNeu={darf ? () => setOffen("neu") : undefined} />
      {sichtbar.length === 0 ? (
        <p className="text-[13px] text-tinte-leise">Gerade ist nichts geplant.</p>
      ) : (
        <ul className="grid gap-1.5">
          {sichtbar.map((g) => {
            const vorbei = Boolean(g.datum && g.datum < h);
            const d = g.datum ? new Date(g.datum + "T12:00:00") : null;
            const f = katFarbe(g.kategorie_id);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setOffen(g)}
                  className={`flex w-full items-center gap-3 rounded-xl bg-papier-matt px-3 py-2.5 text-left transition active:scale-[.98] dark:bg-slate-800 ${vorbei ? "opacity-60" : ""}`}
                >
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-white py-1 leading-none dark:bg-slate-900">
                    <span className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400">
                      {d ? d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "") : "–"}
                    </span>
                    <span className="zahl mt-0.5 text-[17px] font-bold">{d ? d.getDate() : "?"}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {f && <Punkt hex={farbHex(f, dunkel)} />}
                      <span className="truncate text-[14px] font-semibold">{g.titel}</span>
                    </span>
                    <span className="block truncate text-[12px] text-tinte-leise">
                      {[
                        vorbei ? "vorbei" : null,
                        g.erwartet_cent ? `ca. ${mitVorzeichen(g.erwartet_cent, true)}` : null,
                        g.info || (!vorbei && d ? d.toLocaleDateString("de-DE", { weekday: "long" }) : null),
                      ].filter(Boolean).join(" · ") || "Tag noch offen"}
                    </span>
                  </span>
                  <span className="shrink-0 text-tinte-leise" aria-hidden>
                    <Icon name="info" size={17} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <GeplantSheet
        g={offen}
        darf={darf}
        fin={fin}
        onClose={() => setOffen(null)}
        onSpeichern={speichern}
        onLoeschen={loeschen}
      />
    </section>
  );
}

function GeplantSheet({
  g, darf, fin, onClose, onSpeichern, onLoeschen,
}: {
  g: KassenGeplant | "neu" | null;
  darf: boolean;
  fin: FinanzenValue | null;
  onClose: () => void;
  onSpeichern: (g: Omit<KassenGeplant, "id"> & { id?: string }) => Promise<string | null>;
  onLoeschen: (id: string) => Promise<string | null>;
}) {
  const dunkel = useDunkel();
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState("");
  const [info, setInfo] = useState("");
  const [betrag, setBetrag] = useState("");
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const letzter = useRef<KassenGeplant | "neu" | null>(null);
  if (g) letzter.current = g;
  const x = g ?? letzter.current;
  const bestehend = x && x !== "neu" ? x : null;

  useEffect(() => {
    if (!g) return;
    const v = g === "neu" ? null : g;
    setTitel(v?.titel ?? "");
    setDatum(v?.datum ?? "");
    setInfo(v?.info ?? "");
    setBetrag(v?.erwartet_cent ? String(v.erwartet_cent / 100).replace(".", ",") : "");
    setKategorie(v?.kategorie_id ?? null);
  }, [g]);

  const kategorien = useMemo(() => fin?.kategorien ?? [], [fin]);

  if (!x) return null;

  // Nur lesen
  if (!darf && bestehend) {
    const d = bestehend.datum ? new Date(bestehend.datum + "T12:00:00") : null;
    return (
      <Sheet open={g !== null} onClose={onClose}>
        <SheetKopf
          titel={bestehend.titel}
          unter={d ? d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Tag noch offen"}
          onClose={onClose}
        />
        {bestehend.erwartet_cent != null && bestehend.erwartet_cent !== 0 && (
          <div className="mb-3 flex items-baseline gap-3 rounded-2xl bg-papier-matt p-4 dark:bg-slate-800">
            <span className="min-w-0 flex-1 text-[15px] font-semibold">Erwartet</span>
            <span className="zahl shrink-0 text-[1.4rem] font-bold">ca. {mitVorzeichen(bestehend.erwartet_cent)}</span>
          </div>
        )}
        {bestehend.info ? (
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{bestehend.info}</p>
        ) : (
          <p className="text-[14px] text-tinte-leise">Noch keine weiteren Infos.</p>
        )}
      </Sheet>
    );
  }

  async function speichern() {
    setBusy(true);
    const c = betrag.trim() ? centAus(betrag.replace(/^\+/, "")) : null;
    const f = await onSpeichern({
      id: bestehend?.id,
      titel,
      datum: datum || null,
      info,
      erwartet_cent: c,
      kategorie_id: kategorie,
    });
    setBusy(false);
    if (f) return meldeFehler(f);
    onClose();
  }

  return (
    <Sheet open={g !== null} onClose={onClose}>
      <SheetKopf titel={bestehend ? "Geplante Aktion" : "Neue geplante Aktion"} onClose={onClose} />
      <input className="field" placeholder="Titel, z. B. Lehrerkarten Winter" maxLength={80} value={titel} autoFocus={!bestehend} onChange={(e) => setTitel(e.target.value)} />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <input type="date" aria-label="Tag" className="field h-12 min-w-0" value={datum} onChange={(e) => setDatum(e.target.value)} />
        <div className="flex h-12 min-w-0 items-center gap-1 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)]">
          <span className="text-[13px] font-semibold text-tinte-leise">ca.</span>
          <input
            className="zahl min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none"
            inputMode="decimal"
            placeholder="Betrag"
            aria-label="Erwarteter Betrag in Euro (freiwillig, Minus für Ausgaben)"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
          />
          <span className="font-bold text-tinte-matt">€</span>
        </div>
      </div>
      <textarea
        className="field mt-2 min-h-[5.5rem] resize-y"
        placeholder="Infos (freiwillig): wo, wer macht mit, was fehlt noch …"
        maxLength={1000}
        value={info}
        onChange={(e) => setInfo(e.target.value)}
      />
      {kategorien.length > 0 && (
        <>
          <div className="mt-3 text-[13px] font-semibold text-tinte-leise">Kategorie (freiwillig)</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {kategorien.map((k) => (
              <button
                type="button"
                key={k.id}
                aria-pressed={kategorie === k.id}
                onClick={() => setKategorie(kategorie === k.id ? null : k.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                  kategorie === k.id ? "border-brand bg-brand/10" : "border-papier-linie dark:border-slate-700"
                }`}
              >
                <Punkt hex={farbHex(k.farbe, dunkel)} />
                {k.name}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button disabled={busy || !titel.trim()} onClick={() => void speichern()} className="btn-primary disabled:opacity-40">
          {busy ? "…" : "Speichern"}
        </button>
        {bestehend && (
          <button
            type="button"
            aria-label="Geplante Aktion löschen"
            onClick={async () => {
              if (!(await frage(`„${bestehend.titel}“ aus der Planung löschen?`, "Löschen", true))) return;
              const f = await onLoeschen(bestehend.id);
              if (f) return meldeFehler("Löschen hat nicht geklappt: " + f);
              onClose();
            }}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-red-500"
          >
            <Icon name="muell" size={19} />
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ==================================================================== Kennzahlen

/**
 * Einnahmen (+) und Ausgaben (−) als zwei ruhige Kacheln, darunter eine
 * Zeile für die offenen Elternbeiträge.
 */
export function Kennzahlen({
  ein, aus, offen,
}: {
  ein: number;
  aus: number;
  offen?: { cent: number; personen?: number; halbjahr: string } | null;
}) {
  return (
    <div className="mt-4 grid gap-2">
      <dl className="grid grid-cols-2 gap-2">
        <Kachel icon="pfeil-rein" titel="Einnahmen" wert={mitVorzeichen(ein, true)} />
        <Kachel icon="pfeil-raus" titel="Ausgaben" wert={mitVorzeichen(-aus, true)} />
      </dl>
      {offen && (
        <div className="flex items-center gap-3 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgb(118_118_128/0.14)] text-tinte-matt dark:text-slate-300">
            <Icon name="kalender" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">Offene Elternbeiträge</span>
            <span className="block truncate text-[12px] text-tinte-leise">
              fällig bis {offen.halbjahr} · {schuljahrVon(offen.halbjahr)}
              {offen.personen != null ? ` · ${offen.personen} Pers.` : ""}
            </span>
          </span>
          <span className="zahl shrink-0 text-[16px] font-bold">{euroKurz(offen.cent)}</span>
        </div>
      )}
    </div>
  );
}

function Kachel({ icon, titel, wert }: { icon: "pfeil-rein" | "pfeil-raus"; titel: string; wert: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
      <dt className="flex items-center gap-1 text-[12px] font-medium text-tinte-leise">
        <Icon name={icon} size={13} strich={2.2} />
        {titel}
      </dt>
      <dd className="zahl mt-0.5 whitespace-nowrap text-[clamp(15px,4.4vw,18px)] font-bold tracking-tight">{wert}</dd>
    </div>
  );
}
