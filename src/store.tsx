import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { HY, type Halbjahr, type Settings, type Status, type Student, newStudent } from "./lib/types";
import { hasSupabase, supabase } from "./lib/supabase";

const LS_STUDENTS = "sv-beitraege:students";
const LS_SETTINGS = "sv-beitraege:settings";

const DEFAULT_SETTINGS: Settings = { aktuelles_halbjahr: "EF.1", schwelle: 3 };

interface StoreValue {
  students: Student[];
  settings: Settings;
  ready: boolean;
  mode: "local" | "supabase";
  addStudent: (nachname: string, vorname: string, beigetreten_ab: Halbjahr) => void;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  removeStudent: (id: string) => void;
  setTerm: (id: string, h: Halbjahr, status: Status) => void;
  bumpBet: (id: string, h: Halbjahr, delta: number) => void;
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

function seed(): Student[] {
  const names: [string, string][] = [
    ["Bauer", "Lena"], ["Çelik", "Deniz"], ["Müller", "Jonas"], ["Schäfer", "Mia"],
    ["Weiß", "Tom"], ["Ackermann", "Nour"], ["Özdemir", "Elif"], ["Brandt", "Finn"],
  ];
  return names.map(([n, v]) => newStudent(n, v));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const mode: "local" | "supabase" = hasSupabase ? "supabase" : "local";
  const [students, setStudents] = useState<Student[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const studentsRef = useRef<Student[]>([]);
  studentsRef.current = students;

  // ---- initial load ----
  useEffect(() => {
    let alive = true;
    (async () => {
      if (mode === "local") {
        try {
          const s = localStorage.getItem(LS_STUDENTS);
          const st = localStorage.getItem(LS_SETTINGS);
          setStudents(s ? JSON.parse(s) : seed());
          if (st) setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(st) });
        } catch {
          setStudents(seed());
        }
        setReady(true);
        return;
      }
      // supabase
      const { data: stu } = await supabase!.from("students").select("*");
      const { data: cfg } = await supabase!.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (!alive) return;
      setStudents((stu as Student[]) || []);
      if (cfg) setSettingsState({ aktuelles_halbjahr: cfg.aktuelles_halbjahr, schwelle: cfg.schwelle });
      setReady(true);

      const ch = supabase!
        .channel("sv-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (p) => {
          setStudents((prev) => {
            if (p.eventType === "DELETE") return prev.filter((x) => x.id !== (p.old as Student).id);
            const row = p.new as Student;
            const i = prev.findIndex((x) => x.id === row.id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = row;
            return next;
          });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p) => {
          const row = p.new as Settings;
          if (row) setSettingsState({ aktuelles_halbjahr: row.aktuelles_halbjahr, schwelle: row.schwelle });
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

  // ---- local persistence ----
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_STUDENTS, JSON.stringify(students));
  }, [students, ready, mode]);
  useEffect(() => {
    if (ready && mode === "local") localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, ready, mode]);

  const persist = useCallback(
    async (st: Student) => {
      if (mode !== "supabase") return;
      const row = { ...st, updated_at: new Date().toISOString() };
      await supabase!.from("students").upsert(row);
    },
    [mode],
  );

  const mutate = useCallback(
    (id: string, fn: (s: Student) => Student) => {
      setStudents((prev) => {
        const next = prev.map((s) => (s.id === id ? fn(s) : s));
        const changed = next.find((s) => s.id === id);
        if (changed) void persist(changed);
        return next;
      });
    },
    [persist],
  );

  const addStudent: StoreValue["addStudent"] = useCallback(
    (nachname, vorname, beigetreten_ab) => {
      const s = newStudent(nachname, vorname, beigetreten_ab);
      setStudents((prev) => [...prev, s]);
      void persist(s);
    },
    [persist],
  );

  const updateStudent: StoreValue["updateStudent"] = useCallback(
    (id, patch) => mutate(id, (s) => ({ ...s, ...patch })),
    [mutate],
  );

  const removeStudent: StoreValue["removeStudent"] = useCallback(
    (id) => {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      if (mode === "supabase") void supabase!.from("students").delete().eq("id", id);
    },
    [mode],
  );

  const setTerm: StoreValue["setTerm"] = useCallback(
    (id, h, status) => mutate(id, (s) => ({ ...s, terms: { ...s.terms, [h]: { ...s.terms[h], status } } })),
    [mutate],
  );

  const bumpBet: StoreValue["bumpBet"] = useCallback(
    (id, h, delta) =>
      mutate(id, (s) => ({
        ...s,
        terms: { ...s.terms, [h]: { ...s.terms[h], bet: Math.max(0, s.terms[h].bet + delta) } },
      })),
    [mutate],
  );

  const setSettings: StoreValue["setSettings"] = useCallback(
    (patch) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...patch };
        if (mode === "supabase") void supabase!.from("app_settings").upsert({ id: 1, ...next });
        return next;
      });
    },
    [mode],
  );

  const massApply: StoreValue["massApply"] = useCallback(
    (ids, h, action) => {
      const i = HY.indexOf(h);
      setStudents((prev) => {
        const next = prev.map((s) => {
          if (!ids.has(s.id)) return s;
          const joinI = HY.indexOf(s.beigetreten_ab);
          const leaveI = s.verlaesst_ab ? HY.indexOf(s.verlaesst_ab) : Infinity;
          if (i < joinI || i >= leaveI) return s; // inaktives HJ überspringen
          const term = s.terms[h];
          const nt = action === "bet" ? { ...term, bet: term.bet + 1 } : { ...term, status: action };
          return { ...s, terms: { ...s.terms, [h]: nt } };
        });
        if (mode === "supabase") next.forEach((s) => ids.has(s.id) && void persist(s));
        return next;
      });
    },
    [mode, persist],
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
        setStudents(d.students);
        if (d.settings) setSettingsState({ ...DEFAULT_SETTINGS, ...d.settings });
        if (mode === "supabase") {
          (d.students as Student[]).forEach((s) => void persist(s));
          void supabase!.from("app_settings").upsert({ id: 1, ...(d.settings || settings) });
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
