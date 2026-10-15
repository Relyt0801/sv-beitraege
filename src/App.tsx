import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SkelettKarten, SkelettZeilen } from "./components/Skelett";
import { HY, type Halbjahr, type Status } from "./lib/types";
import { normalize, offenGesamt, offenStufe, sortStudents, staffelVon } from "./lib/logic";
import { neuLadenBeobachten } from "./lib/neuladen";
import { MyKasse } from "./components/MyKasse";
import { Avatar } from "./components/Avatar";
import { Tour, schuelerSchritte, teamSchritte, useTourOffen } from "./components/Tour";
import { useTheme } from "./lib/theme";
import { useVerzoegert } from "./lib/entwurf";
import { hasSupabase, supabase } from "./lib/supabase";
import { abmelden, appZaehler } from "./lib/push";
import { PushHinweis, usePushAuffrischen } from "./components/PushHinweis";
import { useStore } from "./store";
import { AuthGate, Splash } from "./auth/AuthGate";
import { PasswordGate } from "./auth/PasswordGate";
import { RoleProvider, useRole } from "./auth/RoleProvider";
import { ProfilesProvider, useProfiles } from "./profiles-store";
import { EventsProvider, useEvents } from "./events-store";
import { TermineProvider, useTermine } from "./termine-store";
import { TopicsProvider } from "./topics-store";
import { StudentCard, nextStatus } from "./components/StudentCard";
import { useKostenAnfragen } from "./lib/kosten";
import { SPRUNG_TAB, sprungAusHash } from "./lib/sprung";
import { MeldenWurzel } from "./components/Melden";
import { KassenKopf } from "./components/KassenKopf";
import { SchichtAbschluss } from "./components/SchichtAbschluss";
import { useChatZaehler } from "./lib/chat-zaehler";
import { PatchNotes } from "./components/PatchNotes";
import { PATCH, PATCH_MERKER } from "./lib/patchnotes";
import { ElternProvider, useEltern } from "./eltern-store";
import { Icon, type IconName } from "./components/Icon";
import { HintergrundEbene } from "./components/HintergrundEbene";
import { InstallKarte, InstallOverlay } from "./components/InstallHinweis";
import { useGescrollt, useHoeheAlsVariable, useReiter } from "./lib/gescrollt";
import { GlasLeiste } from "./components/GlasLeiste";
import { Schalter } from "./components/Schalter";
import { AlbumProvider } from "./components/Album";
import { FunktionenProvider } from "./lib/funktionen";
import { FaulGrenze, allesVorladen, faul } from "./components/FaulLaden";

import { frage, melde, meldeFehler } from "./lib/melder";

/*
 * Große, seltene Teile werden erst geladen, wenn man sie braucht (Update 1.4, U3
 * – Leistung; Hilfen und Begründung in components/FaulLaden.tsx). Nach dem Start
 * holt Main sie im Leerlauf nach (allesVorladen), damit der erste Tipp nicht aufs
 * Netz wartet. Die Dateien selbst sind unverändert: `.then(m => ({ default: m.X }))`
 * macht den benannten Export zum Standard-Export für React.lazy.
 */
const ElternApp = faul(() => import("./components/ElternApp").then((m) => ({ default: m.ElternApp })));
const EventsTab = faul(() => import("./components/EventsTab").then((m) => ({ default: m.EventsTab })));
const ChatsTab = faul(() => import("./components/ChatsTab").then((m) => ({ default: m.ChatsTab })));
const FinanzenTab = faul(() => import("./components/FinanzenTab").then((m) => ({ default: m.FinanzenTab })));
const BeitraegeTab = faul(() => import("./components/BeitraegeTab").then((m) => ({ default: m.BeitraegeTab })));
const RollenRechteTab = faul(() => import("./components/RollenRechteTab").then((m) => ({ default: m.RollenRechteTab })));
const ProfilSheet = faul(() => import("./components/ProfilSheet").then((m) => ({ default: m.ProfilSheet })));
const StudentSheet = faul(() => import("./components/StudentSheet").then((m) => ({ default: m.StudentSheet })));
const AddSheet = faul(() => import("./components/AddSheet").then((m) => ({ default: m.AddSheet })));
const MassBar = faul(() => import("./components/MassBar").then((m) => ({ default: m.MassBar })));
const EventComposer = faul(() => import("./components/EventComposer").then((m) => ({ default: m.EventComposer })));
const AktionSheet = faul(() => import("./components/AktionSheet").then((m) => ({ default: m.AktionSheet })));
const NachtragSheet = faul(() => import("./components/NachtragSheet").then((m) => ({ default: m.NachtragSheet })));
const UmfragenSheet = faul(() => import("./components/Umfragen").then((m) => ({ default: m.UmfragenSheet })));
const UmfragePopup = faul(() => import("./components/Umfragen").then((m) => ({ default: m.UmfragePopup })));
const MottoEnthuellung = faul(() => import("./components/MottoEnthuellung").then((m) => ({ default: m.MottoEnthuellung })));

/**
 * Hängt ein Blatt erst beim ersten Öffnen ein (und lädt damit seine Datei) –
 * danach bleibt es eingehängt, damit es seinen Zustand behält. Nicht
 * geladen werden kann es nur offline/mit altem Stand: dann kommt eine Meldung.
 */
