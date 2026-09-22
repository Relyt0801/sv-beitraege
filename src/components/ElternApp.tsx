import { useEffect, useMemo, useState } from "react";
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
import { useTheme } from "../lib/theme";
import { PushHinweis, usePushAuffrischen } from "./PushHinweis";
import { InstallKarte } from "./InstallHinweis";
import { appZaehler } from "../lib/push";

type Reiter = "uebersicht" | "infos" | "konto";

/**
 * Die ganze App, wie Eltern sie sehen.
 *
 * Bewusst klein gehalten: drei Reiter, keine Chats, keine Events, keine
 * Personenliste. Sichtbar sind nur die eigenen Kinder – dafuer sorgt zusaetzlich
 * die Datenbank selbst, nicht nur diese Oberflaeche.
 */
export function ElternApp() {
  // Benachrichtigung angetippt? Dann gleich in die Infos.
  const [reiter, setReiter] = useState<Reiter>(() => {
    if (window.location.hash === "#infos") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      return "infos";
    }
    return "uebersicht";
  });
  const [profilOffen, setProfilOffen] = useState(false);
  const { theme, toggle } = useTheme();
  const { students, contributions, settings, ready } = useStore();
  const { bereit, ungelesen } = useEltern();
  usePushAuffrischen();
  useEffect(() => appZaehler(ungelesen || 0), [ungelesen]);

  const punkte = useMemo(() => punkteIndex(contributions), [contributions]);
  const kinder = useMemo(
    () => [...students].sort((a, b) => a.vorname.localeCompare(b.vorname, "de")),
    [students],
  );
  // "Familie Buja" statt "Mein Zugang". Bei Geschwistern mit verschiedenen
  // Nachnamen stehen beide da, getrennt durch einen Schraegstrich.
  const familienName = useMemo(() => {
    const namen = [...new Set(kinder.map((k) => k.nachname).filter(Boolean))];
    return namen.length ? `Familie ${namen.join(" / ")}` : "Mein Zugang";
  }, [kinder]);

  const familieOffen = kinder.reduce(
    (n, k) => n + basisOffen(k, settings.aktuelles_halbjahr, settings),
    0,
  );

  const NAV: { key: Reiter; label: string; icon: IconName; zahl?: number }[] = [
    { key: "uebersicht", label: "Übersicht", icon: "haus" },
    { key: "infos", label: "Infos", icon: "pin", zahl: ungelesen },
    { key: "konto", label: "Konto", icon: "bank" },
  ];

  return (
    <div className="min-h-dvh bg-papier-matt pb-24 dark:bg-slate-950 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-papier-linie bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight">
              {reiter === "uebersicht" ? "Stufenkasse" : reiter === "infos" ? "Infos" : "Kontodaten"}
            </h1>
            <p className="truncate text-[12px] text-tinte-matt">Elternzugang · Abi 28</p>
          </div>
          <button
            onClick={toggle}
            className="rounded-xl px-2.5 py-2 text-tinte-leise transition active:scale-90"
            aria-label="Hell oder dunkel"
          >
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <button
            onClick={() => setProfilOffen(true)}
            className="max-w-[46vw] truncate rounded-xl bg-papier-matt px-3 py-2 text-sm font-bold text-tinte-matt transition active:scale-95 dark:bg-slate-800 dark:text-slate-300"
          >
            {familienName}
          </button>
        </div>

        {/* Am Rechner steht die Navigation oben, auf dem Handy unten. */}
        <div className="mx-auto mt-2 hidden max-w-5xl items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setReiter(n.key)}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                reiter === n.key
                  ? "bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-brand-soft"
                  : "text-tinte-matt hover:bg-papier-matt dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon name={n.icon} size={17} />
              {n.label}
              {Boolean(n.zahl) && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {n.zahl}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 lg:max-w-5xl lg:pb-8">
        <PushHinweis fuerEltern />
        {reiter === "uebersicht" && <InstallKarte />}
        {reiter === "uebersicht" && (
          <>
            {!ready || !bereit ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
                <div className="text-sm font-medium">Wird geladen …</div>
              </div>
            ) : kinder.length === 0 ? (
              <div className="card p-6 text-center text-sm text-tinte-matt">
                Noch kein Kind zugeordnet – bitte beim Stufenteam melden.
              </div>
            ) : (
              <div className="grid gap-4">
                {/* Erst die Summe für die ganze Familie, dann jedes Kind einzeln. */}
                <section className="leitkarte sm:flex sm:items-end sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <div className="kennlabel text-white/60">
                      {kinder.length > 1 ? "Offen für Ihre Kinder" : "Noch offen"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`leitwert ${familieOffen > 0 ? "text-white" : "text-emerald-400"}`}>
                        {familieOffen} €
                      </span>
                      <span className="text-[13px] text-white/60">
                        {familieOffen > 0
                          ? kinder.length > 1
                            ? "je Kind einzeln überweisen"
                            : ""
                          : "Alles bezahlt. Danke!"}
                      </span>
                    </div>
                  </div>
                  {familieOffen > 0 && (
                    <button
                      onClick={() => setReiter("konto")}
                      className="mt-4 flex h-11 w-full shrink-0 items-center justify-center rounded-xl bg-white px-5 text-[14px] font-semibold text-tinte transition active:scale-[.99] sm:mt-0 sm:w-auto"
                    >
                      Kontodaten
                    </button>
                  )}
                </section>

                {kinder.map((kind) => (
                  <KindKarte
                    key={kind.id}
                    kind={kind}
                    punkte={punkte[kind.id] || 0}
                    eintraege={contributions
                      .filter((c) => c.student_id === kind.id)
                      .sort((a, b) => (a.datum < b.datum ? 1 : -1))}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {reiter === "infos" && (
          <div className="mx-auto max-w-3xl">
            <ElternInfosTab />
          </div>
        )}
        {reiter === "konto" && (
          <div className="mx-auto max-w-3xl">
            <KontoTab />
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-papier-linie bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setReiter(n.key)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition ${
                reiter === n.key ? "text-brand" : "text-tinte-leise"
              }`}
            >
              <span className="relative flex h-[21px] items-center leading-none">
                <Icon name={n.icon} size={20} />
                {Boolean(n.zahl) && (
                  <span className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {n.zahl}
                  </span>
                )}
              </span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      <ProfilSheet open={profilOffen} onClose={() => setProfilOffen(false)} />
    </div>
  );
}

/** Ein Kind: offener Betrag, Prozentstand, Ticketpreis und die Liste der Beiträge. */
function KindKarte({
  kind,
  punkte,
  eintraege,
}: {
  kind: import("../lib/types").Student;
  punkte: number;
  eintraege: import("../lib/types").Contribution[];
}) {
  const { settings } = useStore();
  const offen = basisOffen(kind, settings.aktuelles_halbjahr, settings);
  const pct = prozentVon(punkte, settings);

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="font-zahl text-xl font-extrabold tracking-tight">
          {kind.vorname} {kind.nachname}
        </h2>
      </div>

      {/* Halbjahre und Betrag dieses Kindes */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-semibold text-tinte-matt">Halbjahre</div>
          <div className="text-[13px]">
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
            <div key={h} className="zahl flex-1 basis-0 text-center text-[11px] font-semibold text-tinte-leise">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-tinte-leise">
          <span>✓ bezahlt</span>
          <span>€ noch offen</span>
          <span>/ erlassen</span>
          <span>– noch nicht dabei</span>
        </div>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {/* Prozentstand */}
        <section className="card p-5">
          <div className="text-sm text-tinte-matt">Mithelfen beim Abiball</div>
          <div className="mt-2 flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
              Mithelfen bei Aktionen senkt den Preis des ersten Abiballtickets.
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
                  className={`rounded-lg px-1 py-1.5 text-center ${
                    aktuell
                      ? "bg-brand text-white"
                      : erreicht
                        ? "bg-brand/15 text-brand"
                        : "bg-papier-matt text-tinte-leise dark:bg-slate-800"
                  }`}
                >
                  <div className="text-[12px] font-extrabold leading-none">{stufe.ab}%</div>
                  <div className="mt-0.5 text-[10px] font-semibold leading-none opacity-90">
                    +{stufe.betrag} €
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 text-[11px] text-tinte-leise">Aufschlag aufs erste Ticket</div>
        </section>

        <TicketErklaerung settings={settings} zusatz={ticketBetrag(pct, settings)} prozent={pct} fuerEltern />
      </div>

      <section className="card p-5">
        <div className="text-sm text-tinte-matt">Wobei {kind.vorname} geholfen hat</div>
        <BeitragsListe
          eintraege={eintraege}
          leerText="Noch nichts eingetragen."
        />
      </section>
    </div>
  );
}
