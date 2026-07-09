import { useEffect, useMemo, useState } from "react";
import { HY } from "./lib/types";
import { normalize, offenGesamt, offenStufe, sortStudents } from "./lib/logic";
import { useTheme } from "./lib/theme";
import { hasSupabase, supabase } from "./lib/supabase";
import { enablePush, pushConfigured, pushPermission } from "./lib/push";
import { useStore } from "./store";
import { AuthGate } from "./auth/AuthGate";
import { PasswordGate } from "./auth/PasswordGate";
import { RoleProvider, useRole } from "./auth/RoleProvider";
import { EventsProvider, useEvents } from "./events-store";
import { StudentCard, nextStatus } from "./components/StudentCard";
import { StudentSheet } from "./components/StudentSheet";
import { AddSheet } from "./components/AddSheet";
import { MassBar } from "./components/MassBar";
import { RolesTab } from "./components/RolesTab";
import { EventsTab } from "./components/EventsTab";
import { EventComposer } from "./components/EventComposer";

export default function App() {
  return (
    <AuthGate>
      <PasswordGate>
        <RoleProvider>
          <EventsProvider>
            <Main />
          </EventsProvider>
        </RoleProvider>
      </PasswordGate>
    </AuthGate>
  );
}

type Tab = "kasse" | "events" | "rollen";

