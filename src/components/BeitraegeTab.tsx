import { useState } from "react";
import { useStore } from "../store";
import { beitraegeVon, staffelVon } from "../lib/logic";
import { useEntwurf } from "../lib/entwurf";
import { AbiballEinstellungen } from "./AbiballEinstellungen";
import { HY, type ContribTemplate, type Halbjahr, type Staffel } from "../lib/types";
import { Gruppe, Wert, Zeile, ZeileEingabe } from "./Liste";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";

import { frage } from "../lib/melder";

/** Zahlenfeld ohne Dreh-Pfeile, rechtsbündig, in Blau – so sieht man, dass man es ändern kann. */
const ZAHL_FELD =
  "w-14 bg-transparent text-right text-[16px] font-semibold text-brand-dark outline-none dark:text-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Reiter "Beiträge": hier wird festgelegt, wofür es wie viel Prozent gibt und
 * was das Abiballticket kostet. Beim Eintragen bei einer Person wird danach nur
 * noch aus dieser Liste ausgewählt.
 *
 * Aufgebaut wie die iOS-Einstellungen: oben ein Segment, darunter Gruppen aus
 * Zeilen. Keine eigenen Kästen, keine nativen Kästchen, kein Müll-Emoji.
 */
export function BeitraegeTab() {
  const { templates, settings, addTemplate, updateTemplate, removeTemplate, setSettings } = useStore();
  const [titel, setTitel] = useState("");
  const [punkte, setPunkte] = useState("5");

  const sortiert = [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte);
  const staffel = staffelVon(settings);
  const grund = settings.ticket_preis || 0;
  const preis = useEntwurf(grund, (wert) => setSettings({ ticket_preis: wert }));
  const preise = beitraegeVon(settings);
  const gesamt = HY.reduce((n, h) => n + (preise[h] || 0), 0);

  // Drei Bereiche, einer zur Zeit – als Segment (vorher Kacheln, die wie
  // reine Zahlen-Anzeigen aussahen und nicht wie Reiter).
  const [bereich, setBereich] = useState<"prozente" | "halbjahre" | "ticket">("prozente");

  function anlegen() {
    const t = titel.trim();
    if (!t) return;
    addTemplate(t, Number(punkte) || 0);
    setTitel("");
    setPunkte("5");
  }

  const reiter: { key: typeof bereich; titel: string }[] = [
    { key: "prozente", titel: "Prozente" },
    { key: "halbjahre", titel: "Halbjahre" },
    { key: "ticket", titel: "Ticket" },
  ];

  return (
    // Linksbündig wie die Überschrift der Seite (vorher mittig – dann fluchteten
    // Titel und Inhalt am Laptop nicht)
    <div className="grid max-w-3xl gap-1">
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

      {/* ---------------- Möglichkeiten ---------------- */}
      {bereich === "prozente" && (
        <>
          <Gruppe
            titel="Wofür gibt es Prozent?"
            className=""
            fuss={
              <>
                Diese Liste siehst du später, wenn du bei jemandem etwas einträgst. <b className="font-semibold">Anpassbar</b> heißt: Der
                Wert darf beim Eintragen je nach Aufwand geändert werden.
              </>
            }
          >
            {sortiert.length === 0 && <div className="px-4 py-4 text-[14px] text-tinte-leise">Noch nichts angelegt – unten die erste Möglichkeit hinzufügen.</div>}
            {sortiert.map((t) => (
              <VorlagenZeile
                key={t.id}
                vorlage={t}
                onAendern={(patch) => updateTemplate(t.id, patch)}
                onLoeschen={() => removeTemplate(t.id)}
              />
            ))}
          </Gruppe>

          <Gruppe titel="Neue Möglichkeit" className="mt-5">
            <ZeileEingabe label="Wofür" value={titel} onChange={setTitel} placeholder="z. B. Fotobox betreut" onEnter={anlegen} />
            <ZeileEingabe label="Prozent" value={punkte} onChange={setPunkte} type="number" inputMode="numeric" onEnter={anlegen} />
          </Gruppe>
          <button onClick={anlegen} disabled={!titel.trim()} className="btn-primary mt-3 gap-2">
            <Icon name="plus" size={18} strich={2.4} />
            Hinzufügen
          </button>
        </>
      )}

      {/* ---------------- Beitrag je Halbjahr ---------------- */}
      {bereich === "halbjahre" && (
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
      )}

      {/* ---------------- Abiballticket ---------------- */}
      {bereich === "ticket" && (
        <>
          <Gruppe
            titel="Abiball-Ticket"
            className=""
            fuss={grund === 0 ? "0 = Preis noch offen. Eltern und Schüler sehen dann „Preis folgt“." : undefined}
          >
            <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 text-[15px]">Grundpreis je Ticket</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Grundpreis je Ticket in Euro"
                className={ZAHL_FELD}
                value={preis.wert}
                onChange={(e) => preis.aendern(Math.max(0, Number(e.target.value) || 0))}
                onBlur={preis.jetztSpeichern}
              />
              <span className="w-4 text-[15px] text-tinte-leise">€</span>
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
                onBetrag={(wert) =>
                  setSettings({ staffel: staffel.map((x, j) => (j === i ? { ...x, betrag: wert } : x)) })
                }
              />
            ))}
          </Gruppe>

          <AbiballEinstellungen />
        </>
      )}
    </div>
  );
}

