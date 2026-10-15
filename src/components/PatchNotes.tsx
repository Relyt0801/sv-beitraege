import { PATCH, patchFuer } from "../lib/patchnotes";
import { Icon, type IconName } from "./Icon";

/**
 * „Neu in Version …“ – wie Apples Neuigkeiten-Bildschirm nach einem Update:
 * großer Titel, je Neuerung ein farbiges Symbol mit fettem Titel und einem
 * Satz, unten ein Knopf. Kommt einmal pro Version (siehe App.tsx). Ausführlich
 * steht alles in docs/AENDERUNGEN.md.
 *
 * Ältere Einträge ohne Titel/Symbol erscheinen als schlichte Zeile.
 * Ist die Liste länger als der Bildschirm, scrollt nur die Liste – Titel und
 * Knopf bleiben stehen.
 */
export function PatchNotes({ team, onFertig }: { team: boolean; onFertig: () => void }) {
  const bereiche = patchFuer(team);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="patch-titel"
      className="fixed inset-0 z-[90] flex animate-fadeIn items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6"
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-sm animate-sheetIn flex-col rounded-t-[1.75rem] bg-papier px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-7 shadow-2xl dark:bg-slate-900 sm:animate-popIn sm:rounded-[1.75rem] sm:pb-5">
        <h2 id="patch-titel" className="text-center text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">
          Neu in Version {PATCH.version}
        </h2>
        <p className="mt-1 text-center text-[13px] text-tinte-leise">{PATCH.datum}</p>

        <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
          {bereiche.map((b, bi) => (
            <section key={b.bereich} className={bi === 0 ? "" : "mt-5"}>
              {/* Überschrift nur, wenn es mehrere Bereiche gibt (Team) */}
              {bereiche.length > 1 && (
                <h3 className="mb-2 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">{b.bereich}</h3>
              )}
              <ul className="grid gap-3.5">
                {b.eintraege.map((e, i) => (
                  <li key={i} className="flex animate-aufsteigen items-start gap-3.5" style={{ animationDelay: `${80 + (bi * 6 + i) * 45}ms` }}>
                    {e.icon ? (
                      <span aria-hidden className={`symbol mt-0.5 !h-9 !w-9 !rounded-[10px] ${e.farbe || "bg-brand"}`}>
                        <Icon name={e.icon as IconName} size={19} strich={2.2} />
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      {e.titel && <span className="block text-[15px] font-semibold leading-snug">{e.titel}</span>}
                      <span className={`block leading-snug ${e.titel ? "text-[13.5px] text-tinte-matt dark:text-slate-300" : "text-[14.5px]"}`}>
                        {e.text}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <button className="btn-primary mt-5 w-full shrink-0" onClick={onFertig}>
          Weiter
        </button>
      </div>
    </div>
  );
}
