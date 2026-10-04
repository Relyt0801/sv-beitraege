import { useState } from "react";

/**
 * Lieblingslied im Steckbrief: Steht dort ein Spotify-Link, gibt es einen
 * Abspielknopf. Der Spotify-Player wird erst nach dem Tippen geladen
 * (2-Klick-Lösung) – vorher geht nichts an Spotify (DSGVO).
 * Ohne Spotify-Konto spielt der Player eine Hörprobe, mit Konto im selben
 * Browser das ganze Lied.
 */
const MUSTER = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?|spotify:)(track|album|playlist|episode)[/:]([A-Za-z0-9]{10,40})/;

export function spotifyAus(text: string): { art: string; id: string } | null {
  const m = text.match(MUSTER);
  return m ? { art: m[1], id: m[2] } : null;
}

/** Text ohne den Link (z. B. „Mr. Brightside – The Killers“ vor dem Link) */
export function ohneLink(text: string): string {
  return text.replace(/https?:\/\/\S+|spotify:\S+/g, "").replace(/\s+/g, " ").trim();
}

export function SpotifyKnopf({ wert, klein }: { wert: string; klein?: boolean }) {
  const s = spotifyAus(wert);
  const [an, setAn] = useState(false);
  if (!s) return null;
  if (an)
    return (
      <iframe
        title="Spotify"
        src={`https://open.spotify.com/embed/${s.art}/${s.id}?utm_source=generator`}
        className="mt-2 w-full rounded-xl border-0"
        height={s.art === "track" || s.art === "episode" ? 80 : 152}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  return (
    <button
      type="button"
      onClick={() => setAn(true)}
      className={`mt-2 inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-3.5 py-1.5 font-semibold text-black transition active:scale-95 ${klein ? "text-[12.5px]" : "text-[13.5px]"}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="currentColor" d="M8 5.5v13l11-6.5z" />
      </svg>
      Auf Spotify abspielen
    </button>
  );
}
