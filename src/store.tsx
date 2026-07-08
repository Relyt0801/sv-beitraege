import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { HY, type Halbjahr, type Settings, type Status, type Student, newStudent } from "./lib/types";
import { hasSupabase, supabase } from "./lib/supabase";

const LS_STUDENTS = "sv-beitraege:students";
const LS_SETTINGS = "sv-beitraege:settings";

const DEFAULT_SETTINGS: Settings = { aktuelles_halbjahr: "EF.1", benoetigt: 3, zusatz: 25 };

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
  settings: Settings;
  ready: boolean;
  mode: "local" | "supabase";
  addStudent: (nachname: string, vorname: string, beigetreten_ab: Halbjahr) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  setTerm: (id: string, h: Halbjahr, status: Status) => void;
  bumpBet: (id: string, delta: number) => void;
  setSettings: (patch: Partial<Settings>) => void;
  massApply: (ids: Set<string>, h: Halbjahr, action: "offen" | "bezahlt" | "erlassen" | "bet") => void;
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
  if (now - lastAlert > 4000) {
    lastAlert = now;
    alert(
      "Speichern/Laden fehlgeschlagen:\n" +
        msg +
        "\n\nMeist fehlt eine Datenbank-Spalte – bitte das SQL-Update in Supabase ausführen.",
    );
  }
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
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const studentsRef = useRef<Student[]>([]);
  studentsRef.current = students;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (mode === "local") {
        try {
          const s = localStorage.getItem(LS_STUDENTS);
          const st = localStorage.getItem(LS_SETTINGS);
          setStudents(s ? (JSON.parse(s) as any[]).map(migrate) : seed());
          if (st) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(st) });
        } catch {
          setStudents(seed());
        }
        setReady(true);
        return;
      }
      const { data: stu, error: stuErr } = await supabase!.from("students").select("*");
      const { data: cfg, error: cfgErr } = await supabase!.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      reportErr(stuErr?.message || cfgErr?.message);
      setStudents(((stu as any[]) || []).map(migrate));
      if (cfg)
        setSettingsState({
          aktuelles_halbjahr: cfg.aktuelles_halbjahr,
          benoetigt: cfg.schwelle ?? 3,
          zusatz: cfg.zusatzbetrag ?? 25,
        });
      setReady(true);

      const ch = supabase!
        .channel("sv-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (p) => {
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
        .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p) => {
          const row = p.new as any;
          if (row)
            setSettingsState({
              aktuelles_halbjahr: row.aktuelles_halbjahr,
              benoetigt: row.schwelle ?? 3,
              zusatz: row.zusatzbetrag ?? 25,
            });
        })
        .subscribe();
      return () => {
        supabase!.removeChannel(ch);
      };
    })();
    return () => {
      alive = false;
    };
  }, [mode]);

  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_STUDENTS, JSON.stringify(students));
  }, [students, ready, mode]);
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, ready, mode]);

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
      if (mode === "supabase") void run(supabase!.from("students").delete().eq("id", id));
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

  const bumpBet: StoreValue["bumpBet"] = useCallback(
    (id, delta) =>
      mutate(
        id,
        (s) => ({ ...s, beteiligungen: Math.max(0, s.beteiligungen + delta) }),
        (s) => ({ beteiligungen: s.beteiligungen }),
      ),
    [mutate],
  );

  const setSettings: StoreValue["setSettings"] = useCallback(
    (patch) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...patch };
        if (mode === "supabase")
          void run(
            supabase!.from("app_settings").upsert({
              id: 1,
              aktuelles_halbjahr: next.aktuelles_halbjahr,
              schwelle: next.benoetigt,
              zusatzbetrag: next.zusatz,
            }),
          );
        return next;
      });
    },
    [mode],
  );

  const massApply: StoreValue["massApply"] = useCallback(
    (ids, h, action) => {
      const i = HY.indexOf(h);
      const updates: [string, Record<string, unknown>][] = [];
      for (const s of studentsRef.current) {
        if (!ids.has(s.id)) continue;
        if (action === "bet") {
          updates.push([s.id, { beteiligungen: Math.max(0, s.beteiligungen + 1) }]);
          continue;
        }
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
    const blob = new Blob([JSON.stringify({ students: studentsRef.current, settings }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stufenkasse-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }, [settings]);

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
              schwelle: cfg.benoetigt,
              zusatzbetrag: cfg.zusatz,
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

  const value: StoreValue = {
    students, settings, ready, mode,
    addStudent, updateStudent, removeStudent, setTerm, bumpBet, setSettings, massApply, exportData, importData,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
