import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { committeeLabel } from "../lib/committees";
import {
  KASSEN_FARBEN, centAus, euro, euroKurz, farbHex, postenFarbe, schuljahrVon,
  type Buchung, type FinanzPosten, type FinanzUebersicht, type FinanzenValue, type Quelle,
} from "../lib/finanzen";
import { useDunkel } from "../lib/dunkel";
import { frage, meldeFehler } from "../lib/melder";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";

/**
 * Finanzen in zwei Bereichen:
 *  1. „Aktionen, Beiträge und Sonstiges“ – Elternbeiträge (blau), jede Aktion
 *     bzw. jeder Posten in seiner Farbe, Spenden, Sonstiges (grau).
 *  2. „Ausgaben“ – was keiner Aktion gehört (Komitees, sonstige Ausgaben).
 * Jede Zeile lässt sich antippen: Einnahmen, Ausgaben, Gewinn und – wenn es
 * mehrere Tage gab – die einzelnen Termine.
 *
 * Mit `fin` (Kassenwart/Admin, „Kassenbuch führen“) kann man im Detail
 * direkt Einnahmen/Ausgaben hinzufügen, Einträge löschen, Name und Farbe
 * ändern – und über „＋ Neu“ einen Posten anlegen.
 */

const PHASEN: [string, string][] = [
  ["EF", "Einführungsphase (EF)"],
  ["Q1", "Qualifikationsphase 1 (Q1)"],
  ["Q2", "Qualifikationsphase 2 (Q2)"],
];

type Auswahl = { typ: "beitraege" } | { typ: "posten"; key: string } | null;

export function postenKey(p: FinanzPosten): string {
  if (p.ref?.typ === "kategorie") return `k:${p.ref.id}`;
  if (p.ref?.typ === "aktion") return `a:${p.ref.id}`;
  return `${p.art}|${p.titel}`;
}

function anzeigeName(p: FinanzPosten): string {
  return p.art === "komitee" ? committeeLabel(p.titel) : p.titel;
}

const REIHENFOLGE: Record<FinanzPosten["art"], number> = { kategorie: 0, aktion: 0, spende: 1, sonstiges: 2, komitee: 0, ausgabe: 1 };

