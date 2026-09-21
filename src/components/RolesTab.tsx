import { useMemo, useState } from "react";
import { useNachschub } from "../lib/liste";
import { useVerzoegert } from "../lib/entwurf";
import { normalize } from "../lib/logic";
import { useStore } from "../store";
import { useRole, type Profile, type Role } from "../auth/RoleProvider";
import { useTopics } from "../topics-store";
import { useEltern } from "../eltern-store";
import { COMMITTEES } from "../lib/committees";
import { rolleName } from "../lib/permissions";
import { KontoZeile, Suchfeld } from "./KontoZeile";
import { PersonAnlegenSheet } from "./PersonAnlegenSheet";
// Sperrdauern und die Ist-gesperrt-Frage stehen beim Chat-Knopf – eine Quelle fuer beide.
import { DAUERN, isBanned } from "./MuteKnopf";

/** Reihenfolge im Auswahlfeld. Die Namen kommen zentral aus permissions.ts. */
const ROLLEN_AUSWAHL: Role[] = ["schueler", "sprecher", "stv_sprecher", "stufenteam", "kassenwart", "admin", "eltern"];

/**
 * Elternzugaenge stehen normalerweise nicht in der Rollenliste – sie gehoeren
 * nicht zur Stufe. Ueber die Checkbox ueber der Liste lassen sie sich
 * dazuholen, zum Nachsehen, wer einen Zugang hat und zu wem er gehoert.
 */
const VERSTECKT: Role[] = ["eltern"];

/** Diese beiden Rollen darf nur der Admin vergeben – und je nur einmal. */
const NUR_ADMIN: Role[] = ["sprecher", "stv_sprecher"];

