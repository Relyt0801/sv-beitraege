import { HY, type Settings, type Student } from "../lib/types";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { abiballVon, basisOffen, beitragFuer, isPreJoin, naechsteStufe, prozentVon, ticketPreise } from "../lib/logic";
import { HalbjahrLegende, TermChip } from "./TermChip";
import { StaffelKacheln, StaffelRing } from "./Staffel";
import { BeitragsListe } from "./BeitragsListe";
import { KontoTab } from "./KontoTab";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";
import { useState } from "react";
import { TicketBereich } from "./AbiTicket";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind.
 *
 * Ganz oben steht die eine Zahl, die zählt: was noch zu zahlen ist. Alles
 * andere ordnet sich darunter ein. Vorher standen offener Betrag, Prozente und
 * Ticketpreis gleichwertig nebeneinander – man musste erst suchen, worum es
 * geht.
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
  const [ueberweisen, setUeberweisen] = useState(false);

  if (!ready)
    return (
      <SkelettKarten n={3} gross />
    );

  if (!student)
    return (
      <div className="card mx-auto max-w-2xl p-6 text-center text-sm text-tinte-matt">
        Zu deinem Konto ist noch keine Person zugeordnet.
        <br />
        Sag dem Stufenteam Bescheid, dann schalten sie dich frei.
      </div>
    );

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const next = naechsteStufe(pct, settings);
  const bonus = abiballVon(settings);
  const preise = ticketPreise(pct, settings);
  const gesamt = HY.reduce((n, h) => n + beitragFuer(h, settings), 0);
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return (
    <div
      className="mx-auto grid max-w-3xl items-start gap-3 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch"
    >
      {/* ------------------------------------------ die eine Zahl */}
      <section className="leitkarte lg:col-span-2" data-tour="meine-karte">
        <div className="text-[13px] font-medium text-white/60">
          {offen > 0 ? "Du musst noch zahlen" : "Deine Stufenkasse"}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`leitwert ${offen > 0 ? "text-white" : "text-[#30D158]"}`}>{offen} €</span>
          <span className="text-[13px] text-white/60">
            {offen > 0 ? `fällig bis ${settings.aktuelles_halbjahr}` : "Alles bezahlt. Danke!"}
          </span>
        </div>
        <div className="mt-2 text-[12px] text-white/50">
          {student.vorname} {student.nachname} · {gesamt} € über alle sechs Halbjahre
        </div>
        {/* Überweisen – falls Schüler selbst zahlen (sonst die Eltern) */}
        <button
          onClick={() => setUeberweisen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95"
        >
          <Icon name="bank" size={15} />
          Überweisen – Kontodaten
        </button>
      </section>
      <Sheet open={ueberweisen} onClose={() => setUeberweisen(false)}>
        <SheetKopf titel="Überweisen" onClose={() => setUeberweisen(false)} />
        <KontoTab personen={[student]} du />
      </Sheet>

      {/* ------------------------------------------ Halbjahre mit Preis */}
      <section className="card p-4 sm:p-5 lg:col-span-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Deine Halbjahre</h2>
          <span className="text-[12px] text-tinte-leise">
            EF je {beitragFuer("EF.1", settings)} €, Q1/Q2 je {beitragFuer("Q1.1", settings)} €
          </span>
        </div>

        <div className="mt-3 flex gap-1.5" data-tour="meine-halbjahre">
          {HY.map((h, i) => (
            <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {HY.map((h) => (
            <div key={h} className="zahl flex-1 basis-0 text-center text-[11px] font-semibold text-tinte-leise">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>

        <HalbjahrLegende nichtDabei={HY.some((_, i) => isPreJoin(student, i))} />
      </section>

      {/* ------------------------------------------ Abiballticket */}
      {/* Links die Tickets, rechts bestellen und überweisen */}
      <TicketBereich student={student} settings={settings} prozent={pct} className="lg:col-span-2" />

      {/* ------------------------------------------ Prozentstand */}
      <section className="card p-4 sm:p-5" data-tour="meine-punkte">
        <h2 className="text-[15px] font-semibold">Mithilfe bei Aktionen</h2>

        <div className="mt-3 flex items-center gap-4">
          <StaffelRing pct={pct} settings={settings} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug">
              {pct > 100 && bonus.ueber100
                ? `Stark! ${preise.rabatt} € Bonus aufs erste Ticket.`
                : pct >= 100
                  ? bonus.ueber100
                    ? `Kein Zuschlag mehr. Alle ${bonus.bonusSchritt} % mehr: −${bonus.bonusProSchritt} €.`
                    : "Geschafft – kein Zuschlag mehr aufs erste Ticket."
                  : "Mehr Prozent = günstigeres Abiball-Ticket."}
            </div>
            {next && (
              <div className="mt-1.5 text-[13px] leading-relaxed text-tinte-matt">
                Noch <b className="text-brand-dark dark:text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                <b className="text-brand-dark dark:text-brand">{next.spart} €</b>.
              </div>
            )}
          </div>
        </div>

        <StaffelKacheln pct={pct} settings={settings} />
      </section>

      {/* ------------------------------------------ meine Beiträge */}
      <section className="card p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">Wobei du geholfen hast</h2>
        <BeitragsListe
          eintraege={meine}
          leerText="Noch nichts eingetragen. Wenn du mithilfst, trägt das Stufenteam es hier ein."
        />
      </section>
    </div>
  );
}
