import { MottoEnthuellung, MottoFeststehend } from "./MottoEnthuellung";
import { GlasLeiste } from "./GlasLeiste";
import { useEffect, useMemo, useRef, useState } from "react";
import { SkelettKarten } from "./Skelett";
import { HY } from "../lib/types";
import { basisOffen, beitragFuer, prozentVon, punkteIndex } from "../lib/logic";
import { useStore } from "../store";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { HalbjahrLegende, TermChip } from "./TermChip";
import { TicketFamilie, TicketZeilen } from "./AbiTicket";
import { PunkteSheet } from "./PunkteSheet";
import { Icon, type IconName } from "./Icon";
import { Symbol, Zeile } from "./Liste";
import { Sheet, SheetKopf } from "./Sheet";
import { ElternInfosTab } from "./ElternInfosTab";
import { FinanzStandard } from "./FinanzStandard";
import { KontoTab } from "./KontoTab";
import { ProfilSheet } from "./ProfilSheet";
import { Tour, elternSchritte } from "./Tour";
import { useTheme } from "../lib/theme";
import { useBreit, useGescrollt, useReiter } from "../lib/gescrollt";
import { hasSupabase } from "../lib/supabase";
import { PushHinweis, usePushAuffrischen } from "./PushHinweis";
import { InstallKarte } from "./InstallHinweis";
import { abmelden, appZaehler } from "../lib/push";

import { frage } from "../lib/melder";
import { PatchNotes } from "./PatchNotes";
import { PATCH, PATCH_MERKER } from "../lib/patchnotes";
type Reiter = "uebersicht" | "infos" | "finanzen" | "konto";

// Titel = Name des Reiters (wie in der Schüler-App; vorher hieß „Übersicht“ oben „Stufenkasse“)
const TITEL: Record<Reiter, string> = { uebersicht: "Übersicht", infos: "Infos", finanzen: "Finanzen der Stufe", konto: "Kontodaten" };
const TOUR_MERKER = "sv:tour:v3:eltern";

/** Die Begriffe der Halbjahre – steht einmal auf der Übersicht. */
const HALBJAHRE_ERKLAERT =
  "„erlassen“ heißt: muss nicht gezahlt werden. „später“: kommt erst in einem späteren Halbjahr dran. EF ist die Einführungsphase (Klasse 11), Q1 und Q2 sind die beiden Qualifikationsjahre (Klasse 12 und 13) – die Zahl dahinter (.1 / .2) ist das Halbjahr.";

/**
 * Die Begriffe (EF, Q1, „erlassen“, „später“). Ab iPad als Absatz unter der
 * Legende; am Handy eine Zeile, die sie im Blatt erklärt – der Absatz war dort
 * sechs Zeilen lang und stand bei jedem Öffnen zwischen Kindern und Tickets.
 */
function Begriffe({ className = "" }: { className?: string }) {
  const [auf, setAuf] = useState(false);
  return (
    <>
      <p className={`text-[12px] leading-relaxed text-tinte-leise max-md:hidden ${className}`}>{HALBJAHRE_ERKLAERT}</p>
      <button
        type="button"
        onClick={() => setAuf(true)}
        className="-mb-2 mt-0.5 flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-brand-dark transition active:opacity-60 dark:text-brand md:hidden"
      >
        Was heißen EF, Q1 und „erlassen“?
        <Icon name="chevron" size={13} strich={2.4} />
      </button>
      <Sheet open={auf} onClose={() => setAuf(false)}>
        <SheetKopf titel="Begriffe" onClose={() => setAuf(false)} />
        <div className="card p-4">
          <HalbjahrLegende />
          <p className="mt-3 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">{HALBJAHRE_ERKLAERT}</p>
        </div>
      </Sheet>
    </>
  );
}

/**
 * Die ganze App, wie Eltern sie sehen.
 *
 * Bewusst klein gehalten: drei Reiter, keine Chats, keine Events, keine
 * Personenliste. Sichtbar sind nur die zugeordneten Kinder – dafuer sorgt
 * die Datenbank selbst, und die App filtert zusaetzlich nach der Zuordnung.
 * Ist (noch) kein Kind zugeordnet, sieht der Zugang gar nichts: keine
 * Infos, keine Kontodaten, nur einen Hinweis.
 */
