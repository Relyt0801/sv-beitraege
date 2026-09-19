import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HY, type Halbjahr, type Status } from "./lib/types";
import { normalize, offenGesamt, offenStufe, sortStudents, staffelVon } from "./lib/logic";
import { MyKasse } from "./components/MyKasse";
import { PunkteSheet } from "./components/PunkteSheet";
import { ProfilSheet } from "./components/ProfilSheet";
import { Avatar } from "./components/Avatar";
import { Tour, tourSteps } from "./components/Tour";
import { useTheme } from "./lib/theme";
import { useVerzoegert } from "./lib/entwurf";
import { hasSupabase, supabase } from "./lib/supabase";
import { abmelden, appZaehler } from "./lib/push";
import { PushHinweis, usePushAuffrischen } from "./components/PushHinweis";
import { useStore } from "./store";
import { AuthGate } from "./auth/AuthGate";
import { PasswordGate } from "./auth/PasswordGate";
import { RoleProvider, useRole } from "./auth/RoleProvider";
import { Sheet } from "./components/Sheet";
import { ProfilesProvider, useProfiles } from "./profiles-store";
import { EventsProvider, useEvents } from "./events-store";
import { TermineProvider, useTermine } from "./termine-store";
import { TopicsProvider, useTopics } from "./topics-store";
import { ChatsTab } from "./components/ChatsTab";
import { StudentCard, nextStatus } from "./components/StudentCard";
import { StudentSheet } from "./components/StudentSheet";
import { AddSheet } from "./components/AddSheet";
import { MassBar } from "./components/MassBar";
import { RolesTab } from "./components/RolesTab";
import { PermissionsTab } from "./components/PermissionsTab";
import { EventsTab } from "./components/EventsTab";
import { BeitraegeTab } from "./components/BeitraegeTab";
import { FinanzenTab } from "./components/FinanzenTab";
import { KassenKopf } from "./components/KassenKopf";
import { EventComposer } from "./components/EventComposer";
import { AktionSheet } from "./components/AktionSheet";
import { ElternProvider, useEltern } from "./eltern-store";
import { ElternApp } from "./components/ElternApp";
import { Icon, type IconName } from "./components/Icon";

export default function App() {
  return (
    <AuthGate>
      <PasswordGate>
        <RoleProvider>
          <NachRolle />
        </RoleProvider>
      </PasswordGate>
    </AuthGate>
  );
}

/**
 * Eltern bekommen eine eigene, deutlich kleinere App: drei Reiter, keine
 * Chats, keine Events, keine Personenliste. Deshalb wird hier verzweigt,
 * bevor die grossen Datenspeicher ueberhaupt starten.
 */
function NachRolle() {
  const { ready, isEltern } = useRole();

  if (!ready)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
      </div>
    );

  if (isEltern)
    return (
      <ProfilesProvider>
        <ElternProvider>
          <ElternApp />
        </ElternProvider>
      </ProfilesProvider>
    );

  return (
    <ProfilesProvider>
      <EventsProvider>
        <TermineProvider>
          <TopicsProvider>
            <ElternProvider>
              <Main />
            </ElternProvider>
          </TopicsProvider>
        </TermineProvider>
      </EventsProvider>
    </ProfilesProvider>
  );
}

type Tab = "kasse" | "events" | "themen" | "beitraege" | "finanzen" | "rollen" | "rechte";

/** "#events" -> Events, "#chats" -> Chats. Danach wird die Marke entfernt,
 *  damit ein Neuladen nicht wieder dorthin springt. */
function tabAusAdresse(): Tab | null {
  const h = window.location.hash.replace("#", "");
  const t: Tab | null = h === "events" ? "events" : h === "chats" ? "themen" : h === "kasse" ? "kasse" : null;
  if (t) history.replaceState(null, "", window.location.pathname + window.location.search);
  return t;
}

/** Wie viele Personenzeilen auf einmal dazukommen. */
const SCHRITT_LISTE = 40;

/** Was oben im Kopf steht – je Reiter eine kurze Überschrift. */
const REITER_TITEL: Record<Tab, string> = {
  kasse: "Stufenkasse",
  events: "Events",
  themen: "Chats",
  beitraege: "Beiträge & Abiball",
  finanzen: "Finanzen",
  rollen: "Rollen & Rechte",
  rechte: "Berechtigungen",
};

