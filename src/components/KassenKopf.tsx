import { HY, type Settings, type Student } from "../lib/types";
import { basisOffen, beitragFuer, isActive, idx } from "../lib/logic";

/**
 * Wie steht die Stufenkasse da?
 *
 * Bisher sprang man direkt in die Liste mit allen Personen und musste selbst
 * zusammenzählen. Hier stehen zuerst die drei Zahlen, die das Stufenteam
 * wirklich braucht: was reingekommen ist, was noch fehlt, und wie viele durch
 * sind. Darunter je Halbjahr die Quote.
 */
export function KassenKopf({
  students,
  settings,
}: {
  students: Student[];
  settings: Settings;
}) {
  const bis = idx(settings.aktuelles_halbjahr);

  // Soll: was bis einschließlich heute fällig wäre, wenn alle dabei sind.
  // Ist: davon bezahlt. Erlassene Halbjahre zählen weder als Soll noch als offen.
  let soll = 0;
  let offen = 0;
  let fertig = 0;

  for (const s of students) {
    const eigenerOffen = basisOffen(s, settings.aktuelles_halbjahr, settings);
    offen += eigenerOffen;
    if (eigenerOffen === 0) fertig++;
    HY.forEach((h, i) => {
      if (i <= bis && isActive(s, i) && s.terms[h].status !== "erlassen") soll += beitragFuer(h, settings);
    });
  }

  const ein = Math.max(0, soll - offen);
  const quote = soll > 0 ? Math.round((ein / soll) * 100) : 100;
  const anteilFertig = students.length ? Math.round((fertig / students.length) * 100) : 0;

  // Je Halbjahr: wie viele haben bezahlt, wie viele fehlen noch
  const halbjahre = HY.map((h, i) => {
    const aktiv = students.filter((s) => isActive(s, i));
    const rest = aktiv.filter((s) => s.terms[h].status === "offen").length;
    const zaehlt = aktiv.filter((s) => s.terms[h].status !== "erlassen").length;
    const bezahlt = zaehlt - rest;
    return {
      name: h,
      preis: beitragFuer(h, settings),
      quote: zaehlt ? Math.round((bezahlt / zaehlt) * 100) : 100,
      rest,
      kommtNoch: i > bis,
      laeuft: h === settings.aktuelles_halbjahr,
    };
  });

  return (
    <div className="mx-auto mt-2.5 max-w-5xl space-y-2.5">
      {/* --------------------------------------------- drei Kennzahlen */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="card p-3.5 sm:p-4">
          <div className="kennlabel">Eingegangen</div>
          <div className="zahl mt-1.5 text-[1.75rem] font-extrabold leading-none sm:text-[2rem]">{ein} €</div>
          <div className="mt-1.5 text-[12px] text-tinte-matt">
            von <span className="zahl font-semibold">{soll} €</span> bis {settings.aktuelles_halbjahr}
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-papier-matt dark:bg-slate-800">
            <div className="h-full rounded-full bg-bezahlt" style={{ width: `${quote}%` }} />
          </div>
        </div>

        <div className="card p-3.5 sm:p-4">
          <div className="kennlabel">Noch offen</div>
          <div className="zahl mt-1.5 text-[1.75rem] font-extrabold leading-none text-offen dark:text-amber-300 sm:text-[2rem]">
            {offen} €
          </div>
          <div className="mt-1.5 text-[12px] text-tinte-matt">
            bei <span className="font-semibold">{students.length - fertig} Personen</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-papier-matt dark:bg-slate-800">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${100 - quote}%` }} />
          </div>
        </div>

        <div className="card col-span-2 p-3.5 sm:col-span-1 sm:p-4">
          <div className="kennlabel">Vollständig bezahlt</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="zahl text-[1.75rem] font-extrabold leading-none sm:text-[2rem]">{fertig}</span>
            <span className="text-[15px] font-semibold text-tinte-matt">von {students.length}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-tinte-matt">{anteilFertig} % der Stufe</div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-papier-matt dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand" style={{ width: `${anteilFertig}%` }} />
          </div>
        </div>
      </div>

      {/* --------------------------------------------- Halbjahre */}
      <div className="card p-3 sm:p-4">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-tinte-matt">Die sechs Halbjahre</h2>
          <span className="text-[11px] text-tinte-leise">Anteil bezahlt</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {halbjahre.map((h) => (
            <div
              key={h.name}
              className={`rounded-xl border p-2 ${
                h.laeuft
                  ? "border-brand bg-brand/5"
                  : "border-papier-linie dark:border-slate-700"
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className={`text-[12px] font-bold ${h.laeuft ? "text-brand" : ""}`}>{h.name}</span>
                <span className="zahl text-[11px] font-semibold text-tinte-leise">{h.preis} €</span>
              </div>
              <div className={`zahl mt-1.5 text-[17px] font-bold leading-none ${h.laeuft ? "text-brand" : ""}`}>
                {h.kommtNoch ? "–" : `${h.quote} %`}
              </div>
              <div className="mt-1 truncate text-[10px] text-tinte-leise">
                {h.kommtNoch ? "später" : h.rest === 0 ? "alle bezahlt" : `${h.rest} offen`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
