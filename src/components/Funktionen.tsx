import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { FUNKTIONEN, useFunktionen, type FunktionKey } from "../lib/funktionen";
import { melde, meldeFehler } from "../lib/melder";

/** Profil → Funktionen: ganze Bereiche für alle an- oder ausschalten. */
export function FunktionenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { an, setzen } = useFunktionen();
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Funktionen" unter="Schaltet Bereiche für alle an oder aus. Wer darin was darf, steht unter Rollen & Rechte." onClose={onClose} />
      <div className="space-y-2.5">
        {FUNKTIONEN.map((f) => (
          <label
            key={f.key}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition ${
              an[f.key] ? "bg-[#34C759]/10 dark:bg-[#30D158]/15" : "bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]"
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[20px] shadow-sm dark:bg-slate-800">{f.zeichen}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{f.titel}</span>
              <span className="block text-[12.5px] leading-snug text-tinte-leise">{f.text}</span>
            </span>
            <Schalter
              an={an[f.key]}
              label={f.titel}
              onChange={async (v) => {
                const fehler = await setzen(f.key, v);
                if (fehler) meldeFehler("Ging nicht: " + fehler);
                else melde(`${f.titel} ${v ? "an" : "aus"}`, "erfolg");
              }}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 px-1 text-[12px] leading-snug text-tinte-leise">
        Ausgeschaltetes siehst nur du (mit Hinweis), damit ihr vorbereiten könnt, bevor es alle sehen.
      </p>
    </Sheet>
  );
}

/** Kleiner Hinweis über einem Bereich, der für alle anderen gerade aus ist. */
export function AusHinweis({ funktion, className = "" }: { funktion: FunktionKey; className?: string }) {
  const { an } = useFunktionen();
  if (an[funktion]) return null;
  const f = FUNKTIONEN.find((x) => x.key === funktion)!;
  return (
    <div className={`flex items-center gap-1.5 text-[12px] font-semibold text-tinte-leise ${className}`}>
      <span className="rounded-full bg-[rgb(118_118_128/0.14)] px-2 py-0.5">Aus</span>
      {f.titel} ist ausgeschaltet – nur du siehst das.
    </div>
  );
}
