import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useTopics } from "../topics-store";
import { useTermine } from "../termine-store";
import { useKi, type Schicht } from "../ki-store";
import { hasSupabase } from "../lib/supabase";
import { basisOffen, offenGesamt, offenStufe, prozentVon, ticketBetrag } from "../lib/logic";
import { euroKurz, useFinanzUebersicht } from "../lib/finanzen";
import { useDemoUebersicht } from "./FinanzStandard";
import { heuteKey, kurzDatum, tagLang, terminIcon, uhr } from "../lib/termine";
import { meldeText } from "../lib/ki";
import { chatZielSetzen } from "../lib/ziel";
import { melde, meldeFehler } from "../lib/melder";
import type { Student } from "../lib/types";
import { Icon } from "./Icon";

type Ziel = "kasse" | "finanzen" | "events" | "themen";

/**
 * Startseite: auf einen Blick, was für mich ansteht.
 *
 * Bewusst schlicht: Karten statt Knöpfe – jede Karte führt dorthin, wo es
 * weitergeht. Die einzigen Knöpfe sind „Ja / Nein“ bei „Warst du da?“.
 * Was es nicht gibt, steht auch nicht da (keine leeren Kästen).
 */
export function StartTab({
  student,
  punkte,
  onTab,
  onAnwesenheit,
}: {
  /** Eigene Zeile – null fürs Team ohne eigene Zeile */
  student: Student | null;
  punkte: number;
  onTab: (t: Ziel) => void;
  /** Team: Übersicht „Wer war da?“ öffnen */
  onAnwesenheit: () => void;
}) {
  const { students, settings, punkte: allePunkte, ready } = useStore();
  const { can, isStaff, studentId } = useRole();
  const { topics, items, myVotes, unreadCount, uid } = useTopics();
  const { termine } = useTermine();
  const ki = useKi();
  const team = isStaff || can("hilfen.edit");
  const darfFinanzen = can("finanzen.basis") || can("finanzen.view") || can("finanzen.manage");

  const { daten } = useFinanzUebersicht(darfFinanzen && hasSupabase);
  const demo = useDemoUebersicht(!hasSupabase && darfFinanzen);
  const fin = hasSupabase ? daten : demo;

  // ------------------------------------------------------------ Zahlen
  const meinOffen = student ? basisOffen(student, settings.aktuelles_halbjahr, settings) : 0;
  const pct = prozentVon(punkte, settings);
  const ticketGrund = settings.ticket_preis || 0;
  const ticket = ticketGrund + ticketBetrag(pct, settings);
  const stufe = useMemo(
    () =>
      team
        ? {
            cent: offenStufe(students, settings, allePunkte),
            personen: students.filter((s) => offenGesamt(s, settings, allePunkte[s.id] || 0) > 0).length,
          }
        : null,
    [team, students, settings, allePunkte],
  );

  // ------------------------------------------------------------ Listen
  const tickets = topics.filter((t) => t.kind === "ticket" && (isStaff || t.created_by === uid));
  const ticketNeu = tickets.reduce((n, t) => n + unreadCount(t.id), 0);
  const chatsNeu = topics.filter((t) => t.kind !== "ticket").reduce((n, t) => n + unreadCount(t.id), 0);
  const titelVon = new Map(topics.map((t) => [t.id, t]));
  const jetzt = new Date().toISOString();
  const abstimmungen = items
    .filter(
      (i) =>
        i.type === "umfrage" &&
        !i.done &&
        !(myVotes[i.id] || []).length &&
        (!i.poll_deadline || i.poll_deadline > jetzt) &&
        titelVon.has(i.topic_id),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 4);

  const meineIds = studentId ? [studentId] : [];
  const naechsteSchicht = termine
    .filter((t) => t.aktion_id && (t.bis_datum || t.datum) >= heuteKey() && t.personen.some((p) => meineIds.includes(p)))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""))[0];

  const vorschlaegeOffen = ki.vorschlaege.filter((v) => v.status === "offen" && v.ergebnis !== "laeuft" && v.ergebnis !== "auto").length;

  const zeilen: ReactNode[] = [];
  if (ticketNeu > 0)
    zeilen.push(
      <Zeile key="tickets" zeichen="💬" titel={isStaff ? `${ticketNeu} neue ${ticketNeu === 1 ? "Nachricht" : "Nachrichten"} an das Stufenteam` : "Das Stufenteam hat dir geantwortet"} unter="Antippen zum Lesen" onClick={() => { chatZielSetzen({ team: true }); onTab("themen"); }} hervor />,
    );
  if (team && ki.offeneAngaben.length > 0)
    zeilen.push(
      <Zeile key="angaben" zeichen="🙋" titel={`${ki.offeneAngaben.length} ${ki.offeneAngaben.length === 1 ? "Angabe" : "Angaben"} „war da“ prüfen`} unter="Wer war da, wer nicht – ein Tipp je Person" onClick={onAnwesenheit} hervor />,
    );
  if (team && vorschlaegeOffen > 0)
    zeilen.push(
      <Zeile key="assistent" zeichen="🤖" titel={`${vorschlaegeOffen} ${vorschlaegeOffen === 1 ? "Vorschlag" : "Vorschläge"} vom Assistenten`} unter="In den Gesprächen mit Schülern" onClick={() => { chatZielSetzen({ team: true }); onTab("themen"); }} />,
    );
  for (const a of abstimmungen) {
    const t = titelVon.get(a.topic_id);
    zeilen.push(
      <Zeile key={a.id} zeichen="🗳️" titel={a.title || a.body.slice(0, 60) || "Abstimmung"} unter={`Abstimmung · ${t?.title || "Chat"}${a.poll_deadline ? ` · bis ${kurzDatum(a.poll_deadline.slice(0, 10))}` : ""}`} onClick={() => { chatZielSetzen({ topicId: a.topic_id }); onTab("themen"); }} />,
    );
  }
  if (chatsNeu > 0)
    zeilen.push(
      <Zeile key="chats" zeichen="✉️" titel={`${chatsNeu} ungelesene ${chatsNeu === 1 ? "Nachricht" : "Nachrichten"} in den Chats`} onClick={() => onTab("themen")} />,
    );
  if (naechsteSchicht)
    zeilen.push(
      <Zeile key="schicht" zeichen={terminIcon(naechsteSchicht, "📅") || "📅"} titel={`Deine nächste Schicht: ${naechsteSchicht.titel}`} unter={`${tagLang(naechsteSchicht.datum)}${naechsteSchicht.von ? ` · ${uhr(naechsteSchicht.von)}` : ""}`} onClick={() => onTab("events")} />,
    );

  if (!ready)
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-500 dark:border-slate-700 dark:border-t-slate-300" />
        <div className="text-sm font-medium">Wird geladen …</div>
      </div>
    );

  return (
    <div className="mx-auto grid max-w-3xl gap-3 pb-4 lg:max-w-5xl" data-tour="start">
      {/* ---------------------------------------- Warst du da? */}
      {ki.meineAbfragen.slice(0, 3).map((s) => (
        <Abfrage key={s.termin.id} schicht={s} />
      ))}

      {/* ---------------------------------------- die eine Zahl */}
      {stufe ? (
        <button onClick={() => onTab("kasse")} className="leitkarte text-left transition active:scale-[.99]">
          <div className="text-[13px] font-medium text-white/60">Offen in der Stufe</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <span className="leitwert">{stufe.cent} €</span>
            <span className="text-[13px] text-white/60">{stufe.personen} Personen · bis {settings.aktuelles_halbjahr}</span>
          </div>
          {student && <div className="mt-2 text-[12px] text-white/50">Du selbst: {meinOffen > 0 ? `${meinOffen} € offen` : "alles bezahlt"}</div>}
          <Weiter hell />
        </button>
      ) : student ? (
        <button onClick={() => onTab("kasse")} className="leitkarte text-left transition active:scale-[.99]">
          <div className="text-[13px] font-medium text-white/60">{meinOffen > 0 ? "Du musst noch zahlen" : "Deine Beiträge"}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
            <span className={`leitwert ${meinOffen > 0 ? "text-white" : "text-[#30D158]"}`}>{meinOffen} €</span>
            <span className="text-[13px] text-white/60">{meinOffen > 0 ? `fällig bis ${settings.aktuelles_halbjahr}` : "Alles bezahlt. Danke!"}</span>
          </div>
          <Weiter hell />
        </button>
      ) : (
        <div className="card p-5 text-center text-sm text-tinte-matt">
          Zu deinem Konto ist noch keine Person zugeordnet. Sag dem Stufenteam Bescheid.
        </div>
      )}

      {/* ---------------------------------------- Abiball und Konto */}
      <div className="grid grid-cols-2 gap-3">
        {student && !isStaff ? (
          <Kachel onClick={() => onTab("kasse")} titel="Dein Abiball-Ticket" wert={ticketGrund > 0 ? `${ticket} €` : `+${ticketBetrag(pct, settings)} €`} unter={ticketGrund > 0 ? `bei ${pct} % Mithilfe` : `Aufschlag bei ${pct} %`} />
        ) : fin && fin.ziel_cent > 0 ? (
          <Kachel onClick={() => onTab("finanzen")} titel={`Ziel ${fin.ziel_titel || "Abiball"}`} wert={euroKurz(fin.ziel_cent)} unter={`${Math.max(0, Math.min(100, Math.round((fin.stand_cent / fin.ziel_cent) * 100)))} % geschafft`} />
        ) : (
          <Kachel onClick={() => onTab("kasse")} titel="Abiball-Ticket" wert={ticketGrund > 0 ? `${ticketGrund} €` : "offen"} unter="Grundpreis" />
        )}
        {darfFinanzen ? (
          <Kachel
            onClick={() => onTab("finanzen")}
            titel="Kontostand der Stufe"
            wert={fin ? rundEuro(fin.stand_cent) : "…"}
            unter={fin && fin.ziel_cent > 0 && student && !isStaff ? `${Math.round((fin.stand_cent / fin.ziel_cent) * 100)} % vom Ziel ${fin.ziel_titel || "Abiball"}` : "zum Kassenbuch"}
          />
        ) : (
          <Kachel onClick={() => onTab("kasse")} titel="Mithilfe" wert={`${pct} %`} unter="bei Aktionen" />
        )}
      </div>

      {/* ---------------------------------------- für dich */}
      {zeilen.length > 0 ? (
        <section className="card divide-y divide-papier-linie overflow-hidden dark:divide-slate-800">{zeilen}</section>
      ) : (
        <p className="py-3 text-center text-[13px] text-tinte-leise">Keine Antworten, keine offenen Abstimmungen. Alles erledigt ✨</p>
      )}
    </div>
  );
}

