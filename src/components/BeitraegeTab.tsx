import { useEffect, useState } from "react";
import { useStore } from "../store";
import { beitraegeVon, staffelVon } from "../lib/logic";
import { useEntwurf } from "../lib/entwurf";
import { AbiballEinstellungen } from "./AbiballEinstellungen";
import { HY, type ContribTemplate, type Halbjahr, type Staffel } from "../lib/types";
import { Gruppe, Wert, Zeile, ZeileEingabe, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { Sheet, SheetKopf } from "./Sheet";
import { FussLeiste } from "./Kachel";
import { useBreit } from "../lib/gescrollt";

import { frage } from "../lib/melder";

/**
 * iPad hoch und breiter (ab 768 px, Tailwind „md“)? Dort ist Platz für zwei
 * Spalten. Eigener kleiner Hook wie useBreit (gescrollt.ts), nur für diese Seite.
 */
const MITTEL = "(min-width: 768px)";
function useMittel(): boolean {
  const [mittel, setMittel] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(MITTEL).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MITTEL);
    if (!mq) return;
    const neu = () => setMittel(mq.matches);
    neu();
    mq.addEventListener("change", neu);
    return () => mq.removeEventListener("change", neu);
  }, []);
  return mittel;
}

/**
 * Zahl zum Ändern als kleine Kapsel: „+50 €“, „25 €“, „8 %“ – Zahl und Einheit
 * dicht beieinander und auf einer Linie. Vorher stand die Zahl in einem
 * 56 px breiten Feld rechtsbündig, das „+“ weit links davon und das „€“
 * etwas höher daneben (Rückmeldung 15.10.: „+     50 €“).
 * Die Kapsel zeigt außerdem, dass man den Wert antippen und ändern kann.
 */
function ZahlFeld({
  wert,
  aendern,
  speichern,
  einheit,
  plus,
  max,
  label,
}: {
  wert: number;
  aendern: (n: number) => void;
  speichern: () => void;
  einheit: "€" | "%";
  plus?: boolean;
  max?: number;
  label: string;
}) {
  return (
    <span className="zahl inline-flex shrink-0 cursor-text items-baseline rounded-lg bg-[rgb(118_118_128/0.12)] px-2.5 py-1 text-[16px] font-semibold leading-tight text-brand-dark transition focus-within:ring-2 focus-within:ring-brand/40 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand">
      {plus && <span aria-hidden>+</span>}
      <input
        type="number"
        min={0}
        max={max}
        inputMode="numeric"
        aria-label={label}
        // So breit wie die Zahl (mind. 1 Zeichen) – kein Loch zwischen „+“, Zahl und Einheit
        style={{ width: `${Math.max(1, String(wert).length)}ch` }}
        className="bg-transparent p-0 text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={wert}
        onChange={(e) => aendern(Math.max(0, Math.min(max ?? Infinity, Number(e.target.value) || 0)))}
        onBlur={speichern}
      />
      <span aria-hidden className="ml-1">
        {einheit}
      </span>
    </span>
  );
}

/**
 * Kasse → „Beiträge & Abiball“ (Umschalter oben; früher ein eigener Reiter):
 * hier wird festgelegt, wofür es wie viel Prozent gibt und
 * was das Abiballticket kostet. Beim Eintragen bei einer Person wird danach nur
 * noch aus dieser Liste ausgewählt.
 *
 * Aufgebaut wie die iOS-Einstellungen: oben ein Segment, darunter Gruppen aus
 * Zeilen. Keine eigenen Kästen, keine nativen Kästchen, kein Müll-Emoji.
 */
