import { useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe } from "./Liste";
import { Schalter } from "./Schalter";
import { AusHinweis } from "./Funktionen";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "../lib/funktionen";
import { personVerlauf } from "../lib/album";
import {
  useLehrer,
  useRankings,
  useStufePersonen,
  type Lehrer,
  type RankingArt,
  type RankingKategorie,
  type Rankings,
  type StufenPerson,
} from "../lib/rankings";
import { frage, meldeFehler } from "../lib/melder";
import { GesperrtZeile, GESPERRT_TEXT } from "./Gesperrt";
import { useRunden, type Runde, type RundenStand } from "../lib/runden";
import { RundenAbschnitt, RundenMarke } from "./Runden";
import { Kachel } from "./Kachel";
import { Icon } from "./Icon";
import { WortfilterSchalter } from "./AutorInfo";

const MEDAILLE = ["#E9C460", "#C0C4CC", "#D4A373"];
const kurz = (p: StufenPerson) => `${p.vorname} ${p.nachname ? p.nachname[0] + "." : ""}`.trim();

/** Name zu einer Stimme – Person der Stufe oder Lehrkraft */
function useNamen(personen: StufenPerson[], lehrer: Lehrer[]) {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of personen) m.set(p.id, kurz(p));
    for (const l of lehrer) m.set(l.id, l.name);
    return (id: string | null | undefined) => (id ? m.get(id) || "Unbekannt" : "");
  }, [personen, lehrer]);
}

/* ====================================================================== */
/* Eine Karte auf der Startseite: Schüler- und Lehrer-Ranking            */
/* ====================================================================== */
const ART_STIL: Record<RankingArt, { titel: string; kurz: string }> = {
  schueler: { titel: "Schüler-Ranking", kurz: "Schüler" },
  lehrer: { titel: "Lehrer-Ranking", kurz: "Lehrer" },
};