function Main() {
  const { students, settings, ready, mode, setTerm, setSettings, exportData, importData } = useStore();
  const { canEditData, canEditBeitrag, canManageRoles, isStaff, loginByStudent } = useRole();
  const { events: allEvents, reads } = useEvents();
  const { theme, toggle } = useTheme();

  // Erlaubnis schon erteilt (z. B. vor Konto-Neuanlage)? -> Abo still neu registrieren,
  // damit dieses Konto wieder Push-Nachrichten bekommt.
  useEffect(() => {
    if (pushConfigured() && pushPermission() === "granted")
      void enablePush().then((r) => {
        if (!r.ok) console.warn("[push] Auto-Registrierung fehlgeschlagen:", r.error);
      });
    else console.log("[push] kein Auto-Abo:", { konfiguriert: pushConfigured(), erlaubnis: pushPermission() });
  }, []);

  const unread = allEvents.filter((e) => !reads.has(e.id)).length;
  const [tab, setTab] = useState<Tab>("kasse");
  const [showComposer, setShowComposer] = useState(false);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
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
      if (mn !== null && st.beteiligungen < mn) return false;
      if (mx !== null && st.beteiligungen > mx) return false;
      if (onlyOpen && offenGesamt(st, settings) === 0) return false;
      return true;
    });
  }, [students, query, min, max, onlyOpen, settings]);

  const openStudent = students.find((s) => s.id === openId) ?? null;
  const totalOffen = offenStufe(students, settings);
  const anzahlOffen = students.filter((s) => offenGesamt(s, settings) > 0).length;

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

  async function changePassword() {
    const pw = prompt("Neues Passwort (mindestens 6 Zeichen):");
    if (!pw) return;
    if (pw.length < 6) {
      alert("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    const { error } = await supabase!.auth.updateUser({ password: pw });
    alert(error ? "Fehler: " + error.message : "Passwort geändert ✓");
  }

  const numField =
    "w-16 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-center dark:border-slate-700 dark:bg-slate-800";

  return (
    <div className="mx-auto max-w-5xl px-3 pb-28 sm:px-5">
      <header className="sticky top-0 z-20 -mx-3 border-b border-slate-200 bg-slate-50/90 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:-mx-5 sm:px-5">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5">
          <div className="leading-tight">
            <div className="text-lg font-bold tracking-tight">Stufenkasse</div>
            <div className="text-[11px] text-slate-400">SV · Beiträge</div>
          </div>

          {tab === "kasse" ? (
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-cardDark">
              <span className="text-slate-400">🔍</span>
              <input
                className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                placeholder="Name suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex-1 text-lg font-bold">{tab === "events" ? "Events" : "Rollen & Rechte"}</div>
          )}

          {tab === "kasse" && (
            <>
              <button className={`iconbtn ${showFilter ? "iconbtn-active" : ""}`} onClick={() => setShowFilter((v) => !v)} aria-label="Filter & Einstellungen">
                ⚙︎
              </button>
              {canEditData && (
                <button
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
          <button
            className={`iconbtn relative ${tab === "events" ? "iconbtn-active" : ""}`}
            onClick={() => setTab(tab === "events" ? "kasse" : "events")}
            aria-label="Events"
          >
            📣
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {canManageRoles && (
            <button
              className={`iconbtn ${tab === "rollen" ? "iconbtn-active" : ""}`}
              onClick={() => setTab(tab === "rollen" ? "kasse" : "rollen")}
              aria-label="Rollen verwalten"
            >
              👥
            </button>
          )}
          <button className="iconbtn" onClick={toggle} aria-label="Hell/Dunkel">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        {tab === "kasse" && (
          <div className="mx-auto mt-2.5 flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {HY.map((h) => (
                <button
                  key={h}
                  disabled={!canEditData}
                  onClick={() => setSettings({ aktuelles_halbjahr: h })}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition disabled:cursor-default ${
                    h === settings.aktuelles_halbjahr
                      ? "border-brand bg-brand text-white"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
            {isStaff && (
              <div className="ml-auto rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold shadow-card dark:bg-slate-900 dark:shadow-cardDark">
                Offen gesamt: <span className="font-extrabold text-amber-500">{totalOffen} €</span>
                <span className="ml-1 text-slate-400">· {anzahlOffen} offen</span>
              </div>
            )}
          </div>
        )}

        {tab === "kasse" && showFilter && (
          <div className="mx-auto mt-3 max-w-5xl">
            <div className="card grid grid-cols-2 gap-x-5 gap-y-4 p-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beteiligungen
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <input type="number" className={numField} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} />
                  <span className="text-slate-400">–</span>
                  <input type="number" className={numField} placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} />
                </div>
              </label>

              <div className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Anzeige
                <button
                  onClick={() => setOnlyOpen((v) => !v)}
                  className={`rounded-lg border px-3 py-2 text-[13px] font-bold normal-case transition ${
                    onlyOpen ? "border-brand bg-brand text-white" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  {onlyOpen ? "✓ nur offene" : "nur offene"}
                </button>
              </div>

              {canEditData && (
                <>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Benötigt bis Q2.2
                    <input
                      type="number"
                      className={numField}
                      value={settings.benoetigt}
                      onChange={(e) => setSettings({ benoetigt: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Zusatzbetrag €
                    <input
                      type="number"
                      className={numField}
                      value={settings.zusatz}
                      onChange={(e) => setSettings({ zusatz: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </>
              )}

              <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700 sm:col-span-4">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Daten</span>
                {canEditData && (
                  <>
                    <button onClick={exportData} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-slate-700">
                      Export
                    </button>
                    <button onClick={onImport} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                      Import
                    </button>
                  </>
                )}
                {hasSupabase && (
                  <>
                    <button onClick={changePassword} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold dark:border-slate-700">
                      Passwort ändern
                    </button>
                    <button onClick={() => supabase!.auth.signOut()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-500 dark:border-slate-700">
                      Logout
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {tab === "rollen" ? (
        <main className="mt-3">
          <RolesTab />
        </main>
      ) : tab === "events" ? (
        <main className="mt-3">
          <EventsTab />
        </main>
      ) : (
        <main className="mt-3 grid gap-3 lg:grid-cols-2">
          {!ready && (
            <div className="col-span-full flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
              <div className="text-sm font-medium">Beitragsliste wird geladen …</div>
            </div>
          )}
          {ready && filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-slate-400">
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
              canToggleBeitrag={canEditBeitrag}
              loginState={isStaff ? (loginByStudent[st.id] ?? false) : null}
              onOpen={() => setOpenId(st.id)}
              onToggleSelect={() => toggleSelect(st.id)}
              onToggleTerm={(h) => setTerm(st.id, h, nextStatus(st.terms[h].status))}
            />
          ))}
          {mode === "local" && ready && (
            <p className="col-span-full pt-2 text-center text-[11px] text-slate-400">
              Lokaler Modus – Daten nur auf diesem Gerät.
            </p>
          )}
        </main>
      )}

      {tab === "kasse" && canEditData && !massMode && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
          aria-label="Person hinzufügen"
        >
          ＋
        </button>
      )}

      {tab === "events" && canEditData && (
        <button
          onClick={() => setShowComposer(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl text-white shadow-lg shadow-brand/40 transition active:scale-95 sm:right-6"
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

      <StudentSheet student={openStudent} onClose={() => setOpenId(null)} />
      <AddSheet open={showAdd} onClose={() => setShowAdd(false)} />
      <EventComposer open={showComposer} onClose={() => setShowComposer(false)} />
    </div>
  );
}
