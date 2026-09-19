import { useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { Sheet } from "./Sheet";
import {
  WOCHENTAG_WAHL, heuteKey, plusTage, tagLang, wiederholungsTage,
  type Aktion, type NeuerTermin,
} from "../lib/termine";

const ICONS = ["🧇", "🍰", "🥣", "☕", "🍪", "🎪", "🧹", "📦", "🎨", "🎵", "📣", "📌"];

/**
 * Eine Aktion ausschreiben und ihre Schichten festlegen.
 *
 * Beispiel Waffelverkauf: Aktion wählen (oder neu anlegen), dann entweder
 * einen einzelnen Termin oder "jeden Montag und Donnerstag, 1. große Pause,
 * bis zu den Ferien". Die Wiederholung wird sofort in einzelne Schichten
 * umgerechnet – so lässt sich eine ausgefallene Pause später einfach löschen,
 * ohne dass die ganze Reihe auseinanderfällt.
 */
export function AktionSheet({ offen, onSchliessen }: { offen: boolean; onSchliessen: () => void }) {
  const { aktionen, aktionAnlegen, anlegenViele } = useTermine();

  const [aktionId, setAktionId] = useState<string>("");
  const [neuTitel, setNeuTitel] = useState("");
  const [neuIcon, setNeuIcon] = useState("🧇");
  const [neuProzent, setNeuProzent] = useState("5");

  const [wiederholt, setWiederholt] = useState(false);
  const [datum, setDatum] = useState(heuteKey());
  const [bis, setBis] = useState(plusTage(heuteKey(), 42));
  const [tage, setTage] = useState<Set<number>>(new Set([1, 4]));
  const [von, setVon] = useState("09:35");
  const [ende, setEnde] = useState("09:55");
  const [ort, setOrt] = useState("");
  const [plaetze, setPlaetze] = useState("2");

  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  const gewaehlt = aktionen.find((a) => a.id === aktionId) || null;
  const offeneAktionen = aktionen.filter((a) => !a.geschlossen);

  /** Die Tage, an denen tatsächlich eine Schicht entsteht. */
  const termine = useMemo(
    () => (wiederholt ? wiederholungsTage(datum, bis, [...tage]) : datum ? [datum] : []),
    [wiederholt, datum, bis, tage],
  );

  async function speichern() {
    setFehler("");
    let id = aktionId;

    // Neue Aktion? Erst anlegen, dann die Schichten dranhängen.
    if (!id) {
      if (!neuTitel.trim()) return setFehler("Wähle eine Aktion oder gib ihr einen Namen.");
      setBusy(true);
      const f = await aktionAnlegen({
        titel: neuTitel.trim(),
        icon: neuIcon,
        beschreibung: "",
        prozent: Math.max(0, Math.min(100, Number(neuProzent) || 0)),
        geschlossen: false,
      });
      setBusy(false);
      if (f) return setFehler("Die Aktion konnte nicht angelegt werden: " + f);
      // Nach dem Anlegen steht sie in der Liste – die neueste mit dem Titel.
      const frisch = [...aktionen].reverse().find((a) => a.titel === neuTitel.trim());
      id = frisch?.id ?? "";
      if (!id) {
        setFehler("Die Aktion wurde angelegt. Öffne das Fenster noch einmal für die Schichten.");
        return;
      }
    }

    if (termine.length === 0) return setFehler("Kein Tag getroffen. Prüfe Zeitraum und Wochentage.");

    const aktion = aktionen.find((a) => a.id === id);
    const liste: NeuerTermin[] = termine.map((tag) => ({
      titel: aktion?.titel || neuTitel.trim(),
      beschreibung: "",
      ort: ort.trim(),
      datum: tag,
      bis_datum: null,
      von: von || null,
      bis: ende || null,
      sichtbar: "alle",
      fuer_eltern: false,
      tags: [],
      personen: [],
      aktion_id: id,
      plaetze: Math.max(1, Number(plaetze) || 1),
      icon: aktion?.icon || neuIcon,
    }));

    setBusy(true);
    const f = await anlegenViele(liste);
    setBusy(false);
    if (f) return setFehler("Die Schichten konnten nicht angelegt werden: " + f);
    onSchliessen();
  }

  return (
    <Sheet open={offen} onClose={onSchliessen}>
      <div className="mb-4 flex items-center gap-3">
        <span className="min-w-0 flex-1 font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">
          Aktion ausschreiben
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>

      {/* ------------------------------------------------ Welche Aktion */}
      <div className="mb-2 text-[13px] font-semibold text-tinte-matt">Worum geht es?</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {offeneAktionen.map((a) => (
          <button
            key={a.id}
            onClick={() => setAktionId(a.id === aktionId ? "" : a.id)}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-semibold transition active:scale-[.98] ${
              a.id === aktionId
                ? "border-brand bg-brand text-white"
                : "border-papier-linie bg-white dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <span>{a.icon}</span>
            {a.titel}
            <span className={a.id === aktionId ? "text-white/70" : "text-brand"}>+{a.prozent} %</span>
          </button>
        ))}
      </div>

      {!aktionId && (
        <div className="mb-3 rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
          <div className="mb-1.5 text-[12px] font-semibold text-tinte-leise">… oder neue Aktion</div>
          <input
            className="field mb-2"
            placeholder="z. B. Kuchenverkauf am Elternabend"
            value={neuTitel}
            onChange={(e) => setNeuTitel(e.target.value)}
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setNeuIcon(i)}
                className={`h-9 w-9 rounded-lg text-lg transition ${
                  neuIcon === i ? "bg-brand/15 ring-2 ring-brand" : "hover:bg-papier-matt dark:hover:bg-slate-800"
                }`}
                aria-label={`Zeichen ${i}`}
              >
                {i}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-tinte-leise">Zählt als</span>
            <input
              type="number"
              min={0}
              max={100}
              className="w-16 rounded-lg border border-papier-linie bg-white px-2 py-1.5 text-center text-[14px] font-bold text-brand dark:border-slate-700 dark:bg-slate-800"
              value={neuProzent}
              onChange={(e) => setNeuProzent(e.target.value)}
            />
            <span className="text-[12px] font-bold text-brand">%</span>
            <span className="text-[11px] text-tinte-leise">Mithilfe je Schicht</span>
          </label>
        </div>
      )}

      {/* ------------------------------------------------ Wann */}
      <div className="mb-2 flex gap-1.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
        <button
          onClick={() => setWiederholt(false)}
          className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition ${
            !wiederholt ? "bg-brand text-white" : "text-tinte-matt"
          }`}
        >
          Einmalig
        </button>
        <button
          onClick={() => setWiederholt(true)}
          className={`flex-1 rounded-lg py-2 text-[13px] font-bold transition ${
            wiederholt ? "bg-brand text-white" : "text-tinte-matt"
          }`}
        >
          Regelmäßig
        </button>
      </div>

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
          {wiederholt && (
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Bis</span>
              <input
                type="date"
                min={datum}
                className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
                value={bis}
                onChange={(e) => setBis(e.target.value)}
              />
            </label>
          )}
        </div>

        {wiederholt && (
          <div className="mb-2 flex flex-wrap gap-1">
            {WOCHENTAG_WAHL.map((w) => {
              const an = tage.has(w.nr);
              return (
                <button
                  key={w.nr}
                  onClick={() =>
                    setTage((prev) => {
                      const n = new Set(prev);
                      if (an) n.delete(w.nr);
                      else n.add(w.nr);
                      return n;
                    })
                  }
                  aria-label={w.lang}
                  className={`h-9 w-10 rounded-lg text-[12px] font-bold transition ${
                    an
                      ? "bg-brand text-white"
                      : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {w.kurz}
                </button>
              );
            })}
          </div>
        )}

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
              value={ende}
              onChange={(e) => setEnde(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[12px] font-semibold text-tinte-leise">Ort</span>
          <input
            className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-800"
            placeholder="z. B. Pausenhalle"
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
          />
        </label>
        <label className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] font-semibold text-tinte-leise">Plätze</span>
          <input
            type="number"
            min={1}
            max={20}
            className="w-16 rounded-lg border border-papier-linie bg-white px-2 py-2 text-center text-[14px] font-bold dark:border-slate-700 dark:bg-slate-800"
            value={plaetze}
            onChange={(e) => setPlaetze(e.target.value)}
          />
        </label>
      </div>

      {/* ------------------------------------------------ Vorschau */}
      <div className="mb-3 rounded-xl bg-papier-matt p-3 text-[12px] leading-relaxed text-tinte-matt dark:bg-slate-800 dark:text-slate-300">
        {termine.length === 0 ? (
          "Noch kein Tag getroffen."
        ) : (
          <>
            Das ergibt <b>{termine.length}</b> {termine.length === 1 ? "Schicht" : "Schichten"} mit je{" "}
            <b>{Math.max(1, Number(plaetze) || 1)}</b> Plätzen:
            <br />
            <span className="text-tinte-leise">
              {termine.slice(0, 3).map((t) => tagLang(t)).join(" · ")}
              {termine.length > 3 ? ` … bis ${tagLang(termine[termine.length - 1])}` : ""}
            </span>
          </>
        )}
      </div>

      {fehler && <p className="mb-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}

      <button
        disabled={busy || termine.length === 0}
        onClick={speichern}
        className="btn-primary disabled:opacity-50"
      >
        {busy ? "…" : `${termine.length || ""} ${termine.length === 1 ? "Schicht" : "Schichten"} ausschreiben`}
      </button>
    </Sheet>
  );
}

export type { Aktion };
