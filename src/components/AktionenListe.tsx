import { useMemo, useState } from "react";
import { useSchichtStatus, useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { useProfiles } from "../profiles-store";
import { prozentVon } from "../lib/logic";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { Avatar } from "./Avatar";
import {
  MONATE, WOCHENTAGE, abHeute, ausKey, farbeVon, heuteKey, kurzTag, schichtEnde, sonntagVon, tagLang, zeitText,
  type Aktion, type SchichtStatus, type Termin,
} from "../lib/termine";
import { gruppiereAehnliche } from "../lib/events";
import { SchichtSchild } from "./TerminZeichen";
import { abschlussOeffnen } from "./SchichtAbschluss";

import { frage, meldeFehler } from "../lib/melder";
import { ProzentWahl } from "./AktionSheet";
import { MeldeBestaetigung } from "./MeldeBestaetigung";

/** Ab so vielen gleichartigen Schichten wird zu einer aufklappbaren Gruppe zusammengefasst. */
const GRUPPE_AB = 3;

/**
 * „Deine Schichten“ – die Schichten, die man bekommen hat, als grüne Tickets.
 * Steht im Events-Reiter direkt unter der Woche, damit man sofort sieht,
 * wann man dran ist. Mehr als zwei? Dann die nächsten zwei und „+ n weitere“.
 * `ausserTag`: der im Wochenstreifen gewählte Tag – den zeigt schon die Tagesliste.
 */
export function MeineSchichten({ ausserTag }: { ausserTag?: string }) {
  const { termine, aktionen } = useTermine();
  const st = useSchichtStatus();
  const [alle, setAlle] = useState(false);
  const jetzt = Date.now();
  // Der Tag, der oben im Wochenstreifen gerade ausgeschrieben steht, kommt hier
  // nicht noch einmal vor (dort trägt die Zeile schon „Eingeteilt“).
  const meine = abHeute(termine).filter(
    (t) => st(t) === "eingeteilt" && !t.abschluss && schichtEnde(t).getTime() >= jetzt && t.datum !== ausserTag,
  );
  if (!meine.length) return null;
  const sichtbar = alle ? meine : meine.slice(0, 2);
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 flex items-baseline px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">
        <span className="flex-1">Deine Schichten</span>
        {meine.length > 2 && (
          <button onClick={() => setAlle(!alle)} className="-my-3 min-h-[44px] py-3 pl-3 text-[13px] font-semibold normal-case tracking-normal text-brand-dark dark:text-brand">
            {alle ? "Weniger" : `+ ${meine.length - 2} weitere`}
          </button>
        )}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {sichtbar.map((t) => (
          <SchichtTicket key={t.id} schicht={t} aktion={aktionen.find((a) => a.id === t.aktion_id) || null} />
        ))}
      </div>
    </section>
  );
}

/** Ein Block der Liste „Mitmachen“: gleichartige Schichten (eine oder mehrere Aktionen). */
interface Block {
  schluessel: string;
  titel: string;
  schichten: Termin[];
  /** Ab GRUPPE_AB Schichten: eingeklappt mit „Alle n Termine“ */
  aufklappbar: boolean;
}

/**
 * Die ausgeschriebenen Aktionen im Events-Reiter („Mitmachen“).
 *
 * Für alle: sehen, wann Waffelverkauf ist, und sich eintragen.
 * Fürs Stufenteam: Schicht antippen → sehen, wer sich gemeldet hat (mit
 * Mithilfe-Prozent), und verteilen.
 *
 * Damit man nicht scrollen muss: gleichartige Schichten (gleicher oder
 * ähnlicher Titel, siehe gruppiereAehnliche in lib/events.ts) stehen ab drei
 * Stück in EINER Gruppe „Waffelverkauf · 5 Termine · nächster Di 21.10.“.
 * Eingeklappt sieht man nur, was diese Woche dran ist (oder den nächsten
 * Termin) und alles, was einen selbst betrifft; der Rest klappt auf.
 */
