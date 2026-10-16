import { memo } from "react";
import { HY, STATI, type Settings, type Student } from "../lib/types";
import { idx, isDead, isPreJoin, offenGesamt, prozentVon } from "../lib/logic";
import { TermChip } from "./TermChip";
import { Avatar } from "./Avatar";

/**
 * Spaltenbreiten der Kassenliste – EINMAL festgelegt, damit die Spaltenköpfe
 * in App.tsx genau über den Werten stehen (vorher 40 px versetzt).
 *
 * Unter 768 px (Handy, Handy quer) steht nur das laufende Halbjahr als
 * 44 × 44-px-Kästchen rechts in der Zeile (Okt. 2026: vorher alle sechs in
 * einer eigenen Zeile darunter – 103 px je Person, am iPhone SE war im ersten
 * Bild nicht einmal eine ganze Person zu sehen). Frühere offene Halbjahre
 * nennt die Unterzeile, alle sechs stehen im Personen-Blatt (StudentSheet).
 * Ab 768 px stehen alle sechs
 * in der Zeile: 6 × 44 px + 5 × 6 px Abstand = 18,5 rem, am Laptop bis 26 rem
 * (≈ 64 px je Kästchen) – vorher waren es 35 × 36 px, zu klein zum sicheren
 * Tippen (ein Fehltipp ändert den Zahlstatus), und daneben ~550 px Leere.
 * Die Personenspalte startet bei 768 px schmaler (9,5 rem), damit die Zeile
 * auch mit Auswahl-Kästchen nicht umbricht; Platz übrig bekommt sie zuerst.
 */
export const SPALTE_PERSON = "md:basis-[9.5rem] lg:basis-[13rem]";
export const SPALTE_OFFEN = "md:w-16";
export const SPALTE_HALBJAHRE = "md:grow md:basis-[18.5rem] md:min-w-[18.5rem] md:max-w-[18.5rem] lg:max-w-[26rem]";
/** Balken (w-12) + Abstand (gap-1.5) + Zahl (w-10) */
export const SPALTE_MITHILFE = "md:w-[5.875rem]";

/**
 * Eine Person in der Kassenliste – eine Zeile, die man am Stueck liest:
 * Name, offener Betrag, die sechs Halbjahre, Mithilfe. Vorher war jede Person
 * eine eigene Karte; bei 130 Leuten wurde daraus eine sehr lange Kachelwand,
 * in der man nichts vergleichen konnte.
 *
 * Am Handy (unter 768 px, Okt. 2026) nur: Name mit Unterzeile (Mithilfe,
 * frühere offene Halbjahre), Betrag und das laufende Halbjahr – zwei
 * Bedienelemente statt neun. Vorauszahlungen und ältere Halbjahre laufen über
 * das Personen-Blatt oder „Mehrere auswählen“.
 */
