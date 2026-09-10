import { useEffect, useState } from "react";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { entscheide, ladeAnfragen, type UnbanRequest } from "../lib/unban";

/** Entbannungsanfragen – erscheinen für die Moderation oben in den Events. */
export function UnbanRequests() {
  const { can, profiles } = useRole();
  const { students } = useStore();
  const [liste, setListe] = useState<UnbanRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = () => void ladeAnfragen().then(setListe);
  useEffect(() => {
    laden();
    const t = setInterval(laden, 30000);
    return () => clearInterval(t);
  }, []);

  if (!can("mod.timeout") || liste.length === 0) return null;

  const nameVon = (userId: string) => {
    const p = profiles.find((x) => x.user_id === userId);
    const st = p?.student_id ? students.find((s) => s.id === p.student_id) : null;
    return st ? `${st.vorname} ${st.nachname}` : p?.username || "Unbekannt";
  };

  return (
    <div className="mb-4 grid gap-2.5">
      {liste.map((r) => (
        <div key={r.id} className="card border-amber-300 p-4 dark:border-amber-500/40">
          <div className="flex items-start gap-2">
            <span className="text-lg">🔓</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">Entbannungsanfrage {nameVon(r.user_id)}</div>
              <div className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">{r.nachricht}</div>
              <div className="mt-1 text-[11px] text-slate-400">
                {new Date(r.created_at).toLocaleString("de-DE")}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                const res = await entscheide(r, false);
                setBusy(null);
                if (!res.ok) alert("Fehler: " + res.error);
                laden();
              }}
              className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-bold text-slate-500 dark:border-slate-700"
            >
              Ablehnen
            </button>
            <button
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                const res = await entscheide(r, true);
                setBusy(null);
                if (!res.ok) alert("Fehler: " + res.error);
                laden();
              }}
              className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-bold text-white"
            >
              Entsperren
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