/**
 * Eine Möglichkeit der Liste. Titel und Prozentwert werden erst gespeichert,
 * wenn man kurz aufhoert zu tippen oder das Feld verlaesst.
 *
 * Aufbau: oben der Name über die volle Breite (lange Namen werden nicht mehr
 * abgeschnitten), darunter „Anpassbar“ als Kippschalter, Prozent und Löschen.
 */
function VorlagenZeile({
  vorlage,
  onAendern,
  onLoeschen,
}: {
  vorlage: ContribTemplate;
  onAendern: (patch: Partial<Pick<ContribTemplate, "titel" | "punkte" | "variabel">>) => void;
  onLoeschen: () => void;
}) {
  const titel = useEntwurf(vorlage.titel, (wert) => onAendern({ titel: wert }));
  const punkte = useEntwurf(vorlage.punkte, (wert) => onAendern({ punkte: wert }));

  return (
    <div className="min-w-0 px-4 pb-1.5 pt-3">
      <input
        aria-label="Wofür (Bezeichnung)"
        className="w-full bg-transparent text-[16px] font-semibold leading-snug outline-none"
        value={titel.wert}
        onChange={(e) => titel.aendern(e.target.value)}
        onBlur={titel.jetztSpeichern}
      />
      <div className="mt-1 flex min-h-[44px] items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[14px] text-tinte-matt dark:text-slate-300">
          <Schalter an={Boolean(vorlage.variabel)} label="Wert beim Eintragen anpassbar" onChange={(v) => onAendern({ variabel: v })} />
          Anpassbar
        </label>
        <input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          aria-label="Prozent"
          className={ZAHL_FELD + " !w-12"}
          value={punkte.wert}
          onChange={(e) => punkte.aendern(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          onBlur={punkte.jetztSpeichern}
        />
        <span className="text-[15px] font-semibold text-tinte-leise">%</span>
        <button
          type="button"
          onClick={() => void frage(`„${vorlage.titel}“ wirklich löschen?`, "Löschen", true).then((ok) => { if (ok) void onLoeschen(); })}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-red-600 transition active:scale-90 active:bg-red-500/10 dark:text-red-400"
          aria-label={`${vorlage.titel} löschen`}
        >
          <Icon name="muell" size={19} />
        </button>
      </div>
    </div>
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
      <span className="text-[15px] text-tinte-leise">+</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`Aufschlag ab ${stufe.ab} Prozent in Euro`}
        className={ZAHL_FELD}
        value={betrag.wert}
        onChange={(e) => betrag.aendern(Math.max(0, Number(e.target.value) || 0))}
        onBlur={betrag.jetztSpeichern}
      />
      <span className="w-4 text-[15px] text-tinte-leise">€</span>
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
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`Beitrag ${halbjahr} in Euro`}
        className={ZAHL_FELD}
        value={wert.wert}
        onChange={(e) => wert.aendern(Math.max(0, Number(e.target.value) || 0))}
        onBlur={wert.jetztSpeichern}
      />
      <span className="w-4 text-[15px] text-tinte-leise">€</span>
    </label>
  );
}
