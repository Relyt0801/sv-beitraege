import { useState } from "react";
import { useTopics } from "../topics-store";
import { COMMITTEES, committeeLabel } from "../lib/committees";

// Jede Person kann sich EINMAL selbst einem Komitee zuweisen (danach nur noch das Stufenteam).
export function MyCommittee() {
  const { committeesOf, uid, selfAssignCommittee } = useTopics();
  const mine = committeesOf(uid);
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);

  if (mine.length) {
    return (
      <div className="col-span-2 flex flex-col gap-1.5 border-t border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 sm:col-span-4">
        Mein Komitee
        <div className="flex flex-wrap items-center gap-1.5 normal-case">
          {mine.map((s) => (
            <span key={s} className="rounded-full bg-brand/15 px-2.5 py-1 text-sm font-bold text-brand">{committeeLabel(s)}</span>
          ))}
          <span className="text-[11px] font-normal text-slate-400">festgelegt – Änderung nur über das Stufenteam</span>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-2 flex flex-col gap-1.5 border-t border-slate-200 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 sm:col-span-4">
      Mein Komitee wählen
      <div className="flex flex-wrap items-center gap-2 normal-case">
        <select
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          <option value="">— Komitee wählen —</option>
          {COMMITTEES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
        <button
          disabled={!sel || busy}
          onClick={async () => {
            if (!sel) return;
            if (!confirm(`Dich dem Komitee „${committeeLabel(sel)}" zuweisen?\n\n⚠️ Achtung: Das kannst du danach NICHT mehr selbst ändern – nur das Stufenteam.`)) return;
            setBusy(true);
            const ok = await selfAssignCommittee(sel);
            setBusy(false);
            if (!ok) alert("Zuweisung nicht möglich.");
          }}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {busy ? "…" : "Festlegen"}
        </button>
        <span className="text-[11px] font-normal text-slate-400">⚠️ danach nicht mehr änderbar</span>
      </div>
    </div>
  );
}
