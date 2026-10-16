import { useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { hasSupabase, supabase } from "../lib/supabase";
import { melde, meldeFehler } from "../lib/melder";
import { Gruppe } from "./Liste";

const WAHL: { tage: number | null; text: string }[] = [
  { tage: null, text: "Nie" },
  { tage: 1, text: "1 Tag" },
  { tage: 3, text: "3 Tage" },
  { tage: 7, text: "1 Woche" },
  { tage: 30, text: "1 Monat" },
];

/** Schwelle fürs Not-Aufräumen (supabase/speicherwaechter.sql) */
const SCHWELLEN: { wert: number | null; text: string }[] = [
  { wert: null, text: "Aus" },
  { wert: 80, text: "ab 80 %" },
  { wert: 90, text: "ab 90 %" },
];

/** Antwort von speicher_stand() */
interface SpeicherStand {
  db_bytes: number;
  belegt_bytes: number;
  grenze_bytes: number;
  notfall_prozent: number | null;
  ziel_prozent: number;
  nachrichten: number;
  bytes_pro_nachricht: number;
  platz_nachrichten: number;
  tabellen: { name: string; bytes: number }[];
  dateien_bytes: number;
  dateien_anzahl: number;
  waechter_scharf: boolean;
  zuletzt: { at: string; nachrichten: number; prozent_vorher?: number; prozent_nachher?: number } | null;
}

const MB = 1024 * 1024;

/** Erfundener Stand für den Demo-Modus – so lässt sich das Blatt ansehen. */
const DEMO_STAND: SpeicherStand = {
  db_bytes: 30 * MB,
  belegt_bytes: 30 * MB,
  grenze_bytes: 500 * MB,
  notfall_prozent: 80,
  ziel_prozent: 70,
  nachrichten: 1240,
  bytes_pro_nachricht: 520,
  platz_nachrichten: Math.floor((470 * MB) / 520),
  tabellen: [
    { name: "spotify_titel", bytes: 5.2 * MB },
    { name: "topic_items", bytes: 1.1 * MB },
    { name: "audit_log", bytes: 0.6 * MB },
    { name: "daten_snapshots", bytes: 0.55 * MB },
  ],
  dateien_bytes: 5.6 * MB,
  dateien_anzahl: 11,
  waechter_scharf: false,
  zuletzt: null,
};

/** Verständliche Namen für die größten Tabellen */
const TABELLEN_NAME: Record<string, string> = {
  topic_items: "Chat-Nachrichten",
  topic_reaktionen: "Reaktionen im Chat",
  topic_votes: "Abstimmungen im Chat",
  topics: "Chats",
  audit_log: "Protokoll",
  spotify_titel: "Spotify-Titel",
  daten_snapshots: "Tägliche Sicherungen",
  runden_stimmen: "Stimmen (Runden)",
  zitat_stimmen: "Stimmen (Zitate)",
  motto_stimmen: "Stimmen (Motto)",
  push_subscriptions: "Benachrichtigungs-Abos",
  students: "Schülerliste",
  profiles: "Konten",
  contributions: "Beiträge",
  zitate: "Zitate",
  events: "Events",
};

function mb(bytes: number): string {
  const wert = bytes / MB;
  return `${wert.toLocaleString("de-DE", { maximumFractionDigits: wert < 10 ? 1 : 0 })} MB`;
}

/** Große Zahl grob runden: 943 112 → „940.000“ (genauer ist die Schätzung ohnehin nicht) */
function grob(n: number): string {
  if (n < 1000) return n.toLocaleString("de-DE");
  const stellen = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
  return (Math.round(n / stellen) * stellen).toLocaleString("de-DE");
}

/**
 * Speicher & automatisches Löschen (nur Admin bzw. „Rechte verwalten“).
 *
 * Update 1.4: Ganz oben steht jetzt, wie voll die Datenbank wirklich ist
 * (speicher_stand(), supabase/speicherwaechter.sql) – damit klar ist, dass
 * Chats NICHT gelöscht werden müssen. Für den Notfall gibt es den
 * Speicherwächter: Erst wenn die Daten über die Schwelle steigen (Standard
 * 80 % von 500 MB), räumt er nachts die ältesten Chat-Nachrichten auf, bis
 * wieder Luft ist. Die festen Fristen bleiben als Option darunter;
 * Chat-Standard bleibt „Nie“.
 */
export function LoeschfristenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chat, setChat] = useState<number | null>(null);
  const [antraege, setAntraege] = useState<number | null>(null);
  const [protokoll, setProtokoll] = useState<number | null>(null);
  const [bereit, setBereit] = useState(false);
  const [stand, setStand] = useState<SpeicherStand | null>(null);
  const [standFehler, setStandFehler] = useState("");
  const [tabellenOffen, setTabellenOffen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!hasSupabase) {
      setStand(DEMO_STAND);
      setBereit(true);
      return;
    }
    let aktiv = true;
    void supabase!
      .from("app_settings")
      .select("loeschen_chat_tage, loeschen_antraege_tage, loeschen_protokoll_tage")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!aktiv) return;
        const d = data as {
          loeschen_chat_tage?: number | null;
          loeschen_antraege_tage?: number | null;
          loeschen_protokoll_tage?: number | null;
        } | null;
        setChat(d?.loeschen_chat_tage ?? null);
        setAntraege(d?.loeschen_antraege_tage ?? null);
        setProtokoll(d?.loeschen_protokoll_tage ?? null);
        setBereit(true);
      });
    setStandFehler("");
    void supabase!.rpc("speicher_stand").then(({ data, error }) => {
      if (!aktiv) return;
      if (error) {
        // Ältere Datenbank ohne speicherwaechter.sql: Anzeige fehlt, Rest geht
        setStandFehler(
          /speicher_stand|function/i.test(error.message) ? "Speicher-Anzeige noch nicht eingerichtet." : "Speicher-Anzeige gerade nicht verfügbar.",
        );
        return;
      }
      setStand(data as SpeicherStand);
    });
    return () => {
      aktiv = false;
    };
  }, [open]);

  async function speichern(c: number | null, a: number | null, p: number | null) {
    setChat(c);
    setAntraege(a);
    setProtokoll(p);
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("loeschfristen_setzen", { p_chat: c, p_antraege: a, p_protokoll: p });
    if (error) meldeFehler("Speichern ging nicht: " + error.message);
    else melde("Gespeichert", "erfolg");
  }

  async function schwelleSetzen(w: number | null) {
    if (!stand) return;
    const vorher = stand;
    setStand({ ...stand, notfall_prozent: w, ziel_prozent: w ? w - 10 : stand.ziel_prozent });
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("speicher_einstellen", { p_notfall: w });
    if (error) {
      setStand(vorher);
      meldeFehler("Speichern ging nicht: " + error.message);
    } else melde("Gespeichert", "erfolg");
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div>
        <SheetKopf titel="Speicher & Löschen" unter="Gilt für alle. Nur Admin bzw. „Rechte verwalten“." onClose={onClose} />

        <SpeicherKarte stand={stand} fehler={standFehler} />

        {/* Die eigentliche Antwort auf „Muss ich Chats löschen?“ */}
        <p className="mt-2 px-4 text-[13px] leading-snug text-tinte-leise">
          Chats musst du nicht löschen – der Platz reicht für die ganze Oberstufe. Spam bremst die automatische Sperre.
          Wird es trotzdem einmal eng, springt der Speicherwächter ein.
        </p>

        {stand && (
          <Gruppe
            className="mt-6"
            titel="Speicherwächter"
            fuss={
              <>
                {stand.notfall_prozent
                  ? `Erst wenn die Datenbank zu ${stand.notfall_prozent} % voll ist, löscht er nachts die ältesten Chat-Nachrichten, bis sie wieder unter ${stand.ziel_prozent} % liegt. Angepinntes, Abstimmungen, To-dos und die letzten 7 Tage bleiben immer.`
                  : "Aus: Es wird nie wegen Platzmangel gelöscht. Bei 500 MB wäre die Datenbank voll."}
                {!stand.waechter_scharf && stand.notfall_prozent ? " Noch nicht scharf – der Datenbank-Teil zum Löschen fehlt noch." : ""}
                {stand.zuletzt?.at
                  ? ` Zuletzt eingegriffen am ${new Date(stand.zuletzt.at).toLocaleDateString("de-DE")}: ${stand.zuletzt.nachrichten.toLocaleString("de-DE")} Nachrichten.`
                  : ""}
              </>
            }
          >
            <div className="flex min-h-[48px] items-center gap-3 px-4 py-2">
              <span className="shrink-0 text-[15px]">Aufräumen</span>
              <div className="seg ml-auto w-[13.5rem] max-w-[65%]" role="radiogroup" aria-label="Notfall-Aufräumen">
                {SCHWELLEN.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    role="radio"
                    aria-checked={stand.notfall_prozent === s.wert}
                    onClick={() => void schwelleSetzen(s.wert)}
                    className={`seg-item !px-1 ${stand.notfall_prozent === s.wert ? "seg-aktiv" : ""}`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
            {stand.tabellen.length > 0 && (
              <button
                type="button"
                onClick={() => setTabellenOffen((o) => !o)}
                aria-expanded={tabellenOffen}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1">Was braucht Platz?</span>
                <span
                  aria-hidden
                  className={`text-[17px] leading-none text-tinte-leise transition duration-200 ease-ios ${tabellenOffen ? "rotate-90" : ""}`}
                >
                  ›
                </span>
              </button>
            )}
            {tabellenOffen &&
              stand.tabellen.map((t) => (
                <div key={t.name} className="flex min-h-[44px] animate-fadeIn items-center gap-3 px-4 py-2 text-[15px]">
                  <span className="min-w-0 flex-1 truncate">{TABELLEN_NAME[t.name] ?? t.name}</span>
                  <span className="zahl shrink-0 text-tinte-matt dark:text-slate-300">{mb(t.bytes)}</span>
                </div>
              ))}
          </Gruppe>
        )}

        <h3 className="mt-8 px-4 text-[17px] font-semibold tracking-[-0.01em]">Automatisch löschen</h3>
        <p className="mt-0.5 px-4 text-[13px] leading-snug text-tinte-leise">
          Optional und unabhängig vom Speicher: jede Nacht, für alle. Gelöschtes ist weg.
        </p>

        <Gruppe titel="Chat-Nachrichten" fuss="Angepinntes, Abstimmungen und To-dos bleiben. Empfohlen: Nie.">
          <Auswahl wert={chat} bereit={bereit} onWahl={(t) => void speichern(t, antraege, protokoll)} />
        </Gruppe>

        <Gruppe titel="Bearbeitete Anträge" fuss="Offene Anträge und Kassenbuch bleiben.">
          <Auswahl wert={antraege} bereit={bereit} onWahl={(t) => void speichern(chat, t, protokoll)} />
        </Gruppe>

        <Gruppe titel="Protokoll" fuss="Bei „Nie“ nach 2 Jahren.">
          <Auswahl wert={protokoll} bereit={bereit} onWahl={(t) => void speichern(chat, antraege, t)} />
        </Gruppe>
      </div>
    </Sheet>
  );
}

/**
 * Speicher-Anzeige: große Zahl, Balken mit Markierung der Notfall-Schwelle,
 * darunter eine verständliche Übersetzung („Platz für rund 940.000 weitere
 * Nachrichten“). Farbe wie bei der iPhone-Speicheranzeige: grün, ab 60 %
 * orange, ab 80 % rot.
 */
function SpeicherKarte({ stand, fehler }: { stand: SpeicherStand | null; fehler: string }) {
  if (!stand)
    return (
      <div className="gruppe-zellen px-4 py-4">
        <div className="text-[13px] text-tinte-leise">{fehler || "Speicher wird geprüft …"}</div>
        {!fehler && <div className="mt-3 h-2 animate-pulse rounded-full bg-[rgb(118_118_128/0.16)]" />}
      </div>
    );

  const prozent = Math.min(100, (stand.db_bytes / stand.grenze_bytes) * 100);
  const farbe = prozent >= 80 ? "bg-[#FF3B30]" : prozent >= 60 ? "bg-[#FF9500]" : "bg-[#34C759]";
  const dateiProzent = Math.min(100, (stand.dateien_bytes / (1024 * MB)) * 100);

  return (
    <section className="gruppe-zellen">
      <div className="px-4 pb-4 pt-3.5">
        <div className="text-[13px] font-semibold text-tinte-leise">Datenbank</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="zahl text-[28px] font-bold leading-tight tracking-[-0.02em]">{mb(stand.db_bytes)}</span>
          <span className="text-[15px] text-tinte-matt dark:text-slate-300">von {mb(stand.grenze_bytes)}</span>
        </div>

        <div
          className="relative mt-3 h-2 overflow-hidden rounded-full bg-[rgb(118_118_128/0.16)] dark:bg-[rgb(118_118_128/0.32)]"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(prozent)}
          aria-label="Belegter Speicher"
        >
          <div className={`h-full rounded-full ${farbe} transition-[width] duration-700 ease-ios`} style={{ width: `${Math.max(prozent, 1.5)}%` }} />
          {stand.notfall_prozent && (
            <div aria-hidden className="absolute inset-y-0 w-[2px] bg-tinte-leise/50" style={{ left: `${stand.notfall_prozent}%` }} />
          )}
        </div>

        <p className="mt-2.5 text-[14px] leading-snug text-tinte-matt dark:text-slate-300">
          <span className="zahl font-semibold text-tinte dark:text-slate-100">{Math.round(prozent)} % belegt</span> · Platz für rund{" "}
          <span className="zahl font-semibold text-tinte dark:text-slate-100">{grob(stand.platz_nachrichten)}</span> weitere Nachrichten
        </p>
      </div>
      <div className="flex min-h-[48px] items-center gap-3 px-4 py-2 text-[15px]">
        <span className="min-w-0 flex-1">Bilder &amp; Dateien</span>
        <span className="zahl shrink-0 text-tinte-matt dark:text-slate-300">
          {mb(stand.dateien_bytes)} von 1 GB{dateiProzent >= 1 ? ` · ${Math.round(dateiProzent)} %` : ""}
        </span>
      </div>
    </section>
  );
}

/** Frist als Segmente (wie in iOS), statt einzelner Knöpfe. */
function Auswahl({ wert, bereit, onWahl }: { wert: number | null; bereit: boolean; onWahl: (t: number | null) => void }) {
  return (
    <div className="px-3 py-2.5">
      <div className="seg" role="radiogroup">
        {WAHL.map((w) => {
          const an = bereit && wert === w.tage;
          return (
            <button
              key={w.text}
              type="button"
              role="radio"
              disabled={!bereit}
              onClick={() => onWahl(w.tage)}
              aria-checked={an}
              className={`seg-item !px-1 disabled:opacity-40 ${an ? "seg-aktiv" : ""}`}
            >
              {w.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
