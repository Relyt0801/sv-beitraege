import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile } from "./Liste";
import { Schalter } from "./Schalter";
import { useRole } from "../auth/RoleProvider";
import {
  fortschritt,
  kurzName,
  personVerlauf,
  useAlbum,
  type Album,
  type AlbumKommentar,
  type AlbumPerson,
  type Freigabe,
  type Steckbrief,
} from "../lib/album";
import { frage, melde, meldeFehler } from "../lib/melder";

/* ====================================================================== */
/* Gemeinsamer Zustand: einmal laden, Karte und Blatt teilen ihn          */
/* ====================================================================== */
const AlbumCtx = createContext<Album | null>(null);

export function AlbumProvider({ children }: { children: ReactNode }) {
  const { can, uid, studentId, isEltern } = useRole();
  const darf = !isEltern && (can("album.nutzen") || can("album.kategorien"));
  const album = useAlbum(darf, uid, studentId);
  return (
    <AlbumCtx.Provider value={darf ? album : null}>
      {children}
      {darf && <AlbumWurzel album={album} />}
    </AlbumCtx.Provider>
  );
}

const useAlbumCtx = () => useContext(AlbumCtx);

/** Öffnet das Blatt bei oeffneAlbum() oder wenn die App mit #album startet. */
function AlbumWurzel({ album }: { album: Album }) {
  const [offen, setOffen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  useEffect(() => {
    const auf = (e: Event) => {
      setPerson((e as CustomEvent<string | null>).detail ?? null);
      setOffen(true);
    };
    window.addEventListener("sv:album", auf);
    if (window.location.hash === "#album") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setOffen(true);
    }
    return () => window.removeEventListener("sv:album", auf);
  }, []);
  return <AlbumSheet open={offen} start={person} album={album} onClose={() => setOffen(false)} />;
}

/* ====================================================================== */
/* Kleine Bausteine                                                       */
/* ====================================================================== */
const initialen = (p: { vorname: string; nachname: string }) => `${p.vorname[0] || ""}${p.nachname[0] || ""}`.toUpperCase();

