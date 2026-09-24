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
import { KinderSheet } from "./KinderSheet";
import { Icon } from "./Icon";
import { Schalter } from "./Schalter";
// Sperrdauern und die Ist-gesperrt-Frage stehen beim Chat-Knopf – eine Quelle fuer beide.
import { DAUERN, isBanned } from "./MuteKnopf";

/** Reihenfolge im Auswahlfeld. Die Namen kommen zentral aus permissions.ts. */
const ROLLEN_AUSWAHL: Role[] = ["schueler", "sprecher", "stv_sprecher", "stufenteam", "kassenwart", "admin", "eltern"];

/**
 * Elternzugaenge stehen normalerweise nicht in der Rollenliste – sie gehoeren
 * nicht zur Stufe. Ueber den Schalter ueber der Liste lassen sie sich
 * dazuholen – zum Nachsehen und um ihnen ihre Kinder zuzuordnen.
 */
const VERSTECKT: Role[] = ["eltern"];

/**
 * Diese Rollen darf nur der Admin vergeben – und nur der Admin wieder
 * entziehen. Sonst koennte man einen Admin erst herunterstufen und dann
 * ersetzen. Dieselbe Liste steht in supabase/rollen-nur-admin.sql; dort
 * haelt sie der Trigger durch, hier graut sie das Auswahlfeld aus.
 */
const NUR_ADMIN: Role[] = ["sprecher", "stv_sprecher", "admin", "kassenwart", "eltern"];

/** Und diese beiden gibt es in der Stufe genau einmal. */
const NUR_EINMAL: Role[] = ["sprecher", "stv_sprecher"];

