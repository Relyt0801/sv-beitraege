import { useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { useFunktionen } from "../lib/funktionen";

/**
 * Spotify im Steckbrief (Funktion „spotify“, Profil → Funktionen).
 *
 * Steht in einem Feld ein Spotify-Link, zeigen wir eine Karte mit Cover,
 * Titel und Künstler. Die Infos holt die Edge Function spotify-info
 * serverseitig (supabase/functions/spotify-info) – beim Ansehen geht also
 * nichts an Spotify. Erst „Abspielen“ lädt die 30-Sekunden-Hörprobe.
 * Das ganze Lied gibt es über „In Spotify öffnen“ (mit eigenem Spotify-Konto
 * in der Spotify-App).
 */
const MUSTER = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?|spotify:)(track|album|playlist|episode)[/:]([A-Za-z0-9]{10,40})/;

export function spotifyAus(text: string): { art: string; id: string } | null {
  const m = (text || "").match(MUSTER);
  return m ? { art: m[1], id: m[2] } : null;
}

/** Text ohne den Link (z. B. „Mr. Brightside – The Killers“ vor dem Link) */
export function ohneLink(text: string): string {
  return text.replace(/https?:\/\/\S+|spotify:\S+/g, "").replace(/\s+/g, " ").trim();
}

interface Info {
  titel: string;
  kuenstler: string;
  cover: string;
  vorschau: string;
}

// Einmal je Lied laden, auch wenn es mehrfach angezeigt wird
const zwischenspeicher = new Map<string, Promise<Info | null>>();
function infoLaden(art: string, id: string): Promise<Info | null> {
  const k = `${art}:${id}`;
  if (!zwischenspeicher.has(k)) {
    const p = !hasSupabase
      ? Promise.resolve<Info | null>({ titel: "Lied auf Spotify", kuenstler: "Demo", cover: "", vorschau: "" })
      : supabase!.functions
          .invoke("spotify-info", { body: { url: `https://open.spotify.com/${art}/${id}` } })
          .then(({ data, error }) => (error || !data || (data as { error?: string }).error ? null : (data as Info)))
          .catch(() => null);
    zwischenspeicher.set(k, p);
  }
  return zwischenspeicher.get(k)!;
}

// Es spielt immer nur eine Hörprobe gleichzeitig
let laufend: HTMLAudioElement | null = null;