export function RankingKarten({ className = "" }: { className?: string }) {
  const { can, isEltern, uid } = useRole();
  const { sichtbar } = useFunktionen();
  const darf = !isEltern && sichtbar("rankings") && (can("rankings.nutzen") || can("rankings.verwalten"));
  const [offen, setOffen] = useState<RankingArt | null>(null);
  const r = useRankings(darf, uid, offen !== null);
  const runden = useRunden("rankings", darf, uid, can("rankings.runden"));
  if (!darf) return null;
  const stichwahlen = runden.offene.length;

  return (
    <div className={`flex flex-col ${className}`}>
      <AusHinweis funktion="rankings" className="mb-1.5 px-1" />
      <Kachel
        icon="pokal"
        farbe="bg-[#32ADE6]"
        titel="Abi-Rankings"
        unter={stichwahlen ? `${stichwahlen} ${stichwahlen === 1 ? "Stichwahl läuft" : "Stichwahlen laufen"}` : "Wer ist am ehesten …? Geheim abstimmen."}
      >
        <div className="liste mt-3 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
          {(["schueler", "lehrer"] as RankingArt[]).map((art) => {
            const aktive = r.kategorien.filter((k) => k.aktiv && k.art === art);
            const offenAnzahl = aktive.filter((k) => !(k.id in r.meine)).length;
            return (
              <button key={art} onClick={() => setOffen(art)} className="zeile w-full text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{ART_STIL[art].kurz}</span>
                  <span className="block text-[12.5px] text-tinte-leise">
                    {aktive.length ? (offenAnzahl ? `Noch ${offenAnzahl} von ${aktive.length} offen` : `Alle ${aktive.length} abgestimmt`) : "Noch keine Kategorien"}
                  </span>
                </span>
                {offenAnzahl > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[12px] font-semibold text-white">{offenAnzahl}</span>}
                <span className="text-tinte-leise">
                  <Icon name="chevron" size={16} />
                </span>
              </button>
            );
          })}
        </div>
      </Kachel>
      <RankingSheet art={offen} onClose={() => setOffen(null)} r={r} runden={runden} />
    </div>
  );
}

/* ====================================================================== */
/* Blatt je Ranking                                                       */
/* ====================================================================== */
function RankingSheet({ art, onClose, r, runden }: { art: RankingArt | null; onClose: () => void; r: Rankings; runden: RundenStand }) {
  const { can } = useRole();
  const open = art !== null;
  const personen = useStufePersonen(open);
  const { lehrer } = useLehrer(open);
  const name = useNamen(personen, lehrer);
  const [wahl, setWahl] = useState<RankingKategorie | null>(null);
  const [verwalten, setVerwalten] = useState(false);
  const darfVerwalten = can("rankings.verwalten") || can("lehrer.verwalten");
  const zuletzt = art ?? "schueler";
  const aktive = r.kategorien.filter((k) => k.aktiv && k.art === zuletzt);
  const schliessen = () => {
    setWahl(null);
    onClose();
  };

  return (
    <>
      <Sheet open={open && !verwalten} onClose={schliessen}>
        {wahl ? (
          <Abstimmen
            k={wahl}
            r={r}
            runden={runden}
            personen={personen}
            lehrer={lehrer.filter((l) => l.aktiv)}
            name={name}
            zurueck={() => setWahl(null)}
            onClose={schliessen}
          />
        ) : (
          <>
            <SheetKopf
              titel={ART_STIL[zuletzt].titel}
              unter="Geheim: gezählt wird nur, wie oft jemand gewählt wurde. Plätze aktualisieren sich von selbst."
              onClose={schliessen}
              extra={darfVerwalten ? <ZahnradKnopf label="Rankings und Lehrer verwalten" onClick={() => setVerwalten(true)} /> : undefined}
            />
            <AusHinweis funktion="rankings" className="-mt-2 mb-3" />
            <GesperrtZeile className="-mt-1 mb-3" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {aktive.map((k) => (
                <KategorieKachel key={k.id} k={k} r={r} name={name} offeneRunde={runden.offeneVon(k.id)} onClick={() => setWahl(k)} />
              ))}
            </div>
            {aktive.length === 0 && (
              <p className="rounded-2xl border border-dashed border-black/10 px-3 py-6 text-center text-[13px] text-tinte-leise dark:border-white/15">
                Noch keine Kategorien{darfVerwalten ? " – über das Zahnrad anlegen." : "."}
              </p>
            )}
          </>
        )}
      </Sheet>
      <RankingVerwaltung open={open && verwalten} onClose={() => setVerwalten(false)} r={r} start={zuletzt} />
    </>
  );
}

function KategorieKachel({
  k,
  r,
  name,
  offeneRunde,
  onClick,
}: {
  k: RankingKategorie;
  r: Rankings;
  name: (id: string | null) => string;
  offeneRunde: Runde | null;
  onClick: () => void;
}) {
  const st = r.stand.find((s) => s.kategorie_id === k.id);
  const hat = k.id in r.meine;
  const meine = r.meine[k.id];
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-2xl p-3 text-left transition active:scale-[.98] ${
        hat && !offeneRunde ? "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]" : "bg-white shadow-card ring-1 ring-brand/40 dark:bg-slate-800"
      }`}
    >
      {offeneRunde && <RundenMarke runde={offeneRunde} className="mb-1.5 !px-2 !py-0.5 !text-[11px]" />}
      <div className="text-[13.5px] font-semibold leading-snug">{k.titel}</div>
      <ol className="mt-2 space-y-1">
        {[0, 1, 2].map((i) => {
          const t = st?.top[i];
          return (
            <li key={i} className="flex items-center gap-1.5 text-[12.5px]">
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-[#1C1C1E]" style={{ background: MEDAILLE[i] }}>
                {i + 1}
              </span>
              <span className={`min-w-0 flex-1 truncate ${t ? "font-medium" : "text-tinte-leise"}`}>{t ? name(t.ziel) : "–"}</span>
              {t && <span className="zahl shrink-0 text-[11.5px] font-semibold text-tinte-leise">{t.n}</span>}
            </li>
          );
        })}
      </ol>
      <div className={`mt-2 truncate text-[12px] font-semibold ${hat ? "text-tinte-leise" : "text-brand-dark dark:text-brand"}`}>
        {hat ? (meine ? `Deine Stimme: ${name(meine)}` : "Weiß nicht") : "Abstimmen ›"}
      </div>
    </button>
  );
}

/* ---------------------------------------------------------------- Abstimmen */
function Abstimmen({
  k,
  r,
  runden,
  personen,
  lehrer,
  name,
  zurueck,
  onClose,
}: {
  k: RankingKategorie;
  r: Rankings;
  runden: RundenStand;
  personen: StufenPerson[];
  lehrer: Lehrer[];
  name: (id: string | null) => string;
  zurueck: () => void;
  onClose: () => void;
}) {
  const { banned, can } = useRole();
  const stichwahl = runden.offeneVon(k.id);
  const punkte = new Map((r.stand.find((s) => s.kategorie_id === k.id)?.top || []).map((t) => [t.ziel, t.n]));
  const quellen =
    k.art === "lehrer"
      ? lehrer.map((l) => ({ id: l.id, label: l.name, punkte: punkte.get(l.id) ?? 0 }))
      : personen.map((p) => ({ id: p.id, label: kurz(p), punkte: punkte.get(p.id) ?? 0 }));
  const st = r.stand.find((s) => s.kategorie_id === k.id);
  return (
    <div className="animate-vonRechts">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={zurueck} className="py-1 text-[16px] font-semibold text-brand">
          ‹ {ART_STIL[k.art].titel}
        </button>
        <button onClick={onClose} aria-label="Schließen" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-[13px] font-bold text-tinte-leise">
          ✕
        </button>
      </div>
      <div className="feld-grau p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tinte-leise">{k.art === "schueler" ? "Schüler-Ranking" : "Lehrer-Ranking"}</div>
        <div className="mt-1 text-[1.15rem] font-bold leading-snug">{k.titel}</div>
        <div className="mt-3 flex items-end justify-center gap-2">
          {[1, 0, 2].map((i) => {
            const t = st?.top[i];
            return (
              <div key={i} className="flex w-1/3 flex-col items-center">
                <span className="mb-1 w-full truncate text-center text-[12px] font-semibold">{t ? name(t.ziel) : "–"}</span>
                <span
                  className="flex w-full items-start justify-center rounded-t-lg pt-1 text-[13px] font-bold text-[#1C1C1E]"
                  style={{ height: [52, 38, 28][i], background: MEDAILLE[i] }}
                >
                  {t ? t.n : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <GesperrtZeile className="mt-3" />
      <div className="mt-4">
        <RundenAbschnitt
          stand={runden}
          gruppe={k.id}
          gruppeTitel={k.titel}
          quellen={quellen}
          leitet={can("rankings.runden")}
          gesperrt={banned}
          startText="Stichwahl starten"
        />
      </div>
      {!stichwahl && (
      <>
      <p className="mb-2 mt-2 px-1 text-[13px] text-tinte-leise">
        {k.id in r.meine ? `Deine Stimme: ${r.meine[k.id] ? name(r.meine[k.id]) : "Weiß nicht"} – du kannst sie ändern.` : "Wähle aus:"}
      </p>
      <ZielWahl
        art={k.art}
        personen={personen}
        lehrer={lehrer}
        wert={r.meine[k.id]}
        gewaehlt={k.id in r.meine}
        setzen={async (ziel) => {
          if (banned) return meldeFehler(GESPERRT_TEXT);
          const f = await r.abstimmen(k.id, ziel);
          if (f) meldeFehler("Ging nicht: " + f);
        }}
      />
      </>
      )}
    </div>
  );
}

/** Auswahl einer Person der Stufe oder einer Lehrkraft (auch in Pop-up-Umfragen) */
export function ZielWahl({
  art,
  personen,
  lehrer,
  wert,
  gewaehlt,
  setzen,
}: {
  art: RankingArt;
  personen: StufenPerson[];
  lehrer: Lehrer[];
  wert: string | null | undefined;
  /** true: es gibt schon eine Antwort (auch „weiß nicht“) */
  gewaehlt: boolean;
  setzen: (ziel: string | null) => void;
}) {
  const [suche, setSuche] = useState("");
  const q = suche.trim().toLowerCase();
  const liste =
    art === "schueler"
      ? personen.filter((p) => !q || `${p.vorname} ${p.nachname}`.toLowerCase().includes(q)).map((p) => ({ id: p.id, oben: p.vorname, unten: p.nachname, kuerzel: `${p.vorname[0] || ""}${p.nachname[0] || ""}` }))
      : lehrer.filter((l) => !q || `${l.name} ${l.faecher}`.toLowerCase().includes(q)).map((l) => ({ id: l.id, oben: l.name, unten: l.faecher, kuerzel: l.name.replace(/^(Frau|Herr|Fr\.|Hr\.)\s+/i, "").slice(0, 2).toUpperCase() }));

  return (
    <>
      <input className="field mb-2" placeholder={art === "schueler" ? "Name suchen" : "Lehrkraft suchen"} value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="-mx-1 grid max-h-[46dvh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
        {liste.map((p) => {
          const an = wert === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setzen(p.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 pb-2 pt-2.5 transition active:scale-95 ${
                an ? "bg-[#E9C460]/20 ring-2 ring-[#C99A1E]" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
              }`}
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-[14px] font-bold text-white ${personVerlauf(p.id)}`}>
                {p.kuerzel}
              </span>
              <span className="w-full truncate text-center text-[12.5px] font-semibold">{p.oben}</span>
              {p.unten && <span className="-mt-1 w-full truncate text-center text-[11px] text-tinte-leise">{p.unten}</span>}
            </button>
          );
        })}
      </div>
      {liste.length === 0 && (
        <p className="py-6 text-center text-[13.5px] text-tinte-leise">{art === "lehrer" ? "Noch keine Lehrkräfte eingetragen." : "Niemand gefunden."}</p>
      )}
      <button
        onClick={() => setzen(null)}
        className={`mt-3 w-full rounded-full py-2.5 text-[14px] font-semibold transition ${
          gewaehlt && !wert ? "bg-[rgb(118_118_128/0.2)]" : "bg-[rgb(118_118_128/0.1)] text-tinte-matt dark:text-slate-300"
        }`}
      >
        {gewaehlt && !wert ? "✓ Weiß nicht" : "Weiß nicht"}
      </button>
    </>
  );
}

/* ====================================================================== */
/* Verwaltung: Kategorien | Lehrer                                        */
/* ====================================================================== */
export function ZahnradKnopf({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-my-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300">
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </span>
    </button>
  );
}

/** Für Profil → Funktionen: Kategorien und Lehrerliste ohne das Ranking-Blatt */
export function RankingVerwaltungSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useRole();
  const r = useRankings(open, uid);
  return <RankingVerwaltung open={open} onClose={onClose} r={r} />;
}

function RankingVerwaltung({ open, onClose, r, start }: { open: boolean; onClose: () => void; r: Rankings; start?: RankingArt }) {
  const { can } = useRole();
  const [teil, setTeil] = useState<"kategorien" | "lehrer">(can("rankings.verwalten") ? "kategorien" : "lehrer");
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Rankings verwalten" onClose={onClose} />
      <WortfilterSchalter bereich="rankings" className="mb-4" />
      {can("rankings.verwalten") && can("lehrer.verwalten") && (
        <div className="seg mb-4">
          <button className={`seg-item ${teil === "kategorien" ? "seg-aktiv" : ""}`} onClick={() => setTeil("kategorien")}>
            Kategorien
          </button>
          <button className={`seg-item ${teil === "lehrer" ? "seg-aktiv" : ""}`} onClick={() => setTeil("lehrer")}>
            Lehrerliste
          </button>
        </div>
      )}
      {teil === "kategorien" && can("rankings.verwalten") ? <KategorienListe r={r} start={start} /> : <LehrerListe aktiv={open} />}
    </Sheet>
  );
}

function KategorienListe({ r, start = "schueler" }: { r: Rankings; start?: RankingArt }) {
  const [neu, setNeu] = useState("");
  const [art, setArt] = useState<RankingArt>(start);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [titel, setTitel] = useState("");

  return (
    <>
      {(["schueler", "lehrer"] as RankingArt[]).map((a) => (
        <Gruppe key={a} titel={a === "schueler" ? "Schüler-Rankings" : "Lehrer-Rankings"}>
          {r.kategorien
            .filter((k) => k.art === a)
            .map((k) =>
              bearbeite === k.id ? (
                <div key={k.id} className="flex gap-2 px-3 py-2.5">
                  <input className="field" value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} autoFocus />
                  <button
                    className="btn-primary !min-h-[44px] !w-auto shrink-0 px-4 !text-[15px]"
                    onClick={async () => {
                      const f = await r.kategorieSpeichern({ ...k, titel });
                      if (f) return meldeFehler(f);
                      setBearbeite(null);
                    }}
                  >
                    Sichern
                  </button>
                </div>
              ) : (
                <div key={k.id} className={`flex min-h-[52px] items-center gap-2 px-4 ${k.aktiv ? "" : "opacity-50"}`}>
                  <button
                    className="min-w-0 flex-1 py-2 text-left text-[15px]"
                    onClick={() => {
                      setBearbeite(k.id);
                      setTitel(k.titel);
                    }}
                  >
                    {k.titel}
                  </button>
                  <Schalter an={k.aktiv} label={`${k.titel} anzeigen`} onChange={(v) => void r.kategorieSpeichern({ ...k, aktiv: v })} />
                  <LoeschKnopf
                    label={k.titel}
                    text={`„${k.titel}“ samt allen Stimmen löschen?`}
                    loeschen={() => r.kategorieLoeschen(k.id)}
                  />
                </div>
              ),
            )}
          {!r.kategorien.some((k) => k.art === a) && <p className="px-4 py-3 text-[13px] text-tinte-leise">Noch keine.</p>}
        </Gruppe>
      ))}
      <div className="seg mt-5">
        <button className={`seg-item ${art === "schueler" ? "seg-aktiv" : ""}`} onClick={() => setArt("schueler")}>
          Schüler
        </button>
        <button className={`seg-item ${art === "lehrer" ? "seg-aktiv" : ""}`} onClick={() => setArt("lehrer")}>
          Lehrer
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="field"
          maxLength={120}
          placeholder="z. B. Wird am ehesten berühmt"
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter" || !neu.trim()) return;
            const f = await r.kategorieSpeichern({ titel: neu, art });
            if (f) return meldeFehler(f);
            setNeu("");
          }}
        />
        <button
          className="btn-primary !min-h-[44px] !w-auto shrink-0 px-4 !text-[15px]"
          disabled={!neu.trim()}
          onClick={async () => {
            const f = await r.kategorieSpeichern({ titel: neu, art });
            if (f) return meldeFehler(f);
            setNeu("");
          }}
        >
          Hinzufügen
        </button>
      </div>
      <p className="mt-3 px-1 text-[12px] leading-snug text-tinte-leise">
        Tipp: Lasst per Umfrage abstimmen, welche Rankings rein sollen – im Ergebnis übernehmt ihr die meistgewählten mit einem Tipp.
      </p>
    </>
  );
}

/** Lehrerliste pflegen – auch aus der Zitatwand erreichbar */
export function LehrerListe({ aktiv }: { aktiv: boolean }) {
  const l = useLehrer(aktiv);
  const [name, setName] = useState("");
  const [faecher, setFaecher] = useState("");
  const [bearbeite, setBearbeite] = useState<Lehrer | null>(null);

  return (
    <>
      <Gruppe titel={`Lehrkräfte (${l.lehrer.length})`} className="mt-0">
        {l.lehrer.map((x) =>
          bearbeite?.id === x.id ? (
            <div key={x.id} className="space-y-2 px-3 py-2.5">
              <input className="field" value={bearbeite.name} maxLength={60} onChange={(e) => setBearbeite({ ...bearbeite, name: e.target.value })} />
              <input className="field" value={bearbeite.faecher} maxLength={60} placeholder="Fächer (optional)" onChange={(e) => setBearbeite({ ...bearbeite, faecher: e.target.value })} />
              <div className="flex gap-2">
                <button className="btn-grau flex-1 !min-h-[40px] !text-[15px]" onClick={() => setBearbeite(null)}>
                  Abbrechen
                </button>
                <button
                  className="btn-primary flex-1 !min-h-[40px] !text-[15px]"
                  onClick={async () => {
                    const f = await l.speichern(bearbeite);
                    if (f) return meldeFehler(f);
                    setBearbeite(null);
                  }}
                >
                  Sichern
                </button>
              </div>
            </div>
          ) : (
            <div key={x.id} className={`flex min-h-[52px] items-center gap-2 px-4 ${x.aktiv ? "" : "opacity-50"}`}>
              <button className="min-w-0 flex-1 py-2 text-left" onClick={() => setBearbeite(x)}>
                <span className="block truncate text-[15px]">{x.name}</span>
                {x.faecher && <span className="block truncate text-[12px] text-tinte-leise">{x.faecher}</span>}
              </button>
              <Schalter an={x.aktiv} label={`${x.name} auswählbar`} onChange={(v) => void l.speichern({ ...x, aktiv: v })} />
              <LoeschKnopf label={x.name} text={`${x.name} aus der Liste löschen? Stimmen für diese Lehrkraft gehen verloren.`} loeschen={() => l.loeschen(x.id)} />
            </div>
          ),
        )}
        {l.lehrer.length === 0 && <p className="px-4 py-3 text-[13px] text-tinte-leise">Noch niemand eingetragen.</p>}
      </Gruppe>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className="field" maxLength={60} placeholder="Name, z. B. Frau …" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" maxLength={60} placeholder="Fächer (optional)" value={faecher} onChange={(e) => setFaecher(e.target.value)} />
        <button
          className="btn-primary !min-h-[44px] px-4 !text-[15px] sm:!w-auto"
          disabled={!name.trim()}
          onClick={async () => {
            const f = await l.speichern({ name, faecher });
            if (f) return meldeFehler(f);
            setName("");
            setFaecher("");
          }}
        >
          Hinzufügen
        </button>
      </div>
      <p className="mt-2 px-1 text-[12px] text-tinte-leise">Schalter aus: bleibt gespeichert, ist aber nicht mehr auswählbar.</p>
    </>
  );
}

function LoeschKnopf({ label, text, loeschen }: { label: string; text: string; loeschen: () => Promise<string | null> }) {
  return (
    <button
      aria-label={`${label} löschen`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-500 transition active:scale-90 active:bg-red-500/10"
      onClick={() =>
        void frage(text, "Löschen", true).then(async (ok) => {
          if (!ok) return;
          const f = await loeschen();
          if (f) meldeFehler("Ging nicht: " + f);
        })
      }
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </svg>
    </button>
  );
}