function ErstBeiBedarf({ offen, children }: { offen: boolean; children: ReactNode }) {
  const [warOffen, setWarOffen] = useState(offen);
  if (offen && !warOffen) setWarOffen(true);
  return warOffen ? <FaulGrenze still>{children}</FaulGrenze> : null;
}

export default function App() {
  return (
    <AuthGate>
      <PasswordGate>
        <RoleProvider>
          <FunktionenProvider>
            <NachRolle />
          </FunktionenProvider>
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

  // Dasselbe Ladebild wie beim Anmelden (Symbol, ruhig) statt eines zweiten Kringels
  if (!ready) return <Splash />;

  if (isEltern)
    return (
      <ProfilesProvider>
        <ElternProvider>
          <HintergrundEbene />
          <FaulGrenze fallback={<Splash />}>
            <ElternApp />
          </FaulGrenze>
          <InstallOverlay />
          <FaulGrenze still>
            <UmfragePopup bereitZumZeigen />
          </FaulGrenze>
        </ElternProvider>
      </ProfilesProvider>
    );

  return (
    <ProfilesProvider>
      <EventsProvider>
        <TermineProvider>
          <TopicsProvider>
            <ElternProvider>
              <AlbumProvider>
                <HintergrundEbene />
                <Main />
                <MeldenWurzel />
              </AlbumProvider>
            </ElternProvider>
          </TopicsProvider>
        </TermineProvider>
      </EventsProvider>
    </ProfilesProvider>
  );
}

type Tab = "profil" | "kasse" | "events" | "themen" | "beitraege" | "finanzen" | "rollen";

/** "#events" -> Events, "#chats" -> Chats. Danach wird die Marke entfernt,
 *  damit ein Neuladen nicht wieder dorthin springt. */
function tabAusAdresse(entfernen = true): Tab | null {
  // Anfrage aus einer Benachrichtigung: Reiter öffnen, die Marke räumt die
  // Anfrage-Komponente selbst weg, wenn sie hingesprungen ist (lib/sprung.ts)
  const sprung = sprungAusHash(window.location.hash);
  if (sprung) return SPRUNG_TAB[sprung];
  const h = window.location.hash.replace("#", "");
  // Ein bestimmter Chat (#chat-<id>): Reiter Chats, den Chat öffnet ChatsTab
  if (h.startsWith("chat-")) return "themen";
  const t: Tab | null =
    h === "events" ? "events" : h === "chats" ? "themen" : h === "kasse" ? "kasse" : h === "finanzen" ? "finanzen" : h === "profil" ? "profil" : null;
  if (t && entfernen) history.replaceState(null, "", window.location.pathname + window.location.search);
  return t;
}

const NACHTRAG_HINWEIS = "sv:hinweis:nachtragen";

/** Wie viele Personenzeilen auf einmal dazukommen. */
const SCHRITT_LISTE = 40;

/** Was oben im Kopf steht – je Reiter eine kurze Überschrift. */
const REITER_TITEL: Record<Tab, string> = {
  profil: "Mein Profil",
  kasse: "Stufenkasse",
  events: "Events",
  themen: "Chats",
  beitraege: "Beiträge & Abiball",
  finanzen: "Finanzen",
  rollen: "Rollen & Rechte",
};

function Main() {
  const { students, punkte, settings, ready, mode, reload, setTerm, setSettings, exportData, importData } = useStore();
  const { can, canEditData, canEditHilfen, canEditBeitrag, canManageRoles, isStaff, ready: roleReady, role, loginByStudent, userByStudent, studentId, tourResetAt } = useRole();
  const { events: allEvents, reads } = useEvents();
  // Kennung fürs eigene Namensbild aus dem Profil-Speicher – im Themen-Speicher
  // liegt sie in einer Referenz und ist beim ersten Zeichnen noch leer.
  const { uid } = useProfiles();
  const { theme, toggle } = useTheme();

  const showTopicsTab = true;
  // Nur was zählt: offene Gespräche, eigene (bzw. eingeschaltete) Komitee-
  // Chats, Stufenteam-Chat. Erledigtes und alte Ordner nicht mehr (vorher
  // stand dauerhaft „9+“).
  const topicsUnreadChats = useChatZaehler();

  // Abo beim Öffnen still auffrischen (fragt nie selbst nach Erlaubnis).
  usePushAuffrischen();

  // „Update bei allen erzwingen“ (Profil, Admin): offene Apps laden neu
  useEffect(() => neuLadenBeobachten(), []);

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
    // v3: neue Einführung mit Reiterwechsel – alle sehen sie einmal neu.
    const key = `sv:tour:v3:${isStaff ? "team" : "schueler"}`;
    const gesehen = localStorage.getItem(key);
    const wiederZeigen = tourResetAt && (!gesehen || gesehen === "1" || gesehen < tourResetAt);
    if (gesehen && !wiederZeigen) return;
    const t = setTimeout(() => setShowTour(true), 700);
    return () => clearTimeout(t);
  }, [roleReady, ready, isStaff, tourResetAt]);

  // Rote Zahlen auf den Reitern: alles, was dort auf einen wartet.
  const { neueTermine, anfragen, meineVorsitze } = useTermine();
  const { ungelesen: elternUngelesen } = useEltern();
  const offeneAnfragen = isStaff || can("termine.manage") ? anfragen.filter((a) => a.status === "offen").length : 0;
  const unread = allEvents.filter((e) => !reads.has(e.id)).length + neueTermine.size + offeneAnfragen;
  // Beim Team zählen offene Elterngespräche mit zu den Chats.
  const topicsUnread = topicsUnreadChats + (isStaff ? elternUngelesen : 0);
  // Finanzen: Kassenwart/Admin, freigeschaltete Leser, Aufsichtsrat – und
  // Komitee-Vorsitzende für ihre Kostenanfragen.
  const kosten = useKostenAnfragen(roleReady);
  const showFinanzen =
    can("finanzen.basis") || can("finanzen.view") || can("finanzen.manage") || kosten.aufsichtsrat || meineVorsitze.length > 0;
  const offeneKosten = can("finanzen.manage") ? kosten.anfragen.filter((a) => a.status === "offen").length : 0;
  // Roter Zähler am App-Symbol: ungelesene Chats und Events zusammen.
  useEffect(() => appZaehler(topicsUnread + unread), [topicsUnread, unread]);
  // Ein Tippen auf eine Benachrichtigung öffnet die App mit #events oder
  // #chats – dann direkt dort landen statt auf der Kasse.
  // Nur lesen – React ruft den Startwert im Entwicklungsmodus zweimal auf.
  // useReiter springt vor dem Wechsel nach oben – sonst federt auf iOS die
  // Tab-Leiste, wenn der neue Reiter kürzer ist als die alte Scrollposition.
  const [tab, setTab] = useReiter<Tab>(() => tabAusAdresse(false) || "kasse");
  // Team mit eigenem Eintrag startet – wie alle Schüler – auf der eigenen
  // Ansicht (Reiter Profil). Nur beim Öffnen, nicht bei jedem Rollenwechsel.
  const hatProfilReiter = isStaff && Boolean(studentId);
  const startGewaehlt = useRef(Boolean(tabAusAdresse(false)));
  useEffect(() => {
    if (!roleReady || startGewaehlt.current) return;
    startGewaehlt.current = true;
    // Kommt man aus einer Anfrage-Benachrichtigung, bleibt deren Reiter
    const sprung = sprungAusHash(window.location.hash);
    if (sprung) setTab(SPRUNG_TAB[sprung]);
    else if (hatProfilReiter) setTab("profil");
  }, [roleReady, hatProfilReiter, setTab]);
  useEffect(() => {
    // Start aus einer Anfrage-Benachrichtigung: gleich in den richtigen Reiter
    const sprung = sprungAusHash(window.location.hash);
    if (sprung) setTab(SPRUNG_TAB[sprung]);
    else tabAusAdresse(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // „Neues Zitat zum Prüfen“ (./#zitate): zur eigenen Ansicht mit den Karten.
  // Die Marke entfernt die Zitat-Karte selbst, wenn sie das Blatt öffnet.
  useEffect(() => {
    const zuZitaten = () => {
      if (window.location.hash === "#zitate") setTab(hatProfilReiter ? "profil" : "kasse");
    };
    zuZitaten();
    window.addEventListener("hashchange", zuZitaten);
    return () => window.removeEventListener("hashchange", zuZitaten);
  }, [hatProfilReiter, setTab]);
  useEffect(() => {
    const neu = () => {
      const t = tabAusAdresse();
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", neu);
    return () => window.removeEventListener("hashchange", neu);
  }, [setTab]);
  const [showComposer, setShowComposer] = useState(false);
  const [showAktion, setShowAktion] = useState(false);
  const [showUmfragen, setShowUmfragen] = useState(false);
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
  // Mithilfe nachtragen: Knopf oben neben dem Profil, einmal mit Hinweis
  const [nachtragOffen, setNachtragOffen] = useState(false);
  const [nachtragHinweis, setNachtragHinweis] = useState(false);
  const [umfrageSichtbar, setUmfrageSichtbar] = useState(false);
  // Patch Notes: einmal je Version, nicht während der Einführung
  const [showPatch, setShowPatch] = useState(false);
  // Patch Notes nach dem Öffnen – wenn diese Version noch nicht gesehen wurde.
  // Neue Zugänge sehen zuerst die Einführung; die setzt den Merker mit.
  useEffect(() => {
    if (!roleReady || !ready || showTour) return;
    let gesehen: string | null = null;
    try {
      gesehen = localStorage.getItem(PATCH_MERKER);
    } catch {
      return;
    }
    // Versionen als Zahl vergleichen (1.10 > 1.9 gilt hier nicht – reicht für 1.1, 1.2 …)
    if (gesehen && Number(gesehen) >= Number(PATCH.version)) return;
    const t = setTimeout(() => setShowPatch(true), 1200);
    return () => clearTimeout(t);
  }, [roleReady, ready, showTour]);

  // Ist irgendwo ein Blatt offen? Dann darf der „Neu“-Hinweis nicht darüber erscheinen.
  const blattOffen = showSettings || openId !== null || showAdd || showComposer || showAktion || showUmfragen || nachtragOffen || massMode;
  const tourOffen = useTourOffen();

  // Einmaliger Hinweis auf den Nachtragen-Knopf – erst, wenn nichts anderes offen
  // ist: weder Einführung noch Patch-Notes noch ein Blatt oder anderes Fenster
  // (Install-Hinweis, Enthüllung, Rückfrage …). Ist doch etwas offen, wird alle
  // 2 s neu nachgesehen, statt über dem Fenster aufzutauchen (Update 1.4, U3).
  useEffect(() => {
    if (!roleReady || !ready || !studentId || showTour || showPatch || umfrageSichtbar || blattOffen || tourOffen) return;
    try {
      if (localStorage.getItem(NACHTRAG_HINWEIS)) return;
    } catch {
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const pruefen = () => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        t = setTimeout(pruefen, 2000);
        return;
      }
      setNachtragHinweis(true);
    };
    t = setTimeout(pruefen, 1600);
    return () => clearTimeout(t);
  }, [roleReady, ready, studentId, showTour, showPatch, umfrageSichtbar, blattOffen, tourOffen]);
  // Öffnet jemand trotzdem ein Blatt, räumt der Hinweis das Feld (kommt später wieder)
  useEffect(() => {
    if (nachtragHinweis && blattOffen) setNachtragHinweis(false);
  }, [nachtragHinweis, blattOffen]);

  // Nach dem Start im Leerlauf die seltenen Teile vorladen (FaulLaden.tsx)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(allesVorladen, 2500);
    return () => clearTimeout(t);
  }, [ready]);

  // Der Auswahl-Modus gehört zur Kasse: wer den Reiter wechselt, beendet ihn
  useEffect(() => {
    if (tab !== "kasse") {
      setMassMode(false);
      setShowFilter(false);
    }
  }, [tab]);

  const gescrollt = useGescrollt(4);
  // Kopf und Tab-Leiste messen: danach richten sich Chat-Eingabe,
  // Komitee-Leiste und die Zwischenüberschriften (siehe index.css).
  const kopfRef = useHoeheAlsVariable("--kopf");
  const leisteRef = useHoeheAlsVariable("--leiste");
  const titelWeg = useGescrollt(44);
  // Listen-, Such- und Filterwerkzeug nur für Leute, die wirklich alle Personen verwalten.
  const teamView = isStaff;

  // Das Feld reagiert sofort, die Liste zieht kurz danach nach.
  const suche = useVerzoegert(query, 120);

  const studentsRef = useRef(students);
  studentsRef.current = students;

  // Wie viele Zeilen gerade im Dokument haengen. Beim Filtern faengt es
  // wieder von vorn an, sonst waeren nach einer langen Sitzung doch alle da.
  const [sichtbar, setSichtbar] = useState(SCHRITT_LISTE);
  // Marke als Zustand (Callback-Ref): erscheint sie erst später (anderer Reiter
  // war offen, Daten kamen nach), startet der Beobachter trotzdem – sonst stand
  // „lädt weitere …“ für immer da (iPhone, 28.09.).
  const [nachschub, setNachschub] = useState<HTMLElement | null>(null);

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
    const ziel = nachschub;
    if (!ziel) return;
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) setSichtbar((v) => v + SCHRITT_LISTE);
      },
      { rootMargin: "600px" },
    );
    beobachter.observe(ziel);
    return () => beobachter.disconnect();
  }, [nachschub, sichtbar, filtered.length]);

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
      if (f) f.text().then((t) => (importData(t) ? melde("Import erfolgreich.", "erfolg") : meldeFehler("Ungültige Datei.")));
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
    "w-16 rounded-lg bg-[rgb(118_118_128/0.12)] px-2.5 py-2 text-center outline-none focus:ring-2 focus:ring-brand/30 dark:bg-[rgb(118_118_128/0.24)]";
  // Kleine graue Kapselknoepfe in der Filterkarte
  const klein =
    "rounded-full bg-[rgb(118_118_128/0.12)] px-3.5 py-1.5 text-[14px] font-semibold text-brand-dark transition active:scale-95 dark:bg-[rgb(118_118_128/0.24)] dark:text-brand";

  const navItems: { key: Tab; icon: IconName; label: string; badge?: number; show: boolean }[] = [
    // Team mit eigenem Eintrag: die eigene Ansicht wie bei den Schülern
    { key: "profil", icon: "person", label: "Profil", show: hatProfilReiter },
    { key: "kasse", icon: "kasse", label: "Kasse", show: true },
    { key: "events", icon: "events", label: "Events", badge: unread, show: true },
    { key: "themen", icon: "chats", label: "Chats", badge: topicsUnread, show: showTopicsTab },
    { key: "beitraege", icon: "beitraege", label: "Beiträge", show: can("beitraege.manage") },
    { key: "finanzen", icon: "finanzen", label: "Finanzen", badge: offeneKosten, show: showFinanzen },
    { key: "rollen", icon: "rollen", label: "Rollen", show: canManageRoles || can("perms.manage") },
  ];

  // Über eine Adresse wie #finanzen darf niemand in einen Reiter, der für ihn
  // nicht vorgesehen ist – dann zurück zur Kasse.
  const reiterErlaubt = navItems.find((n) => n.key === tab)?.show ?? true;
  useEffect(() => {
    if (roleReady && !reiterErlaubt) setTab("kasse");
  }, [roleReady, reiterErlaubt, setTab]);

  // „Neu“-Knopf je Reiter (Update 1.4, U3): Kasse → Person hinzufügen, Events →
  // Event erstellen. Auf dem Handy schwebt er als beschriftete Kapsel unten
  // rechts (damit die drei „+“ der App unterscheidbar sind: Nachtragen, Termin,
  // Neu); ab iPad-Breite sitzt er stattdessen im Kopf – ein schwebender Knopf
  // am Rechner stand mitten im Leeren und deckte am iPad die letzte Spalte.
  const neuKnopf =
    tab === "kasse" && teamView && canEditData
      ? { text: "Person", label: "Person hinzufügen", los: () => setShowAdd(true) }
      : tab === "events" && isStaff
        ? { text: "Neu", label: "Event erstellen", los: () => setShowComposer(true) }
        : null;
  const anzahlReiter = navItems.filter((n) => n.show).length;

  // Im Auswahl-Modus ist die Leiste unten höher (Namen der Ausgewählten) –
  // sonst verdeckt sie die letzten Personen der Liste. Mit schwebendem Knopf
  // (Handy) bekommt die Seite unten mehr Luft, damit der Knopf nichts verdeckt.
  return (
    <div
      className={`mx-auto max-w-5xl px-3 sm:px-5 ${
        massMode
          ? "pb-72"
          : neuKnopf
            ? "pb-[calc(var(--leiste)+6.5rem)] md:pb-[calc(var(--leiste)+2.5rem)] lg:pb-16"
            : "pb-[calc(var(--leiste)+2.5rem)] lg:pb-16"
      }`}
    >
      {/* Kopf wie eine iOS-Navigationsleiste: oben die Knöpfe, darunter der
          große Titel. Scrollt der Titel weg, erscheint er klein in der nun
          milchigen Leiste (Glas). */}
      <header
        ref={kopfRef}
        className={`sticky top-0 z-20 -mx-3 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] transition-[background-color,box-shadow] duration-300 sm:-mx-5 sm:px-5 ${
          gescrollt ? "kopf-band" : "kopf-grund bg-papier dark:bg-slate-950"
        }`}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          <div
            aria-hidden={!titelWeg}
            className={`min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em] transition duration-300 ease-ios ${
              titelWeg ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            {REITER_TITEL[tab]}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 max-[379px]:gap-1.5">
            {tab === "kasse" && (
              <>
                {teamView && (
                  <button
                    data-tour="einstellungen"
                    className={`iconbtn ${showFilter ? "iconbtn-active" : ""}`}
                    onClick={() => setShowFilter((v) => !v)}
                    aria-label="Filter & Einstellungen"
                    title="Filter & Einstellungen"
                  >
                    <Icon name="regler" size={19} />
                  </button>
                )}
                {teamView && (canEditData || canEditHilfen) && (
                  <button
                    data-tour="massen"
                    className={`iconbtn ${massMode ? "iconbtn-active" : ""}`}
                    onClick={() => {
                      setMassMode((v) => !v);
                      setSelected(new Set());
                    }}
                    aria-label="Mehrere auswählen"
                    title="Mehrere auswählen"
                  >
                    <Icon name="auswahl" size={20} />
                  </button>
                )}
              </>
            )}
            {/* Ab iPad-Breite: „Person“ / „Neu“ im Kopf statt schwebend */}
            {neuKnopf && (
              <button data-tour="neu" onClick={neuKnopf.los} className="btn-klein hidden md:inline-flex" aria-label={neuKnopf.label}>
                <Icon name="plus" size={16} strich={2.6} />
                {neuKnopf.text}
              </button>
            )}
            <button className="iconbtn" onClick={toggle} aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"} title="Hell/Dunkel">
              <Icon name={theme === "dark" ? "sonne" : "mond"} size={19} />
            </button>
            {studentId && (
              <button
                data-tour="nachtragen"
                onClick={() => setNachtragOffen(true)}
                // Beschriftung bleibt auch auf kleinen Handys (nur kompakter): ein
                // unbeschriftetes grünes „+“ neben dem Mond verstand niemand.
                // Dunkleres Grün (#1E7B34): weiße Schrift mit 5,3:1 statt 4,4:1.
                className="flex h-11 items-center gap-1 rounded-full bg-[#1E7B34] px-3.5 text-[14px] font-semibold text-white transition active:scale-90 max-[379px]:px-3 max-[379px]:text-[13px] dark:bg-[#30D158] dark:text-black"
                aria-label="Mithilfe nachtragen"
                title="Mithilfe nachtragen"
              >
                <Icon name="plus" size={16} strich={2.6} />
                <span className="max-[339px]:hidden">Nachtragen</span>
              </button>
            )}
            <button
              data-tour="profil"
              onClick={() => setShowSettings(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90"
              aria-label="Mein Profil"
            >
              <span className="rounded-full ring-2 ring-white dark:ring-slate-900">
                <Avatar userId={uid} size={40} />
              </span>
            </button>
          </div>
        </div>

        {/* Am Rechner und iPad quer: schwebende Reiterleiste oben in der Mitte
            (wie iPadOS). Auf dem Handy steht sie unten. */}
        <nav className="mx-auto mt-3 hidden w-fit max-w-full rounded-full border border-black/[0.06] p-1 shadow-glas glas dark:border-white/10 lg:flex">
          <GlasLeiste
            variante="oben"
            aktiv={tab}
            onWahl={setTab}
            reiter={navItems.filter((n) => n.show).map((n) => ({ key: n.key, label: n.label, badge: n.badge, tour: `tab-${n.key}`, icon: <Icon name={n.icon} size={16} /> }))}
          />
        </nav>
      </header>

      {/* Großer Titel – läuft beim Scrollen einfach mit weg */}
      <div className="mx-auto max-w-5xl px-1 pb-1 pt-1">
        <h1 className="font-zahl text-[2.125rem] font-bold leading-tight tracking-[-0.025em]">{REITER_TITEL[tab]}</h1>
        <p className="text-[13px] text-tinte-leise">{isStaff ? "Stufenteam" : "Mein Zugang"} · Abi 28</p>
      </div>

      {/* Suche, Kennzahlen und Halbjahr laufen mit – nur die Titelzeile bleibt
          oben kleben. Sonst verdeckt der Kopf auf dem Handy die halbe Liste. */}
      <div>
        {tab === "kasse" && teamView && (
          // Dasselbe Suchfeld wie überall (.field: weiße Zelle mit Haarlinie, 16 px) –
          // vorher war es hier grau gefüllt, im Album und bei Rollen weiß.
          <div className="relative mx-auto mt-1 max-w-5xl">
            <input
              type="text"
              enterKeyHint="search"
              aria-label="Name suchen"
              className="field pr-12"
              placeholder="Name suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Suche leeren"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-tinte-leise"
              >
                <Icon name="x" size={15} strich={2.4} />
              </button>
            )}
          </div>
        )}

        {/* Zum Home-Bildschirm hinzufügen. Verschwindet von selbst, sobald die
            App installiert ist – und auf iPhone/iPad, sobald jemand bestätigt,
            dass er es gemacht hat (mehr dazu in src/lib/install.ts). */}
        {tab === "kasse" && (
          <div className="mx-auto max-w-5xl">
            <InstallKarte />
          </div>
        )}

        {/* Erst die Lage der Kasse, dann die Liste – nicht umgekehrt. */}
        {tab === "kasse" && teamView && <KassenKopf students={students} settings={settings} punkte={punkte} />}

        {tab === "kasse" && teamView && canEditData && (
          <details className="group mx-auto mt-2 max-w-5xl">
            {/* Selten gebraucht – deshalb zugeklappt statt dauerhaft als Leiste */}
            <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 px-1 text-[13px] text-tinte-leise [&::-webkit-details-marker]:hidden">
              Laufendes Halbjahr: <b className="font-semibold text-tinte dark:text-slate-100">{settings.aktuelles_halbjahr}</b>
              <span className="font-semibold text-brand-dark dark:text-brand">· ändern</span>
              <span className="transition group-open:rotate-90" aria-hidden>
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <div className="pb-1">
              <div className="seg min-w-0 flex-1" role="radiogroup" aria-label="Laufendes Halbjahr">
                {HY.map((h) => (
                  <button
                    key={h}
                    role="radio"
                    aria-checked={h === settings.aktuelles_halbjahr}
                    onClick={async () => {
                      if (h === settings.aktuelles_halbjahr) return;
                      if (await frage(`Laufendes Halbjahr für die ganze Stufe auf ${h} umstellen?`, "Umstellen")) setSettings({ aktuelles_halbjahr: h });
                    }}
                    className={`seg-item !px-1 !text-[12px] ${h === settings.aktuelles_halbjahr ? "seg-aktiv" : ""}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}

        {tab === "kasse" && teamView && showFilter && (
          <div className="mx-auto mt-3 max-w-5xl animate-aufsteigen">
            <div className="card grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinte-leise">
                Prozent
                <div className="flex items-center gap-1.5 text-tinte dark:text-slate-200">
                  <input type="number" className={numField} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} />
                  <span className="text-tinte-leise">–</span>
                  <input type="number" className={numField} placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} />
                </div>
              </label>

              <div className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinte-leise">
                Anzeige
                <label className="flex h-10 items-center justify-between gap-2 normal-case">
                  <span className="text-[14px] font-medium text-tinte dark:text-slate-100">nur offene</span>
                  <Schalter an={onlyOpen} onChange={setOnlyOpen} />
                </label>
              </div>

              {can("beitraege.manage") && (
                <div className="col-span-2 flex items-center gap-2 text-[12px] text-tinte-leise sm:col-span-4">
                  Abiball-Staffel und Prozent-Möglichkeiten stehen im Reiter{" "}
                  <button onClick={() => setTab("beitraege")} className="font-semibold text-brand">
                    Beiträge
                  </button>
                </div>
              )}

              <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-papier-linie pt-3 dark:border-slate-800 sm:col-span-4">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-tinte-leise">Daten</span>
                {canEditData && (
                  <>
                    <button onClick={exportData} className={klein}>
                      Export
                    </button>
                    <button onClick={onImport} className={klein}>
                      Import
                    </button>
                  </>
                )}
                <button onClick={() => setShowTour(true)} className={klein}>
                  Einführung
                </button>
                {hasSupabase && (
                  <>
                    <button onClick={changePassword} className={`${klein} ml-auto`}>
                      Passwort ändern
                    </button>
                    <button onClick={() => void abmelden()} className={`${klein} !text-red-600 dark:!text-red-400`}>
                      Abmelden
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
        <main key={tab} className="animate-fadeIn mt-3 pb-4">
          <FaulGrenze fallback={<SkelettKarten n={3} />}>
            <RollenRechteTab />
          </FaulGrenze>
        </main>
      ) : tab === "profil" ? (
        <main key={tab} className="animate-fadeIn mt-3">
          <MyKasse
            student={meinEintrag}
            settings={settings}
            punkte={punkte[meinEintrag?.id ?? ""] || 0}
            ready={ready && roleReady}
          />
        </main>
      ) : tab === "events" ? (
        <main key={tab} className="animate-fadeIn mt-3">
          <FaulGrenze fallback={<SkelettKarten n={3} />}>
            <EventsTab />
          </FaulGrenze>
        </main>
      ) : tab === "themen" ? (
        <main key={tab} className="animate-fadeIn mt-3 pb-4">
          <FaulGrenze fallback={<SkelettKarten n={3} />}>
            <ChatsTab />
          </FaulGrenze>
        </main>
      ) : tab === "finanzen" ? (
        <main key={tab} className="animate-fadeIn mt-3 pb-4">
          <FaulGrenze fallback={<SkelettKarten n={3} />}>
            <FinanzenTab kosten={kosten} />
          </FaulGrenze>
        </main>
      ) : tab === "beitraege" ? (
        <main key={tab} className="animate-fadeIn mt-3 pb-4">
          <FaulGrenze fallback={<SkelettKarten n={3} />}>
            <BeitraegeTab />
          </FaulGrenze>
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
            <SkelettZeilen n={8} />
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
            <div className="flex flex-wrap items-center gap-3 border-b border-papier-linie px-3.5 py-2.5 dark:border-slate-800 sm:px-4">
              <div className="seg w-52" role="radiogroup" aria-label="Anzeige">
                <button role="radio" aria-checked={!onlyOpen} onClick={() => setOnlyOpen(false)} className={`seg-item ${!onlyOpen ? "seg-aktiv" : ""}`}>
                  Alle
                </button>
                <button role="radio" aria-checked={onlyOpen} onClick={() => setOnlyOpen(true)} className={`seg-item ${onlyOpen ? "seg-aktiv" : ""}`}>
                  Nur offene
                </button>
              </div>
              <span className="zahl ml-auto text-[13px] text-tinte-leise">
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
            <button
              ref={setNachschub}
              type="button"
              onClick={() => setSichtbar((v) => v + SCHRITT_LISTE)}
              className="w-full py-6 text-center text-[12px] text-tinte-leise"
            >
              lädt weitere {Math.min(SCHRITT_LISTE, filtered.length - sichtbar)} von{" "}
              {filtered.length - sichtbar} … <span className="font-semibold text-brand">jetzt anzeigen</span>
            </button>
          )}
          {mode === "local" && ready && (
            <p className="col-span-full pt-2 text-center text-[11px] text-tinte-leise">
              Testbetrieb. Die Daten liegen nur auf diesem Gerät.
            </p>
          )}
        </main>
      )}

      {/* Schwebender „Neu“-Knopf nur auf dem Handy (unter 768 px): beschriftete Kapsel,
          damit man die „+“ der Seite auseinanderhält. Ab iPad-Breite sitzt der
          Knopf im Kopf (siehe neuKnopf). */}
      {neuKnopf && !massMode && (
        <button
          data-tour="neu"
          onClick={neuKnopf.los}
          className="fixed bottom-[calc(var(--leiste)+1rem)] right-4 z-30 flex h-12 items-center gap-1.5 rounded-full bg-brand pl-4 pr-5 text-[16px] font-semibold text-white shadow-[0_8px_24px_-6px_rgb(var(--brand)/.6)] transition duration-200 ease-ios active:scale-90 sm:right-6 md:hidden"
          aria-label={neuKnopf.label}
        >
          <Icon name="plus" size={20} strich={2.6} />
          {neuKnopf.text}
        </button>
      )}

      {massMode && (
        <FaulGrenze still>
          <MassBar
            selected={selected}
            onAbwaehlen={waehleAus}
            onDone={() => {
              setMassMode(false);
              setSelected(new Set());
            }}
          />
        </FaulGrenze>
      )}

      {/* Tab-Leiste wie in iOS: ganz unten angedockt, über die volle Breite,
          fast deckender Hintergrund mit Haarlinie – nichts scheint mehr durch. */}
      {!massMode && (
        <nav
          ref={leisteRef}
          className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden ${
            // Viele Reiter (Admin: 7) brauchen auf schmalen Handys jeden Pixel
            anzahlReiter >= 6 ? "px-1.5" : "px-3"
          }`}
        >
          {/* Schwebende Glas-Kapsel wie in iOS 26 – die Linse gleitet zum gewählten Reiter */}
          <div className="pointer-events-auto mx-auto max-w-md rounded-[2rem] border border-white/60 p-1 shadow-[0_8px_32px_-8px_rgba(0,0,0,.28),0_0_0_.5px_rgba(0,0,0,.08)] glas !bg-[rgb(var(--glas)/0.92)] dark:border-white/10 dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,.8),0_0_0_.5px_rgba(255,255,255,.08)]">
            <GlasLeiste
              variante="unten"
              aktiv={tab}
              onWahl={setTab}
              reiter={navItems.filter((n) => n.show).map((n) => ({
                key: n.key,
                label: n.label,
                badge: n.badge,
                tour: `tab-${n.key}`,
                icon: <Icon name={n.icon} size={24} strich={tab === n.key ? 2.2 : 1.7} />,
              }))}
            />
          </div>
        </nav>
      )}

      {/* Enthüllung des Abimottos – einmal pro Person, sobald es feststeht */}
      {ready && (
        <FaulGrenze still>
          <MottoEnthuellung />
        </FaulGrenze>
      )}
      {/* Blätter: Datei wird erst beim ersten Öffnen geladen (ErstBeiBedarf) */}
      <ErstBeiBedarf offen={openStudent !== null}>
        <StudentSheet student={openStudent} punkte={punkte[openStudent?.id ?? ""] || 0} onClose={() => setOpenId(null)} />
      </ErstBeiBedarf>
      <ErstBeiBedarf offen={showAdd}>
        <AddSheet open={showAdd} onClose={() => setShowAdd(false)} />
      </ErstBeiBedarf>
      <ErstBeiBedarf offen={showComposer}>
        <EventComposer
          open={showComposer}
          onClose={() => setShowComposer(false)}
          onVorlagen={() => {
            setShowComposer(false);
            setShowAktion(true);
          }}
          onUmfrage={() => {
            setShowComposer(false);
            setShowUmfragen(true);
          }}
        />
      </ErstBeiBedarf>
      <ErstBeiBedarf offen={showUmfragen}>
        <UmfragenSheet open={showUmfragen} onClose={() => setShowUmfragen(false)} />
      </ErstBeiBedarf>
      <ErstBeiBedarf offen={showAktion}>
        <AktionSheet offen={showAktion} onSchliessen={() => setShowAktion(false)} />
      </ErstBeiBedarf>
      <ErstBeiBedarf offen={showSettings}>
        <ProfilSheet
          open={showSettings}
          onClose={() => setShowSettings(false)}
          onTutorial={() => {
            setShowSettings(false);
            setShowTour(true);
          }}
          // „Was ist neu“: die Patch-Notes jederzeit wieder öffnen
          onNeu={() => {
            setShowSettings(false);
            setShowPatch(true);
          }}
        />
      </ErstBeiBedarf>
      {/* Nicht zwei Begrüßungen übereinander: erst die Einführung, danach der
          Hinweis zum Home-Bildschirm (InstallOverlay wartet außerdem selbst auf
          jede laufende Einführung). */}
      {!showTour && !showPatch && <InstallOverlay />}
      {/* Schicht vorbei: Stufenteam vergibt die Beitragspunkte mit einem Tipp */}
      {!showTour && !showPatch && <SchichtAbschluss />}
      <ErstBeiBedarf offen={nachtragOffen}>
        <NachtragSheet open={nachtragOffen} onClose={() => setNachtragOffen(false)} />
      </ErstBeiBedarf>
      {/* Pop-up-Umfragen: nach Einführung und Patch Notes, vor allem anderen */}
      {ready && (
        <FaulGrenze still>
          <UmfragePopup bereitZumZeigen={roleReady && ready && !showTour && !showPatch} onSichtbar={setUmfrageSichtbar} />
        </FaulGrenze>
      )}
      <Tour
        open={nachtragHinweis}
        steps={[
          {
            anchor: "nachtragen",
            title: "Neu: Mithilfe nachtragen",
            text: "Bei einer Aktion geholfen, aber es wurde nicht eingetragen? Hier oben beantragst du es – das Stufenteam bestätigt.",
          },
        ]}
        onClose={() => {
          setNachtragHinweis(false);
          try {
            localStorage.setItem(NACHTRAG_HINWEIS, "1");
          } catch {
            /* privater Modus */
          }
        }}
      />
      {showPatch && !showTour && (
        <PatchNotes
          team={isStaff}
          onFertig={() => {
            setShowPatch(false);
            try {
              localStorage.setItem(PATCH_MERKER, PATCH.version);
            } catch {
              /* privater Modus */
            }
          }}
        />
      )}
      <Tour
        open={showTour}
        steps={
          isStaff
            ? teamSchritte({
                kasseBearbeiten: canEditBeitrag,
                mehrere: canEditData || canEditHilfen,
                beitraege: can("beitraege.manage"),
                finanzen: showFinanzen,
                rollen: canManageRoles,
                rechte: can("perms.manage"),
                profilReiter: hatProfilReiter,
                nachtragen: Boolean(studentId),
              })
            : schuelerSchritte(staffelVon(settings), { nachtragen: Boolean(studentId), finanzen: showFinanzen })
        }
        onTab={(t) => {
          setShowFilter(false);
          setMassMode(false);
          setTab(t as Tab);
        }}
        onClose={() => {
          setShowTour(false);
          setTab(hatProfilReiter ? "profil" : "kasse");
          // Wer die Einführung gerade gesehen hat, braucht die Patch Notes nicht –
          // und den „Neu: Mithilfe nachtragen“-Hinweis auch nicht (die Einführung
          // erklärt den Knopf selbst)
          try {
            localStorage.setItem(PATCH_MERKER, PATCH.version);
            if (studentId) localStorage.setItem(NACHTRAG_HINWEIS, "1");
          } catch {
            /* privater Modus */
          }
          // Zeitpunkt merken, damit ein späteres Zurücksetzen erkannt wird
          localStorage.setItem(`sv:tour:v3:${isStaff ? "team" : "schueler"}`, new Date().toISOString());
        }}
      />
    </div>
  );
}