export function SpotifyKarte({ wert, fallbackTitel }: { wert: string; fallbackTitel?: string }) {
  const { an } = useFunktionen();
  const s = spotifyAus(wert);
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [spielt, setSpielt] = useState(false);
  const [anteil, setAnteil] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!s || !an.spotify) return;
    let aktiv = true;
    setInfo(undefined);
    void infoLaden(s.art, s.id).then((i) => aktiv && setInfo(i));
    return () => {
      aktiv = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.art, s?.id, an.spotify]);

  // Beim Verlassen anhalten
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  if (!s || !an.spotify) return null;
  const link = `https://open.spotify.com/${s.art}/${s.id}`;
  const titel = info?.titel || fallbackTitel || "Lied auf Spotify";
  const kuenstler = info?.kuenstler || "";

  const umschalten = () => {
    if (!info?.vorschau) {
      window.open(link, "_blank", "noopener");
      return;
    }
    if (spielt) {
      audio.current?.pause();
      return;
    }
    if (laufend && laufend !== audio.current) laufend.pause();
    if (!audio.current) {
      const a = new Audio(info.vorschau);
      a.addEventListener("timeupdate", () => setAnteil(a.duration ? a.currentTime / a.duration : 0));
      a.addEventListener("pause", () => setSpielt(false));
      a.addEventListener("play", () => setSpielt(true));
      a.addEventListener("ended", () => {
        setSpielt(false);
        setAnteil(0);
      });
      audio.current = a;
    }
    laufend = audio.current;
    void audio.current.play().catch(() => window.open(link, "_blank", "noopener"));
  };

  const r = 19;
  const umfang = 2 * Math.PI * r;

  return (
    <div className="mt-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E1E1E] to-[#0E2A1A] text-white shadow-[0_8px_22px_-12px_rgba(0,0,0,.7)]">
      <div className="flex items-center gap-3 p-2.5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/10">
          {info?.cover ? (
            <img src={info.cover} alt="" className={`h-full w-full object-cover transition duration-700 ${spielt ? "scale-105" : ""}`} />
          ) : (
            <span className={`flex h-full w-full items-center justify-center text-[26px] ${info === undefined ? "animate-pulse" : ""}`}>♪</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">{info === undefined ? "Lädt …" : titel}</div>
          {kuenstler && <div className="truncate text-[13px] text-white/65">{kuenstler}</div>}
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#1ED760]">
            {spielt ? (
              <span className="flex items-end gap-[2px]" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-[3px] animate-pulse rounded-full bg-[#1ED760]" style={{ height: [8, 11, 6][i], animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                <circle cx="12" cy="12" r="12" fill="#1ED760" />
                <path d="M6.5 9.3c3.6-1.1 7.6-.8 10.9 1M7.2 12.3c3-.9 6.2-.6 8.9.9M7.9 15.1c2.4-.6 4.8-.4 6.9.7" stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            )}
            {info?.vorschau ? (spielt ? "Hörprobe läuft" : "Hörprobe · 30 s") : "Spotify"}
          </div>
        </div>
        <button
          type="button"
          onClick={umschalten}
          aria-label={spielt ? "Anhalten" : "Hörprobe abspielen"}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-90"
        >
          <svg viewBox="0 0 44 44" className="absolute inset-0 h-12 w-12 -rotate-90" aria-hidden>
            <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="3" />
            <circle cx="22" cy="22" r={r} fill="none" stroke="#1ED760" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${anteil * umfang} ${umfang}`} />
          </svg>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1ED760] text-black">
            {spielt ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path fill="currentColor" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" aria-hidden>
                <path fill="currentColor" d="M7 4.5v15l12-7.5z" />
              </svg>
            )}
          </span>
        </button>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 border-t border-white/10 px-3.5 py-2 text-[12.5px] font-semibold text-white/85 active:bg-white/5"
      >
        <span className="truncate">Ganzes Lied in Spotify</span>
        <span className="shrink-0 whitespace-nowrap text-white/55">mit Konto ›</span>
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ Lied suchen */

interface Treffer {
  id: string;
  titel: string;
  kuenstler: string;
  cover: string;
}

const DEMO_TREFFER: Treffer[] = [
  { id: "003vvx7Niy0yvhvHt4a68B", titel: "Mr. Brightside", kuenstler: "The Killers", cover: "" },
  { id: "4u7EnebtmKWzUH433cf5Qv", titel: "Bohemian Rhapsody", kuenstler: "Queen", cover: "" },
  { id: "0VjIjW4GlUZAMYd2vXMi3b", titel: "Blinding Lights", kuenstler: "The Weeknd", cover: "" },
];

/** null = Suche in der App geht (noch) nicht – dann nur „In Spotify suchen“ */
let suchePerApp: boolean | null = hasSupabase ? null : true;

async function suchenLaden(q: string): Promise<{ treffer: Treffer[] | null; fehler?: string }> {
  if (!hasSupabase) {
    const n = q.toLowerCase();
    return { treffer: DEMO_TREFFER.filter((t) => `${t.titel} ${t.kuenstler}`.toLowerCase().includes(n)).concat(n.length > 2 ? [] : DEMO_TREFFER).slice(0, 8) };
  }
  const { data, error } = await supabase!.functions.invoke("spotify-info", { body: { suche: q } });
  const d = (data || {}) as { treffer?: Treffer[]; ohneSchluessel?: boolean; error?: string };
  if (d.ohneSchluessel) {
    suchePerApp = false;
    return { treffer: null };
  }
  if (error || d.error) return { treffer: [], fehler: d.error || "Suche ging gerade nicht" };
  suchePerApp = true;
  return { treffer: d.treffer || [] };
}

/**
 * Lied für den Steckbrief finden – ohne die App zu verlassen: Suchfeld mit
 * Treffern aus Spotify (Cover, Titel, Künstler), antippen übernimmt den Link.
 * Ist die Suche serverseitig nicht eingerichtet, öffnet „In Spotify suchen“
 * die Spotify-App mit der Suche; dort Teilen → Link kopieren, zurück in die
 * App und „Kopierten Link einfügen“ tippen.
 */
export function LiedSuche({ wert, setzen }: { wert: string; setzen: (v: string) => void }) {
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<Treffer[] | null | undefined>(undefined);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState("");
  const [perApp, setPerApp] = useState<boolean | null>(suchePerApp);
  const hatLink = Boolean(spotifyAus(wert));

  // Beim Tippen suchen (kurz warten, damit nicht jeder Buchstabe eine Anfrage ist)
  useEffect(() => {
    if (!offen || perApp === false) return;
    const text = q.trim();
    if (text.length < 2) {
      setTreffer(undefined);
      return;
    }
    let aktiv = true;
    const t = setTimeout(() => {
      setLaedt(true);
      void suchenLaden(text).then((r) => {
        if (!aktiv) return;
        setLaedt(false);
        setFehler(r.fehler || "");
        if (r.treffer === null) setPerApp(false);
        else setPerApp(true);
        setTreffer(r.treffer);
      });
    }, 350);
    return () => {
      aktiv = false;
      clearTimeout(t);
    };
  }, [q, offen, perApp]);

  function oeffnen() {
    setQ(ohneLink(wert));
    setOffen(true);
  }

  async function einfuegen() {
    try {
      const text = await navigator.clipboard.readText();
      const s = spotifyAus(text);
      if (!s) {
        setFehler("In der Zwischenablage ist kein Spotify-Link. In Spotify beim Lied: Teilen → Link kopieren.");
        return;
      }
      setzen(`${ohneLink(wert) || ""} https://open.spotify.com/${s.art}/${s.id}`.trim());
      setOffen(false);
      setFehler("");
    } catch {
      setFehler("Einfügen ging nicht – halte das Feld oben gedrückt und wähle „Einfügen“.");
    }
  }

  const spotifySuche = `https://open.spotify.com/search/${encodeURIComponent(q.trim() || ohneLink(wert))}`;
  const knopf =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95";

  if (!offen)
    return (
      <span className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={oeffnen} className={`${knopf} bg-[#1ED760] text-black`}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.4" fill="none" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          {hatLink ? "Anderes Lied suchen" : "Lied auf Spotify suchen"}
        </button>
        {hatLink && (
          <button type="button" onClick={() => setzen(ohneLink(wert))} className={`${knopf} bg-[rgb(118_118_128/0.12)] text-tinte-matt dark:text-slate-300`}>
            Lied entfernen
          </button>
        )}
      </span>
    );

  return (
    <span className="mt-2 block overflow-hidden rounded-2xl bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
      <span className="flex items-center gap-2 px-3 pt-3">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Titel oder Künstler"
          aria-label="Lied suchen"
          className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-[15px] outline-none placeholder:text-tinte-leise dark:bg-slate-800"
        />
        <button type="button" onClick={() => setOffen(false)} className="shrink-0 px-1 text-[14px] font-semibold text-brand-dark dark:text-brand">
          Fertig
        </button>
      </span>

      {perApp !== false && (
        <span className="mt-2 block">
          {laedt && treffer === undefined && <span className="block px-4 py-3 text-[13px] text-tinte-leise">Sucht …</span>}
          {treffer?.length === 0 && !laedt && <span className="block px-4 py-3 text-[13px] text-tinte-leise">Nichts gefunden.</span>}
          {treffer?.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                setzen(`${t.titel} – ${t.kuenstler} https://open.spotify.com/track/${t.id}`);
                setOffen(false);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition active:bg-black/[0.05] dark:active:bg-white/[0.06]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#1E1E1E] text-[18px] text-white">
                {t.cover ? <img src={t.cover} alt="" className="h-full w-full object-cover" /> : "♪"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{t.titel}</span>
                <span className="block truncate text-[13px] text-tinte-leise">{t.kuenstler}</span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-brand">Wählen</span>
            </button>
          ))}
        </span>
      )}

      {fehler && <span className="block px-4 pt-2 text-[12.5px] text-red-600 dark:text-red-400">{fehler}</span>}

      <span className="mt-1 flex flex-wrap items-center gap-2 border-t border-black/[0.06] px-3 py-2.5 dark:border-white/[0.08]">
        <span className="w-full text-[11.5px] leading-snug text-tinte-leise">
          {perApp === false
            ? "Öffnet Spotify mit deiner Suche. Beim Lied auf Teilen → Link kopieren, dann hier einfügen."
            : "Nicht dabei? In Spotify suchen, Link kopieren und hier einfügen."}
        </span>
        <a href={spotifySuche} target="_blank" rel="noopener noreferrer" className={`${knopf} bg-[#1E1E1E] text-white`}>
          In Spotify suchen ↗
        </a>
        <button type="button" onClick={() => void einfuegen()} className={`${knopf} bg-white text-brand-dark shadow-sm dark:bg-slate-800 dark:text-brand`}>
          Kopierten Link einfügen
        </button>
      </span>
    </span>
  );
}
