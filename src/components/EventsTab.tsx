import { useEffect, useMemo, useState } from "react";
import { SkelettKarten } from "./Skelett";
import { useEvents } from "../events-store";
import { useRole } from "../auth/RoleProvider";
import { WerHatGestimmt } from "./WerHatGestimmt";
import { Avatar } from "./Avatar";
import { committeeLabel } from "../lib/committees";
import { AELTER_AB_TAGEN, TYPE_META, gruppiereAehnliche, nachAlter, type EventItem } from "../lib/events";
import { Wochenstreifen } from "./Wochenstreifen";
import { Kalender } from "./Kalender";
import { TerminSheet, TerminAnsehen } from "./TerminSheet";
import { anfrageAlsEntwurf, heuteKey, type NeuerTermin, type Termin, type TerminAnfrage } from "../lib/termine";
import { AktionenListe, MeineSchichten, Winkel } from "./AktionenListe";
import { AbschlussHinweis } from "./SchichtAbschluss";
import { AnfragenFuerTeam, MeineAnfragen } from "./TerminAnfragen";
import { useTermine } from "../termine-store";
import { PrivatTerminSheet } from "./KalenderSyncSheet";
import { UmfragenKarte } from "./Umfragen";

import { frage } from "../lib/melder";
export function EventsTab() {
  const { events, ready, myVotes, voteCounts, voters, reads, vote, deleteEvent, markRead } = useEvents();
  const { isStaff, can } = useRole();
  const { anfrageEntscheiden, termineGesehen } = useTermine();

  // Kalender und Terminformular liegen ueber dem Reiter, nicht darin.
  const [kalenderOffen, setKalenderOffen] = useState(false);
  const [formOffen, setFormOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Termin | null>(null);
  const [angesehenRoh, setAngesehen] = useState<Termin | null>(null);
  // Termine aus dem eigenen Handy-Kalender (Testphase) nur ansehen – nie ins
  // Formular zum Ändern oder Löschen, die gibt es in der Datenbank ja nicht.
  const angesehen = angesehenRoh && !angesehenRoh.privat ? angesehenRoh : null;
  const privatAngesehen = angesehenRoh?.privat ? angesehenRoh : null;
  const [startDatum, setStartDatum] = useState(heuteKey());
  const [kalenderTag, setKalenderTag] = useState(heuteKey());
  // Aus einer übernommenen Anfrage vorausgefüllt – und die Anfrage, die
  // danach abgehakt wird.
  const [entwurf, setEntwurf] = useState<NeuerTermin | null>(null);
  const [ausAnfrage, setAusAnfrage] = useState<string | null>(null);
  const darfTermine = isStaff || can("termine.manage");

  const terminNeu = (datum: string) => {
    setBearbeite(null);
    setEntwurf(null);
    setAusAnfrage(null);
    setStartDatum(datum);
    setFormOffen(true);
  };

  const anfrageUebernehmen = (a: TerminAnfrage) => {
    setBearbeite(null);
    setEntwurf(anfrageAlsEntwurf(a));
    setAusAnfrage(a.id);
    setStartDatum(a.datum);
    setFormOffen(true);
  };

  // ----------------------------------------------------------- Feed ordnen
  // 1. Ältere Beiträge (> 14 Tage) wandern in den eingeklappten Teil – außer
  //    Abstimmungen, bei denen man noch nicht abgestimmt hat.
  // 2. Offene Abstimmungen und Wichtiges nach oben: das ist die Aktion, die
  //    man hier tun soll.
  // 3. Gleichartige Beiträge (ab drei, z. B. „Waffelverkauf …“) zu einer
  //    aufklappbaren Gruppe – siehe gruppiereAehnliche in lib/events.ts.
  const [aelterOffen, setAelterOffen] = useState(false);
  const { feed, aelter } = useMemo(() => {
    const offen = (e: EventItem) => e.type === "umfrage" && !(myVotes[e.id] || []).length;
    const { aktuell, aelter } = nachAlter(events, offen);
    const vorne = (e: EventItem) => (offen(e) ? 0 : e.is_warning ? 1 : 2);
    const sortiert = [...aktuell].sort((a, b) => vorne(a) - vorne(b) || b.created_at.localeCompare(a.created_at));
    return { feed: gruppiereAehnliche(sortiert, (e) => e.title), aelter };
  }, [events, myVotes]);

  // Beim Ansehen als gelesen markieren
  useEffect(() => {
    for (const e of events) if (!reads.has(e.id)) markRead(e.id);
  }, [events, reads, markRead]);

  // Rund um den Feed stehen immer der Wochenstreifen und die Aufbauten fuer
  // Kalender und Termine – auch waehrend die Events noch laden.
  const rahmen = (inhalt: React.ReactNode) => (
    <>
      {/* Reihenfolge = Wichtigkeit, damit man nichts suchen muss:
          1. Diese Woche (heute sofort sichtbar), fürs Team mit „+“ zum Eintragen
          2. Was jetzt zu tun ist: Anfragen, vorbei-Schichten bestätigen
          3. Deine Schichten (grüne Tickets)
          4. Mitmachen – gleichartige Aktionen zu Gruppen zusammengefasst
          5. Infos & Abstimmungen – offene zuerst, Ältere eingeklappt */}
      <Wochenstreifen
        onKalender={(tag) => {
          setKalenderTag(tag);
          setKalenderOffen(true);
          termineGesehen();
        }}
        onOeffnen={(t) => setAngesehen(t)}
        onNeu={darfTermine ? terminNeu : undefined}
      />

      <MeineAnfragen />
      <AnfragenFuerTeam onUebernehmen={anfrageUebernehmen} />

      {/* Offene Schichten zum Bestätigen – bleibt, auch wenn das Pop-up weggewischt wurde */}
      <AbschlussHinweis />

      <MeineSchichten />
      <AktionenListe />

      {/* Pop-up-Umfragen: laufende auf einen Blick (Team mit Recht) */}
      <UmfragenKarte />

      {inhalt}

      {kalenderOffen && (
        <Kalender
          startTag={kalenderTag}
          onSchliessen={() => setKalenderOffen(false)}
          onNeu={darfTermine ? terminNeu : undefined}
          onOeffnen={(t) => setAngesehen(t)}
        />
      )}

      <TerminSheet
        offen={formOffen}
        termin={bearbeite}
        startDatum={startDatum}
        entwurf={entwurf}
        onGespeichert={() => {
          // Erst wenn der Termin wirklich steht, gilt die Anfrage als erledigt.
          if (ausAnfrage) void anfrageEntscheiden(ausAnfrage, "angenommen");
        }}
        onSchliessen={() => {
          setFormOffen(false);
          setBearbeite(null);
          setEntwurf(null);
          setAusAnfrage(null);
        }}
      />

      <PrivatTerminSheet termin={privatAngesehen} onClose={() => setAngesehen(null)} />

      {angesehen && !formOffen && (
        <TerminAnsehen
          termin={angesehen}
          onSchliessen={() => setAngesehen(null)}
          onBearbeiten={
            darfTermine
              ? () => {
                  setBearbeite(angesehen);
                  setEntwurf(null);
                  setAusAnfrage(null);
                  setStartDatum(angesehen.datum);
                  setAngesehen(null);
                  setFormOffen(true);
                }
              : undefined
          }
        />
      )}
    </>
  );

  if (!ready) {
    return rahmen(
      <SkelettKarten n={3} gross />,
    );
  }
  if (events.length === 0)
    return rahmen(
      <section className="mb-5">
        <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Infos & Abstimmungen</h3>
        <div className="card px-5 py-6 text-center">
          <div className="text-[15px] font-semibold">Noch keine Infos</div>
          <div className="mt-1 text-[13px] text-tinte-leise">
            {isStaff ? "Mit „+“ unten rechts schreibst du die erste Info oder Abstimmung." : "Sobald das Stufenteam etwas schreibt, steht es hier."}
          </div>
        </div>
      </section>,
    );

  // Eine Karte bauen – im Feed, in einer Gruppe und unter „Älter“ gleich
  const karte = (e: EventItem, flach = false) => (
    <EventCard
      key={e.id}
      e={e}
      flach={flach}
      mine={myVotes[e.id] || []}
      counts={voteCounts[e.id] || {}}
      stimmen={voters[e.id] || []}
      canSeeResults={e.poll_show_results || isStaff}
      zeigeWaehler={!e.poll_anon || isStaff}
      canDelete={isStaff}
      onVote={(optId) => vote(e.id, optId, e.poll_multiple)}
      onDelete={async () => {
        if (await frage("Dieses Event wirklich löschen?", "Löschen", true)) void deleteEvent(e.id);
      }}
    />
  );

  return rahmen(
    <section className="mb-5">
      <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Infos & Abstimmungen</h3>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {feed.map((g) =>
          g.art === "einzeln" ? (
            karte(g.eintrag)
          ) : (
            <EventGruppe key={`g-${g.schluessel}`} titel={g.titel} events={g.eintraege} karte={(e) => karte(e, true)} />
          ),
        )}
      </div>

      {/* Ältere Beiträge: eingeklappt, damit oben nur Aktuelles steht */}
      {aelter.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setAelterOffen(!aelterOffen)}
            aria-expanded={aelterOffen}
            className="liste flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Ältere Beiträge</span>
              <span className="block text-[13px] text-tinte-leise">
                {aelter.length} {aelter.length === 1 ? "Beitrag" : "Beiträge"} älter als {AELTER_AB_TAGEN} Tage
              </span>
            </span>
            <span className="text-tinte-leise">
              <Winkel auf={aelterOffen} />
            </span>
          </button>
          {aelterOffen && (
            <div className="mt-3 grid animate-fadeIn items-start gap-3 lg:grid-cols-2">{aelter.map((e) => karte(e))}</div>
          )}
        </div>
      )}
    </section>,
  );
}