export function AktionenListe() {
  const { termine, aktionen, bewerbungen, bewerben, meineUid, meineStudentIds } = useTermine();
  const st = useSchichtStatus();
  const { isStaff, can } = useRole();
  const darfVerteilen = isStaff || can("termine.manage");
  const [schicht, setSchicht] = useState<Termin | null>(null);
  // „eintragen“: Bestätigung wie beim Bezahlen, mit Hinweis aufs Einteilen
  const [meldung, setMeldung] = useState<{ auftrag: Promise<unknown>; titel: string; unter: string } | null>(null);
  const eintragen = (id: string, an: boolean) => {
    const auftrag = bewerben(id, an);
    if (!an) return;
    const t = termine.find((x) => x.id === id);
    const a = t?.aktion_id ? aktionen.find((x) => x.id === t.aktion_id) : null;
    setMeldung({ auftrag, titel: a?.titel || t?.titel || "Schicht", unter: t ? tagLang(t.datum) : "" });
  };

  const nachId = useMemo(() => new Map(aktionen.map((a) => [a.id, a])), [aktionen]);

  // Übersichtlich halten: bestätigte Schichten („Punkte vergeben“ / „ohne“)
  // verschwinden für alle. Vorbei, aber noch nicht bestätigt, sieht nur das
  // Team – dort trägt man vor dem Bestätigen aus, wer nicht da war.
  const jetzt = Date.now();
  const offen = useMemo(
    () =>
      abHeute(termine).filter(
        (t) =>
          t.aktion_id &&
          nachId.has(t.aktion_id) &&
          !t.abschluss &&
          (darfVerteilen || schichtEnde(t).getTime() >= jetzt) &&
          // Schüler: Schichten, in die ich eingeteilt bin, stehen schon als grünes
          // Ticket oben („Deine Schichten“) – hier nicht noch einmal.
          (darfVerteilen || st(t) !== "eingeteilt"),
      ),
    // jetzt: bei jedem Neuzeichnen frisch, absichtlich nicht als Abhängigkeit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termine, nachId, darfVerteilen, st],
  );

  // Gleichartige zusammenfassen. Was unter GRUPPE_AB bleibt, steht trotzdem
  // je Titel in einem (nicht aufklappbaren) Block – so sieht jede Aktion
  // gleich aus, egal wie viele Termine sie hat.
  const bloecke = useMemo(() => {
    const titelVon = (t: Termin) => nachId.get(t.aktion_id!)?.titel || t.titel;
    const liste: Block[] = [];
    const nachSchluessel = new Map<string, Block>();
    for (const g of gruppiereAehnliche(offen, titelVon, GRUPPE_AB)) {
      if (g.art === "gruppe") {
        liste.push({ schluessel: g.schluessel, titel: g.titel, schichten: g.eintraege, aufklappbar: true });
        continue;
      }
      const da = nachSchluessel.get(g.schluessel);
      if (da) da.schichten.push(g.eintrag);
      else {
        const neu: Block = { schluessel: g.schluessel, titel: titelVon(g.eintrag), schichten: [g.eintrag], aufklappbar: false };
        nachSchluessel.set(g.schluessel, neu);
        liste.push(neu);
      }
    }
    return liste;
  }, [offen, nachId]);

  // Damit das aufgeklappte Blatt immer die frischen Bewerbungen zeigt
  const aktuelleSchicht = schicht ? termine.find((t) => t.id === schicht.id) ?? schicht : null;

  if (!bloecke.length) return null;

  return (
    <>
      <section className="mb-5">
        <h3 className="mb-1 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Mitmachen</h3>
        <p className="mb-2 px-4 text-[13px] leading-snug text-tinte-leise">
          {darfVerteilen
            ? "Schicht antippen: sehen, wer sich angemeldet hat, und einteilen. Das Prozent zeigt, wie viel Mithilfe eine Schicht zählt."
            : "„Eintragen“ meldet dich an, das Stufenteam teilt dann ein – wer wenig Mithilfe hat, zuerst. Das Prozent zeigt, wie viel Mithilfe die Schicht zählt."}
        </p>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {bloecke.map((b) => (
            <AktionGruppe
              key={b.schluessel}
              block={b}
              aktionen={nachId}
              bewerbungen={bewerbungen}
              meineUid={meineUid}
              meineStudentIds={meineStudentIds}
              darfVerteilen={darfVerteilen}
              st={st}
              onEintragen={eintragen}
              onOeffnen={setSchicht}
            />
          ))}
        </div>
      </section>

      <MeldeBestaetigung
        auftrag={meldung?.auftrag ?? null}
        titel={meldung?.titel ?? ""}
        unter={meldung?.unter}
        onFertig={() => setMeldung(null)}
      />

      {aktuelleSchicht && (
        <SchichtSheet
          schicht={aktuelleSchicht}
          aktion={aktionen.find((a) => a.id === aktuelleSchicht.aktion_id) || null}
          onSchliessen={() => setSchicht(null)}
        />
      )}
    </>
  );
}

