import { HY, type Settings, type Student } from "../lib/types";
import { SkelettKarten } from "./Skelett";
import { useStore } from "../store";
import { abiballVon, basisOffen, beitragFuer, isPreJoin, naechsteStufe, prozentVon, ticketPreise } from "../lib/logic";
import { HalbjahrLegende, TermChip } from "./TermChip";
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
  const meine = contributions
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));

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
      <section className="leitkarte order-2 flex flex-col" data-tour="meine-karte">
        <div className="text-[13px] font-medium text-white/60">
          {offen > 0 ? "Du musst noch zahlen" : "Deine Stufenkasse"}
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Nichts offen: am Handy kleiner – die Karte soll nicht den halben Bildschirm füllen */}
          <span className={`leitwert ${offen > 0 ? "text-white" : "text-[#30D158] max-md:!text-[2.25rem]"}`}>{offen} €</span>
          <span className="text-[13px] text-white/60">
            {offen > 0 ? `fällig bis ${settings.aktuelles_halbjahr}` : "Aktuell ist nichts fällig. Danke!"}
          </span>
        </div>
        <div className={`mt-2 text-[12px] text-white/50 ${offen > 0 ? "" : "max-md:hidden"}`}>
          {student.vorname} {student.nachname} · {gesamt} € über alle sechs Halbjahre
        </div>
        {/* Überweisen – falls Schüler selbst zahlen (sonst die Eltern) */}
        <button
          onClick={() => setUeberweisen(true)}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full bg-white/15 px-4 text-[14px] font-semibold text-white transition active:scale-95 md:mt-auto"
        >
          <Icon name="bank" size={15} />
          Überweisen – Kontodaten
        </button>
      </section>
      <Sheet open={ueberweisen} onClose={() => setUeberweisen(false)}>
        <SheetKopf titel="Überweisen" onClose={() => setUeberweisen(false)} />
        <KontoTab personen={[student]} du />
      </Sheet>

      {/* ------------------------------------------ Abi-Album (nur mit Recht) */}
      {/* Abizeitung & Co. als ruhige Kacheln: Handy untereinander, ab iPad zwei nebeneinander */}
      {/* data-tour: Einführung zeigt hier auf die Kacheln (Tour.tsx) */}
      <div data-tour="kacheln" className="order-3 grid gap-3 sm:grid-cols-2 md:order-4 md:col-span-2 [&:empty]:hidden">
        <AlbumKarte />
        <MottoKarte />
        <ZitateKarte />
        <RankingKarten />
        <UmfrageStichwahlen />
      </div>

      {/* ------------------------------------------ Halbjahre mit Preis */}
      <section className="card order-4 p-4 sm:p-5 md:order-3">
        <div className="flex items-center justify-between gap-2">
          <Titel icon="kalender" farbe="bg-[#0A84FF]">Deine Halbjahre</Titel>
          <span className="text-[12px] text-tinte-leise">
            EF je {beitragFuer("EF.1", settings)} €, Q1/Q2 je {beitragFuer("Q1.1", settings)} €
          </span>
        </div>

        <div className="mt-3 flex gap-1.5" data-tour="meine-halbjahre">
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
      </section>

      {/* ------------------------------------------ Abiballticket */}
      {/* Verkauf läuft: links die Tickets, rechts bestellen und überweisen */}
      <TicketBereich
        student={student}
        settings={settings}
        prozent={pct}
        onMitKasse={setTicketBreit}
        className={`order-5 ${ticketBreit ? "md:col-span-2" : ""}`}
      />

      {/* ------------------------------------------ Prozentstand */}
      <section className={`card order-6 p-4 sm:p-5 ${mithilfeBreit ? "md:col-span-2" : ""}`} data-tour="meine-punkte">
        <Titel icon="herz" farbe="bg-[#34C759]">Mithilfe bei Aktionen</Titel>

        <div className="mt-3 flex items-center gap-4">
          <StaffelRing pct={pct} settings={settings} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug">
              {pct > 100 && bonus.ueber100
                ? `Stark! ${preise.rabatt} € Bonus aufs erste Ticket.`
                : pct >= 100
                  ? bonus.ueber100
                    ? `Kein Zuschlag mehr. Alle ${bonus.bonusSchritt} % mehr: −${bonus.bonusProSchritt} €.`
                    : "Geschafft – kein Zuschlag mehr aufs erste Ticket."
                  : "Mehr Prozent = günstigeres Abiball-Ticket."}
            </div>
            {next && (
              <div className="mt-1.5 text-[13px] leading-relaxed text-tinte-matt">
                Noch <b className="text-brand-dark dark:text-brand">{next.fehlt} %</b> bis zur nächsten Stufe, das spart dir{" "}
                <b className="text-brand-dark dark:text-brand">{next.spart} €</b>.
              </div>
            )}
          </div>
        </div>

        <StaffelKacheln pct={pct} settings={settings} />

        {/* Noch nichts eingetragen: eine Zeile hier statt einer leeren Karte */}
        {!hatBeitraege && (
          <p className="mt-3 text-[13px] leading-snug text-tinte-leise">
            Noch keine Mithilfe eingetragen. Wenn du bei einer Aktion hilfst, trägt das Stufenteam sie ein.
          </p>
        )}
      </section>

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
