import { useEffect, useMemo, useState } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useTermine } from "../termine-store";
import { useProfiles } from "../profiles-store";
import { basisOffen } from "../lib/logic";
import { FinanzStandard } from "./FinanzStandard";
import { BuchungSheet, FarbWahl, Kennzahlen, PostenBereiche } from "./FinanzBereiche";
import { committeeIcon, committeeLabel } from "../lib/committees";
import {
  EINNAHME_QUELLEN, QUELLE_NAME, STANDARD_FARBE, buchungFarbe, centAus, euro, euroKurz, farbHex,
  uebersichtAus, useFinanzen,
  type Buchung, type FinanzenValue, type KassenKategorie,
} from "../lib/finanzen";
import type { KostenAnfrage, KostenValue } from "../lib/kosten";
import { Sheet, SheetKopf } from "./Sheet";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";

import { frage, meldeFehler } from "../lib/melder";
import { useDunkel } from "../lib/dunkel";

const heute = () => new Date().toISOString().slice(0, 10);
const kurzTag = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Wofür eine Buchung ist – in einem Wort. */
function zuweisungText(b: Buchung, aktionName: (id: string) => string): string {
  if (b.aktion_id && aktionName(b.aktion_id)) return aktionName(b.aktion_id);
  if (b.komitee) return committeeLabel(b.komitee);
  return QUELLE_NAME[b.quelle];
}

/**
 * Reiter "Finanzen".
 *
 * Wer was sieht:
 *  - Kassenwart/Admin ("Kassenbuch führen"): alles, bucht, entscheidet Kostenanfragen
 *  - "Finanzen ansehen" (vom Admin freigeschaltet) und der Aufsichtsrat: alles, nur lesen
 *  - Komitee-Vorsitzende: nur ihre Kostenanfragen
 */
export function FinanzenTab({ kosten }: { kosten: KostenValue }) {
  const { can, isStaff } = useRole();
  const darfBuchen = can("finanzen.manage");
  const darfSehen = darfBuchen || can("finanzen.view") || kosten.aufsichtsrat;
  const nurLesen = darfSehen && !darfBuchen;
  const fin = useFinanzen(darfSehen);
  const { students, settings } = useStore();
  const { aktionen, meineVorsitze } = useTermine();
  const [buchen, setBuchen] = useState<"ein" | "aus" | null>(null);
  const [einstellungen, setEinstellungen] = useState(false);
  const darfStandard = can("finanzen.basis");
  // Wer alles sieht, kann zur Kontrolle auf die Ansicht für alle umschalten.
  const [ansicht, setAnsicht] = useState<"standard" | "erweitert">("erweitert");

  const aktionName = (id: string) => aktionen.find((a) => a.id === id)?.titel || "";

  // ------------------------------------------------ Zahlen
  const zahlen = useMemo(() => {
    let stand = 0;
    let ein = 0;
    let aus = 0;
    const jeQuelle: Record<string, number> = { beitrag: 0, aktion: 0, spende: 0, sonstiges: 0 };
    // Einnahmen je Kategorie (eigene Farbe) bzw. je Herkunft – für den Kreis
    const gruppen = new Map<string, { key: string; label: string; farbe: string; cent: number }>();
    let letzterAbgleich: string | null = null;
    let abgleich = 0;
    // Elternbeiträge netto: ein wieder ausgetragener Beitrag hebt sich mit
    // seiner Zahlung auf und erscheint nicht als Ausgabe
    let beitraege = 0;
    for (const b of fin.buchungen) {
      stand += b.cent;
      if (b.quelle === "beitrag") {
        beitraege += b.cent;
        continue;
      }
      // Bankabgleich zählt als "Sonstiges" – so gilt: Einnahmen − Ausgaben = Kontostand
      if (b.quelle === "abgleich") {
        abgleich += b.cent;
        if (!letzterAbgleich || b.datum > letzterAbgleich) letzterAbgleich = b.datum;
      }
      if (b.cent < 0) {
        aus += -b.cent;
        continue;
      }
      ein += b.cent;
      const quelle = b.quelle === "abgleich" ? "sonstiges" : b.quelle;
      jeQuelle[quelle] = (jeQuelle[quelle] || 0) + b.cent;
      const kat = b.kategorie_id ? fin.kategorien.find((k) => k.id === b.kategorie_id) : null;
      const key = kat ? `k:${kat.id}` : `q:${quelle}`;
      const g = gruppen.get(key) || {
        key,
        label: kat ? kat.name : EINNAHME_QUELLEN.find((q) => q.key === quelle)?.label || QUELLE_NAME[quelle],
        farbe: kat ? kat.farbe : STANDARD_FARBE[quelle] || "grau",
        cent: 0,
      };
      g.cent += b.cent;
      gruppen.set(key, g);
    }
    if (beitraege > 0) {
      ein += beitraege;
      jeQuelle.beitrag += beitraege;
      gruppen.set("q:beitrag", { key: "q:beitrag", label: "Elternbeiträge", farbe: "blau", cent: beitraege });
    } else aus += -beitraege;
    return { stand, ein, aus, jeQuelle, letzterAbgleich, abgleich, gruppen: [...gruppen.values()].sort((a, b) => b.cent - a.cent) };
  }, [fin.buchungen, fin.kategorien]);

  const offen = useMemo(() => {
    let cent = 0;
    let personen = 0;
    for (const s of students) {
      const o = basisOffen(s, settings.aktuelles_halbjahr, settings);
      if (o > 0) {
        cent += Math.round(o * 100);
        personen++;
      }
    }
    return { cent, personen };
  }, [students, settings]);

  // Dieselben zwei Bereiche wie in der Standard-Ansicht – hier mit Bearbeiten
  const postenDaten = useMemo(
    () => uebersichtAus(fin.buchungen, fin.ziel, offen, settings.aktuelles_halbjahr, aktionName, fin.kategorien, true),
    [fin.buchungen, fin.ziel, fin.kategorien, offen, settings.aktuelles_halbjahr, aktionen], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Standard-Ansicht: Summen ohne Namen (Schüler, Eltern – oder zur Kontrolle)
  if ((!darfSehen && darfStandard) || (darfSehen && ansicht === "standard")) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {darfSehen && <AnsichtWahl ansicht={ansicht} setAnsicht={setAnsicht} />}
        <FinanzStandard aktionName={aktionName} />
        {!darfSehen && meineVorsitze.length > 0 && (
          <KostenKarte kosten={kosten} darfEntscheiden={false} vorsitze={meineVorsitze} />
        )}
      </div>
    );
  }

  // Nur Vorsitz, keine Finanzrechte: nur die Kostenanfragen
  if (!darfSehen) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6">
        <KostenKarte kosten={kosten} darfEntscheiden={false} vorsitze={meineVorsitze} />
      </div>
    );
  }

  if (!fin.bereit)
    return (
      <SkelettKarten n={3} gross />
    );

  if (fin.fehler)
    return (
      <div className="card p-6 text-center text-sm text-tinte-matt">
        Das Kassenbuch lässt sich nicht laden: {fin.fehler}
      </div>
    );

  const zeigeAnfragen = darfSehen || meineVorsitze.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="lg:col-span-2">
        <AnsichtWahl ansicht={ansicht} setAnsicht={setAnsicht} />
      </div>
      {nurLesen && (
        <div className="flex items-center gap-2 rounded-2xl bg-[rgb(118_118_128/0.1)] px-4 py-2.5 text-[14px] text-tinte-matt dark:text-slate-300 lg:col-span-2">
          <Icon name="info" size={17} />
          Nur lesen{kosten.aufsichtsrat ? " – du siehst die Finanzen als Aufsichtsrat" : ""}. Buchen kann nur der Kassenwart.
        </div>
      )}

      {/* ================================================ Übersicht */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <UebersichtKarte
          zahlen={zahlen}
          offen={isStaff ? offen : null}
          halbjahr={settings.aktuelles_halbjahr}
          ziel={fin.ziel}
          darf={darfBuchen}
          onEinstellungen={() => setEinstellungen(true)}
        />
        {darfBuchen && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBuchen("ein")}
              className="flex min-h-[3.125rem] items-center justify-center gap-1.5 rounded-full bg-bezahlt/[0.12] text-[16px] font-semibold text-bezahlt transition duration-200 ease-ios active:scale-[.97]"
            >
              <Icon name="plus" size={17} strich={2.4} />
              Einnahme
            </button>
            <button
              onClick={() => setBuchen("aus")}
              className="flex min-h-[3.125rem] items-center justify-center gap-1.5 rounded-full bg-red-500/[0.12] text-[16px] font-semibold text-red-600 transition duration-200 ease-ios active:scale-[.97] dark:text-red-400"
            >
              <span className="text-[20px] leading-none">−</span>
              Ausgabe
            </button>
          </div>
        )}
      </div>

      {/* ================================================ Aktionen, Beiträge, Ausgaben */}
      <PostenBereiche d={postenDaten} fin={darfBuchen ? fin : null} />

      {/* ================================================ Kostenanfragen */}
      {zeigeAnfragen && (
        <KostenKarte kosten={kosten} darfEntscheiden={darfBuchen} vorsitze={meineVorsitze} onEntschieden={fin.neuLaden} />
      )}

      {/* ================================================ Verlauf */}
      <VerlaufKarte
        buchungen={fin.buchungen}
        kategorien={fin.kategorien}
        darf={darfBuchen}
        onLoeschen={fin.loeschen}
        onKategorie={fin.buchungKategorie}
        aktionName={aktionName}
      />

      {darfBuchen && (
        <>
          <BuchungSheet start={buchen ? { typ: buchen } : null} fin={fin} onClose={() => setBuchen(null)} />
          <EinstellungenSheet
            open={einstellungen}
            onClose={() => setEinstellungen(false)}
            fin={fin}
            stand={zahlen.stand}
          />
        </>
      )}
    </div>
  );
}