/**
 * Prozent einer Aktion nachträglich ändern (Team / Termine verwalten). Zur
 * Wahl stehen die Möglichkeiten aus dem Beiträge-Reiter; schon vergebene
 * Mithilfe dieser Aktion zieht mit. Keine Mitteilung.
 */
function ProzentAendern({ aktion }: { aktion: Aktion }) {
  const { aktionProzent } = useTermine();
  const { templates } = useStore();
  const [offen, setOffen] = useState(false);
  const vorlagen = useMemo(() => [...templates].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte), [templates]);
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2 text-[14px]">
        <span className="min-w-0 flex-1 truncate text-tinte-matt dark:text-slate-300">
          {aktion.icon} {aktion.titel} zählt <span className="zahl font-semibold text-brand">+{aktion.prozent} %</span>
        </span>
        <button onClick={() => setOffen(!offen)} className="shrink-0 text-[14px] font-semibold text-brand">
          {offen ? "Fertig" : "Ändern"}
        </button>
      </div>
      {offen && (
        <div className="mt-2">
          <ProzentWahl
            vorlagen={vorlagen}
            wert={aktion.prozent}
            setzen={(p) => {
              void aktionProzent(aktion.id, p).then((f) => {
                if (f) meldeFehler("Ändern hat nicht geklappt: " + f);
                else setOffen(false);
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Nach unten zeigender Winkel, dreht sich beim Aufklappen. */
export function Winkel({ auf }: { auf: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 transition-transform duration-300 ease-ios motion-reduce:transition-none ${auf ? "rotate-180" : ""}`}
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Eine Gruppe gleichartiger Schichten als weiße Zellen-Gruppe (iOS-Liste).
 *
 * Kopf: Zeichen, Titel, „5 Termine · nächster Di 21.10.“, Prozent.
 * Eingeklappt (nur wenn aufklappbar): sichtbar bleibt, was bis Sonntag dran
 * ist, was mich betrifft (eingeteilt/gemeldet) und – fürs Team – was vorbei,
 * aber noch nicht bestätigt ist. Gibt es davon nichts, der nächste Termin.
 */
function AktionGruppe({
  block, aktionen, bewerbungen, meineUid, meineStudentIds, darfVerteilen, st, onEintragen, onOeffnen,
}: {
  block: Block;
  aktionen: Map<string, Aktion>;
  st: (t: Termin) => SchichtStatus;
  meineStudentIds: string[];
  bewerbungen: Record<string, string[]>;
  meineUid: string | null;
  darfVerteilen: boolean;
  onEintragen: (id: string, an: boolean) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const [auf, setAuf] = useState(false);
  const { schichten } = block;
  const jetzt = Date.now();
  const bisSonntag = sonntagVon(heuteKey());
  // Welche Aktionen stecken drin? Meist eine – bei „Waffelverkauf“ und
  // „Waffelverkauf Elternsprechtag“ auch mal zwei.
  const drin = [...new Set(schichten.map((t) => t.aktion_id!))].map((id) => aktionen.get(id)!).filter(Boolean);
  const erste = drin[0];
  const prozente = [...new Set(drin.map((a) => a.prozent))].sort((a, b) => a - b);
  const prozentText = prozente.length === 1 ? `+${prozente[0]} %` : `+${prozente[0]}–${prozente[prozente.length - 1]} %`;
  const kommend = schichten.filter((t) => schichtEnde(t).getTime() >= jetzt);
  const naechste = kommend[0] || schichten[0];
  const farbe = farbeVon(naechste);

  const wichtig = (t: Termin) =>
    t.datum <= bisSonntag || st(t) === "eingeteilt" || st(t) === "gemeldet" || schichtEnde(t).getTime() < jetzt;
  let sichtbar = schichten;
  if (block.aufklappbar && !auf) {
    sichtbar = schichten.filter(wichtig);
    if (!sichtbar.length) sichtbar = [naechste];
  }
  const versteckt = schichten.length - sichtbar.length;

  const kopf = (
    <>
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[22px] leading-none ${
          farbe ? farbe.chip : "bg-brand/10 dark:bg-brand/20"
        }`}
      >
        {erste?.icon || naechste.icon || "📌"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-tight">{block.titel}</span>
        <span className="mt-0.5 block truncate text-[13px] text-tinte-leise">
          {schichten.length === 1 ? "1 Termin" : `${schichten.length} Termine`}
          {kommend.length > 0 && ` · nächster ${kurzTag(kommend[0].datum)}`}
        </span>
      </span>
      <span className="zahl shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand dark:bg-brand/20">
        {prozentText}
      </span>
      {block.aufklappbar && (
        <span className="text-tinte-leise">
          <Winkel auf={auf} />
        </span>
      )}
    </>
  );

  return (
    <div className="liste">
      {block.aufklappbar ? (
        <button
          onClick={() => setAuf(!auf)}
          aria-expanded={auf}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
        >
          {kopf}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{kopf}</div>
      )}

      {sichtbar.map((t) => (
        <SchichtZeile
          key={t.id}
          t={t}
          aktion={drin.length > 1 ? aktionen.get(t.aktion_id!) ?? null : null}
          gemeldet={bewerbungen[t.id] || []}
          meineUid={meineUid}
          darfEintragen={meineStudentIds.length > 0}
          darfVerteilen={darfVerteilen}
          status={st(t)}
          onEintragen={onEintragen}
          onOeffnen={onOeffnen}
        />
      ))}

      {block.aufklappbar && (versteckt > 0 || auf) && (
        <button
          onClick={() => setAuf(!auf)}
          className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-[15px] font-medium text-brand transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
        >
          <span className="flex-1">{auf ? "Weniger anzeigen" : `Alle ${schichten.length} Termine anzeigen`}</span>
          <Winkel auf={auf} />
        </button>
      )}

      {/* Team: Prozent je Aktion ändern – erst aufgeklappt bzw. bei kleinen Gruppen */}
      {darfVerteilen && (!block.aufklappbar || auf) && drin.map((a) => <ProzentAendern key={a.id} aktion={a} />)}
    </div>
  );
}

/**
 * Eine Schicht in der Gruppe: links Tag und Uhrzeit, rechts die Aktion.
 *  - Schüler: „Eintragen“ / „Angemeldet“ (antippen = abmelden) / Schild „Eingeteilt“
 *  - Team: ganze Zeile antippen → verteilen (dort auch „mich selbst melden“)
 *  - vorbei und noch nicht bestätigt (nur Team): „Bestätigen“
 */
function SchichtZeile({
  t, aktion, gemeldet, meineUid, darfEintragen, darfVerteilen, status, onEintragen, onOeffnen,
}: {
  t: Termin;
  /** nur gesetzt, wenn in der Gruppe mehrere Aktionen stecken – dann steht der Name dabei */
  aktion: Aktion | null;
  gemeldet: string[];
  meineUid: string | null;
  darfEintragen: boolean;
  darfVerteilen: boolean;
  status: SchichtStatus;
  onEintragen: (id: string, an: boolean) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const ich = Boolean(meineUid && gemeldet.includes(meineUid));
  const belegt = t.personen.length;
  const plaetze = t.plaetze ?? 1;
  const voll = belegt >= plaetze;
  const vorbei = schichtEnde(t).getTime() < Date.now();
  const d = ausKey(t.datum);
  const heute = t.datum === heuteKey();
  const zeit = t.von ? zeitText(t).replace(" – ", "–") : "ganztägig";

  const links = (
    <>
      {/* Kleines Kalenderblatt: Wochentag über der Zahl – wie im iOS-Kalender */}
      <span className="flex w-9 shrink-0 flex-col items-center leading-none">
        <span className={`text-[12px] font-semibold uppercase ${heute ? "text-red-600 dark:text-red-400" : "text-tinte-leise"}`}>
          {heute ? "heute" : WOCHENTAGE[(d.getDay() + 6) % 7]}
        </span>
        <span className="zahl mt-0.5 text-[20px] font-semibold">{d.getDate()}</span>
      </span>
      <span className="min-w-0 flex-1">
        {/* Oben die Uhrzeit (der Tag steht schon links) – stecken mehrere
            Aktionen in der Gruppe, oben deren Name und die Uhrzeit darunter. */}
        <span className="block truncate text-[15px] font-medium leading-tight">
          {aktion ? `${aktion.icon} ${aktion.titel}` : zeit}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-tinte-leise">
          {[aktion ? zeit : "", t.ort].filter(Boolean).join(" · ")}
          {(aktion || t.ort) && " · "}
          <span className={voll ? "font-semibold text-bezahlt" : ""}>
            {voll ? "voll" : `${belegt}/${plaetze} Plätze`}
          </span>
        </span>
        {status === "nicht" && (
          <span className="mt-0.5 block text-[12px] leading-snug text-tinte-leise">
            {t.abschluss || voll ? "Die Plätze sind ohne dich vergeben – danke fürs Anmelden!" : "Schicht ist vorbei."}
          </span>
        )}
      </span>
    </>
  );

  const zeilenKlasse = `relative flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left ${status === "nicht" ? "opacity-60" : ""}`;
  const gruenerStrich = status === "eingeteilt" && (
    <span aria-hidden className="absolute inset-y-2 left-1 w-[3px] rounded-full bg-emerald-500" />
  );

  // ---------------------------------------------------------------- Team
  if (darfVerteilen) {
    return (
      <button
        onClick={() => (vorbei ? abschlussOeffnen() : onOeffnen(t))}
        className={`${zeilenKlasse} transition active:bg-black/[0.04] dark:active:bg-white/[0.06]`}
      >
        {gruenerStrich}
        {links}
        {vorbei ? (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[12px] font-bold text-amber-800 dark:text-amber-200">
            Mithilfe bestätigen
          </span>
        ) : status ? (
          <SchichtSchild status={status} klein />
        ) : (
          gemeldet.length > 0 && (
            <span className="zahl shrink-0 rounded-full bg-brand px-2 py-0.5 text-[12px] font-bold text-white">
              {gemeldet.length} angemeldet
            </span>
          )
        )}
        <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise/70">›</span>
      </button>
    );
  }

  // ---------------------------------------------------------------- alle anderen
  return (
    <div className={zeilenKlasse}>
      {gruenerStrich}
      {links}
      {status === "eingeteilt" || status === "nicht" ? (
        <SchichtSchild status={status} klein />
      ) : !darfEintragen || (voll && !ich) ? null /* voll: steht schon grün in der Zeile */ : ich ? (
        <button
          onClick={() => onEintragen(t.id, false)}
          title="Angemeldet – das Team teilt noch ein. Antippen zum Abmelden."
          className="btn-klein-grau shrink-0 !px-3.5"
        >
          Angemeldet
        </button>
      ) : (
        <button onClick={() => onEintragen(t.id, true)} className="btn-klein shrink-0 !px-3.5">
          Eintragen
        </button>
      )}
    </div>
  );
}

/**
 * Eine bekommene Schicht als „Ticket“: links der Abriss mit dem Tag, rechts
 * was, wann, wo. Sattes Grün mit gepunkteter Perforation – das Gegenstück zu
 * den verblassten, gestrichelten Schichten, die man nicht bekommen hat.
 */
function SchichtTicket({ schicht: t, aktion }: { schicht: Termin; aktion: Aktion | null }) {
  const d = ausKey(t.datum);
  const icon = t.icon || aktion?.icon;
  // Grün #1E7B34 mit reinem Weiß: 5,5:1 – vorher #248A3D mit 85 % Weiß, 10 px
  // (Prüfung 15.10.2026: nur 3,6:1).
  return (
    <div className="relative flex min-w-0 overflow-hidden rounded-2xl bg-[#1E7B34] text-white">
      <div className="flex w-[4.25rem] shrink-0 flex-col items-center justify-center py-2.5">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-white">
          {MONATE[d.getMonth()].slice(0, 3)}
        </span>
        <span className="zahl text-[1.7rem] font-extrabold leading-none">{d.getDate()}</span>
        <span className="text-[12px] font-semibold text-white">{WOCHENTAGE[(d.getDay() + 6) % 7]}</span>
      </div>
      {/* Perforation mit zwei Kerben oben und unten */}
      <div aria-hidden className="relative my-2 w-0 border-l-2 border-dotted border-white/60">
        <span className="absolute -left-[9px] -top-[17px] h-4 w-4 rounded-full bg-papier" />
        <span className="absolute -bottom-[17px] -left-[9px] h-4 w-4 rounded-full bg-papier" />
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="truncate text-[15px] font-bold leading-tight">
          {icon && <span className="mr-1">{icon}</span>}
          {aktion?.titel || t.titel}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-white">
          {[t.von ? zeitText(t) : "ganztägig", t.ort].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[12px] font-bold">
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path d="M2.2 6.4 4.8 9 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Eingeteilt
        </div>
      </div>
    </div>
  );
}

/**
 * Eine Schicht verteilen.
 *
 * Die Gemeldeten stehen nach Mithilfe-Prozent sortiert – wer am wenigsten hat,
 * steht oben. So geht die Schicht dahin, wo sie am meisten bringt, statt an
 * den, der am schnellsten getippt hat.
 */
function SchichtSheet({
  schicht, aktion, onSchliessen,
}: {
  schicht: Termin;
  aktion: Aktion | null;
  onSchliessen: () => void;
}) {
  const { termine, aktionen, bewerbungen, zuteilen, bewerben, bewerbungEntfernen, loeschen } = useTermine();
  const [suche, setSuche] = useState("");
  const { profiles } = useRole();
  const { students, punkte, settings } = useStore();
  const { profile } = useProfiles();

  const plaetze = schicht.plaetze ?? 1;
  const gemeldet = bewerbungen[schicht.id] || [];

  const studentVon = useMemo(() => {
    const m = new Map<string, string>(); // user_id -> student_id
    for (const p of profiles) if (p.student_id) m.set(p.user_id, p.student_id);
    return m;
  }, [profiles]);

  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Punkte, die schon "unterwegs" sind: wer in anderen, noch nicht
  // abgeschlossenen Schichten eingeteilt ist, bekommt sie ja noch. Ohne das
  // stünde jemand mit drei geplanten Schichten weiter ganz oben.
  const eingeplant = useMemo(() => {
    const prozent = new Map(aktionen.map((a) => [a.id, a.prozent]));
    const m: Record<string, number> = {};
    for (const t of termine) {
      if (t.id === schicht.id || !t.aktion_id || t.abschluss) continue;
      const p = prozent.get(t.aktion_id) || 0;
      if (!p) continue;
      for (const sid of t.personen) m[sid] = (m[sid] || 0) + p;
    }
    return m;
  }, [termine, aktionen, schicht.id]);

  const liste = useMemo(() => {
    const zeilen = gemeldet.map((uid) => {
      const sid = studentVon.get(uid) || null;
      const s = sid ? nachId.get(sid) : null;
      return {
        uid,
        sid,
        name: s ? `${s.nachname}, ${s.vorname}` : profile[uid]?.anzeigename || "Unbekannt",
        prozent: sid ? prozentVon((punkte[sid] || 0) + (eingeplant[sid] || 0), settings) : 0,
        geplant: sid ? eingeplant[sid] || 0 : 0,
        zugeteilt: Boolean(sid && schicht.personen.includes(sid)),
      };
    });
    // Wenig Mithilfe zuerst, bereits Zugeteilte oben drüber
    return zeilen.sort(
      (a, b) => Number(b.zugeteilt) - Number(a.zugeteilt) || a.prozent - b.prozent || a.name.localeCompare(b.name, "de"),
    );
  }, [gemeldet, studentVon, nachId, profile, punkte, settings, schicht.personen, eingeplant]);

  // Zugeteilte, die sich nie gemeldet haben (vom Team direkt gesetzt)
  const ohneMeldung = schicht.personen.filter((sid) => !liste.some((z) => z.sid === sid));

  const voll = schicht.personen.length >= plaetze;

  return (
    <Sheet open onClose={onSchliessen}>
      <SheetKopf
        titel={
          <>
            {aktion?.icon && <span aria-hidden className="mr-2">{aktion.icon}</span>}
            {schicht.titel}
          </>
        }
        unter={`${tagLang(schicht.datum)} · ${zeitText(schicht)}${schicht.ort ? ` · ${schicht.ort}` : ""}`}
        onClose={onSchliessen}
      />

      <Gruppe
        className="mt-0"
        fuss={
          voll
            ? "Alle Plätze sind vergeben. Wer eingeteilt ist, lässt sich mit „Eingeteilt“ wieder austragen."
            : undefined
        }
      >
        <Zeile label={voll ? "Voll belegt" : "Eingeteilt"}>
          <span className={`zahl text-[17px] font-bold ${voll ? "text-bezahlt" : ""}`}>
            {schicht.personen.length} / {plaetze}
          </span>
        </Zeile>
      </Gruppe>

      {liste.length === 0 && ohneMeldung.length === 0 ? (
        <p className="mt-4 py-8 text-center text-[14px] text-tinte-leise">Noch hat sich niemand angemeldet.</p>
      ) : (
        <>
          {liste.length > 0 && (
            <Gruppe
              titel="Angemeldet"
              fuss="Wer wenig Mithilfe hat, steht oben. Geplante Schichten zählen mit."
            >
              {liste.map((z) => (
                <div key={z.uid} className="flex min-h-[56px] items-center gap-2.5 py-2 pl-4 pr-2">
                  <Avatar userId={z.uid} name={z.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{z.name}</span>
                    <span className="block text-[13px] text-tinte-leise">
                      <span className="zahl font-semibold">{z.prozent} %</span> Mithilfe
                      {z.geplant > 0 && <span> · davon {z.geplant} % eingeplant</span>}
                    </span>
                  </span>
                  <button
                    disabled={!z.sid || (!z.zugeteilt && schicht.personen.length >= plaetze)}
                    onClick={() => z.sid && zuteilen(schicht.id, z.sid, !z.zugeteilt)}
                    className={`shrink-0 ${z.zugeteilt ? "btn-klein-grau" : "btn-klein"}`}
                  >
                    {z.zugeteilt ? "Eingeteilt" : "Einteilen"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!(await frage(`${z.name} von der Anmeldung für diese Schicht streichen?`, "Streichen", true))) return;
                      if (z.zugeteilt && z.sid) void zuteilen(schicht.id, z.sid, false);
                      void bewerbungEntfernen(schicht.id, z.uid);
                    }}
                    className="flex h-11 w-9 shrink-0 items-center justify-center text-[16px] leading-none text-tinte-leise active:opacity-50"
                    aria-label={`Anmeldung von ${z.name} streichen`}
                    title="Anmeldung streichen"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </Gruppe>
          )}
        </>
      )}

      {ohneMeldung.length > 0 && (
        <Gruppe titel="Direkt eingeteilt">
          {ohneMeldung.map((sid) => {
            const st = nachId.get(sid);
            return (
              <div key={sid} className="flex min-h-[52px] items-center gap-2 py-2 pl-4 pr-3">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {st ? `${st.nachname}, ${st.vorname}` : "Unbekannt"}
                </span>
                <button onClick={() => void zuteilen(schicht.id, sid, false)} className="btn-klein-grau shrink-0">
                  Austragen
                </button>
              </div>
            );
          })}
        </Gruppe>
      )}

      {/* Jemanden einteilen, der sich nicht angemeldet hat */}
      {!voll && (
        <section className="mt-4">
          <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Jemand anderen einteilen</h3>
          <input
            className="field"
            placeholder="Name suchen"
            aria-label="Name suchen, um jemanden direkt einzuteilen"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          {suche.trim().length >= 2 && (
            <Gruppe className="mt-2">
              {students
                .filter(
                  (st) =>
                    !schicht.personen.includes(st.id) &&
                    `${st.vorname} ${st.nachname}`.toLowerCase().includes(suche.trim().toLowerCase()),
                )
                .slice(0, 8)
                .map((st) => (
                  <Zeile
                    key={st.id}
                    onClick={() => {
                      void zuteilen(schicht.id, st.id, true);
                      setSuche("");
                    }}
                    ohnePfeil
                    label={<span className="block truncate">{st.nachname}, {st.vorname}</span>}
                  >
                    <span className="zahl shrink-0 text-[13px] text-tinte-leise">
                      {prozentVon((punkte[st.id] || 0) + (eingeplant[st.id] || 0), settings)} %
                    </span>
                    <span className="shrink-0 text-[15px] font-medium text-brand-dark dark:text-brand">Einteilen</span>
                  </Zeile>
                ))}
            </Gruppe>
          )}
        </section>
      )}

      <Gruppe
        className="mt-4"
        fuss="Wer eingeteilt ist, sieht die Schicht grün mit „Eingeteilt“ – im Kalender und oben unter „Deine Schichten“. Wer sich angemeldet und sie nicht bekommen hat, sieht sie verblasst und gestrichelt."
      >
        <Zeile blau onClick={() => bewerben(schicht.id, true)} label="Mich selbst anmelden" />
      </Gruppe>

      {/* Löschen bewusst weit weg vom „Fertig“-Knopf, rot und mit Rückfrage */}
      <Gruppe className="mt-8">
        <Zeile
          rot
          label="Schicht löschen …"
          onClick={async () => {
            if (await frage(`Diese Schicht am ${tagLang(schicht.datum)} ganz löschen? Eingeteilte verlieren sie aus dem Kalender.`, "Löschen", true)) {
              void loeschen(schicht.id);
              onSchliessen();
            }
          }}
        />
      </Gruppe>

      <FussLeiste>
        <button className="btn-primary" onClick={onSchliessen}>
          Fertig
        </button>
      </FussLeiste>
    </Sheet>
  );
}
