import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { HY, type ContribTemplate, type Contribution, type Halbjahr, type Settings, type Status, type Student, type Beitraege, newStudent, STAFFEL_STANDARD, BEITRAEGE_STANDARD } from "./lib/types";
import { hasSupabase, supabase } from "./lib/supabase";
import { istEigenesEcho, merkeEigeneAenderung } from "./lib/echo";

const LS_STUDENTS = "sv-beitraege:students";
const LS_SETTINGS = "sv-beitraege:settings";
const LS_CONTRIB = "sv-beitraege:contributions";
const LS_TPL = "sv-beitraege:templates";

const DEFAULT_SETTINGS: Settings = {
  aktuelles_halbjahr: "EF.1",
  ziel_punkte: 100, // 100 % = voll
  zusatz: 0, // altes Konzept, von der Staffel abgelöst
  staffel: STAFFEL_STANDARD,
  ticket_preis: 0,
  beitraege: BEITRAEGE_STANDARD,
};

/**
 * Beitraege aus der Datenbank pruefen. Fehlt ein Halbjahr oder steht Unsinn
 * drin, greift der Standardwert – so kostet nie versehentlich etwas 0 Euro.
 */
function gueltigeBeitraege(roh: unknown): Beitraege {
  const aus = { ...BEITRAEGE_STANDARD };
  if (roh && typeof roh === "object") {
    for (const h of HY) {
      const wert = (roh as Record<string, unknown>)[h];
      if (typeof wert === "number" && isFinite(wert) && wert >= 0) aus[h] = Math.round(wert);
    }
  }
  return aus;
}

/** Alte Daten (Beteiligungen pro Halbjahr) auf das neue Modell (Gesamtzahl) migrieren. */
function migrate(s: any): Student {
  let bet = typeof s.beteiligungen === "number" ? s.beteiligungen : 0;
  const terms: any = {};
  for (const h of HY) {
    const t = s.terms?.[h] ?? { status: "offen" };
    if (typeof s.beteiligungen !== "number" && typeof t.bet === "number") bet += t.bet;
    terms[h] = { status: t.status ?? "offen" };
  }
  return {
    id: s.id,
    nachname: s.nachname,
    vorname: s.vorname ?? "",
    beigetreten_ab: s.beigetreten_ab ?? "EF.1",
    verlaesst_ab: s.verlaesst_ab ?? null,
    beteiligungen: bet,
    terms,
  };
}

interface StoreValue {
  students: Student[];
  contributions: Contribution[];
  /** Summe der Beitragspunkte je Person (student_id -> Punkte). */
  punkte: Record<string, number>;
  settings: Settings;
  ready: boolean;
  mode: "local" | "supabase";
  /** Daten neu laden – nötig, sobald sich die Sichtbarkeit ändert (Zustimmung, Rolle). */
  reload: () => void;
  addStudent: (nachname: string, vorname: string, beigetreten_ab: Halbjahr) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  setTerm: (id: string, h: Halbjahr, status: Status) => void;
  templates: ContribTemplate[];
  addContribution: (studentId: string, titel: string, punkte: number, datum?: string) => void;
  /** Denselben Beitrag mehreren Personen gutschreiben. */
  addContributionMany: (studentIds: string[], titel: string, punkte: number) => void;
  addTemplate: (titel: string, punkte: number) => void;
  updateTemplate: (id: string, patch: Partial<Pick<ContribTemplate, "titel" | "punkte" | "sort" | "variabel">>) => void;
  removeTemplate: (id: string) => void;
  updateContribution: (id: string, patch: Partial<Pick<Contribution, "titel" | "punkte" | "datum">>) => void;
  removeContribution: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  massApply: (ids: Set<string>, h: Halbjahr, action: "offen" | "bezahlt" | "erlassen") => void;
  exportData: () => void;
  importData: (raw: string) => boolean;
}

const Ctx = createContext<StoreValue | null>(null);
export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
};