// ==================================================================== Ansicht wählen

/** Standard (was alle sehen) oder Erweitert (alle Buchungen) – nur für wer alles sieht. */
function AnsichtWahl({ ansicht, setAnsicht }: { ansicht: "standard" | "erweitert"; setAnsicht: (a: "standard" | "erweitert") => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[rgb(118_118_128/0.12)] p-1" role="tablist" aria-label="Ansicht der Finanzen">
      {([["standard", "Standard – wie alle"], ["erweitert", "Erweitert – alle Buchungen"]] as const).map(([k, label]) => (
        <button
          key={k}
          role="tab"
          aria-selected={ansicht === k}
          onClick={() => setAnsicht(k)}
          className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[13px] font-semibold transition ${
            ansicht === k ? "bg-white text-tinte shadow-sm dark:bg-slate-700 dark:text-white" : "text-tinte-matt dark:text-slate-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ==================================================================== Übersicht

function UebersichtKarte({
  zahlen, offen, halbjahr, ziel, darf, onEinstellungen,
}: {
  zahlen: {
    stand: number; ein: number; aus: number; jeQuelle: Record<string, number>; letzterAbgleich: string | null; abgleich: number;
    gruppen: { key: string; label: string; farbe: string; cent: number }[];
  };
  /** null: wer nicht alle Personen sieht, bekäme hier eine falsche Summe */
  offen: { cent: number; personen: number } | null;
  halbjahr: string;
  ziel: { ziel_cent: number; ziel_titel: string };
  darf: boolean;
  onEinstellungen: () => void;
}) {
  const dunkel = useDunkel();
  // Jede Kategorie bzw. Herkunft ein Bogen – in ihrer Farbe
  const teile = zahlen.gruppen.map((g) => ({ key: g.key, label: g.label, farbe: farbHex(g.farbe, dunkel), cent: Math.max(0, g.cent) }));
  const summe = teile.reduce((n, t) => n + t.cent, 0);
  // Wie in der Standard-Ansicht: Fortschritt = Kontostand / Ziel. Die Bögen
  // teilen diesen Anteil nach Herkunft der Einnahmen auf.
  const stand = Math.max(0, zahlen.stand);
  const ganz =
    ziel.ziel_cent > 0 && stand > 0 && stand < ziel.ziel_cent ? (summe * ziel.ziel_cent) / stand : summe;
  const prozent = ziel.ziel_cent > 0 ? Math.round((stand / ziel.ziel_cent) * 100) : null;

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-tinte-leise">Kontostand</div>
          <div
            className={`zahl mt-1 font-zahl text-[2.5rem] font-bold leading-none tracking-[-0.03em] ${
              zahlen.stand < 0 ? "text-red-600 dark:text-red-400" : ""
            }`}
          >
            {euro(zahlen.stand)}
          </div>
          <div className="mt-1.5 text-[12px] text-tinte-leise">
            {zahlen.letzterAbgleich
              ? `Einnahmen − Ausgaben · Bankabgleich (unter Sonstiges) zuletzt ${new Date(zahlen.letzterAbgleich).toLocaleDateString("de-DE")}`
              : "noch nicht mit der Bank abgeglichen"}
          </div>
        </div>
        {darf && (
          <button onClick={onEinstellungen} className="iconbtn shrink-0" aria-label="Ziel, Kategorien und Bankabgleich" title="Ziel, Kategorien und Bankabgleich">
            <Icon name="regler" size={19} />
          </button>
        )}
      </div>

      <Kennzahlen ein={zahlen.ein} aus={zahlen.aus} offen={offen ? { ...offen, halbjahr } : null} />

      {/* Kreis + Legende */}
      <div className="mt-4 flex flex-col items-center gap-4 border-t border-papier-linie pt-4 dark:border-slate-800 sm:flex-row">
        <Kreis teile={teile} ganz={ganz} prozent={prozent} summe={summe} dunkel={dunkel} />
        <div className="w-full min-w-0 sm:flex-1">
          <div className="mb-1.5 text-[13px] font-bold">
            {ziel.ziel_cent > 0 ? `Ziel ${ziel.ziel_titel}: ${euroKurz(ziel.ziel_cent)}` : "Woher das Geld kommt"}
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {teile.map((t) => (
              <li key={t.key} className="flex items-center gap-2.5 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.farbe }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{t.label}</span>
                <span className="zahl shrink-0 font-bold">{euroKurz(t.cent)}</span>
              </li>
            ))}
            {zahlen.aus > 0 && (
              <li className="flex items-center gap-2.5 text-[13px] text-tinte-leise">
                <span className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">abzüglich Ausgaben</span>
                <span className="zahl shrink-0 font-bold">−{euroKurz(zahlen.aus)}</span>
              </li>
            )}
            {ziel.ziel_cent > stand && (
              <li className="flex items-center gap-2.5 text-[13px] text-tinte-leise">
                <span className="h-3 w-3 shrink-0 rounded-full bg-papier-linie dark:bg-slate-700" />
                <span className="min-w-0 flex-1 truncate">Fehlt noch</span>
                <span className="zahl shrink-0 font-bold">{euroKurz(ziel.ziel_cent - stand)}</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Kategorie einer vorhandenen Buchung umhängen (Chips, eine Auswahl). */
function KategorieWahl({
  kategorien, wert, setzen,
}: {
  kategorien: KassenKategorie[];
  wert: string | null;
  setzen: (id: string | null) => void;
}) {
  const dunkel = useDunkel();
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setzen(null)}
        className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
          wert === null ? "border-brand text-brand" : "border-papier-linie text-tinte-leise dark:border-slate-700"
        }`}
      >
        Sonstiges
      </button>
      {kategorien.map((k) => (
        <button
          type="button"
          key={k.id}
          onClick={() => setzen(k.id)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
            wert === k.id ? "border-brand bg-brand/10" : "border-papier-linie dark:border-slate-700"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: farbHex(k.farbe, dunkel) }} />
          {k.name}
        </button>
      ))}
    </div>
  );
}

// ==================================================================== Einstellungen

/** Selten gebraucht, darum im Zahnrad: Zielbetrag und Abgleich mit der Bank. */
function EinstellungenSheet({
  open, onClose, fin, stand,
}: {
  open: boolean;
  onClose: () => void;
  fin: FinanzenValue;
  stand: number;
}) {
  const [titel, setTitel] = useState("");
  const [betrag, setBetrag] = useState("");
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitel(fin.ziel.ziel_titel);
    setBetrag(fin.ziel.ziel_cent ? String(fin.ziel.ziel_cent / 100).replace(".", ",") : "");
    setBank("");
  }, [open, fin.ziel]);

  const c = centAus(bank);
  const diff = c === null ? null : c - stand;

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Ziel, Kategorien & Bank" onClose={onClose} />

      <h3 className="text-[15px] font-semibold">Sparziel</h3>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
        <input className="field" placeholder="Wofür? z. B. Abiball" value={titel} onChange={(e) => setTitel(e.target.value)} />
        <input className="field text-right" inputMode="decimal" placeholder="Betrag €" value={betrag} onChange={(e) => setBetrag(e.target.value)} />
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const f = await fin.zielSetzen({ ziel_cent: Math.max(0, centAus(betrag) ?? 0), ziel_titel: titel.trim() || "Abiball" });
          setBusy(false);
          if (f) meldeFehler("Hat nicht geklappt: " + f);
          else onClose();
        }}
        className="btn-primary mt-2"
      >
        Ziel speichern
      </button>

      <h3 className="mt-6 text-[15px] font-semibold">Mit der Bank abgleichen</h3>
      <p className="text-[12px] text-tinte-leise">
        Stand aus dem Online-Banking eintragen. Die Differenz wird als Abgleich gebucht.
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          className="field min-w-0 flex-1"
          inputMode="decimal"
          placeholder="Stand laut Bank"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
        />
        <button
          disabled={busy || diff === null || diff === 0}
          onClick={async () => {
            if (diff === null || diff === 0) return;
            if (!(await frage(`Kontostand auf ${euro(c!)} setzen? Gebucht wird ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}.`, "Buchen"))) return;
            setBusy(true);
            const f = await fin.buchen({ datum: heute(), cent: diff, quelle: "abgleich", titel: "Abgleich mit der Bank" });
            setBusy(false);
            if (f) meldeFehler("Hat nicht geklappt: " + f);
            else onClose();
          }}
          className="btn-primary !w-auto shrink-0 px-4 disabled:opacity-40"
        >
          Abgleichen
        </button>
      </div>
      {diff !== null && (
        <p className="mt-1.5 text-[12px] text-tinte-matt dark:text-slate-400">
          {diff === 0 ? "Stimmt genau mit dem Kassenbuch überein." : `Unterschied: ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}`}
        </p>
      )}

      <h3 className="mt-6 text-[15px] font-semibold">Kategorien</h3>
      <p className="text-[12px] text-tinte-leise">
        Die Farbe steht im Kreis, im Balken der Übersicht und als Punkt an jeder Zeile. Mehrere Kategorien dürfen
        dieselbe Farbe haben.
      </p>
      <KategorienVerwalten fin={fin} />
    </Sheet>
  );
}

function KategorienVerwalten({ fin }: { fin: FinanzenValue }) {
  const dunkel = useDunkel();
  const [offen, setOffen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [farbe, setFarbe] = useState("blau");
  const [artWahl, setArtWahl] = useState<KassenKategorie["art"]>("beide");

  function bearbeiten(k: KassenKategorie | null) {
    setOffen(k ? k.id : "neu");
    setName(k?.name ?? "");
    setFarbe(k?.farbe ?? "blau");
    setArtWahl(k?.art ?? "beide");
  }

  async function speichern() {
    const f = await fin.kategorieSpeichern({ id: offen === "neu" ? undefined : offen ?? undefined, name, farbe, art: artWahl });
    if (f) meldeFehler("Hat nicht geklappt: " + f);
    else setOffen(null);
  }

  const formular = (
    <div className="mt-1.5 rounded-2xl border border-papier-linie p-2.5 dark:border-slate-700">
      <input className="field" placeholder="Name der Kategorie" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <FarbWahl wert={farbe} setzen={setFarbe} />
      <div className="seg mt-2" role="radiogroup" aria-label="Für welche Buchungen">
        {([["beide", "Beides"], ["ein", "Einnahmen"], ["aus", "Ausgaben"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={artWahl === k} onClick={() => setArtWahl(k)} className={`seg-item !py-1.5 !text-[13px] ${artWahl === k ? "seg-aktiv" : ""}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void speichern()} className="flex-1 rounded-xl bg-brand py-2 text-[14px] font-bold text-white">
          Speichern
        </button>
        <button type="button" onClick={() => setOffen(null)} className="rounded-xl px-3 text-[14px] font-semibold text-tinte-leise">
          Abbrechen
        </button>
      </div>
    </div>
  );

  return (
    <div className="mt-1.5">
      <ul className="grid gap-1.5">
        {fin.kategorien.map((k) => (
          <li key={k.id}>
            <div className="flex items-center gap-2.5 rounded-xl bg-papier px-3 py-2 dark:bg-slate-800/70">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: farbHex(k.farbe, dunkel) }} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{k.name}</span>
              <span className="shrink-0 text-[11px] text-tinte-leise">
                {k.art === "ein" ? "Einnahmen" : k.art === "aus" ? "Ausgaben" : "beides"}
              </span>
              <button type="button" onClick={() => bearbeiten(k)} className="shrink-0 text-[13px] font-bold text-brand">
                ändern
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!(await frage(`Kategorie „${k.name}“ löschen? Die Buchungen bleiben, sie verlieren nur die Farbe.`, "Löschen", true))) return;
                  const f = await fin.kategorieLoeschen(k.id);
                  if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
                }}
                className="shrink-0 text-[13px] font-bold text-red-500"
                aria-label={`${k.name} löschen`}
              >
                ✕
              </button>
            </div>
            {offen === k.id && formular}
          </li>
        ))}
      </ul>
      {offen === "neu" ? (
        formular
      ) : (
        <button type="button" onClick={() => bearbeiten(null)} className="mt-2 text-[14px] font-bold text-brand">
          ＋ Kategorie anlegen
        </button>
      )}
    </div>
  );
}