export function BeitraegeTab() {
  const { templates, settings, addTemplate, updateTemplate, removeTemplate, setSettings } = useStore();
  // Möglichkeit antippen → Blatt zum Bearbeiten; "neu" → Blatt zum Anlegen
  const [offen, setOffen] = useState<string | "neu" | null>(null);

  const sortiert = [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte);
  const staffel = staffelVon(settings);
  const grund = settings.ticket_preis || 0;
  const preis = useEntwurf(grund, (wert) => setSettings({ ticket_preis: wert }));
  const preise = beitraegeVon(settings);
  const gesamt = HY.reduce((n, h) => n + (preise[h] || 0), 0);

  // Drei Bereiche. Am Handy einer zur Zeit – als Segment (vorher Kacheln, die
  // wie reine Zahlen-Anzeigen aussahen und nicht wie Reiter).
  const [bereich, setBereich] = useState<"prozente" | "halbjahre" | "ticket">("prozente");
  // Am Rechner ist Platz für alle drei nebeneinander, am iPad hoch für zwei
  // Spalten – kein Umschalten, kein leerer Bildschirm unter einer kurzen Liste
  // (Rollen-Prüfung Okt. 2026: am iPad hoch war gut die Hälfte leer).
  const breit = useBreit();
  const mittel = useMittel();
  const spalten = breit ? 3 : mittel ? 2 : 1;

  const reiter: { key: typeof bereich; titel: string }[] = [
    { key: "prozente", titel: "Prozente" },
    { key: "halbjahre", titel: "Halbjahre" },
    { key: "ticket", titel: "Ticket" },
  ];

  /* ---------------- Möglichkeiten ---------------- */
  const prozente = (
    <>
      <Gruppe
        titel="Wofür gibt es Prozent?"
        className=""
        fuss="Diese Liste siehst du später, wenn du bei jemandem etwas einträgst. Antippen zum Ändern oder Löschen."
      >
        {sortiert.length === 0 && <div className="px-4 py-4 text-[14px] text-tinte-leise">Noch nichts angelegt.</div>}
        {sortiert.map((t) => (
          <Zeile
            key={t.id}
            label={t.titel}
            unter={t.variabel ? "Wert beim Eintragen anpassbar" : undefined}
            onClick={() => setOffen(t.id)}
          >
            <Wert>{t.punkte} %</Wert>
          </Zeile>
        ))}
        <Zeile label="Neue Möglichkeit" blau onClick={() => setOffen("neu")} />
      </Gruppe>

      <VorlageNeu
        open={offen === "neu"}
        onClose={() => setOffen(null)}
        onAnlegen={(t, p, v) => {
          addTemplate(t, p, v);
          setOffen(null);
        }}
      />
      {(() => {
        const v = offen && offen !== "neu" ? templates.find((x) => x.id === offen) : undefined;
        return v ? (
          <VorlageBlatt
            key={v.id}
            vorlage={v}
            onClose={() => setOffen(null)}
            onAendern={(patch) => updateTemplate(v.id, patch)}
            onLoeschen={async () => {
              if (!(await frage(`„${v.titel}“ wirklich löschen?`, "Löschen", true))) return;
              setOffen(null);
              void removeTemplate(v.id);
            }}
          />
        ) : null;
      })()}
    </>
  );

  /* ---------------- Beitrag je Halbjahr ---------------- */
  const halbjahre = (
    <>
      <Gruppe
        titel="Was kostet ein Halbjahr?"
        className=""
        fuss="Der Betrag gilt für jede Person, die in dem Halbjahr dabei ist. Änderst du einen Wert, rechnen sich alle offenen Beträge sofort neu aus."
      >
        {HY.map((h) => (
          <HalbjahrZeile
            key={h}
            halbjahr={h}
            betrag={preise[h]}
            aktuell={h === settings.aktuelles_halbjahr}
            onBetrag={(wert) => setSettings({ beitraege: { ...preise, [h]: wert } })}
          />
        ))}
      </Gruppe>
      <Gruppe className="mt-5">
        <Zeile label="Alle sechs Halbjahre zusammen">
          <Wert stark>{gesamt} €</Wert>
        </Zeile>
      </Gruppe>
    </>
  );

  /* ---------------- Abiballticket ---------------- */
  const ticket = (
    <>
      <Gruppe
        titel="Abiball-Ticket"
        className=""
        fuss={grund === 0 ? "0 = Preis noch offen. Eltern und Schüler sehen dann „Preis folgt“." : undefined}
      >
        <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1 text-[15px]">Grundpreis je Ticket</span>
          <ZahlFeld wert={preis.wert} aendern={preis.aendern} speichern={preis.jetztSpeichern} einheit="€" label="Grundpreis je Ticket in Euro" />
        </label>
      </Gruppe>

      <Gruppe
        titel="Aufschlag fürs 1. Ticket, je Prozentstufe"
        className="mt-5"
        fuss="Wer wenig mithilft, zahlt auf das 1. Ticket einen Aufschlag. Je mehr Mithilfe, desto kleiner wird er. Es zählt die höchste erreichte Stufe; weitere Tickets kosten den Grundpreis."
      >
        {staffel.map((stufe, i) => (
          <StufenZeile
            key={stufe.ab}
            stufe={stufe}
            grund={grund}
            onBetrag={(wert) => setSettings({ staffel: staffel.map((x, j) => (j === i ? { ...x, betrag: wert } : x)) })}
          />
        ))}
      </Gruppe>
    </>
  );

  // Laptop (3 Spalten): Prozente + Bonus | Halbjahre + Abiball | Ticket +
  // Verkauf + Bestellungen – etwa gleich lang. iPad hoch (2 Spalten): links
  // Prozente, Bonus und Halbjahre, rechts alles zum Ticket samt Abiball-Tag.
  // Handy: ein Bereich, darunter (bei Ticket) alle Abiball-Gruppen.
  if (spalten > 1) {
    // Abiball-Gruppen bringen ihren Abstand (mt-4) selbst mit
    const bonus = <AbiballEinstellungen nur={["bonus"]} />;
    const abiball = <AbiballEinstellungen nur={["abiball"]} />;
    const verkauf = <AbiballEinstellungen nur={["verkauf", "bestellungen"]} />;
    return (
      // Volle Breite der Seitenspalte (max-w-5xl in App.tsx) – KEIN eigenes
      // max-w-*: sonst endet der Inhalt am Laptop mitten auf der Seite, während
      // Titel, Reiterleiste und Knöpfe bis zum Rand der Spalte gehen.
      <div className={`grid items-start gap-x-4 ${spalten === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {spalten === 3 ? (
          <>
            <div className="min-w-0">
              {prozente}
              {bonus}
            </div>
            <div className="min-w-0">
              {halbjahre}
              {abiball}
            </div>
          </>
        ) : (
          <div className="min-w-0">
            {prozente}
            {bonus}
            <div className="mt-4">{halbjahre}</div>
          </div>
        )}
        <div className="min-w-0">
          {ticket}
          {/* iPad hoch: Tag und Ort stehen auf dem Ticket – hier, dann sind
              beide Spalten etwa gleich lang */}
          {spalten === 2 && abiball}
          {verkauf}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="seg mb-3" role="tablist" aria-label="Bereich">
        {reiter.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={bereich === r.key}
            onClick={() => setBereich(r.key)}
            className={`seg-item !py-2 !text-[14px] ${bereich === r.key ? "seg-aktiv" : ""}`}
          >
            {r.titel}
          </button>
        ))}
      </div>
      {bereich === "prozente" && prozente}
      {bereich === "halbjahre" && halbjahre}
      {bereich === "ticket" && (
        <>
          {ticket}
          <AbiballEinstellungen />
        </>
      )}
    </div>
  );
}

/**
 * Eine Möglichkeit bearbeiten – als Blatt wie in den iOS-Einstellungen
 * (vorher stand in jeder Zeile ein Kippschalter links, der Wert ganz rechts
 * und ein roter Mülleimer: unruhig und am Laptop weit auseinandergezogen).
 * Titel und Prozent speichern nach kurzer Tipp-Pause bzw. beim Verlassen.
 */
function VorlageBlatt({
  vorlage,
  onClose,
  onAendern,
  onLoeschen,
}: {
  vorlage: ContribTemplate;
  onClose: () => void;
  onAendern: (patch: Partial<Pick<ContribTemplate, "titel" | "punkte" | "variabel">>) => void;
  onLoeschen: () => void;
}) {
  const titel = useEntwurf(vorlage.titel, (wert) => onAendern({ titel: wert }));
  const punkte = useEntwurf(vorlage.punkte, (wert) => onAendern({ punkte: wert }));
  const schliessen = () => {
    titel.jetztSpeichern();
    punkte.jetztSpeichern();
    onClose();
  };

  return (
    <Sheet open onClose={schliessen}>
      <SheetKopf titel="Möglichkeit" unter="Änderungen werden sofort gespeichert." onClose={schliessen} />
      <Gruppe className="">
        <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <span className="shrink-0 text-[15px]">Wofür</span>
          <input
            aria-label="Wofür (Bezeichnung)"
            className="min-w-0 flex-1 bg-transparent text-right text-[15px] outline-none"
            value={titel.wert}
            onChange={(e) => titel.aendern(e.target.value)}
            onBlur={titel.jetztSpeichern}
          />
        </label>
        <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1 text-[15px]">Prozent</span>
          <ZahlFeld wert={punkte.wert} aendern={punkte.aendern} speichern={punkte.jetztSpeichern} einheit="%" max={100} label="Prozent" />
        </label>
      </Gruppe>
      <Gruppe fuss="Anpassbar heißt: Der Wert darf beim Eintragen je nach Aufwand geändert werden.">
        <ZeileMitSchalter label="Anpassbar">
          <Schalter an={Boolean(vorlage.variabel)} label="Wert beim Eintragen anpassbar" onChange={(v) => onAendern({ variabel: v })} />
        </ZeileMitSchalter>
      </Gruppe>
      <Gruppe className="mt-6">
        <Zeile label="Möglichkeit löschen" rot onClick={onLoeschen} />
      </Gruppe>
    </Sheet>
  );
}

/** Neue Möglichkeit anlegen – gleiche Felder wie beim Bearbeiten. */
function VorlageNeu({
  open,
  onClose,
  onAnlegen,
}: {
  open: boolean;
  onClose: () => void;
  onAnlegen: (titel: string, punkte: number, variabel: boolean) => void;
}) {
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");
  const [variabel, setVariabel] = useState(false);
  const los = () => {
    const t = titel.trim();
    if (!t) return;
    onAnlegen(t, Math.max(0, Math.min(100, Number(punkte) || 0)), variabel);
    setTitel("");
    setPunkte("5");
    setVariabel(false);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Neue Möglichkeit" onClose={onClose} />
      <Gruppe className="">
        <ZeileEingabe label="Wofür" value={titel} onChange={setTitel} placeholder="z. B. Fotobox betreut" autoFocus onEnter={los} />
        <ZeileEingabe label="Prozent" value={punkte} onChange={setPunkte} type="number" inputMode="numeric" onEnter={los} />
      </Gruppe>
      <Gruppe fuss="Anpassbar heißt: Der Wert darf beim Eintragen je nach Aufwand geändert werden.">
        <ZeileMitSchalter label="Anpassbar">
          <Schalter an={variabel} label="Wert beim Eintragen anpassbar" onChange={setVariabel} />
        </ZeileMitSchalter>
      </Gruppe>
      <FussLeiste>
        <button className="btn-primary" disabled={!titel.trim()} onClick={los}>
          Hinzufügen
        </button>
      </FussLeiste>
    </Sheet>
  );
}

/** Eine Stufe der Abiball-Staffel. Speichert ebenfalls erst nach kurzer Pause. */
function StufenZeile({
  stufe,
  grund,
  onBetrag,
}: {
  stufe: Staffel;
  grund: number;
  onBetrag: (wert: number) => void;
}) {
  const betrag = useEntwurf(stufe.betrag, onBetrag);

  return (
    <label className="flex min-h-[52px] min-w-0 items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">ab {stufe.ab} % Mithilfe</span>
        <span className="zahl block text-[12.5px] text-tinte-leise">1. Ticket kostet {grund + betrag.wert} €</span>
      </span>
      <ZahlFeld wert={betrag.wert} aendern={betrag.aendern} speichern={betrag.jetztSpeichern} einheit="€" plus label={`Aufschlag ab ${stufe.ab} Prozent in Euro`} />
    </label>
  );
}

/** Ein Halbjahr mit seinem Preis. Speichert erst nach kurzer Pause. */
function HalbjahrZeile({
  halbjahr,
  betrag,
  aktuell,
  onBetrag,
}: {
  halbjahr: Halbjahr;
  betrag: number;
  aktuell: boolean;
  onBetrag: (wert: number) => void;
}) {
  const wert = useEntwurf(betrag, onBetrag);

  return (
    <label className="flex min-h-[52px] min-w-0 items-center gap-3 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{halbjahr}</span>
        {aktuell && <span className="block text-[12.5px] font-medium text-brand-dark dark:text-brand">läuft gerade</span>}
      </span>
      <ZahlFeld wert={wert.wert} aendern={wert.aendern} speichern={wert.jetztSpeichern} einheit="€" label={`Beitrag ${halbjahr} in Euro`} />
    </label>
  );
}
