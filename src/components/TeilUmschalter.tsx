import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { TEIL_ERKLAERUNG, TEIL_NAME, useVerschiebenNoetig, verschiebenFrage, type Teil } from "../lib/teile";
import { useRole } from "../auth/RoleProvider";
import { frage } from "../lib/melder";

/**
 * Umschalter Offiziell ↔ Inoffiziell – überall gleich (Rankings, Zitate,
 * Motto, Kommentare). Zwei große Hälften mit eigenem Symbol und eigener
 * Farbe, darunter in einem Satz, was der gewählte Teil bedeutet.
 *
 *   Offiziell    Blau, Siegel – „kommt ins Abibuch“
 *   Inoffiziell  Violett, Schloss – „nur für die Stufe“
 *
 * Dazu TeilWischer: Inhalt mit dem Finger seitlich wischen wechselt den Teil.
 */
export const TEIL_FARBE: Record<Teil, { text: string; grund: string; punkt: string }> = {
  offiziell: { text: "text-[#0066CC] dark:text-[#64B5FF]", grund: "bg-[#0A84FF]/10 dark:bg-[#0A84FF]/18", punkt: "bg-[#0A84FF]" },
  inoffiziell: { text: "text-[#8E44C8] dark:text-[#D29BFF]", grund: "bg-[#AF52DE]/10 dark:bg-[#BF5AF2]/18", punkt: "bg-[#AF52DE]" },
};

function Symbol({ teil, size = 16 }: { teil: Teil; size?: number }) {
  // Siegel (offiziell) bzw. Schloss (inoffiziell), als Linien wie die übrigen Symbole
  return teil === "offiziell" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.8l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.9 2.6-2.7-.2L12 21.2l-2.2-1.6-2.7.2-.9-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.9-2.6 2.7.2z" />
      <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function TeilSymbol({ teil, size }: { teil: Teil; size?: number }) {
  return <Symbol teil={teil} size={size} />;
}

/** Kleine Marke „Offiziell“/„Inoffiziell“ für Listen und Karten */
export function TeilMarke({ teil, hell }: { teil: Teil; hell?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
        hell ? "bg-white/20 text-white" : `${TEIL_FARBE[teil].grund} ${TEIL_FARBE[teil].text}`
      }`}
    >
      <Symbol teil={teil} size={12} />
      {TEIL_NAME[teil]}
    </span>
  );
}

/**
 * Rückfrage vor einem Verschiebe-Antrag – für Motto, Zitate, Rankings und
 * Kommentare gleich: nennt die Zahl der nötigen Zustimmungen („du zählst
 * schon mit“), den Ort des Antrags (Chats → Anfragen) und für Admins, dass
 * ihre Zustimmung allein reicht. Liefert true, wenn beantragt werden soll.
 *   const verschieben = useVerschiebenRueckfrage();
 *   if (await verschieben("offiziell", "Mein Motto")) …
 */
export function useVerschiebenRueckfrage() {
  const noetig = useVerschiebenNoetig();
  const { isAdmin } = useRole();
  return useCallback(
    (nach: Teil, titel?: string): Promise<boolean> =>
      frage(verschiebenFrage(nach, noetig, isAdmin, titel), isAdmin || noetig <= 1 ? "Verschieben" : "Beantragen"),
    [noetig, isAdmin],
  );
}

export function TeilUmschalter({
  teil,
  setTeil,
  zahlen,
  className = "",
  ohneErklaerung,
}: {
  teil: Teil;
  setTeil: (t: Teil) => void;
  /** optional: Anzahl Einträge je Teil */
  zahlen?: Partial<Record<Teil, number>>;
  className?: string;
  ohneErklaerung?: boolean;
}) {
  return (
    <div className={className}>
      <div className="relative grid grid-cols-2 rounded-[0.9rem] bg-[rgb(118_118_128/0.12)] p-[3px] dark:bg-[rgb(118_118_128/0.24)]" role="tablist" aria-label="Teil wählen">
        {/* gleitende Fläche unter dem gewählten Teil */}
        <span
          aria-hidden
          className="absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-[0.75rem] bg-white shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)] transition-transform duration-500 ease-ios dark:bg-slate-600"
          style={{ transform: teil === "inoffiziell" ? "translateX(100%)" : "none" }}
        />
        {(["offiziell", "inoffiziell"] as Teil[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={teil === t}
            onClick={() => setTeil(t)}
            className={`relative z-[1] flex min-w-0 items-center justify-center gap-1.5 rounded-[0.75rem] px-2 py-2 text-[14px] font-semibold transition-colors duration-300 ${
              teil === t ? TEIL_FARBE[t].text : "text-tinte-matt dark:text-slate-300"
            }`}
          >
            <Symbol teil={t} />
            <span className="truncate">{TEIL_NAME[t]}</span>
            {zahlen?.[t] != null && <span className="zahl text-[12px] font-medium opacity-70">{zahlen[t]}</span>}
          </button>
        ))}
      </div>
      {!ohneErklaerung && (
        <p key={teil} className="mt-1.5 animate-fadeIn px-1 text-[12.5px] leading-snug text-tinte-leise">
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full align-middle ${TEIL_FARBE[teil].punkt}`} />
          {TEIL_ERKLAERUNG[teil]}
        </p>
      )}
    </div>
  );
}

/**
 * Inhalt, den man seitlich wischen kann: nach links → Inoffiziell,
 * nach rechts → Offiziell. Der Inhalt folgt dem Finger gedämpft und
 * gleitet beim Wechsel von der passenden Seite herein.
 */
export function TeilWischer({ teil, setTeil, children }: { teil: Teil; setTeil: (t: Teil) => void; children: ReactNode }) {
  const start = useRef<{ x: number; y: number; waagerecht: boolean | null } | null>(null);
  const [zug, setZug] = useState(0);
  const [richtung, setRichtung] = useState<0 | 1 | -1>(0);

  const handler = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, waagerecht: null };
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.waagerecht === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.waagerecht = Math.abs(dx) > Math.abs(dy) * 1.4;
      if (!s.waagerecht) return;
      // Am Rand (Offiziell nach rechts, Inoffiziell nach links) nur leicht nachgeben
      const randwärts = (teil === "offiziell" && dx > 0) || (teil === "inoffiziell" && dx < 0);
      setZug(Math.max(-110, Math.min(110, dx * (randwärts ? 0.15 : 0.5))));
    },
    onTouchEnd: () => {
      const s = start.current;
      start.current = null;
      const z = zug;
      setZug(0);
      if (!s?.waagerecht) return;
      if (z < -40 && teil === "offiziell") {
        setRichtung(1);
        setTeil("inoffiziell");
      } else if (z > 40 && teil === "inoffiziell") {
        setRichtung(-1);
        setTeil("offiziell");
      }
    },
  };

  return (
    <div {...handler} className="touch-pan-y">
      <div
        key={teil}
        className={richtung === 1 ? "animate-vonRechts" : richtung === -1 ? "animate-vonLinks" : ""}
        style={{ transform: zug ? `translateX(${zug}px)` : undefined, transition: zug ? "none" : "transform 300ms cubic-bezier(.32,.72,0,1)" }}
      >
        {children}
      </div>
    </div>
  );
}