function Bild({ p, gross }: { p: AlbumPerson; gross?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${personVerlauf(p.id)} ${
        gross ? "h-20 w-20 text-[28px] shadow-lg ring-4 ring-white dark:ring-slate-900" : "h-8 w-8 text-[12px]"
      }`}
    >
      {initialen(p)}
    </span>
  );
}

function Herz({ an, n, onClick, klein }: { an: boolean; n: number; onClick: () => void; klein?: boolean }) {
  const [tick, setTick] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setTick((t) => t + 1);
        onClick();
      }}
      aria-label={an ? "Gefällt mir nicht mehr" : "Gefällt mir"}
      aria-pressed={an}
      className={`flex items-center gap-1 ${klein ? "flex-col gap-0 text-[11px]" : "text-[14px]"} font-semibold transition active:scale-90 ${
        an ? "text-[#FF2D55]" : "text-tinte-leise"
      }`}
    >
      <svg key={tick} viewBox="0 0 24 24" className={`${klein ? "h-4 w-4" : "h-6 w-6"} ${tick ? "animate-herz" : ""}`} aria-hidden>
        <path
          d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.1 0 3.6 1.2 4.4 2.6.8-1.4 2.3-2.6 4.4-2.6 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21Z"
          fill={an ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      {n > 0 && <span className="zahl">{n}</span>}
    </button>
  );
}

function vorWann(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "gerade";
  if (s < 3600) return `${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `${Math.floor(s / 3600)} Std.`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} T.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

/* ====================================================================== */
/* Karte im Profil                                                        */
/* ====================================================================== */
export function AlbumKarte({ className = "" }: { className?: string }) {
  const album = useAlbumCtx();
  const { studentId, can } = useRole();
  if (!album || !can("album.nutzen")) return null;
  const mein = studentId ? album.steckbriefVon(studentId) : undefined;
  const prozent = fortschritt(mein, album.kategorien);
  const fertige = album.steckbriefe.filter((s) => fortschritt(s, album.kategorien) >= 50).length;
  const meineLikes = studentId ? album.likes.filter((l) => l.student_id === studentId).length : 0;
  const meineKommentare = studentId ? album.kommentare.filter((k) => k.student_id === studentId).length : 0;
  const offeneFreigaben = album.steckbriefe.filter(
    (s) => s.student_id !== studentId && (s.freigabe === "alle" ? false : s.freigabe === "gezielt" && studentId && s.freigabe_an.includes(studentId)) && !s.text.trim(),
  ).length;
  const vorschau = album.personen.slice(0, 5);

  return (
    <section className={`relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#D9480F] via-[#C2255C] to-[#6741D9] p-4 text-white shadow-[0_10px_30px_-12px_rgba(194,37,92,.6)] sm:p-5 ${className}`}>
      {/* Deko: schräg liegende Polaroids */}
      <div aria-hidden className="pointer-events-none absolute -right-3 -top-2 flex rotate-[8deg] gap-1.5 opacity-90">
        {[0, 1].map((i) => (
          <span key={i} className={`block h-16 w-12 rounded-[4px] bg-white p-1 pb-3 shadow-md ${i ? "-rotate-12 translate-y-3" : ""}`}>
            <span className={`block h-full w-full rounded-[2px] bg-gradient-to-br ${i ? "from-[#64D2FF] to-[#5E5CE6]" : "from-[#FFD60A] to-[#30D158]"}`} />
          </span>
        ))}
      </div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/90">Abi-Album</div>
      <div className="mt-1 font-buch text-[1.6rem] font-semibold italic leading-tight">Dein Steckbrief</div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all duration-700 ease-ios" style={{ width: `${prozent}%` }} />
        </div>
        <span className="zahl text-[13px] font-bold">{prozent} %</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/90">
        <span>❤ {meineLikes}</span>
        <span>💬 {meineKommentare}</span>
        <span className="flex items-center">
          <span className="mr-1.5 flex -space-x-2">
            {vorschau.map((p) => (
              <span key={p.id} className={`h-5 w-5 rounded-full bg-gradient-to-br ring-2 ring-[#C2255C] ${personVerlauf(p.id)}`} />
            ))}
          </span>
          {fertige} {fertige === 1 ? "Steckbrief" : "Steckbriefe"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("sv:album", { detail: "__mein__" }))}
          className="rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-[#D70040] shadow-sm transition active:scale-95"
        >
          {prozent ? "Weiter ausfüllen" : "Jetzt ausfüllen"}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("sv:album", { detail: null }))}
          className="rounded-full bg-white/20 px-4 py-2 text-[14px] font-semibold text-white transition active:scale-95"
        >
          Alle ansehen
        </button>
        {offeneFreigaben > 0 && (
          <span className="flex items-center rounded-full bg-black/20 px-3 py-2 text-[12.5px] font-semibold">
            ✍️ {offeneFreigaben} {offeneFreigaben === 1 ? "Text wartet" : "Texte warten"} auf dich
          </span>
        )}
      </div>
    </section>
  );
}

/* ====================================================================== */
/* Das Blatt                                                              */
/* ====================================================================== */
type Ansicht = { art: "alle" } | { art: "mein" } | { art: "person"; id: string } | { art: "schreiben"; id: string };