/** „Warst du da?“ – zwei Knöpfe, danach verschwindet die Karte. */
function Abfrage({ schicht }: { schicht: Schicht }) {
  const { melden } = useKi();
  const [busy, setBusy] = useState(false);
  const t = schicht.termin;
  const name = `${schicht.aktion.titel} am ${tagLang(t.datum)}`;
  async function antwort(da: boolean) {
    setBusy(true);
    const r = await melden(schicht, da);
    setBusy(false);
    if (r.fehler) meldeFehler(r.fehler);
    else melde(meldeText(r.status || "", name), r.status === "auto" ? "erfolg" : "info");
  }
  return (
    <section className="card border-brand/30 bg-brand/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{terminIcon(t, schicht.aktion.icon) || "🙌"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">Warst du da?</div>
          <div className="text-[13px] text-tinte-matt dark:text-slate-400">
            {schicht.aktion.titel} · {tagLang(t.datum)}
            {t.von ? `, ${uhr(t.von)}${t.bis ? `–${uhr(t.bis)}` : ""}` : ""}
          </div>
        </div>
        <span className="zahl shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand dark:bg-brand/20">+{schicht.aktion.prozent} %</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => void antwort(true)} className="btn-primary !min-h-[2.75rem] !text-[15px]">
          Ja, war da
        </button>
        <button disabled={busy} onClick={() => void antwort(false)} className="btn-grau !min-h-[2.75rem] !text-[15px]">
          Nein
        </button>
      </div>
    </section>
  );
}

