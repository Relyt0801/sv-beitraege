import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from "react";
import {
  TEIL_INFO,
  TEIL_NAME,
  useTeileSchalten,
  useVerschiebenNoetig,
  verschiebenFrage,
  verschiebenSofort,
  type Teil,
  type TeilBereich,
} from "../lib/teile";
import { useRole } from "../auth/RoleProvider";
import { frage } from "../lib/melder";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileMitSchalter } from "./Liste";
import { Icon } from "./Icon";
import { Schalter } from "./Schalter";

/**
 * Umschalter Offiziell ↔ Inoffiziell – überall gleich (Rankings, Zitate,
 * Motto, Kommentare). Zwei große Hälften mit eigenem Symbol und eigener
 * Farbe, daneben ein kleines Info-Symbol: Es erklärt je Bereich, was davon
 * gedruckt werden kann (Abizeitung, Pullis …) und was in der Stufe bleibt.
 * Vorher stand die Erklärung als Satz darunter – das kostete Platz und
 * sagte nicht, worum es im jeweiligen Bereich konkret geht.
 *
 *   Offiziell    Blau, Siegel – „kann gedruckt werden“
 *   Inoffiziell  Violett, Schloss – „nur für die Stufe“
 *
 * Ist ein Bereich nicht aufgeteilt (Einstellungen des Bereichs), zeigt die
 * App den Umschalter gar nicht (die Aufrufer fragen useTeil/useAufgeteilt).
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
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
 * Kommentare gleich: nach inoffiziell reicht eine Stimme (sofort), nach
 * offiziell nennt sie die Zahl der nötigen Zustimmungen („du zählst schon
 * mit“) und den Ort des Antrags (Chats → Anfragen). Allein reicht – wie in
 * der Datenbank (zustimmung_allein) – nur der Owner. Liefert true, wenn
 * beantragt werden soll.
 *   const verschieben = useVerschiebenRueckfrage();
 *   if (await verschieben("offiziell", "Mein Motto")) …
 */
export function useVerschiebenRueckfrage() {
  const noetig = useVerschiebenNoetig();
  const { isOp } = useRole();
  return useCallback(
    (nach: Teil, titel?: string): Promise<boolean> =>
      frage(verschiebenFrage(nach, noetig, isOp, titel), verschiebenSofort(nach, noetig, isOp) ? "Verschieben" : "Beantragen"),
    [noetig, isOp],
  );
}

/**
 * Info-Symbol (i) – öffnet ein kleines Blatt: was im Bereich offiziell bzw.
 * inoffiziell bedeutet und wie Verschieben geht. 44 px Tippfläche.
 */
export function TeilInfo({ bereich, className = "" }: { bereich: TeilBereich; className?: string }) {
  const [auf, setAuf] = useState(false);
  const noetig = useVerschiebenNoetig();
  const info = TEIL_INFO[bereich];
  return (
    <>
      <button
        type="button"
        onClick={() => setAuf(true)}
        aria-label={`Was heißt offiziell und inoffiziell bei ${info.titel}?`}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:scale-90 ${className}`}
      >
        <Icon name="info" size={20} strich={2} />
      </button>
      <Sheet open={auf} onClose={() => setAuf(false)}>
        <SheetKopf titel={`${info.titel}: offiziell & inoffiziell`} onClose={() => setAuf(false)} />
        <Gruppe className="">
          {(["offiziell", "inoffiziell"] as Teil[]).map((t) => (
            <div key={t} className="flex gap-3 px-4 py-3">
              <span className={`mt-0.5 shrink-0 ${TEIL_FARBE[t].text}`}>
                <Symbol teil={t} size={20} />
              </span>
              <span className="min-w-0">
                <span className={`block text-[15px] font-semibold ${TEIL_FARBE[t].text}`}>{TEIL_NAME[t]}</span>
                <span className="block text-[14px] leading-snug text-tinte-matt dark:text-slate-300">{info[t]}</span>
              </span>
            </div>
          ))}
        </Gruppe>
        <Gruppe titel="Verschieben">
          <Zeile label="Nach inoffiziell">
            <span className="text-[15px] text-tinte-leise">1 Stimme</span>
          </Zeile>
          <Zeile label="Nach offiziell">
            <span className="text-[15px] text-tinte-leise">
              {noetig} {noetig === 1 ? "Zustimmung" : "Zustimmungen"}
            </span>
          </Zeile>
        </Gruppe>
      </Sheet>
    </>
  );
}

/**
 * Schalter „Offiziell & Inoffiziell trennen“ – steht in den Einstellungen
 * jedes Bereichs ganz oben (klarer, fester Ort). Ohne Recht: nur der Stand.
 */
export function TeileSchalterZeile({ bereich, an }: { bereich: TeilBereich; an: boolean }) {
  const { darf, setzen } = useTeileSchalten();
  const ok = darf(bereich);
  return (
    <ZeileMitSchalter label="Offiziell & Inoffiziell trennen">
      {ok ? (
        <Schalter
          an={an}
          label="Offiziell & Inoffiziell trennen"
          onChange={(v) => {
            if (v) return void setzen(bereich, true);
            void frage(
              "Trennung ausschalten? Dann gibt es nur noch einen gemeinsamen Bereich – nichts wird gelöscht, schaltet man wieder an, liegt alles im alten Teil.",
              "Ausschalten",
            ).then((ja) => ja && void setzen(bereich, false));
          }}
        />
      ) : (
        <span className="text-[15px] text-tinte-leise">{an ? "An" : "Aus"}</span>
      )}
    </ZeileMitSchalter>
  );
}

export function TeilUmschalter({
  bereich,
  teil,
  setTeil,
  zahlen,
  className = "",
}: {
  bereich: TeilBereich;
  teil: Teil;
  setTeil: (t: Teil) => void;
  /** optional: Anzahl Einträge je Teil */
  zahlen?: Partial<Record<Teil, number>>;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="relative grid min-w-0 flex-1 grid-cols-2 rounded-[0.9rem] bg-[rgb(118_118_128/0.12)] p-[3px] dark:bg-[rgb(118_118_128/0.24)]" role="tablist" aria-label="Teil wählen">
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
      <TeilInfo bereich={bereich} className="-mr-2" />
    </div>
  );
}

/**
 * Inhalt, den man seitlich wischen kann: nach links → Inoffiziell,
 * nach rechts → Offiziell. Der Inhalt folgt dem Finger gedämpft und
 * gleitet beim Wechsel von der passenden Seite herein. Ohne Aufteilung
 * (aus = true) ist er nur eine Hülle.
 */
export function TeilWischer({ teil, setTeil, children, aus }: { teil: Teil; setTeil: (t: Teil) => void; children: ReactNode; aus?: boolean }) {
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

  if (aus) return <>{children}</>;
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