/** „heute“, „gestern“, „vor 3 Tagen“, sonst „12.10.“ – für den Kopf einer Karte. */
function wann(iso: string): string {
  const d = new Date(iso);
  const tage = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (tage <= 0) return "heute";
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: tage > 300 ? "2-digit" : undefined });
}

/**
 * Mehrere gleichartige Beiträge („Waffelverkauf …“) als EINE aufklappbare
 * Karte: Kopf mit Titel, Anzahl und dem neuesten Beitrag als Vorschau.
 * Aufgeklappt stehen die Beiträge untereinander, mit Trennlinien.
 */
function EventGruppe({
  titel, events, karte,
}: {
  titel: string;
  events: EventItem[];
  karte: (e: EventItem) => React.ReactNode;
}) {
  const [auf, setAuf] = useState(false);
  const neuester = events[0];
  return (
    <div className="liste shadow-card dark:shadow-none">
      <button
        onClick={() => setAuf(!auf)}
        aria-expanded={auf}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
      >
        {/* Gestapelte Blätter: zeigt ohne Worte, dass hier mehrere drinstecken */}
        <span aria-hidden className="relative h-10 w-10 shrink-0">
          <span className="absolute inset-x-1 top-0 h-8 rounded-[9px] bg-brand/25" />
          <span className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center rounded-[10px] bg-brand text-[13px] font-bold text-white">
            {events.length}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold leading-tight">{titel}</span>
          <span className="mt-0.5 block truncate text-[13px] text-tinte-leise">
            {events.length} Beiträge · zuletzt {wann(neuester.created_at)}
          </span>
          {!auf && <span className="mt-0.5 block truncate text-[13px] text-tinte-matt dark:text-slate-300">{neuester.title}</span>}
        </span>
        <span className="text-tinte-leise">
          <Winkel auf={auf} />
        </span>
      </button>
      {auf && events.map((e) => <div key={e.id} className="animate-fadeIn">{karte(e)}</div>)}
    </div>
  );
}

