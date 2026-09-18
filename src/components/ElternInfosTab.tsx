import { useState } from "react";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { datumLang } from "./BeitragsListe";

/**
 * Reiter "Infos": oben das, was das Stufenteam für die Eltern angeheftet hat,
 * darunter die eigenen Anfragen ans Stufenteam.
 */
export function ElternInfosTab() {
  const { infos, tickets, nachrichten, neuesTicket, antworten, alsGelesen, bereit } = useEltern();
  const { role, uid } = useRole();
  const istEltern = role === "eltern";
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);
  const [offenesTicket, setOffenesTicket] = useState<string | null>(null);

  const meine = istEltern ? tickets.filter((t) => t.user_id === uid) : tickets;

  /** Steht in diesem Gespräch etwas, das ich noch nicht gesehen habe? */
  const neu = (t: (typeof tickets)[number]) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    const gesehen = istEltern ? t.gelesen_eltern : t.gelesen_team;
    return !gesehen || fremd[fremd.length - 1].created_at > gesehen;
  };

  async function absenden() {
    if (!betreff.trim() || !text.trim()) return;
    setBusy(true);
    const problem = await neuesTicket(betreff, text);
    setBusy(false);
    if (problem) {
      setFehler(problem);
      return;
    }
    setBetreff("");
    setText("");
    setFehler("");
  }

  return (
    <div className="grid gap-3">
      {/* ------------------------------------------- angeheftete Infos */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">Vom Stufenteam</h2>
        {!bereit ? (
          <p className="mt-2 text-[13px] text-tinte-leise">Wird geladen …</p>
        ) : infos.length === 0 ? (
          <p className="mt-2 text-[13px] text-tinte-leise">
            Hier steht noch nichts. Sobald es Neuigkeiten gibt, finden Sie sie an dieser Stelle.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {infos.map((i) => (
              <li
                key={i.id}
                className={`rounded-2xl border p-3.5 ${
                  i.angeheftet
                    ? "border-brand/40 bg-brand/5"
                    : "border-papier-linie dark:border-slate-700"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {i.angeheftet && <span className="text-[12px]">📌</span>}
                  <h3 className="min-w-0 flex-1 text-[15px] font-bold">{i.titel}</h3>
                  <span className="shrink-0 text-[11px] text-tinte-leise">{datumLang(i.created_at.slice(0, 10))}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
                  {i.text}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------- eigene Anfragen */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">Eine Frage ans Stufenteam</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Schreiben Sie uns. Wir antworten hier in der App, Sie finden die Antwort dann weiter unten.
        </p>

        <div className="mt-3 grid gap-2">
          <input
            className="field"
            placeholder="Worum geht es? Zum Beispiel: Frage zur Überweisung"
            value={betreff}
            onChange={(e) => setBetreff(e.target.value)}
          />
          <textarea
            className="field min-h-[90px]"
            placeholder="Ihre Frage …"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {fehler && <p className="text-[13px] font-semibold text-amber-600">{fehler}</p>}
          <button
            disabled={busy || !betreff.trim() || !text.trim()}
            onClick={absenden}
            className="rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Absenden
          </button>
        </div>
      </section>

      {meine.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold">Ihre Gespräche mit dem Stufenteam</h2>
          <ul className="mt-3 grid gap-2">
            {meine.map((t) => {
              const verlauf = nachrichten.filter((n) => n.ticket_id === t.id);
              const auf = offenesTicket === t.id;
              return (
                <li key={t.id} className="rounded-2xl border border-papier-linie dark:border-slate-700">
                  <button
                    onClick={() => {
                      const jetztOffen = auf ? null : t.id;
                      setOffenesTicket(jetztOffen);
                      if (jetztOffen) alsGelesen(t.id);
                    }}
                    className="flex w-full items-center gap-2 p-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">
                        {neu(t) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
                        {t.betreff}
                      </span>
                      <span className="block text-[11px] text-tinte-leise">
                        {verlauf.length} {verlauf.length === 1 ? "Nachricht" : "Nachrichten"} ·{" "}
                        {datumLang(t.created_at.slice(0, 10))}
                      </span>
                    </span>
                    {t.erledigt ? (
                      <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        erledigt
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        offen
                      </span>
                    )}
                    <span className="shrink-0 text-tinte-leise">{auf ? "▾" : "▸"}</span>
                  </button>

                  {auf && (
                    <div className="border-t border-papier-linie p-3.5 dark:border-slate-700">
                      <ul className="grid gap-2">
                        {verlauf.map((n) => (
                          <li
                            key={n.id}
                            className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                              n.user_id === uid
                                ? "bg-brand/10 text-tinte dark:text-slate-200"
                                : "bg-papier-matt dark:bg-slate-800"
                            }`}
                          >
                            <div className="mb-0.5 text-[11px] font-semibold text-tinte-leise">
                              {n.user_id === uid ? "Sie" : "Stufenteam"}
                            </div>
                            <div className="whitespace-pre-wrap">{n.text}</div>
                          </li>
                        ))}
                      </ul>
                      <AntwortFeld onSenden={(txt) => antworten(t.id, txt)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function AntwortFeld({ onSenden }: { onSenden: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2 flex gap-2">
      <input
        className="field min-w-0 flex-1"
        placeholder="Antworten …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onSenden(text);
            setText("");
          }
        }}
      />
      <button
        disabled={!text.trim()}
        onClick={() => {
          onSenden(text);
          setText("");
        }}
        className="shrink-0 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-40"
      >
        Senden
      </button>
    </div>
  );
}
