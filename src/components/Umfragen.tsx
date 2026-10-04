import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileAuswahl } from "./Liste";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import {
  TYP_NAME,
  ZIEL_NAME,
  beantwortet,
  useOffeneUmfragen,
  useUmfragePersonen,
  useUmfragenVerwaltung,
  type Ergebnis,
  type Frage,
  type FrageTyp,
  type UPerson,
  type Umfrage,
  type Wert,
  type Zielgruppe,
} from "../lib/umfragen";
import { personVerlauf } from "../lib/album";
import { pushAnPersonen, pushAnTeam } from "../lib/push";
import { frage as fragen_, melde, meldeFehler } from "../lib/melder";

const name = (p: UPerson) => `${p.vorname} ${p.nachname}`;

/* ====================================================================== */
/* Das Pop-up beim Öffnen                                                 */
/* ====================================================================== */
/**
 * Erscheint, sobald eine Umfrage für einen läuft. Pflicht-Umfragen lassen
 * sich nicht wegklicken; alle anderen mit „Später“ (bis zum nächsten Öffnen).
 * Jede Antwort wird sofort gespeichert.
 */
export function UmfragePopup({ bereitZumZeigen, onSichtbar }: { bereitZumZeigen: boolean; onSichtbar?: (an: boolean) => void }) {
  const { role, isStaff, ready } = useRole();
  const istEltern = role === "eltern";
  const fuerMich = useCallback(
    (z: Zielgruppe) => (z === "alle" ? true : z === "schueler" ? !istEltern : z === "team" ? isStaff : istEltern),
    [istEltern, isStaff],
  );
  const u = useOffeneUmfragen(ready, fuerMich);
  const [spaeter, setSpaeter] = useState<Set<string>>(new Set());
  // Die gerade gezeigte Umfrage bleibt stehen, bis man sie schließt – auch
  // nach dem Abschicken (sonst verschwände der Dank sofort).
  const [fest, setFest] = useState<string | null>(null);
  const kandidat = u.offen.find((x) => !spaeter.has(x.id)) || null;
  const aktuell = (fest && u.alle.find((x) => x.id === fest)) || kandidat;
  const zeigen = bereitZumZeigen && u.bereit && Boolean(aktuell);
  const personen = useUmfragePersonen(zeigen && u.fragen.some((f) => f.umfrage_id === aktuell?.id && f.typ === "person"));

  useEffect(() => {
    if (zeigen && aktuell && fest !== aktuell.id) setFest(aktuell.id);
  }, [zeigen, aktuell, fest]);

  useEffect(() => {
    onSichtbar?.(zeigen);
  }, [zeigen, onSichtbar]);

  if (!zeigen || !aktuell) return null;
  return createPortal(
    <UmfrageLauf
      key={aktuell.id}
      umfrage={aktuell}
      fragen={u.fragen.filter((f) => f.umfrage_id === aktuell.id).sort((a, b) => a.sort - b.sort)}
      antworten={u.antworten}
      personen={personen}
      nochWeitere={u.offen.filter((x) => x.id !== aktuell.id && !spaeter.has(x.id)).length}
      antworten_={u.antworten_}
      abschliessen={u.abschliessen}
      ende={() => {
        setSpaeter((s) => new Set(s).add(aktuell.id));
        setFest(null);
      }}
    />,
    document.body,
  );
}

