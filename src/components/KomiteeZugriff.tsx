import { useCallback, useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";

interface Zugriff {
  id: string;
  tag: string;
  user_id: string | null;
  from_tag: string | null;
  mode: "read" | "write";
}

/**
 * Fremdzugriff: Wer darf in ein Komitee schauen, dem er nicht angehört?
 * Entweder eine einzelne Person oder ein ganzes Komitee.
 */
export function KomiteeZugriff() {
  const { profiles, can } = useRole();
  const { students } = useStore();
  const [liste, setListe] = useState<Zugriff[]>([]);
  const [tag, setTag] = useState(COMMITTEES[0]?.slug ?? "");
  const [wer, setWer] = useState("");
  const [modus, setModus] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("committee_access").select("*").order("tag");
    setListe((data as Zugriff[]) || []);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  if (!can("komitees.access")) return null;

  const nameVon = (userId: string) => {
    const p = profiles.find((x) => x.user_id === userId);
    const st = p?.student_id ? students.find((s) => s.id === p.student_id) : null;
    return st ? `${st.vorname} ${st.nachname}` : p?.username || "Unbekannt";
  };

  async function hinzufuegen() {
    if (!tag || !wer) return;
    setBusy(true);
    const eintrag: { tag: string; mode: "read" | "write"; user_id: string | null; from_tag: string | null } = {
      tag,
      mode: modus,
      user_id: wer.startsWith("kom:") ? null : wer,
      from_tag: wer.startsWith("kom:") ? wer.slice(4) : null,
    };
    const { error } = await supabase!.from("committee_access").insert(eintrag);
    setBusy(false);
    if (error) {
      alert("Nicht möglich: " + error.message);
      return;
    }
    setWer("");
    void laden();
  }

  return (
    <section className="card p-4">
      <h3 className="font-bold">Fremdzugriff auf Komitees</h3>
      <p className="mb-3 text-[11px] text-slate-400">
        Lesen = mitlesen. Schreiben = mitreden, abstimmen, To-dos abhaken.
      </p>

      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <select
          className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          {COMMITTEES.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </select>

        <select
          className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-800"
          value={wer}
          onChange={(e) => setWer(e.target.value)}
        >
          <option value="">— wer bekommt Zugriff? —</option>
          <optgroup label="Ganzes Komitee">
            {COMMITTEES.filter((c) => c.slug !== tag).map((c) => (
              <option key={c.slug} value={`kom:${c.slug}`}>{c.label}</option>
            ))}
          </optgroup>
          <optgroup label="Einzelne Person">
            {profiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>{nameVon(p.user_id)}</option>
            ))}
          </optgroup>
        </select>

        <div className="flex gap-1.5">
          <button
            onClick={() => setModus("read")}
            className={`flex-1 rounded-xl border px-2 py-2 text-sm font-bold ${modus === "read" ? "border-brand bg-brand text-white" : "border-slate-200 dark:border-slate-700"}`}
          >
            Lesen
          </button>
          <button
            onClick={() => setModus("write")}
            className={`flex-1 rounded-xl border px-2 py-2 text-sm font-bold ${modus === "write" ? "border-brand bg-brand text-white" : "border-slate-200 dark:border-slate-700"}`}
          >
            Schreiben
          </button>
        </div>
      </div>

      <button
        onClick={hinzufuegen}
        disabled={!wer || busy}
        className="mb-4 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        Zugriff geben
      </button>

      {liste.length === 0 ? (
        <p className="text-sm text-slate-400">Noch kein Fremdzugriff vergeben.</p>
      ) : (
        <div className="grid gap-1.5">
          {liste.map((z) => (
            <div key={z.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <span>{committeeIcon(z.tag)}</span>
              <span className="min-w-0 flex-1 truncate">
                <b>{z.from_tag ? committeeLabel(z.from_tag) : nameVon(z.user_id!)}</b>
                {" darf "}
                {z.mode === "write" ? "schreiben" : "lesen"} in <b>{committeeLabel(z.tag)}</b>
              </span>
              <button
                onClick={async () => {
                  if (!confirm("Zugriff entziehen?")) return;
                  await supabase!.from("committee_access").delete().eq("id", z.id);
                  void laden();
                }}
                className="shrink-0 text-slate-400"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
