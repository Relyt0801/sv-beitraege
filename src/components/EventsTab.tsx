import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SkelettKarten } from "./Skelett";
import { useEvents } from "../events-store";
import { useRole } from "../auth/RoleProvider";
import { WerHatGestimmt } from "./WerHatGestimmt";
import { Avatar } from "./Avatar";
import { committeeLabel } from "../lib/committees";
import { AELTER_AB_TAGEN, TYPE_META, gruppiereAehnliche, nachAlter, titelSchluessel, type EventItem } from "../lib/events";
import { Wochenstreifen } from "./Wochenstreifen";
import { Kalender } from "./Kalender";
import { TERMIN_NEU_EREIGNIS, TERMIN_NEU_MERKER, TerminSheet, TerminAnsehen, type TerminNeuDetail } from "./TerminSheet";
import { anfrageAlsEntwurf, heuteKey, type NeuerTermin, type Termin, type TerminAnfrage } from "../lib/termine";
import { AktionenListe, MeineSchichten, Winkel, ZweiSpalten, useMeineSchichten } from "./AktionenListe";
import { AbschlussHinweis, useOffeneAbschluesse } from "./SchichtAbschluss";
import { AnfragenFuerTeam, MeineAnfragen } from "./TerminAnfragen";
import { useTermine } from "../termine-store";
import { PrivatTerminSheet } from "./KalenderSyncSheet";
import { UmfragenKarte } from "./Umfragen";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Symbol, Zeile } from "./Liste";
import { Icon } from "./Icon";
import { useBreit } from "../lib/gescrollt";
import { hinScrollen } from "../lib/sprung";

import { frage } from "../lib/melder";

/** Kleiner Abschnittstitel direkt auf dem Hintergrund (wie Gruppe in Liste.tsx). */
const ABSCHNITT = "auf-bild mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise";

/** Geschätzte Höhe einer Karte im Feed (für die zwei Laptop-Spalten). */
function kartenHoehe(e: EventItem): number {
  const text = Math.ceil((e.body || "").length / 90);
  return e.type === "umfrage" ? 2.5 + e.options.length * 1.3 + text : 2 + text;
}

/**
 * Ziel aus der Adresse „#events/<ziel>“ (Absprache R2: App.tsx öffnet den
 * Reiter und lässt die Marke stehen, der Reiter liest das Ziel selbst):
 *   <event-id>     Abstimmung oder Info im Blatt öffnen
 *   termin-<id>    einen Termin (eine Schicht) im Blatt öffnen
 *   bitte          zu „Bitte ansehen“ scrollen (fehlt der Block: wie „infos“)
 *   infos          zum Abschnitt „Infos & Abstimmungen“ (Wichtiges fürs Team
 *                  steht dort, nicht unter „Bitte ansehen“)
 */