function Main() {
  const { students, punkte, settings, ready, mode, reload, setTerm, setSettings, exportData, importData } = useStore();
  const { can, canEditData, canEditBeitrag, canManageRoles, isStaff, ready: roleReady, role, loginByStudent, userByStudent, studentId, tourResetAt } = useRole();
  const { events: allEvents, reads } = useEvents();
  const { topics, unreadCount } = useTopics();
  // Kennung fürs eigene Namensbild aus dem Profil-Speicher – im Themen-Speicher
  // liegt sie in einer Referenz und ist beim ersten Zeichnen noch leer.
  const { uid } = useProfiles();
  const { theme, toggle } = useTheme();

  const showTopicsTab = true;
  const topicsUnreadChats = topics.reduce((s, t) => s + unreadCount(t.id), 0);

  // Abo beim Öffnen still auffrischen (fragt nie selbst nach Erlaubnis).
  usePushAuffrischen();

  // Main läuft erst hinter Zustimmungs- und Passwort-Gate. Vorher liefert die
  // Datenbank wegen RLS (has_consented) nichts – deshalb hier einmal nachladen.
  useEffect(() => {
    if (roleReady) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleReady, role]);

  // Einführung beim ersten Start, je Rolle einmal. Setzt das Stufenteam die
  // Einführung zurück, wird sie beim nächsten Öffnen wieder gezeigt.
  useEffect(() => {
    if (!roleReady || !ready) return;
    const key = `sv:tour:v2:${isStaff ? "team" : "schueler"}`;
    const gesehen = localStorage.getItem(key);
    const wiederZeigen = tourResetAt && (!gesehen || gesehen === "1" || gesehen < tourResetAt);
    if (gesehen && !wiederZeigen) return;
    const t = setTimeout(() => setShowTour(true), 700);
    return () => clearTimeout(t);
  }, [roleReady, ready, isStaff, tourResetAt]);

  // Rote Zahlen auf den Reitern: alles, was dort auf einen wartet.
  const { neueTermine, anfragen } = useTermine();
  const { ungelesen: elternUngelesen } = useEltern();
  const offeneAnfragen = isStaff || can("termine.manage") ? anfragen.filter((a) => a.status === "offen").length : 0;
  const unread = allEvents.filter((e) => !reads.has(e.id)).length + neueTermine.size + offeneAnfragen;
  // Beim Team zählen offene Elterngespräche mit zu den Chats.
  const topicsUnread = topicsUnreadChats + (isStaff ? elternUngelesen : 0);
  // Roter Zähler am App-Symbol: ungelesene Chats und Events zusammen.
  useEffect(() => appZaehler(topicsUnread + unread), [topicsUnread, unread]);
  // Ein Tippen auf eine Benachrichtigung öffnet die App mit #events oder
  // #chats – dann direkt dort landen statt auf der Kasse.
  const [tab, setTab] = useState<Tab>(() => tabAusAdresse() || "kasse");
  useEffect(() => {
    const neu = () => {
      const t = tabAusAdresse();
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", neu);
    return () => window.removeEventListener("hashchange", neu);
  }, []);
  const [showComposer, setShowComposer] = useState(false);
  const [showAktion, setShowAktion] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const [massMode, setMassMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTour, setShowTour] = useState(false);
  // Listen-, Such- und Filterwerkzeug nur für Leute, die wirklich alle Personen verwalten.
  const teamView = isStaff;

  // Das Feld reagiert sofort, die Liste zieht kurz danach nach.
  const suche = useVerzoegert(query, 120);

  const studentsRef = useRef(students);
  studentsRef.current = students;

  // Wie viele Zeilen gerade im Dokument haengen. Beim Filtern faengt es
  // wieder von vorn an, sonst waeren nach einer langen Sitzung doch alle da.
  const [sichtbar, setSichtbar] = useState(SCHRITT_LISTE);
  const nachschub = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSichtbar(SCHRITT_LISTE);
  }, [suche, min, max, onlyOpen, tab]);


  const filtered = useMemo(() => {
    const q = normalize(suche);
    const mn = min === "" ? null : Number(min);
    const mx = max === "" ? null : Number(max);
    return sortStudents(students).filter((st) => {
      if (q) {
        const a = normalize(`${st.nachname} ${st.vorname}`);
        const b = normalize(`${st.vorname} ${st.nachname}`);
        if (!a.includes(q) && !b.includes(q)) return false;
      }
      const p = punkte[st.id] || 0;
      if (mn !== null && p < mn) return false;
      if (mx !== null && p > mx) return false;
      if (onlyOpen && offenGesamt(st, settings, p) === 0) return false;
      return true;
    });
  }, [students, suche, min, max, onlyOpen, settings, punkte]);

  // Diese drei Funktionen werden einmal erzeugt und nicht bei jedem Zeichnen
  // neu. Sonst haelt React jede Zeile fuer veraendert und baut sie neu auf.
  const oeffnePerson = useCallback((id: string) => setOpenId(id), []);
  const waehleAus = useCallback((id: string) => toggleSelect(id), []);
  const schalteHalbjahr = useCallback(
    (id: string, h: Halbjahr) => {
      const st = studentsRef.current.find((x) => x.id === id);
      if (st) setTerm(id, h, nextStatus(st.terms[h].status) as Status);
    },
    [setTerm],
  );

  useEffect(() => {
    const ziel = nachschub.current;
    if (!ziel) return;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) setSichtbar((v) => v + SCHRITT_LISTE);
      },
      { rootMargin: "600px" },
    );
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, [sichtbar, filtered.length]);

  const openStudent = students.find((s) => s.id === openId) ?? null;
  // Laeuft ueber alle Personen – nicht bei jedem Tastendruck neu.
  const { totalOffen, anzahlOffen } = useMemo(
    () => ({
      totalOffen: offenStufe(students, settings, punkte),
      anzahlOffen: students.filter((s) => offenGesamt(s, settings, punkte[s.id] || 0) > 0).length,
    }),
    [students, settings, punkte],
  );
  // Eigene Zeile gezielt über die verknüpfte Personen-Kennung suchen. Für das
  // Stufenteam wären das sonst alle 130 Personen – und "die erste" wäre fremd.
  const meinEintrag = studentId
    ? students.find((s) => s.id === studentId) ?? null
    : students.length === 1
      ? students[0]
      : null;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function onImport() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) f.text().then((t) => alert(importData(t) ? "Import erfolgreich." : "Ungültige Datei."));
    };
    inp.click();
  }

  /**
   * Passwort ändern läuft über das Profil, nicht über prompt().
   * Installierte Apps blockieren prompt(), dann passierte hier gar nichts.
   */
  function changePassword() {
    setShowSettings(true);
  }

  const numField =
    "w-16 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800";

  const navItems: { key: Tab; icon: IconName; label: string; badge?: number; show: boolean }[] = [
    { key: "kasse", icon: "kasse", label: "Kasse", show: true },
    { key: "events", icon: "events", label: "Events", badge: unread, show: true },
    { key: "themen", icon: "chats", label: "Chats", badge: topicsUnread, show: showTopicsTab },
    { key: "beitraege", icon: "beitraege", label: "Beiträge", show: can("beitraege.manage") },
    { key: "finanzen", icon: "finanzen", label: "Finanzen", show: can("finanzen.view") || can("finanzen.manage") },
    { key: "rollen", icon: "rollen", label: "Rollen", show: canManageRoles },
    { key: "rechte", icon: "rechte", label: "Rechte", show: can("perms.manage") },
  ];

  return (
    <div className="mx-auto max-w-5xl px-3 pb-36 sm:px-5 lg:pb-12">
      <header className="sticky top-0 z-20 -mx-3 border-b border-papier-linie bg-papier/90 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:-mx-5 sm:px-5">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          {/* Ein Titel, der zum Reiter passt – genau wie in der Elternansicht. */}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-zahl text-[1.25rem] font-extrabold tracking-[-0.02em]">{REITER_TITEL[tab]}</div>
            <div className="truncate text-[11px] text-tinte-leise">
              {isStaff ? "Stufenteam" : "Mein Zugang"} · Abi 28
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {tab === "kasse" && (
              <>
                {teamView && (
                  <button
                    data-tour="einstellungen"
                    className={`iconbtn ${showFilter ? "iconbtn-active" : ""}`}
                    onClick={() => setShowFilter((v) => !v)}
                    aria-label="Filter & Einstellungen"
                  >
                    ⚙︎
                  </button>
                )}
                {teamView && canEditData && (
                  <button
                    data-tour="massen"
                    className={`iconbtn ${massMode ? "iconbtn-active" : ""}`}
                    onClick={() => {
                      setMassMode((v) => !v);
                      setSelected(new Set());
                    }}
                    aria-label="Mehrere auswählen"
                  >
                    ☑
                  </button>
                )}
              </>
            )}
            <button className="iconbtn" onClick={toggle} aria-label="Hell/Dunkel">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              data-tour="profil"
              onClick={() => setShowSettings(true)}
              className="rounded-full transition active:scale-95"
              aria-label="Mein Profil"
            >
              <Avatar userId={uid} size={40} />
            </button>
          </div>
        </div>

        {/* Am Rechner steht die Navigation oben – eine Leiste unten am Bildschirmrand
            gibt es so auf keinem Dashboard. Auf dem Handy bleibt sie unten. */}
        <div className="mx-auto mt-2.5 hidden max-w-5xl items-center gap-1 lg:flex">
          {navItems.filter((n) => n.show).map((n) => (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                tab === n.key
                  ? "bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-brand-soft"
                  : "text-tinte-matt hover:bg-papier-matt dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon name={n.icon} size={17} />
              {n.label}
              {(n.badge ?? 0) > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {n.badge! > 9 ? "9+" : n.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Suche, Kennzahlen und Halbjahr laufen mit – nur die Titelzeile bleibt
          oben kleben. Sonst verdeckt der Kopf auf dem Handy die halbe Liste. */}
      <div>
        {tab === "kasse" && teamView && (
          <div className="mx-auto mt-2.5 flex max-w-5xl items-center gap-2 rounded-xl border border-papier-linie bg-white px-3.5 py-2.5 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-cardDark">
            <span className="text-tinte-leise">🔍</span>
            <input
              className="w-full bg-transparent text-base outline-none placeholder:text-tinte-leise"
              placeholder="Name suchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {/* Erst die Lage der Kasse, dann die Liste – nicht umgekehrt. */}
        {tab === "kasse" && teamView && <KassenKopf students={students} settings={settings} punkte={punkte} />}

        {tab === "kasse" && teamView && canEditData && (
          <div className="mx-auto mt-2.5 max-w-5xl">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tinte-leise">
                Laufendes Halbjahr
              </span>
              <div className="flex min-w-0 flex-1 gap-1">
                {HY.map((h) => (
                  <button
                    key={h}
                    onClick={() => setSettings({ aktuelles_halbjahr: h })}
                    className={`min-w-0 flex-1 rounded-lg border px-1 py-1.5 text-[11px] font-bold transition ${
                      h === settings.aktuelles_halbjahr
                        ? "border-brand bg-brand text-white"
                        : "border-papier-linie bg-white text-tinte-matt dark:border-slate-700 dark:bg-slate-900"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "kasse" && teamView && showFilter && (
          <div className="mx-auto mt-3 max-w-5xl">
            <div className="card grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinte-matt">
                Prozent
                <div className="flex items-center gap-1.5 text-tinte dark:text-slate-200">
                  <input type="number" className={numField} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} />
                  <span className="text-tinte-leise">–</span>
                  <input type="number" className={numField} placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} />
                </div>
              </label>

              <div className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinte-matt">
                Anzeige
                <button
                  onClick={() => setOnlyOpen((v) => !v)}
                  className={`rounded-lg border px-3 py-2 text-[13px] font-bold normal-case transition ${
                    onlyOpen ? "border-brand bg-brand text-white" : "border-papier-linie bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  {onlyOpen ? "✓ nur offene" : "nur offene"}
                </button>
              </div>

              {can("beitraege.manage") && (
                <div className="col-span-2 flex items-center gap-2 text-[12px] text-tinte-leise sm:col-span-4">
                  🎟️ Abiball-Staffel und Prozent-Möglichkeiten stehen jetzt im Reiter{" "}
                  <button onClick={() => setTab("beitraege")} className="font-bold text-brand underline">
                    Beiträge
                  </button>
                </div>
              )}

              <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-papier-linie pt-3 dark:border-slate-700 sm:col-span-4">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinte-matt">Daten</span>
                {canEditData && (
                  <>
                    <button onClick={exportData} className="rounded-lg border border-papier-linie px-3 py-1.5 text-sm font-semibold dark:border-slate-700">
                      Export
                    </button>
                    <button onClick={onImport} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                      Import
                    </button>
                  </>
                )}
                <button onClick={() => setShowTour(true)} className="rounded-lg border border-papier-linie px-3 py-1.5 text-sm font-semibold text-tinte-matt dark:border-slate-700">
                  Einführung
                </button>
                {hasSupabase && (
                  <>
                    <button onClick={changePassword} className="ml-auto rounded-lg border border-papier-linie px-3 py-1.5 text-sm font-semibold dark:border-slate-700">
                      Passwort ändern
                    </button>
                    <button onClick={() => void abmelden()} className="rounded-lg border border-papier-linie px-3 py-1.5 text-sm font-semibold text-tinte-matt dark:border-slate-700">
                      Logout
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <PushHinweis />
      </div>

      {tab === "rollen" ? (
        <main className="mt-3">
          <RolesTab />
        </main>
      ) : tab === "rechte" ? (
        <main className="mt-3 pb-4">
          <PermissionsTab />
        </main>
      ) : tab === "events" ? (
        <main className="mt-3">
          <EventsTab />
        </main>
      ) : tab === "themen" ? (
        <main className="mt-3 pb-4">
          <ChatsTab />
        </main>
      ) : tab === "finanzen" ? (
        <main className="mt-3 pb-4">
          <FinanzenTab />
        </main>
      ) : tab === "beitraege" ? (
        <main className="mt-3 pb-4">
          <BeitraegeTab />
        </main>
      ) : !teamView ? (
        <main className="mt-3">
          <MyKasse
            student={meinEintrag}
            settings={settings}
            punkte={punkte[meinEintrag?.id ?? ""] || 0}
            ready={ready && roleReady}
          />
          {mode === "local" && ready && (
            <p className="pt-3 text-center text-[11px] text-tinte-leise">Testbetrieb. Die Daten liegen nur auf diesem Gerät.</p>
          )}
        </main>
      ) : (
        <main className="card mt-3 divide-y divide-papier-linie overflow-hidden dark:divide-slate-800" data-tour="liste">
          {!ready && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
              <div className="text-sm font-medium">Beitragsliste wird geladen …</div>
            </div>
          )}
          {ready && filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-tinte-leise">
              Keine Treffer.{" "}
              <button
                className="font-semibold text-brand"
                onClick={() => {
                  setQuery("");
                  setMin("");
                  setMax("");
                  setOnlyOpen(false);
                }}
              >
                Filter zurücksetzen
              </button>
            </div>
          )}
          {ready && (
            <div className="flex flex-wrap items-center gap-2 border-b border-papier-linie px-3.5 py-2.5 dark:border-slate-800 sm:px-4">
              <button
                onClick={() => setOnlyOpen(false)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
                  !onlyOpen
                    ? "border-brand bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-brand-soft"
                    : "border-papier-linie text-tinte-matt dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setOnlyOpen(true)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
                  onlyOpen
                    ? "border-brand bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-brand-soft"
                    : "border-papier-linie text-tinte-matt dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                Nur offene
              </button>
              <span className="zahl ml-auto text-[12px] text-tinte-leise">
                {filtered.length} von {students.length}
              </span>
            </div>
          )}

          {ready && filtered.length > 0 && (
            <div className="hidden items-center gap-x-3 bg-papier-matt px-4 py-2 dark:bg-slate-800/50 sm:flex">
              <span className="flex-1 basis-[13rem] text-[10px] font-bold uppercase tracking-[0.05em] text-tinte-leise">
                Person
              </span>
              <span className="w-16 text-right text-[10px] font-bold uppercase tracking-[0.05em] text-tinte-leise">
                Offen
              </span>
              <span className="max-w-[13rem] flex-1 text-[10px] font-bold uppercase tracking-[0.05em] text-tinte-leise">
                Halbjahre
              </span>
              <span className="w-[5.4rem] text-right text-[10px] font-bold uppercase tracking-[0.05em] text-tinte-leise">
                Mithilfe
              </span>
            </div>
          )}
          {filtered.slice(0, sichtbar).map((st, idx) => (
            <StudentCard
              key={st.id}
              anchor={idx === 0 ? "person" : undefined}
              student={st}
              settings={settings}
              punkte={punkte[st.id] || 0}
              selectable={massMode}
              selected={selected.has(st.id)}
              canToggleBeitrag={canEditBeitrag}
              loginState={isStaff ? (loginByStudent[st.id] ?? false) : null}
              userId={userByStudent[st.id] ?? null}
              onOpen={oeffnePerson}
              onToggleSelect={waehleAus}
              onToggleTerm={schalteHalbjahr}
            />
          ))}
          {/* Nachschubmarke: sobald sie in Sicht kommt, kommen weitere Zeilen.
              So haengen nie 300 Zeilen gleichzeitig im Dokument. */}
          {filtered.length > sichtbar && (
            <div ref={nachschub} className="py-6 text-center text-[12px] text-tinte-leise">
              lädt weitere {Math.min(SCHRITT_LISTE, filtered.length - sichtbar)} von{" "}
              {filtered.length - sichtbar} …
            </div>
          )}
          {mode === "local" && ready && (
            <p className="col-span-full pt-2 text-center text-[11px] text-tinte-leise">
              Testbetrieb. Die Daten liegen nur auf diesem Gerät.
            </p>
          )}
        </main>
      )}

      {tab === "kasse" && teamView && canEditData && !massMode && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Person hinzufügen"
        >
          ＋
        </button>
      )}

      {tab === "events" && canEditData && (
        <button
          onClick={() => setShowComposer(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Event erstellen"
        >
          ＋
        </button>
      )}

      {massMode && (
        <MassBar
          selected={selected}
          onDone={() => {
            setMassMode(false);
            setSelected(new Set());
          }}
        />
      )}

      {/* Feste Tab-Bar unten */}
      {!massMode && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-papier-linie bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
          <div className="mx-auto flex max-w-5xl items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
            {navItems.filter((n) => n.show).map((n) => (
              <button
                key={n.key}
                data-tour={`tab-${n.key}`}
                onClick={() => setTab(n.key)}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
                  tab === n.key ? "text-brand" : "text-tinte-leise"
                }`}
                aria-label={n.label}
              >
                <span className="relative flex h-[22px] items-center leading-none">
                  <Icon name={n.icon} size={21} />
                  {(n.badge ?? 0) > 0 && (
                    <span className="absolute -right-3 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {n.badge! > 9 ? "9+" : n.badge}
                    </span>
                  )}
                </span>
                {n.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <StudentSheet student={openStudent} punkte={punkte[openStudent?.id ?? ""] || 0} onClose={() => setOpenId(null)} />
      <AddSheet open={showAdd} onClose={() => setShowAdd(false)} />
      <EventComposer
        open={showComposer}
        onClose={() => setShowComposer(false)}
        onVorlagen={() => {
          setShowComposer(false);
          setShowAktion(true);
        }}
      />
      <AktionSheet offen={showAktion} onSchliessen={() => setShowAktion(false)} />
      <ProfilSheet
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onTutorial={() => {
          setShowSettings(false);
          setShowTour(true);
        }}
      />
      <Tour
        open={showTour}
        steps={tourSteps({ staff: isStaff, staffel: staffelVon(settings) })}
        onClose={() => {
          setShowTour(false);
          // Zeitpunkt merken, damit ein späteres Zurücksetzen erkannt wird
          localStorage.setItem(`sv:tour:v2:${isStaff ? "team" : "schueler"}`, new Date().toISOString());
        }}
      />
    </div>
  );
}
