import { memo, useId, useState } from "react";
import { HY, type Halbjahr, type Settings, type Student } from "../lib/types";
import { basisOffen, beitragFuer, isActive, idx, prozentVon } from "../lib/logic";
import { Gruppe, ZeileHaken } from "./Liste";
import { Sheet, SheetKopf } from "./Sheet";

/**
 * Wie steht die Stufenkasse da?
 *
 * Bisher sprang man direkt in die Liste mit allen Personen und musste selbst
 * zusammenzählen. Hier stehen zuerst die drei Zahlen, die das Stufenteam
 * wirklich braucht: was reingekommen ist, was noch fehlt, und wie viele durch
 * sind. Darunter je Halbjahr die Quote – am Handy als eine Zeile, die
 * Kacheln stehen dort im Blatt.
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
  // Blatt „Halbjahre“ (nur am Handy erreichbar, siehe Zeile unter den Zahlen)
  const [blatt, setBlatt] = useState(false);
  const gruppenId = useId();
  const waehlen = aendern && Boolean(halbjahrSetzen);

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
  // Für die Handy-Zeile: Quote des laufenden Halbjahrs und bei wie vielen
  // PERSONEN aus früheren Halbjahren noch etwas fehlt – damit man sieht, ob
  // sich das Blatt lohnt. Je Person einmal gezählt, wie „5 offen“ in den
  // Kacheln (vorher Personen × Halbjahre: „früher 13 offen“ bei 8 Personen).
  // Die Zahl steht vor „offen“, nicht am Zeilenende – am iPhone mini/SE
  // schnitte das Abschneiden sonst genau sie ab („früher offen b…“).
  const quoteJetzt = halbjahre.find((h) => h.laeuft)?.quote ?? 100;
  const frueherOffen = students.filter((s) => HY.some((h, i) => i < bis && isActive(s, i) && s.terms[h].status === "offen")).length;

  // Eine Kennzahl: Bezeichnung, Wert, eine kurze Zeile darunter, dünner Balken.
  // Alle vier in EINER Karte (ab iPad 1 × 4) – vorher vier einzelne Karten
  // plus Halbjahres-Karte. Am Handy steht stattdessen die flache Reihe (kurz).
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

  // Handy: nur Wert und eine kurze Zeile darunter
  const kurz = (wert: React.ReactNode, label: string, wertFarbe = "") => (
    <div className="min-w-0 px-3 py-2.5">
      <div className={`zahl truncate text-[1.25rem] font-extrabold leading-tight ${wertFarbe}`}>{wert}</div>
      <div className="truncate text-[12px] text-tinte-matt">{label}</div>
    </div>
  );

  // Die sechs Halbjahres-Kacheln – ab iPad in der Karte, am Handy im Blatt.
  // `id` nur für die Karte („ändern“ zeigt per aria-controls darauf); im Blatt
  // ohne, sonst stünde dieselbe id zweimal im Dokument.
  const kacheln = (waehlbar: boolean, id?: string) => (
    // Eine Reihe mit allen sechs – auch am Handy (früher 3 × 2 bzw. eine
    // Wischleiste, in der Q2.1/Q2.2 niemand fand). Unter 375 px (kleine
    // Android-Handys) passt „38 %“ nicht in ein Sechstel: dort 3 × 2.
    <div
      id={id}
      role={waehlbar ? "radiogroup" : "group"}
      aria-label={waehlbar ? "Laufendes Halbjahr" : "Die sechs Halbjahre"}
      className="grid grid-cols-3 gap-1 min-[375px]:grid-cols-6 sm:gap-1.5"
    >
      {halbjahre.map((h) => {
        // Gleicher Inhalt in beiden Zuständen – „ändern“ macht die Kacheln
        // nur antippbar (laufendes = blau gefüllt). Vorher wurden daraus
        // flachere Knöpfe, und die Liste darunter sprang um 14–22 px.
        const weiss = waehlbar && h.laeuft;
        const inhalt = (
          <>
            <div className="flex items-baseline justify-between gap-1">
              <span className={`text-[12px] font-bold ${weiss ? "text-white" : h.laeuft ? "text-brand" : ""}`}>{h.name}</span>
              <span className={`zahl hidden text-[12px] font-semibold sm:inline ${weiss ? "text-white/85" : "text-tinte-leise"}`}>{h.preis} €</span>
            </div>
            <div
              className={`zahl mt-1 whitespace-nowrap text-[13px] font-bold leading-none tracking-[-0.02em] min-[400px]:text-[15px] sm:text-[17px] sm:tracking-normal ${weiss ? "text-white" : h.laeuft ? "text-brand" : ""}`}
            >
              {/* schmales, festes Leerzeichen: „100 %“ bricht nie um */}
              {h.kommtNoch ? "–" : `${h.quote} %`}
            </div>
            {/* Kein Abschneiden („12 off…“ bei 375 px): passt „87 offen“ nicht
                in die Kachel, bricht „offen“ in die nächste Zeile um. */}
            <div className={`mt-0.5 text-[12px] leading-tight ${weiss ? "text-white/85" : "text-tinte-leise"}`}>
              {h.kommtNoch ? "später" : h.rest === 0 ? "fertig" : `${h.rest} offen`}
            </div>
          </>
        );
        return waehlbar && halbjahrSetzen ? (
          <button
            key={h.name}
            role="radio"
            aria-checked={h.laeuft}
            aria-label={h.name}
            onClick={() => {
              if (!h.laeuft) halbjahrSetzen(h.name);
            }}
            className={`min-w-0 rounded-xl border px-1 py-1.5 text-left transition active:scale-95 sm:p-2 ${
              h.laeuft ? "border-brand bg-brand" : "border-brand/25 bg-papier dark:bg-slate-800/60"
            }`}
          >
            {inhalt}
          </button>
        ) : (
          <div
            key={h.name}
            className={`min-w-0 rounded-xl border px-1 py-1.5 sm:p-2 ${
              h.laeuft ? "border-brand/40 bg-brand/[0.06]" : "border-transparent bg-papier dark:bg-slate-800/60"
            }`}
          >
            {inhalt}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto mt-3 max-w-5xl space-y-2.5">
      {/* --------------------------------------------- Handy: drei Zahlen
          Am Handy war die 2 × 2-Karte 210 px hoch – mit den Halbjahren darunter
          stand die erste Person erst bei 690 px (Prüfung Okt. 2026). Für die
          Kasse zählt dort nur: was ist da, was fehlt, wer ist durch. Eine
          flache Reihe, ohne Balken; „Mithilfe im Schnitt“ steht ab iPad.
          Die Halbjahre sind hier nur noch EINE Zeile in derselben Karte
          (Okt. 2026: Kennzahlen + Halbjahres-Karte waren 209 px, jetzt
          109 px) – die sechs Kacheln und das Umstellen stehen im Blatt. */}
      <div className="card overflow-hidden md:hidden" data-tour="kassenkopf">
        <div className="grid grid-cols-3 [&>*:not(:last-child)]:border-r [&>*]:border-black/[0.06] dark:[&>*]:border-white/[0.08]">
          {kurz(`${ein} €`, "eingegangen")}
          {kurz(`${offen} €`, `offen bei ${students.length - fertig}`, "text-offen")}
          {kurz(
            <>
              {fertig}
              <span className="text-[0.95rem] font-semibold text-tinte-matt">/{students.length}</span>
            </>,
            "ganz bezahlt",
          )}
        </div>
        {/* Sagt das Wichtigste der Halbjahre schon ohne Tipp: welches läuft,
            wie weit es ist, und ob aus früheren noch etwas fehlt. */}
        <button
          type="button"
          onClick={() => setBlatt(true)}
          aria-haspopup="dialog"
          className="flex min-h-[44px] w-full items-center gap-2 border-t border-black/[0.06] px-3 py-2 text-left text-[13px] transition active:bg-black/[0.04] dark:border-white/[0.08] dark:active:bg-white/[0.06]"
        >
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">{settings.aktuelles_halbjahr} läuft</b> · <span className="zahl">{quoteJetzt}{" "}%</span> bezahlt
            {frueherOffen > 0 && <span className="text-offen dark:text-amber-300"> · früher {frueherOffen} offen</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-tinte-leise">
            {/* Unter 360 px braucht die Zeile den Platz für „früher … offen“ */}
            <span className="max-[359px]:hidden">Halbjahre</span>
            <span aria-hidden className="text-[17px] leading-none">›</span>
          </span>
        </button>
      </div>

      {/* --------------------------------------------- ab iPad: vier Kennzahlen */}
      <div
        className="card hidden overflow-hidden md:grid md:grid-cols-4 [&>*:not(:last-child)]:border-r [&>*]:border-black/[0.06] dark:[&>*]:border-white/[0.08]"
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

      {/* --------------------------------------------- Halbjahre (ab iPad)
          Am Handy stattdessen die Zeile in der Karte oben und das Blatt. */}
      <div className="card px-3 pb-3 pt-2.5 max-md:hidden sm:px-4 sm:pb-4">
        <div className="mb-2 flex min-h-[2rem] items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-tinte-matt">Halbjahre · Anteil bezahlt</h2>
          {halbjahrSetzen ? (
            <button
              onClick={() => setAendern((v) => !v)}
              aria-expanded={aendern}
              aria-controls={gruppenId}
              className="-mr-1.5 flex min-h-[2.25rem] items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-brand-dark dark:text-brand"
            >
              {settings.aktuelles_halbjahr} läuft · {aendern ? "fertig" : "ändern"}
            </button>
          ) : (
            <span className="text-[12px] text-tinte-leise">{settings.aktuelles_halbjahr} läuft</span>
          )}
        </div>
        {kacheln(waehlen, gruppenId)}
      </div>

      {/* --------------------------------------------- Blatt „Halbjahre“ (Handy)
          Die Kacheln wie ab iPad, darunter das Umstellen als Liste mit Haken
          (Design-Regeln 2: Auswahl im Blatt, nicht als Knöpfe in einer Karte).
          Nur wer Daten bearbeiten darf, sieht die Liste. */}
      <Sheet open={blatt} onClose={() => setBlatt(false)}>
        <SheetKopf titel="Halbjahre" unter="Anteil bezahlt je Halbjahr" onClose={() => setBlatt(false)} />
        <div className="card p-3">{kacheln(false)}</div>
        {halbjahrSetzen && (
          <Gruppe titel="Laufendes Halbjahr" fuss="Gilt für alle: was bis dahin fällig ist, zählt als offen.">
            {HY.map((h) => (
              <ZeileHaken
                key={h}
                label={h}
                gewaehlt={h === settings.aktuelles_halbjahr}
                onClick={() => {
                  if (h !== settings.aktuelles_halbjahr) halbjahrSetzen(h);
                }}
              />
            ))}
          </Gruppe>
        )}
      </Sheet>
    </div>
  );
}

/**
 * Der Kopf rechnet ueber alle Personen. Beim Tippen im Suchfeld aendert sich
 * an ihm nichts – also darf er sich auch nicht neu ausrechnen.
 */
export const KassenKopf = memo(KassenKopfRoh);
