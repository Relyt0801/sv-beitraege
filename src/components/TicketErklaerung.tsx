import type { Settings } from "../lib/types";

/**
 * Was das Abiballticket kostet – und zwar so, dass man es ohne Nachfragen
 * versteht. Der Zusatzbeitrag betrifft nur das erste Ticket; Karten fuer
 * Eltern oder Gaeste kosten immer den normalen Preis.
 */
export function TicketErklaerung({
  settings,
  zusatz,
  prozent,
  fuerEltern,
}: {
  settings: Settings;
  zusatz: number;
  prozent: number;
  /** In der Elternansicht wird von "Ihr Kind" statt von "du" gesprochen. */
  fuerEltern?: boolean;
}) {
  const grund = settings.ticket_preis || 0;
  const preisSteht = grund > 0;
  const erstes = grund + zusatz;

  return (
    <section className="card p-5">
      <div className="text-sm text-slate-500">Abiballticket</div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-2xl border-2 border-brand/40 bg-brand/5 p-3">
          <div className="text-[12px] font-bold uppercase tracking-wide text-brand">Das 1. Ticket</div>
          <div className="mt-0.5 text-3xl font-extrabold leading-none text-slate-800 dark:text-slate-100">
            {preisSteht ? `${erstes} €` : `${zusatz} € extra`}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            {preisSteht ? (
              zusatz > 0 ? (
                <>
                  {grund} € Grundpreis und {zusatz} € Zusatzbeitrag, weil{" "}
                  {fuerEltern ? "Ihr Kind" : "du"} bei {prozent} % {fuerEltern ? "steht" : "stehst"}.
                </>
              ) : (
                <>
                  Nur der Grundpreis von {grund} €. Bei {prozent} % kommt nichts mehr dazu.
                </>
              )
            ) : (
              <>
                So viel kommt bei {prozent} % zum Ticketpreis dazu. Was das Ticket selbst kostet, steht
                noch nicht fest.
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
            Jedes weitere Ticket
          </div>
          <div className="mt-0.5 text-2xl font-extrabold leading-none text-slate-600 dark:text-slate-300">
            {preisSteht ? `${grund} €` : "der normale Preis"}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            Karten für Eltern, Geschwister oder Gäste kosten immer gleich viel. Der Zusatzbeitrag gilt
            nur für das erste Ticket.
          </div>
        </div>
      </div>

      <div className="mt-3 text-[12px] leading-relaxed text-slate-400">
        Der Ticketpreis hat mit dem offenen Betrag der Stufenkasse nichts zu tun. Das sind zwei
        getrennte Sachen.
      </div>
    </section>
  );
}
