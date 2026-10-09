import { PATCH, patchFuer } from "../lib/patchnotes";

/**
 * „Neu in Version …“ – bewusst knapp: eine kleine Karte mit einer Zeile je
 * Neuerung und einem Knopf. Kommt einmal pro Version. Ausführlich steht alles
 * in docs/AENDERUNGEN.md.
 */
export function PatchNotes({ team, onFertig }: { team: boolean; onFertig: () => void }) {
  const punkte = patchFuer(team).flatMap((b) => b.eintraege);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-titel"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 backdrop-blur-[2px] animate-fadeIn sm:items-center sm:p-6"
    >
      <div className="relative w-full max-w-sm animate-sheetIn rounded-t-[1.75rem] bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-6 shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.75rem] sm:pb-5">
        <h2 id="patch-titel" className="text-[1.25rem] font-bold tracking-[-0.01em]">
          Neu in Version {PATCH.version}
        </h2>
        <ul className="mt-3 grid gap-2">
          {punkte.map((e, i) => (
            <li key={i} className="text-[14.5px] leading-snug text-tinte-matt dark:text-slate-300">
              {e.text}
            </li>
          ))}
        </ul>
        <button className="btn-primary mt-5 w-full" onClick={onFertig}>
          Weiter
        </button>
      </div>
    </div>
  );
}