export function RolesTab() {
  const { profiles, setRole, setBan, can, isAdmin, isOp, opUserId, refreshProfiles } = useRole();
  const { zuordnung } = useEltern();
  const [anlegen, setAnlegen] = useState(false);
  const [zeigeEltern, setZeigeEltern] = useState(false);
  const canAssignKom = can("komitees.assign");
  const canTimeout = can("mod.timeout");
  const { students, reload } = useStore();
  const { committeesOf, setUserCommittee } = useTopics();
  const [q, setQ] = useState("");
  const [openKom, setOpenKom] = useState<string | null>(null);
  const [openBan, setOpenBan] = useState<string | null>(null);
  // Elternzugang, dessen Kinder gerade bearbeitet werden
  const [kinderFuer, setKinderFuer] = useState<Profile | null>(null);
  // Kinder ordnet nur zu, wer auch Elternzugaenge vergeben darf: der Admin.
  const darfKinder = isAdmin || isOp;

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
      return k ? [k] : [];
    });

  const elternAnzahl = useMemo(() => profiles.filter((p) => p.role === "eltern").length, [profiles]);

  const rows = useMemo(() => {
    const norm = normalize(suche);
    return [...profiles]
      .filter((p) => zeigeEltern || !VERSTECKT.includes(p.role))
      .map((p) => {
        const s = p.student_id ? nachId.get(p.student_id) ?? null : null;
        const name = s ? `${s.nachname}, ${s.vorname}` : null;
        // Anzeige "Lena Bauer", sortiert wird nach "Bauer, Lena"
        const kinder = p.role === "eltern" ? kinderVon(p).map((k) => `${k.vorname} ${k.nachname}`) : [];
        const erstesKind = p.role === "eltern" ? kinderVon(p)[0] : undefined;
        // Elternkonten laufen unter dem Namen ihres Kindes mit, sonst stuenden
        // sie nach Vornamen sortiert irgendwo zwischen der Stufe.
        const sortier = name ?? (erstesKind ? `${erstesKind.nachname}, ${erstesKind.vorname}` : p.username ?? "");
        return { p, name, kinder, sortier };
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
          className="btn-grau mb-3 gap-2 !text-[15px]"
        >
          <Icon name="plus" size={18} strich={2.4} />
          Person hinzufügen
        </button>
      )}
      <PersonAnlegenSheet
        open={anlegen}
        onClose={() => setAnlegen(false)}
        onFertig={() => {
          // Konten UND Personen neu holen – sonst fehlt der neuen Person bis zum
          // nächsten Neuladen der Name, und sie steht nur als Nutzername da.
          refreshProfiles();
          reload();
        }}
      />
      <Suchfeld wert={q} onChange={setQ} />

      {/* Umschalter wie in den iOS-Einstellungen */}
      <label className="card mb-3 flex min-h-[2.75rem] cursor-pointer select-none items-center gap-3 px-4 py-2 text-[15px]">
        <span className="min-w-0 flex-1">
          Elternzugänge anzeigen
          <span className="ml-1.5 text-tinte-leise">{elternAnzahl}</span>
        </span>
        <Schalter an={zeigeEltern} onChange={setZeigeEltern} />
      </label>

      <div className="grid gap-2.5 [&>*]:min-w-0">
        {rows.slice(0, sichtbar).map(({ p, kinder }) => {
          const koms = committeesOf(p.user_id);
          const banned = isBanned(p);
          const geschuetzt = p.is_op || p.user_id === opUserId;
          // Ohne Admin-Rolle auch nicht weg von einer Admin-Rolle – genau so
          // haelt es der Trigger in der Datenbank.
          const rolleGesperrt = geschuetzt || (!isAdmin && NUR_ADMIN.includes(p.role));
          const istEltern = p.role === "eltern";
          const feld =
            "h-11 rounded-xl border border-transparent bg-[rgb(118_118_128/0.12)] font-semibold transition dark:bg-[rgb(118_118_128/0.24)]";
          return (
            <div key={p.user_id} className="card min-w-0 p-4">
              {/* Zeile 1: Person */}
              <KontoZeile
                profil={p}
                student={p.student_id ? nachId.get(p.student_id) ?? null : null}
                punkt={p.must_change_password === false}
                hinweis={
                  istEltern
                    ? kinder.length
                      ? kinder.join(" und ")
                      : "kein Kind zugeordnet – sieht nichts"
                    : undefined
                }
                hinweisWarnt={istEltern && kinder.length === 0}
              />

              {/* Zeile 2: Rolle + Komitees (bei Eltern: Kinder) + Chat-Sperre */}
              <div className="mt-3 flex min-w-0 flex-wrap items-stretch gap-2">
                <select
                  disabled={rolleGesperrt}
                  aria-label="Rolle"
                  title={
                    geschuetzt
                      ? "Diese Rolle kann nicht geändert werden"
                      : rolleGesperrt
                        ? "Diese Rolle darf nur der Admin ändern"
                        : undefined
                  }
                  className={`${feld} w-0 min-w-[8.5rem] flex-1 px-3 disabled:opacity-50`}
                  value={p.role}
                  onChange={(e) => {
                    const neu = e.target.value as Role;
                    // Eltern zu Stufenteam oder umgekehrt ist fast immer ein Versehen
                    const heikel = p.role === "eltern" || neu === "eltern" || neu === "admin";
                    if (heikel && !confirm(`${p.username ?? "Dieses Konto"} wirklich zu „${rolleName(neu)}“ machen?`)) return;
                    void setRole(p.user_id, neu);
                  }}
                >
                  {ROLLEN_AUSWAHL
                    .filter((r) => isAdmin || !NUR_ADMIN.includes(r) || p.role === r)
                    .map((r) => {
                      const vergeben = NUR_EINMAL.includes(r) && profiles.some((x) => x.role === r && x.user_id !== p.user_id);
                      return (
                        <option key={r} value={r} disabled={vergeben}>
                          {rolleName(r)}
                          {vergeben ? " (schon vergeben)" : ""}
                        </option>
                      );
                    })}
                </select>

                {/* Eltern haben keine Komitees – dort waehlt man stattdessen die Kinder. */}
                {istEltern ? (
                  <button
                    onClick={() => setKinderFuer(p)}
                    className={`${feld} flex w-0 min-w-[7rem] flex-1 items-center gap-2 px-3 text-left active:scale-[.98] ${
                      kinder.length === 0 ? "!border-offen/40 !bg-offen-grund text-offen" : ""
                    }`}
                  >
                    <Icon name="kind" size={17} />
                    <span className="min-w-0 flex-1 truncate">
                      {kinder.length === 0 ? (darfKinder ? "Kind wählen" : "Kein Kind") : kinder.length === 1 ? "1 Kind" : `${kinder.length} Kinder`}
                    </span>
                    <span className="hidden text-tinte-leise min-[400px]:inline">
                      <Icon name="chevron" size={15} />
                    </span>
                  </button>
                ) : (
                  canAssignKom && (
                    <div className="relative w-0 min-w-[7rem] flex-1">
                      <button
                        onClick={() => setOpenKom(openKom === p.user_id ? null : p.user_id)}
                        className={`${feld} flex w-full items-center gap-1.5 px-3`}
                      >
                        <span className="truncate text-tinte-matt dark:text-slate-300">Komitees</span>
                        {koms.length > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">{koms.length}</span>
                        )}
                        <span className="ml-auto text-tinte-leise">▾</span>
                      </button>
                      {openKom === p.user_id && (
                        <>
                          <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenKom(null)} aria-label="Schließen" />
                          <div className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 animate-popIn overflow-y-auto rounded-2xl border border-black/[0.06] bg-white/95 p-1.5 shadow-glas backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/95">
                            {COMMITTEES.map((c) => {
                              const on = koms.includes(c.slug);
                              return (
                                <button
                                  key={c.slug}
                                  onClick={() => setUserCommittee(p.user_id, c.slug, !on)}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[15px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                                >
                                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                                  <span className={`text-brand transition ${on ? "opacity-100" : "opacity-0"}`}>
                                    <Icon name="haken" size={18} strich={2.5} />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )
                )}

                {/* Eltern schreiben in keinem Chat – da gibt es nichts zu sperren. */}
                {canTimeout && !geschuetzt && !istEltern && (
                  <div className={`relative shrink-0 ${canAssignKom ? "" : "ml-auto"}`}>
                    <button
                      onClick={() => (banned ? setBan(p.user_id, null, false) : setOpenBan(openBan === p.user_id ? null : p.user_id))}
                      title={banned ? "Sperre aufheben" : "Vom Chat sperren"}
                      aria-label={banned ? "Sperre aufheben" : "Vom Chat sperren"}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border text-lg transition active:scale-95 ${
                        banned
                          ? "border-red-300 bg-red-500/10 text-red-500"
                          : "border-transparent bg-[rgb(118_118_128/0.12)] text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]"
                      }`}
                    >
                      {banned ? "🚫" : "💬"}
                    </button>
                    {openBan === p.user_id && !banned && (
                      <>
                        <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenBan(null)} aria-label="Schließen" />
                        <div className="absolute right-0 z-30 mt-1.5 w-44 animate-popIn rounded-2xl border border-black/[0.06] bg-white/95 p-1.5 shadow-glas backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/95">
                          <div className="px-2.5 py-1 text-[12px] font-semibold text-tinte-leise">Sperren für</div>
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
                              className="w-full rounded-xl px-2.5 py-2 text-left text-[15px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {canTimeout && geschuetzt && !istEltern && (
                  <span
                    title="Dieses Konto kann nicht gesperrt werden"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(118_118_128/0.12)] text-lg opacity-40 ${
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

      {kinderFuer && (
        <KinderSheet profil={kinderFuer} darf={darfKinder} onClose={() => setKinderFuer(null)} />
      )}
    </div>
  );
}