// ==================================================================== Kostenanfragen

const STATUS: Record<KostenAnfrage["status"], { text: string; klasse: string }> = {
  offen: { text: "wartet", klasse: "bg-offen-grund text-offen" },
  genehmigt: { text: "genehmigt", klasse: "bg-bezahlt-grund text-bezahlt" },
  abgelehnt: { text: "abgelehnt", klasse: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

function KostenKarte({
  kosten, darfEntscheiden, vorsitze, onEntschieden,
}: {
  kosten: KostenValue;
  darfEntscheiden: boolean;
  vorsitze: string[];
  onEntschieden?: () => void;
}) {
  const { profile } = useProfiles();
  const [neu, setNeu] = useState(false);
  const [auswahl, setAuswahl] = useState<KostenAnfrage | null>(null);
  const [alle, setAlle] = useState(false);

  const offene = kosten.anfragen.filter((a) => a.status === "offen");
  const erledigte = kosten.anfragen.filter((a) => a.status !== "offen");
  const sichtbarErledigt = alle ? erledigte : erledigte.slice(0, 3);
  // Aus der Benachrichtigung „Kostenanfrage“: gleich die Anfrage öffnen
  useSprungziel("kosten", darfEntscheiden && offene.length > 0, () => {
    if (offene.length === 1) setAuswahl(offene[0]);
    else hinScrollen("sprung-kosten");
  });

  return (
    <section id="sprung-kosten" className="card min-w-0 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.125rem] font-semibold tracking-[-0.01em]">Kostenanfragen</h2>
          <p className="text-[12px] text-tinte-leise">
            {vorsitze.length > 0
              ? "Du brauchst Geld fürs Komitee? Hier anfragen – der Kassenwart entscheidet."
              : darfEntscheiden
                ? "Anfragen der Komitee-Vorsitzenden. Genehmigen bucht die Ausgabe sofort."
                : "Anfragen der Komitee-Vorsitzenden an den Kassenwart."}
          </p>
        </div>
        {vorsitze.length > 0 && (
          <button onClick={() => setNeu(true)} className="btn-primary !w-auto shrink-0 px-3.5 text-[13px]">
            + Anfragen
          </button>
        )}
      </div>

      {!kosten.bereit ? (
        <p className="py-6 text-center text-[13px] text-tinte-leise">Lädt …</p>
      ) : kosten.anfragen.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-tinte-leise">Keine Kostenanfragen.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
          {[...offene, ...sichtbarErledigt].map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setAuswahl(a)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[.99] ${
                  a.status === "offen" && darfEntscheiden
                    ? "bg-offen-grund/70 ring-1 ring-offen-rand"
                    : "bg-papier dark:bg-slate-800/60"
                }`}
              >
                <span className="shrink-0 text-lg">{committeeIcon(a.tag)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{a.titel}</span>
                  <span className="block truncate text-[11px] text-tinte-leise">
                    {committeeLabel(a.tag)} · {profile[a.created_by]?.anzeigename || "Vorsitz"}
                    {a.benoetigt_am ? ` · bis ${kurzTag(a.benoetigt_am)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="zahl text-[14px] font-bold">{euro(a.cent)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[a.status].klasse}`}>
                    {STATUS[a.status].text}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {erledigte.length > 3 && (
        <button onClick={() => setAlle(!alle)} className="mt-2 w-full text-center text-[12px] font-bold text-brand">
          {alle ? "Weniger anzeigen" : `Alle ${erledigte.length} erledigten anzeigen`}
        </button>
      )}

      <KostenAnfrageSheet open={neu} onClose={() => setNeu(false)} vorsitze={vorsitze} onStellen={kosten.stellen} />
      <AnfrageDetailSheet
        anfrage={auswahl}
        onClose={() => setAuswahl(null)}
        darfEntscheiden={darfEntscheiden}
        kosten={kosten}
        onEntschieden={onEntschieden}
        name={auswahl ? profile[auswahl.created_by]?.anzeigename || "Vorsitz" : ""}
      />
    </section>
  );
}

function KostenAnfrageSheet({
  open, onClose, vorsitze, onStellen,
}: {
  open: boolean;
  onClose: () => void;
  vorsitze: string[];
  onStellen: KostenValue["stellen"];
}) {
  const [tag, setTag] = useState("");
  const [titel, setTitel] = useState("");
  const [betrag, setBetrag] = useState("");
  const [bis, setBis] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTag(vorsitze[0] || "");
    setTitel("");
    setBetrag("");
    setBis("");
    setNachricht("");
    setFehler("");
  }, [open, vorsitze]);

  async function senden() {
    setFehler("");
    const c = centAus(betrag);
    if (!titel.trim()) return setFehler("Wofür brauchst du das Geld?");
    if (!c || c <= 0) return setFehler("Bitte einen Betrag über 0 eingeben.");
    setBusy(true);
    const f = await onStellen({ tag, titel, nachricht, cent: c, benoetigt_am: bis || null });
    setBusy(false);
    if (f) return setFehler("Hat nicht geklappt: " + f);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-extrabold">Kosten anfragen</h2>
      <p className="text-[12px] text-tinte-leise">Kassenwart und Admin bekommen eine Benachrichtigung.</p>

      {vorsitze.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {vorsitze.map((k) => (
            <button
              key={k}
              onClick={() => setTag(k)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${
                tag === k ? "border-brand bg-brand/10 text-brand" : "border-papier-linie text-tinte-matt dark:border-slate-700"
              }`}
            >
              {committeeIcon(k)} {committeeLabel(k)}
            </button>
          ))}
        </div>
      )}
      {vorsitze.length === 1 && (
        <div className="mt-3 text-[13px] font-semibold">
          {committeeIcon(tag)} {committeeLabel(tag)}
        </div>
      )}

      <label className="mt-3 block text-[13px] font-medium text-tinte-leise">Wofür</label>
      <input className="field mt-1" placeholder="z. B. Deko für den Abiball" value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} />

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <label className="block text-[13px] font-medium text-tinte-leise">Betrag</label>
          <div className="mt-1 flex items-center gap-1 rounded-xl bg-papier-matt px-3 dark:bg-slate-800">
            <input
              className="zahl min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-bold outline-none"
              inputMode="decimal"
              placeholder="0,00"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
            <span className="font-bold text-tinte-matt">€</span>
          </div>
        </div>
        <div className="min-w-0">
          <label className="block text-[13px] font-medium text-tinte-leise">Gebraucht bis (freiwillig)</label>
          <input type="date" className="field mt-1" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
      </div>

      <label className="mt-3 block text-[13px] font-medium text-tinte-leise">Begründung (freiwillig)</label>
      <textarea
        className="field mt-1 min-h-[4rem]"
        placeholder="z. B. Angebot vom Baumarkt, 3 Rollen Lichterkette"
        value={nachricht}
        maxLength={1000}
        onChange={(e) => setNachricht(e.target.value)}
      />

      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
      <button disabled={busy} onClick={senden} className="btn-primary mt-4 disabled:opacity-50">
        {busy ? "…" : "Anfrage senden"}
      </button>
    </Sheet>
  );
}