function Kachel({ titel, wert, unter, onClick }: { titel: string; wert: string; unter?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card flex min-w-0 flex-col items-start p-4 text-left transition active:scale-[.98]">
      <span className="w-full truncate text-[12px] font-semibold text-tinte-leise">{titel}</span>
      <span className="zahl mt-1 w-full truncate font-zahl text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">{wert}</span>
      {unter && <span className="mt-0.5 w-full truncate text-[12px] text-tinte-leise">{unter}</span>}
    </button>
  );
}

function Zeile({ zeichen, titel, unter, onClick, hervor }: { zeichen: string; titel: string; unter?: string; onClick: () => void; hervor?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-papier-matt dark:active:bg-slate-800">
      <span className="w-7 shrink-0 text-center text-[20px] leading-none">{zeichen}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] ${hervor ? "font-bold" : "font-semibold"}`}>{titel}</span>
        {unter && <span className="block truncate text-[12px] text-tinte-leise">{unter}</span>}
      </span>
      <span className="shrink-0 text-tinte-leise">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  );
}

/** „1.352 €“ – auf der Kachel ohne Cent, sonst wird die Zahl abgeschnitten. */
function rundEuro(cent: number): string {
  return `${Math.round(cent / 100).toLocaleString("de-DE")} €`;
}

function Weiter({ hell }: { hell?: boolean }) {
  return <div className={`mt-3 text-[12px] font-semibold ${hell ? "text-white/70" : "text-brand"}`}>Details ansehen ›</div>;
}