function zielAusAdresse(): string | null {
  const m = window.location.hash.match(/^#events\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function EventsTab() {
  const { events, ready, myVotes, voteCounts, voters, reads, vote, deleteEvent, markRead } = useEvents();
  const { isStaff, can } = useRole();
  const { anfrageEntscheiden, termineGesehen, aktionen, termine, ready: termineBereit } = useTermine();

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
  // Der im Wochenstreifen gewählte Tag: „Deine Schichten“ zeigt diesen Tag nicht
  // noch einmal (steht ja schon direkt darüber in der Tagesliste).
  const [streifenTag, setStreifenTag] = useState(heuteKey());
  // Aus einer übernommenen Anfrage vorausgefüllt – und die Anfrage, die
  // danach abgehakt wird.
  const [entwurf, setEntwurf] = useState<NeuerTermin | null>(null);
  const [ausAnfrage, setAusAnfrage] = useState<string | null>(null);
  // Beitrag, dessen „…“-Blatt offen ist (Löschen fürs Team)
  const [mehrVon, setMehrVon] = useState<EventItem | null>(null);
  // Eintrag unter „Bitte ansehen“, dessen Blatt offen ist (abstimmen, lesen)
  const [bitteOffen, setBitteOffen] = useState<string | null>(null);
  const darfTermine = isStaff || can("termine.manage");
  const meineSchichten = useMeineSchichten(streifenTag);
  const offeneAbschluesse = useOffeneAbschluesse();
  // Laptop/iPad quer (ab 1024 px): rechts neben „Diese Woche“ eine Spalte mit
  // dem, was jetzt dran ist – sonst endete dort alles in der Bildschirmmitte.
  const breit = useBreit();

  const terminNeu = (datum: string) => {
    setBearbeite(null);
    setEntwurf(null);
    setAusAnfrage(null);
    setStartDatum(datum);
    setFormOffen(true);
  };

  // Das Blatt, aus dem „Ändern“ kam (Termin/Schicht), bleibt offen: das
  // Formular geht als Unterseite darüber auf („‹ Waffelteig backen“), Esc und
  // Speichern führen dorthin zurück, ✕ schließt beide (Sheet.tsx, Stapel).
  // Vorher ersetzte das Formular das Blatt, und Esc landete in der Liste.
  const terminAendern = (t: Termin) => {
    setBearbeite(t);
    setEntwurf(null);
    setAusAnfrage(null);
    setStartDatum(t.datum);
    setFormOffen(true);
  };

  const anfrageUebernehmen = (a: TerminAnfrage) => {
    setBearbeite(null);
    setEntwurf(anfrageAlsEntwurf(a));
    setAusAnfrage(a.id);
    setStartDatum(a.datum);
    setFormOffen(true);
  };

  // „Neu“ → „Termin“ (EventComposer): Formular am gewählten Tag öffnen. Kommt
  // das Ereignis, während der Reiter noch nicht da ist, liegt ein Merker in
  // sessionStorage – den holen wir beim ersten Zeichnen ab.
  const tagRef = useRef(streifenTag);
  tagRef.current = streifenTag;
  useEffect(() => {
    if (!darfTermine) return;
    const auf = (e?: Event) => {
      const d = (e as CustomEvent<TerminNeuDetail> | undefined)?.detail;
      if (d) d.erledigt = true;
      try {
        sessionStorage.removeItem(TERMIN_NEU_MERKER);
      } catch {
        /* privates Fenster */
      }
      setKalenderOffen(false);
      setAngesehen(null);
      terminNeu(tagRef.current);
    };
    let gemerkt = false;
    try {
      gemerkt = sessionStorage.getItem(TERMIN_NEU_MERKER) === "1";
    } catch {
      /* privates Fenster */
    }
    if (gemerkt) auf();
    window.addEventListener(TERMIN_NEU_EREIGNIS, auf);
    return () => window.removeEventListener(TERMIN_NEU_EREIGNIS, auf);
    // terminNeu setzt nur State – bewusst nicht als Abhängigkeit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darfTermine]);

  // Sprung zu einem Eintrag (#events/<ziel>, z. B. aus „Für dich offen“ in der
  // Übersicht): Marke sofort aus der Adresse nehmen (sonst springt ein
  // Neuladen wieder hin), Ziel merken und ausführen, sobald die Daten da sind.
  const [ziel, setZiel] = useState<string | null>(null);
  useLayoutEffect(() => {
    const lesen = () => {
      const z = zielAusAdresse();
      if (!z) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setZiel(z);
    };
    lesen();
    window.addEventListener("hashchange", lesen);
    return () => window.removeEventListener("hashchange", lesen);
  }, []);
  useEffect(() => {
    if (!ziel || !ready || !termineBereit) return;
    setZiel(null);
    if (ziel === "bitte" || ziel === "infos") {
      // Erst zeichnen lassen (Reiterwechsel springt nach oben), dann hin
      setTimeout(() => {
        if (ziel === "bitte" && document.getElementById("events-bitte")) return hinScrollen("events-bitte");
        // Abschnitt beginnt knapp unter dem Kopf (scroll-mt) – mittig stünde
        // bei einem langen Feed nur die Mitte der Karten im Bild
        document.getElementById("events-infos")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return;
    }
    if (ziel.startsWith("termin-")) {
      const t = termine.find((x) => x.id === ziel.slice(7));
      if (t) {
        setKalenderOffen(false);
        setAngesehen(t);
      }
      return;
    }
    if (events.some((e) => e.id === ziel)) {
      setKalenderOffen(false);
      setBitteOffen(ziel);
    }
  }, [ziel, ready, termineBereit, events, termine]);

  // Reiter „Events“ noch einmal angetippt (lib/gescrollt.ts): zurück zur
  // Wurzel – ein offener Kalender schließt, wie ein Chat in „Chats“.
  useEffect(() => {
    const wurzel = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "events") setKalenderOffen(false);
    };
    window.addEventListener("sv:reiter-wurzel", wurzel);
    return () => window.removeEventListener("sv:reiter-wurzel", wurzel);
  }, []);

  // ----------------------------------------------------------- Feed ordnen
  // 1. Ältere Beiträge (> 14 Tage) wandern in den eingeklappten Teil – außer
  //    Abstimmungen, bei denen man noch nicht abgestimmt hat.
  // 2. Ebenso Infos, die zu einer laufenden Aktion gehören (z. B. „Waffelverkauf
  //    – neue Schichten“): Die Aktion steht schon unter „Mitmachen“, die Infos
  //    dazu nicht noch einmal ganz oben (Prüfung 15.10.2026: Waffelverkauf
  //    stand an vier Stellen). Wichtiges (rot) und Abstimmungen bleiben oben.
  // 3. Offene Abstimmungen und (für Schüler) Wichtiges stehen als kurze
  //    Zeilen unter „Bitte ansehen“ – am Laptop rechts neben „Diese Woche“,
  //    am Handy direkt hinter „Mitmachen“ (davor verdrängten sie das erste
  //    „Eintragen“ vom Bildschirm; in der Übersicht stehen sie ohnehin oben).
  //    Vorher standen sie als Karten im Feed unter allen Aktionen (iPhone SE:
  //    bei 1200 bzw. 1620 px). Wer einmal dort war, bleibt, solange der
  //    Reiter offen ist – sonst springt die Karte beim Abstimmen weg.
  // 4. Gleichartige Beiträge (ab drei) zu einer aufklappbaren Gruppe – siehe
  //    gruppiereAehnliche in lib/events.ts.
  const [aelterOffen, setAelterOffen] = useState(false);
  const obenGemerkt = useRef(new Map<string, number>());
  const aktionsSchluessel = useMemo(
    () => new Set(aktionen.filter((a) => !a.geschlossen).map((a) => titelSchluessel(a.titel))),
    [aktionen],
  );
  const { bitte, feed, aelter, nurAktion } = useMemo(() => {
    const offen = (e: EventItem) => e.type === "umfrage" && !(myVotes[e.id] || []).length;
    const { aktuell, aelter: alt } = nachAlter(events, offen);
    const zuAktion = (e: EventItem) =>
      e.type !== "umfrage" && !e.is_warning && aktionsSchluessel.has(titelSchluessel(e.title));
    // Merken, was nach oben gehört (0 = offene Abstimmung, 1 = Wichtiges) –
    // erst wenn auch die eigenen Stimmen geladen sind (ready)
    const gemerkt = obenGemerkt.current;
    if (ready) for (const e of aktuell) {
      if (gemerkt.has(e.id) || zuAktion(e)) continue;
      if (offen(e)) gemerkt.set(e.id, 0);
      else if (e.is_warning && !isStaff) gemerkt.set(e.id, 1);
    }
    const oben = aktuell.filter((e) => !zuAktion(e) && !gemerkt.has(e.id));
    const beiAktion = aktuell.filter(zuAktion);
    const vorne = (e: EventItem) => (offen(e) ? 0 : e.is_warning ? 1 : 2);
    const sortiert = [...oben].sort((a, b) => vorne(a) - vorne(b) || b.created_at.localeCompare(a.created_at));
    return {
      bitte: events
        .filter((e) => gemerkt.has(e.id))
        .sort((a, b) => gemerkt.get(a.id)! - gemerkt.get(b.id)! || b.created_at.localeCompare(a.created_at)),
      feed: gruppiereAehnliche(sortiert, (e) => e.title),
      // Neueste zuerst, dann die wirklich alten
      aelter: [...beiAktion, ...alt.filter((e) => !gemerkt.has(e.id))],
      nurAktion: beiAktion.length,
    };
  }, [events, myVotes, aktionsSchluessel, isStaff, ready]);

  // Beim Ansehen als gelesen markieren. Wichtige Infos (Schüler) erst, wenn
  // man sie wirklich öffnet: Sie stehen unter „Bitte ansehen“ und in der
  // Übersicht unter „Für dich offen“ – vorher verschwanden sie dort schon,
  // wenn man den Reiter nur kurz antippte, ohne sie gesehen zu haben.
  useEffect(() => {
    for (const e of events) if (!reads.has(e.id) && (isStaff || !e.is_warning)) markRead(e.id);
  }, [events, reads, markRead, isStaff]);

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
      onMehr={isStaff ? () => setMehrVon(e) : undefined}
      onVote={(optId) => vote(e.id, optId, e.poll_multiple)}
    />
  );

  const loeschenFragen = async (e: EventItem, danach: () => void) => {
    if (await frage(`„${e.title}“ wirklich löschen?`, "Löschen", true)) {
      danach();
      void deleteEvent(e.id);
    }
  };

  // „Bitte ansehen“: offene Abstimmungen und (für Schüler) Wichtiges als
  // kurze Zeilen – antippen öffnet das Blatt zum Abstimmen bzw. Lesen. Als
  // ganze Karten vor „Mitmachen“ schoben sie das am Handy um eine
  // Bildschirmhöhe nach unten (iPhone SE: erstes „Eintragen“ bei 1318 statt
  // 736 px); darum am Handy jetzt hinter „Mitmachen“.
  const bitteBlock =
    ready && bitte.length > 0 ? (
      // id: Sprungziel „#events/bitte“ (Weitere Abstimmungen/Infos in der Übersicht)
      <div id="events-bitte" className="mb-5 scroll-mt-[calc(var(--kopf)+1rem)]">
      <Gruppe titel="Bitte ansehen" className="">
        {bitte.map((e) => {
          const umfrage = e.type === "umfrage";
          const abgestimmt = umfrage && (myVotes[e.id] || []).length > 0;
          return (
            <Zeile
              key={e.id}
              onClick={() => setBitteOffen(e.id)}
              symbol={
                <Symbol farbe={e.is_warning ? "bg-[#FF3B30]" : "bg-[#0A84FF]"}>
                  <Icon name={umfrage ? "umfrage" : "info"} size={17} strich={2.2} />
                </Symbol>
              }
              label={<span className="line-clamp-2 font-semibold">{e.title}</span>}
              unter={
                umfrage ? (
                  abgestimmt ? (
                    "Abstimmung · du hast abgestimmt"
                  ) : (
                    <span className="font-semibold text-brand-dark dark:text-brand">Abstimmung · stimm ab</span>
                  )
                ) : (
                  <span className="line-clamp-1">{e.body || "Wichtige Info"}</span>
                )
              }
            />
          );
        })}
      </Gruppe>
      </div>
    ) : null;
  const offenesBitte = bitteOffen ? events.find((e) => e.id === bitteOffen) ?? null : null;
  // Geöffnet = gelesen (auch für wichtige Infos)
  useEffect(() => {
    if (offenesBitte && !reads.has(offenesBitte.id)) markRead(offenesBitte.id);
  }, [offenesBitte, reads, markRead]);

  // Rechte Spalte am Laptop: nur, wenn etwas drinsteht
  const rechteSpalte = breit && (offeneAbschluesse.length > 0 || meineSchichten.length > 0 || bitteBlock !== null);

  // Rund um den Feed stehen immer der Wochenstreifen und die Aufbauten fuer
  // Kalender und Termine – auch waehrend die Events noch laden.
  const rahmen = (inhalt: React.ReactNode) => (
    <>
      {/* Reihenfolge = Wichtigkeit, damit man nichts suchen muss:
          1. Diese Woche (heute sofort sichtbar), fürs Team mit „+“ zum Eintragen
          2. Was jetzt zu tun ist: Anfragen, vorbei-Schichten bestätigen
          3. Deine Schichten (grüne Tickets)
          4. Mitmachen – gleichartige Aktionen zu Gruppen zusammengefasst
          5. Bitte ansehen: offene Abstimmungen, Wichtiges (kurze Zeilen)
          6. Infos & Abstimmungen – Ältere eingeklappt
          Am Laptop stehen 2, 3 und 5 als Spalte rechts neben „Diese Woche“
          (sonst endeten die Tickets in der Bildschirmmitte, daneben war alles
          leer). Am Handy steht „Bitte ansehen“ HINTER „Mitmachen“: davor schob
          es das erste „Eintragen“ unter die Reiterleiste (iPhone: 855 statt
          736 px) – und dieselben Zeilen stehen schon in der Übersicht unter
          „Für dich offen“. */}
      <div className={rechteSpalte ? "grid grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] items-start gap-4" : undefined}>
        <Wochenstreifen
          onKalender={(tag) => {
            setKalenderTag(tag);
            setKalenderOffen(true);
            termineGesehen();
          }}
          onOeffnen={(t) => setAngesehen(t)}
          onNeu={darfTermine ? terminNeu : undefined}
          onTag={setStreifenTag}
        />
        {rechteSpalte && (
          <div className="min-w-0">
            <AbschlussHinweis />
            <MeineSchichten ausserTag={streifenTag} spalte />
            {bitteBlock}
          </div>
        )}
      </div>

      <MeineAnfragen />
      <AnfragenFuerTeam onUebernehmen={anfrageUebernehmen} />

      {!rechteSpalte && (
        <>
          {/* Offene Schichten zum Bestätigen – bleibt, auch wenn das Pop-up weggewischt wurde */}
          <AbschlussHinweis />
          <MeineSchichten ausserTag={streifenTag} />
        </>
      )}

      <AktionenListe onAendern={darfTermine ? terminAendern : undefined} />

      {!rechteSpalte && bitteBlock}

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

      {angesehen && (
        <TerminAnsehen
          termin={angesehen}
          onSchliessen={() => setAngesehen(null)}
          onBearbeiten={darfTermine ? () => terminAendern(angesehen) : undefined}
        />
      )}

      {/* „…“ an einer Karte: Löschen weg von der Karte, unten im Blatt mit Rückfrage */}
      {mehrVon && (
        <Sheet open onClose={() => setMehrVon(null)}>
          <SheetKopf
            titel={mehrVon.title}
            unter={`${mehrVon.type === "umfrage" ? "Abstimmung" : mehrVon.is_warning ? "Wichtige Info" : "Info"} · ${wann(mehrVon.created_at)}`}
            onClose={() => setMehrVon(null)}
          />
          <Gruppe className="mt-2" fuss="Gelöscht ist der Beitrag für alle weg – auch abgegebene Stimmen.">
            <Zeile
              rot
              label={mehrVon.type === "umfrage" ? "Abstimmung löschen …" : "Info löschen …"}
              onClick={() => void loeschenFragen(mehrVon, () => setMehrVon(null))}
            />
          </Gruppe>
        </Sheet>
      )}

      {/* „Bitte ansehen“: Abstimmung bzw. wichtige Info im Blatt */}
      {offenesBitte && (
        <Sheet open onClose={() => setBitteOffen(null)}>
          <SheetKopf
            titel={offenesBitte.title}
            unter={`${offenesBitte.type === "umfrage" ? "Abstimmung" : offenesBitte.is_warning ? "Wichtige Info" : "Info"} · ${wann(offenesBitte.created_at)}`}
            onClose={() => setBitteOffen(null)}
          />
          <EventCard
            e={offenesBitte}
            imBlatt
            mine={myVotes[offenesBitte.id] || []}
            counts={voteCounts[offenesBitte.id] || {}}
            stimmen={voters[offenesBitte.id] || []}
            canSeeResults={offenesBitte.poll_show_results || isStaff}
            zeigeWaehler={!offenesBitte.poll_anon || isStaff}
            onVote={(optId) => vote(offenesBitte.id, optId, offenesBitte.poll_multiple)}
          />
          {isStaff && (
            <Gruppe className="mt-8" fuss="Gelöscht ist der Beitrag für alle weg – auch abgegebene Stimmen.">
              <Zeile
                rot
                label={offenesBitte.type === "umfrage" ? "Abstimmung löschen …" : "Info löschen …"}
                onClick={() => void loeschenFragen(offenesBitte, () => setBitteOffen(null))}
              />
            </Gruppe>
          )}
        </Sheet>
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
        <h3 className={ABSCHNITT}>Infos & Abstimmungen</h3>
        <div className="card px-5 py-6 text-center">
          <div className="text-[15px] font-semibold">Noch keine Infos</div>
          <div className="mt-1 text-[13px] text-tinte-leise">
            {isStaff ? (
              // „Neu“ schwebt am Handy unten rechts, ab iPad steht es oben rechts im Kopf
              <>
                Mit „Neu“ <span className="md:hidden">unten rechts</span>
                <span className="hidden md:inline">oben rechts</span> schreibst du die erste Info oder Abstimmung.
              </>
            ) : (
              "Sobald das Stufenteam etwas schreibt, steht es hier."
            )}
          </div>
        </div>
      </section>,
    );

  // Steht alles Aktuelle schon unter „Bitte ansehen“, braucht es hier kein
  // „Gerade nichts Neues“.
  if (feed.length === 0 && aelter.length === 0 && bitte.length > 0) return rahmen(null);

  return rahmen(
    // id: Sprungziel „#events/infos“ (Weitere wichtige Infos fürs Team)
    <section id="events-infos" className="mb-5 scroll-mt-[calc(var(--kopf)+1rem)]">
      <h3 className={ABSCHNITT}>Infos & Abstimmungen</h3>
      {feed.length > 0 ? (
        <ZweiSpalten
          eintraege={feed}
          hoehe={(g) => (g.art === "einzeln" ? kartenHoehe(g.eintrag) : 2)}
        >
          {(g) =>
            g.art === "einzeln" ? (
              karte(g.eintrag)
            ) : (
              <EventGruppe key={`g-${g.schluessel}`} titel={g.titel} events={g.eintraege} karte={(e) => karte(e, true)} />
            )
          }
        </ZweiSpalten>
      ) : bitte.length === 0 ? (
        <div className="card px-5 py-5 text-center text-[14px] text-tinte-leise">Gerade nichts Neues.</div>
      ) : null}

      {/* Weitere Beiträge: eingeklappt, damit oben nur Aktuelles steht */}
      {aelter.length > 0 && (
        <div className={feed.length > 0 ? "mt-3" : ""}>
          <button
            onClick={() => setAelterOffen(!aelterOffen)}
            aria-expanded={aelterOffen}
            className="liste flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Weitere Beiträge</span>
              <span className="block text-[13px] text-tinte-leise">
                {aelter.length} {aelter.length === 1 ? "Beitrag" : "Beiträge"}
                {nurAktion > 0 ? ` · ${nurAktion} zu Aktionen oben` : ""}
                {aelter.length > nurAktion ? ` · älter als ${AELTER_AB_TAGEN} Tage` : ""}
              </span>
            </span>
            <span className="text-tinte-leise">
              <Winkel auf={aelterOffen} />
            </span>
          </button>
          {aelterOffen && (
            <ZweiSpalten eintraege={aelter} hoehe={kartenHoehe} className="mt-3 animate-fadeIn">
              {(e) => karte(e)}
            </ZweiSpalten>
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
  imBlatt = false,
  mine,
  counts,
  stimmen,
  canSeeResults,
  zeigeWaehler,
  onMehr,
  onVote,
}: {
  e: EventItem;
  /** ohne eigene Karte – als Zeile in einer Gruppe */
  flach?: boolean;
  /** im Blatt: Art, Datum und Titel stehen schon im SheetKopf */
  imBlatt?: boolean;
  mine: string[];
  counts: Record<string, number>;
  stimmen: { option_id: string; user_id: string }[];
  canSeeResults: boolean;
  /** darf man sehen, WER gestimmt hat? sonst graue Kreise */
  zeigeWaehler: boolean;
  /** Team: „…“ oben rechts öffnet das Blatt mit „Löschen“ (statt eines roten „Löschen“ in jeder Karte) */
  onMehr?: () => void;
  onVote: (optionId: string) => void;
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
        imBlatt
          ? ""
          : flach
            ? "px-4 py-3.5"
            : `card p-4 sm:p-5 ${e.is_warning ? "!bg-[#FFF2F1] dark:!bg-[#2A1514]" : ""}`
      }
    >
      {!imBlatt && (
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
        {e.is_warning && <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />}
        <span className={`uppercase tracking-[0.03em] ${artFarbe}`}>{art}</span>
        {e.audience === "selected" && <span className="text-tinte-leise">· gezielt</span>}
        {e.audience === "komitee" && (
          <span className="truncate text-tinte-leise">· {(e.tags || []).map(committeeLabel).join(", ") || "Komitees"}</span>
        )}
        <span className="ml-auto shrink-0 font-normal text-tinte-leise">{wann(e.created_at)}</span>
        {onMehr && (
          <button
            type="button"
            onClick={onMehr}
            aria-label={`Mehr zu „${e.title}“`}
            title="Mehr"
            className="-my-3 -mr-2.5 ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:bg-black/[0.05] dark:active:bg-white/[0.08]"
          >
            <MehrPunkte />
          </button>
        )}
      </div>
      )}

      {!imBlatt && (
        <div className={`text-[17px] font-semibold leading-snug ${e.is_warning ? "text-red-700 dark:text-red-300" : ""}`}>{e.title}</div>
      )}
      {e.body && (
        <div className={`whitespace-pre-wrap text-[15px] leading-relaxed text-tinte-matt dark:text-slate-300 ${imBlatt ? "mb-1 px-1" : "mt-1"}`}>
          {e.body}
        </div>
      )}
      {imBlatt && e.audience !== "all" && (
        <div className="mt-1 px-1 text-[13px] text-tinte-leise">
          {e.audience === "selected" ? "Gezielt an einzelne Personen" : `Für ${(e.tags || []).map(committeeLabel).join(", ") || "Komitees"}`}
        </div>
      )}

      {e.type === "umfrage" && (
        <div className={imBlatt ? "mt-2" : "mt-3"}>
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

/** Drei Punkte („…“) wie der Mehr-Knopf in iOS – nimmt die Schriftfarbe an. */
function MehrPunkte() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </svg>
  );
}