export function ElternApp() {
  // Benachrichtigung angetippt? Dann gleich in die Infos.
  // Nur lesen – React ruft den Startwert im Entwicklungsmodus zweimal auf.
  const [reiter, setReiter] = useReiter<Reiter>(() => (window.location.hash === "#infos" ? "infos" : "uebersicht"));
  useEffect(() => {
    if (window.location.hash === "#infos") history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  const [profilOffen, setProfilOffen] = useState(false);
  const [tour, setTour] = useState(false);
  // „Neu in Version …“ – für Eltern nur ihre Einträge (lib/patchnotes.ts)
  const [patch, setPatch] = useState(false);
  const { theme, toggle } = useTheme();
  const gescrollt = useGescrollt(4);
  const titelWeg = useGescrollt(44);
  const breit = useBreit();
  const { students, contributions, settings, ready, reload } = useStore();
  const { bereit, ungelesen, ungelesenIds, infos, infosNeu, infosGesehen, infosGelesen, kinder: zugeordnet, zuordnungFehlt } = useEltern();
  // Fehlt die Zuordnung wegen eines Ladefehlers, gilt, was die Datenbank an
  // Personen herausgibt – die liefert Eltern ohnehin nur ihre Kinder.
  const kinderIds = useMemo(
    () => (zuordnungFehlt ? students.map((s) => s.id) : zugeordnet),
    [zuordnungFehlt, students, zugeordnet],
  );
  const { tourResetAt, can } = useRole();
  usePushAuffrischen();

  // Nur die zugeordneten Kinder – auch wenn die Datenbank mehr liefern sollte.
  const kinder = useMemo(
    () =>
      students
        .filter((s) => kinderIds.includes(s.id))
        .sort((a, b) => a.vorname.localeCompare(b.vorname, "de")),
    [students, kinderIds],
  );
  const ohneKind = bereit && kinderIds.length === 0;
  const laedt = !ready || !bereit;
  // Einmal pro Version, aber nicht direkt nach der Einführung (wie in App.tsx)
  useEffect(() => {
    if (laedt || tour) return;
    let gesehen: string | null = null;
    try {
      if (!localStorage.getItem(TOUR_MERKER)) return;
      gesehen = localStorage.getItem(PATCH_MERKER);
    } catch {
      return;
    }
    if (gesehen && Number(gesehen) >= Number(PATCH.version)) return;
    const t = setTimeout(() => setPatch(true), 1200);
    return () => clearTimeout(t);
  }, [laedt, tour]);

  // Zahl am App-Symbol und am Reiter „Infos“: neue Antworten UND neue Infos
  // vom Stufenteam (vorher zählten nur Antworten – eine neue Info sah niemand)
  const neuInInfos = (ungelesen || 0) + infosNeu;
  useEffect(() => appZaehler(ohneKind ? 0 : neuInInfos), [neuInInfos, ohneKind]);
  // Wer den Reiter „Infos“ öffnet, hat die neuen Infos gesehen
  useEffect(() => {
    if (reiter === "infos" && infosNeu > 0) infosGelesen();
  }, [reiter, infosNeu, infosGelesen]);
  // „Antwort vom Stufenteam“ auf der Übersicht öffnet gleich dieses Gespräch
  const [infosStart, setInfosStart] = useState<string | null>(null);
  useEffect(() => {
    if (reiter !== "infos") setInfosStart(null);
  }, [reiter]);
  // Die neuesten ungesehenen Infos für die Zeile „Neu“ auf der Übersicht
  const neueInfos = useMemo(() => {
    const ab = Date.parse(infosGesehen) || 0;
    return infos.filter((i) => Date.parse(i.created_at) > ab).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [infos, infosGesehen]);

  // Ordnet der Admin ein Kind zu oder nimmt es weg, liefert die Datenbank
  // danach andere Personen. Dann einmal neu laden – ohne dass die Eltern
  // etwas tun muessen.
  const vorher = useRef<string | null>(null);
  useEffect(() => {
    if (!bereit) return;
    const jetzt = [...kinderIds].sort().join(",");
    if (hasSupabase && vorher.current !== null && vorher.current !== jetzt) reload();
    vorher.current = jetzt;
  }, [bereit, kinderIds, reload]);

  // Einführung beim ersten Besuch – erst, wenn es auch etwas zu zeigen gibt.
  useEffect(() => {
    if (laedt || ohneKind || !kinder.length) return;
    let gesehen: string | null = null;
    try {
      gesehen = localStorage.getItem(TOUR_MERKER);
    } catch {
      /* privates Fenster */
    }
    const wieder = tourResetAt && (!gesehen || gesehen < tourResetAt);
    if (gesehen && !wieder) return;
    const t = setTimeout(() => setTour(true), 700);
    return () => clearTimeout(t);
  }, [laedt, ohneKind, kinder.length, tourResetAt]);

  const punkte = useMemo(() => punkteIndex(contributions), [contributions]);
  // "Familie Muster" statt "Mein Zugang". Bei Geschwistern mit verschiedenen
  // Nachnamen stehen beide da, getrennt durch einen Schraegstrich.
  const familienName = useMemo(() => {
    const namen = [...new Set(kinder.map((k) => k.nachname).filter(Boolean))];
    return namen.length ? `Familie ${namen.join(" / ")}` : "Mein Zugang";
  }, [kinder]);

  // Zwei Buchstaben fuer den runden Profilknopf: "Familie Muster" -> "MU"
  const familienKuerzel = useMemo(() => {
    const namen = [...new Set(kinder.map((k) => k.nachname).filter(Boolean))];
    if (namen.length > 1) return namen.slice(0, 2).map((n) => n[0]).join("").toUpperCase();
    return (namen[0] ?? "Ich").slice(0, 2).toUpperCase();
  }, [kinder]);

  // Für die gemeinsame Ticket-Karte: jedes Kind mit seinem Prozentstand
  const familie = useMemo(
    () => kinder.map((k) => ({ student: k, prozent: prozentVon(punkte[k.id] || 0, settings) })),
    [kinder, punkte, settings],
  );
  const familieOffen = kinder.reduce((n, k) => n + basisOffen(k, settings.aktuelles_halbjahr, settings), 0);
  const mehrere = kinder.length > 1;
  const hatNeues = neueInfos.length > 0 || ungelesen > 0;

  const NAV: { key: Reiter; label: string; icon: IconName; zahl?: number }[] = [
    { key: "uebersicht", label: "Übersicht", icon: "haus" },
    { key: "infos", label: "Infos", icon: "pin", zahl: neuInInfos },
    // Standard-Ansicht der Finanzen: nur Summen, keine Namen
    ...(can("finanzen.basis") ? [{ key: "finanzen" as const, label: "Finanzen", icon: "finanzen" as const }] : []),
    { key: "konto", label: "Konto", icon: "bank" },
  ];

  // ------------------------------------------------ Kein Kind: nichts zeigen
  if (ohneKind)
    return (
      // Kein eigener Grund: ohne Bild malt body die Papierfarbe, mit Bild
      // steht alles auf dem Foto (Texte mit auf-bild, Flächen deckend)
      <div className="flex min-h-dvh flex-col pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Dieselbe Kopfzeile wie in der App (gleiche Spalte, gleiche Knöpfe
            an derselben Stelle) – vorher stand der Mond allein 16 px vom
            Fensterrand, in der App aber an der Spalte neben dem Profil. */}
        <header className="pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-2.5 px-4 lg:box-content lg:max-w-5xl">
            <button className="iconbtn" onClick={toggle} aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}>
              <Icon name={theme === "dark" ? "sonne" : "mond"} size={19} />
            </button>
            <button
              onClick={() => setProfilOffen(true)}
              aria-label="Ihr Zugang – Passwort und Einstellungen"
              title="Ihr Zugang"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-white ring-2 ring-white dark:ring-slate-900">
                <Icon name="person" size={20} strich={2} />
              </span>
            </button>
          </div>
        </header>
        <div className="flex flex-1 flex-col px-5">
          <div className="mx-auto flex w-full max-w-sm flex-1 animate-aufsteigen flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-white text-tinte-leise shadow-card dark:bg-slate-900">
              <Icon name="kind" size={38} strich={1.6} />
            </div>
            <h1 className="auf-bild mt-6 text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">Noch kein Kind verknüpft</h1>
            <p className="auf-bild mt-3 text-[16px] leading-relaxed text-tinte-matt dark:text-slate-300">
              Sobald das Stufenteam Ihren Zugang mit Ihrem Kind verknüpft, sehen Sie hier Beiträge, Mithilfe und
              Kontodaten. Das erscheint von selbst – Sie müssen nichts neu laden.
            </p>
            <div className="mt-5 w-full rounded-2xl zelle p-4 text-left">
              <div className="text-[15px] font-semibold">Dauert es länger?</div>
              <p className="mt-1 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">
                Ihr Kind kann dem Stufenteam in der App Bescheid geben. Sie können das Stufenteam auch direkt
                ansprechen, zum Beispiel am Elternabend oder über die Schule.
              </p>
            </div>
          </div>
          {/* Wie in iOS: eine deckende Gruppe aus Zeilen statt zweier grauer
              (durchscheinender) Knöpfe */}
          <div className="gruppe-zellen mx-auto w-full max-w-sm">
            <Zeile label="Passwort & Einstellungen" onClick={() => setProfilOffen(true)} />
            <Zeile
              label="Abmelden"
              rot
              onClick={() => void frage("Wirklich abmelden?", "Abmelden", true).then((ok) => { if (ok) void abmelden(); })}
            />
          </div>
        </div>
        <ProfilSheet open={profilOffen} onClose={() => setProfilOffen(false)} />
      </div>
    );

  return (
    // Kein eigener Grund (vorher bg-papier): der verdeckte das eigene
    // Hintergrundbild. Ohne Bild malt body dieselbe Farbe.
    <div className="min-h-dvh pb-32 lg:pb-10">
      {/* Das feststehende Abimotto sehen auch Eltern einmal groß */}
      <MottoEnthuellung />
      <header
        className={`sticky top-0 z-20 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] transition-[background-color,box-shadow] duration-300 ${
          gescrollt ? "kopf-band" : "kopf-grund bg-papier dark:bg-slate-950"
        }`}
      >
        {/* Dieselbe Spalte wie <main> (max-w-3xl, ab lg 5xl ohne Rand
            gerechnet): Am iPad hoch stand die Kopfzeile sonst je 26 px über
            die Karten hinaus, der kleine Titel 30 px links vom großen. */}
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 lg:box-content lg:max-w-5xl">
          {/* Wie in der Schüler-App: am Rechner steht der Titel fest hier oben
              (vorher sprang der große Titel je Reiter zwischen zwei Breiten) */}
          {/* Am Rechner die einzige Seitenüberschrift (h1), am Handy nur die
              kleine Wiederholung des großen Titels – dort für Vorlesehilfen aus */}
          <div
            role={breit ? "heading" : undefined}
            aria-level={breit ? 1 : undefined}
            aria-hidden={breit ? undefined : true}
            className={`min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] transition-[opacity,transform,visibility] duration-300 ease-ios lg:visible lg:translate-y-0 lg:font-zahl lg:text-[1.625rem] lg:font-bold lg:tracking-[-0.025em] lg:opacity-100 ${
              titelWeg ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"
            } ${gescrollt ? "" : "auf-bild"}`}
          >
            {TITEL[reiter]}
          </div>
          <button className="iconbtn" onClick={toggle} aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}>
            <Icon name={theme === "dark" ? "sonne" : "mond"} size={19} />
          </button>
          <button
            data-tour="profil"
            onClick={() => setProfilOffen(true)}
            aria-label={`Ihr Zugang – ${familienName}`}
            title="Ihr Zugang"
            // Tippfläche 44 px wie in der Schüler-App, der runde Knopf bleibt 40 px
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-600 text-[14px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
              {familienKuerzel}
            </span>
          </button>
        </div>

        {/* Am Rechner: schwebende Reiterleiste oben, auf dem Handy unten. */}
        <nav className="glas mx-auto mt-2 hidden w-fit max-w-full rounded-full border border-black/[0.06] !bg-[rgb(var(--glas))] p-1 shadow-glas dark:border-white/10 lg:flex">
          <GlasLeiste
            variante="oben"
            aktiv={reiter}
            onWahl={setReiter}
            reiter={NAV.map((n) => ({ key: n.key, label: n.label, badge: n.zahl, tour: `tab-${n.key}`, icon: <Icon name={n.icon} size={16} /> }))}
          />
        </nav>
      </header>

      {/* Großer Titel – läuft beim Scrollen mit weg, oben erscheint er klein */}
      <div className="auf-bild mx-auto max-w-3xl px-5 pb-1 pt-1 lg:hidden">
        <h1 className="font-zahl text-[2.125rem] font-bold leading-tight tracking-[-0.025em]">{TITEL[reiter]}</h1>
        <p className="truncate text-[13px] text-tinte-leise">{familienName} · Abi 28</p>
      </div>

      {/* lg:box-content: Breite ohne Rand gerechnet – so fluchtet der Inhalt
          genau mit Titel und Knöpfen der Kopfzeile */}
      <main className="mx-auto max-w-3xl px-4 pt-2 lg:box-content lg:max-w-5xl lg:pt-3">
        <PushHinweis fuerEltern />
        {reiter === "uebersicht" &&
          (laedt ? (
            <SkelettKarten n={2} gross />
          ) : (
            <div key="uebersicht" className="grid animate-fadeIn gap-5">
              {/* Oben, was Eltern beim seltenen Öffnen wissen wollen: was offen
                  ist (und wohin damit) und was es Neues gibt. Am Rechner stehen
                  beide nebeneinander, das spart eine ganze Zeile. */}
              <div className={hatNeues ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}>
                <section className="leitkarte sm:flex sm:items-end sm:justify-between sm:gap-6" data-tour="familie-offen">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-white/60">
                      {mehrere ? "Offen für Ihre Kinder zusammen" : kinder[0] ? `Noch offen für ${kinder[0].vorname}` : "Noch offen"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`leitwert ${familieOffen > 0 ? "text-white" : "text-[#30D158]"}`}>{familieOffen} €</span>
                      <span className="text-[14px] text-white/60">
                        {familieOffen > 0
                          ? mehrere
                            ? // Je Kind der eigene Betrag – überwiesen wird ja je Kind
                              `${kinder.map((k) => `${k.vorname} ${basisOffen(k, settings.aktuelles_halbjahr, settings)} €`).join(" · ")} – bitte je Kind einzeln überweisen`
                            : ""
                          : "Alles bezahlt. Danke!"}
                      </span>
                    </div>
                  </div>
                  {familieOffen > 0 && (
                    <button
                      onClick={() => setReiter("konto")}
                      className="mt-4 flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 text-[15px] font-semibold text-[#1c1c1e] transition active:scale-[.97] sm:mt-0 sm:w-auto"
                    >
                      Jetzt überweisen
                      <Icon name="chevron" size={16} strich={2.4} />
                    </button>
                  )}
                </section>

                {/* Neu vom Stufenteam: Info oder Antwort – ein Tipp öffnet „Infos“ */}
                {hatNeues && (
                  <nav aria-label="Neu für Sie" className="gruppe-zellen flex flex-col justify-center">
                    {neueInfos.length > 0 && (
                      <Zeile
                        symbol={
                          <Symbol farbe="bg-brand">
                            <Icon name="pin" size={16} strich={2.2} />
                          </Symbol>
                        }
                        label={<span className="font-semibold">{neueInfos[0].titel}</span>}
                        unter={
                          neueInfos.length > 1
                            ? `${neueInfos.length} neue Infos vom Stufenteam`
                            : `Neu vom Stufenteam · ${new Date(neueInfos[0].created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`
                        }
                        onClick={() => setReiter("infos")}
                      />
                    )}
                    {ungelesen > 0 && (
                      <Zeile
                        symbol={
                          <Symbol farbe="bg-emerald-500">
                            <Icon name="chats" size={16} strich={2.2} />
                          </Symbol>
                        }
                        label={<span className="font-semibold">{ungelesen === 1 ? "Antwort vom Stufenteam" : `${ungelesen} Antworten vom Stufenteam`}</span>}
                        unter="Auf Ihre Frage ans Stufenteam"
                        onClick={() => {
                          setInfosStart(ungelesenIds[0] ?? null);
                          setReiter("infos");
                        }}
                      />
                    )}
                  </nav>
                )}
              </div>

              {/* „Als App installieren“ erst NACH dem Offenen und Neuen – vorher
                  stand die Karte darüber (ohne Abstand an der Leitkarte) und
                  schob am kleinen iPhone „Neu vom Stufenteam“ unter die
                  Reiterleiste. Als eigenes Rasterkind: gleicher Abstand wie
                  die anderen Karten, ohne Karte keine Lücke. */}
              <InstallKarte className="" />

              {/* Jedes Kind eine kompakte Karte. Geschwister stehen ab 700 px
                  nebeneinander (iPad mini hoch: zwei Spalten so breit wie ein
                  iPhone). Bei einem Kind steht daneben, was für die Familie gilt. */}
              <div
                className={
                  mehrere
                    ? "grid grid-cols-1 gap-4 min-[700px]:grid-cols-2 min-[700px]:items-start"
                    : "grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start"
                }
              >
                {kinder.map((kind, i) => (
                  <KindKarte
                    key={kind.id}
                    kind={kind}
                    erstes={i === 0}
                    einzeln={!mehrere}
                    punkte={punkte[kind.id] || 0}
                    eintraege={contributions
                      .filter((c) => c.student_id === kind.id)
                      .sort((a, b) => (a.datum < b.datum ? 1 : -1))}
                  />
                ))}
                {!mehrere && <TicketFamilie settings={settings} kinder={familie} />}
              </div>

              {/* Legende und Begriffe EINMAL für alle Kinder (vorher je Kind) */}
              {mehrere && (
                // Ab iPad die Legende dicht beieinander statt über die ganze
                // Breite verteilt (HalbjahrLegende verteilt erst ab lg nicht mehr)
                <div className="auf-bild -mt-2 px-1 min-[700px]:[&_ul]:justify-start min-[700px]:[&_ul]:gap-x-6">
                  <HalbjahrLegende />
                  <Begriffe className="mt-2" />
                </div>
              )}

              {/* Gäste-Ticket, Verkaufsstand und Staffel – einmal, nicht bei jedem Kind */}
              {mehrere && <TicketFamilie settings={settings} kinder={familie} breit />}

              {/* Feststehendes Abimotto – antippen spielt die Enthüllung noch
                  einmal ab. Schön, aber selten gebraucht: darum unter den Kindern. */}
              <MottoFeststehend />
            </div>
          ))}

        {reiter === "infos" && (
          <div key="infos" className="mx-auto max-w-3xl animate-fadeIn lg:max-w-5xl">
            <ElternInfosTab startGespraech={infosStart} />
          </div>
        )}
        {reiter === "finanzen" && (
          <div key="finanzen" className="mx-auto max-w-3xl animate-fadeIn lg:max-w-5xl">
            <FinanzStandard />
          </div>
        )}
        {reiter === "konto" && (
          <div key="konto" className="mx-auto max-w-3xl animate-fadeIn lg:max-w-5xl">
            <KontoTab />
          </div>
        )}
      </main>

      {/* Reiterleiste wie in der Schüler-App: schwebende Glas-Kapsel (GlasLeiste) */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
        <div className="pointer-events-auto mx-auto max-w-md rounded-[2rem] border border-white/60 p-1 shadow-[0_8px_32px_-8px_rgba(0,0,0,.28),0_0_0_.5px_rgba(0,0,0,.08)] glas !bg-[rgb(var(--glas))] dark:border-white/10 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,.8),0_0_0_.5px_rgba(255,255,255,.08)]">
          <GlasLeiste
            variante="unten"
            aktiv={reiter}
            onWahl={setReiter}
            reiter={NAV.map((n) => ({
              key: n.key,
              label: n.label,
              badge: n.zahl,
              tour: `tab-${n.key}`,
              icon: <Icon name={n.icon} size={24} strich={reiter === n.key ? 2.2 : 1.7} />,
            }))}
          />
        </div>
      </nav>

      <ProfilSheet
        open={profilOffen}
        onClose={() => setProfilOffen(false)}
        onNeu={() => {
          setProfilOffen(false);
          setPatch(true);
        }}
        onTutorial={() => {
          setProfilOffen(false);
          setReiter("uebersicht");
          setTour(true);
        }}
      />
      <Tour
        open={tour}
        steps={elternSchritte({ mehrereKinder: kinder.length > 1 })}
        onTab={(t) => {
          // den schon offenen Reiter nicht noch einmal setzen (scrollte nach oben)
          if (t !== reiter) setReiter(t as Reiter);
        }}
        onClose={() => {
          setTour(false);
          setReiter("uebersicht");
          window.scrollTo({ top: 0, behavior: "smooth" });
          try {
            localStorage.setItem(TOUR_MERKER, new Date().toISOString());
            // Wer die Einführung gerade gesehen hat, braucht „Was ist neu“ nicht
            localStorage.setItem(PATCH_MERKER, PATCH.version);
          } catch {
            /* privates Fenster */
          }
        }}
      />
      {patch && !tour && (
        <PatchNotes
          gruppen={["eltern"]}
          onFertig={() => {
            setPatch(false);
            try {
              localStorage.setItem(PATCH_MERKER, PATCH.version);
            } catch {
              /* privates Fenster */
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Ein Kind als EINE kompakte Karte (wie eine Gruppe in iOS): oben Name, was
 * offen ist und die sechs Halbjahre, darunter je eine Zeile „Mithilfe“ und
 * „Abiball-Ticket“ – ein Tipp öffnet die Einzelheiten im Blatt.
 *
 * Prüfung Okt. 2026: Vorher drei Karten je Kind (Halbjahre, Ticket mit großer
 * Grafik, Mithilfe mit Staffel). Am iPhone war die Übersicht 2,6 Bildschirme
 * lang, das zweite Kind kam erst nach 1,5 Bildschirmen, Staffel, Legende und
 * „Preis folgt“-Ticket standen je Kind doppelt. Was für alle gleich ist,
 * steht jetzt einmal (Legende unter den Kindern, `TicketFamilie`).
 * „Wobei … geholfen hat“ steht im Mithilfe-Blatt (PunkteSheet, nur lesen);
 * die Zeile nennt Anzahl und letzten Eintrag.
 */
function KindKarte({
  kind,
  punkte,
  eintraege,
  erstes,
  einzeln,
}: {
  kind: import("../lib/types").Student;
  punkte: number;
  eintraege: import("../lib/types").Contribution[];
  /** Nur am ersten Kind hängen die Anker für die Einführung. */
  erstes: boolean;
  /** Das einzige Kind: Legende und Begriffe stehen in seiner Karte */
  einzeln: boolean;
}) {
  const { settings } = useStore();
  const [mithilfeAuf, setMithilfeAuf] = useState(false);
  const offen = basisOffen(kind, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);
  const letzte = eintraege[0];

  return (
    <section className="card overflow-hidden" aria-label={`${kind.vorname} ${kind.nachname}`}>
      {/* Trennlinien zwischen den Teilen wie in einer iOS-Gruppe */}
      <div className="gruppe-zellen !rounded-none !bg-transparent">
        <div className="px-4 pb-3.5 pt-3.5" data-tour={erstes ? "kind-halbjahre" : undefined}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate font-zahl text-[19px] font-bold tracking-[-0.02em]">
              {kind.vorname} {kind.nachname}
            </h2>
            <div className="shrink-0 text-[14px]">
              <span className={`zahl font-bold ${offen > 0 ? "text-offen" : "text-bezahlt"}`}>{offen} €</span>
              <span className="ml-1 text-tinte-leise">offen</span>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5" aria-label="Halbjahre">
            {HY.map((h, i) => (
              <TermChip key={h} student={kind} h={h} i={i} current={settings.aktuelles_halbjahr} />
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {HY.map((h) => (
              <div key={h} className="zahl flex-1 basis-0 text-center text-[12px] font-medium text-tinte-leise">
                {beitragFuer(h, settings)} €
              </div>
            ))}
          </div>
          {einzeln && (
            <>
              <HalbjahrLegende />
              <Begriffe className="mt-3" />
            </>
          )}
        </div>

        {/* Mithilfe: Stand rechts, Einzelheiten (Staffel, Einträge) im Blatt */}
        <div data-tour={erstes ? "kind-prozent" : undefined}>
          <Zeile
            symbol={
              <Symbol farbe="bg-[#34C759]">
                <Icon name="herz" size={16} strich={2.2} />
              </Symbol>
            }
            label="Mithilfe bei Aktionen"
            unter={
              letzte
                ? `${eintraege.length} ${eintraege.length === 1 ? "Eintrag" : "Einträge"} · zuletzt ${letzte.titel}`
                : "Noch nichts eingetragen"
            }
            onClick={() => setMithilfeAuf(true)}
          >
            <span className="zahl text-[17px] font-bold text-brand-dark dark:text-brand">{pct} %</span>
          </Zeile>
        </div>

        {/* Abiball-Ticket: Preis und Stand, offene Bestellungen mit „Überweisen“ */}
        <TicketZeilen student={kind} settings={settings} prozent={pct} />
      </div>

      <PunkteSheet student={kind} settings={settings} editable={false} open={mithilfeAuf} onClose={() => setMithilfeAuf(false)} />
    </section>
  );
}
