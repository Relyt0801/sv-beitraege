import { memo, useState } from "react";
import { HY, type Halbjahr, type Settings, type Student } from "../lib/types";
import { basisOffen, beitragFuer, isActive, idx, prozentVon } from "../lib/logic";

/**
 * Wie steht die Stufenkasse da?
 *
 * Bisher sprang man direkt in die Liste mit allen Personen und musste selbst
 * zusammenzählen. Hier stehen zuerst die drei Zahlen, die das Stufenteam
 * wirklich braucht: was reingekommen ist, was noch fehlt, und wie viele durch
 * sind. Darunter je Halbjahr die Quote.
 */
function KassenKopfRoh({
  students,
  settings,
  punkte,
  halbjahrSetzen,
}: {
  students: Student[];
  settings: Settings;
  /** student_id -> gesammelte Prozentpunkte */
  punkte: Record<string, number>;
  /** Laufendes Halbjahr umstellen (nur wer Daten bearbeiten darf) */
  halbjahrSetzen?: (h: Halbjahr) => void;
}) {
  const bis = idx(settings.aktuelles_halbjahr);
  const [aendern, setAendern] = useState(false);

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

  // Durchschnittliche Mithilfe. Gezaehlt wird nur, wer im laufenden Halbjahr
  // dabei ist – wer die Stufe verlassen hat, zieht den Schnitt sonst runter,
  // ohne dass jemand etwas dagegen tun koennte.
  const dabei = students.filter((s) => isActive(s, bis));
  const schnitt = dabei.length
    ? Math.round(dabei.reduce((n, s) => n + prozentVon(punkte[s.id] || 0, settings), 0) / dabei.length)
    : 0;
  const beiNull = dabei.filter((s) => (punkte[s.id] || 0) === 0).length;

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

  // Eine Kennzahl: Bezeichnung, Wert, eine kurze Zeile darunter, dünner Balken.
  // Alle vier in EINER Karte (Handy 2 × 2, Laptop 1 × 4) – vorher vier
  // einzelne Karten plus Halbjahres-Karte: am Handy sah man erst nach
  // 430 px die erste Person der Liste.
  const kennzahl = (label: string, wert: React.ReactNode, unter: React.ReactNode, balken: number, farbe: string, wertFarbe = "") => (
    <div className="min-w-0 px-3.5 py-3 sm:px-4">
      <div className="kennlabel truncate">{label}</div>
      <div className={`zahl mt-1 truncate text-[1.5rem] font-extrabold leading-none sm:text-[1.75rem] ${wertFarbe}`}>{wert}</div>
      <div className="mt-1 truncate text-[12px] text-tinte-matt">{unter}</div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[rgb(118_118_128/0.14)]">
        <div className={`h-full rounded-full transition-[width] duration-700 ease-ios ${farbe}`} style={{ width: `${Math.min(100, Math.max(0, balken))}%` }} />
      </div>
    </div>
  );

  return (
    <div className="mx-auto mt-3 max-w-5xl space-y-2.5">
      {/* --------------------------------------------- vier Kennzahlen */}
      <div
        className="card grid grid-cols-2 overflow-hidden [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b [&>*]:border-black/[0.06] dark:[&>*]:border-white/[0.08] md:grid-cols-4 md:[&>*:nth-child(-n+2)]:border-b-0 md:[&>*:not(:last-child)]:border-r"
        data-tour="kassenkopf"
      >
        {kennzahl(
          "Eingegangen",
          `${ein} €`,
          <>
            von <span className="zahl font-semibold">{soll} €</span> bis {settings.aktuelles_halbjahr}
          </>,
          quote,
          "bg-bezahlt",
        )}
        {kennzahl("Noch offen", `${offen} €`, <>bei <span className="font-semibold">{students.length - fertig} Personen</span></>, 100 - quote, "bg-offen", "text-offen")}
        {kennzahl(
          "Ganz bezahlt",
          <>
            {fertig} <span className="text-[15px] font-semibold text-tinte-matt">von {students.length}</span>
          </>,
          `${anteilFertig} % der Stufe`,
          anteilFertig,
          "bg-brand",
        )}
        {/* Wie viel hilft die Stufe im Schnitt mit? Sagt mehr ueber die
            Stimmung als der Kassenstand – und zeigt, wie viele noch gar
            nichts gemacht haben. */}
        {kennzahl(
          "Mithilfe im Schnitt",
          `${schnitt} %`,
          beiNull === 0 ? "alle haben mitgeholfen" : <><span className="font-semibold">{beiNull}</span> noch bei 0 %</>,
          schnitt,
          "bg-brand",
          "text-brand",
        )}
      </div>

      {/* --------------------------------------------- Halbjahre */}
      <div className="card px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4">
        <div className="mb-2 flex min-h-[2rem] items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-tinte-matt">Halbjahre · Anteil bezahlt</h2>
          {halbjahrSetzen ? (
            <button
              onClick={() => setAendern((v) => !v)}
              aria-expanded={aendern}
              className="-mr-1.5 flex min-h-[2.25rem] items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-brand-dark dark:text-brand"
            >
              {settings.aktuelles_halbjahr} läuft · {aendern ? "fertig" : "ändern"}
            </button>
          ) : (
            <span className="text-[12px] text-tinte-leise">{settings.aktuelles_halbjahr} läuft</span>
          )}
        </div>
        {/* Eine Reihe mit allen sechs – auch am Handy (früher 3 × 2 bzw. eine
            Wischleiste, in der Q2.1/Q2.2 niemand fand). */}
        <div aria-label="Die sechs Halbjahre" className="grid grid-cols-6 gap-1 sm:gap-1.5">
          {halbjahre.map((h) =>
            aendern && halbjahrSetzen ? (
              <button
                key={h.name}
                role="radio"
                aria-checked={h.laeuft}
                onClick={() => {
                  if (!h.laeuft) halbjahrSetzen(h.name);
                }}
                className={`min-h-[3.25rem] rounded-xl text-[13px] font-bold transition active:scale-95 ${
                  h.laeuft ? "bg-brand text-white" : "bg-papier text-tinte dark:bg-slate-800/60 dark:text-slate-100"
                }`}
              >
                {h.name}
              </button>
            ) : (
              <div
                key={h.name}
                className={`min-w-0 rounded-xl border px-1.5 py-1.5 sm:p-2 ${
                  h.laeuft ? "border-brand/40 bg-brand/[0.06]" : "border-transparent bg-papier dark:bg-slate-800/60"
                }`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`text-[12px] font-bold ${h.laeuft ? "text-brand" : ""}`}>{h.name}</span>
                  <span className="zahl hidden text-[12px] font-semibold text-tinte-leise sm:inline">{h.preis} €</span>
                </div>
                <div className={`zahl mt-1 text-[15px] font-bold leading-none sm:text-[17px] ${h.laeuft ? "text-brand" : ""}`}>
                  {h.kommtNoch ? "–" : `${h.quote} %`}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-tinte-leise">
                  {h.kommtNoch ? "später" : h.rest === 0 ? "fertig" : `${h.rest} offen`}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Der Kopf rechnet ueber alle Personen. Beim Tippen im Suchfeld aendert sich
 * an ihm nichts – also darf er sich auch nicht neu ausrechnen.
 */
export const KassenKopf = memo(KassenKopfRoh);
