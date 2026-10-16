import { HY, type Settings, type Student } from "../lib/types";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { abiballVon, basisOffen, beitragFuer, isPreJoin, naechsteStufe, prozentVon, ticketPreise } from "../lib/logic";
import { HalbjahrLegende, HalbjahrStreifen, TermChip } from "./TermChip";
import { StaffelKacheln, StaffelRing } from "./Staffel";
import { BeitragsListe } from "./BeitragsListe";
import { KontoTab } from "./KontoTab";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon, type IconName } from "./Icon";
import { useState } from "react";
import { TicketBereich } from "./AbiTicket";
import { ZuErledigen } from "./ZuErledigen";
import { useFunktionen } from "../lib/funktionen";
import { AlbumKarte } from "./Album";
import { ZitateKarte } from "./Zitate";
import { RankingKarten } from "./Rankings";
import { MottoKarte } from "./Motto";
import { UmfrageStichwahlen } from "./Umfragen";

/**
 * Die eigene Ansicht für alle, die nicht im Stufenteam sind.
 *
 * Ganz oben steht die eine Zahl, die zählt: was noch zu zahlen ist. Alles
 * andere ordnet sich darunter ein. Vorher standen offener Betrag, Prozente und
 * Ticketpreis gleichwertig nebeneinander – man musste erst suchen, worum es
 * geht.
 */
/**
 * Abschnittstitel mit Symbol wie in den iOS-Einstellungen: weißes
 * Linien-Symbol auf einer farbigen, abgerundeten Fläche.
 */
