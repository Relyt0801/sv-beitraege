import { useEffect, useMemo, useRef, useState } from "react";
import { HY } from "../lib/types";
import { basisOffen, beitragFuer, prozentVon, punkteIndex, staffelVon, ticketBetrag } from "../lib/logic";
import { useStore } from "../store";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { TermChip } from "./TermChip";
import { Ring } from "./Ring";
import { BeitragsListe } from "./BeitragsListe";
import { TicketErklaerung } from "./TicketErklaerung";
import { Icon, type IconName } from "./Icon";
import { ElternInfosTab } from "./ElternInfosTab";
import { KontoTab } from "./KontoTab";
import { ProfilSheet } from "./ProfilSheet";
import { Tour, elternSchritte } from "./Tour";
import { useTheme } from "../lib/theme";
import { useGescrollt, useReiter } from "../lib/gescrollt";
import { hasSupabase } from "../lib/supabase";
import { PushHinweis, usePushAuffrischen } from "./PushHinweis";
import { InstallKarte } from "./InstallHinweis";
import { abmelden, appZaehler } from "../lib/push";

import { frage } from "../lib/melder";
type Reiter = "uebersicht" | "infos" | "konto";

const TITEL: Record<Reiter, string> = { uebersicht: "Stufenkasse", infos: "Infos", konto: "Kontodaten" };
const TOUR_MERKER = "sv:tour:v3:eltern";

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
  const { theme, toggle } = useTheme();
  const gescrollt = useGescrollt(4);
  const titelWeg = useGescrollt(44);
  const { students, contributions, settings, ready, reload } = useStore();
  const { bereit, ungelesen, kinder: zugeordnet, zuordnungFehlt } = useEltern();
  // Fehlt die Zuordnung wegen eines Ladefehlers, gilt, was die Datenbank an
  // Personen herausgibt – die liefert Eltern ohnehin nur ihre Kinder.
  const kinderIds = useMemo(
    () => (zuordnungFehlt ? students.map((s) => s.id) : zugeordnet),
    [zuordnungFehlt, students, zugeordnet],
  );
  const { tourResetAt } = useRole();
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

  useEffect(() => appZaehler(ohneKind ? 0 : ungelesen || 0), [ungelesen, ohneKind]);

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
  // "Familie Buja" statt "Mein Zugang". Bei Geschwistern mit verschiedenen
  // Nachnamen stehen beide da, getrennt durch einen Schraegstrich.
  const familienName = useMemo(() => {
    const namen = [...new Set(kinder.map((k) => k.nachname).filter(Boolean))];
    return namen.length ? `Familie ${namen.join(" / ")}` : "Mein Zugang";
  }, [kinder]);

  // Zwei Buchstaben fuer den runden Profilknopf: "Familie Buja" -> "BU"
  const familienKuerzel = useMemo(() => {
    const namen = [...new Set(kinder.map((k) => k.nachname).filter(Boolean))];
    if (namen.length > 1) return namen.slice(0, 2).map((n) => n[0]).join("").toUpperCase();
    return (namen[0] ?? "Ich").slice(0, 2).toUpperCase();
  }, [kinder]);

  const familieOffen = kinder.reduce((n, k) => n + basisOffen(k, settings.aktuelles_halbjahr, settings), 0);

  const NAV: { key: Reiter; label: string; icon: IconName; zahl?: number }[] = [
    { key: "uebersicht", label: "Übersicht", icon: "haus" },
    { key: "infos", label: "Infos", icon: "pin", zahl: ungelesen },
    { key: "konto", label: "Konto", icon: "bank" },
  ];

  // ------------------------------------------------ Kein Kind: nichts zeigen
  if (ohneKind)
    return (
      <div className="flex min-h-dvh flex-col bg-papier px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1rem)] dark:bg-slate-950">
        <div className="flex justify-end">
          <button className="iconbtn" onClick={toggle} aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}>
            <Icon name={theme === "dark" ? "sonne" : "mond"} size={19} />
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 animate-aufsteigen flex-col items-center justify-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-white text-tinte-leise shadow-card dark:bg-slate-900">
            <Icon name="kind" size={38} strich={1.6} />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">Noch kein Kind zugeordnet</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-tinte-matt dark:text-slate-300">
            Sobald das Stufenteam Ihrem Zugang ein Kind zuordnet, sehen Sie hier Beiträge, Mithilfe und
            Kontodaten. Das erscheint von selbst – Sie müssen nichts neu laden.
          </p>
          <p className="mt-3 text-[14px] text-tinte-leise">
            Dauert es länger? Bitte melden Sie sich über Ihr Kind beim Stufenteam der Stufe.
          </p>
        </div>
        <div className="mx-auto grid w-full max-w-sm gap-2">
          <button className="btn-grau" onClick={() => setProfilOffen(true)}>
            Passwort & Einstellungen
          </button>
          <button className="btn-grau !text-red-600 dark:!text-red-400" onClick={() => void frage("Wirklich abmelden?", "Abmelden", true).then((ok) => { if (ok) void abmelden(); })}>
            Abmelden
          </button>
        </div>
        <ProfilSheet open={profilOffen} onClose={() => setProfilOffen(false)} />
      </div>
    );

  return (
    <div className="min-h-dvh bg-papier pb-32 dark:bg-slate-950 lg:pb-10">
      <header
        className={`sticky top-0 z-20 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] transition-[background-color,box-shadow] duration-300 ${
          gescrollt ? "glas shadow-[0_0.5px_0_rgba(0,0,0,.18)] dark:shadow-[0_0.5px_0_rgba(255,255,255,.15)]" : "bg-papier dark:bg-slate-950"
        }`}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          <div
            aria-hidden={!titelWeg}
            className={`min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] transition duration-300 ease-ios ${
              titelWeg ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-[14px] font-semibold text-white ring-2 ring-white transition active:scale-90 dark:ring-slate-900"
          >
            {familienKuerzel}
          </button>
        </div>

        {/* Am Rechner: schwebende Reiterleiste oben, auf dem Handy unten. */}
        <nav className="glas mx-auto mt-3 hidden w-fit items-center gap-0.5 rounded-full border border-black/[0.06] p-1 shadow-glas dark:border-white/10 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              data-tour={`tab-${n.key}`}
              onClick={() => setReiter(n.key)}
              aria-current={reiter === n.key ? "page" : undefined}
              className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition duration-300 ease-ios active:scale-95 ${
                reiter === n.key
                  ? "bg-white text-brand-dark shadow-[0_2px_8px_rgba(0,0,0,.1)] dark:bg-slate-700 dark:text-white"
                  : "text-tinte-matt hover:text-tinte dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              <Icon name={n.icon} size={16} />
              {n.label}
              {Boolean(n.zahl) && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white">
                  {n.zahl}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Großer Titel – läuft beim Scrollen mit weg, oben erscheint er klein */}
      <div className={`mx-auto max-w-3xl px-5 pb-1 pt-1 ${reiter === "uebersicht" ? "lg:max-w-5xl" : ""}`}>
        <h1 className="font-zahl text-[2.125rem] font-bold leading-tight tracking-[-0.025em]">{TITEL[reiter]}</h1>
        <p className="truncate text-[13px] text-tinte-leise">{familienName} · Abi 28</p>
      </div>

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:max-w-5xl">
        <PushHinweis fuerEltern />
        {reiter === "uebersicht" && <InstallKarte />}
        {reiter === "uebersicht" &&
          (laedt ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-500 dark:border-slate-700 dark:border-t-slate-300" />
              <div className="text-sm font-medium">Wird geladen …</div>
            </div>
          ) : (
            <div key="uebersicht" className="grid animate-fadeIn gap-5">
              {/* Erst die Summe für die ganze Familie, dann jedes Kind einzeln. */}
              <section className="leitkarte sm:flex sm:items-end sm:justify-between sm:gap-6" data-tour="familie-offen">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-white/60">
                    {kinder.length > 1 ? "Offen für Ihre Kinder" : "Noch offen"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`leitwert ${familieOffen > 0 ? "text-white" : "text-[#30D158]"}`}>{familieOffen} €</span>
                    <span className="text-[14px] text-white/60">
                      {familieOffen > 0 ? (kinder.length > 1 ? "je Kind einzeln überweisen" : "") : "Alles bezahlt. Danke!"}
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

              {kinder.map((kind, i) => (
                <KindKarte
                  key={kind.id}
                  kind={kind}
                  erstes={i === 0}
                  punkte={punkte[kind.id] || 0}
                  eintraege={contributions
                    .filter((c) => c.student_id === kind.id)
                    .sort((a, b) => (a.datum < b.datum ? 1 : -1))}
                />
              ))}
            </div>
          ))}

        {reiter === "infos" && (
          <div key="infos" className="mx-auto max-w-3xl animate-fadeIn">
            <ElternInfosTab />
          </div>
        )}
        {reiter === "konto" && (
          <div key="konto" className="mx-auto max-w-3xl animate-fadeIn">
            <KontoTab />
          </div>
        )}
      </main>

      {/* Schwebende Tab-Leiste aus Glas */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
        <div className="glas pointer-events-auto mx-auto flex max-w-sm rounded-[1.9rem] border border-black/[0.06] p-1 shadow-glas dark:border-white/10">
          {NAV.map((n) => (
            <button
              key={n.key}
              data-tour={`tab-${n.key}`}
              onClick={() => setReiter(n.key)}
              aria-current={reiter === n.key ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-[1.5rem] pb-1.5 pt-2 text-[11px] font-semibold transition duration-300 ease-ios active:scale-90 ${
                reiter === n.key ? "bg-black/[0.06] text-brand dark:bg-white/[0.12]" : "text-tinte dark:text-slate-100"
              }`}
            >
              <span className="relative flex h-[22px] items-center leading-none">
                <Icon name={n.icon} size={22} strich={reiter === n.key ? 2.2 : 1.8} />
                {Boolean(n.zahl) && (
                  <span className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
                    {n.zahl}
                  </span>
                )}
              </span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      <ProfilSheet
        open={profilOffen}
        onClose={() => setProfilOffen(false)}
        onTutorial={() => {
          setProfilOffen(false);
          setReiter("uebersicht");
          setTour(true);
        }}
      />
      <Tour
        open={tour}
        steps={elternSchritte({ mehrereKinder: kinder.length > 1 })}
        onTab={(t) => setReiter(t as Reiter)}
        onClose={() => {
          setTour(false);
          setReiter("uebersicht");
          window.scrollTo({ top: 0, behavior: "smooth" });
          try {
            localStorage.setItem(TOUR_MERKER, new Date().toISOString());
          } catch {
            /* privates Fenster */
          }
        }}
      />
    </div>
  );
}

