import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useTermine } from "../termine-store";
import { useProfiles } from "../profiles-store";
import { basisOffen } from "../lib/logic";
import { FinanzStandard } from "./FinanzStandard";
import { BuchungSheet, FarbWahl, GeplantKarte, Kennzahlen, PostenBereiche, type BuchungStart } from "./FinanzBereiche";
import { committeeLabel } from "../lib/committees";
import {
  EINNAHME_QUELLEN, KASSEN_FARBEN, QUELLE_NAME, STANDARD_FARBE, buchungFarbe, centAus, euro, euroKurz, farbHex,
  uebersichtAus, useFinanzen,
  type Buchung, type FinanzenValue, type KassenKategorie,
} from "../lib/finanzen";
import type { KostenAnfrage, KostenValue } from "../lib/kosten";
import { Sheet, SheetKopf } from "./Sheet";
import { InKopf } from "./InKopf";
import { Icon, type IconName } from "./Icon";
import { Gruppe, Symbol, Wert, Zeile, ZeileEingabe, ZeileHaken } from "./Liste";
import { FussLeiste } from "./FussLeiste";

import { frage, meldeFehler } from "../lib/melder";
import { useDunkel } from "../lib/dunkel";
import { useBreit } from "../lib/gescrollt";

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
  // Das Start-Objekt steht im State: ein bei jedem Zeichnen neu gebautes
  // `{ typ }` setzte das Blatt bei jedem Neuzeichnen der Seite zurück
  // (Rollen-Prüfung Okt. 2026: getippter Betrag nach ~3 s wieder leer)
  const [buchen, setBuchen] = useState<BuchungStart | null>(null);
  const [einstellungen, setEinstellungen] = useState(false);
  // Eine Buchung aus „Aktionen, Beiträge und Sonstiges“ → Posten → Eintrag:
  // dieselbe Detailseite wie aus der Buchungsliste
  const [buchungAuf, setBuchungAuf] = useState<Buchung | null>(null);
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

  // Laptop: geteilte Ansicht wie in Mail – beide Spalten genau so hoch wie der
  // Platz unter Kopfzeile und Knöpfen, jede scrollt nur in sich, die Seite
  // selbst gar nicht. Vorher scrollte die Seite und die rechte Spalte klebte:
  // am Ende der Buchungen lief das Scrollen an die Seite weiter, und beim
  // Scrollen links rutschte die rechte Spalte mit, bis sie klebte.
  // Gemessen wird der Abstand vom Seitenanfang bis zu den Spalten (Kopfzeile,
  // Reiter und die Zeile mit Einnahme/Ausgabe sind unterschiedlich hoch).
  // Handy/iPad hoch (unter 1024 px): Geplantes und Kostenanfragen als Zeilen
  const breit = useBreit();
  const spalten = useRef<HTMLDivElement>(null);
  const [spaltenOben, setSpaltenOben] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = spalten.current;
    if (!el) return;
    const messen = () => {
      const r = el.getBoundingClientRect();
      // Am Handy ist die linke Spalte „contents“ (keine eigene Box) – nichts zu tun
      if (!r.width && !r.height) return;
      setSpaltenOben(Math.round(r.top + window.scrollY));
    };
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(document.body);
    window.addEventListener("resize", messen);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", messen);
    };
  }, [fin.bereit, ansicht]);

  // Standard-Ansicht: Summen ohne Namen (Schüler, Eltern – oder zur Kontrolle)
  if ((!darfSehen && darfStandard) || (darfSehen && ansicht === "standard")) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {darfSehen && (
          <InKopf>
            <AnsichtWahl ansicht={ansicht} setAnsicht={setAnsicht} />
          </InKopf>
        )}
        {darfSehen && <p className="auf-bild hidden px-1 text-[13px] leading-snug text-tinte-leise lg:block">{ANSICHT_TEXT.standard}</p>}
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
  // Gibt es etwas zu entscheiden (oder darf man selbst anfragen), stehen die
  // Kostenanfragen gleich unter dem Kontostand – vorher erst nach anderthalb
  // Bildschirmen. Ohne offene Anfragen bleibt die Karte weiter unten.
  const offeneAnfragen = kosten.anfragen.filter((a) => a.status === "offen").length;
  const kostenOben = zeigeAnfragen && (offeneAnfragen > 0 || meineVorsitze.length > 0);
  const kostenKarte = (
    <KostenKarte kosten={kosten} darfEntscheiden={darfBuchen} vorsitze={meineVorsitze} onEntschieden={fin.neuLaden} />
  );

  return (
    // lg:pb-0/-mb-20: am Laptop hebt das die Seitenränder darunter auf (pb-4
    // an <main>, lg:pb-16 in App.tsx) – sonst ließe sich die Seite um diesen
    // Rand scrollen und beide Spalten wanderten mit.
    <div
      style={spaltenOben ? ({ "--finanz-oben": `${spaltenOben}px` } as CSSProperties) : undefined}
      className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 lg:-mb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:pb-0"
    >
      {/* Oben, was der Kassenwart am häufigsten tut: Einnahme / Ausgabe buchen.
          Vorher standen die Knöpfe unter Kontostand und Kreis – am Handy erst
          nach gut einer Bildschirmhöhe. Die Ansicht-Wahl steht am Rechner in
          der Kopfzeile (InKopf), die Knöpfe am Anfang der Seite. */}
      <InKopf className="lg:col-span-2">
        <AnsichtWahl ansicht={ansicht} setAnsicht={setAnsicht} />
      </InKopf>
      {/* Am Rechner: links in einem Satz, was man gerade sieht, rechts Einnahme/
          Ausgabe – nicht mehr oben neben „Nachtragen“ (zwei grüne Knöpfe
          nebeneinander, Rückmeldung 15.10.). Am Handy direkt unter der Wahl. */}
      <div className="flex flex-col gap-3 empty:hidden lg:col-span-2 lg:flex-row lg:items-center">
        <p className="auf-bild hidden min-w-0 flex-1 px-1 text-[13px] leading-snug text-tinte-leise lg:block">{ANSICHT_TEXT[ansicht]}</p>
        {darfBuchen && (
          // Echte, volle Knöpfe (vorher blasse Pastell-Flächen, die wie
          // abgeschaltet wirkten): grün = Einnahme, rot = Ausgabe, weiße Schrift.
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <button
              onClick={() => setBuchen({ typ: "ein" })}
              className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-full bg-[#1E7B34] text-[16px] font-semibold text-white transition duration-200 ease-ios active:scale-[.97] lg:min-h-[2.5rem] lg:px-4 lg:text-[15px]"
            >
              <Icon name="plus" size={17} strich={2.4} />
              Einnahme
            </button>
            <button
              onClick={() => setBuchen({ typ: "aus" })}
              className="flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-full bg-red-600 text-[16px] font-semibold text-white transition duration-200 ease-ios active:scale-[.97] lg:min-h-[2.5rem] lg:px-4 lg:text-[15px]"
            >
              <span className="text-[20px] leading-none">−</span>
              Ausgabe
            </button>
          </div>
        )}
      </div>
      {nurLesen && (
        <div className="flex items-center gap-2 rounded-2xl zelle px-4 py-2.5 text-[14px] text-tinte-matt dark:text-slate-300 lg:col-span-2">
          <Icon name="info" size={17} />
          Nur lesen{kosten.aufsichtsrat ? " – du siehst die Finanzen als Aufsichtsrat" : ""}. Buchen kann nur der Kassenwart.
        </div>
      )}

      {/* Aufteilung: Am Laptop links Kontostand, Aktionen, Geplantes und
          Kostenanfragen untereinander, rechts von Anfang an die Buchungen –
          sie bleiben beim Scrollen stehen und scrollen in sich (wie die
          Liste in Mail). Vorher standen sie über die volle Breite erst unter
          dem Falz. Am Handy (die linke Spalte ist dann „contents“) folgen
          auf den Kontostand direkt die Buchungen, danach der Rest. */}
      <div
        ref={spalten}
        className="contents lg:-mx-2 lg:flex lg:h-[calc(100dvh-var(--finanz-oben,14rem)-1rem)] lg:min-w-0 lg:flex-col lg:gap-3 lg:overflow-y-auto lg:overscroll-contain lg:px-2 lg:pb-3"
      >
        {/* ================================================ Übersicht */}
        <div className="min-w-0 max-lg:order-1">
          <UebersichtKarte
            zahlen={zahlen}
            offen={isStaff ? offen : null}
            halbjahr={settings.aktuelles_halbjahr}
            ziel={fin.ziel}
            darf={darfBuchen}
            onEinstellungen={() => setEinstellungen(true)}
          />
        </div>

        {/* ================================================ Kostenanfragen (oben, wenn etwas ansteht) */}
        {kostenOben && <div className="min-w-0 max-lg:order-1">{kostenKarte}</div>}

        {/* ================================================ Aktionen, Beiträge, Ausgaben */}
        <PostenBereiche
          d={postenDaten}
          fin={darfBuchen ? fin : null}
          listeKlasse="max-lg:order-3"
          geplantKlasse="max-lg:order-3"
          ohneGeplant={!breit}
          onBuchung={darfBuchen ? setBuchungAuf : undefined}
        />

        {/* ================================================ Geplantes + Kostenanfragen */}
        {/* Am Handy/iPad hoch: EINE Gruppe mit zwei Zeilen (wie die iOS-
            Einstellungen), die Listen im Blatt – vorher zwei Karten, ~300 px.
            Am Laptop (linke Spalte) bleiben es Karten. */}
        {!breit ? (
          <div className="gruppe-zellen min-w-0 max-lg:order-3">
            <GeplantKarte alsZeile darf={darfBuchen} fin={darfBuchen ? fin : null} />
            {zeigeAnfragen && !kostenOben && (
              <KostenKarte alsZeile kosten={kosten} darfEntscheiden={darfBuchen} vorsitze={meineVorsitze} onEntschieden={fin.neuLaden} />
            )}
          </div>
        ) : (
          zeigeAnfragen && !kostenOben && <div className="min-w-0">{kostenKarte}</div>
        )}
      </div>

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
          <BuchungSheet start={buchen} fin={fin} onClose={() => setBuchen(null)} />
          <BuchungDetail
            buchung={buchungAuf ? fin.buchungen.find((x) => x.id === buchungAuf.id) ?? null : null}
            kategorien={fin.kategorien}
            onClose={() => setBuchungAuf(null)}
            darf={darfBuchen}
            onLoeschen={fin.loeschen}
            onKategorie={fin.buchungKategorie}
            aktionName={aktionName}
          />
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

/**
 * „Für alle sichtbar“ (nur Summen ohne Namen – so sehen es Schüler und Eltern)
 * oder „Alle Buchungen“ (das ganze Kassenbuch mit Namen) – nur für wer alles
 * sieht. Vorher „Standard – wie alle“ / „Erweitert“: unverständlich.
 */
const ANSICHT_TEXT = {
  // kurz: am Handy eine Zeile unter dem Umschalter
  standard: "So sehen es Schüler und Eltern: nur Summen.",
  erweitert: "Jede Buchung mit Namen – nur für dich und die Kasse.",
} as const;

function AnsichtWahl({ ansicht, setAnsicht }: { ansicht: "standard" | "erweitert"; setAnsicht: (a: "standard" | "erweitert") => void }) {
  return (
    // Am Rechner steht die Wahl in der Kopfzeile (InKopf) – dort feste Breite;
    // die Erklärung steht dann am Anfang der Seite (FinanzenTab), nicht als
    // Hinweis beim Darüberfahren (der legte sich über die Reiterleiste)
    // 19rem wie „Personen | Beiträge & Abiball“ (Kasse) und „Personen | Rechte
    // je Rolle“ (Rollen) – sonst sprang der Umschalter je Reiter waagerecht.
    <div className="lg:w-[19rem]">
      <div className="seg" role="tablist" aria-label="Ansicht der Finanzen">
        {([["standard", "Für alle sichtbar"], ["erweitert", "Alle Buchungen"]] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={ansicht === k}
            onClick={() => setAnsicht(k)}
            className={`seg-item whitespace-nowrap !py-2 !text-[14px] lg:!py-1.5 lg:!text-[13px] ${ansicht === k ? "seg-aktiv" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="auf-bild mt-1.5 px-3 text-[13px] leading-snug text-tinte-leise lg:hidden">{ANSICHT_TEXT[ansicht]}</p>
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
  const zielTitel = ziel.ziel_cent > 0 ? `Ziel ${ziel.ziel_titel}: ${euroKurz(ziel.ziel_cent)}` : "Woher das Geld kommt";
  const [kreisOffen, setKreisOffen] = useState(false);
  /** Kreis + Legende – ab 640 px in der Karte, am Handy im Blatt (dort ohne eigene Überschrift) */
  const kreisUndLegende = (imBlatt: boolean) => (
    <>
      <Kreis teile={teile} ganz={ganz} prozent={prozent} summe={summe} dunkel={dunkel} />
      <div className="min-w-0 flex-1">
        {!imBlatt && <div className="mb-1.5 text-[13px] font-bold">{zielTitel}</div>}
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
              <span className="min-w-0 flex-1 truncate">
                <span className="sm:hidden">Ausgaben</span>
                <span className="max-sm:hidden">abzüglich Ausgaben</span>
              </span>
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
    </>
  );

  return (
    <section className="card p-4 sm:p-5">
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
            {zahlen.letzterAbgleich ? (
              <>
                {/* am Handy eine Zeile – die Erklärung steht im Blatt hinter dem Regler */}
                <span className="sm:hidden">Mit der Bank abgeglichen am {new Date(zahlen.letzterAbgleich).toLocaleDateString("de-DE")}</span>
                <span className="max-sm:hidden">
                  Einnahmen − Ausgaben · Bankabgleich (unter Sonstiges) zuletzt {new Date(zahlen.letzterAbgleich).toLocaleDateString("de-DE")}
                </span>
              </>
            ) : (
              "noch nicht mit der Bank abgeglichen"
            )}
          </div>
        </div>
        {darf && (
          <button onClick={onEinstellungen} className="iconbtn shrink-0" aria-label="Ziel, Kategorien und Bankabgleich" title="Ziel, Kategorien und Bankabgleich">
            <Icon name="regler" size={19} />
          </button>
        )}
      </div>

      <Kennzahlen ein={zahlen.ein} aus={zahlen.aus} offen={offen ? { ...offen, halbjahr } : null} />

      {/* Am Handy EINE Zeile mit Balken (wie die Zusammenfassungen in Health):
          Ziel, Prozent, was fehlt – ein Tipp zeigt Kreis und ganze Legende im
          Blatt. Kreis + acht Legendenzeilen waren am Handy ~200 px hoch.
          Ab 640 px stehen Kreis und Legende wie bisher in der Karte. */}
      <button
        type="button"
        onClick={() => setKreisOffen(true)}
        className="mt-4 flex w-full items-center gap-3 border-t border-papier-linie pt-4 text-left transition active:opacity-60 dark:border-slate-800 sm:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate font-bold">{zielTitel}</span>
            {prozent !== null && <span className="zahl shrink-0 font-bold">{prozent} %</span>}
          </span>
          <span aria-hidden className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-papier-linie dark:bg-slate-700">
            {ganz > 0 && teile.map((t) => <span key={t.key} className="h-full" style={{ width: `${(t.cent / ganz) * 100}%`, background: t.farbe }} />)}
          </span>
          <span className="mt-1 block text-[12px] text-tinte-leise">
            {ziel.ziel_cent > stand ? `Fehlt noch ${euroKurz(ziel.ziel_cent - stand)} · ` : ""}
            {teile.length} {teile.length === 1 ? "Quelle" : "Quellen"}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-tinte-leise">
          <Icon name="chevron" size={14} strich={2.4} />
        </span>
      </button>
      <div className="mt-4 flex items-start gap-3.5 border-t border-papier-linie pt-4 dark:border-slate-800 max-sm:hidden sm:items-center sm:gap-4">
        {kreisUndLegende(false)}
      </div>
      <Sheet open={kreisOffen} onClose={() => setKreisOffen(false)}>
        <SheetKopf titel={zielTitel} onClose={() => setKreisOffen(false)} />
        <div className="card flex items-center gap-4 p-4">{kreisUndLegende(true)}</div>
      </Sheet>
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
        className={`min-h-[44px] rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
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
          className={`flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
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

/** Selten gebraucht, darum im Zahnrad: Zielbetrag, Abgleich mit der Bank, Kategorien. */
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
  // Eine Kategorie bearbeiten/anlegen: Unterseite im selben Blatt (wie in
  // den iOS-Einstellungen), mit „‹ Einstellungen“ zurück
  const [kat, setKat] = useState<KassenKategorie | "neu" | null>(null);

  // Nur beim Öffnen (bzw. wenn sich das Ziel wirklich ändert) vorbelegen –
  // ein Neuladen mit denselben Werten leert nichts, was man gerade tippt
  const { ziel_titel, ziel_cent } = fin.ziel;
  useEffect(() => {
    if (!open) return;
    setTitel(ziel_titel);
    setBetrag(ziel_cent ? String(ziel_cent / 100).replace(".", ",") : "");
  }, [open, ziel_titel, ziel_cent]);
  useEffect(() => {
    if (!open) return;
    setBank("");
    setKat(null);
  }, [open]);

  const c = centAus(bank);
  const diff = c === null ? null : c - stand;

  if (kat)
    return (
      <Sheet open={open} onClose={onClose} hoch>
        <KategorieSeite key={kat === "neu" ? "neu" : kat.id} k={kat} fin={fin} onZurueck={() => setKat(null)} onClose={onClose} />
      </Sheet>
    );

  return (
    // Unterseite „Kategorie“ im selben Blatt → am Handy volle Höhe
    <Sheet open={open} onClose={onClose} hoch>
      <SheetKopf titel="Ziel, Kategorien & Bank" onClose={onClose} />

      <Gruppe titel="Sparziel" className="">
        <ZeileEingabe label="Wofür" value={titel} onChange={setTitel} placeholder="z. B. Abiball" />
        <ZeileEingabe label="Betrag in €" value={betrag} onChange={setBetrag} placeholder="0" inputMode="decimal" />
      </Gruppe>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const f = await fin.zielSetzen({ ziel_cent: Math.max(0, centAus(betrag) ?? 0), ziel_titel: titel.trim() || "Abiball" });
          setBusy(false);
          if (f) meldeFehler("Hat nicht geklappt: " + f);
          else onClose();
        }}
        className="btn-primary mt-3"
      >
        Ziel speichern
      </button>

      <Gruppe
        titel="Mit der Bank abgleichen"
        className="mt-6"
        fuss={
          diff !== null
            ? diff === 0
              ? "Stimmt genau mit dem Kassenbuch überein."
              : `Unterschied: ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}. Die Differenz wird als Abgleich gebucht.`
            : "Stand aus dem Online-Banking eintragen. Die Differenz wird als Abgleich gebucht."
        }
      >
        <ZeileEingabe label="Stand laut Bank" value={bank} onChange={setBank} placeholder="0,00" inputMode="decimal" />
      </Gruppe>
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
        className="btn-grau mt-3 disabled:opacity-40"
      >
        Abgleichen
      </button>

      <KategorienListe fin={fin} onWahl={setKat} />
    </Sheet>
  );
}

const ART_TEXT: Record<KassenKategorie["art"], string> = {
  beide: "Einnahmen und Ausgaben",
  ein: "Nur Einnahmen",
  aus: "Nur Ausgaben",
};

/**
 * Kategorien als iOS-Liste: je Kategorie EINE Zeile (Farbe, Name, wofür) mit
 * „›“ – Bearbeiten und Löschen auf der Unterseite. Vorher standen in jeder
 * Zeile „Ändern“ und ein roter Mülleimer, das Formular klappte mitten in der
 * Gruppe auf.
 */
function KategorienListe({ fin, onWahl }: { fin: FinanzenValue; onWahl: (k: KassenKategorie | "neu") => void }) {
  const dunkel = useDunkel();
  return (
    <Gruppe
      titel="Kategorien"
      className="mt-6"
      fuss="Die Farbe steht im Kreis, im Balken der Übersicht und als Punkt an jeder Zeile. Mehrere Kategorien dürfen dieselbe Farbe haben."
    >
      {fin.kategorien.map((k) => (
        <Zeile
          key={k.id}
          label={k.name}
          unter={ART_TEXT[k.art]}
          onClick={() => onWahl(k)}
          symbol={<span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: farbHex(k.farbe, dunkel) }} />}
        />
      ))}
      <Zeile label="Neue Kategorie" blau onClick={() => onWahl("neu")} />
    </Gruppe>
  );
}

/** Unterseite „Kategorie“: Name, Farbe, wofür – Sichern unten, Löschen ganz unten mit Rückfrage. */
function KategorieSeite({
  k, fin, onZurueck, onClose,
}: {
  k: KassenKategorie | "neu";
  fin: FinanzenValue;
  onZurueck: () => void;
  onClose: () => void;
}) {
  const neu = k === "neu";
  const [name, setName] = useState(neu ? "" : k.name);
  const [farbe, setFarbe] = useState(() => {
    if (!neu) return k.farbe;
    const belegt = new Set(fin.kategorien.map((x) => x.farbe));
    return KASSEN_FARBEN.find((f) => !["blau", "grau"].includes(f.key) && !belegt.has(f.key))?.key ?? "orange";
  });
  const [art, setArt] = useState<KassenKategorie["art"]>(neu ? "beide" : k.art);
  const [busy, setBusy] = useState(false);

  async function speichern() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const f = await fin.kategorieSpeichern({ id: neu ? undefined : k.id, name: name.trim(), farbe, art });
    setBusy(false);
    if (f) meldeFehler("Hat nicht geklappt: " + f);
    else onZurueck();
  }

  return (
    <>
      <SheetKopf titel={neu ? "Neue Kategorie" : "Kategorie"} zurueck={{ text: "Einstellungen", onClick: onZurueck }} onClose={onClose} />
      <Gruppe className="">
        <ZeileEingabe label="Name" value={name} onChange={setName} placeholder="z. B. Lehrerkarten" maxLength={40} autoFocus={neu} onEnter={() => void speichern()} />
      </Gruppe>
      <Gruppe titel="Farbe">
        <div className="px-4 pb-3 pt-0.5">
          <FarbWahl wert={farbe} setzen={setFarbe} />
        </div>
      </Gruppe>
      <Gruppe titel="Für welche Buchungen">
        {(["beide", "ein", "aus"] as const).map((a) => (
          <ZeileHaken key={a} label={ART_TEXT[a]} gewaehlt={art === a} onClick={() => setArt(a)} />
        ))}
      </Gruppe>
      {!neu && (
        <Gruppe className="mt-6">
          <Zeile
            label="Kategorie löschen"
            rot
            onClick={async () => {
              if (!(await frage(`Kategorie „${k.name}“ löschen? Die Buchungen bleiben, sie verlieren nur die Farbe.`, "Löschen", true))) return;
              const f = await fin.kategorieLoeschen(k.id);
              if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
              else onZurueck();
            }}
          />
        </Gruppe>
      )}
      <FussLeiste>
        <button type="button" disabled={busy || !name.trim()} onClick={() => void speichern()} className="btn-primary">
          {busy ? "…" : neu ? "Anlegen" : "Sichern"}
        </button>
      </FussLeiste>
    </>
  );
}

// ==================================================================== Kostenanfragen

const STATUS: Record<KostenAnfrage["status"], { text: string; klasse: string }> = {
  offen: { text: "wartet", klasse: "bg-offen-grund text-offen" },
  genehmigt: { text: "genehmigt", klasse: "bg-bezahlt-grund text-bezahlt" },
  abgelehnt: { text: "abgelehnt", klasse: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

/**
 * `alsZeile` (Kassenbuch am Handy, nichts offen): nur EINE Zeile
 * „Kostenanfragen · keine“ in einer Gruppe, die Liste im Blatt. Steht etwas
 * zur Entscheidung an, zeigt FinanzenTab die ganze Karte oben.
 */
function KostenKarte({
  kosten, darfEntscheiden, vorsitze, onEntschieden, alsZeile = false,
}: {
  kosten: KostenValue;
  darfEntscheiden: boolean;
  vorsitze: string[];
  onEntschieden?: () => void;
  alsZeile?: boolean;
}) {
  const { profile } = useProfiles();
  const [neu, setNeu] = useState(false);
  const [auswahl, setAuswahl] = useState<KostenAnfrage | null>(null);
  const [alle, setAlle] = useState(false);
  const [listeAuf, setListeAuf] = useState(false);

  const offene = kosten.anfragen.filter((a) => a.status === "offen");
  const erledigte = kosten.anfragen.filter((a) => a.status !== "offen");
  const sichtbarErledigt = alle ? erledigte : erledigte.slice(0, 3);
  // Aus der Benachrichtigung „Kostenanfrage“: gleich die Anfrage öffnen
  useSprungziel("kosten", darfEntscheiden && offene.length > 0, () => {
    if (offene.length === 1) setAuswahl(offene[0]);
    else hinScrollen("sprung-kosten");
  });

  const kopf = (
    <div className="mb-1.5 flex items-center gap-3 px-4">
      <h2 className="auf-bild min-w-0 flex-1 text-[13px] font-semibold uppercase tracking-[0.02em] text-tinte-leise">
        Kostenanfragen{offene.length > 0 ? ` · ${offene.length} offen` : ""}
      </h2>
      {vorsitze.length > 0 && (
        <button onClick={() => setNeu(true)} className="btn-klein shrink-0 gap-1">
          <Icon name="plus" size={14} strich={2.6} />
          Anfragen
        </button>
      )}
    </div>
  );
  const liste = (imBlatt: boolean) => (
    <>
      {!kosten.bereit ? (
        <div className="gruppe-zellen px-4 py-5 text-center text-[14px] text-tinte-leise">Lädt …</div>
      ) : kosten.anfragen.length === 0 ? (
        // Eine Zeile wie in den iOS-Einstellungen statt eines hohen, zentrierten Kastens
        <div className="gruppe-zellen flex min-h-[44px] items-center px-4 text-[15px] text-tinte-leise">Keine Anfragen</div>
      ) : (
        <div className="gruppe-zellen">
          {[...offene, ...sichtbarErledigt].map((a) => (
            <button
              key={a.id}
              onClick={() => setAuswahl(a)}
              className={`flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06] ${
                a.status === "offen" && darfEntscheiden ? "bg-offen-grund/70" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{a.titel}</span>
                <span className="block truncate text-[12.5px] text-tinte-leise">
                  {committeeLabel(a.tag)} · {profile[a.created_by]?.anzeigename || "Vorsitz"}
                  {a.benoetigt_am ? ` · bis ${kurzTag(a.benoetigt_am)}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="zahl text-[15px] font-bold">{euro(a.cent)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS[a.status].klasse}`}>
                  {STATUS[a.status].text}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Ohne Anfragen am Handy ohne Erklärzeile – „Keine Anfragen“ reicht
          (im Blatt steht sie immer: dort fragt man sich, wozu das da ist) */}
      <p
        className={`auf-bild mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise ${
          !imBlatt && kosten.anfragen.length === 0 && vorsitze.length === 0 ? "max-lg:hidden" : ""
        }`}
      >
        {vorsitze.length > 0
          ? "Du brauchst Geld fürs Komitee? Hier anfragen – der Kassenwart entscheidet."
          : darfEntscheiden
            ? "Anfragen der Komitee-Vorsitzenden. Genehmigen bucht die Ausgabe sofort."
            : "Anfragen der Komitee-Vorsitzenden an den Kassenwart."}
      </p>
      {erledigte.length > 3 && (
        <button onClick={() => setAlle(!alle)} className="mt-1 flex min-h-[44px] w-full items-center justify-center text-[15px] font-medium text-brand-dark dark:text-brand">
          {alle ? "Weniger anzeigen" : `Alle ${erledigte.length} erledigten anzeigen`}
        </button>
      )}
    </>
  );
  const blaetter = (
    <>
      <KostenAnfrageSheet open={neu} onClose={() => setNeu(false)} vorsitze={vorsitze} onStellen={kosten.stellen} />
      <AnfrageDetailSheet
        anfrage={auswahl}
        onClose={() => setAuswahl(null)}
        darfEntscheiden={darfEntscheiden}
        kosten={kosten}
        onEntschieden={onEntschieden}
        name={auswahl ? profile[auswahl.created_by]?.anzeigename || "Vorsitz" : ""}
      />
    </>
  );

  if (alsZeile)
    return (
      <>
        <Zeile
          label="Kostenanfragen"
          symbol={
            <Symbol farbe="bg-[#5856D6]">
              <Icon name="finanzen" size={16} strich={2.2} />
            </Symbol>
          }
          onClick={() => setListeAuf(true)}
        >
          <span className="zahl truncate text-[15px] text-tinte-leise">
            {!kosten.bereit ? "…" : offene.length > 0 ? `${offene.length} offen` : erledigte.length > 0 ? `keine offen · ${erledigte.length} erledigt` : "keine"}
          </span>
        </Zeile>
        <Sheet open={listeAuf} onClose={() => setListeAuf(false)}>
          {/* Als Zeile gibt es nichts zu entscheiden und keinen Vorsitz – die
              Überschrift steht im Blattkopf, „+ Anfragen“ braucht es nicht */}
          <SheetKopf titel="Kostenanfragen" onClose={() => setListeAuf(false)} />
          {liste(true)}
        </Sheet>
        {blaetter}
      </>
    );

  return (
    <section id="sprung-kosten" className="min-w-0">
      {kopf}
      {liste(false)}
      {blaetter}
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

  // Nur beim Öffnen leeren – ein Neuladen der Vorsitze (neues Array) darf
  // die angefangene Anfrage nicht löschen
  useEffect(() => {
    if (!open) return;
    setTitel("");
    setBetrag("");
    setBis("");
    setNachricht("");
    setFehler("");
  }, [open]);
  const erstesKomitee = vorsitze[0] || "";
  const komiteeGueltig = vorsitze.includes(tag);
  useEffect(() => {
    if (open && !komiteeGueltig) setTag(erstesKomitee);
  }, [open, komiteeGueltig, erstesKomitee]);

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
      <SheetKopf titel="Kosten anfragen" unter="Kassenwart und Admin bekommen eine Benachrichtigung." onClose={onClose} />

      {/* Komitee: bei mehreren als Auswahlliste mit Haken (ohne Emoji-Chips), bei einem als Zeile */}
      {vorsitze.length > 1 ? (
        <Gruppe titel="Für welches Komitee?" className="">
          {vorsitze.map((k) => (
            <ZeileHaken key={k} label={committeeLabel(k)} gewaehlt={tag === k} onClick={() => setTag(k)} />
          ))}
        </Gruppe>
      ) : (
        vorsitze.length === 1 && (
          <Gruppe className="">
            <Zeile label="Komitee">
              <Wert>{committeeLabel(tag)}</Wert>
            </Zeile>
          </Gruppe>
        )
      )}

      <label className="mt-4 block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-titel">Wofür</label>
      <input id="kosten-titel" className="field mt-1" placeholder="z. B. Deko für den Abiball" value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <label className="block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-betrag">Betrag</label>
          <div className="field mt-1 flex items-center gap-1 !py-0">
            <input
              id="kosten-betrag"
              className="zahl min-w-0 flex-1 bg-transparent py-3 text-[16px] font-bold outline-none"
              inputMode="decimal"
              placeholder="0,00"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
            <span className="font-bold text-tinte-matt">€</span>
          </div>
        </div>
        <div className="min-w-0">
          <label className="block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-bis">Gebraucht bis</label>
          <input id="kosten-bis" type="date" className="field mt-1 min-w-0" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
      </div>

      <label className="mt-4 block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-text">Begründung (freiwillig)</label>
      <textarea
        id="kosten-text"
        className="field mt-1 min-h-[4rem]"
        placeholder="z. B. Angebot vom Baumarkt, 3 Rollen Lichterkette"
        value={nachricht}
        maxLength={1000}
        onChange={(e) => setNachricht(e.target.value)}
      />

      {fehler && <p className="mt-2 px-1 text-[13px] font-semibold text-amber-700 dark:text-amber-400">{fehler}</p>}
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
      <SheetKopf
        titel={a.titel}
        unter={`${committeeLabel(a.tag)} · ${name}`}
        onClose={onClose}
        extra={
          <span className={`mt-1 h-fit shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${STATUS[a.status].klasse}`}>
            {STATUS[a.status].text}
          </span>
        }
      />

      <div className="zahl text-[2rem] font-extrabold leading-none">{euro(a.cent)}</div>
      <div className="mt-1 text-[13px] text-tinte-leise">
        angefragt am {new Date(a.created_at).toLocaleDateString("de-DE")}
        {a.benoetigt_am ? ` · gebraucht bis ${kurzTag(a.benoetigt_am)}` : ""}
      </div>
      {a.nachricht && (
        <p className="mt-3 whitespace-pre-wrap rounded-[0.875rem] zelle p-4 text-[15px] leading-snug">{a.nachricht}</p>
      )}

      {a.status !== "offen" && (
        <div className="mt-3 text-[14px] text-tinte-matt dark:text-slate-300">
          {a.status === "genehmigt" ? "Genehmigt und als Ausgabe gebucht" : "Abgelehnt"}
          {a.decided_at ? ` am ${new Date(a.decided_at).toLocaleDateString("de-DE")}` : ""}
          {a.antwort ? <span className="mt-1 block">„{a.antwort}“</span> : null}
        </div>
      )}

      {a.status === "offen" && darfEntscheiden && (
        <div className="mt-5">
          <label className="block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-antwort">Antwort (freiwillig)</label>
          <input
            id="kosten-antwort"
            className="field mt-1"
            placeholder="z. B. Bitte Kassenbon abgeben"
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
          />
          <label className="mt-3 block px-1 text-[13px] font-semibold text-tinte-leise" htmlFor="kosten-datum">Buchungsdatum bei Genehmigung</label>
          <input id="kosten-datum" type="date" className="field mt-1" value={datum} onChange={(e) => setDatum(e.target.value)} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => void entscheiden(false)} className="btn-grau !text-red-600 dark:!text-red-400">
              Ablehnen
            </button>
            <button disabled={busy} onClick={() => void entscheiden(true)} className="btn-primary">
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
          className="btn-grau mt-4"
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

/** So viele neueste Buchungen zeigt die Vorschau am Handy/iPad hoch */
const VORSCHAU = 3;

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
  // Handy/iPad hoch: alle Buchungen (Filter, Suche, Monate) im Blatt
  const [alleOffen, setAlleOffen] = useState(false);

  const liste = useMemo(() => {
    const n = q.trim().toLowerCase();
    return buchungen.filter((b) => {
      if (filter === "ein" && (b.cent < 0 || b.quelle === "abgleich")) return false;
      if (filter === "aus" && (b.cent > 0 || b.quelle === "abgleich")) return false;
      if (n && !`${b.titel} ${zuweisungText(b, aktionName)} ${euro(Math.abs(b.cent))}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [buchungen, filter, q, aktionName]);
  const neueste = useMemo(() => [...buchungen].sort((x, y) => y.datum.localeCompare(x.datum)).slice(0, VORSCHAU), [buchungen]);

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

  /** Filter, Suche und Monate – am Laptop in der Spalte, am Handy im Blatt */
  const ganzeListe = (imBlatt: boolean) => (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3 px-1 pt-2 lg:shrink-0 lg:pt-0">
        {!imBlatt && <h2 className="auf-bild mr-auto text-[1.375rem] font-bold tracking-[-0.02em]">Buchungen</h2>}
        <div className="seg w-full sm:w-80" role="radiogroup" aria-label="Buchungen filtern">
          {FILTER.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`seg-item whitespace-nowrap ${filter === k ? "seg-aktiv" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="feld-auf-bild mb-4 flex h-11 items-center gap-2 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)] lg:mb-3 lg:shrink-0">
        <span className="text-tinte-leise">
          <Icon name="lupe" size={17} />
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-tinte-leise"
          placeholder="Suchen, z. B. Waffel oder Abiball"
          aria-label="Buchungen durchsuchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Suche leeren" className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center text-tinte-leise">
            ✕
          </button>
        )}
      </div>

      {liste.length === 0 ? (
        <div className="card py-10 text-center text-[14px] text-tinte-leise">Keine Buchungen.</div>
      ) : (
        // Eigene Scroll-Fläche nur am Laptop; das Raster darin behält seine
        // volle Höhe (in einem Raster mit fester Höhe würden die Monate gestaucht)
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:rounded-[1.25rem]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
          {gruppen.map(([monat, zeilen]) => {
            const summe = zeilen.reduce((n, b) => n + (b.quelle === "abgleich" ? 0 : b.cent), 0);
            const auf = istOffen(monat);
            return (
              // Am Laptop scrollt die Spalte in sich: der Monatskopf klebt
              // dann oben (wie die Abschnittsköpfe in Mail), statt beim
              // ersten Mausrad-Ruck angeschnitten zu verschwinden. „clip“
              // statt „hidden“: schneidet die runden Ecken weiter ab, macht
              // die Liste aber nicht selbst zur Scrollfläche (sonst klebt nichts).
              <ul key={monat} className="liste border border-black/[0.04] dark:border-white/[0.06] lg:!overflow-clip">
                <li className="lg:sticky lg:top-0 lg:z-[1] lg:bg-[rgb(var(--zelle))]">
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
                    <BuchungsZeile key={b.id} b={b} kategorien={kategorien} aktionName={aktionName} onOeffnen={() => setAuswahl(b)} />
                  ))}
              </ul>
            );
          })}
        </div>
        </div>
      )}
    </>
  );

  return (
    // Am Laptop die rechte Spalte der geteilten Ansicht: so hoch wie der Platz
    // (siehe spaltenOben in FinanzenTab), Filter und Suche bleiben stehen, nur
    // die Monate scrollen – overscroll-contain: am Listenende läuft das
    // Scrollen nicht an die linke Spalte oder die Seite weiter.
    <section className="min-w-0 max-lg:order-2 lg:flex lg:h-[calc(100dvh-var(--finanz-oben,14rem)-1rem)] lg:flex-col">
      {/* Handy/iPad hoch: wie „Letzte Transaktionen“ in Wallet – die neuesten
          Buchungen und „Alle Buchungen ›“; Filter, Suche und Monate im Blatt.
          Vorher standen Filter, Suche und alle Monate auf der Seite (gut ein
          Bildschirm). */}
      <div className="lg:hidden">
        <div className="mb-2 px-1 pt-2">
          <h2 className="auf-bild text-[1.375rem] font-bold tracking-[-0.02em]">Buchungen</h2>
        </div>
        {buchungen.length === 0 ? (
          <div className="card py-10 text-center text-[14px] text-tinte-leise">Keine Buchungen.</div>
        ) : (
          <ul className="liste border border-black/[0.04] dark:border-white/[0.06]">
            {neueste.map((b) => (
              <BuchungsZeile key={b.id} b={b} kategorien={kategorien} aktionName={aktionName} onOeffnen={() => setAuswahl(b)} />
            ))}
            <li>
              <button
                onClick={() => setAlleOffen(true)}
                className="flex min-h-[48px] w-full items-center gap-2 px-4 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1 text-[15px] font-medium text-brand-dark dark:text-brand">Alle {buchungen.length} Buchungen</span>
                <span className="shrink-0 text-[13px] text-tinte-leise">suchen, filtern</span>
                <span aria-hidden className="shrink-0 text-tinte-leise">
                  <Icon name="chevron" size={14} strich={2.4} />
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>
      {/* Laptop/iPad quer: die ganze Liste in der Spalte (contents: die Teile
          bleiben Kinder der Flex-Spalte, sonst scrollt die Liste nicht in sich) */}
      <div className="max-lg:hidden lg:contents">{ganzeListe(false)}</div>
      <Sheet open={alleOffen} onClose={() => setAlleOffen(false)}>
        <SheetKopf titel="Buchungen" onClose={() => setAlleOffen(false)} />
        {ganzeListe(true)}
      </Sheet>

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

function BuchungsZeile({
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
          {/* Zwei Zeilen statt abgeschnitten: am Ende steht oft der Name („… – Bauer, Lena“) */}
          <span className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{b.titel || zu}</span>
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
      {/* Derselbe klebende Kopf wie in allen Blättern (Titel links, ✕ rechts) –
          vorher ein eigener Kopf, dessen ✕ beim Scrollen verschwand. */}
      <SheetKopf
        titel={b.titel || zuweisungText(b, aktionName)}
        unter={new Date(b.datum + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        onClose={onClose}
      />

      {/* Kachel und Betrag mittig – wie eine Buchung in Wallet */}
      <div className="flex flex-col items-center px-2 pb-5 pt-2 text-center">
        <Kachel b={b} gross kategorien={kategorien} />
        <div className="mt-3">
          <Betrag b={b} gross />
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

      {/* Löschen ganz unten als eigene Gruppe, mit Rückfrage (Design-Regeln §2) */}
      {darf && !b.automatisch && (
        <Gruppe className="mt-6">
          <Zeile
            label="Buchung löschen"
            rot
            disabled={busy}
            onClick={async () => {
              if (!(await frage(`Buchung „${b.titel}“ über ${euro(Math.abs(b.cent))} löschen?`, "Löschen", true))) return;
              setBusy(true);
              const f = await onLoeschen(b.id);
              setBusy(false);
              if (f) meldeFehler("Löschen hat nicht geklappt: " + f);
              else onClose();
            }}
          />
        </Gruppe>
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
    // Am Handy 120 px statt 176 px – das SVG skaliert mit (viewBox bleibt)
    <div className="relative h-[120px] w-[120px] shrink-0 sm:h-[176px] sm:w-[176px]">
      <svg viewBox={`0 0 ${G} ${G}`} className="h-full w-full -rotate-90" role="img" aria-label="Einnahmen nach Quelle">
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
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center leading-tight sm:px-6">
        {hervor ? (
          <>
            <span className="max-w-full truncate text-[12px] font-semibold text-tinte-leise">{hervor.label}</span>
            <span className="zahl text-[1rem] font-extrabold sm:text-[1.15rem]">{euroKurz(hervor.cent)}</span>
          </>
        ) : prozent !== null ? (
          <>
            <span className="zahl text-[1.35rem] font-extrabold sm:text-[1.7rem]">{prozent} %</span>
            <span className="text-[12px] text-tinte-leise">vom Ziel</span>
          </>
        ) : (
          <>
            <span className="zahl text-[1rem] font-extrabold sm:text-[1.15rem]">{euroKurz(summe)}</span>
            <span className="text-[12px] text-tinte-leise">eingenommen</span>
          </>
        )}
      </div>
    </div>
  );
}

