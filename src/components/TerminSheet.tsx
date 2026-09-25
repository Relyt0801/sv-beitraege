import { useEffect, useMemo, useState } from "react";
import { COMMITTEES, committeeIcon } from "../lib/committees";
import { normalize, sortStudents } from "../lib/logic";
import { useStore } from "../store";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { Sheet } from "./Sheet";
import {
  FARBEN, STUNDEN, SYMBOLE, WOCHENTAG_WAHL, heuteKey, istKuerzel, plusTage, tagLang, uhr, wiederholungsTage, zeitText,
  type NeuerTermin, type Sichtbarkeit, type Termin,
} from "../lib/termine";
import { committeeLabel } from "../lib/committees";
import { umfangText } from "../lib/termine";

import { frage } from "../lib/melder";
import { terminAlsDatei, useKalenderDemo } from "../lib/kalender-sync";
const seg = "flex-1 rounded-lg py-2 text-[13px] font-bold transition";

/**
 * Termin anlegen oder ändern.
 *
 * Pflicht sind nur Titel und Datum. Alles andere darf leer bleiben – ein
 * "Mottowoche" ohne Uhrzeit und Raum ist ein gültiger Eintrag.
 */
export function TerminSheet({
  offen,
  termin,
  startDatum,
  entwurf,
  onSchliessen,
  onGespeichert,
}: {
  offen: boolean;
  /** gesetzt = bearbeiten, null = neu */
  termin: Termin | null;
  startDatum: string;
  /** Vorausgefüllt – kommt aus einer übernommenen Terminanfrage. */
  entwurf?: NeuerTermin | null;
  onSchliessen: () => void;
  /** Läuft nach dem erfolgreichen Speichern – damit die Anfrage, aus der
   *  dieser Termin entstanden ist, danach als erledigt abgehakt wird. */
  onGespeichert?: () => void;
}) {
  const { anlegen, anlegenViele, aendern, loeschen } = useTermine();
  const { students } = useStore();
  const { can, isStaff } = useRole();
  const darf = isStaff || can("termine.manage");

  const [titel, setTitel] = useState("");
  const [ort, setOrt] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [datum, setDatum] = useState(startDatum || heuteKey());
  const [mehrtaegig, setMehrtaegig] = useState(false);
  const [bisDatum, setBisDatum] = useState("");
  const [ganztaegig, setGanztaegig] = useState(false);
  const [von, setVon] = useState("07:35");
  const [bis, setBis] = useState("16:15");
  const [sichtbar, setSichtbar] = useState<Sichtbarkeit>("alle");
  const [fuerEltern, setFuerEltern] = useState(false);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [personen, setPersonen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [wiederholt, setWiederholt] = useState(false);
  const [wdhBis, setWdhBis] = useState("");
  const [wochentage, setWochentage] = useState<Set<number>>(new Set());
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);
  // Neuer Termin: standardmäßig Mitteilung. Änderung: standardmäßig still.
  const [melden, setMelden] = useState(true);
  const [farbe, setFarbe] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [frei, setFrei] = useState(false);

  // Beim Öffnen befüllen – bearbeiten heißt: alles steht schon drin.
  useEffect(() => {
    if (!offen) return;
    setFehler("");
    if (termin) {
      setTitel(termin.titel);
      setOrt(termin.ort);
      setBeschreibung(termin.beschreibung);
      setDatum(termin.datum);
      setMehrtaegig(Boolean(termin.bis_datum && termin.bis_datum !== termin.datum));
      setBisDatum(termin.bis_datum || "");
      setGanztaegig(!termin.von);
      setVon(uhr(termin.von) || "07:35");
      setBis(uhr(termin.bis) || "16:15");
      setSichtbar(termin.sichtbar);
      setFuerEltern(termin.fuer_eltern);
      setTags(new Set(termin.tags));
      setPersonen(new Set(termin.personen));
      setFarbe(termin.farbe ?? null);
      setSymbol(termin.icon ?? "");
      setFrei(Boolean(termin.frei));
    } else if (entwurf) {
      // Aus einer Anfrage übernommen: alles steht schon drin, das Team
      // muss nur noch prüfen und auf "Eintragen" drücken.
      setTitel(entwurf.titel);
      setOrt(entwurf.ort);
      setBeschreibung(entwurf.beschreibung);
      setDatum(entwurf.datum);
      setMehrtaegig(Boolean(entwurf.bis_datum && entwurf.bis_datum !== entwurf.datum));
      setBisDatum(entwurf.bis_datum || "");
      setGanztaegig(!entwurf.von);
      setVon(entwurf.von || "07:35");
      setBis(entwurf.bis || "16:15");
      setSichtbar(entwurf.sichtbar);
      setFuerEltern(entwurf.fuer_eltern);
      setTags(new Set(entwurf.tags));
      setPersonen(new Set(entwurf.personen));
      setFarbe(entwurf.farbe ?? null);
      setSymbol(entwurf.icon ?? "");
      setFrei(Boolean(entwurf.frei));
    } else {
      setTitel("");
      setOrt("");
      setBeschreibung("");
      setDatum(startDatum || heuteKey());
      setMehrtaegig(false);
      setBisDatum("");
      setGanztaegig(false);
      setVon("07:35");
      setBis("16:15");
      setSichtbar("alle");
      setFuerEltern(false);
      setTags(new Set());
      setPersonen(new Set());
      setFarbe(null);
      setSymbol("");
      setFrei(false);
    }
    setMelden(!termin);
    setWiederholt(false);
    setWdhBis("");
    setWochentage(new Set());
    setQ("");
  }, [offen, termin, startDatum, entwurf]);

  /** Die Tage, an denen der Termin tatsächlich entsteht. Nur bei
   *  "wiederholt sich" – sonst ist es genau der eine gewählte Tag. */
  const wdhTage = useMemo(
    () => (wiederholt ? wiederholungsTage(datum, wdhBis, [...wochentage]) : []),
    [wiederholt, datum, wdhBis, wochentage],
  );

  const liste = useMemo(() => {
    const n = normalize(q);
    return sortStudents(students).filter(
      (s) => !n || normalize(`${s.nachname} ${s.vorname}`).includes(n),
    );
  }, [students, q]);

  if (!darf) return null;

  async function speichern() {
    if (!titel.trim()) return setFehler("Gib dem Termin eine Bezeichnung.");
    if (!datum) return setFehler("Wähle ein Datum.");
    if (mehrtaegig && bisDatum && bisDatum < datum) return setFehler("Das Ende liegt vor dem Anfang.");
    if (wiederholt) {
      if (wochentage.size === 0) return setFehler("Wähle mindestens einen Wochentag.");
      if (!wdhBis) return setFehler("Bis wann soll sich der Termin wiederholen?");
      if (wdhTage.length === 0) return setFehler("In diesem Zeitraum liegt keiner der gewählten Wochentage.");
    }
    if (!ganztaegig && von && bis && bis <= von && !mehrtaegig)
      return setFehler("Die Endzeit liegt vor der Anfangszeit.");
    if (sichtbar === "komitee" && tags.size === 0) return setFehler("Wähle mindestens ein Komitee.");
    if (sichtbar === "personen" && personen.size === 0) return setFehler("Wähle mindestens eine Person.");

    const daten: NeuerTermin = {
      titel,
      beschreibung,
      ort,
      datum,
      bis_datum: mehrtaegig && bisDatum ? bisDatum : null,
      von: ganztaegig ? null : von || null,
      bis: ganztaegig ? null : bis || null,
      sichtbar,
      fuer_eltern: fuerEltern,
      tags: sichtbar === "komitee" ? [...tags] : [],
      personen: sichtbar === "personen" ? [...personen] : [],
      icon: symbol.trim() || null,
      farbe,
      frei,
      // Beim Ändern einer Schicht die Verbindung zur Aktion behalten –
      // vorher wurde sie hier stillschweigend gelöscht.
      aktion_id: termin?.aktion_id ?? entwurf?.aktion_id ?? null,
      plaetze: termin?.plaetze ?? entwurf?.plaetze ?? null,
    };

    setBusy(true);
    // Wiederholung heißt: echte Einzeltermine, sofort ausgerechnet. Fällt
    // eine Woche aus, löscht man diesen einen Tag – der Rest bleibt stehen.
    const f = termin
      ? await aendern(termin.id, daten, { melden })
      : wiederholt
        ? await anlegenViele(wdhTage.map((tag) => ({ ...daten, datum: tag, bis_datum: null })), { melden })
        : await anlegen(daten, { melden });
    setBusy(false);
    if (f) setFehler("Speichern hat nicht geklappt: " + f);
    else {
      onGespeichert?.();
      onSchliessen();
    }
  }

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <div className="mb-4 flex items-center gap-3">
        <span className="min-w-0 flex-1 font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">
          {termin ? "Termin ändern" : "Neuer Termin"}
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>

      {/* ------------------------------------------------ Was */}
      <label className="mb-2 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Bezeichnung</span>
        <input
          className="field"
          placeholder="z. B. Komiteesitzung Abiball"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          autoFocus
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Ort (optional)</span>
        <input
          className="field"
          placeholder="z. B. Raum 204"
          value={ort}
          onChange={(e) => setOrt(e.target.value)}
        />
      </label>

      {/* ------------------------------------------------ Wann */}
      <div className="mb-3 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">
              {wiederholt ? "Ab" : "Am"}
            </span>
            <input
              type="date"
              className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </label>
        </div>

        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          <Haken an={ganztaegig} setzen={setGanztaegig} text="ganztägig" />
          {!wiederholt && <Haken an={mehrtaegig} setzen={setMehrtaegig} text="über mehrere Tage" />}
          {/* Beim Ändern nicht anbieten: sonst würde aus einem Termin
              plötzlich eine ganze Reihe und der alte bliebe stehen. */}
          {!termin && (
            <Haken
              an={wiederholt}
              setzen={(v) => {
                setWiederholt(v);
                if (v) {
                  setMehrtaegig(false);
                  if (!wdhBis) setWdhBis(plusTage(datum || heuteKey(), 42));
                }
              }}
              text="wiederholt sich"
            />
          )}
        </div>

        {wiederholt && (
          <div className="mb-2 rounded-xl bg-papier-matt p-2.5 dark:bg-slate-800">
            <label className="mb-2 flex items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Bis</span>
              <input
                type="date"
                min={datum}
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900"
                value={wdhBis}
                onChange={(e) => setWdhBis(e.target.value)}
              />
            </label>
            <div className="mb-2 flex flex-wrap gap-1">
              {WOCHENTAG_WAHL.map((w) => {
                const an = wochentage.has(w.nr);
                return (
                  <button
                    key={w.nr}
                    onClick={() =>
                      setWochentage((prev) => {
                        const n = new Set(prev);
                        if (an) n.delete(w.nr);
                        else n.add(w.nr);
                        return n;
                      })
                    }
                    aria-label={w.lang}
                    className={`h-9 w-10 rounded-lg text-[12px] font-bold transition ${
                      an ? "bg-brand text-white" : "bg-white text-tinte-matt dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {w.kurz}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed text-tinte-leise">
              {wdhTage.length === 0
                ? "Wähle Wochentage und einen Zeitraum."
                : `Das ergibt ${wdhTage.length} Termin${wdhTage.length === 1 ? "" : "e"} – vom ${tagLang(wdhTage[0])} bis ${tagLang(wdhTage[wdhTage.length - 1])}. Jeder steht einzeln im Kalender und lässt sich einzeln absagen.`}
            </p>
          </div>
        )}

        {mehrtaegig && !wiederholt && (
          <label className="mb-2 flex items-center gap-2">
            <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Bis</span>
            <input
              type="date"
              min={datum}
              className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
              value={bisDatum}
              onChange={(e) => setBisDatum(e.target.value)}
            />
          </label>
        )}

        {!ganztaegig && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Von</span>
              <input
                type="time"
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
                value={von}
                onChange={(e) => setVon(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Bis</span>
              <input
                type="time"
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
                value={bis}
                onChange={(e) => setBis(e.target.value)}
              />
            </label>
          </div>
        )}

        {!ganztaegig && (
          <StundenWahl
            von={von}
            bis={bis}
            setzen={(v, b) => {
              setVon(v);
              setBis(b);
            }}
          />
        )}
      </div>

      {/* ------------------------------------------------ Aussehen */}
      <div className="mb-3 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
        <div className="mb-1.5 text-[12px] font-semibold text-tinte-leise">Farbe im Kalender</div>
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Farbe">
          <button
            role="radio"
            aria-checked={farbe === null}
            onClick={() => setFarbe(null)}
            className={`flex h-8 items-center rounded-full border px-2.5 text-[12px] font-bold ${
              farbe === null ? "border-brand text-brand" : "border-papier-linie text-tinte-leise dark:border-slate-700"
            }`}
          >
            Standard
          </button>
          {FARBEN.map((f) => (
            <button
              key={f.key}
              role="radio"
              aria-checked={farbe === f.key}
              aria-label={f.name}
              title={f.name}
              onClick={() => setFarbe(f.key)}
              className={`h-8 w-8 rounded-full ${f.punkt} transition ${
                farbe === f.key ? "ring-2 ring-brand ring-offset-2 dark:ring-offset-slate-900" : ""
              }`}
            />
          ))}
        </div>

        <div className="mb-1.5 text-[12px] font-semibold text-tinte-leise">Zeichen</div>
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            onClick={() => setSymbol("")}
            className={`h-9 rounded-lg px-2.5 text-[12px] font-bold ${
              !symbol ? "bg-brand text-white" : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            keins
          </button>
          {SYMBOLE.map((z) => (
            <button
              key={z}
              onClick={() => setSymbol(z)}
              aria-label={`Zeichen ${z}`}
              className={`h-9 w-9 rounded-lg text-[18px] leading-none transition ${
                symbol === z ? "bg-brand/15 ring-2 ring-brand" : "bg-papier-matt dark:bg-slate-800"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">oder Kürzel</span>
          <input
            className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] font-bold uppercase dark:border-slate-700 dark:bg-slate-800"
            placeholder="z. B. M, EK, F7"
            maxLength={4}
            value={istKuerzel(symbol) ? symbol : ""}
            onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4))}
          />
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-tinte-leise">
          Ein Fach-Kürzel steht als kleines Schild im Kalender – gut für Klausuren.
        </p>

        <div className="mt-3">
          <Haken
            an={frei}
            setzen={(v) => {
              setFrei(v);
              if (v) {
                setGanztaegig(true);
                if (!farbe) setFarbe("gruen");
              }
            }}
            text="Ferien / unterrichtsfrei"
          />
          <p className="mt-1 pl-7 text-[11px] leading-relaxed text-tinte-leise">
            Färbt die Tage im Kalender durchgehend ein – auch über mehrere Wochen.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------ Wer */}
      <div className="mb-2 text-[13px] font-semibold text-tinte-matt">Wer sieht den Termin?</div>
      <div className="mb-2 flex gap-1.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
        {(
          [
            ["alle", "Alle"],
            ["komitee", "Komitees"],
            ["personen", "Personen"],
          ] as [Sichtbarkeit, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSichtbar(k)}
            className={`${seg} ${sichtbar === k ? "bg-brand text-white" : "text-tinte-matt"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-tinte-leise">
        {sichtbar === "alle"
          ? "Jeder in der Stufe sieht diesen Termin."
          : "Wer nicht dazugehört, sieht den Termin gar nicht – auch keine Lücke im Kalender."}
      </p>

      {sichtbar === "komitee" && (
        <div className="mb-3 grid gap-1 rounded-2xl border border-papier-linie p-2 dark:border-slate-700 sm:grid-cols-2">
          {COMMITTEES.map((c) => {
            const on = tags.has(c.slug);
            return (
              <button
                key={c.slug}
                onClick={() =>
                  setTags((prev) => {
                    const n = new Set(prev);
                    if (on) n.delete(c.slug);
                    else n.add(c.slug);
                    return n;
                  })
                }
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition ${
                  on ? "bg-brand/10 text-brand" : "hover:bg-papier-matt dark:hover:bg-slate-800"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] text-white ${
                    on ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="shrink-0">{committeeIcon(c.slug)}</span>
                <span className="min-w-0 truncate">{c.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {sichtbar === "personen" && (
        <div className="mb-3 rounded-2xl border border-papier-linie p-2 dark:border-slate-700">
          <input
            className="field mb-2"
            placeholder="Person suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto">
            {liste.map((s) => {
              const on = personen.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    setPersonen((prev) => {
                      const n = new Set(prev);
                      if (on) n.delete(s.id);
                      else n.add(s.id);
                      return n;
                    })
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                    on ? "bg-brand/10 font-semibold text-brand" : "hover:bg-papier-matt dark:hover:bg-slate-800"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] text-white ${
                      on ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 truncate">
                    {s.nachname}, {s.vorname}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="px-1 pt-1 text-[11px] text-tinte-leise">
            {personen.size === 0 ? "Noch niemand gewählt" : `${personen.size} ausgewählt`}
          </div>
        </div>
      )}

      <div className="mb-3">
        <Haken
          an={fuerEltern}
          setzen={setFuerEltern}
          text="Eltern sehen diesen Termin auch"
        />
        <p className="mt-1 pl-7 text-[11px] leading-relaxed text-tinte-leise">
          Standardmäßig aus. Sinnvoll z. B. beim Abiball oder der Zeugnisvergabe.
        </p>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-semibold text-tinte-leise">Notiz (optional)</span>
        <textarea
          className="field min-h-[4.5rem]"
          placeholder="Was man vorher wissen sollte …"
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
        />
      </label>

      <div className="mb-3">
        <Haken
          an={melden}
          setzen={setMelden}
          text={termin ? "Änderung als Mitteilung schicken" : "Mitteilung an alle, die ihn sehen"}
        />
        <p className="mt-1 pl-7 text-[11px] leading-relaxed text-tinte-leise">
          {termin
            ? "Aus: Der Termin ändert sich still im Kalender. An, wenn sich Zeit, Datum oder Ort ändern."
            : melden
              ? "Kommt bei allen an, die Mitteilungen erlaubt haben."
              : "Still eintragen: Der Termin steht nur im Kalender, niemand bekommt ein Pop-up."}
        </p>
      </div>

      {fehler && <p className="mb-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}

      <div className="flex gap-2">
        <button disabled={busy} onClick={speichern} className="btn-primary min-w-0 flex-1 disabled:opacity-50">
          {busy
            ? "…"
            : termin
              ? "Speichern"
              : wiederholt && wdhTage.length > 0
                ? `${wdhTage.length} Termine eintragen`
                : "Eintragen"}
        </button>
        {termin && (
          <button
            onClick={async () => {
              if (await frage(`Den Termin „${termin.titel}" wirklich löschen?`, "Löschen", true)) {
                void loeschen(termin.id);
                onSchliessen();
              }
            }}
            className="shrink-0 rounded-xl border border-red-300 px-4 text-[14px] font-bold text-red-500 dark:border-red-500/40"
          >
            Löschen
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Schnellwahl nach Schulstunden: erste Wahl = Beginn, zweite = Ende. */
function StundenWahl({ von, bis, setzen }: { von: string; bis: string; setzen: (von: string, bis: string) => void }) {
  const ab = STUNDEN.find((s) => s.von === von)?.nr ?? null;
  const bisNr = STUNDEN.find((s) => s.bis === bis)?.nr ?? null;
  const [warteAufEnde, setWarteAufEnde] = useState(false);
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-semibold text-tinte-leise">
        {warteAufEnde ? "Bis zu welcher Stunde?" : "Nach Schulstunden (tippen: Beginn, dann Ende)"}
      </div>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {STUNDEN.map((s) => {
          const drin = ab !== null && bisNr !== null && s.nr >= ab && s.nr <= bisNr;
          return (
            <button
              key={s.nr}
              title={`${s.nr}. Stunde: ${s.von}–${s.bis}`}
              onClick={() => {
                if (warteAufEnde && ab !== null && s.nr >= ab) {
                  setzen(STUNDEN[ab - 1].von, s.bis);
                  setWarteAufEnde(false);
                } else {
                  setzen(s.von, s.bis);
                  setWarteAufEnde(true);
                }
              }}
              className={`rounded-lg py-1.5 text-center leading-tight transition ${
                drin ? "bg-brand text-white" : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <span className="block text-[12px] font-extrabold">{s.nr}.</span>
              <span className={`block text-[9px] ${drin ? "text-white/85" : "text-tinte-leise"}`}>{s.von}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Haken({
  an, setzen, text,
}: { an: boolean; setzen: (v: boolean) => void; text: string }) {
  return (
    <button onClick={() => setzen(!an)} className="flex items-center gap-2 text-[13px] font-semibold">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] text-white ${
          an ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
        }`}
      >
        {an ? "✓" : ""}
      </span>
      <span className="text-tinte-matt dark:text-slate-300">{text}</span>
    </button>
  );
}

/** Ein Termin zum Ansehen – für alle, die ihn nicht ändern dürfen. */
export function TerminAnsehen({
  termin, onSchliessen, onBearbeiten,
}: { termin: Termin | null; onSchliessen: () => void; onBearbeiten?: () => void }) {
  const { termine, loeschen, loeschenViele, zuteilen } = useTermine();
  const { students } = useStore();
  const { isStaff, can } = useRole();
  const darf = isStaff || can("termine.manage");
  const kalenderDemo = useKalenderDemo();
  // Immer den frischen Stand zeigen (z. B. nach dem Austragen einer Person)
  const t = termin ? termine.find((x) => x.id === termin.id) ?? termin : null;

  /** Die "Reihe": gleicher Titel, gleiche Uhrzeit, gleiche Aktion, ab heute. */
  const reihe = useMemo(() => {
    if (!t) return [] as Termin[];
    const heute = heuteKey();
    return termine.filter(
      (x) =>
        x.titel === t.titel && x.von === t.von && x.bis === t.bis &&
        (x.aktion_id || null) === (t.aktion_id || null) && x.datum >= heute,
    );
  }, [termine, t]);

  if (!t) return null;
  const termin_ = t;
  const namen = new Map(students.map((s) => [s.id, `${s.vorname} ${s.nachname}`]));
  return (
    <Sheet open onClose={onSchliessen}>
      <div className="mb-3 flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-zahl text-[1.25rem] font-extrabold leading-tight tracking-[-0.02em]">
            {termin_.titel}
          </span>
          {umfangText(termin_, committeeLabel) && (
            <span className="mt-0.5 block text-[12px] text-tinte-leise">
              {umfangText(termin_, committeeLabel)}
            </span>
          )}
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>

      <dl className="grid gap-2">
        <Zeile label="Wann" wert={`${tagLang(termin_.datum)}${termin_.bis_datum && termin_.bis_datum !== termin_.datum ? ` bis ${tagLang(termin_.bis_datum)}` : ""}`} />
        <Zeile label="Uhrzeit" wert={zeitText(termin_)} />
        {termin_.ort && <Zeile label="Ort" wert={termin_.ort} />}
      </dl>

      {termin_.beschreibung && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-papier-matt p-3 text-[13px] leading-relaxed text-tinte-matt dark:bg-slate-800 dark:text-slate-300">
          {termin_.beschreibung}
        </p>
      )}

      {termin_.personen.length > 0 && (termin_.aktion_id || darf) && (
        <div className="mt-3">
          <div className="mb-1 text-[12px] font-semibold text-tinte-leise">
            {termin_.aktion_id ? "Eingeteilt" : "Für diese Personen"}
          </div>
          <ul className="grid gap-1">
            {termin_.personen.map((sid) => (
              <li key={sid} className="flex items-center gap-2 rounded-lg bg-papier-matt px-2.5 py-1.5 text-[13px] dark:bg-slate-800">
                <span className="min-w-0 flex-1 truncate font-semibold">{namen.get(sid) || "Unbekannt"}</span>
                {darf && termin_.aktion_id && (
                  <button
                    onClick={async () => {
                      if (await frage(`${namen.get(sid) || "Diese Person"} aus der Schicht nehmen? Sie bekommt Bescheid.`, "Austragen", true))
                        void zuteilen(termin_.id, sid, false);
                    }}
                    className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold text-red-500"
                    aria-label="Austragen"
                  >
                    austragen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {darf && (
        <div className="mt-4 grid gap-1.5 rounded-xl border border-red-200 p-2.5 dark:border-red-500/30">
          <button
            onClick={async () => {
              if (await frage(`„${termin_.titel}" am ${tagLang(termin_.datum)} löschen?`, "Löschen", true)) {
                void loeschen(termin_.id);
                onSchliessen();
              }
            }}
            className="w-full rounded-lg py-2 text-[13px] font-bold text-red-500"
          >
            Nur diesen Termin löschen
          </button>
          {reihe.length > 1 && (
            <button
              onClick={async () => {
                if (await frage(`Alle ${reihe.length} kommenden Termine „${termin_.titel}" löschen?`, "Alle löschen", true)) {
                  void loeschenViele(reihe.map((x) => x.id));
                  onSchliessen();
                }
              }}
              className="w-full rounded-lg bg-red-500 py-2 text-[13px] font-bold text-white"
            >
              Alle {reihe.length} kommenden „{termin_.titel}" löschen
            </button>
          )}
        </div>
      )}

      {/* Testphase: einzelnen Termin in den eigenen Kalender übernehmen */}
      {kalenderDemo && (
        <button onClick={() => terminAlsDatei(termin_)} className="btn-grau mt-4 gap-2 !text-[15px]">
          <span aria-hidden>📱</span> In meinen Kalender übernehmen
        </button>
      )}

      <div className="mt-4 flex gap-2">
        {onBearbeiten && (
          <button
            onClick={onBearbeiten}
            className="min-w-0 flex-1 rounded-xl border border-papier-linie py-2.5 text-[14px] font-bold text-tinte-matt dark:border-slate-700"
          >
            Ändern
          </button>
        )}
        <button onClick={onSchliessen} className="btn-primary min-w-0 flex-1">
          Fertig
        </button>
      </div>
    </Sheet>
  );
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
      <dt className="w-20 shrink-0 text-[12px] font-semibold text-tinte-leise">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] font-semibold">{wert}</dd>
    </div>
  );
}