/** Ein Kind: offener Betrag, Prozentstand, Ticketpreis und die Liste der Beiträge. */
function KindKarte({
  kind,
  punkte,
  eintraege,
  erstes,
}: {
  kind: import("../lib/types").Student;
  punkte: number;
  eintraege: import("../lib/types").Contribution[];
  /** Nur am ersten Kind hängen die Anker für die Einführung. */
  erstes: boolean;
}) {
  const { settings } = useStore();
  const offen = basisOffen(kind, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline gap-2 px-1 pt-1">
        <h2 className="font-zahl text-[1.375rem] font-bold tracking-[-0.02em]">
          {kind.vorname} {kind.nachname}
        </h2>
      </div>

      {/* Halbjahre und Betrag dieses Kindes */}
      <section className="card p-4 sm:p-5" data-tour={erstes ? "kind-halbjahre" : undefined}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[15px] font-semibold">Halbjahre</div>
          <div className="text-[14px]">
            <span className={`zahl font-bold ${offen > 0 ? "text-offen" : "text-bezahlt"}`}>{offen} €</span>
            <span className="ml-1 text-tinte-leise">offen</span>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5">
          {HY.map((h, i) => (
            <TermChip key={h} student={kind} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {HY.map((h) => (
            <div key={h} className="zahl flex-1 basis-0 text-center text-[11px] font-medium text-tinte-leise">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-tinte-leise">
          <span>✓ bezahlt</span>
          <span>€ offen</span>
          <span>/ erlassen</span>
          <span className="text-tinte-leise/80">grau = später fällig</span>
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {/* Prozentstand */}
        <section className="card p-5" data-tour={erstes ? "kind-prozent" : undefined}>
          <div className="text-[15px] font-semibold">Mithilfe bei Aktionen</div>
          <div className="mt-3 flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">
              Wer bei Aktionen mithilft, zahlt weniger Aufschlag auf das erste Abiball-Ticket.
            </div>
          </div>

          {/* Die Staffel zum Nachsehen: ab wie viel Prozent kostet das Ticket wie viel extra */}
          <div className="mt-4 grid grid-cols-5 gap-1">
            {staffelVon(settings).map((stufe) => {
              const erreicht = pct >= stufe.ab;
              const aktuell = staffelVon(settings).filter((x) => pct >= x.ab).pop()?.ab === stufe.ab;
              return (
                <div
                  key={stufe.ab}
                  className={`rounded-xl px-1 py-2 text-center transition ${
                    aktuell
                      ? "bg-brand text-white"
                      : erreicht
                        ? "bg-brand/[0.12] text-brand-dark dark:text-brand"
                        : "bg-[rgb(118_118_128/0.1)] text-tinte-leise"
                  }`}
                >
                  <div className="zahl text-[13px] font-bold leading-none">{stufe.ab} %</div>
                  <div className="zahl mt-1 text-[11px] font-medium leading-none opacity-90">+{stufe.betrag} €</div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 text-[12px] text-tinte-leise">Aufschlag aufs erste Ticket</div>
        </section>

        <TicketErklaerung settings={settings} zusatz={ticketBetrag(pct, settings)} prozent={pct} fuerEltern />
      </div>

      <section className="card p-5">
        <div className="text-[15px] font-semibold">Wobei {kind.vorname} geholfen hat</div>
        <BeitragsListe eintraege={eintraege} leerText="Noch nichts eingetragen." />
      </section>
    </div>
  );
}
