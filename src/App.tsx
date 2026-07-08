import { useMemo, useState } from "react";
import { HY, type Halbjahr } from "./lib/types";
import { normalize, offenBetrag, sortStudents, totalBet } from "./lib/logic";
import { useTheme } from "./lib/theme";
import { hasSupabase, supabase } from "./lib/supabase";
import { useStore } from "./store";
import { AuthGate } from "./auth/AuthGate";
import { StudentCard } from "./components/StudentCard";
import { StudentSheet } from "./components/StudentSheet";
import { AddSheet } from "./components/AddSheet";
import { MassBar } from "./components/MassBar";

export default function App() {
  return (
    <AuthGate>
      <Main />
    </AuthGate>
  );
}

function Main() {
  const { students, settings, ready, mode, setSettings, exportData, importData } = useStore();
  const { theme, toggle } = useTheme();

  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const [massMode, setMassMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const mn = min === "" ? null : Number(min);
    const mx = max === "" ? null : Number(max);
    return sortStudents(students).filter((st) => {
      if (q) {
        const a = normalize(`${st.nachname} ${st.vorname}`);
        const b = normalize(`${st.vorname} ${st.nachname}`);
        if (!a.includes(q) && !b.includes(q)) return false;
      }
      const bet = totalBet(st);
      if (mn !== null && bet < mn) return false;
      if (mx !== null && bet > mx) return false;
      if (onlyOpen && offenBetrag(st, settings.aktuelles_halbjahr) === 0) return false;
      return true;
    });
  }, [students, query, min, max, onlyOpen, settings.aktuelles_halbjahr]);

  const openStudent = students.find((s) => s.id === openId) ?? null;

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
      if (!f) return;
      f.text().then((t) => alert(importData(t) ? "Import erfolgreich." : "Ungültige Datei."));
    };
    inp.click();
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 px-3.5 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center gap-2.5">
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">Stufenkasse</div>
            <div className="text-[11px] text-slate-400">SV · Beiträge</div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-cardDark">
            <span className="text-slate-400">🔎</span>
            <input
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
              placeholder="Name suchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`iconbtn ${showFilter ? "iconbtn-active" : ""}`}
            onClick={() => setShowFilter((v) => !v)}
            aria-label="Filter"
          >
            ⚙︎
          </button>
          <button
            className={`iconbtn ${massMode ? "iconbtn-active" : ""}`}
            onClick={() => {
              setMassMode((v) => !v);
              setSelected(new Set());
            }}
            aria-label="Mehrere auswählen"
          >
            ☑︎
          </button>
          <button className="iconbtn" onClick={toggle} aria-label="Hell/Dunkel">
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
        </div>

        {/* current-halfyear rail */}
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-400">
          {HY.map((h, i) => (
            <span key={h} className="flex items-center gap-1">
              <button
                onClick={() => setSettings({ aktuelles_halbjahr: h })}
                className={`rounded-full border px-2.5 py-0.5 font-bold transition ${
                  h === settings.aktuelles_halbjahr
                    ? "border-brand bg-brand/10 text-brand ring-2 ring-brand/20"
                    : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                {h}
              </button>
              {i < HY.length - 1 && <span className="opacity-40">›</span>}
            </span>
          ))}
        </div>

        {showFilter && (
          <div className="card mt-2.5 flex flex-wrap items-end gap-4 p-3">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Beteiligung (gesamt)
              <div className="flex items-center gap-1.5">
                min
                <input
                  type="number"
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
                max
                <input
                  type="number"
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                />
              </div>
            </label>
            <button
              onClick={() => setOnlyOpen((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                onlyOpen ? "border-brand bg-brand text-white" : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
              }`}
            >
              nur noch offen (bis aktuell)
            </button>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Erlass-Schwelle
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800"
                  value={settings.schwelle}
                  onChange={(e) => setSettings({ schwelle: Math.max(0, Number(e.target.value) || 0) })}
                />
                Beteil./HJ
              </div>
            </label>
            <div className="flex flex-col gap-1 text-xs text-slate-500">
              Daten
              <div className="flex gap-3">
                <button className="font-semibold text-brand" onClick={exportData}>
                  Export
                </button>
                <button className="font-semibold text-brand" onClick={onImport}>
                  Import
                </button>
                {hasSupabase && (
                  <button className="font-semibold text-slate-400" onClick={() => supabase!.auth.signOut()}>
                    Logout
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* list */}
      <main className="space-y-2.5 px-3.5 py-3">
        {!ready && <div className="py-16 text-center text-slate-400">Lädt …</div>}
        {ready && filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
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
        {filtered.map((st) => (
          <StudentCard
            key={st.id}
            student={st}
            settings={settings}
            selectable={massMode}
            selected={selected.has(st.id)}
            onOpen={() => setOpenId(st.id)}
            onToggleSelect={() => toggleSelect(st.id)}
          />
        ))}
        {mode === "local" && ready && (
          <p className="pt-2 text-center text-[11px] text-slate-400">
            Lokaler Modus – Daten nur auf diesem Gerät. Supabase-Zugang in .env eintragen für Sync &amp; Login.
          </p>
        )}
      </main>

      {/* FAB */}
      {!massMode && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95"
          aria-label="Person hinzufügen"
        >
          ＋
        </button>
      )}

      {massMode && <MassBar selected={selected} onDone={() => { setMassMode(false); setSelected(new Set()); }} />}

      <StudentSheet student={openStudent} onClose={() => setOpenId(null)} />
      <AddSheet open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}
