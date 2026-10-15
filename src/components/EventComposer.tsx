import { useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Symbol, Zeile, ZeileHaken, ZeileMitSchalter } from "./Liste";
import { Schalter } from "./Schalter";
import { FussLeiste } from "./FussLeiste";
import { Icon } from "./Icon";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { COMMITTEES, committeeIcon } from "../lib/committees";
import { useEvents } from "../events-store";
import { normalize, offenGesamt, sortStudents } from "../lib/logic";
import { NEUE_TYPEN, TYPE_META, type EventType } from "../lib/events";
import { useFunktionen } from "../lib/funktionen";
import { terminNeuAnfordern } from "./TerminSheet";

/**
 * „Neu erstellen“ im Events-Reiter.
 *
 * Oben die zwei Arten, die hier im Blatt ausgefüllt werden (Info, Abstimmung).
 * Direkt darunter – nicht mehr hinter „Vorlagen“ versteckt – die Dinge, die
 * ein eigenes Fenster haben: der Termin (für alle mit „Termine verwalten“ –
 * „Neu“ ist fürs Team DER Knopf zum Anlegen), die Aktion mit Schichten
 * (Waffelverkauf & Co.) und die Pop-up-Umfrage.
 */
export function EventComposer({
  open,
  onClose,
  onVorlagen,
  onUmfrage,
}: {
  open: boolean;
  onClose: () => void;
  /** Wechsel zum Ausschreiben einer Aktion mit Schichten (Waffelverkauf & Co.). */
  onVorlagen?: () => void;
  /** Wechsel zu den Pop-up-Umfragen (eigenes Fenster mit Fragen und Auswertung). */
  onUmfrage?: () => void;
}) {
  const { students, settings, punkte } = useStore();
  const { can, isStaff } = useRole();
  const { sichtbar } = useFunktionen();
  const termineErlaubt = isStaff || can("termine.manage");
  const umfragenErlaubt = Boolean(onUmfrage) && sichtbar("umfragen") && (can("umfragen.verwalten") || can("umfragen.ergebnisse"));
  const { createEvent } = useEvents();

  const [type, setType] = useState<EventType>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isWarning, setIsWarning] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected" | "komitee">("all");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [minOne, setMinOne] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [melden, setMelden] = useState(true);

  const list = useMemo(() => {
    const n = normalize(q);
    return sortStudents(students).filter((s) => !n || normalize(`${s.nachname} ${s.vorname}`).includes(n));
  }, [students, q]);

  function reset() {
    setType("info"); setTitle(""); setBody(""); setIsWarning(false);
    setAudience("all"); setTargets(new Set()); setTags(new Set()); setQ("");
    setOptions(["", ""]); setMultiple(false); setMinOne(true); setShowResults(true); setAnon(true);
    setMelden(true);
  }

  function selectUnpaid() {
    const ids = students.filter((s) => offenGesamt(s, settings, punkte[s.id] || 0) > 0).map((s) => s.id);
    setAudience("selected");
    setTargets(new Set(ids));
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    await createEvent({
      type,
      title: title.trim(),
      body: body.trim(),
      is_warning: type === "info" && isWarning,
      audience,
      target_ids: audience === "selected" ? [...targets] : [],
      tags: audience === "komitee" ? [...tags] : [],
      poll_multiple: multiple,
      poll_min_one: minOne,
      poll_show_results: showResults,
      poll_anon: anon,
      options: type === "umfrage" ? options.map((o) => o.trim()).filter(Boolean) : [],
    }, { melden });
    setBusy(false);
    reset();
    onClose();
  }

  /** Eine Auswahl ein-/ausschalten (Komitees, Personen) */
  const umschalten = (setter: (f: (prev: Set<string>) => Set<string>) => void, id: string) =>
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={<>Neu erstellen</>} onClose={onClose} />

      {/* Art des Beitrags – zwei gleich breite Felder, nichts bricht um */}
      <div className="seg mb-3" role="tablist" aria-label="Art des Beitrags">
        {NEUE_TYPEN.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            onClick={() => setType(t)}
            className={`seg-item whitespace-nowrap !py-2 !text-[14px] ${type === t ? "seg-aktiv" : ""}`}
          >
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Die Dinge mit eigenem Fenster stehen gleich sichtbar daneben */}
      {(termineErlaubt || onVorlagen || umfragenErlaubt) && (
        <Gruppe titel="Oder etwas anderes anlegen" className="mb-4">
          {termineErlaubt && (
            <Zeile
              onClick={() => {
                onClose();
                terminNeuAnfordern();
              }}
              symbol={
                <Symbol farbe="bg-[#FF3B30]">
                  <Icon name="kalender" size={17} strich={2.2} />
                </Symbol>
              }
              label="Termin"
              unter="Sitzung, Klausur, Ferien – steht im Kalender"
            />
          )}
          {onVorlagen && (
            <Zeile
              onClick={onVorlagen}
              symbol={
                <Symbol farbe="bg-[#34C759]">
                  <Icon name="kalender" size={17} strich={2.2} />
                </Symbol>
              }
              label="Aktion mit Schichten"
              unter="z. B. Waffelverkauf: Termine mit Plätzen, in die man sich einträgt"
            />
          )}
          {umfragenErlaubt && (
            <Zeile
              onClick={onUmfrage}
              symbol={
                <Symbol farbe="bg-[#AF52DE]">
                  <Icon name="umfrage" size={17} strich={2.2} />
                </Symbol>
              }
              label="Pop-up-Umfrage"
              unter="Erscheint als Fenster mit Fragen und Auswertung"
            />
          )}
        </Gruppe>
      )}

      <input className="field mb-3" placeholder="Überschrift" aria-label="Überschrift" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="field mb-3 min-h-[90px] resize-y"
        placeholder={type === "umfrage" ? "Frage / Beschreibung (optional)" : "Text"}
        aria-label="Text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {/* Abstimmung */}
      {type === "umfrage" && (
        <>
          <Gruppe titel="Antwortoptionen" className="mb-3">
            {options.map((o, i) => (
              <div key={i} className="flex min-h-[48px] items-center gap-2 pl-4 pr-1">
                <input
                  className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-tinte-leise"
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1}`}
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-tinte-leise active:opacity-50"
                    aria-label={`Option ${i + 1} entfernen`}
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
            <Zeile blau onClick={() => setOptions((prev) => [...prev, ""])} label="Option hinzufügen" />
          </Gruppe>

          <Gruppe
            className="mb-4"
            fuss="Anonym: unter den Antworten stehen graue Kreise statt der Initialen. Wer wie gestimmt hat, sieht nur das Stufenteam."
          >
            <ZeileMitSchalter label="Mehrere Antworten erlaubt">
              <Schalter an={multiple} onChange={setMultiple} label="Mehrere Antworten erlaubt" />
            </ZeileMitSchalter>
            <ZeileMitSchalter label="Antwort ist Pflicht">
              <Schalter an={minOne} onChange={setMinOne} label="Antwort ist Pflicht" />
            </ZeileMitSchalter>
            <ZeileMitSchalter label="Schüler sehen Ergebnisse">
              <Schalter an={showResults} onChange={setShowResults} label="Schüler sehen Ergebnisse" />
            </ZeileMitSchalter>
            <ZeileMitSchalter label="Anonym abstimmen">
              <Schalter an={anon} onChange={setAnon} label="Anonym abstimmen" />
            </ZeileMitSchalter>
          </Gruppe>
        </>
      )}

      {/* Hervorheben: rot – z. B. für Zahlungserinnerungen */}
      {type === "info" && (
        <Gruppe className="mb-4">
          <ZeileMitSchalter label="Hervorheben (rot)" unter="Für Wichtiges, z. B. Zahlungserinnerungen">
            <Schalter an={isWarning} onChange={setIsWarning} label="Hervorheben (rot)" />
          </ZeileMitSchalter>
        </Gruppe>
      )}

      {/* Empfänger */}
      <div className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Empfänger</div>
      <div className="seg mb-2" role="tablist" aria-label="Empfänger">
        {(
          [
            ["all", "Alle Schüler"],
            ["komitee", "Komitees"],
            ["selected", "Personen"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={audience === k}
            onClick={() => setAudience(k)}
            className={`seg-item whitespace-nowrap !py-2 !text-[14px] ${audience === k ? "seg-aktiv" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {audience === "all" && (
        <p className="mb-3 px-4 text-[13px] leading-snug text-tinte-leise">
          Alle Schüler und das Stufenteam – Elternzugänge bekommen nichts.
        </p>
      )}

      {audience === "komitee" && (
        <Gruppe
          className="mb-3 mt-2"
          fuss={tags.size === 0 ? "Noch kein Komitee gewählt" : `${tags.size} Komitee(s) – alle Mitglieder sehen den Beitrag`}
        >
          {COMMITTEES.map((c) => (
            <ZeileHaken
              key={c.slug}
              label={
                <>
                  <span aria-hidden className="mr-2">{committeeIcon(c.slug)}</span>
                  {c.label}
                </>
              }
              gewaehlt={tags.has(c.slug)}
              onClick={() => umschalten(setTags, c.slug)}
            />
          ))}
        </Gruppe>
      )}

      {type === "info" && (
        <button onClick={selectUnpaid} className="mb-3 px-4 text-left text-[15px] font-medium text-brand-dark dark:text-brand">
          Alle mit offenem Beitrag (bis {settings.aktuelles_halbjahr}) auswählen
        </button>
      )}

      {audience === "selected" && (
        <div className="mb-3 mt-2">
          <input className="field mb-2" placeholder="Person suchen…" aria-label="Person suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-64 overflow-y-auto overscroll-contain rounded-[0.875rem]">
            <Gruppe className="" fuss={`${targets.size} ausgewählt`}>
              {list.map((s) => (
                <ZeileHaken
                  key={s.id}
                  label={`${s.nachname}, ${s.vorname}`}
                  gewaehlt={targets.has(s.id)}
                  onClick={() => umschalten(setTargets, s.id)}
                />
              ))}
            </Gruppe>
          </div>
        </div>
      )}

      <Gruppe
        className="mb-2 mt-4"
        fuss={
          melden
            ? "Kommt bei allen an, die Mitteilungen erlaubt haben."
            : "Still veröffentlichen: steht nur im Reiter Events, niemand bekommt ein Pop-up."
        }
      >
        <ZeileMitSchalter label="Mitteilung an alle, die es sehen">
          <Schalter an={melden} onChange={setMelden} label="Mitteilung an alle, die es sehen" />
        </ZeileMitSchalter>
      </Gruppe>

      <FussLeiste>
        <button className="btn-primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "…" : "Veröffentlichen"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}