function AnfrageDetailSheet({
  anfrage, onClose, darfEntscheiden, kosten, name, onEntschieden,
}: {
  anfrage: KostenAnfrage | null;
  onClose: () => void;
  darfEntscheiden: boolean;
  kosten: KostenValue;
  name: string;
  onEntschieden?: () => void;
}) {
  const { uid } = useRole();
  const [antwort, setAntwort] = useState("");
  const [datum, setDatum] = useState(heute());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAntwort("");
    setDatum(heute());
  }, [anfrage]);

  if (!anfrage) return null;
  const a = anfrage;
  const eigene = uid === a.created_by;

  async function entscheiden(ja: boolean) {
    setBusy(true);
    const f = await kosten.entscheiden(a, ja, antwort, datum);
    setBusy(false);
    if (f) return meldeFehler("Hat nicht geklappt: " + f);
    onEntschieden?.();
    onClose();
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="flex items-start gap-3">
        <Avatar userId={a.created_by} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-tinte-leise">
            {committeeIcon(a.tag)} {committeeLabel(a.tag)} · {name}
          </div>
          <h2 className="text-xl font-extrabold leading-tight">{a.titel}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[a.status].klasse}`}>
          {STATUS[a.status].text}
        </span>
      </div>

      <div className="zahl mt-4 text-[2rem] font-extrabold leading-none">{euro(a.cent)}</div>
      <div className="mt-1 text-[12px] text-tinte-leise">
        angefragt am {new Date(a.created_at).toLocaleDateString("de-DE")}
        {a.benoetigt_am ? ` · gebraucht bis ${kurzTag(a.benoetigt_am)}` : ""}
      </div>
      {a.nachricht && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-papier-matt p-3 text-[14px] dark:bg-slate-800">{a.nachricht}</p>
      )}

      {a.status !== "offen" && (
        <div className="mt-3 text-[13px] text-tinte-matt dark:text-slate-300">
          {a.status === "genehmigt" ? "✓ Genehmigt und als Ausgabe gebucht" : "✕ Abgelehnt"}
          {a.decided_at ? ` am ${new Date(a.decided_at).toLocaleDateString("de-DE")}` : ""}
          {a.antwort ? <span className="mt-1 block">„{a.antwort}“</span> : null}
        </div>
      )}

      {a.status === "offen" && darfEntscheiden && (
        <div className="mt-4 border-t border-papier-linie pt-4 dark:border-slate-800">
          <label className="block text-[13px] font-medium text-tinte-leise">Antwort (freiwillig)</label>
          <input
            className="field mt-1"
            placeholder="z. B. Bitte Kassenbon abgeben"
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
          />
          <label className="mt-2 block text-[12px] font-semibold text-tinte-leise">Buchungsdatum bei Genehmigung</label>
          <input type="date" className="field mt-1" value={datum} onChange={(e) => setDatum(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => void entscheiden(false)}
              className="rounded-xl border border-red-300 py-3 text-[14px] font-bold text-red-600 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400"
            >
              Ablehnen
            </button>
            <button
              disabled={busy}
              onClick={() => void entscheiden(true)}
              className="rounded-xl bg-emerald-600 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              Genehmigen
            </button>
          </div>
        </div>
      )}

      {a.status === "offen" && eigene && !darfEntscheiden && (
        <button
          disabled={busy}
          onClick={async () => {
            if (!(await frage("Anfrage zurückziehen?", "Zurückziehen", true))) return;
            setBusy(true);
            const f = await kosten.zurueckziehen(a.id);
            setBusy(false);
            if (f) meldeFehler("Hat nicht geklappt: " + f);
            else onClose();
          }}
          className="mt-4 w-full rounded-xl border border-papier-linie py-2.5 text-[13px] font-bold text-tinte-matt dark:border-slate-700"
        >
          Anfrage zurückziehen
        </button>
      )}
    </Sheet>
  );
}

// ==================================================================== Verlauf

type Filter = "alle" | "ein" | "aus";

/** Wie eine Buchungsart aussieht: Farbe der Kachel (Kategorie vor Herkunft) und Zeichen darin. */
function art(b: Buchung, kategorien: KassenKategorie[] = []): { farbe: string; icon: IconName; name: string } {
  if (b.quelle === "abgleich") return { farbe: "#8E8E93", icon: "bank", name: "Abgleich mit der Bank" };
  const hex = farbHex(buchungFarbe(b, kategorien));
  if (b.cent < 0) return { farbe: hex, icon: "pfeil-raus", name: b.quelle === "beitrag" ? "Beitrag zurückgenommen" : "Ausgabe" };
  const icon: IconName = b.quelle === "beitrag" ? "kasse" : b.quelle === "aktion" ? "events" : b.quelle === "spende" ? "herz" : "pfeil-rein";
  return { farbe: hex, icon, name: QUELLE_NAME[b.quelle] };
}

const monatName = (m: string) =>
  new Date(m + "-01T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });

function VerlaufKarte({
  buchungen, kategorien, darf, onLoeschen, onKategorie, aktionName,
}: {
  buchungen: Buchung[];
  kategorien: KassenKategorie[];
  darf: boolean;
  onLoeschen: (id: string) => Promise<string | null>;
  onKategorie: FinanzenValue["buchungKategorie"];
  aktionName: (id: string) => string;
}) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [q, setQ] = useState("");
  const [auswahl, setAuswahl] = useState<Buchung | null>(null);

  const liste = useMemo(() => {
    const n = q.trim().toLowerCase();
    return buchungen.filter((b) => {
      if (filter === "ein" && (b.cent < 0 || b.quelle === "abgleich")) return false;
      if (filter === "aus" && (b.cent > 0 || b.quelle === "abgleich")) return false;
      if (n && !`${b.titel} ${zuweisungText(b, aktionName)} ${euro(Math.abs(b.cent))}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [buchungen, filter, q, aktionName]);

  // Nach Monaten gruppiert, jeder Monat klappt auf. Offen ist zuerst nur der
  // neueste; beim Suchen sind alle Treffer-Monate offen.
  const gruppen = useMemo(() => {
    const m = new Map<string, Buchung[]>();
    for (const b of liste) {
      const k = b.datum.slice(0, 7);
      (m.get(k) || m.set(k, []).get(k)!).push(b);
    }
    return [...m.entries()];
  }, [liste]);
  const [offen, setOffen] = useState<Set<string>>(() => new Set());
  const neuester = gruppen[0]?.[0];
  const istOffen = (monat: string) => (q.trim() ? true : offen.has(monat) !== (monat === neuester));
  const umschalten = (monat: string) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(monat)) neu.delete(monat);
      else neu.add(monat);
      return neu;
    });

  const FILTER: [Filter, string][] = [
    ["alle", "Alle"],
    ["ein", "Einnahmen"],
    ["aus", "Ausgaben"],
  ];

  return (
    <section className="min-w-0 lg:col-span-2">
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1 pt-2">
        <h2 className="mr-auto text-[1.375rem] font-bold tracking-[-0.02em]">Buchungen</h2>
        <div className="seg w-full sm:w-80" role="radiogroup" aria-label="Buchungen filtern">
          {FILTER.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`seg-item ${filter === k ? "seg-aktiv" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex h-11 items-center gap-2 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)]">
        <span className="text-tinte-leise">
          <Icon name="lupe" size={17} />
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-tinte-leise"
          placeholder="Suchen, z. B. Waffel oder Abiball"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Suche leeren" className="px-1 text-tinte-leise">
            ✕
          </button>
        )}
      </div>

      {liste.length === 0 ? (
        <div className="card py-10 text-center text-[14px] text-tinte-leise">Keine Buchungen.</div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
          {gruppen.map(([monat, zeilen]) => {
            const summe = zeilen.reduce((n, b) => n + (b.quelle === "abgleich" ? 0 : b.cent), 0);
            const auf = istOffen(monat);
            return (
              <ul key={monat} className="liste border border-black/[0.04] dark:border-white/[0.06]">
                <li>
                <button
                  onClick={() => umschalten(monat)}
                  aria-expanded={auf}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{monatName(monat)}</span>
                    <span className="block text-[12.5px] text-tinte-leise">
                      {zeilen.length} {zeilen.length === 1 ? "Buchung" : "Buchungen"}
                    </span>
                  </span>
                  <span className={`zahl shrink-0 text-[15px] font-semibold ${summe > 0 ? "text-bezahlt" : ""}`}>
                    {summe >= 0 ? "+" : "−"} {euro(Math.abs(summe))}
                  </span>
                  <span
                    aria-hidden
                    className={`shrink-0 text-[13px] text-tinte-leise transition-transform duration-200 ${auf ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                </button>
                </li>
                {auf &&
                  zeilen.map((b) => (
                    <Zeile key={b.id} b={b} kategorien={kategorien} aktionName={aktionName} onOeffnen={() => setAuswahl(b)} />
                  ))}
              </ul>
            );
          })}
        </div>
      )}

      <BuchungDetail
        buchung={auswahl ? buchungen.find((x) => x.id === auswahl.id) ?? auswahl : null}
        kategorien={kategorien}
        onClose={() => setAuswahl(null)}
        darf={darf}
        onLoeschen={onLoeschen}
        onKategorie={onKategorie}
        aktionName={aktionName}
      />
    </section>
  );
}

