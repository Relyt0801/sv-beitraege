import { useMemo, useState } from "react";
import { HY } from "../lib/types";
import { basisOffen, beitragFuer, prozentVon, punkteIndex, ticketBetrag } from "../lib/logic";
import { useStore } from "../store";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { TermChip } from "./TermChip";
import { Ring } from "./Ring";
import { BeitragsListe } from "./BeitragsListe";
import { TicketErklaerung } from "./TicketErklaerung";
import { ElternInfosTab } from "./ElternInfosTab";
import { KontoTab } from "./KontoTab";
import { ProfilSheet } from "./ProfilSheet";
import { useTheme } from "../lib/theme";

type Reiter = "uebersicht" | "infos" | "konto";

/**
 * Die ganze App, wie Eltern sie sehen.
 *
 * Bewusst klein gehalten: drei Reiter, keine Chats, keine Events, keine
 * Personenliste. Sichtbar sind nur die eigenen Kinder – dafuer sorgt zusaetzlich
 * die Datenbank selbst, nicht nur diese Oberflaeche.
 */
export function ElternApp() {
  const [reiter, setReiter] = useState<Reiter>("uebersicht");
  const [profilOffen, setProfilOffen] = useState(false);
  const { theme, toggle } = useTheme();
  const { students, contributions, settings, ready } = useStore();
  const { bereit } = useEltern();

  const punkte = useMemo(() => punkteIndex(contributions), [contributions]);
  const kinder = useMemo(
    () => [...students].sort((a, b) => a.vorname.localeCompare(b.vorname, "de")),
    [students],
  );

  const NAV: { key: Reiter; label: string; icon: string }[] = [
    { key: "uebersicht", label: "Übersicht", icon: "🏠" },
    { key: "infos", label: "Infos", icon: "📌" },
    { key: "konto", label: "Konto", icon: "🏦" },
  ];

  return (
    <div className="min-h-dvh bg-slate-50 pb-24 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold leading-tight">
              {reiter === "uebersicht" ? "Stufenkasse" : reiter === "infos" ? "Infos vom Stufenteam" : "Kontodaten"}
            </h1>
            <p className="truncate text-[12px] text-slate-500">Elternzugang · Abi 28</p>
          </div>
          <button
            onClick={toggle}
            className="rounded-xl px-2.5 py-2 text-slate-400 transition active:scale-90"
            aria-label="Hell oder dunkel"
          >
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <button
            onClick={() => setProfilOffen(true)}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 transition active:scale-95 dark:bg-slate-800 dark:text-slate-300"
          >
            Mein Zugang
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {reiter === "uebersicht" && (
          <>
            {!ready || !bereit ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
                <div className="text-sm font-medium">Wird geladen …</div>
              </div>
            ) : kinder.length === 0 ? (
              <div className="card p-6 text-center text-sm text-slate-500">
                Ihrem Zugang ist noch kein Kind zugeordnet.
                <br />
                Melden Sie sich beim Stufenteam, dann wird das eingerichtet.
              </div>
            ) : (
              <div className="grid gap-4">
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

        {reiter === "infos" && <ElternInfosTab />}
        {reiter === "konto" && <KontoTab kinder={kinder} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-3xl">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setReiter(n.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition ${
                reiter === n.key ? "text-brand" : "text-slate-400"
              }`}
            >
              <span className="text-lg leading-none">{n.icon}</span>
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
        <h2 className="text-xl font-extrabold">{kind.vorname} {kind.nachname}</h2>
      </div>

      {/* offener Betrag */}
      <section className="card p-5">
        <div className="text-sm text-slate-500">Noch offen für die Stufenkasse</div>
        <div className={`mt-0.5 text-4xl font-extrabold leading-none ${offen > 0 ? "text-amber-500" : "text-emerald-500"}`}>
          {offen} €
        </div>
        <div className="mt-1 text-[13px] text-slate-500">
          {offen > 0
            ? "Wie Sie das überweisen, steht im Reiter Konto."
            : "Alles bezahlt. Vielen Dank!"}
        </div>

        <div className="mt-4 flex gap-1.5">
          {HY.map((h, i) => (
            <TermChip key={h} student={kind} h={h} i={i} current={settings.aktuelles_halbjahr} />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {HY.map((h) => (
            <div key={h} className="flex-1 basis-0 text-center text-[11px] font-semibold text-slate-400">
              {beitragFuer(h, settings)} €
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span>✓ bezahlt</span>
          <span>€ noch offen</span>
          <span>/ erlassen</span>
          <span>– noch nicht dabei</span>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Prozentstand */}
        <section className="card p-5">
          <div className="text-sm text-slate-500">Mithelfen beim Abiball</div>
          <div className="mt-2 flex items-center gap-4">
            <Ring pct={pct} />
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              Wer bei Aktionen der Stufe mithilft, sammelt Prozent. Je mehr Prozent, desto günstiger
              wird das erste Abiballticket.
            </div>
          </div>
        </section>

        <TicketErklaerung settings={settings} zusatz={ticketBetrag(pct, settings)} prozent={pct} fuerEltern />
      </div>

      <section className="card p-5">
        <div className="text-sm text-slate-500">Wobei {kind.vorname} geholfen hat</div>
        <BeitragsListe
          eintraege={eintraege}
          leerText={`Bisher ist nichts eingetragen. Sobald ${kind.vorname} mithilft, erscheint es hier.`}
        />
      </section>
    </div>
  );
}