function UmfrageLauf({
  umfrage,
  fragen,
  antworten,
  personen,
  nochWeitere,
  antworten_,
  abschliessen,
  ende,
}: {
  umfrage: Umfrage;
  fragen: Frage[];
  antworten: Record<string, Wert>;
  personen: UPerson[];
  nochWeitere: number;
  antworten_: (f: Frage, w: Wert) => Promise<string | null>;
  abschliessen: (id: string) => Promise<string | null>;
  ende: () => void;
}) {
  // Beim ersten offenen Punkt weitermachen
  const erste = fragen.findIndex((f) => !beantwortet(f, antworten[f.id]));
  const angefangen = fragen.some((f) => beantwortet(f, antworten[f.id]));
  const [i, setI] = useState<number>(angefangen ? (erste < 0 ? fragen.length - 1 : erste) : -1);
  const [richtung, setRichtung] = useState<1 | -1>(1);
  const [danke, setDanke] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = i >= 0 ? fragen[i] : null;
  const wert = f ? antworten[f.id] : undefined;
  const ok = f ? !f.pflicht || beantwortet(f, wert) : true;
  const letzte = i === fragen.length - 1;

  const weiter = async () => {
    if (!ok || busy) return;
    if (letzte) {
      setBusy(true);
      const fehler = await abschliessen(umfrage.id);
      setBusy(false);
      if (fehler) return meldeFehler("Ging nicht: " + fehler);
      setDanke(true);
      return;
    }
    setRichtung(1);
    setI((v) => v + 1);
  };

  const setzen = async (w: Wert, auto = false) => {
    if (!f) return;
    const fehler = await antworten_(f, w);
    if (fehler) return meldeFehler("Nicht gespeichert: " + fehler);
    if (auto && !letzte) setTimeout(() => (setRichtung(1), setI((v) => v + 1)), 260);
  };

  return (
    <div className="fixed inset-0 z-[70] flex animate-fadeIn items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={umfrage.titel}>
      <div className="relative flex max-h-[94dvh] w-full max-w-lg animate-sheetIn flex-col overflow-hidden rounded-t-[1.9rem] bg-white shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.9rem]">
        {/* Kopf: Farbverlauf, Fortschritt in Segmenten */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#5E5CE6] via-[#7D4CDB] to-[#BF5AF2] px-5 pb-5 pt-4 text-white">
          <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <span aria-hidden className="pointer-events-none absolute -bottom-16 left-10 h-28 w-28 rounded-full bg-[#FF9F0A]/25 blur-2xl" />
          <div className="relative flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em]">
              {umfrage.pflicht ? "Kurze Umfrage" : "Umfrage"}
            </span>
            {nochWeitere > 0 && <span className="text-[12px] font-semibold text-white/75">+{nochWeitere} weitere</span>}
            {!umfrage.pflicht && !danke && (
              <button onClick={ende} className="ml-auto rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold active:scale-95">
                Später
              </button>
            )}
          </div>
          <h2 className="relative mt-2 text-[1.35rem] font-bold leading-tight tracking-[-0.01em]">{umfrage.titel}</h2>
          {i >= 0 && !danke && (
            <div className="relative mt-3 flex gap-1">
              {fragen.map((x, n) => (
                <span
                  key={x.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    n < i || beantwortet(x, antworten[x.id]) ? "bg-white" : n === i ? "bg-white/60" : "bg-white/25"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-5">
          {danke ? (
            <div className="flex animate-popIn flex-col items-center py-8 text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#30D158] to-[#0A84FF] text-[38px] shadow-lg">🎉</span>
              <div className="mt-4 text-[1.3rem] font-bold">Danke!</div>
              <p className="mt-1 max-w-xs text-[14px] text-tinte-leise">
                {umfrage.ergebnis_sichtbar ? "Das Ergebnis siehst du, sobald das Team es auswertet." : "Deine Antworten sind gespeichert. Einzeln sieht sie niemand."}
              </p>
            </div>
          ) : i < 0 ? (
            <div className="animate-fadeIn">
              {umfrage.beschreibung && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{umfrage.beschreibung}</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-semibold">
                <span className="rounded-full bg-[#5E5CE6]/10 px-3 py-1.5 text-[#4B49C8] dark:text-[#A5A4FF]">
                  {fragen.length} {fragen.length === 1 ? "Frage" : "Fragen"}
                </span>
                <span className="rounded-full bg-[#30D158]/15 px-3 py-1.5 text-[#1E7B3A] dark:text-[#5BE07F]">Wird laufend gespeichert</span>
                <span className="rounded-full bg-black/[0.05] px-3 py-1.5 text-tinte-matt dark:bg-white/10 dark:text-slate-300">Anonym</span>
              </div>
            </div>
          ) : f ? (
            <div key={f.id} className={richtung > 0 ? "animate-vonRechts" : "animate-vonLinks"}>
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#7D4CDB] dark:text-[#C9A7FF]">
                Frage {i + 1} von {fragen.length}
                {!f.pflicht && " · freiwillig"}
              </div>
              <h3 className="mt-1 text-[1.2rem] font-bold leading-snug">{f.titel}</h3>
              <div className="mt-4">
                <Antwort f={f} wert={wert} personen={personen} setzen={setzen} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-black/[0.06] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-white/10">
          {danke ? (
            <button className="btn-primary flex-1 !bg-[#5E5CE6]" onClick={ende}>
              {nochWeitere > 0 ? "Zur nächsten Umfrage" : "Fertig"}
            </button>
          ) : i < 0 ? (
            <button className="btn-primary flex-1 !bg-[#5E5CE6]" onClick={() => setI(0)}>
              Los geht’s
            </button>
          ) : (
            <>
              {i > 0 && (
                <button className="btn-grau" onClick={() => (setRichtung(-1), setI((v) => v - 1))}>
                  Zurück
                </button>
              )}
              <button className="btn-primary flex-1 !bg-[#5E5CE6] disabled:opacity-40" disabled={!ok || busy} onClick={() => void weiter()}>
                {busy ? "…" : letzte ? "Abschicken" : f && !f.pflicht && !beantwortet(f, wert) ? "Überspringen" : "Weiter"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Antwortfelder */
function Antwort({ f, wert, personen, setzen }: { f: Frage; wert: Wert | undefined; personen: UPerson[]; setzen: (w: Wert, auto?: boolean) => void }) {
  const [text, setText] = useState(typeof wert === "string" && f.typ === "text" ? wert : "");
  const [suche, setSuche] = useState("");

  if (f.typ === "einfach")
    return (
      <div className="space-y-2">
        {f.optionen.map((o) => {
          const an = wert === o;
          return (
            <button
              key={o}
              onClick={() => setzen(o, true)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15.5px] font-medium transition active:scale-[.98] ${
                an ? "bg-[#5E5CE6] text-white shadow-[0_6px_16px_-6px_rgba(94,92,230,.7)]" : "bg-[rgb(118_118_128/0.1)] dark:bg-[rgb(118_118_128/0.22)]"
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${an ? "bg-white" : "ring-2 ring-inset ring-black/20 dark:ring-white/30"}`}>
                {an && <span className="h-2.5 w-2.5 rounded-full bg-[#5E5CE6]" />}
              </span>
              {o}
            </button>
          );
        })}
      </div>
    );

  if (f.typ === "mehrfach") {
    const liste = Array.isArray(wert) ? (wert as string[]) : [];
    return (
      <>
        <p className="-mt-2 mb-3 text-[13px] text-tinte-leise">Mehrere möglich</p>
        <div className="flex flex-wrap gap-2">
          {f.optionen.map((o) => {
            const an = liste.includes(o);
            return (
              <button
                key={o}
                onClick={() => setzen(an ? liste.filter((x) => x !== o) : [...liste, o])}
                className={`rounded-full px-4 py-2.5 text-[15px] font-semibold transition active:scale-95 ${
                  an ? "bg-[#5E5CE6] text-white" : "bg-[rgb(118_118_128/0.1)] dark:bg-[rgb(118_118_128/0.22)]"
                }`}
              >
                {an ? "✓ " : ""}
                {o}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (f.typ === "skala") {
    const [links, rechts] = [f.optionen[0] || "gar nicht", f.optionen[1] || "sehr"];
    return (
      <>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setzen(n, true)}
              className={`zahl aspect-square rounded-2xl text-[1.4rem] font-bold transition active:scale-90 ${
                wert === n ? "bg-gradient-to-br from-[#5E5CE6] to-[#BF5AF2] text-white shadow-lg" : "bg-[rgb(118_118_128/0.1)] dark:bg-[rgb(118_118_128/0.22)]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[12px] font-semibold text-tinte-leise">
          <span>{links}</span>
          <span>{rechts}</span>
        </div>
      </>
    );
  }

  if (f.typ === "person") {
    const q = suche.trim().toLowerCase();
    const gewaehlt = personen.find((p) => p.id === wert);
    return (
      <>
        {gewaehlt && (
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#5E5CE6]/10 px-3 py-2.5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-[14px] font-bold text-white ${personVerlauf(gewaehlt.id)}`}>
              {gewaehlt.vorname[0]}
              {gewaehlt.nachname[0]}
            </span>
            <span className="flex-1 text-[15.5px] font-semibold">{name(gewaehlt)}</span>
            <span className="text-[13px] font-semibold text-[#5E5CE6]">gewählt</span>
          </div>
        )}
        <input className="field mb-2" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <div className="-mx-1 grid max-h-[42dvh] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
          {personen
            .filter((p) => !q || name(p).toLowerCase().includes(q))
            .map((p) => {
              const an = wert === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setzen(p.id)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-1 pb-2 pt-2.5 transition active:scale-95 ${
                    an ? "bg-[#5E5CE6]/10 ring-2 ring-[#5E5CE6]" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
                  }`}
                >
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-[14px] font-bold text-white ${personVerlauf(p.id)}`}>
                    {p.vorname[0]}
                    {p.nachname[0]}
                  </span>
                  <span className="w-full truncate text-center text-[12.5px] font-semibold">{p.vorname}</span>
                  <span className="-mt-1 w-full truncate text-center text-[11px] text-tinte-leise">{p.nachname}</span>
                </button>
              );
            })}
        </div>
      </>
    );
  }

  // Freitext: speichert beim Verlassen des Feldes und kurz nach dem Tippen
  return (
    <TextAntwort
      text={text}
      setText={setText}
      speichern={(t) => setzen(t)}
    />
  );
}

function TextAntwort({ text, setText, speichern }: { text: string; setText: (t: string) => void; speichern: (t: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => speichern(text), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <textarea
      className="field min-h-[140px] resize-y"
      value={text}
      maxLength={1000}
      placeholder="Deine Antwort …"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => speichern(text)}
    />
  );
}

/* ====================================================================== */
/* Verwaltung                                                             */
/* ====================================================================== */
type EntwurfFrage = Omit<Frage, "id" | "umfrage_id">;

const VORLAGEN: { name: string; beschreibung: string; bauen: (kategorien: string[]) => { titel: string; beschreibung: string; fragen: EntwurfFrage[] } }[] = [
  {
    name: "🏆 Schülerranking",
    beschreibung: "Wer wird am ehesten …? Je Frage eine Person.",
    bauen: () => ({
      titel: "Schülerranking",
      beschreibung: "Für die Abizeitung: Wähle bei jeder Frage eine Person. Geheim – gezählt wird nur, wie oft jemand gewählt wurde.",
      fragen: ["Wird am ehesten berühmt", "Kommt garantiert zu spät zur eigenen Hochzeit", "Hat immer Snacks dabei", "Wird am ehesten Lehrer*in an unserer Schule"].map(
        (titel, i) => ({ sort: i + 1, typ: "person" as FrageTyp, titel, optionen: [], pflicht: false }),
      ),
    }),
  },
  {
    name: "🗳️ Welche Rankings?",
    beschreibung: "Abstimmen, welche Kategorien ins Ranking kommen.",
    bauen: () => ({
      titel: "Welche Rankings sollen rein?",
      beschreibung: "Kreuze an, welche Rankings in die Abizeitung sollen. Eigene Ideen gern unten.",
      fragen: [
        {
          sort: 1,
          typ: "mehrfach",
          titel: "Welche Rankings sollen rein?",
          optionen: ["Wird am ehesten berühmt", "Bester Ausrede-Erfinder", "Hat immer Snacks dabei", "Lacht am lautesten", "Kommt immer zu spät", "Wird Bundeskanzler*in"],
          pflicht: true,
        },
        { sort: 2, typ: "text", titel: "Eigene Ideen?", optionen: [], pflicht: false },
      ],
    }),
  },
  {
    name: "📝 Steckbrief-Kategorien",
    beschreibung: "Abstimmen, was in jeden Steckbrief kommt.",
    bauen: (kategorien) => ({
      titel: "Was soll in den Steckbrief?",
      beschreibung: "Welche Felder sollen alle im Abi-Album ausfüllen?",
      fragen: [
        {
          sort: 1,
          typ: "mehrfach",
          titel: "Diese Felder sollen rein",
          optionen: kategorien.length ? kategorien : ["Spitzname", "Nach dem Abi", "Lieblingslied", "Lieblingsfach", "Lebensmotto"],
          pflicht: true,
        },
        { sort: 2, typ: "text", titel: "Was fehlt noch?", optionen: [], pflicht: false },
      ],
    }),
  },
];

export function UmfragenSheet({ open, onClose, kategorien = [] }: { open: boolean; onClose: () => void; kategorien?: string[] }) {
  const { can } = useRole();
  const v = useUmfragenVerwaltung(open);
  const [bearbeite, setBearbeite] = useState<Umfrage | "neu" | null>(null);
  const [vorlage, setVorlage] = useState<ReturnType<(typeof VORLAGEN)[number]["bauen"]> | null>(null);
  const [ergebnisVon, setErgebnisVon] = useState<Umfrage | null>(null);
  const verwalten = can("umfragen.verwalten");

  const gruppen: [string, Umfrage[]][] = [
    ["Läuft", v.umfragen.filter((u) => u.status === "aktiv")],
    ["Entwürfe", v.umfragen.filter((u) => u.status === "entwurf")],
    ["Beendet", v.umfragen.filter((u) => u.status === "beendet")],
  ];

  return (
    <>
      <Sheet open={open && !bearbeite && !ergebnisVon} onClose={onClose}>
        <SheetKopf titel="Umfragen" unter="Erscheinen als Pop-up beim nächsten Öffnen der App. Fortschritt wird gespeichert." onClose={onClose} />
        {verwalten && (
          <>
            <button className="btn-primary w-full !bg-gradient-to-r !from-[#5E5CE6] !to-[#BF5AF2]" onClick={() => (setVorlage(null), setBearbeite("neu"))}>
              + Neue Umfrage
            </button>
            <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
              {VORLAGEN.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setVorlage(t.bauen(kategorien));
                    setBearbeite("neu");
                  }}
                  className="w-44 shrink-0 rounded-2xl bg-[rgb(118_118_128/0.08)] px-3.5 py-3 text-left transition active:scale-95 dark:bg-[rgb(118_118_128/0.18)]"
                >
                  <span className="block text-[14px] font-semibold">{t.name}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-tinte-leise">{t.beschreibung}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {gruppen.map(([titel, liste]) =>
          liste.length ? (
            <Gruppe key={titel} titel={titel}>
              {liste.map((u) => (
                <Zeile
                  key={u.id}
                  label={
                    <span className="flex items-center gap-2">
                      {u.status === "aktiv" && <span className="h-2 w-2 animate-pulse rounded-full bg-[#30D158]" />}
                      <span className="max-w-[12rem] truncate">{u.titel}</span>
                    </span>
                  }
                  onClick={() => (u.status === "entwurf" && verwalten ? setBearbeite(u) : setErgebnisVon(u))}
                >
                  <span className="truncate text-[13px] text-tinte-leise">
                    {v.fragen.filter((f) => f.umfrage_id === u.id).length} Fragen · {ZIEL_NAME[u.zielgruppe]}
                  </span>
                </Zeile>
              ))}
            </Gruppe>
          ) : null,
        )}
        {v.umfragen.length === 0 && <p className="mt-6 text-center text-[14px] text-tinte-leise">Noch keine Umfragen.</p>}
      </Sheet>

      <UmfrageEditor
        open={open && Boolean(bearbeite)}
        umfrage={bearbeite === "neu" ? null : bearbeite}
        vorlage={bearbeite === "neu" ? vorlage : null}
        fragen={bearbeite && bearbeite !== "neu" ? v.fragen.filter((f) => f.umfrage_id === bearbeite.id) : []}
        verwaltung={v}
        onClose={() => setBearbeite(null)}
      />
      <ErgebnisSheet
        open={open && Boolean(ergebnisVon)}
        umfrage={ergebnisVon}
        fragen={ergebnisVon ? v.fragen.filter((f) => f.umfrage_id === ergebnisVon.id).sort((a, b) => a.sort - b.sort) : []}
        verwaltung={v}
        onClose={() => setErgebnisVon(null)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Editor */
function UmfrageEditor({
  open,
  umfrage,
  vorlage,
  fragen,
  verwaltung,
  onClose,
}: {
  open: boolean;
  umfrage: Umfrage | null;
  vorlage: { titel: string; beschreibung: string; fragen: EntwurfFrage[] } | null;
  fragen: Frage[];
  verwaltung: ReturnType<typeof useUmfragenVerwaltung>;
  onClose: () => void;
}) {
  const { students } = useStore();
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [ziel, setZiel] = useState<Zielgruppe>("schueler");
  const [pflicht, setPflicht] = useState(true);
  const [sichtbar, setSichtbar] = useState(false);
  const [liste, setListe] = useState<EntwurfFrage[]>([]);
  const [busy, setBusy] = useState(false);
  const [benachrichtigen, setBenachrichtigen] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTitel(umfrage?.titel ?? vorlage?.titel ?? "");
    setText(umfrage?.beschreibung ?? vorlage?.beschreibung ?? "");
    setZiel(umfrage?.zielgruppe ?? "schueler");
    setPflicht(umfrage?.pflicht ?? true);
    setSichtbar(umfrage?.ergebnis_sichtbar ?? false);
    setListe(
      umfrage
        ? [...fragen].sort((a, b) => a.sort - b.sort).map(({ sort, typ, titel, optionen, pflicht }) => ({ sort, typ, titel, optionen, pflicht }))
        : vorlage?.fragen ?? [{ sort: 1, typ: "einfach", titel: "", optionen: ["Ja", "Nein"], pflicht: true }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, umfrage?.id]);

  const aendern = (i: number, p: Partial<EntwurfFrage>) => setListe((l) => l.map((f, n) => (n === i ? { ...f, ...p } : f)));
  const fehler = !titel.trim()
    ? "Titel fehlt"
    : !liste.length
      ? "Mindestens eine Frage"
      : liste.some((f) => !f.titel.trim())
        ? "Jede Frage braucht einen Text"
        : liste.some((f) => (f.typ === "einfach" || f.typ === "mehrfach") && f.optionen.filter((o) => o.trim()).length < 2)
          ? "Auswahlfragen brauchen mindestens 2 Antworten"
          : "";

  async function sichern(): Promise<string | null> {
    const sauber = liste.map((f, i) => ({ ...f, sort: i + 1, optionen: f.optionen.map((o) => o.trim()).filter(Boolean) }));
    const r = await verwaltung.speichern(
      { id: umfrage?.id, titel, beschreibung: text, zielgruppe: ziel, pflicht, ergebnis_sichtbar: sichtbar },
      sauber,
    );
    if (r.fehler) {
      meldeFehler("Ging nicht: " + r.fehler);
      return null;
    }
    return r.id || null;
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={umfrage ? "Entwurf bearbeiten" : "Neue Umfrage"} onClose={onClose} />
      <Gruppe className="mt-0">
        <input className="block w-full bg-transparent px-4 py-3 text-[17px] font-semibold outline-none placeholder:text-tinte-leise" placeholder="Titel" maxLength={80} value={titel} onChange={(e) => setTitel(e.target.value)} />
        <textarea className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-tinte-leise" rows={3} maxLength={400} placeholder="Kurze Erklärung (optional)" value={text} onChange={(e) => setText(e.target.value)} />
      </Gruppe>
      <Gruppe titel="Einstellungen">
        <Zeile label="Für wen">
          <ZeileAuswahl label="Für wen" value={ziel} onChange={(x) => setZiel(x as Zielgruppe)}>
            {(Object.keys(ZIEL_NAME) as Zielgruppe[]).map((z) => (
              <option key={z} value={z}>
                {ZIEL_NAME[z]}
              </option>
            ))}
          </ZeileAuswahl>
        </Zeile>
        <Zeile label="Pflicht">
          <Schalter an={pflicht} onChange={setPflicht} label="Pflicht" />
        </Zeile>
        <Zeile label="Ergebnis für Teilnehmende">
          <Schalter an={sichtbar} onChange={setSichtbar} label="Ergebnis für Teilnehmende" />
        </Zeile>
      </Gruppe>
      <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Pflicht: lässt sich nicht wegklicken. Sonst gibt es „Später“.</p>

      <h3 className="mb-1.5 mt-5 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Fragen</h3>
      <div className="space-y-3">
        {liste.map((f, i) => (
          <div key={i} className="rounded-2xl bg-[rgb(118_118_128/0.08)] p-3 dark:bg-[rgb(118_118_128/0.18)]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5E5CE6] text-[12px] font-bold text-white">{i + 1}</span>
              <select
                aria-label="Fragetyp"
                className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#5E5CE6] outline-none"
                value={f.typ}
                onChange={(e) => {
                  const typ = e.target.value as FrageTyp;
                  aendern(i, { typ, optionen: typ === "einfach" || typ === "mehrfach" ? (f.optionen.length ? f.optionen : ["", ""]) : typ === "skala" ? ["gar nicht", "sehr"] : [] });
                }}
              >
                {(Object.keys(TYP_NAME) as FrageTyp[]).map((t) => (
                  <option key={t} value={t}>
                    {TYP_NAME[t]}
                  </option>
                ))}
              </select>
              <button aria-label="Nach oben" disabled={i === 0} className="px-1 text-tinte-leise disabled:opacity-25" onClick={() => setListe((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>▲</button>
              <button aria-label="Nach unten" disabled={i === liste.length - 1} className="px-1 text-tinte-leise disabled:opacity-25" onClick={() => setListe((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>▼</button>
              <button aria-label="Frage entfernen" className="px-1 text-[15px] text-red-500" onClick={() => setListe((l) => l.filter((_, n) => n !== i))}>✕</button>
            </div>
            <input className="field mt-2" placeholder="Frage" maxLength={160} value={f.titel} onChange={(e) => aendern(i, { titel: e.target.value })} />
            {(f.typ === "einfach" || f.typ === "mehrfach") && (
              <div className="mt-2 space-y-1.5">
                {f.optionen.map((o, n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className={`h-4 w-4 shrink-0 ring-2 ring-inset ring-black/20 dark:ring-white/30 ${f.typ === "einfach" ? "rounded-full" : "rounded-[4px]"}`} />
                    <input
                      className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-[15px] outline-none dark:bg-slate-800"
                      placeholder={`Antwort ${n + 1}`}
                      value={o}
                      maxLength={80}
                      onChange={(e) => aendern(i, { optionen: f.optionen.map((x, m) => (m === n ? e.target.value : x)) })}
                    />
                    <button aria-label="Antwort entfernen" className="px-1 text-tinte-leise" onClick={() => aendern(i, { optionen: f.optionen.filter((_, m) => m !== n) })}>
                      −
                    </button>
                  </div>
                ))}
                <button className="ml-6 text-[14px] font-semibold text-brand" onClick={() => aendern(i, { optionen: [...f.optionen, ""] })}>
                  + Antwort
                </button>
              </div>
            )}
            {f.typ === "skala" && (
              <div className="mt-2 flex gap-2">
                <input className="field" placeholder="1 = …" value={f.optionen[0] || ""} onChange={(e) => aendern(i, { optionen: [e.target.value, f.optionen[1] || ""] })} />
                <input className="field" placeholder="5 = …" value={f.optionen[1] || ""} onChange={(e) => aendern(i, { optionen: [f.optionen[0] || "", e.target.value] })} />
              </div>
            )}
            {f.typ === "person" && <p className="mt-2 text-[12.5px] text-tinte-leise">Alle wählen eine Person aus der Stufe. Gezählt wird, wie oft jemand gewählt wurde.</p>}
            <label className="mt-2 flex items-center justify-between text-[14px]">
              Muss beantwortet werden
              <Schalter an={f.pflicht} onChange={(x) => aendern(i, { pflicht: x })} label="Muss beantwortet werden" />
            </label>
          </div>
        ))}
      </div>
      <button
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-[#5E5CE6]/35 py-3 text-[15px] font-semibold text-[#5E5CE6]"
        onClick={() => setListe((l) => [...l, { sort: l.length + 1, typ: "einfach", titel: "", optionen: ["", ""], pflicht: true }])}
      >
        + Frage
      </button>

      <Gruppe className="mt-5">
        <Zeile label="Beim Start benachrichtigen">
          <Schalter an={benachrichtigen} onChange={setBenachrichtigen} label="Beim Start benachrichtigen" />
        </Zeile>
      </Gruppe>

      {fehler && <p className="mt-3 text-center text-[13px] font-medium text-tinte-leise">{fehler}</p>}
      <div className="mt-3 flex gap-2">
        <button
          className="btn-grau flex-1"
          disabled={busy || !titel.trim()}
          onClick={async () => {
            setBusy(true);
            const id = await sichern();
            setBusy(false);
            if (id) {
              melde("Entwurf gespeichert", "erfolg");
              onClose();
            }
          }}
        >
          Entwurf
        </button>
        <button
          className="btn-primary flex-[1.5] !bg-gradient-to-r !from-[#5E5CE6] !to-[#BF5AF2] disabled:opacity-40"
          disabled={busy || Boolean(fehler)}
          onClick={async () => {
            const ok = await fragen_(`„${titel}“ jetzt starten?\n\n${ZIEL_NAME[ziel]} sehen sie beim nächsten Öffnen der App. Danach lassen sich die Fragen nicht mehr ändern.`, "Starten");
            if (!ok) return;
            setBusy(true);
            const id = await sichern();
            const f = id ? await verwaltung.status(id, "aktiv") : "Speichern fehlgeschlagen";
            setBusy(false);
            if (f) return meldeFehler("Ging nicht: " + f);
            if (benachrichtigen) {
              const body = pflicht ? "Kurze Umfrage – öffne die App, um teilzunehmen." : "Neue Umfrage – mach gern mit.";
              if (ziel === "team") void pushAnTeam(`📊 ${titel}`, body, "./");
              else if (ziel !== "eltern")
                void pushAnPersonen(students.map((s) => ({ student_id: s.id, title: `📊 ${titel}`, body })), "./", { ohneEltern: ziel === "schueler" });
            }
            melde("Umfrage läuft", "erfolg");
            onClose();
          }}
        >
          {busy ? "…" : "Starten"}
        </button>
      </div>
      {umfrage && (
        <button
          className="mt-4 w-full text-[15px] font-semibold text-red-600"
          onClick={() =>
            void fragen_("Entwurf löschen?", "Löschen", true).then(async (ok) => {
              if (!ok) return;
              const f = await verwaltung.loeschen(umfrage.id);
              if (f) return meldeFehler(f);
              onClose();
            })
          }
        >
          Entwurf löschen
        </button>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Ergebnis */
function ErgebnisSheet({
  open,
  umfrage,
  fragen,
  verwaltung,
  onClose,
}: {
  open: boolean;
  umfrage: Umfrage | null;
  fragen: Frage[];
  verwaltung: ReturnType<typeof useUmfragenVerwaltung>;
  onClose: () => void;
}) {
  const { can } = useRole();
  const [erg, setErg] = useState<Ergebnis | null>(null);
  const [fehler, setFehler] = useState("");
  const personen = useUmfragePersonen(open && fragen.some((f) => f.typ === "person"));
  const pName = useMemo(() => Object.fromEntries(personen.map((p) => [p.id, `${p.vorname} ${p.nachname}`])), [personen]);

  useEffect(() => {
    if (!open || !umfrage) return;
    setErg(null);
    setFehler("");
    void verwaltung.ergebnis(umfrage.id).then((r) => (typeof r === "string" ? setFehler(r) : setErg(r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, umfrage?.id]);

  if (!umfrage) return null;
  const quote = erg && erg.zielgruppe ? Math.min(100, Math.round((erg.teilnehmer / erg.zielgruppe) * 100)) : 0;

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={umfrage.titel} unter={`${ZIEL_NAME[umfrage.zielgruppe]} · ${umfrage.status === "aktiv" ? "läuft" : umfrage.status === "beendet" ? "beendet" : "Entwurf"}`} onClose={onClose} />
      {fehler && <p className="text-[14px] text-red-600">{fehler.includes("Berechtigung") ? "Ergebnisse darfst du nicht sehen." : fehler}</p>}
      {erg && (
        <>
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-[#5E5CE6]/10 to-[#BF5AF2]/10 px-4 py-3.5">
            <div className="relative h-14 w-14 shrink-0">
              <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-black/10 dark:stroke-white/15" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" stroke="#5E5CE6" strokeLinecap="round" strokeDasharray={`${(quote / 100) * 97.4} 97.4`} />
              </svg>
              <span className="zahl absolute inset-0 flex items-center justify-center text-[11px] font-bold">{quote}%</span>
            </div>
            <div>
              <div className="zahl text-[1.4rem] font-bold leading-none">
                {erg.teilnehmer} <span className="text-[15px] font-semibold text-tinte-leise">von {erg.zielgruppe}</span>
              </div>
              <div className="mt-1 text-[13px] text-tinte-leise">haben abgeschlossen</div>
            </div>
          </div>

          {fragen.map((f, n) => {
            const e = erg.fragen.find((x) => x.frage_id === f.id);
            if (!e) return null;
            const eintraege = Object.entries(e.zaehlung)
              .map(([k, v]) => [f.typ === "person" ? pName[k] || "Unbekannt" : k, v] as const)
              .sort((a, b) => (f.typ === "skala" ? Number(a[0]) - Number(b[0]) : b[1] - a[1]));
            const max = Math.max(1, ...eintraege.map(([, v]) => v));
            const schnitt = f.typ === "skala" && e.antworten ? Object.entries(e.zaehlung).reduce((s, [k, v]) => s + Number(k) * v, 0) / e.antworten : 0;
            return (
              <section key={f.id} className="mt-5">
                <h3 className="px-1 text-[15px] font-semibold leading-snug">
                  <span className="text-tinte-leise">{n + 1}.</span> {f.titel}
                </h3>
                <p className="px-1 text-[12px] text-tinte-leise">
                  {e.antworten} {e.antworten === 1 ? "Antwort" : "Antworten"}{f.typ === "skala" && e.antworten ? ` · Ø ${schnitt.toFixed(1).replace(".", ",")}` : ""}
                </p>
                {f.typ === "text" ? (
                  <ul className="mt-2 space-y-1.5">
                    {e.texte.map((t, i) => (
                      <li key={i} className="rounded-xl bg-[rgb(118_118_128/0.08)] px-3 py-2 text-[14px] dark:bg-[rgb(118_118_128/0.18)]">
                        {t}
                      </li>
                    ))}
                    {!e.texte.length && <li className="px-1 text-[13px] text-tinte-leise">Noch nichts.</li>}
                  </ul>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {eintraege.slice(0, f.typ === "person" ? 10 : 50).map(([k, v], i) => (
                      <div key={k} className="relative overflow-hidden rounded-xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-xl ${i === 0 && f.typ !== "skala" ? "bg-gradient-to-r from-[#FF9F0A]/45 to-[#FFD60A]/45" : "bg-[#5E5CE6]/20"}`}
                          style={{ width: `${(v / max) * 100}%` }}
                        />
                        <div className="relative flex items-center justify-between px-3 py-2 text-[14px]">
                          <span className="truncate font-medium">
                            {i === 0 && f.typ === "person" ? "🏆 " : ""}
                            {k}
                          </span>
                          <span className="zahl font-bold">{v}</span>
                        </div>
                      </div>
                    ))}
                    {!eintraege.length && <p className="px-1 text-[13px] text-tinte-leise">Noch keine Stimmen.</p>}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {can("umfragen.verwalten") && umfrage.status === "aktiv" && (
        <button
          className="btn-grau mt-6 w-full !text-red-600"
          onClick={() =>
            void fragen_("Umfrage beenden? Danach kann niemand mehr antworten.", "Beenden", true).then(async (ok) => {
              if (!ok) return;
              const f = await verwaltung.status(umfrage.id, "beendet");
              if (f) return meldeFehler(f);
              onClose();
            })
          }
        >
          Umfrage beenden
        </button>
      )}
      {can("umfragen.verwalten") && umfrage.status === "beendet" && (
        <button
          className="mt-4 w-full text-[15px] font-semibold text-red-600"
          onClick={() =>
            void fragen_("Umfrage samt allen Antworten löschen?", "Löschen", true).then(async (ok) => {
              if (!ok) return;
              const f = await verwaltung.loeschen(umfrage.id);
              if (f) return meldeFehler(f);
              onClose();
            })
          }
        >
          Löschen
        </button>
      )}
    </Sheet>
  );
}