export function AlbumSheet({ open, start, album, onClose }: { open: boolean; start: string | null; album: Album; onClose: () => void }) {
  const { studentId, can } = useRole();
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "alle" });
  const [kategorienOffen, setKategorienOffen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (start === "__mein__" && studentId) setAnsicht({ art: "mein" });
    else if (start && start !== "__mein__") setAnsicht({ art: "person", id: start });
    else setAnsicht({ art: "alle" });
  }, [open, start, studentId]);

  const nutzen = can("album.nutzen");

  return (
    <>
      <Sheet open={open && !kategorienOffen} onClose={onClose}>
        {ansicht.art === "person" ? (
          <SteckbriefAnsicht
            album={album}
            id={ansicht.id}
            zurueck={() => setAnsicht({ art: "alle" })}
            schreiben={() => setAnsicht({ art: "schreiben", id: ansicht.id })}
            bearbeiten={() => setAnsicht({ art: "mein" })}
            onClose={onClose}
          />
        ) : ansicht.art === "schreiben" ? (
          <TextFuerAndere album={album} id={ansicht.id} fertig={() => setAnsicht({ art: "person", id: ansicht.id })} />
        ) : (
          <>
            <SheetKopf
              titel={<span className="font-buch italic">Abi-Album</span>}
              unter={nutzen ? `${album.personen.length} Personen · ${album.steckbriefe.filter((s) => fortschritt(s, album.kategorien) > 0).length} begonnen` : "Kategorien verwalten"}
              onClose={onClose}
            />
            {nutzen && studentId && (
              <div className="seg mb-4">
                <button className={`seg-item ${ansicht.art === "alle" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht({ art: "alle" })}>
                  Alle
                </button>
                <button className={`seg-item ${ansicht.art === "mein" ? "seg-aktiv" : ""}`} onClick={() => setAnsicht({ art: "mein" })}>
                  Mein Steckbrief
                </button>
              </div>
            )}
            {ansicht.art === "mein" && studentId ? (
              <MeinSteckbrief album={album} vorschau={() => setAnsicht({ art: "person", id: studentId })} />
            ) : nutzen ? (
              <AlleSteckbriefe album={album} oeffnen={(id) => setAnsicht({ art: "person", id })} />
            ) : null}
            {can("album.kategorien") && (
              <Gruppe className="mt-6">
                <Zeile label="📝 Steckbrief-Kategorien" onClick={() => setKategorienOffen(true)}>
                  <span className="text-[15px] text-tinte-leise">{album.kategorien.filter((k) => k.aktiv).length}</span>
                </Zeile>
              </Gruppe>
            )}
          </>
        )}
      </Sheet>
      <KategorienSheet open={open && kategorienOffen} album={album} onClose={() => setKategorienOffen(false)} />
    </>
  );
}

/* ---------------------------------------------------------------- Alle */
function AlleSteckbriefe({ album, oeffnen }: { album: Album; oeffnen: (id: string) => void }) {
  const [suche, setSuche] = useState("");
  const { studentId } = useRole();
  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return album.personen.filter((p) => !q || `${p.vorname} ${p.nachname}`.toLowerCase().includes(q));
  }, [album.personen, suche]);

  if (!album.bereit) return <p className="py-10 text-center text-[14px] text-tinte-leise">Lädt …</p>;

  return (
    <>
      <input className="field mb-4" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {liste.map((p, i) => {
          const s = album.steckbriefVon(p.id);
          const pr = fortschritt(s, album.kategorien);
          const likes = album.likes.filter((l) => l.student_id === p.id).length;
          const komm = album.kommentare.filter((k) => k.student_id === p.id).length;
          const spitz = s && album.kategorien[0] ? s.stammdaten[album.kategorien[0].id] : "";
          const fuerMich = s && studentId && s.student_id !== studentId && (s.freigabe === "alle" || (s.freigabe === "gezielt" && s.freigabe_an.includes(studentId)));
          return (
            <button
              key={p.id}
              onClick={() => oeffnen(p.id)}
              style={{ transform: `rotate(${[-1.6, 1.2, -0.6, 1.8, -1.1, 0.7][i % 6]}deg)` }}
              className="group relative rounded-[6px] bg-white p-2 pb-2.5 text-left shadow-[0_6px_18px_-6px_rgba(0,0,0,.28)] transition duration-300 ease-ios hover:rotate-0 active:scale-95 dark:bg-slate-800"
            >
              <span className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-[3px] bg-gradient-to-br ${personVerlauf(p.id)}`}>
                <span className="font-buch text-[2.4rem] font-semibold italic text-white/95 drop-shadow-sm">{initialen(p)}</span>
                {pr === 0 && <span className="absolute inset-0 bg-white/45 dark:bg-slate-900/50" />}
                {fuerMich && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-[#D70040] shadow-sm">✍️ für dich</span>
                )}
              </span>
              <span className="mt-2 block truncate font-buch text-[15px] font-semibold italic leading-tight">
                {p.vorname} {p.nachname}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-tinte-leise">{spitz ? `„${spitz}“` : pr ? `${pr} % ausgefüllt` : "noch leer"}</span>
              <span className="mt-1 flex gap-3 text-[12px] font-semibold text-tinte-leise">
                <span className={likes ? "text-[#FF2D55]" : ""}>❤ {likes}</span>
                <span>💬 {komm}</span>
              </span>
            </button>
          );
        })}
      </div>
      {liste.length === 0 && <p className="py-10 text-center text-[14px] text-tinte-leise">Niemand gefunden.</p>}
    </>
  );
}

