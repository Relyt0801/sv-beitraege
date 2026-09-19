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
  className = "",
}: {
  settings: Settings;
  zusatz: number;
  prozent: number;
  /** In der Elternansicht wird von "Ihr Kind" statt von "du" gesprochen. */
  fuerEltern?: boolean;
  className?: string;
}) {
  const grund = settings.ticket_preis || 0;
  const preisSteht = grund > 0;
  const erstes = grund + zusatz;

  return (
    <section className={`card flex flex-col p-4 sm:p-5 ${className}`}>
      <div className="text-sm text-tinte-matt">Abiballticket</div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-2xl border-2 border-brand/40 bg-brand/5 p-3">
          <div className="text-[12px] font-bold uppercase tracking-wide text-brand">
            {fuerEltern ? "Das 1. Ticket Ihres Kindes" : "Dein eigenes Ticket"}
          </div>
          <div className="mt-0.5 text-3xl font-extrabold leading-none text-tinte dark:text-slate-100">
            {preisSteht ? `${erstes} €` : `${zusatz} € extra`}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-tinte-matt dark:text-slate-400">
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
              <>Aufschlag bei {prozent} %. Der Ticketpreis selbst steht noch nicht fest.</>
            )}
          </div>
          <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] font-semibold text-brand-dark dark:bg-slate-900/60 dark:text-brand-soft">
            {fuerEltern
              ? "Nur dieses Ticket – nicht Ihre Karten."
              : "Nur dein eigenes Ticket – nicht Karten für Eltern oder Gäste."}
          </div>
        </div>

        <div className="rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
          <div className="text-[12px] font-bold uppercase tracking-wide text-tinte-leise">
            Jedes weitere Ticket
          </div>
          <div className="mt-0.5 text-2xl font-extrabold leading-none text-tinte-matt dark:text-slate-300">
            {preisSteht ? `${grund} €` : "Preis noch offen"}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-tinte-matt dark:text-slate-400">
            {fuerEltern
              ? preisSteht
                ? "Normaler Preis, ohne Zusatzbeitrag."
                : "Noch nicht festgelegt. Normaler Preis, ohne Zusatzbeitrag."
              : preisSteht
                ? "Karten für Eltern, Geschwister oder Gäste: normaler Preis, ohne Aufschlag."
                : "Noch nicht festgelegt. Karten für Eltern und Gäste: normaler Preis, ohne Aufschlag."}
          </div>
        </div>
      </div>

      {!fuerEltern && (
        <div className="mt-auto pt-3 text-[12px] text-tinte-leise">
          Hat nichts mit dem offenen Stufenbeitrag zu tun.
        </div>
      )}
    </section>
  );
}