/** Farbige Kachel mit Zeichen – wie in der Wallet-App. */
function Kachel({ b, gross, kategorien }: { b: Buchung; gross?: boolean; kategorien: KassenKategorie[] }) {
  const a = art(b, kategorien);
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white ${gross ? "h-14 w-14 rounded-[1rem]" : "h-9 w-9 rounded-[0.65rem]"}`}
      style={{ background: a.farbe }}
      aria-hidden="true"
    >
      <Icon name={a.icon} size={gross ? 26 : 18} strich={2.1} />
    </span>
  );
}

function Betrag({ b, gross }: { b: Buchung; gross?: boolean }) {
  const plus = b.cent > 0;
  const farbe = b.quelle === "abgleich" ? "text-tinte-leise" : plus ? "text-bezahlt" : "";
  return (
    <span className={`zahl shrink-0 whitespace-nowrap font-semibold ${gross ? "text-[2.5rem] font-bold tracking-[-0.03em]" : "text-[15px]"} ${farbe}`}>
      {plus ? "+" : "−"}
      {gross ? " " : "\u2009"}
      {euro(Math.abs(b.cent))}
    </span>
  );
}

function Zeile({
  b, kategorien, aktionName, onOeffnen,
}: {
  b: Buchung;
  kategorien: KassenKategorie[];
  aktionName: (id: string) => string;
  onOeffnen: () => void;
}) {
  const kat = b.kategorie_id ? kategorien.find((k) => k.id === b.kategorie_id) : null;
  const zu = kat ? kat.name : zuweisungText(b, aktionName);
  return (
    <li>
      <button
        onClick={onOeffnen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-black/[0.02] active:bg-black/[0.05] dark:hover:bg-white/[0.03] dark:active:bg-white/[0.07]"
      >
        <Kachel b={b} kategorien={kategorien} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{b.titel || zu}</span>
          <span className="block truncate text-[13px] text-tinte-leise">
            {zu !== b.titel ? `${zu} · ` : ""}
            {new Date(b.datum + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
          </span>
        </span>
        <Betrag b={b} />
      </button>
    </li>
  );
}

/**
 * Alle Angaben zu einer Buchung – ruhig und geordnet: oben Betrag und
 * Titel, darunter eine Liste mit je einer Angabe pro Zeile.
 */
function BuchungDetail({
  buchung, kategorien, onClose, darf, onLoeschen, onKategorie, aktionName,
}: {
  buchung: Buchung | null;
  kategorien: KassenKategorie[];
  onClose: () => void;
  darf: boolean;
  onLoeschen: (id: string) => Promise<string | null>;
  onKategorie: FinanzenValue["buchungKategorie"];
  aktionName: (id: string) => string;
}) {
  const { profile } = useProfiles();
  const { students } = useStore();
  const [busy, setBusy] = useState(false);
  if (!buchung) return null;
  const b = buchung;
  const a = art(b, kategorien);
  const kat = b.kategorie_id ? kategorien.find((k) => k.id === b.kategorie_id) : null;
  const person = b.student_id ? students.find((x) => x.id === b.student_id) : null;
  const wer = b.created_by ? profile[b.created_by]?.anzeigename : null;
  const erfasst = new Date(b.created_at);

  const artName = b.quelle === "abgleich" ? "Abgleich mit der Bank" : b.cent > 0 ? "Einnahme" : "Ausgabe";
  // Eine Einnahme fuers Komitee heisst so – nicht "Sonstiges"
  const kategorie = b.cent > 0 && b.komitee && b.quelle === "sonstiges" ? "Komitee-Einnahme" : a.name;
  const zeilen: [string, React.ReactNode][] = [
    ["Status", b.automatisch ? "Automatisch gebucht" : "Gebucht"],
    ["Art", artName],
  ];
  if (kat) zeilen.push(["Kategorie", kat.name]);
  else if (kategorie !== artName) zeilen.push(["Herkunft", kategorie]);
  if (b.aktion_id && aktionName(b.aktion_id)) zeilen.push(["Aktion", aktionName(b.aktion_id)]);
  if (b.komitee) zeilen.push(["Komitee", committeeLabel(b.komitee)]);
  if (person) zeilen.push(["Person", `${person.vorname} ${person.nachname}`]);
  if (b.halbjahr) zeilen.push(["Halbjahr", b.halbjahr]);
  if (b.anfrage_id) zeilen.push(["Grundlage", "Genehmigte Kostenanfrage"]);
  zeilen.push(["Erfasst von", wer || (b.automatisch ? "App (Beitrag auf bezahlt)" : "–")]);
  zeilen.push([
    "Erfasst am",
    `${erfasst.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${erfasst.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`,
  ]);
  zeilen.push(["Buchungs-Nr.", <span key="nr" className="font-mono text-[13px] tracking-wide">{b.id.slice(0, 8).toUpperCase()}</span>]);

  return (
    <Sheet open onClose={onClose}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="-m-1.5 flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
        >
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
            ✕
          </span>
        </button>
      </div>

      {/* Kopf: Kachel, Betrag, Titel, Datum */}
      <div className="flex flex-col items-center px-2 pb-5 pt-1 text-center">
        <Kachel b={b} gross kategorien={kategorien} />
        <div className="mt-4">
          <Betrag b={b} gross />
        </div>
        <div className="mt-2 text-[17px] font-semibold leading-snug">{b.titel || zuweisungText(b, aktionName)}</div>
        <div className="mt-0.5 text-[14px] text-tinte-leise">
          {new Date(b.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <dl className="liste bg-papier dark:bg-slate-800/60">
        {zeilen.map(([k, v]) => (
          <div key={k} className="zeile justify-between !py-3">
            <dt className="shrink-0 text-tinte-leise">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {darf && !b.automatisch && b.quelle !== "abgleich" && (
        <div className="mt-3 px-1">
          <div className="text-[13px] font-medium text-tinte-leise">Kategorie</div>
          <KategorieWahl
            kategorien={kategorien.filter((k) => k.art === "beide" || k.art === (b.cent < 0 ? "aus" : "ein"))}
            wert={b.kategorie_id ?? null}
            setzen={(id) => {
              void onKategorie(b.id, id).then((f) => { if (f) meldeFehler("Ändern hat nicht geklappt: " + f); });
            }}
          />
        </div>
      )}

      {b.automatisch && (
        <p className="mt-3 px-4 text-[13px] leading-relaxed text-tinte-leise">
          Entsteht von selbst, wenn ein Beitrag auf „bezahlt“ gesetzt wird – und verschwindet wieder, wenn er zurück
          auf „offen“ geht.
        </p>
      )}

      {darf && !b.automatisch && (
        <button
          disabled={busy}
          onClick={async () => {
            if (!(await frage(`Buchung „${b.titel}“ über ${euro(Math.abs(b.cent))} löschen?`, "Löschen", true))) return;
            setBusy(true);
            const f = await onLoeschen(b.id);
            setBusy(false);
            if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
            else onClose();
          }}
          className="mt-4 flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-[1.25rem] bg-papier text-[16px] font-medium text-red-600 transition active:scale-[.99] disabled:opacity-50 dark:bg-slate-800/60 dark:text-red-400"
        >
          <Icon name="muell" size={18} />
          Buchung löschen
        </button>
      )}
    </Sheet>
  );
}

/**
 * Das Kreisdiagramm (Ring). Jede Quelle ein Bogen, dazwischen 2 px Luft in
 * Hintergrundfarbe; der Rest bis zum Ziel bleibt als graue Spur stehen.
 */
function Kreis({
  teile, ganz, prozent, summe, dunkel,
}: {
  teile: { key: string; label: string; farbe: string; cent: number }[];
  ganz: number;
  prozent: number | null;
  summe: number;
  dunkel: boolean;
}) {
  const [aktiv, setAktiv] = useState<string | null>(null);
  const G = 176;
  const r = 70;
  const dicke = 20;
  const umfang = 2 * Math.PI * r;
  const luft = 2.5; // Abstand zwischen den Bögen in px
  const sichtbare = teile.filter((t) => t.cent > 0);

  let start = 0;
  const boegen = sichtbare.map((t) => {
    const laenge = ganz > 0 ? (t.cent / ganz) * umfang : 0;
    const b = { ...t, start, laenge: Math.max(0, laenge - (sichtbare.length > 1 || ganz > summe ? luft : 0)) };
    start += laenge;
    return b;
  });
  const hervor = aktiv ? sichtbare.find((t) => t.key === aktiv) : null;

  return (
    <div className="relative shrink-0" style={{ width: G, height: G }}>
      <svg width={G} height={G} viewBox={`0 0 ${G} ${G}`} className="-rotate-90" role="img" aria-label="Einnahmen nach Quelle">
        <circle cx={G / 2} cy={G / 2} r={r} fill="none" strokeWidth={dicke} stroke={dunkel ? "#3A3A3C" : "#E5E5EA"} />
        {boegen.map((b) => (
          <circle
            key={b.key}
            cx={G / 2}
            cy={G / 2}
            r={r}
            fill="none"
            stroke={b.farbe}
            strokeWidth={aktiv === b.key ? dicke + 4 : dicke}
            strokeDasharray={`${b.laenge} ${umfang}`}
            strokeDashoffset={-b.start}
            className="cursor-pointer transition-[stroke-width] duration-150"
            onMouseEnter={() => setAktiv(b.key)}
            onMouseLeave={() => setAktiv(null)}
            onClick={() => setAktiv(aktiv === b.key ? null : b.key)}
          >
            <title>{`${b.label}: ${euroKurz(b.cent)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center leading-tight">
        {hervor ? (
          <>
            <span className="text-[11px] font-semibold text-tinte-leise">{hervor.label}</span>
            <span className="zahl text-[1.15rem] font-extrabold">{euroKurz(hervor.cent)}</span>
          </>
        ) : prozent !== null ? (
          <>
            <span className="zahl text-[1.7rem] font-extrabold">{prozent} %</span>
            <span className="text-[11px] text-tinte-leise">vom Ziel</span>
          </>
        ) : (
          <>
            <span className="zahl text-[1.15rem] font-extrabold">{euroKurz(summe)}</span>
            <span className="text-[11px] text-tinte-leise">eingenommen</span>
          </>
        )}
      </div>
    </div>
  );
}

