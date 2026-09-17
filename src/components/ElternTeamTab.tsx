import { useState } from "react";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { datumLang } from "./BeitragsListe";

/**
 * Was das Stufenteam mit den Eltern zu tun hat: Infos anheften und die
 * Anfragen der Eltern beantworten. Erscheint im Reiter Chats.
 */
export function ElternTeamTab() {
  const { infos, tickets, nachrichten, infoAnlegen, infoLoeschen, antworten, ticketSchliessen, zuordnung } = useEltern();
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

  const offeneTickets = tickets.filter((t) => !t.erledigt);
  const erledigte = tickets.filter((t) => t.erledigt);

  const wer = (userId: string) =>
    userId === uid ? "Du" : profile[userId]?.anzeigename || "Eltern";

  return (
    <div className="grid gap-3">
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
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Was hier steht, sehen alle Eltern in ihrem Reiter Infos.
        </p>

        {neuOffen && (
          <div className="mt-3 grid gap-2 rounded-2xl border border-dashed border-brand/50 p-3">
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
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-500">
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
          <p className="mt-3 text-[13px] text-slate-400">Noch nichts veröffentlicht.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {infos.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    {i.angeheftet && <span className="text-[12px]">📌</span>}
                    <span className="truncate text-[14px] font-bold">{i.titel}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-slate-500">{i.text}</p>
                  <span className="text-[11px] text-slate-400">{datumLang(i.created_at.slice(0, 10))}</span>
                </div>
                <button
                  onClick={() => confirm(`„${i.titel}" wirklich löschen?`) && infoLoeschen(i.id)}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-slate-400 transition active:scale-90"
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
        <h2 className="text-lg font-bold">
          Anfragen von Eltern{offeneTickets.length > 0 && ` (${offeneTickets.length} offen)`}
        </h2>

        {tickets.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-400">Bisher hat niemand etwas gefragt.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {[...offeneTickets, ...erledigte].map((t) => {
              const verlauf = nachrichten.filter((n) => n.ticket_id === t.id);
              const auf = offen === t.id;
              return (
                <li
                  key={t.id}
                  className={`rounded-2xl border ${
                    t.erledigt ? "border-slate-200 opacity-70 dark:border-slate-700" : "border-amber-300 dark:border-amber-500/40"
                  }`}
                >
                  <button
                    onClick={() => setOffen(auf ? null : t.id)}
                    className="flex w-full items-center gap-2 p-3.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{t.betreff}</span>
                      <span className="block text-[11px] text-slate-400">
                        {absender(t.user_id)} · {verlauf.length}{" "}
                        {verlauf.length === 1 ? "Nachricht" : "Nachrichten"}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-400">{auf ? "▾" : "▸"}</span>
                  </button>

                  {auf && (
                    <div className="border-t border-slate-200 p-3.5 dark:border-slate-700">
                      <ul className="grid gap-2">
                        {verlauf.map((n) => (
                          <li
                            key={n.id}
                            className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                              n.user_id === uid ? "bg-brand/10" : "bg-slate-100 dark:bg-slate-800"
                            }`}
                          >
                            <div className="mb-0.5 text-[11px] font-semibold text-slate-400">{wer(n.user_id)}</div>
                            <div className="whitespace-pre-wrap">{n.text}</div>
                          </li>
                        ))}
                      </ul>
                      <Antwort onSenden={(txt) => antworten(t.id, txt)} />
                      <button
                        onClick={() => ticketSchliessen(t.id, !t.erledigt)}
                        className="mt-2 w-full rounded-xl border border-slate-200 py-2 text-[13px] font-bold text-slate-500 dark:border-slate-700"
                      >
                        {t.erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                      </button>
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
