import { FUNKTIONEN, useFunktionen, type FunktionKey } from "../lib/funktionen";

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