function EventCard({
  e,
  flach = false,
  mine,
  counts,
  stimmen,
  canSeeResults,
  zeigeWaehler,
  canDelete,
  onVote,
  onDelete,
}: {
  e: EventItem;
  /** ohne eigene Karte – als Zeile in einer Gruppe */
  flach?: boolean;
  mine: string[];
  counts: Record<string, number>;
  stimmen: { option_id: string; user_id: string }[];
  canSeeResults: boolean;
  /** darf man sehen, WER gestimmt hat? sonst graue Kreise */
  zeigeWaehler: boolean;
  canDelete: boolean;
  onVote: (optionId: string) => void;
  onDelete: () => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const meta = TYPE_META[e.type];
  const offen = e.type === "umfrage" && mine.length === 0;
  // Art als farbiges Wort statt Emoji: rot = wichtig, blau = Abstimmung
  const art = e.is_warning ? "Wichtig" : e.type === "umfrage" ? (offen ? "Abstimmung · stimm ab" : "Abstimmung") : meta.label;
  const artFarbe = e.is_warning ? "text-red-600 dark:text-red-400" : e.type === "umfrage" ? "text-brand" : "text-tinte-leise";

  return (
    <div
      className={
        flach
          ? "px-4 py-3.5"
          : `card p-4 sm:p-5 ${e.is_warning ? "!bg-[#FFF2F1] dark:!bg-[#2A1514]" : ""}`
      }
    >
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
        {e.is_warning && <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />}
        <span className={`uppercase tracking-[0.03em] ${artFarbe}`}>{art}</span>
        {e.audience === "selected" && <span className="text-tinte-leise">· gezielt</span>}
        {e.audience === "komitee" && (
          <span className="truncate text-tinte-leise">· {(e.tags || []).map(committeeLabel).join(", ") || "Komitees"}</span>
        )}
        <span className="ml-auto shrink-0 font-normal text-tinte-leise">{wann(e.created_at)}</span>
        {canDelete && (
          <button onClick={onDelete} className="ml-2 shrink-0 text-[12px] font-semibold text-red-500" aria-label="Löschen">
            Löschen
          </button>
        )}
      </div>

      <div className={`text-[17px] font-semibold leading-snug ${e.is_warning ? "text-red-700 dark:text-red-300" : ""}`}>{e.title}</div>
      {e.body && <div className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300">{e.body}</div>}

      {e.type === "umfrage" && (
        <div className="mt-3">
          {/* Antworten als Liste mit Trennlinien und dünnem Balken – wie Umfragen in iMessage */}
          <div className="overflow-hidden rounded-[14px] bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.24)]">
            {e.options.map((o, i) => {
              const c = counts[o.id] || 0;
              const pct = total > 0 ? Math.round((c / total) * 100) : 0;
              const picked = mine.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => onVote(o.id)}
                  aria-pressed={picked}
                  className={`relative block w-full px-3.5 py-2.5 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06] ${
                    i > 0 ? "border-t border-black/[0.06] dark:border-white/[0.08]" : ""
                  }`}
                >
                  <span className="relative flex items-center gap-2.5">
                    <span
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center border-[1.5px] text-[12px] font-bold text-white transition ${
                        e.poll_multiple ? "rounded-[6px]" : "rounded-full"
                      } ${picked ? "border-brand bg-brand" : "border-tinte-leise/50"}`}
                    >
                      {picked ? "✓" : ""}
                    </span>
                    <span className={`min-w-0 flex-1 text-[15px] ${picked ? "font-semibold" : ""}`}>{o.label}</span>
                    {canSeeResults && <span className="zahl shrink-0 text-[13px] text-tinte-leise">{pct} %</span>}
                  </span>
                  {canSeeResults && (
                    <span className="relative mt-2 ml-[32px] block h-[4px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.1]">
                      <span
                        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-ios ${picked ? "bg-brand" : "bg-tinte-leise/60"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  )}
                  {canSeeResults && c > 0 && (
                    <span className="relative mt-1.5 flex items-center pl-[32px]">
                      {zeigeWaehler
                        ? stimmen
                            .filter((v) => v.option_id === o.id)
                            .slice(0, 12)
                            .map((v, j) => (
                              <span key={v.user_id} style={{ marginLeft: j === 0 ? 0 : -8 }} className="relative">
                                <Avatar userId={v.user_id} size={20} ring />
                              </span>
                            ))
                        : null}
                      <span className={`text-[12px] text-tinte-leise ${zeigeWaehler ? "ml-1.5" : ""}`}>
                        {c} {c === 1 ? "Stimme" : "Stimmen"}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px] text-tinte-leise">
            <span>
              {canSeeResults ? `${total} Stimme${total === 1 ? "" : "n"}` : "Ergebnis ist ausgeblendet"}
              {e.poll_multiple && " · mehrere Antworten möglich"}
            </span>
          </div>
          {canSeeResults && zeigeWaehler && <WerHatGestimmt optionen={e.options} stimmen={stimmen} />}
        </div>
      )}
    </div>
  );
}
