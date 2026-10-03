import { PATCH, patchFuer } from "../lib/patchnotes";

/**
 * „Neu in der Stufenkasse“ – ganzseitig wie die „Neue Funktionen“-Seite bei
 * Apple: oben groß die Version, darunter je Reiter nummerierte Punkte
 * (1.1, 1.2 …), unten ein Knopf. Kommt einmal pro Version.
 */
export function PatchNotes({ team, onFertig }: { team: boolean; onFertig: () => void }) {
  const bereiche = patchFuer(team);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-titel"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 backdrop-blur-[2px] animate-fadeIn sm:items-center sm:p-6"
    >
      <div className="relative flex max-h-[94dvh] w-full max-w-lg animate-sheetIn flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.75rem]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-8">
          <div className="text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-indigo-500 text-3xl shadow-sm">
              ✨
            </span>
            <h2 id="patch-titel" className="mt-3 text-[1.6rem] font-extrabold tracking-[-0.02em]">
              Neu in Version {PATCH.version}
            </h2>
            <p className="mt-0.5 text-[13px] text-tinte-leise">{PATCH.datum}</p>
          </div>

          <div className="mt-6 grid gap-5">
            {bereiche.map((b, i) => (
              <section key={b.bereich}>
                <h3 className="mb-2 flex items-center gap-2 text-[15px] font-bold">
                  <span aria-hidden>{b.icon}</span>
                  {i + 1}. {b.bereich}
                </h3>
                <ol className="grid gap-2">
                  {b.eintraege.map((e, j) => (
                    <li key={j} className="flex gap-2.5 text-[14px] leading-relaxed">
                      <span className="zahl w-7 shrink-0 pt-px text-[12.5px] font-bold text-brand">
                        {i + 1}.{j + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-tinte-matt dark:text-slate-300">{e.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
        <div className="border-t border-papier-linie px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 dark:border-slate-800">
          <button className="btn-primary w-full" onClick={onFertig}>
            Weiter
          </button>
        </div>
      </div>
    </div>
  );
}