/* ---------------------------------------------------------------- Eine Person */
function SteckbriefAnsicht({
  album,
  id,
  zurueck,
  schreiben,
  bearbeiten,
  onClose,
}: {
  album: Album;
  id: string;
  zurueck: () => void;
  schreiben: () => void;
  bearbeiten: () => void;
  onClose: () => void;
}) {
  const { studentId, can } = useRole();
  const p = album.personen.find((x) => x.id === id);
  const s: Steckbrief | undefined = album.steckbriefVon(id);
  const ich = studentId === id;
  const darfSchreiben = !ich && !!studentId && !!s && (s.freigabe === "alle" || (s.freigabe === "gezielt" && s.freigabe_an.includes(studentId)));
  const kommentare = album.kommentare.filter((k) => k.student_id === id);
  const gelikt = album.likes.some((l) => l.student_id === id && l.user_id === album.me);
  const likes = album.likes.filter((l) => l.student_id === id).length;
  const [neu, setNeu] = useState("");
  const [sendet, setSendet] = useState(false);
  const ende = useRef<HTMLDivElement | null>(null);
  const meinName = studentId ? kurzName(album.personen.find((x) => x.id === studentId) || { vorname: "Ich", nachname: "" }) : "Stufenteam";

  if (!p) return <p className="py-10 text-center text-[14px] text-tinte-leise">Nicht gefunden.</p>;
  const felder = album.kategorien.filter((k) => k.aktiv && (s?.stammdaten[k.id] || "").trim());

  async function senden() {
    if (!neu.trim()) return;
    setSendet(true);
    const f = await album.kommentieren(id, neu, meinName);
    setSendet(false);
    if (f) return meldeFehler("Ging nicht: " + f);
    setNeu("");
    setTimeout(() => ende.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 150);
  }

  const darfEntfernen = (k: AlbumKommentar) => k.user_id === album.me || ich || can("album.moderieren");

  return (
    <div className="animate-vonRechts">
      {/* Kopf mit Farbe der Person */}
      <div className={`-mx-5 -mt-8 mb-12 bg-gradient-to-br px-5 pb-12 pt-3 sm:-mt-5 sm:rounded-t-[1.75rem] ${personVerlauf(id)}`}>
        <div className="flex items-center justify-between">
          <button onClick={zurueck} className="rounded-full bg-black/25 px-3 py-1.5 text-[14px] font-semibold text-white active:scale-95">
            ‹ Album
          </button>
          <button onClick={onClose} aria-label="Schließen" className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/25 text-[13px] font-bold text-white">
            ✕
          </button>
        </div>
      </div>
      <div className="-mt-24 flex flex-col items-center text-center">
        <Bild p={p} gross />
        <h2 className="mt-2 font-buch text-[1.7rem] font-semibold italic leading-tight">
          {p.vorname} {p.nachname}
        </h2>
        <div className="mt-2 flex items-center gap-4">
          <Herz an={gelikt} n={likes} onClick={() => void album.liken(id)} />
          <span className="text-[14px] font-semibold text-tinte-leise">💬 {kommentare.length}</span>
          {ich && (
            <button onClick={bearbeiten} className="rounded-full bg-brand/10 px-3 py-1 text-[13px] font-semibold text-brand-dark dark:text-brand">
              Bearbeiten
            </button>
          )}
        </div>
      </div>

      {/* Stammdaten wie ein Ausweis */}
      {felder.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {felder.map((k, i) => (
            <div
              key={k.id}
              className={`rounded-2xl bg-[rgb(118_118_128/0.08)] px-3.5 py-2.5 dark:bg-[rgb(118_118_128/0.18)] ${
                (s!.stammdaten[k.id] || "").length > 22 || (felder.length % 2 === 1 && i === felder.length - 1) ? "col-span-2" : ""
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-tinte-leise">{k.titel}</div>
              <div className="mt-0.5 text-[15px] font-medium leading-snug">{s!.stammdaten[k.id]}</div>
            </div>
          ))}
        </div>
      )}

      {/* Der freie Text */}
      {s?.text.trim() ? (
        <figure className="relative mt-4 rounded-2xl bg-[#FFF8E7] px-5 pb-4 pt-6 text-[#3A2E12] shadow-[inset_0_0_0_1px_rgba(0,0,0,.04)] dark:bg-[#2A2414] dark:text-[#F3E7C6]">
          <span aria-hidden className="absolute left-3 top-0 font-buch text-[3.2rem] leading-none text-[#FF9F0A]">
            “
          </span>
          <blockquote className="whitespace-pre-wrap font-buch text-[16.5px] leading-[1.55]">{s.text}</blockquote>
          {s.text_von_name && <figcaption className="mt-3 text-right text-[12.5px] font-semibold opacity-70">— geschrieben von {s.text_von_name}</figcaption>}
          {!ich && can("album.moderieren") && (
            <button
              onClick={() =>
                void frage("Diesen Text entfernen?", "Entfernen", true).then(async (ok) => {
                  if (!ok) return;
                  const f = await album.textEntfernen(id);
                  if (f) meldeFehler(f);
                })
              }
              className="mt-2 text-[12px] font-semibold text-red-600"
            >
              Text entfernen
            </button>
          )}
        </figure>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-black/10 px-4 py-5 text-center text-[13.5px] text-tinte-leise dark:border-white/15">
          {ich ? "Noch kein Text. Schreib ihn selbst oder gib ihn für andere frei." : "Hier steht noch kein Text."}
        </p>
      )}
      {darfSchreiben && (
        <button onClick={schreiben} className="btn-primary mt-3 w-full bg-gradient-to-r from-[#FF375F] to-[#BF5AF2]">
          ✍️ {s?.text.trim() ? "Text überarbeiten" : "Text schreiben"}
        </button>
      )}

      {/* Kommentare */}
      <h3 className="mb-2 mt-6 px-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Kommentare</h3>
      {kommentare.length === 0 && <p className="px-1 text-[13.5px] text-tinte-leise">Sei die erste Person, die etwas schreibt.</p>}
      <ul className="space-y-3.5">
        {kommentare.map((k) => {
          const an = album.klikes.some((l) => l.kommentar_id === k.id && l.user_id === album.me);
          const n = album.klikes.filter((l) => l.kommentar_id === k.id).length;
          const autor = { id: k.user_id, vorname: k.autor_name || "?", nachname: k.autor_name.split(" ")[1] || "" };
          return (
            <li key={k.id} className="flex animate-aufsteigen gap-2.5">
              <Bild p={autor} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">
                  <b className="font-semibold">{k.autor_name}</b> <span className="whitespace-pre-wrap break-words">{k.text}</span>
                </p>
                <div className="mt-0.5 flex gap-3 text-[12px] text-tinte-leise">
                  <span>{vorWann(k.created_at)}</span>
                  {n > 0 && <span className="font-semibold">{n} „Gefällt mir“</span>}
                  {darfEntfernen(k) && (
                    <button
                      className="font-semibold"
                      onClick={() =>
                        void frage("Kommentar löschen?", "Löschen", true).then(async (ok) => {
                          if (!ok) return;
                          const f = await album.kommentarEntfernen(k.id);
                          if (f) meldeFehler(f);
                        })
                      }
                    >
                      Löschen
                    </button>
                  )}
                </div>
              </div>
              <Herz klein an={an} n={0} onClick={() => void album.kommentarLiken(k.id)} />
            </li>
          );
        })}
      </ul>
      <div ref={ende} />

      {/* Eingabe klebt unten */}
      <div className="sticky bottom-0 -mx-5 mt-4 border-t border-black/[0.06] bg-white/95 px-5 pb-1 pt-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <input
            className="field flex-1 !rounded-full"
            placeholder={`Kommentar zu ${p.vorname} …`}
            value={neu}
            maxLength={500}
            onChange={(e) => setNeu(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void senden()}
          />
          <button
            disabled={!neu.trim() || sendet}
            onClick={() => void senden()}
            className="rounded-full px-3 py-2 text-[15px] font-semibold text-brand disabled:opacity-35"
          >
            Posten
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Text für andere schreiben */
function TextFuerAndere({ album, id, fertig }: { album: Album; id: string; fertig: () => void }) {
  const { studentId } = useRole();
  const p = album.personen.find((x) => x.id === id);
  const s = album.steckbriefVon(id);
  const [text, setText] = useState(s?.text || "");
  const [busy, setBusy] = useState(false);
  const meinName = studentId ? kurzName(album.personen.find((x) => x.id === studentId) || { vorname: "Ich", nachname: "" }) : "";
  if (!p) return null;
  return (
    <div className="animate-vonRechts">
      <SheetKopf titel={`Text für ${p.vorname}`} unter="Nur der Text – Stammdaten bleiben bei der Person." onClose={fertig} />
      <TextFeld wert={text} setzen={setText} platzhalter={`Was macht ${p.vorname} aus? Eine Geschichte, ein Moment, was ihr zusammen erlebt habt …`} />
      <button
        disabled={busy}
        className="btn-primary mt-4 w-full"
        onClick={async () => {
          setBusy(true);
          const f = await album.textSchreiben(id, text, meinName);
          setBusy(false);
          if (f) return meldeFehler(f);
          melde("Gespeichert", "erfolg");
          fertig();
        }}
      >
        {busy ? "…" : "Speichern"}
      </button>
    </div>
  );
}

function TextFeld({ wert, setzen, platzhalter }: { wert: string; setzen: (v: string) => void; platzhalter: string }) {
  return (
    <div className="rounded-2xl bg-[#FFF8E7] p-1 dark:bg-[#2A2414]">
      <textarea
        value={wert}
        maxLength={3000}
        rows={8}
        onChange={(e) => setzen(e.target.value)}
        placeholder={platzhalter}
        className="block w-full resize-y bg-transparent px-3.5 py-3 font-buch text-[16px] leading-[1.55] text-[#3A2E12] outline-none placeholder:text-[#3A2E12]/40 dark:text-[#F3E7C6] dark:placeholder:text-[#F3E7C6]/40"
      />
      <div className="px-3.5 pb-2 text-right text-[11.5px] font-semibold text-[#3A2E12]/50 dark:text-[#F3E7C6]/50">{wert.length} / 3000</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Mein Steckbrief */
function MeinSteckbrief({ album, vorschau }: { album: Album; vorschau: () => void }) {
  const { studentId } = useRole();
  const s = studentId ? album.steckbriefVon(studentId) : undefined;
  const kat = album.kategorien.filter((k) => k.aktiv);
  const [daten, setDaten] = useState<Record<string, string>>(() => ({ ...(s?.stammdaten || {}) }));
  const [text, setText] = useState(s?.text || "");
  const [freigabe, setFreigabe] = useState<Freigabe>(s?.freigabe || "niemand");
  const [an, setAn] = useState<string[]>(s?.freigabe_an || []);
  const [waehlen, setWaehlen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suche, setSuche] = useState("");
  // Kommt das erste Laden erst nach dem Öffnen an, einmal übernehmen –
  // danach nie wieder (sonst überschriebe das eigene Speichern die Eingaben).
  const geladen = useRef(album.bereit);
  useEffect(() => {
    if (geladen.current || !album.bereit) return;
    geladen.current = true;
    if (!s) return;
    setDaten({ ...s.stammdaten });
    setText(s.text);
    setFreigabe(s.freigabe);
    setAn(s.freigabe_an);
  }, [album.bereit, s]);

  const ich = album.personen.find((p) => p.id === studentId);
  const meinName = ich ? kurzName(ich) : "";
  const voll = kat.filter((k) => (daten[k.id] || "").trim()).length + (text.trim() ? 1 : 0);
  const prozent = Math.round((voll / (kat.length + 1)) * 100);
  const textVonAnderen = Boolean(s?.text_von_name);

  async function speichern() {
    setBusy(true);
    const f1 = await album.stammdatenSpeichern(daten);
    const f2 = !f1 && (text !== (s?.text || "")) ? await album.textSchreiben(studentId!, text, meinName) : null;
    const f3 =
      !f1 && !f2 && (freigabe !== (s?.freigabe || "niemand") || an.join() !== (s?.freigabe_an || []).join())
        ? await album.freigabeSetzen(freigabe, an)
        : null;
    setBusy(false);
    const f = f1 || f2 || f3;
    if (f) meldeFehler("Ging nicht: " + f);
    else melde("Steckbrief gespeichert", "erfolg");
  }

  return (
    <div className="animate-fadeIn">
      {/* Fortschritt */}
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#FF9F0A]/15 via-[#FF375F]/15 to-[#BF5AF2]/15 px-4 py-3">
        <span className="zahl shrink-0 whitespace-nowrap bg-gradient-to-br from-[#FF9F0A] to-[#BF5AF2] bg-clip-text text-[1.9rem] font-extrabold text-transparent">{prozent} %</span>
        <span className="text-[13px] leading-snug text-tinte-matt dark:text-slate-300">
          {prozent >= 100 ? "Fertig! Du kannst trotzdem jederzeit ändern." : "Fülle aus, was du magst – alles lässt sich später ändern."}
        </span>
      </div>

      <Gruppe titel="Stammdaten · nur du" fuss="Diese Felder kannst nur du ausfüllen – auch wenn du den Text freigibst.">
        {kat.map((k) => (
          <label key={k.id} className="block px-4 py-2.5">
            <span className="text-[12px] font-semibold text-tinte-leise">{k.titel}</span>
            <input
              value={daten[k.id] || ""}
              maxLength={200}
              placeholder={k.platzhalter}
              onChange={(e) => setDaten((d) => ({ ...d, [k.id]: e.target.value }))}
              className="mt-0.5 block w-full bg-transparent text-[15px] outline-none placeholder:text-tinte-leise/70"
            />
          </label>
        ))}
        {kat.length === 0 && <p className="px-4 py-3 text-[13px] text-tinte-leise">Das Team hat noch keine Kategorien angelegt.</p>}
      </Gruppe>

      <h3 className="mb-1.5 mt-5 px-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">Über mich</h3>
      <TextFeld wert={text} setzen={setText} platzhalter="Ein längerer Text über dich – oder lass ihn von Freunden schreiben (unten freigeben)." />
      {textVonAnderen && (
        <p className="mt-1.5 px-4 text-[12px] text-tinte-leise">Zuletzt geschrieben von {s!.text_von_name}. Du kannst ihn jederzeit ändern.</p>
      )}

      <Gruppe titel="Wer darf den Text schreiben?" fuss={freigabe === "niemand" ? "Nur du." : freigabe === "alle" ? "Alle im Album können den Text schreiben oder überarbeiten." : `${an.length} ausgewählt – sie sehen bei dir „✍️ für dich“.`}>
        <div className="px-3 py-2.5">
          <div className="seg">
            {(
              [
                ["niemand", "Nur ich"],
                ["gezielt", "Auswahl"],
                ["alle", "Alle"],
              ] as const
            ).map(([w, l]) => (
              <button key={w} className={`seg-item ${freigabe === w ? "seg-aktiv" : ""}`} onClick={() => setFreigabe(w)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {freigabe === "gezielt" && (
          <Zeile label="Personen" onClick={() => setWaehlen((v) => !v)}>
            <span className="truncate text-[15px] text-tinte-leise">
              {an.length ? an.map((x) => album.personen.find((p) => p.id === x)?.vorname).filter(Boolean).join(", ") : "Auswählen"}
            </span>
          </Zeile>
        )}
      </Gruppe>
      {freigabe === "gezielt" && waehlen && (
        <div className="mt-2 rounded-2xl bg-[rgb(118_118_128/0.08)] p-2 dark:bg-[rgb(118_118_128/0.18)]">
          <input className="field mb-2" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <div className="max-h-64 overflow-y-auto">
            {album.personen
              .filter((p) => p.id !== studentId && `${p.vorname} ${p.nachname}`.toLowerCase().includes(suche.trim().toLowerCase()))
              .map((p) => {
                const drin = an.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => setAn((l) => (drin ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left active:bg-black/5"
                  >
                    <Bild p={p} />
                    <span className="flex-1 text-[15px]">
                      {p.vorname} {p.nachname}
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${drin ? "bg-brand text-white" : "ring-2 ring-inset ring-black/15 dark:ring-white/25"}`}>
                      {drin ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button onClick={vorschau} className="btn-grau flex-1">
          Ansehen
        </button>
        <button disabled={busy} onClick={() => void speichern()} className="btn-primary flex-[1.6]">
          {busy ? "…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Kategorien (Team)                                                      */
/* ====================================================================== */
export function KategorienSheet({ open, album, onClose }: { open: boolean; album: Album; onClose: () => void }) {
  const [neu, setNeu] = useState("");
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [platz, setPlatz] = useState("");

  async function anlegen() {
    if (!neu.trim()) return;
    const f = await album.kategorieSpeichern({ titel: neu.trim(), sort: (album.kategorien.at(-1)?.sort ?? 0) + 1 });
    if (f) return meldeFehler(f);
    setNeu("");
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Steckbrief-Kategorien" unter="Die Stammdaten-Felder, die alle ausfüllen. Ausgeblendete bleiben gespeichert." onClose={onClose} />
      <Gruppe>
        {album.kategorien.map((k, i) =>
          bearbeite === k.id ? (
            <div key={k.id} className="space-y-2 px-4 py-3">
              <input className="field" value={titel} maxLength={60} onChange={(e) => setTitel(e.target.value)} placeholder="Titel" />
              <input className="field" value={platz} maxLength={80} onChange={(e) => setPlatz(e.target.value)} placeholder="Hinweis im Feld (optional)" />
              <div className="flex gap-2">
                <button className="btn-grau flex-1 !min-h-[40px] !text-[15px]" onClick={() => setBearbeite(null)}>
                  Abbrechen
                </button>
                <button
                  className="btn-primary flex-1 !min-h-[40px] !text-[15px]"
                  onClick={async () => {
                    if (!titel.trim()) return;
                    const f = await album.kategorieSpeichern({ ...k, titel, platzhalter: platz });
                    if (f) return meldeFehler(f);
                    setBearbeite(null);
                  }}
                >
                  Sichern
                </button>
              </div>
            </div>
          ) : (
            <div key={k.id} className={`flex min-h-[52px] items-center gap-2 px-3 ${k.aktiv ? "" : "opacity-50"}`}>
              <div className="flex flex-col">
                <button aria-label="Nach oben" disabled={i === 0} onClick={() => void album.kategorieVerschieben(k.id, -1)} className="px-1 text-[12px] text-tinte-leise disabled:opacity-25">
                  ▲
                </button>
                <button
                  aria-label="Nach unten"
                  disabled={i === album.kategorien.length - 1}
                  onClick={() => void album.kategorieVerschieben(k.id, 1)}
                  className="px-1 text-[12px] text-tinte-leise disabled:opacity-25"
                >
                  ▼
                </button>
              </div>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setBearbeite(k.id);
                  setTitel(k.titel);
                  setPlatz(k.platzhalter);
                }}
              >
                <span className="block truncate text-[15px] font-medium">{k.titel}</span>
                {k.platzhalter && <span className="block truncate text-[12px] text-tinte-leise">{k.platzhalter}</span>}
              </button>
              <Schalter an={k.aktiv} label={`${k.titel} anzeigen`} onChange={(v) => void album.kategorieSpeichern({ ...k, aktiv: v })} />
            </div>
          ),
        )}
      </Gruppe>
      <div className="mt-3 flex gap-2">
        <input
          className="field flex-1"
          value={neu}
          maxLength={60}
          placeholder="Neue Kategorie, z. B. Bester Lehrerspruch"
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void anlegen()}
        />
        <button className="btn-primary !min-h-[44px] px-4 !text-[15px]" disabled={!neu.trim()} onClick={() => void anlegen()}>
          Hinzufügen
        </button>
      </div>
      <p className="mt-3 px-1 text-[12px] leading-snug text-tinte-leise">
        Tipp: Welche Kategorien rein sollen, könnt ihr vorher per Pop-up-Umfrage abstimmen lassen.
      </p>
    </Sheet>
  );
}

/** Für das Profil: Kategorien öffnen, ohne das Album zu nutzen */
export function useAlbumOptional() {
  return useAlbumCtx();
}
