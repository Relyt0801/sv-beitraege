import { useState } from "react";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { datumLang } from "./BeitragsListe";

import { frage } from "../lib/melder";
/**
 * Was das Stufenteam mit den Eltern zu tun hat: Infos anheften und die
 * Anfragen der Eltern beantworten. Erscheint im Reiter Chats.
 */
export function ElternTeamTab() {
  const { infos, tickets, nachrichten, infoAnlegen, infoLoeschen, antworten, ticketSchliessen, ticketLoeschen, zuordnung, konten, anEltern, alsGelesen } = useEltern();
  const { uid } = useRole();
  const { profile } = useProfiles();
  const { students } = useStore();

  /**
   * Wer fragt da? "Familie Mueller" allein reicht nicht – es kann zwei davon
   * geben. Deshalb steht das Kind dahinter.
   */
  const absender = (userId: string) => {
    const name = profile[userId]?.anzeigename || "Elternzugang";
    const kinder = (zuordnung[userId] || [])
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => `${s!.vorname} ${s!.nachname}`);
    return kinder.length ? `${name} · ${kinder.join(" und ")}` : name;
  };
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [anheften, setAnheften] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [schreibOffen, setSchreibOffen] = useState(false);

  const offeneTickets = tickets.filter((t) => !t.erledigt);
  const erledigte = tickets.filter((t) => t.erledigt);

  /** Hat hier jemand geschrieben, seit wir zuletzt geschaut haben? */
  const neu = (t: (typeof tickets)[number]) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    return !t.gelesen_team || fremd[fremd.length - 1].created_at > t.gelesen_team;
  };

  const wer = (userId: string) =>
    userId === uid ? "Du" : profile[userId]?.anzeigename || "Eltern";

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* -------------------------------------------- Infos anheften */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold">Infos für die Eltern</h2>
          <button
            onClick={() => setNeuOffen((v) => !v)}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white"
          >
            {neuOffen ? "Abbrechen" : "Neue Info"}
          </button>
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Was hier steht, sehen alle Eltern in ihrem Reiter Infos.
        </p>

        {neuOffen && (
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-dashed border-brand/50 p-3">
            <input
              className="field"
              placeholder="Überschrift, zum Beispiel Termin Abiball"
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
            />
            <textarea
              className="field min-h-[90px]"
              placeholder="Text …"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-tinte-matt">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={anheften}
                onChange={(e) => setAnheften(e.target.checked)}
              />
              Ganz oben anheften
            </label>
            <button
              disabled={!titel.trim() || !text.trim()}
              onClick={async () => {
                await infoAnlegen(titel, text, anheften);
                setTitel("");
                setText("");
                setAnheften(false);
                setNeuOffen(false);
              }}
              className="rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Veröffentlichen
            </button>
          </div>
        )}

        {infos.length === 0 ? (
          <p className="mt-3 text-[13px] text-tinte-leise">Noch nichts veröffentlicht.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {infos.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded-2xl border border-papier-linie p-3 dark:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    {i.angeheftet && <span className="text-[12px]">📌</span>}
                    <span className="truncate text-[14px] font-bold">{i.titel}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-tinte-matt">{i.text}</p>
                  <span className="text-[11px] text-tinte-leise">{datumLang(i.created_at.slice(0, 10))}</span>
                </div>
                <button
                  onClick={() => void frage(`„${i.titel}" wirklich löschen?`, "Löschen", true).then((ok) => { if (ok) void infoLoeschen(i.id); })}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-tinte-leise transition active:scale-90"
                  aria-label="Löschen"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------- Anfragen */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold">
            Gespräche mit Eltern{offeneTickets.length > 0 && ` (${offeneTickets.length} offen)`}
            {tickets.filter(neu).length > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 align-middle text-[11px] font-bold text-white">
                {tickets.filter(neu).length} neu
              </span>
            )}
          </h2>
          <button
            onClick={() => setSchreibOffen((v) => !v)}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white"
          >
            {schreibOffen ? "Abbrechen" : "Anschreiben"}
          </button>
        </div>

        {schreibOffen && <AnEltern konten={konten} onSenden={anEltern} onFertig={() => setSchreibOffen(false)} />}

        {tickets.length === 0 ? (
          <p className="mt-2 text-[13px] text-tinte-leise">Bisher hat niemand etwas gefragt.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {[...offeneTickets, ...erledigte].map((t) => {
              const verlauf = nachrichten.filter((n) => n.ticket_id === t.id);
              const auf = offen === t.id;
              return (
                <li
                  key={t.id}
                  className={`rounded-2xl border ${
                    t.erledigt ? "border-papier-linie opacity-70 dark:border-slate-700" : "border-amber-300 dark:border-amber-500/40"
                  }`}
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        const jetztOffen = auf ? null : t.id;
                        setOffen(jetztOffen);
                        if (jetztOffen) alsGelesen(t.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 p-3.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">
                          {neu(t) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
                          {t.betreff}
                        </span>
                        <span className="block truncate text-[11px] text-tinte-leise">
                          {absender(t.user_id)} · {verlauf.length}{" "}
                          {verlauf.length === 1 ? "Nachricht" : "Nachrichten"}
                        </span>
                      </span>
                      <span className="shrink-0 text-tinte-leise">{auf ? "▾" : "▸"}</span>
                    </button>
                    {/* Weg damit: geloeschte Gespraeche sind endgueltig weg, auch
                        fuer die Eltern. Deshalb die Rueckfrage. */}
                    <button
                      onClick={() =>
                        void frage(
                          `Das Gespräch „${t.betreff}" endgültig löschen?\n\nAlle Nachrichten darin verschwinden – auch für die Eltern.`,
                          "Löschen",
                          true,
                        ).then((ok) => { if (ok) void ticketLoeschen(t.id); })
                      }
                      className="mr-2 shrink-0 rounded-lg px-2 py-2 text-tinte-leise transition hover:text-red-500 active:scale-90"
                      aria-label="Gespräch löschen"
                      title="Gespräch löschen"
                    >
                      🗑
                    </button>
                  </div>

                  {auf && (
                    <div className="border-t border-papier-linie p-3.5 dark:border-slate-700">
                      <ul className="grid grid-cols-1 gap-2">
                        {verlauf.map((n) => (
                          <li
                            key={n.id}
                            className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                              n.user_id === uid ? "bg-brand/10" : "bg-papier-matt dark:bg-slate-800"
                            }`}
                          >
                            <div className="mb-0.5 text-[11px] font-semibold text-tinte-leise">{wer(n.user_id)}</div>
                            <div className="whitespace-pre-wrap">{n.text}</div>
                          </li>
                        ))}
                      </ul>
                      <Antwort onSenden={(txt) => antworten(t.id, txt)} />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => ticketSchliessen(t.id, !t.erledigt)}
                          className="min-w-0 flex-1 rounded-xl border border-papier-linie py-2 text-[13px] font-bold text-tinte-matt dark:border-slate-700"
                        >
                          {t.erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                        </button>
                        <button
                          onClick={() =>
                            void frage(
                              `Das Gespräch „${t.betreff}" endgültig löschen?\n\nAlle Nachrichten darin verschwinden – auch für die Eltern.`,
                              "Löschen",
                              true,
                            ).then((ok) => { if (ok) void ticketLoeschen(t.id); })
                          }
                          className="shrink-0 rounded-xl border border-red-300 px-3 py-2 text-[13px] font-bold text-red-500 dark:border-red-500/40"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Antwort({ onSenden }: { onSenden: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2 flex gap-2">
      <input
        className="field min-w-0 flex-1"
        placeholder="Antwort ans Elternhaus …"
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

/**
 * Ein bestimmtes Elternhaus anschreiben.
 *
 * Erst die Familie suchen, dann Betreff und Text. Die Eltern sehen das
 * Gespraech danach in ihrem Reiter Infos und bekommen eine Benachrichtigung.
 */
function AnEltern({
  konten,
  onSenden,
  onFertig,
}: {
  konten: import("../eltern-store").Elternkonto[];
  onSenden: (userId: string, betreff: string, text: string) => Promise<string | null>;
  onFertig: () => void;
}) {
  const { students } = useStore();
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  const kindNamen = (ids: string[]) =>
    ids
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => `${s!.vorname} ${s!.nachname}`)
      .join(" und ");

  const q = normalize(suche);
  const treffer = konten
    .filter((k) => !q || normalize(`${k.anzeigename} ${k.username} ${kindNamen(k.kinder)}`).includes(q))
    .slice(0, 8);
  const ziel = konten.find((k) => k.user_id === gewaehlt);

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-dashed border-brand/50 p-3">
      {!ziel ? (
        <>
          <input
            className="field"
            placeholder="Familie oder Kind suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            autoFocus
          />
          {konten.length === 0 ? (
            <p className="text-[13px] text-tinte-leise">Es gibt noch keine Elternzugänge.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1">
              {treffer.map((k) => (
                <li key={k.user_id}>
                  <button
                    onClick={() => setGewaehlt(k.user_id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-papier-matt dark:hover:bg-slate-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{k.anzeigename}</span>
                      <span className="block truncate text-[11px] text-tinte-leise">
                        {kindNamen(k.kinder) || k.username}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {treffer.length === 0 && (
                <li className="px-1 py-2 text-[13px] text-tinte-leise">Niemand gefunden.</li>
              )}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2 dark:bg-slate-800">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              An {ziel.anzeigename}
              {kindNamen(ziel.kinder) && ` · ${kindNamen(ziel.kinder)}`}
            </span>
            <button onClick={() => setGewaehlt(null)} className="shrink-0 text-[12px] font-bold text-brand">
              ändern
            </button>
          </div>
          <input className="field" placeholder="Betreff" value={betreff} onChange={(e) => setBetreff(e.target.value)} />
          <textarea
            className="field min-h-[90px]"
            placeholder="Ihre Nachricht …"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {fehler && <p className="text-[13px] font-semibold text-amber-600">{fehler}</p>}
          <button
            disabled={busy || !betreff.trim() || !text.trim()}
            onClick={async () => {
              setBusy(true);
              const problem = await onSenden(ziel.user_id, betreff, text);
              setBusy(false);
              if (problem) {
                setFehler(problem);
                return;
              }
              setBetreff("");
              setText("");
              setGewaehlt(null);
              setSuche("");
              onFertig();
            }}
            className="rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Abschicken
          </button>
        </>
      )}
    </div>
  );
}
