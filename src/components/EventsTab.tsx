import { useEffect } from "react";
import { useEvents } from "../events-store";
import { useRole } from "../auth/RoleProvider";
import { TYPE_META, type EventItem } from "../lib/events";

export function EventsTab() {
  const { events, ready, myVotes, voteCounts, reads, vote, deleteEvent, markRead } = useEvents();
  const { canEditData } = useRole();

  // Beim Ansehen als gelesen markieren
  useEffect(() => {
    for (const e of events) if (!reads.has(e.id)) markRead(e.id);
  }, [events, reads, markRead]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-300 border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Events werden geladen …</div>
      </div>
    );
  }
  if (events.length === 0)
    return <div className="py-16 text-center text-sm text-slate-400">Noch keine Events.</div>;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {events.map((e) => (
        <EventCard
          key={e.id}
          e={e}
          mine={myVotes[e.id] || []}
          counts={voteCounts[e.id] || {}}
          canSeeResults={e.poll_show_results || canEditData}
          canDelete={canEditData}
          onVote={(optId) => vote(e.id, optId, e.poll_multiple)}
          onDelete={() => {
            if (confirm("Dieses Event wirklich löschen?")) void deleteEvent(e.id);
          }}
        />
      ))}
    </div>
  );
}

function EventCard({
  e,
  mine,
  counts,
  canSeeResults,
  canDelete,
  onVote,
  onDelete,
}: {
  e: EventItem;
  mine: string[];
  counts: Record<string, number>;
  canSeeResults: boolean;
  canDelete: boolean;
  onVote: (optionId: string) => void;
  onDelete: () => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const date = new Date(e.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const meta = TYPE_META[e.type];

  return (
    <div className={`card p-4 sm:p-5 ${e.is_warning ? "!border-red-400 bg-red-50/40 dark:bg-red-500/5" : ""}`}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>{e.is_warning ? "⚠️" : meta.icon}</span>
        <span>{e.is_warning ? "Warnung" : meta.label}</span>
        {e.audience === "selected" && <span>· gezielt</span>}
        <span className="ml-auto">{date}</span>
        {canDelete && (
          <button onClick={onDelete} className="ml-1 text-slate-400 hover:text-red-500" aria-label="Löschen">
            🗑
          </button>
        )}
      </div>

      <div className={`text-lg font-bold ${e.is_warning ? "text-red-600 dark:text-red-400" : ""}`}>{e.title}</div>
      {e.body && <div className="mt-1 whitespace-pre-wrap text-[15px] text-slate-600 dark:text-slate-300">{e.body}</div>}

      {e.type === "umfrage" && (
        <div className="mt-3 flex flex-col gap-2">
          {e.options.map((o) => {
            const c = counts[o.id] || 0;
            const pct = total > 0 ? Math.round((c / total) * 100) : 0;
            const picked = mine.includes(o.id);
            return (
              <button
                key={o.id}
                onClick={() => onVote(o.id)}
                className={`relative overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                  picked ? "border-brand" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {canSeeResults && (
                  <span
                    className="absolute inset-y-0 left-0 bg-brand/10 dark:bg-brand/20"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center border text-[11px] text-white ${e.poll_multiple ? "rounded-md" : "rounded-full"} ${picked ? "border-brand bg-brand" : "border-slate-300 dark:border-slate-600"}`}>
                    {picked ? "✓" : ""}
                  </span>
                  <span className="flex-1">{o.label}</span>
                  {canSeeResults && <span className="text-xs text-slate-400">{c} · {pct}%</span>}
                </span>
              </button>
            );
          })}
          {canSeeResults && <div className="text-xs text-slate-400">{total} Stimme{total === 1 ? "" : "n"}</div>}
        </div>
      )}
    </div>
  );
}