export function PostenBereiche({ d, fin }: { d: FinanzUebersicht; fin?: FinanzenValue | null }) {
  const dunkel = useDunkel();
  const [auswahl, setAuswahl] = useState<Auswahl>(null);
  const [neu, setNeu] = useState<"ein" | "aus" | null>(null);

  const beitraegeSumme = d.beitraege.reduce((n, b) => n + b.cent, 0);
  const sortiert = (liste: FinanzPosten[], wert: (p: FinanzPosten) => number) =>
    [...liste].sort((a, b) => REIHENFOLGE[a.art] - REIHENFOLGE[b.art] || wert(b) - wert(a));
  const einnahmen = sortiert(d.posten.filter((p) => (p.bereich ?? "ein") === "ein"), (p) => p.ein_cent);
  const ausgaben = sortiert(d.posten.filter((p) => p.bereich === "aus"), (p) => p.aus_cent);
  const gewaehlt = auswahl?.typ === "posten" ? d.posten.find((p) => postenKey(p) === auswahl.key) ?? null : null;

  return (
    <>
      {/* ------------------------------------------------ Bereich 1 */}
      <section className="card p-5">
        <BereichKopf titel="Aktionen, Beiträge und Sonstiges" onNeu={fin ? () => setNeu("ein") : undefined} />
        <ul className="grid gap-1.5">
          <PostenZeile
            hex={farbHex("blau", dunkel)}
            name="Elternbeiträge"
            unter={beitraegeSumme > 0 ? d.beitraege.map((b) => b.phase).join(" · ") : "noch nichts verbucht"}
            betrag={beitraegeSumme}
            onClick={() => setAuswahl({ typ: "beitraege" })}
          />
          {einnahmen.map((p) => (
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

      {/* ------------------------------------------------ Bereich 2 */}
      <section className="card p-5">
        <BereichKopf titel="Ausgaben" onNeu={fin ? () => setNeu("aus") : undefined} />
        {ausgaben.length === 0 ? (
          <p className="text-[13px] text-tinte-leise">Noch keine Ausgaben.</p>
        ) : (
          <ul className="grid gap-1.5">
            {ausgaben.map((p) => (
              <PostenZeile
                key={postenKey(p)}
                hex={farbHex(postenFarbe(p), dunkel)}
                name={anzeigeName(p)}
                unter={unterzeile(p)}
                betrag={p.ein_cent - p.aus_cent}
                neutral
                onClick={() => setAuswahl({ typ: "posten", key: postenKey(p) })}
              />
            ))}
          </ul>
        )}
      </section>

      <BeitraegeDetail open={auswahl?.typ === "beitraege"} d={d} onClose={() => setAuswahl(null)} />
      <PostenDetail p={gewaehlt} fin={fin ?? null} onClose={() => setAuswahl(null)} onUmgezogen={(key) => setAuswahl({ typ: "posten", key })} />
      {fin && (
        <NeuSheet
          bereich={neu}
          fin={fin}
          onClose={() => setNeu(null)}
          onAngelegt={(id) => {
            setNeu(null);
            setAuswahl({ typ: "posten", key: `k:${id}` });
          }}
        />
      )}
    </>
  );
}

function unterzeile(p: FinanzPosten): string | undefined {
  const tage = p.termine?.length ?? 0;
  if (p.ein_cent > 0 && p.aus_cent > 0) return `${euroKurz(p.ein_cent)} rein · ${euroKurz(p.aus_cent)} raus`;
  if (tage > 1) return `${tage} Termine`;
  if (p.anzahl === 0) return "noch leer – antippen zum Füllen";
  return undefined;
}

function BereichKopf({ titel, onNeu }: { titel: string; onNeu?: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="min-w-0 flex-1 text-[17px] font-bold leading-tight">{titel}</h2>
      {onNeu && (
        <button
          type="button"
          onClick={onNeu}
          className="flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-[13px] font-bold text-brand active:scale-95 dark:bg-brand/20"
        >
          <Icon name="plus" size={14} strich={2.4} />
          Neu
        </button>
      )}
    </div>
  );
}

function Punkt({ hex, gross }: { hex: string; gross?: boolean }) {
  return <span aria-hidden className={`${gross ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} shrink-0 rounded-full`} style={{ background: hex }} />;
}

/** Betrag mit Minus; rot nur, wo ein Minus eine Warnung ist (Verlust). */
function Vorzeichen({ cent, className = "", neutral }: { cent: number; className?: string; neutral?: boolean }) {
  return (
    <span className={`zahl ${cent < 0 && !neutral ? "text-red-600 dark:text-red-400" : ""} ${className}`}>
      {cent < 0 ? "−" : ""}
      {euro(Math.abs(cent))}
    </span>
  );
}

function PostenZeile({
  hex, name, unter, betrag, onClick, neutral,
}: {
  hex: string;
  name: string;
  unter?: string;
  betrag: number;
  onClick: () => void;
  neutral?: boolean;
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
          {unter && <span className="block truncate text-[12px] text-tinte-leise">{unter}</span>}
        </span>
        <Vorzeichen cent={betrag} neutral={neutral} className="shrink-0 text-[15px] font-bold" />
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
          {PHASEN.map(([k, name]) => {
            const c = d.beitraege.find((b) => b.phase === k)?.cent ?? 0;
            return (
              <li key={k} className="flex items-baseline gap-3 text-[15px]">
                <span className={`min-w-0 flex-1 ${c ? "font-semibold" : "text-tinte-leise"}`}>Elternbeiträge der {k}</span>
                <span className={`zahl shrink-0 ${c ? "font-bold" : "text-tinte-leise"}`}>{c ? euro(c) : "–"}</span>
                <span className="sr-only">{name}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-baseline gap-3 border-t border-papier-linie pt-3 dark:border-slate-700">
          <span className="min-w-0 flex-1 text-[15px] font-bold">Zusammen</span>
          <span className="zahl shrink-0 text-[1.5rem] font-bold tracking-tight">{euro(summe)}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-tinte-leise">
        Offen bis {d.halbjahr} ({schuljahrVon(d.halbjahr)}): {euroKurz(d.offen_cent)}
      </p>
    </Sheet>
  );
}

/** Welche Seiten ein Posten beim Hinzufügen anbietet. */
function seiten(p: FinanzPosten): ("ein" | "aus")[] {
  const r = p.ref;
  if (!r) return [];
  if (r.typ === "kategorie") return r.art === "ein" ? ["ein"] : r.art === "aus" ? ["aus"] : ["ein", "aus"];
  if (r.typ === "aktion") return ["ein", "aus"];
  if (r.typ === "komitee" || r.typ === "ausgabe") return ["aus"];
  return ["ein"];
}

/** Neue Buchung passend zum Posten. */
function buchungFuer(p: FinanzPosten, seite: "ein" | "aus", cent: number, datum: string) {
  const r = p.ref!;
  const aus = seite === "aus";
  const basis = { datum, cent: aus ? -cent : cent, titel: anzeigeName(p) };
  const q = (ein: Quelle): Quelle => (aus ? "ausgabe" : ein);
  switch (r.typ) {
    case "kategorie": return { ...basis, quelle: q("aktion"), kategorie_id: r.id };
    case "aktion": return { ...basis, quelle: q("aktion"), aktion_id: r.id };
    case "aktionTitel": return { ...basis, quelle: q("aktion"), titel: r.titel };
    case "spende": return { ...basis, quelle: "spende" as Quelle, titel: "Spende" };
    case "sonstiges": return { ...basis, quelle: "sonstiges" as Quelle, titel: "Sonstiges" };
    case "komitee": return { ...basis, quelle: "ausgabe" as Quelle, komitee: r.komitee };
    case "ausgabe": return { ...basis, quelle: "ausgabe" as Quelle, titel: "Ausgabe" };
  }
}

const heute = () => new Date().toISOString().slice(0, 10);
const tagKurz = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" });

function PostenDetail({
  p, fin, onClose, onUmgezogen,
}: {
  p: FinanzPosten | null;
  fin: FinanzenValue | null;
  onClose: () => void;
  onUmgezogen: (key: string) => void;
}) {
  const dunkel = useDunkel();
  const [bearbeiten, setBearbeiten] = useState(false);
  // Beim Schließen bleibt der letzte Posten stehen, damit das Sheet sauber wegfährt
  const letzter = useRef<FinanzPosten | null>(null);
  if (p) letzter.current = p;
  const x = p ?? letzter.current;
  useEffect(() => setBearbeiten(false), [p && postenKey(p)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!x) return null;
  const gewinn = x.ein_cent - x.aus_cent;
  const hex = farbHex(postenFarbe(x), dunkel);
  const darf = Boolean(fin && x.ref);
  const umbenennbar = darf && (x.ref!.typ === "kategorie" || x.ref!.typ === "aktion");
  const nurAus = x.bereich === "aus";

  return (
    <Sheet open={p !== null} onClose={onClose}>
      <Kopf
        hex={hex}
        titel={anzeigeName(x)}
        onClose={onClose}
        rechts={
          umbenennbar && !bearbeiten ? (
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold text-brand"
            >
              Ändern
            </button>
          ) : null
        }
      />

      {bearbeiten && fin && <Bearbeiten p={x} fin={fin} onFertig={() => setBearbeiten(false)} onUmgezogen={onUmgezogen} onGeloescht={onClose} />}

      {/* Die Rechnung: Einnahmen − Ausgaben = Gewinn */}
      <div className="rounded-2xl bg-papier-matt p-4 dark:bg-slate-800">
        {nurAus && x.ein_cent === 0 ? (
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 text-[15px] font-bold">Ausgaben</span>
            <span className="zahl shrink-0 text-[1.5rem] font-bold tracking-tight">{euro(x.aus_cent)}</span>
          </div>
        ) : (
          <>
            <Balken ein={x.ein_cent} aus={x.aus_cent} hex={hex} />
            <dl className="mt-3 grid gap-1.5 text-[15px]">
              <div className="flex items-baseline gap-3">
                <dt className="min-w-0 flex-1 font-semibold">Einnahmen</dt>
                <dd className="zahl shrink-0 font-semibold">{euro(x.ein_cent)}</dd>
              </div>
              <div className="flex items-baseline gap-3">
                <dt className="min-w-0 flex-1 font-semibold">Ausgaben</dt>
                <dd className="zahl shrink-0 font-semibold">{x.aus_cent ? "−" : ""}{euro(x.aus_cent)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-baseline gap-3 border-t border-papier-linie pt-3 dark:border-slate-700">
              <span className="min-w-0 flex-1 text-[15px] font-bold">{gewinn < 0 ? "Verlust" : "Gewinn"}</span>
              <Vorzeichen cent={gewinn} className="shrink-0 text-[1.5rem] font-bold tracking-tight" />
            </div>
          </>
        )}
      </div>

      {darf && fin ? (
        <>
          <Hinzufuegen p={x} fin={fin} />
          <Eintraege buchungen={x.buchungen ?? []} fin={fin} />
        </>
      ) : (
        (x.termine?.length ?? 0) > 1 && <Termine termine={x.termine!} />
      )}
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

function Termine({ termine }: { termine: { datum: string; ein_cent: number; aus_cent: number }[] }) {
  return (
    <>
      <h3 className="mb-1.5 mt-5 text-[13px] font-semibold uppercase tracking-wide text-tinte-leise">Einzelne Termine</h3>
      <ul className="grid gap-1">
        {[...termine].reverse().map((t) => (
          <li key={t.datum} className="flex items-baseline gap-3 rounded-xl px-1 py-1.5 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{tagKurz(t.datum)}</span>
            {t.ein_cent > 0 && t.aus_cent > 0 && (
              <span className="zahl shrink-0 text-[12px] text-tinte-leise">
                {euroKurz(t.ein_cent)} − {euroKurz(t.aus_cent)}
              </span>
            )}
            <Vorzeichen cent={t.ein_cent - t.aus_cent} className="shrink-0 font-bold" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Kassenwart: Betrag + Tag → fertig. Einzelne Termine oder alles auf einmal. */
function Hinzufuegen({ p, fin }: { p: FinanzPosten; fin: FinanzenValue }) {
  const moeglich = seiten(p);
  const [seite, setSeite] = useState<"ein" | "aus">(moeglich[0] ?? "ein");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(heute());
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setSeite(moeglich[0] ?? "ein");
    setBetrag("");
  }, [postenKey(p)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!moeglich.length) return null;

  async function los() {
    const c = centAus(betrag);
    if (!c || c <= 0) return meldeFehler("Bitte einen Betrag über 0 eingeben.");
    setBusy(true);
    const f = await fin.buchen(buchungFuer(p, seite, c, datum));
    setBusy(false);
    if (f) return meldeFehler("Hat nicht geklappt: " + f);
    setBetrag("");
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  }

  const aus = seite === "aus";
  return (
    <div className="mt-5">
      {moeglich.length > 1 && (
        <div className="seg mb-2" role="radiogroup" aria-label="Einnahme oder Ausgabe">
          <button role="radio" aria-checked={!aus} onClick={() => setSeite("ein")} className={`seg-item !py-2 !text-[14px] ${!aus ? "seg-aktiv !text-bezahlt" : ""}`}>
            ＋ Einnahme
          </button>
          <button role="radio" aria-checked={aus} onClick={() => setSeite("aus")} className={`seg-item !py-2 !text-[14px] ${aus ? "seg-aktiv !text-red-600 dark:!text-red-400" : ""}`}>
            − Ausgabe
          </button>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9.5rem)] gap-2">
        <div className="flex min-w-0 items-center gap-1 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)]">
          <span className={`zahl text-[1.1rem] font-bold ${aus ? "text-red-600 dark:text-red-400" : "text-bezahlt"}`}>{aus ? "−" : "+"}</span>
          <input
            className="zahl min-w-0 flex-1 bg-transparent py-2.5 text-[1.1rem] font-bold outline-none"
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Betrag in Euro"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void los()}
          />
          <span className="font-bold text-tinte-matt">€</span>
        </div>
        <input type="date" aria-label="Tag" className="field h-full min-w-0" value={datum} onChange={(e) => setDatum(e.target.value)} />
      </div>
      <button disabled={busy} onClick={() => void los()} className="btn-primary mt-2 disabled:opacity-50">
        {busy ? "…" : ok ? "✓ Hinzugefügt" : aus ? "Ausgabe hinzufügen" : "Einnahme hinzufügen"}
      </button>
    </div>
  );
}

/** Kassenwart: die einzelnen Buchungen des Postens, mit Löschen. */
function Eintraege({ buchungen, fin }: { buchungen: Buchung[]; fin: FinanzenValue }) {
  if (!buchungen.length) return null;
  const liste = [...buchungen].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : a.created_at < b.created_at ? 1 : -1));
  return (
    <>
      <h3 className="mb-1.5 mt-5 text-[13px] font-semibold uppercase tracking-wide text-tinte-leise">
        {liste.length === 1 ? "Eintrag" : `${liste.length} Einträge`}
      </h3>
      <ul className="grid gap-1">
        {liste.map((b) => (
          <li key={b.id} className="flex items-center gap-2 rounded-xl px-1 py-1 text-[14px]">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{tagKurz(b.datum)}</span>
            </span>
            <Vorzeichen cent={b.cent} neutral className="shrink-0 font-bold" />
            {!b.automatisch && b.quelle !== "abgleich" ? (
              <button
                type="button"
                aria-label="Eintrag löschen"
                onClick={async () => {
                  if (!(await frage(`Eintrag vom ${tagKurz(b.datum)} über ${euro(Math.abs(b.cent))} löschen?`, "Löschen", true))) return;
                  const f = await fin.loeschen(b.id);
                  if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tinte-leise active:bg-papier-matt dark:active:bg-slate-800"
              >
                <Icon name="muell" size={16} />
              </button>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Name und Farbe ändern. Eine Aktion bekommt dabei einen eigenen Posten mit Farbe. */
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
      // Aktion → eigener Posten mit Farbe; die bisherigen Buchungen ziehen mit
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
            aria-label="Posten löschen"
            onClick={async () => {
              if (!(await frage(`„${p.titel}“ löschen? Die Einträge bleiben im Kassenbuch, nur ohne Posten.`, "Löschen", true))) return;
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

/** Neuer Posten: Name + Farbe, sonst nichts. Danach öffnet er sich zum Füllen. */
function NeuSheet({
  bereich, fin, onClose, onAngelegt,
}: {
  bereich: "ein" | "aus" | null;
  fin: FinanzenValue;
  onClose: () => void;
  onAngelegt: (id: string) => void;
}) {
  const vorschlag = useMemo(() => {
    const belegt = new Set(fin.kategorien.map((k) => k.farbe));
    return KASSEN_FARBEN.find((f) => !["blau", "grau"].includes(f.key) && !belegt.has(f.key))?.key ?? "orange";
  }, [fin.kategorien]);
  const [name, setName] = useState("");
  const [farbe, setFarbe] = useState(vorschlag);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bereich) return;
    setName("");
    setFarbe(bereich === "aus" ? "lila" : vorschlag);
  }, [bereich]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anlegen() {
    setBusy(true);
    const r = await fin.postenAnlegen(name, farbe, bereich === "aus" ? "aus" : "beide");
    setBusy(false);
    if (r.fehler) return meldeFehler(r.fehler);
    if (r.id) onAngelegt(r.id);
  }

  return (
    <Sheet open={bereich !== null} onClose={onClose}>
      <SheetKopf titel={bereich === "aus" ? "Neue Ausgabe" : "Neue Aktion"} onClose={onClose} />
      <input
        className="field"
        placeholder={bereich === "aus" ? "z. B. Deko, Druck" : "z. B. Lehrerkarten, Kuchenverkauf"}
        maxLength={40}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void anlegen()}
      />
      <FarbWahl wert={farbe} setzen={setFarbe} />
      <button disabled={busy || !name.trim()} onClick={() => void anlegen()} className="btn-primary mt-4 disabled:opacity-40">
        {busy ? "…" : "Weiter"}
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

// ==================================================================== Kennzahlen

/**
 * Einnahmen und Ausgaben als zwei ruhige Kacheln, darunter eine Zeile für die
 * offenen Elternbeiträge – statt dreier gequetschter Kacheln auf dem Handy.
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
        <Kachel icon="pfeil-rein" titel="Einnahmen" wert={euroKurz(ein)} />
        <Kachel icon="pfeil-raus" titel="Ausgaben" wert={euroKurz(aus)} />
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
