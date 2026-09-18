import { useEffect, useState } from "react";
import { useEvents } from "../events-store";
import { useRole } from "../auth/RoleProvider";
import { Avatar } from "./Avatar";
import { committeeLabel } from "../lib/committees";
import { TYPE_META, type EventItem } from "../lib/events";
import { enablePush, pushConfigured, pushPermission } from "../lib/push";

function PushBanner() {
  const [perm, setPerm] = useState(pushPermission());
  const [busy, setBusy] = useState(false);
  if (!pushConfigured() || perm === "granted" || perm === "denied" || perm === "unsupported") return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-3.5">
      <span className="text-sm font-medium text-tinte-matt dark:text-slate-300">
        🔔 Willst du eine Nachricht aufs Handy bekommen, wenn es etwas Neues gibt?
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await enablePush();
          setBusy(false);
          setPerm(pushPermission());
          if (!r.ok && r.error) alert("Hat nicht geklappt: " + r.error);
        }}
        className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
      >
        {busy ? "…" : "Ja, gerne"}
      </button>
    </div>
  );
}

export function EventsTab() {
  const { events, ready, myVotes, voteCounts, voters, reads, vote, deleteEvent, markRead } = useEvents();
  const { canEditData, isStaff } = useRole();

  // Beim Ansehen als gelesen markieren
  useEffect(() => {
    for (const e of events) if (!reads.has(e.id)) markRead(e.id);
  }, [events, reads, markRead]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-tinte-leise">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700 dark:border-t-brand" />
        <div className="text-sm font-medium">Events werden geladen …</div>
      </div>
    );
  }
  if (events.length === 0)
    return (
      <>
        <PushBanner />
        <div className="py-16 text-center text-sm text-tinte-leise">Noch keine Events.</div>
      </>
    );

  return (
    <>
      <PushBanner />
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {events.map((e) => (
        <EventCard
          key={e.id}
          e={e}
          mine={myVotes[e.id] || []}
          counts={voteCounts[e.id] || {}}
          stimmen={voters[e.id] || []}
          canSeeResults={e.poll_show_results || canEditData}
          zeigeWaehler={!e.poll_anon || isStaff}
          canDelete={canEditData}
          onVote={(optId) => vote(e.id, optId, e.poll_multiple)}
          onDelete={() => {
            if (confirm("Dieses Event wirklich löschen?")) void deleteEvent(e.id);
          }}
        />
        ))}
      </div>
    </>
  );
}

function EventCard({
  e,
  mine,
  counts,
  stimmen,
  canSeeResults,
  zeigeWaehler,
  canDelete,
  onVote,
  onDelete,
}: {
  e: EventItem;
  mine: string[];
  counts: Record<string, number>;
  stimmen: { option_id: string; user_id: string }[];
  canSeeResults: boolean;
  /** darf man sehen, WER gestimmt hat? sonst graue Kreise */
  zeigeWaehler: boolean;
  canDelete: boolean;
  onVote: (optionId: string) => void;
  onDelete: () => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const date = new Date(e.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const meta = TYPE_META[e.type];

  return (
    <div className={`card p-4 sm:p-5 ${e.is_warning ? "!border-red-400 bg-red-50/40 dark:bg-red-500/5" : ""}`}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-tinte-leise">
        <span>{e.is_warning ? "⚠️" : meta.icon}</span>
        <span>{e.is_warning ? "Warnung" : meta.label}</span>
        {e.audience === "selected" && <span>· gezielt</span>}
        {e.audience === "komitee" && <span>· {(e.tags || []).map(committeeLabel).join(", ") || "Komitees"}</span>}
        <span className="ml-auto">{date}</span>
        {canDelete && (
          <button onClick={onDelete} className="ml-1 text-tinte-leise hover:text-red-500" aria-label="Löschen">
            🗑
          </button>
        )}
      </div>

      <div className={`text-lg font-bold ${e.is_warning ? "text-red-600 dark:text-red-400" : ""}`}>{e.title}</div>
      {e.body && <div className="mt-1 whitespace-pre-wrap text-[15px] text-tinte-matt dark:text-slate-300">{e.body}</div>}

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
                  picked ? "border-brand" : "border-papier-linie dark:border-slate-700"
                }`}
              >
                {canSeeResults && (
                  <span
                    className="absolute inset-y-0 left-0 bg-brand/10 dark:bg-brand/20"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center border text-[11px] text-white ${e.poll_multiple ? "rounded-md" : "rounded-full"} ${picked ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"}`}>
                    {picked ? "✓" : ""}
                  </span>
                  <span className="flex-1">{o.label}</span>
                  {canSeeResults && <span className="text-xs text-tinte-leise">{c} · {pct}%</span>}
                </span>
                {canSeeResults && c > 0 && (
                  <span className="relative mt-1.5 flex items-center pl-7">
                    {zeigeWaehler
                      ? stimmen
                          .filter((v) => v.option_id === o.id)
                          .slice(0, 12)
                          .map((v, i) => (
                            <span key={v.user_id} style={{ marginLeft: i === 0 ? -28 : -8 }} className="relative">
                              <Avatar userId={v.user_id} size={22} ring />
                            </span>
                          ))
                      : Array.from({ length: Math.min(c, 12) }).map((_, i) => (
                          <span key={i} style={{ marginLeft: i === 0 ? -28 : -8 }} className="relative">
                            <span
                              style={{ width: 22, height: 22 }}
                              className="flex items-center justify-center rounded-full bg-slate-300 text-[10px] font-extrabold leading-none text-tinte-matt ring-2 ring-white dark:bg-slate-600 dark:text-slate-300 dark:ring-slate-900"
                            >
                              ?
                            </span>
                          </span>
                        ))}
                    {c > 12 && <span className="ml-1 text-[11px] font-semibold text-tinte-leise">+{c - 12}</span>}
                  </span>
                )}
              </button>
            );
          })}
          {canSeeResults && <div className="text-xs text-tinte-leise">{total} Stimme{total === 1 ? "" : "n"}</div>}
        </div>
      )}
    </div>
  );
}
