import { useEffect, useRef, useState } from "react";
import { SkelettText } from "./Skelett";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { datumLang } from "./BeitragsListe";
import { Icon } from "./Icon";

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
  // Nach dem Absenden: Bestätigung zeigen und die neue Unterhaltung aufklappen
  const [gesendet, setGesendet] = useState(false);
  const [pflicht, setPflicht] = useState(false);
  const gespraecheRef = useRef<HTMLElement | null>(null);

  const meine = istEltern ? tickets.filter((t) => t.user_id === uid) : tickets;

  /** Steht in diesem Gespräch etwas, das ich noch nicht gesehen habe? */
  const neu = (t: (typeof tickets)[number]) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    const gesehen = istEltern ? t.gelesen_eltern : t.gelesen_team;
    return !gesehen || fremd[fremd.length - 1].created_at > gesehen;
  };

  // Die neueste Unterhaltung nach dem Absenden aufklappen und ins Bild holen
  const neuesteId = meine[0]?.id;
  useEffect(() => {
    if (!gesendet || !neuesteId) return;
    setOffenesTicket(neuesteId);
    gespraecheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [gesendet, neuesteId]);

  async function absenden() {
    setGesendet(false);
    if (!betreff.trim() || !text.trim()) {
      setPflicht(true);
      setFehler("Bitte Betreff und Frage ausfüllen.");
      return;
    }
    setPflicht(false);
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
    setGesendet(true);
  }

  return (
    // Am Rechner nebeneinander: links die Infos, rechts die Frage ans Team
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {/* ------------------------------------------- angeheftete Infos */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">Vom Stufenteam</h2>
        {!bereit ? (
          <div className="mt-2">
            <SkelettText zeilen={3} />
          </div>
        ) : infos.length === 0 ? (
          <p className="mt-2 text-[13px] text-tinte-leise">Noch keine Neuigkeiten.</p>
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
                  {i.angeheftet && <span className="shrink-0 self-center text-brand-dark dark:text-brand" title="Angeheftet"><Icon name="pin" size={14} /></span>}
                  <h3 className="min-w-0 flex-1 text-[15px] font-bold">{i.titel}</h3>
                  <span className="shrink-0 text-[12px] text-tinte-leise">{new Date(i.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</span>
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
        <h2 className="text-lg font-bold">Frage ans Stufenteam</h2>
        <p className="mt-0.5 text-[13px] text-tinte-matt dark:text-slate-400">Die Antwort kommt hier in die App.</p>

        <div className="mt-3 grid gap-2">
          <label className="-mb-1 text-[12px] font-semibold text-tinte-leise" htmlFor="eltern-betreff">
            Betreff (Pflichtfeld)
          </label>
          <input
            id="eltern-betreff"
            className={`field ${pflicht && !betreff.trim() ? "ring-2 ring-amber-500" : ""}`}
            placeholder="z. B. Überweisung"
            value={betreff}
            onChange={(e) => setBetreff(e.target.value)}
          />
          <label className="-mb-1 mt-1 text-[12px] font-semibold text-tinte-leise" htmlFor="eltern-text">
            Ihre Frage (Pflichtfeld)
          </label>
          <textarea
            id="eltern-text"
            className={`field min-h-[90px] ${pflicht && !text.trim() ? "ring-2 ring-amber-500" : ""}`}
            placeholder="Ihre Frage …"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {fehler && <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">{fehler}</p>}
          {gesendet && !fehler && (
            <p className="flex items-start gap-2 rounded-xl bg-[#1E7B34]/10 px-3 py-2.5 text-[13px] font-semibold text-[#1E7B34] dark:text-[#30D158]" role="status">
              <Icon name="haken" size={16} strich={2.6} />
              <span>Danke, Ihre Frage ist beim Stufenteam angekommen. Die Antwort erscheint unten unter „Ihre Gespräche“.</span>
            </p>
          )}
          <button disabled={busy} onClick={absenden} className="btn-primary disabled:opacity-40">
            {busy ? "Wird gesendet …" : "Absenden"}
          </button>
        </div>
      </section>

      {meine.length > 0 && (
        <section ref={gespraecheRef} className="card scroll-mt-20 p-5">
          <h2 className="text-lg font-bold">Ihre Gespräche</h2>
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
                    className="flex min-h-[56px] w-full items-center gap-2 p-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">
                        {neu(t) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
                        {t.betreff}
                      </span>
                      <span className="block text-[12px] text-tinte-leise">
                        {verlauf.length} {verlauf.length === 1 ? "Nachricht" : "Nachrichten"} ·{" "}
                        {datumLang(t.created_at.slice(0, 10))}
                      </span>
                    </span>
                    {t.erledigt ? (
                      <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[12px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        erledigt
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[12px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        offen
                      </span>
                    )}
                    <span className={`shrink-0 text-tinte-leise transition-transform ${auf ? "rotate-90" : ""}`}><Icon name="chevron" size={16} strich={2.4} /></span>
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
                            <div className="mb-0.5 text-[12px] font-semibold text-tinte-leise">
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
        className="btn-klein shrink-0"
      >
        Senden
      </button>
    </div>
  );
}