function StudentCardRoh({
  student,
  settings,
  punkte,
  anchor,
  selectable,
  selected,
  canToggleBeitrag,
  loginState,
  userId,
  onOpen,
  onToggleSelect,
  onToggleTerm,
}: {
  student: Student;
  settings: Settings;
  punkte: number;
  /** optionaler Anker für die Einführung */
  anchor?: string;
  selectable: boolean;
  selected: boolean;
  canToggleBeitrag: boolean;
  loginState?: boolean | null;
  /** Konto der Person – faerbt den Namenskreis wie im Rollen-Reiter. */
  userId?: string | null;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleTerm: (id: string, h: (typeof HY)[number]) => void;
}) {
  const leaving = student.verlaesst_ab != null;
  const joiningLate = student.beigetreten_ab !== "EF.1";
  const betrag = offenGesamt(student, settings);
  const prozent = prozentVon(punkte, settings);
  // „dabei seit EF.1“ gilt für fast alle und sagt nichts – die zweite Zeile
  // steht nur noch, wenn etwas besonders ist (später dazu, verlässt die Stufe).
  // Am Handy hängt es seit Okt. 2026 hinten an der Mithilfe-Unterzeile.
  const unter = leaving ? `verlässt ${student.verlaesst_ab}` : joiningLate ? `dabei ab ${student.beigetreten_ab}` : null;
  // Am Handy steht nur das laufende Halbjahr als Kästchen da (Okt. 2026). Was
  // davor noch offen ist, darf dabei nicht verschwinden – sonst stünde neben
  // „EF.2 ✓“ ein offener Betrag, und keiner wüsste, woher er kommt. Daher nennt
  // die Unterzeile die früheren offenen Halbjahre (nur solche, in denen die
  // Person dabei war).
  const aktIdx = idx(settings.aktuelles_halbjahr);
  const fruehereOffen = HY.filter(
    (h, i) => i < aktIdx && student.terms[h].status === "offen" && !isPreJoin(student, i) && !isDead(student, i),
  );
  // Drei und mehr aufeinanderfolgende als Spanne („EF.1–Q1.2“): Bei 320 px
  // passten „EF.1, EF.2, Q1.1, Q1.2, Q2.1“ nicht einmal in zwei Zeilen.
  const offenText = spannen(fruehereOffen.map((h) => idx(h)));
  // „auch“ nur, wenn das laufende Halbjahr selbst offen ist – sonst stünde
  // neben „EF.2 ✓“ ein „auch EF.1 offen“, das nicht stimmt (Prüfung Okt. 2026)
  const aktOffen =
    student.terms[settings.aktuelles_halbjahr].status === "offen" && !isPreJoin(student, aktIdx) && !isDead(student, aktIdx);

  return (
    <div
      data-tour={anchor}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 transition sm:px-4 md:py-3 ${
        selected ? "bg-brand/5 ring-2 ring-inset ring-brand" : ""
      } ${leaving ? "bg-red-50/60 dark:bg-red-500/5" : ""}`}
    >
      {selectable && (
        // Sichtbar 24 px, tippbar 44 px (Update 1.4, U3)
        <button
          onClick={() => onToggleSelect(student.id)}
          aria-label="Auswählen"
          aria-pressed={selected}
          className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 text-sm text-white transition ${
              selected ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"
            }`}
          >
            {selected ? "✓" : ""}
          </span>
        </button>
      )}

      {/* Person */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        // -my/py: 44 px Tippfläche, ohne die Zeile höher zu machen
        className={`-my-1.5 flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left ${SPALTE_PERSON}`}
      >
        {/* Derselbe Namenskreis wie im Rollen-Reiter: Farbe der Person, nicht
            Farbe des Zahlungsstands. Der Betrag rechts sagt das ohnehin. */}
        <span className="relative shrink-0">
          <Avatar userId={userId} name={`${student.nachname}, ${student.vorname}`} size={32} />
          {loginState != null && (
            <span
              title={loginState ? "hat ein eigenes Passwort gesetzt" : "nutzt noch das Startpasswort"}
              className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                loginState ? "bg-bezahlt" : "bg-papier-linie dark:bg-slate-600"
              }`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">
            {student.nachname}, {student.vorname}
          </span>
          {unter && <span className="hidden truncate text-[12px] text-tinte-leise md:block">{unter}</span>}
          {/* Am Handy trägt die Unterzeile, was rechts keinen Platz mehr hat:
              frühere offene Halbjahre (nur das laufende steht als Kästchen da)
              und die Mithilfe (die Spalte fällt weg). So bleibt die Person
              eine Zeile hoch – Okt. 2026: 103 → 65 px je Person. Das Offene
              steht vorn und darf auf eine zweite Zeile umbrechen: Abgeschnitten
              würde sonst genau das, wofür die Zeile da ist (ab Q1.1 mit zwei
              offenen Halbjahren schon am iPhone). */}
          <span className="line-clamp-2 text-[12px] text-tinte-leise md:hidden">
            {fruehereOffen.length > 0 && (
              <>
                <span className="text-offen dark:text-amber-300">
                  {aktOffen ? "auch " : ""}
                  {offenText} offen
                </span>
                {" · "}
              </>
            )}
            {/* feste Leerzeichen in „0 % Mithilfe“ (bricht als Ganzes um, nie „0 %“
                ohne „Mithilfe“) – aber nichts weiter zusammenhalten: das schob die
                Mithilfe bei 320 px in eine abgeschnittene dritte Zeile */}
            {prozent}{"\u00a0"}%{"\u00a0"}Mithilfe
            {unter && ` · ${unter}`}
          </span>
        </span>
      </button>

      {/* Offen */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        className={`zahl -my-2 min-w-[2.75rem] shrink-0 py-2 text-right text-[17px] font-bold ${SPALTE_OFFEN} ${
          betrag > 0 ? "text-offen dark:text-amber-300" : "text-bezahlt dark:text-emerald-300"
        }`}
      >
        {betrag > 0 ? `${betrag} €` : "✓"}
      </button>

      {/* Halbjahre – Breiten siehe SPALTE_HALBJAHRE (mind. 44 × 44 px je Kästchen).
          Am Handy nur das laufende (w-11 = ein Kästchen, die anderen per CSS
          ausgeblendet). Auch wer nur liest (Stufenteam, Sprecher), sieht es –
          nicht antippbar, aber sonst wüsste er nicht, wer das laufende
          Halbjahr schon bezahlt hat (Prüfung Okt. 2026). */}
      <div className={`flex w-11 shrink-0 gap-1.5 md:w-auto ${SPALTE_HALBJAHRE}`}>
        {HY.map((h, i) => (
          <TermChip
            key={h}
            student={student}
            h={h}
            i={i}
            current={settings.aktuelles_halbjahr}
            kompakt
            className={h !== settings.aktuelles_halbjahr ? "max-md:hidden" : ""}
            onToggle={!selectable && canToggleBeitrag ? () => onToggleTerm(student.id, h) : undefined}
          />
        ))}
      </div>

      {/* Mithilfe – am Handy steht sie in der Unterzeile des Namens */}
      <button
        onClick={() => (selectable ? onToggleSelect(student.id) : onOpen(student.id))}
        className={`-my-2 hidden shrink-0 items-center justify-end gap-1.5 py-3 md:flex ${SPALTE_MITHILFE}`}
        aria-label={`Mithilfe ${prozent} Prozent`}
      >
        <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-papier-matt dark:bg-slate-800 md:block">
          <span
            className="block h-full rounded-full bg-brand"
            style={{ width: `${Math.min(100, prozent)}%` }}
          />
        </span>
        <span className={`zahl w-10 text-right text-[13px] font-semibold ${prozent > 100 ? "text-[#9A7410] dark:text-[#E9C460]" : prozent >= 100 ? "text-bezahlt dark:text-emerald-300" : "text-tinte-matt dark:text-slate-300"}`}>
          {prozent} %
        </span>
      </button>
    </div>
  );
}

/**
 * Eine Zeile zeichnet sich nur neu, wenn sich an ihr etwas geaendert hat.
 *
 * Ohne das wurden bei 300 Personen mit jedem Buchstaben im Suchfeld alle 300
 * Zeilen neu gebaut – rund 10.000 DOM-Knoten. Genau daher kam das Nachhaengen
 * beim Tippen.
 */
export const StudentCard = memo(StudentCardRoh);

/**
 * Kreislauf offen → bezahlt → erlassen (für Blätter mit Erklärung daneben).
 * In der Kassenliste schaltet ein Tipp nur zwischen offen und bezahlt
 * (App.tsx, schalteHalbjahr) – „erlassen“ per Doppeltipp war zu leicht
 * versehentlich und ohne Hinweis.
 */
export function nextStatus(cur: string) {
  const i = STATI.indexOf(cur as any);
  return STATI[(i + 1) % STATI.length];
}

/** Halbjahre als kurze Liste: drei und mehr aufeinanderfolgende als Spanne
 *  („EF.1–Q1.2“), sonst mit Komma („EF.1, Q1.1“). Erwartet aufsteigende Indizes. */
function spannen(indizes: number[]): string {
  const teile: string[] = [];
  for (let a = 0; a < indizes.length; ) {
    let b = a;
    while (b + 1 < indizes.length && indizes[b + 1] === indizes[b] + 1) b++;
    // U+2060 (Wortverbinder): kein Zeilenumbruch am Strich
    if (b - a >= 2) teile.push(`${HY[indizes[a]]}\u2060–\u2060${HY[indizes[b]]}`);
    else for (let k = a; k <= b; k++) teile.push(HY[indizes[k]]);
    a = b + 1;
  }
  return teile.join(", ");
}