export function RolesTab() {
  const { profiles, setRole, setBan, can, isAdmin, isOp, opUserId, refreshProfiles } = useRole();
  const { zuordnung } = useEltern();
  const [anlegen, setAnlegen] = useState(false);
  const [zeigeEltern, setZeigeEltern] = useState(false);
  const canAssignKom = can("komitees.assign");
  const canTimeout = can("mod.timeout");
  const { students } = useStore();
  const { committeesOf, setUserCommittee } = useTopics();
  const [q, setQ] = useState("");
  const [openKom, setOpenKom] = useState<string | null>(null);
  const [openBan, setOpenBan] = useState<string | null>(null);

  // Nachschlagen statt durchsuchen. Vorher lief fuer jedes der 300 Konten ein
  // students.find() ueber alle 300 Personen – 90.000 Vergleiche je Zeichnung.
  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const nameFor = (studentId: string | null) => {
    const s = studentId ? nachId.get(studentId) : null;
    return s ? `${s.nachname}, ${s.vorname}` : null;
  };

  const suche = useVerzoegert(q, 120);

  // Zu welchen Kindern ein Elternzugang gehoert. Ohne das stuende bei jedem
  // Elternkonto "keiner Person zugeordnet" – richtig ist die Zuordnung nur
  // nicht ueber student_id, sondern ueber parent_children.
  const kinderVon = (p: Profile) =>
    (zuordnung[p.user_id] ?? []).flatMap((id) => {
      const k = nachId.get(id);
      return k ? [`${k.nachname}, ${k.vorname}`] : [];
    });

  const elternAnzahl = useMemo(() => profiles.filter((p) => p.role === "eltern").length, [profiles]);

  const rows = useMemo(() => {
    const norm = normalize(suche);
    return [...profiles]
      .filter((p) => zeigeEltern || !VERSTECKT.includes(p.role))
      .map((p) => {
        const s = p.student_id ? nachId.get(p.student_id) ?? null : null;
        const name = s ? `${s.nachname}, ${s.vorname}` : null;
        const kinder = p.role === "eltern" ? kinderVon(p) : [];
        // Elternkonten laufen unter dem Namen ihres Kindes mit, sonst stuenden
        // sie nach Vornamen sortiert irgendwo zwischen der Stufe.
        return { p, name, kinder, sortier: name ?? kinder[0] ?? p.username ?? "" };
      })
      .filter(({ p, name, kinder }) =>
        !norm || normalize(`${p.username} ${name ?? ""} ${kinder.join(" ")}`).includes(norm))
      .sort((a, b) => a.sortier.localeCompare(b.sortier, "de"));
    // kinderVon haengt an zuordnung und nachId, beide stehen in der Liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, suche, nachId, zeigeEltern, zuordnung]);

  const { sichtbar, marke, rest } = useNachschub(rows.length, [suche, zeigeEltern]);

  return (
    <div>
      {(isAdmin || isOp) && (
        <button
          onClick={() => setAnlegen(true)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/50 py-3 text-[14px] font-bold text-brand"
        >
          + Person hinzufügen
        </button>
      )}
      <PersonAnlegenSheet open={anlegen} onClose={() => setAnlegen(false)} onFertig={refreshProfiles} />
      <Suchfeld wert={q} onChange={setQ} />

      <label className="mb-3 flex cursor-pointer select-none items-center gap-2.5 px-1 text-[13px] font-semibold text-tinte-matt dark:text-slate-300">
        <input
          type="checkbox"
          className="h-5 w-5 accent-brand"
          checked={zeigeEltern}
          onChange={(e) => setZeigeEltern(e.target.checked)}
        />
        Elternzugänge anzeigen ({elternAnzahl})
      </label>

      <div className="grid gap-2.5 [&>*]:min-w-0">
        {rows.slice(0, sichtbar).map(({ p, kinder }) => {
          const koms = committeesOf(p.user_id);
          const banned = isBanned(p);
          const geschuetzt = p.is_op || p.user_id === opUserId;
          return (
            <div key={p.user_id} className="card min-w-0 p-4">
              {/* Zeile 1: Person */}
              <KontoZeile
                profil={p}
                student={p.student_id ? nachId.get(p.student_id) ?? null : null}
                punkt={p.must_change_password === false}
                hinweis={kinder.length ? `Eltern von ${kinder.join(" und ")}` : undefined}
              />

              {/* Zeile 2: Rolle + Komitees + Chat-Sperre nebeneinander */}
              <div className="mt-2.5 flex min-w-0 flex-wrap items-stretch gap-2">
                <select
                  disabled={geschuetzt}
                  title={geschuetzt ? "Diese Rolle kann nicht geändert werden" : undefined}
                  className="h-[42px] w-0 min-w-[8.5rem] flex-1 rounded-xl border border-papier-linie bg-papier-matt px-2.5 font-semibold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
                  value={p.role}
                  onChange={(e) => setRole(p.user_id, e.target.value as Role)}
                >
                  {ROLLEN_AUSWAHL
                    .filter((r) => isAdmin || !NUR_ADMIN.includes(r) || p.role === r)
                    .map((r) => {
                      const vergeben = NUR_ADMIN.includes(r) && profiles.some((x) => x.role === r && x.user_id !== p.user_id);
                      return (
                        <option key={r} value={r} disabled={vergeben}>
                          {rolleName(r)}
                          {vergeben ? " (schon vergeben)" : ""}
                        </option>
                      );
                    })}
                </select>

                {canAssignKom && (
                  <div className="relative w-0 min-w-[7rem] flex-1">
                    <button
                      onClick={() => setOpenKom(openKom === p.user_id ? null : p.user_id)}
                      className="flex h-[42px] w-full items-center gap-1.5 rounded-xl border border-papier-linie bg-papier-matt px-3 font-semibold dark:border-slate-700 dark:bg-slate-800"
                    >
                      <span className="truncate text-tinte-matt dark:text-slate-300">Komitees</span>
                      {koms.length > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-white">{koms.length}</span>
                      )}
                      <span className="ml-auto text-tinte-leise">▾</span>
                    </button>
                    {openKom === p.user_id && (
                      <>
                        <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenKom(null)} aria-label="Schließen" />
                        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-papier-linie bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          {COMMITTEES.map((c) => {
                            const on = koms.includes(c.slug);
                            return (
                              <button
                                key={c.slug}
                                onClick={() => setUserCommittee(p.user_id, c.slug, !on)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-papier-matt dark:hover:bg-slate-800"
                              >
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs text-white ${on ? "border-brand bg-brand" : "border-papier-linie dark:border-slate-600"}`}>{on ? "✓" : ""}</span>
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {canTimeout && !geschuetzt && (
                  <div className={`relative shrink-0 ${canAssignKom ? "" : "ml-auto"}`}>
                    <button
                      onClick={() => (banned ? setBan(p.user_id, null, false) : setOpenBan(openBan === p.user_id ? null : p.user_id))}
                      title={banned ? "Sperre aufheben" : "Vom Chat sperren"}
                      className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl border text-lg transition ${
                        banned
                          ? "border-red-300 bg-red-500/10 text-red-500"
                          : "border-papier-linie text-tinte-leise hover:text-tinte-matt dark:border-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      {banned ? "🚫" : "💬"}
                    </button>
                    {openBan === p.user_id && !banned && (
                      <>
                        <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenBan(null)} aria-label="Schließen" />
                        <div className="absolute right-0 z-30 mt-1 w-40 rounded-xl border border-papier-linie bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-tinte-leise">Sperren für</div>
                          {DAUERN.map((d) => (
                            <button
                              key={d.label}
                              onClick={() => {
                                setOpenBan(null);
                                void setBan(
                                  p.user_id,
                                  d.ms ? new Date(Date.now() + d.ms).toISOString() : null,
                                  d.ms === null,
                                );
                              }}
                              className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-papier-matt dark:hover:bg-slate-800"
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {canTimeout && geschuetzt && (
                  <span
                    title="Dieses Konto kann nicht gesperrt werden"
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-papier-linie text-lg text-tinte-leise opacity-40 dark:border-slate-700 ${
                      canAssignKom ? "" : "ml-auto"
                    }`}
                  >
                    💬
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {rest > 0 && (
          <div ref={marke} className="py-6 text-center text-[12px] text-tinte-leise">
            lädt weitere … ({rest} übrig)
          </div>
        )}
        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-tinte-leise">
            Noch keine Konten. Sobald Konten angelegt sind, erscheinen sie hier.
          </div>
        )}
      </div>
    </div>
  );
}
