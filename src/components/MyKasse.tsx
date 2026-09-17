import { HY, type Settings, type Student } from "../lib/types";
import { useStore } from "../store";
import { basisOffen, beitragFuer, naechsteStufe, prozentVon, staffelVon, ticketBetrag } from "../lib/logic";
import { TermChip } from "./TermChip";
import { Ring } from "./Ring";
import { BeitragsListe } from "./BeitragsListe";
import { TicketErklaerung } from "./TicketErklaerung";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind.
 *
 * Vier Blöcke, von oben nach unten: was ich der Kasse noch schulde, wie viel
 * Prozent ich gesammelt habe, wobei ich geholfen habe, und was mein
 * Abiballticket kostet.
 */
export function MyKasse({
  student,
  settings,
  punkte,
  ready,
}: {
  student: Student | null;
  settings: Settings;
  punkte: number;
  ready: boolean;
}) {
  const { contributions } = useStore();

  if (!ready)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Deine Beiträge werden geladen …</div>
      </div>
    );

  if (!student)
    return (
      <div className="card mx-auto max-w-2xl p-6 text-center text-sm text-slate-500">
        Zu deinem Konto ist noch keine Person zugeordnet.
        <br />
        Sag dem Stufenteam Bescheid, dann schalten sie dich frei.
      </div>
    );

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const next = naechsteStufe(pct, settings);
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return (
    <div className="mx-auto grid max-w-3xl gap-3 lg:grid-cols-2" data-tour="meine-karte">
      {/* ---------------------------------------------- offener Betrag */}
      <section className="card p-5 lg:col-span-2">
        <div className="text-sm text-slate-500">
          {student.vorname} {student.nachname}
        </div>
        <div
          className={`mt-0.5 text-4xl font-extrabold leading-none ${
            offen > 0 ? "text-amber-500" : "text-emerald-500"
          }`}
        >
          {offen} €
        </div>
        <div className="mt-1 text-[13px] text-slate-500">
          {offen > 0 ? "musst du noch in die Stufenkasse zahlen" : "Du hast alles bezahlt. Danke!"}
        </div>

        <div className="mt-4 flex gap-1.5" data-tour="meine-halbjahre">
          {HY.map((h, i) => (
            <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>

        {/* Preise je Halbjahr, damit niemand raten muss */}
        <div className="mt-1.5 flex gap-1.5">
          {HY.map((h) => (
            <div key={h} className="flex-1 basis-0 text-center text-[11px] font-semibold text-slate-400">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span>✓ bezahlt</span>
          <span>€ noch offen</span>
          <span>/ erlassen</span>
          <span>– noch nicht dabei</span>
        </div>
      </section>

      {/* ---------------------------------------------- Prozentstand */}
      <section className="card p-5" data-tour="meine-punkte">
        <div className="text-sm text-slate-500">Wobei du geholfen hast</div>

        <div className="mt-2 flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">
              {pct >= 100
                ? "Geschafft. Auf dein erstes Abiballticket kommt nichts mehr drauf."
                : "Je mehr Prozent du sammelst, desto günstiger wird dein erstes Abiballticket."}
            </div>
            {next && (
              <div className="mt-1.5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[12px] font-semibold text-brand">
                Noch {next.fehlt} % bis zur nächsten Stufe, das spart dir {next.spart} €
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1">
          {staffelVon(settings).map((stufe) => {
            const erreicht = pct >= stufe.ab;
            const aktuell = staffelVon(settings).filter((x) => pct >= x.ab).pop()?.ab === stufe.ab;
            return (
              <div
                key={stufe.ab}
                className={`rounded-lg px-1 py-1.5 text-center ${
                  aktuell
                    ? "bg-brand text-white"
                    : erreicht
                      ? "bg-brand/15 text-brand"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}
              >
                <div className="text-[12px] font-extrabold leading-none">{stufe.ab}%</div>
                <div className="mt-0.5 text-[10px] font-semibold leading-none opacity-90">+{stufe.betrag} €</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------- Abiballticket */}
      <TicketErklaerung settings={settings} zusatz={ticketBetrag(pct, settings)} prozent={pct} />

      {/* ---------------------------------------------- meine Beiträge */}
      <section className="card p-5 lg:col-span-2">
        <div className="text-sm text-slate-500">Das hast du bisher gemacht</div>
        <BeitragsListe eintraege={meine} leerText="Hier steht noch nichts. Sobald du mithilfst, trägt das Stufenteam es ein." />
      </section>
    </div>
  );
}