function Titel({ icon, farbe, children }: { icon: IconName; farbe: string; children: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
      <span aria-hidden className={`flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-white ${farbe}`}>
        <Icon name={icon} size={16} strich={2.2} />
      </span>
      {children}
    </h2>
  );
}

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
  const { sichtbar } = useFunktionen();
  const [ueberweisen, setUeberweisen] = useState(false);
  const [staffelOffen, setStaffelOffen] = useState(false);
  const [halbjahreOffen, setHalbjahreOffen] = useState(false);
  // Läuft der Ticketverkauf (rechts die Kasse)? Dann braucht das Ticket die
  // volle Breite – sonst steht es neben „Mithilfe bei Aktionen“.
  const [ticketBreit, setTicketBreit] = useState(false);

  if (!ready)
    return (
      <SkelettKarten n={3} gross />
    );

  if (!student)
    return (
      <>
        {/* Abstimmungen & Co. gibt es auch ohne verknüpfte Person */}
        <ZuErledigen className="mb-4" />
        <div className="card mx-auto max-w-2xl p-6 text-center text-sm text-tinte-matt">
          Zu deinem Konto ist noch keine Person verknüpft.
          <br />
          Sag dem Stufenteam Bescheid, dann schalten sie dich frei.
        </div>
      </>
    );

  const offen = basisOffen(student, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const next = naechsteStufe(pct, settings);
  const bonus = abiballVon(settings);
  const preise = ticketPreise(pct, settings);
  const gesamt = HY.reduce((n, h) => n + beitragFuer(h, settings), 0);
  const preisSatz = `EF je ${beitragFuer("EF.1", settings)} €, Q1/Q2 je ${beitragFuer("Q1.1", settings)} €`;
  const halbjahre = (tour: boolean) => (
    <>
      <div className="mt-3 flex gap-1.5" data-tour={tour ? "meine-halbjahre" : undefined}>
        {HY.map((h, i) => (
          <TermChip key={h} student={student} h={h} i={i} current={settings.aktuelles_halbjahr} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {HY.map((h) => (
          <div key={h} className="zahl flex-1 basis-0 text-center text-[12px] font-semibold text-tinte-leise">
            {beitragFuer(h, settings)} €
          </div>
        ))}
      </div>
      <HalbjahrLegende nichtDabei={HY.some((_, i) => isPreJoin(student, i))} />
    </>
  );
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

  const mithilfeKopf =
    pct > 100 && bonus.ueber100
      ? `Stark! ${preise.rabatt} € Bonus aufs erste Ticket.`
      : pct >= 100
        ? bonus.ueber100
          ? `Kein Zuschlag mehr. Alle ${bonus.bonusSchritt} % mehr: −${bonus.bonusProSchritt} €.`
          : "Geschafft – kein Zuschlag mehr aufs erste Ticket."
        : "Mehr Prozent = günstigeres Abiball-Ticket.";

  // Spalten ab iPad (Prüfung Okt. 2026: Ticket ohne Verkauf über die volle
  // Breite, „Mithilfe“ erst unter dem Rand, leere Liste in halber Breite):
  //   Ticket mit Kasse → volle Breite, darunter Mithilfe | Beiträge
  //   Ticket ohne Kasse → Ticket | Mithilfe, darunter Beiträge (volle Breite)
  //   ohne Beiträge-Einträge fällt die Karte weg; Mithilfe nimmt dann die Reihe
  const ticketDa = sichtbar("abiball");
  const hatBeitraege = meine.length > 0;
  const mithilfeBreit = !hatBeitraege && (!ticketDa || ticketBreit);
  const beitraegeBreit = ticketDa && !ticketBreit;

  return (
    <div className="grid items-start gap-3 md:grid-cols-2 md:items-stretch">
      {/* Reihenfolge: Handy = was offen ist, Zahl, Abizeitung, Halbjahre …
          (das Häufige zuerst). Ab iPad stehen Zahl und Halbjahre
          nebeneinander – beides ist „meine Kasse“. Keine eigene Breite: alles
          fluchtet an der Spalte aus App.tsx (vorher max-w-3xl → am iPad
          schmaler als Kopf und Reiterleiste). */}
      {/* ------------------------------------------ für dich offen */}
      <ZuErledigen className="order-1 md:col-span-2" />

      {/* ------------------------------------------ die eine Zahl */}
      {/* Nichts fällig: am Handy EINE Zeile (Betrag links, Kontodaten rechts) –
          vorher eine 170 px hohe Karte ohne Aufgabe. Ist etwas offen, bleibt
          die große Zahl: dann ist sie das Wichtigste auf der Seite. */}
      <section
        className={`leitkarte order-2 flex flex-col ${offen > 0 ? "" : "max-md:flex-row max-md:flex-wrap max-md:items-center max-md:gap-3 max-md:!py-3"}`}
        data-tour="meine-karte"
      >
        <div className={offen > 0 ? "" : "max-md:min-w-0 max-md:flex-1"}>
          <div className="text-[13px] font-medium text-white/60">
            {offen > 0 ? "Du musst noch zahlen" : "Deine Stufenkasse"}
          </div>
          <div className={`mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 ${offen > 0 ? "" : "max-md:mt-0 max-md:gap-x-2"}`}>
            <span className={`leitwert ${offen > 0 ? "text-white" : "text-[#30D158] max-md:!text-[1.75rem]"}`}>{offen} €</span>
            <span className="text-[13px] text-white/60">
              {offen > 0 ? (
                `fällig bis ${settings.aktuelles_halbjahr}`
              ) : (
                <>
                  <span className="md:hidden">nichts fällig</span>
                  <span className="max-md:hidden">Aktuell ist nichts fällig. Danke!</span>
                </>
              )}
            </span>
          </div>
          <div className={`mt-2 text-[12px] text-white/50 ${offen > 0 ? "" : "max-md:hidden"}`}>
            {student.vorname} {student.nachname} · {gesamt} € über alle sechs Halbjahre
          </div>
        </div>
        {/* Halbjahre am Handy als Streifen IN der Karte – beides ist „meine
            Kasse“. Vorher eine eigene Karte (~190 px) darunter. Antippen
            öffnet die ausführliche Ansicht mit Preisen und Legende. */}
        <button
          type="button"
          onClick={() => setHalbjahreOffen(true)}
          data-tour="meine-halbjahre"
          className={`mt-3 w-full rounded-lg transition active:opacity-70 md:hidden ${offen > 0 ? "" : "max-md:order-last max-md:mt-0"}`}
        >
          <span className="sr-only">Deine Halbjahre: </span>
          <HalbjahrStreifen student={student} current={settings.aktuelles_halbjahr} hy={HY} />
        </button>
        {/* Überweisen – falls Schüler selbst zahlen (sonst die Eltern) */}
        <button
          onClick={() => setUeberweisen(true)}
          className={`mt-3 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full bg-white/15 px-4 text-[14px] font-semibold text-white transition active:scale-95 md:mt-auto ${
            offen > 0 ? "" : "max-md:mt-0 max-md:shrink-0 max-md:self-center"
          }`}
        >
          <Icon name="bank" size={15} />
          {offen > 0 ? (
            "Überweisen – Kontodaten"
          ) : (
            <>
              <span className="md:hidden">Kontodaten</span>
              <span className="max-md:hidden">Überweisen – Kontodaten</span>
            </>
          )}
        </button>
      </section>
      <Sheet open={ueberweisen} onClose={() => setUeberweisen(false)}>
        <SheetKopf titel="Überweisen" onClose={() => setUeberweisen(false)} />
        <KontoTab personen={[student]} du />
      </Sheet>

      {/* ------------------------------------------ Abi-Album (nur mit Recht) */}
      {/* Mitmachen (Album, Motto, Zitate, Rankings): am Handy ein Raster aus
          zwei Spalten kleiner Kacheln (FarbKachel, wie im Chats-Reiter) – ein
          Tipp öffnet das Blatt. Vorher fünf hohe Karten untereinander (gut
          800 px), danach ein seitlich wischbares Regal („man muss seitlich
          scrollen, das ist unschön“, Runde 8). Album, Motto und Zitate je eine
          Kachel, die Rankings eine ganze Reihe (Schüler | Lehrer); bei
          ungerader Zahl geht die letzte einzelne Kachel über beide Spalten
          (.regal in index.css). Ab 640 px die großen Karten, zwei nebeneinander. */}
      {/* data-tour: Einführung zeigt hier auf die Kacheln (Tour.tsx) */}
      <div
        data-tour="kacheln"
        role="region"
        aria-label="Mitmachen"
        className="regal order-3 grid grid-cols-2 gap-3 md:order-4 md:col-span-2 [&:empty]:hidden"
      >
        <AlbumKarte />
        <MottoKarte />
        <ZitateKarte />
        <RankingKarten />
      </div>
      {/* Stichwahlen NICHT im Regal: eine offene Abstimmung gehört sichtbar in
          die Spalte (im Regal stand sie als 5. Karte ganz hinten und zog alle
          Karten auf ihre Höhe) */}
      <UmfrageStichwahlen className="order-3 md:order-4 md:col-span-2" />

      {/* ------------------------------------------ Halbjahre mit Preis */}
      {/* Ab iPad als Karte neben der Zahl; am Handy steckt der Streifen in der
          Leitkarte und das hier steht im Blatt */}
      <section className="card order-4 p-4 max-md:hidden sm:p-5 md:order-3">
        <div className="flex items-center justify-between gap-2">
          <Titel icon="kalender" farbe="bg-[#0A84FF]">Deine Halbjahre</Titel>
          <span className="text-[12px] text-tinte-leise">{preisSatz}</span>
        </div>
        {halbjahre(true)}
      </section>
      <Sheet open={halbjahreOffen} onClose={() => setHalbjahreOffen(false)}>
        <SheetKopf titel="Deine Halbjahre" onClose={() => setHalbjahreOffen(false)} />
        <div className="card p-4">
          <div className="text-[13px] text-tinte-matt">{preisSatz}</div>
          {halbjahre(false)}
        </div>
      </Sheet>

      {/* ------------------------------------------ Abiballticket */}
      {/* Verkauf läuft: links die Tickets, rechts bestellen und überweisen */}
      <TicketBereich
        student={student}
        settings={settings}
        prozent={pct}
        onMitKasse={setTicketBreit}
        className={`order-5 ${ticketBreit ? "md:col-span-2" : ""}`}
        unten={
          // Am Handy: Mithilfe als eine Zeile im Ticket statt eigener Karte
          // (~230 px) – die Prozente bestimmen den Ticketpreis
          <button
            type="button"
            onClick={() => setStaffelOffen(true)}
            data-tour="meine-punkte"
            className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left transition active:opacity-60"
          >
            <StaffelRing pct={pct} settings={settings} klein />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-snug">Mithilfe bei Aktionen</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-tinte-matt">
                {next ? (
                  <>
                    Noch <b className="text-brand-dark dark:text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                    <b className="text-brand-dark dark:text-brand">{next.spart} €</b>.
                  </>
                ) : (
                  mithilfeKopf
                )}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-tinte-leise">
              <Icon name="chevron" size={14} strich={2.4} />
            </span>
          </button>
        }
      />

      {/* ------------------------------------------ Prozentstand */}
      <section className={`card order-6 p-4 sm:p-5 ${mithilfeBreit ? "md:col-span-2" : ""} ${ticketDa ? "max-md:hidden" : ""}`} data-tour="meine-punkte">
        <Titel icon="herz" farbe="bg-[#34C759]">Mithilfe bei Aktionen</Titel>

        <div className="mt-3 flex items-center gap-4">
          <StaffelRing pct={pct} settings={settings} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug">{mithilfeKopf}</div>
            {next && (
              <div className="mt-1.5 text-[13px] leading-relaxed text-tinte-matt">
                Noch <b className="text-brand-dark dark:text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                <b className="text-brand-dark dark:text-brand">{next.spart} €</b>.
              </div>
            )}
          </div>
        </div>

        {/* Die Staffel (5 Stufen) ab iPad direkt; am Handy hinter einer Zeile –
            Ring und Satz darüber sagen schon das Wichtigste (wie viel fehlt,
            was es spart). Vorher gut 120 px mehr auf der Übersicht. */}
        <StaffelKacheln pct={pct} settings={settings} className="mt-4 max-md:hidden" />

        {/* Noch nichts eingetragen: eine Zeile hier statt einer leeren Karte */}
        {!hatBeitraege && (
          <p className="mt-3 text-[13px] leading-snug text-tinte-leise">
            Noch keine Mithilfe eingetragen. Wenn du bei einer Aktion hilfst, trägt das Stufenteam sie ein.
          </p>
        )}
        <button
          type="button"
          onClick={() => setStaffelOffen(true)}
          className="-mb-2 mt-1 flex min-h-[44px] w-full items-center justify-between text-left text-[14px] font-medium text-brand-dark transition active:opacity-60 dark:text-brand md:hidden"
        >
          So sinkt dein Ticketpreis
          <Icon name="chevron" size={14} strich={2.4} />
        </button>
      </section>
      <Sheet open={staffelOffen} onClose={() => setStaffelOffen(false)}>
        <SheetKopf titel="Mithilfe und Ticketpreis" onClose={() => setStaffelOffen(false)} />
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <StaffelRing pct={pct} settings={settings} klein />
            <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{mithilfeKopf}</p>
          </div>
          <StaffelKacheln pct={pct} settings={settings} className="mt-4" />
          {!hatBeitraege && (
            <p className="mt-3 text-[13px] leading-snug text-tinte-leise">
              Noch keine Mithilfe eingetragen. Wenn du bei einer Aktion hilfst, trägt das Stufenteam sie ein.
            </p>
          )}
        </div>
      </Sheet>

      {/* ------------------------------------------ meine Beiträge */}
      {hatBeitraege && (
        <section className={`card order-7 p-4 sm:p-5 ${beitraegeBreit ? "md:col-span-2" : ""}`}>
          <Titel icon="beitraege" farbe="bg-[#FF9500]">Wobei du geholfen hast</Titel>
          <BeitragsListe eintraege={meine} leerText="" />
        </section>
      )}
    </div>
  );
}
