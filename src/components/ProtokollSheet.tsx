import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile } from "./Liste";
import { Icon } from "./Icon";
import { Suchfeld } from "./KontoZeile";
import { hasSupabase } from "../lib/supabase";
import {
  BEREICHE,
  datumDe,
  ladeProtokoll,
  ladeSpeicherstaende,
  letzterAutomatischer,
  protokollAlsCsv,
  protokollKurz,
  speicherstandHerunterladen,
  speicherstandJetzt,
  speicherstandUebernehmen,
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

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel={nurSicherung ? "Sicherheitskopie" : "Protokoll & Sicherung"} onClose={onClose} />

      {fehler && (
        <div className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-600 dark:text-red-400">{fehler}</div>
      )}
      {info && (
        <div className="mb-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
          {info}
        </div>
      )}

      {/* ---------------- Sicherung: Aktionen als blaue Zeilen (keine breiten Knöpfe mitten im Blatt) ---------------- */}
      <Gruppe
        titel="Speicherstände"
        className="mt-1"
        fuss={
          !hasSupabase ? (
            "In der Demo gibt es keine Speicherstände – mit Datenbank sichert sich der Stand jede Nacht um 0:00 Uhr von selbst."
          ) : (
            <>
              Jede Nacht um 0:00 Uhr sichert sich der Stand von Personen, Beiträgen, Kassenbuch, Komitees und Rechten von selbst.{" "}
              {nurSicherung ? "Du kannst ihn hier als Datei herunterladen." : "Chats, Events und Termine gehören nicht dazu – und Zugänge lassen sich so nicht zurückholen."}{" "}
              {/* Die Datei enthält Namen, Beiträge und die Bankverbindung. Das muss dastehen. */}
              In der Datei stehen Namen, Zahlungsstände und die Bankverbindung der Stufenkasse – sie gehört nicht in eine Cloud, einen Chat oder auf einen fremden Rechner.
            </>
          )
        }
      >
        {!nurSicherung && vortag && (
          <Zeile
            label={`Stand von ${datumDe(vortag.tag)} übernehmen`}
            blau
            disabled={busy !== ""}
            onClick={() => {
              setFrage(vortag);
              setBestaetigung("");
            }}
          />
        )}
        <Zeile
          label="Sicherheitskopie herunterladen"
          blau
          disabled={busy !== "" || !staende.length}
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
          {busy === "download" && <Wert>…</Wert>}
        </Zeile>
        {!nurSicherung && (
          <Zeile
            label="Stand von jetzt sichern"
            blau
            disabled={busy !== "" || !hasSupabase}
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
            {busy === "neu" && <Wert>…</Wert>}
          </Zeile>
        )}
      </Gruppe>

      {staende.length > 1 && (
        <details className="group mt-3">
          <summary className="auf-bild flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] font-semibold text-tinte-matt dark:text-slate-300 [&::-webkit-details-marker]:hidden">
            Ältere Stände ({staende.length})
            <span aria-hidden className="text-tinte-leise transition group-open:rotate-90">
              <Icon name="chevron" size={14} />
            </span>
          </summary>
          <div className="gruppe-zellen">
            {staende.map((s) => (
              <div key={s.id} className="flex min-h-[48px] items-center gap-1 py-1 pl-4 pr-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{datumDe(s.tag)}</span>
                  <span className="block truncate text-[12.5px] text-tinte-leise">
                    {s.art === "automatisch" ? "nachts" : s.art === "manuell" ? "von Hand" : "vor einer Rücksetzung"} · {s.zeilen} Zeilen
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Stand vom ${datumDe(s.tag)} herunterladen`}
                  className="flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-brand-dark dark:text-brand"
                  onClick={async () => {
                    const r = await speicherstandHerunterladen(s);
                    if (!r.ok) setFehler(r.fehler || "Hat nicht geklappt.");
                  }}
                >
                  Laden
                </button>
                {!nurSicherung && (
                  <button
                    type="button"
                    className="flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-[14px] font-semibold text-amber-700 dark:text-amber-400"
                    onClick={() => {
                      setFrage(s);
                      setBestaetigung("");
                    }}
                  >
                    Übernehmen
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ---------------- Rückfrage vor dem Zurücksetzen ---------------- */}
      {frage && (
        <div className="mt-4 rounded-2xl border-2 border-amber-500/60 bg-amber-500/5 p-3.5">
          <div className="mb-1 text-[15px] font-bold text-amber-700 dark:text-amber-400">
            Speicherstand vom {datumDe(frage.tag)} übernehmen?
          </div>
          <p className="mb-2 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
            Personen, Beiträge, Beteiligungen, Kassenbuch, Komitees, Rollen und Rechte gehen auf den Stand von
            damals zurück. <b>Alles, was seitdem daran geändert wurde, ist weg.</b> Chats, Events, Termine und die
            Zugänge selbst bleiben unberührt. Der jetzige Stand wird vorher automatisch als Sicherheitskopie
            weggeschrieben – ein Fehlgriff lässt sich also rückgängig machen.
          </p>
          <p className="mb-2 text-[13px] font-semibold">
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
              type="button"
              onClick={() => {
                setFrage(null);
                setBestaetigung("");
              }}
              className="btn-grau flex-1"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={bestaetigung.trim().toUpperCase() !== "ÜBERNEHMEN" || busy !== ""}
              onClick={() => void uebernehmen(frage)}
              className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {busy === "uebernehmen" ? "…" : "Jetzt übernehmen"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Protokoll ---------------- */}
      {!nurSicherung && (
        <section className="mt-5">
          <div className="mb-1 flex items-center gap-2 pl-4">
            <h3 className="auf-bild min-w-0 flex-1 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">Was geändert wurde</h3>
            <button
              type="button"
              disabled={!zeilen.length}
              onClick={() => protokollAlsCsv(zeilen)}
              className="flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-brand-dark disabled:opacity-40 dark:text-brand"
            >
              Als Tabelle
            </button>
          </div>

          {/* Filter: reine Text-Chips (keine Emojis). Am Handy waagerecht wischbar,
              ab 640 px umbrechend (mit der Maus lässt sich nicht seitlich wischen).
              Sichtbar 36 px hoch, Tippfläche 44 px (Design-Regeln 5). */}
          <div className="no-scrollbar -mx-5 mb-1 flex gap-x-1.5 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {BEREICHE.map((b) => (
              <button
                key={b.key}
                type="button"
                aria-pressed={bereich === b.key}
                onClick={() => setBereich(b.key)}
                className="flex min-h-[44px] shrink-0 items-center transition active:opacity-60"
              >
                <span
                  className={`flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold ${
                    bereich === b.key ? "bg-brand text-white" : "bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-300"
                  }`}
                >
                  {b.label}
                </span>
              </button>
            ))}
          </div>

          <Suchfeld wert={suche} onChange={setSuche} platzhalter="Nach Name oder Wort suchen" />

          {zeilen.length > 0 && (
            <div className="gruppe-zellen">
              {zeilen.map((z) => (
                <ProtokollZeile key={z.id} z={z} />
              ))}
              {mehr && <Zeile label={laedt ? "Lädt …" : "Ältere anzeigen"} blau disabled={laedt} onClick={() => void nachladen()} />}
            </div>
          )}

          {!zeilen.length && !laedt && (
            <p className="auf-bild py-6 text-center text-[13px] text-tinte-leise">{fehler ? "—" : "Hier steht noch nichts."}</p>
          )}

          <p className="auf-bild mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">
            Das Protokoll schreibt die Datenbank selbst. Es lässt sich von niemandem ändern oder löschen –
            auch nicht von dir. Einträge, die älter als zwei Jahre sind, verschwinden von allein.
            {!hasSupabase && " In der Demo stehen hier erfundene Beispiele."}
          </p>
        </section>
      )}
    </Sheet>
  );
}

/** Eine Zeile: Icon des Bereichs, Name, kurz was passiert ist – rechts wann, darunter von wem. */
function ProtokollZeile({ z }: { z: LogZeile }) {
  const { name, was } = protokollKurz(z);
  const icon = BEREICHE.find((b) => b.key === z.bereich && b.key)?.icon ?? "info";
  const d = new Date(z.at);
  const wann = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-start gap-3 px-4 py-2.5" title={z.klartext}>
      <span aria-hidden className="mt-0.5 flex w-5 shrink-0 justify-center text-tinte-leise">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{name || "—"}</span>
          <span className="zahl shrink-0 text-[12px] text-tinte-leise">{wann}</span>
        </div>
        <div className="truncate text-[13.5px] text-tinte-matt dark:text-slate-300">{was}</div>
        {/* Ohne Ziel und ohne Akteur heißt die Zeile schon „System“ – kein doppeltes „von System“ */}
        {(z.akteur_name || z.ziel_name) && <div className="truncate text-[12px] text-tinte-leise">von {z.akteur_name || "System"}</div>}
      </div>
    </div>
  );
}
