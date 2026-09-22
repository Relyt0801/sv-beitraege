import { useCallback, useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import {
  BEREICHE,
  datumDe,
  ladeProtokoll,
  ladeSpeicherstaende,
  letzterAutomatischer,
  protokollAlsCsv,
  speicherstandHerunterladen,
  speicherstandJetzt,
  speicherstandUebernehmen,
  zeitpunktDe,
  type LogZeile,
  type Speicherstand,
} from "../lib/protokoll";

/**
 * Protokoll und Sicherung – erreichbar NUR über das eigene Profil.
 *
 * `nurSicherung` ist die kleine Fassung für den Kassenwart: Speicherstände
 * herunterladen, sonst nichts. Das Protokoll selbst sieht ausschliesslich der
 * Admin – das steht nicht nur hier, sondern auch als Regel in der Datenbank.
 */
export function ProtokollSheet({
  open,
  onClose,
  nurSicherung = false,
}: {
  open: boolean;
  onClose: () => void;
  nurSicherung?: boolean;
}) {
  const [zeilen, setZeilen] = useState<LogZeile[]>([]);
  const [mehr, setMehr] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [bereich, setBereich] = useState("");
  const [suche, setSuche] = useState("");
  const [fehler, setFehler] = useState("");

  const [staende, setStaende] = useState<Speicherstand[]>([]);
  const [busy, setBusy] = useState("");
  const [info, setInfo] = useState("");
  const [frage, setFrage] = useState<Speicherstand | null>(null);
  const [bestaetigung, setBestaetigung] = useState("");

  const ersteSeite = useCallback(async () => {
    setLaedt(true);
    setFehler("");
    const r = await ladeProtokoll({ bereich, suche });
    setLaedt(false);
    if (r.fehler) setFehler(r.fehler);
    setZeilen(r.zeilen);
    setMehr(r.mehr);
  }, [bereich, suche]);

  const staendeLaden = useCallback(async () => {
    const r = await ladeSpeicherstaende();
    if (r.fehler) setFehler(r.fehler);
    setStaende(r.staende);
  }, []);

  useEffect(() => {
    if (!open) return;
    void staendeLaden();
  }, [open, staendeLaden]);

  // Das Tippen in der Suche nicht bei jedem Buchstaben an die Datenbank geben.
  useEffect(() => {
    if (!open || nurSicherung) return;
    const t = setTimeout(() => void ersteSeite(), suche ? 300 : 0);
    return () => clearTimeout(t);
  }, [open, nurSicherung, ersteSeite, suche]);

  async function nachladen() {
    const letzte = zeilen[zeilen.length - 1];
    if (!letzte) return;
    setLaedt(true);
    const r = await ladeProtokoll({ bereich, suche, vorId: letzte.id });
    setLaedt(false);
    if (r.fehler) {
      setFehler(r.fehler);
      return;
    }
    setZeilen((v) => [...v, ...r.zeilen]);
    setMehr(r.mehr);
  }

  const vortag = letzterAutomatischer(staende);

  async function uebernehmen(s: Speicherstand) {
    setBusy("uebernehmen");
    const r = await speicherstandUebernehmen(s.id);
    setBusy("");
    setFrage(null);
    setBestaetigung("");
    if (!r.ok) {
      setFehler(r.fehler || "Hat nicht geklappt.");
      return;
    }
    setInfo(`Speicherstand vom ${datumDe(s.tag)} übernommen. Die Seite lädt gleich neu.`);
    void staendeLaden();
    // Alle offenen Speicher in der App zeigen jetzt Daten von vorhin.
    setTimeout(() => window.location.reload(), 1600);
  }

  const kasten = "rounded-2xl bg-papier-matt p-3.5 dark:bg-slate-800/70";
  const knopf =
    "rounded-lg border border-papier-linie px-3 py-2 text-sm font-bold text-brand disabled:opacity-40 dark:border-slate-600";

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">{nurSicherung ? "Sicherheitskopie" : "Protokoll & Sicherung"}</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>

      {fehler && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-500">{fehler}</div>
      )}
      {info && (
        <div className="mb-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
          {info}
        </div>
      )}

      {/* ---------------- Sicherung ---------------- */}
      <div className={`mb-5 ${kasten}`}>
        <div className="mb-1 text-sm font-bold">🗄️ Speicherstände</div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-tinte-matt">
          Jede Nacht um 0:00 Uhr sichert sich der Stand von Personen, Beiträgen, Kassenbuch,
          Komitees und Rechten von selbst.{" "}
          {nurSicherung ? (
            <>Du kannst ihn hier als Datei herunterladen.</>
          ) : (
            <>Chats, Events und Termine gehören nicht dazu – und Zugänge lassen sich so nicht zurückholen.</>
          )}
        </p>

        {!nurSicherung && vortag && (
          <button
            disabled={busy !== ""}
            onClick={() => {
              setFrage(vortag);
              setBestaetigung("");
            }}
            className="mb-2 w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-bold text-white disabled:opacity-40"
          >
            Speicherstand von {datumDe(vortag.tag)} übernehmen
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy !== "" || !staende.length}
            className={knopf}
            onClick={async () => {
              const s = staende[0];
              if (!s) return;
              setBusy("download");
              const r = await speicherstandHerunterladen(s);
              setBusy("");
              if (!r.ok) setFehler(r.fehler || "Hat nicht geklappt.");
              else setInfo("Die Datei liegt in deinen Downloads.");
            }}
          >
            {busy === "download" ? "…" : "⬇ Sicherheitskopie herunterladen"}
          </button>

          {!nurSicherung && (
            <button
              disabled={busy !== ""}
              className={knopf}
              onClick={async () => {
                setBusy("neu");
                const r = await speicherstandJetzt();
                setBusy("");
                if (!r.ok) setFehler(r.fehler || "Hat nicht geklappt.");
                else {
                  setInfo("Speicherstand angelegt.");
                  void staendeLaden();
                }
              }}
            >
              {busy === "neu" ? "…" : "＋ Stand von jetzt sichern"}
            </button>
          )}
        </div>

        {/* Die Datei enthält Namen, Beiträge und die Bankverbindung. Das muss dastehen. */}
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-tinte-leise">
          ⚠️ In der Datei stehen Namen, Zahlungsstände und die Bankverbindung der Stufenkasse.
          Sie gehört nicht in eine Cloud, einen Chat oder auf einen fremden Rechner.
        </p>

        {staende.length > 1 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-tinte-matt">
              Ältere Stände ({staende.length})
            </summary>
            <div className="mt-2 grid gap-1.5">
              {staende.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 dark:bg-slate-900">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {datumDe(s.tag)}
                    <span className="ml-1.5 font-normal text-tinte-leise">
                      {s.art === "automatisch"
                        ? "nachts"
                        : s.art === "manuell"
                          ? "von Hand"
                          : "vor einer Rücksetzung"}{" "}
                      · {s.zeilen} Zeilen
                    </span>
                  </span>
                  <button
                    className="shrink-0 rounded-md px-2 py-1 text-[12px] font-bold text-brand"
                    onClick={async () => {
                      const r = await speicherstandHerunterladen(s);
                      if (!r.ok) setFehler(r.fehler || "Hat nicht geklappt.");
                    }}
                  >
                    ⬇
                  </button>
                  {!nurSicherung && (
                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-[12px] font-bold text-amber-600"
                      onClick={() => {
                        setFrage(s);
                        setBestaetigung("");
                      }}
                    >
                      übernehmen
                    </button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ---------------- Rückfrage vor dem Zurücksetzen ---------------- */}
      {frage && (
        <div className="mb-5 rounded-2xl border-2 border-amber-500/60 bg-amber-500/5 p-3.5">
          <div className="mb-1 text-sm font-bold text-amber-700 dark:text-amber-400">
            Speicherstand vom {datumDe(frage.tag)} übernehmen?
          </div>
          <p className="mb-2 text-[12.5px] leading-relaxed text-tinte-matt">
            Personen, Beiträge, Beteiligungen, Kassenbuch, Komitees, Rollen und Rechte gehen auf den Stand von
            damals zurück. <b>Alles, was seitdem daran geändert wurde, ist weg.</b> Chats, Events, Termine und die
            Zugänge selbst bleiben unberührt. Der jetzige Stand wird vorher automatisch als Sicherheitskopie
            weggeschrieben – ein Fehlgriff lässt sich also rückgängig machen.
          </p>
          <p className="mb-2 text-[12.5px] font-semibold">
            Tippe <span className="rounded bg-papier-matt px-1.5 py-0.5 dark:bg-slate-800">ÜBERNEHMEN</span> zum
            Bestätigen.
          </p>
          <input
            className="field mb-2"
            value={bestaetigung}
            autoFocus
            onChange={(e) => setBestaetigung(e.target.value)}
            placeholder="ÜBERNEHMEN"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setFrage(null);
                setBestaetigung("");
              }}
              className="rounded-lg border border-papier-linie px-3 py-2 text-sm font-semibold text-tinte-matt dark:border-slate-600"
            >
              Abbrechen
            </button>
            <button
              disabled={bestaetigung.trim().toUpperCase() !== "ÜBERNEHMEN" || busy !== ""}
              onClick={() => void uebernehmen(frage)}
              className="ml-auto rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy === "uebernehmen" ? "…" : "Jetzt übernehmen"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Protokoll ---------------- */}
      {!nurSicherung && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-bold">📋 Was geändert wurde</span>
            <button
              disabled={!zeilen.length}
              onClick={() => protokollAlsCsv(zeilen)}
              className="ml-auto rounded-lg px-2 py-1 text-[12px] font-bold text-brand disabled:opacity-40"
            >
              ⬇ als Tabelle
            </button>
          </div>

          <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {BEREICHE.map((b) => (
              <button
                key={b.key}
                onClick={() => setBereich(b.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  bereich === b.key
                    ? "bg-brand text-white"
                    : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {b.icon} {b.label}
              </button>
            ))}
          </div>

          <input
            className="field mb-3"
            placeholder="Nach Name oder Wort suchen"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />

          <div className="grid gap-1.5">
            {zeilen.map((z) => (
              <div key={z.id} className="rounded-xl border border-papier-linie px-3 py-2.5 dark:border-slate-700">
                <div className="text-[14px] font-semibold leading-snug">{z.klartext}</div>
                <div className="mt-0.5 text-[11.5px] text-tinte-leise">
                  {zeitpunktDe(z.at)} · {z.akteur_name || "System"}
                </div>
              </div>
            ))}
          </div>

          {!zeilen.length && !laedt && (
            <p className="py-6 text-center text-[13px] text-tinte-leise">
              {fehler ? "—" : "Hier steht noch nichts."}
            </p>
          )}

          {mehr && (
            <button onClick={nachladen} disabled={laedt} className="mt-3 w-full rounded-xl border border-papier-linie py-2.5 text-sm font-bold text-brand disabled:opacity-40 dark:border-slate-600">
              {laedt ? "…" : "Ältere anzeigen"}
            </button>
          )}

          <p className="mt-3 text-[11.5px] leading-relaxed text-tinte-leise">
            Das Protokoll schreibt die Datenbank selbst. Es lässt sich von niemandem ändern oder löschen –
            auch nicht von dir. Einträge, die älter als zwei Jahre sind, verschwinden von allein.
          </p>
        </>
      )}

      <button className="btn-primary mt-5" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}