// Supabase-Fehler sichtbar machen (statt still zu scheitern) – throttled, damit
// ein fehlgeschlagener Massen-Import nicht 100 Meldungen produziert.
let lastAlert = 0;
function reportErr(msg?: string) {
  if (!msg) return;
  console.error("[Supabase]", msg);
  const now = Date.now();
  if (now - lastAlert < 4000) return;
  lastAlert = now;
  // Fehlende Spalte: das passiert, wenn ein SQL-Update noch nicht gelaufen ist.
  const spalte = /Could not find the '([^']+)' column of '([^']+)'/.exec(msg);
  if (spalte) {
    alert(
      `In der Datenbank fehlt noch die Spalte "${spalte[1]}" in der Tabelle "${spalte[2]}".\n\n` +
        "Das ist kein Fehler in der App. In Supabase muss noch das passende SQL aus dem Ordner " +
        "supabase/ ausgeführt werden, dann läuft alles wieder.",
    );
    return;
  }
  alert("Das Speichern hat nicht geklappt.\n\n" + msg);
}
/**
 * Einstellungen speichern. Fehlt in einer alten Datenbank noch eine der neuen
 * Spalten, wird ohne sie erneut gespeichert – der Rest geht dann trotzdem durch.
 */
async function speichereEinstellungen(next: Settings) {
  const voll = {
    id: 1,
    aktuelles_halbjahr: next.aktuelles_halbjahr,
    ziel_punkte: next.ziel_punkte,
    zusatzbetrag: next.zusatz,
    staffel: next.staffel,
    ticket_preis: next.ticket_preis,
    beitraege: next.beitraege,
  };
  const { error } = await supabase!.from("app_settings").upsert(voll);
  if (!error) return;
  if (!/Could not find the '(staffel|ticket_preis|beitraege)' column/.test(error.message)) {
    reportErr(error.message);
    return;
  }
  const { staffel: _s, ticket_preis: _t, beitraege: _b, ...schlank } = voll;
  const zweiter = await supabase!.from("app_settings").upsert(schlank);
  if (zweiter.error) reportErr(zweiter.error.message);
  else reportErr(error.message); // trotzdem sagen, dass das SQL noch fehlt
}

/** Ergebnis eines Supabase-Aufrufs prüfen und Fehler melden. */
function run(p: PromiseLike<{ error: { message: string } | null }>) {
  return Promise.resolve(p).then((r) => {
    if (r && r.error) reportErr(r.error.message);
  });
}

function seed(): Student[] {
  const names: [string, string][] = [
    ["Bauer", "Lena"], ["Çelik", "Deniz"], ["Müller", "Jonas"], ["Schäfer", "Mia"],
    ["Weiß", "Tom"], ["Ackermann", "Nour"], ["Özdemir", "Elif"], ["Brandt", "Finn"],
  ];
  return names.map(([n, v]) => newStudent(n, v));
}

function toRow(st: Student) {
  return {
    id: st.id,
    nachname: st.nachname,
    vorname: st.vorname,
    beigetreten_ab: st.beigetreten_ab,
    verlaesst_ab: st.verlaesst_ab,
    beteiligungen: st.beteiligungen,
    terms: st.terms,
    updated_at: new Date().toISOString(),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const mode: "local" | "supabase" = hasSupabase ? "supabase" : "local";
  const [students, setStudents] = useState<Student[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [templates, setTemplates] = useState<ContribTemplate[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const studentsRef = useRef<Student[]>([]);
  studentsRef.current = students;
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (mode === "local") {
      try {
        const s = localStorage.getItem(LS_STUDENTS);
        const st = localStorage.getItem(LS_SETTINGS);
        setStudents(s ? (JSON.parse(s) as any[]).map(migrate) : seed());
        if (st) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(st) });
        const c = localStorage.getItem(LS_CONTRIB);
        if (c) setContributions(JSON.parse(c) as Contribution[]);
        const tp = localStorage.getItem(LS_TPL);
        setTemplates(
          tp
            ? (JSON.parse(tp) as ContribTemplate[])
            : [
                { id: "t1", titel: "Kuchen gebacken", punkte: 5, sort: 10 },
                { id: "t2", titel: "Kuchenverkauf – Schicht", punkte: 8, sort: 20 },
                { id: "t3", titel: "Auf-/Abbau bei einer Aktion", punkte: 8, sort: 30 },
              ],
        );
      } catch {
        setStudents(seed());
      }
      setReady(true);
      return;
    }

    let alive = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    let loaded = false;

    const subscribeRealtime = () => {
      if (channel) return;
      channel = supabase!
        .channel("sv-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (p) => {
          const wenId = ((p.eventType === "DELETE" ? p.old : p.new) as { id?: string })?.id;
          if (wenId && istEigenesEcho(`student:${wenId}`)) return;
          setStudents((prev) => {
            if (p.eventType === "DELETE") return prev.filter((x) => x.id !== (p.old as Student).id);
            const row = migrate(p.new);
            const i = prev.findIndex((x) => x.id === row.id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = row;
            return next;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "contributions" }, (p) => {
          const wenId = ((p.eventType === "DELETE" ? p.old : p.new) as { id?: string })?.id;
          if (wenId && istEigenesEcho(`beitrag:${wenId}`)) return;
          setContributions((prev) => {
            if (p.eventType === "DELETE") return prev.filter((c) => c.id !== (p.old as Contribution).id);
            const row = p.new as Contribution;
            const i = prev.findIndex((c) => c.id === row.id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = row;
            return next;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "contribution_templates" }, (p) => {
          // Nur die eine geänderte Zeile einpflegen. Früher wurde hier die ganze
          // Liste neu geladen – bei jedem getippten Buchstaben einmal.
          const wenId = ((p.eventType === "DELETE" ? p.old : p.new) as { id?: string })?.id;
          if (wenId && istEigenesEcho(`vorlage:${wenId}`)) return;
          setTemplates((prev) => {
            if (p.eventType === "DELETE") return prev.filter((t) => t.id !== wenId);
            const row = p.new as ContribTemplate;
            const i = prev.findIndex((t) => t.id === row.id);
            if (i === -1) return [...prev, row].sort((a, b) => a.sort - b.sort || a.punkte - b.punkte);
            const next = [...prev];
            next[i] = row;
            return next;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p) => {
          if (istEigenesEcho("einstellungen")) return;
          const row = p.new as any;
          if (row)
            setSettingsState({
              aktuelles_halbjahr: row.aktuelles_halbjahr,
              ziel_punkte: row.ziel_punkte ?? 100,
              zusatz: row.zusatzbetrag ?? 0,
              staffel: Array.isArray(row.staffel) && row.staffel.length ? row.staffel : STAFFEL_STANDARD,
              ticket_preis: row.ticket_preis ?? 0,
              beitraege: gueltigeBeitraege(row.beitraege),
            });
        })
        .subscribe();
    };

    // Daten erst laden, wenn eine Session da ist (sonst blockt RLS und es kommt nichts).
    const loadAll = async () => {
      setReady(false);
      const { data: stu, error: stuErr } = await supabase!.from("students").select("*");
      const { data: con, error: conErr } = await supabase!.from("contributions").select("*").order("datum", { ascending: false });
      const { data: tpl } = await supabase!.from("contribution_templates").select("*").order("sort");
      const { data: cfg, error: cfgErr } = await supabase!.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      reportErr(stuErr?.message || cfgErr?.message);
      if (conErr && !/does not exist|schema cache/i.test(conErr.message)) reportErr(conErr.message);
      setStudents(((stu as any[]) || []).map(migrate));
      setContributions(((con as Contribution[]) || []));
      setTemplates(((tpl as ContribTemplate[]) || []));
      if (cfg)
        setSettingsState({
          aktuelles_halbjahr: cfg.aktuelles_halbjahr,
          ziel_punkte: cfg.ziel_punkte ?? 100,
          zusatz: cfg.zusatzbetrag ?? 0,
          staffel:
            Array.isArray((cfg as { staffel?: unknown }).staffel) && (cfg as { staffel: [] }).staffel.length
              ? ((cfg as { staffel: Settings["staffel"] }).staffel)
              : STAFFEL_STANDARD,
          ticket_preis: (cfg as { ticket_preis?: number }).ticket_preis ?? 0,
          beitraege: gueltigeBeitraege((cfg as { beitraege?: unknown }).beitraege),
        });
      setReady(true);
      subscribeRealtime();
    };
    reloadRef.current = () => void loadAll();

    const { data: sub } = supabase!.auth.onAuthStateChange((event, session) => {
      if (session && !loaded && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
        loaded = true;
        void loadAll();
      } else if (event === "SIGNED_OUT") {
        loaded = false;
        setStudents([]);
        setContributions([]);
        setReady(true);
        if (channel) {
          supabase!.removeChannel(channel);
          channel = null;
        }
      } else if (event === "INITIAL_SESSION" && !session) {
        setReady(true);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (channel) supabase!.removeChannel(channel);
    };
  }, [mode]);

  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_STUDENTS, JSON.stringify(students));
  }, [students, ready, mode]);
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, ready, mode]);
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_CONTRIB, JSON.stringify(contributions));
  }, [contributions, ready, mode]);
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_TPL, JSON.stringify(templates));
  }, [templates, ready, mode]);

  const persist = useCallback(
    async (st: Student) => {
      if (mode === "supabase") await run(supabase!.from("students").upsert(toRow(st)));
    },
    [mode],
  );

  // Spaltengenaues Update: schreibt NUR die geänderten Felder zurück, damit
  // parallele Änderungen an verschiedenen Feldern derselben Person sich nicht
  // gegenseitig überschreiben.
  const patchCols = useCallback(
    (id: string, cols: Record<string, unknown>) => {
      if (mode === "supabase")
        void run(
          supabase!
            .from("students")
            .update({ ...cols, updated_at: new Date().toISOString() })
            .eq("id", id),
        );
    },
    [mode],
  );

  /** Lokalen State ändern und exakt die betroffenen Spalten in der DB aktualisieren. */
  const mutate = useCallback(
    (id: string, fn: (s: Student) => Student, cols: (s: Student) => Record<string, unknown>) => {
      const cur = studentsRef.current.find((s) => s.id === id);
      if (!cur) return;
      const changed = fn(cur);
      setStudents((prev) => prev.map((s) => (s.id === id ? changed : s)));
      merkeEigeneAenderung(`student:${id}`);
      patchCols(id, cols(changed));
    },
    [patchCols],
  );

  const addStudent: StoreValue["addStudent"] = useCallback(
    (nachname, vorname, beigetreten_ab) => {
      const s = newStudent(nachname, vorname, beigetreten_ab);
      setStudents((prev) => [...prev, s]);
      if (mode === "supabase") void run(supabase!.from("students").insert(toRow(s)));
    },
    [mode],
  );

  const updateStudent: StoreValue["updateStudent"] = useCallback(
    (id, patch) => mutate(id, (s) => ({ ...s, ...patch }), () => patch),
    [mutate],
  );

  const removeStudent: StoreValue["removeStudent"] = useCallback(
    (id) => {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      if (mode === "supabase") {
        merkeEigeneAenderung(`student:${id}`);
        void run(supabase!.from("students").delete().eq("id", id));
      }
    },
    [mode],
  );

  const setTerm: StoreValue["setTerm"] = useCallback(
    (id, h, status) =>
      mutate(
        id,
        (s) => ({ ...s, terms: { ...s.terms, [h]: { status } } }),
        (s) => ({ terms: s.terms }),
      ),
    [mutate],
  );

  const addContribution: StoreValue["addContribution"] = useCallback(
    (studentId, titel, punkte, datum) => {
      const c: Contribution = {
        id: crypto.randomUUID(),
        student_id: studentId,
        titel: titel.trim() || "Beitrag",
        punkte: Math.max(0, Math.round(punkte) || 0),
        datum: datum || new Date().toISOString().slice(0, 10),
      };
      setContributions((prev) => [c, ...prev]);
      if (mode === "supabase")
        void run(
          supabase!.from("contributions").insert({
            id: c.id, student_id: c.student_id, titel: c.titel, punkte: c.punkte, datum: c.datum,
          }),
        );
    },
    [mode],
  );

  const addContributionMany: StoreValue["addContributionMany"] = useCallback(
    (studentIds, titel, punkte) => {
      const datum = new Date().toISOString().slice(0, 10);
      const neu: Contribution[] = studentIds.map((student_id) => ({
        id: crypto.randomUUID(),
        student_id,
        titel: titel.trim() || "Beitrag",
        punkte: Math.max(0, Math.round(punkte) || 0),
        datum,
      }));
      if (!neu.length) return;
      setContributions((prev) => [...neu, ...prev]);
      if (mode === "supabase")
        void run(
          supabase!.from("contributions").insert(
            neu.map((c) => ({ id: c.id, student_id: c.student_id, titel: c.titel, punkte: c.punkte, datum: c.datum })),
          ),
        );
    },
    [mode],
  );

  const addTemplate: StoreValue["addTemplate"] = useCallback(
    (titel, punkte) => {
      const t: ContribTemplate = {
        id: crypto.randomUUID(),
        titel: titel.trim(),
        punkte: Math.max(0, Math.round(punkte) || 0),
        sort: 100,
        variabel: false,
      };
      if (!t.titel) return;
      setTemplates((prev) => [...prev, t]);
      if (mode === "supabase") void run(supabase!.from("contribution_templates").insert(t));
    },
    [mode],
  );

  const updateTemplate: StoreValue["updateTemplate"] = useCallback(
    (id, patch) => {
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (mode === "supabase") {
        merkeEigeneAenderung(`vorlage:${id}`);
        void run(supabase!.from("contribution_templates").update(patch).eq("id", id));
      }
    },
    [mode],
  );

  const removeTemplate: StoreValue["removeTemplate"] = useCallback(
    (id) => {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (mode === "supabase") {
        merkeEigeneAenderung(`vorlage:${id}`);
        void run(supabase!.from("contribution_templates").delete().eq("id", id));
      }
    },
    [mode],
  );

  const updateContribution: StoreValue["updateContribution"] = useCallback(
    (id, patch) => {
      const clean = { ...patch };
      if (clean.punkte != null) clean.punkte = Math.max(0, Math.round(clean.punkte) || 0);
      setContributions((prev) => prev.map((c) => (c.id === id ? { ...c, ...clean } : c)));
      if (mode === "supabase") {
        merkeEigeneAenderung(`beitrag:${id}`);
        void run(supabase!.from("contributions").update(clean).eq("id", id));
      }
    },
    [mode],
  );

  const removeContribution: StoreValue["removeContribution"] = useCallback(
    (id) => {
      setContributions((prev) => prev.filter((c) => c.id !== id));
      if (mode === "supabase") {
        merkeEigeneAenderung(`beitrag:${id}`);
        void run(supabase!.from("contributions").delete().eq("id", id));
      }
    },
    [mode],
  );

  const setSettings: StoreValue["setSettings"] = useCallback(
    (patch) => {
      // Gespeichert wird ausserhalb des State-Updaters. Stand der Dinge kommt aus
      // settingsRef, damit mehrere Aenderungen kurz hintereinander nicht
      // gegeneinander laufen.
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettingsState(next);
      if (mode === "supabase") {
        merkeEigeneAenderung("einstellungen");
        void speichereEinstellungen(next);
      }
    },
    [mode],
  );

  const massApply: StoreValue["massApply"] = useCallback(
    (ids, h, action) => {
      const i = HY.indexOf(h);
      const updates: [string, Record<string, unknown>][] = [];
      for (const s of studentsRef.current) {
        if (!ids.has(s.id)) continue;
        const joinI = HY.indexOf(s.beigetreten_ab);
        const leaveI = s.verlaesst_ab ? HY.indexOf(s.verlaesst_ab) : Infinity;
        if (i < joinI || i >= leaveI) continue;
        updates.push([s.id, { terms: { ...s.terms, [h]: { status: action } } }]);
      }
      const map = new Map(updates);
      setStudents((prev) => prev.map((s) => (map.has(s.id) ? { ...s, ...map.get(s.id) } : s)));
      updates.forEach(([id, cols]) => patchCols(id, cols));
    },
    [patchCols],
  );

  const exportData: StoreValue["exportData"] = useCallback(() => {
    const blob = new Blob([JSON.stringify({ students: studentsRef.current, contributions, settings }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stufenkasse-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }, [settings, contributions]);

  const importData: StoreValue["importData"] = useCallback(
    (raw) => {
      try {
        const d = JSON.parse(raw);
        if (!d.students) return false;
        const migrated = (d.students as any[]).map(migrate);
        setStudents(migrated);
        if (d.settings) setSettingsState({ ...DEFAULT_SETTINGS, ...d.settings });
        if (mode === "supabase") {
          migrated.forEach((s) => void persist(s));
          const cfg = { ...DEFAULT_SETTINGS, ...(d.settings || settings) };
          void run(
            supabase!.from("app_settings").upsert({
              id: 1,
              aktuelles_halbjahr: cfg.aktuelles_halbjahr,
              ziel_punkte: cfg.ziel_punkte,
              zusatzbetrag: cfg.zusatz,
              staffel: cfg.staffel,
              ticket_preis: cfg.ticket_preis,
            }),
          );
        }
        return true;
      } catch {
        return false;
      }
    },
    [mode, persist, settings],
  );

  const punkte: Record<string, number> = {};
  for (const c of contributions) punkte[c.student_id] = (punkte[c.student_id] || 0) + c.punkte;

  const value: StoreValue = {
    students, contributions, templates, punkte, settings, ready, mode,
    reload: () => reloadRef.current?.(),
    addStudent, updateStudent, removeStudent, setTerm,
    addContribution, addContributionMany, updateContribution, removeContribution,
    addTemplate, updateTemplate, removeTemplate,
    setSettings, massApply, exportData, importData,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
