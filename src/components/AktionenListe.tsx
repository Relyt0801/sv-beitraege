import { useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { useProfiles } from "../profiles-store";
import { prozentVon } from "../lib/logic";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { abHeute, tagLang, uhr, zeitText, type Aktion, type Termin } from "../lib/termine";

import { frage } from "../lib/melder";
/**
 * Die ausgeschriebenen Aktionen im Events-Reiter.
 *
 * Für alle: sehen, wann Waffelverkauf ist, und sich eintragen.
 * Fürs Stufenteam: sehen, wer sich gemeldet hat – mit Mithilfe-Prozent, damit
 * die Schichten dahin gehen, wo noch wenig zusammengekommen ist.
 */
export function AktionenListe() {
  const { termine, aktionen, bewerbungen, bewerben, meineUid, meineStudentIds } = useTermine();
  const { isStaff, can } = useRole();
  const darfVerteilen = isStaff || can("termine.manage");
  const [schicht, setSchicht] = useState<Termin | null>(null);

  const nachAktion = useMemo(() => {
    const m = new Map<string, Termin[]>();
    for (const t of abHeute(termine)) {
      if (!t.aktion_id) continue;
      const l = m.get(t.aktion_id) || [];
      l.push(t);
      m.set(t.aktion_id, l);
    }
    return m;
  }, [termine]);

  const laufende = aktionen.filter((a) => (nachAktion.get(a.id) || []).length > 0);
  if (laufende.length === 0) return null;

  // Damit das aufgeklappte Blatt immer die frischen Bewerbungen zeigt
  const aktuelleSchicht = schicht ? termine.find((t) => t.id === schicht.id) ?? schicht : null;

  return (
    <>
      <section className="mb-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-tinte-leise">
          Mitmachen
        </h3>
        <div className="grid items-start gap-2.5 lg:grid-cols-2">
          {laufende.map((a) => (
            <AktionKarte
              key={a.id}
              aktion={a}
              schichten={nachAktion.get(a.id) || []}
              gesamt={(nachAktion.get(a.id) || []).length}
              bewerbungen={bewerbungen}
              meineUid={meineUid}
              meineStudentIds={meineStudentIds}
              darfVerteilen={darfVerteilen}
              onEintragen={bewerben}
              onOeffnen={setSchicht}
            />
          ))}
        </div>
      </section>

      {aktuelleSchicht && (
        <SchichtSheet
          schicht={aktuelleSchicht}
          aktion={aktionen.find((a) => a.id === aktuelleSchicht.aktion_id) || null}
          onSchliessen={() => setSchicht(null)}
        />
      )}
    </>
  );
}

function AktionKarte({
  aktion, schichten, gesamt, bewerbungen, meineUid, meineStudentIds, darfVerteilen, onEintragen, onOeffnen,
}: {
  meineStudentIds: string[];
  aktion: Aktion;
  schichten: Termin[];
  gesamt: number;
  bewerbungen: Record<string, string[]>;
  meineUid: string | null;
  darfVerteilen: boolean;
  onEintragen: (id: string, an: boolean) => void;
  onOeffnen: (t: Termin) => void;
}) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? schichten : schichten.slice(0, 4);
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{aktion.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight">{aktion.titel}</div>
          <div className="mt-0.5 text-[12px] text-tinte-leise">
            zählt als <span className="font-semibold text-brand">+{aktion.prozent} %</span> Mithilfe
            {gesamt > 4 && ` · ${gesamt} Termine`}
          </div>
        </div>
      </div>

      <ul className="mt-3 grid gap-1.5">
        {sichtbar.map((t) => {
          const gemeldet = bewerbungen[t.id] || [];
          const ich = Boolean(meineUid && gemeldet.includes(meineUid));
          const belegt = t.personen.length;
          const plaetze = t.plaetze ?? 1;
          const voll = belegt >= plaetze;
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-papier-matt px-3 py-2 dark:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{tagLang(t.datum)}</span>
                <span className="block truncate text-[11px] text-tinte-leise">
                  {[zeitText(t), t.ort].filter(Boolean).join(" · ")}
                </span>
              </span>

              <span
                className={`zahl shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  voll
                    ? "bg-bezahlt-grund text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300"
                    : "bg-white text-tinte-matt dark:bg-slate-900 dark:text-slate-300"
                }`}
                title={voll ? "Alle Plätze sind vergeben" : "eingeteilt von Plätzen"}
              >
                {voll ? `voll · ${belegt}/${plaetze}` : `${belegt}/${plaetze}`}
              </span>

              {darfVerteilen ? (
                <button
                  onClick={() => onOeffnen(t)}
                  className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-bold text-white transition active:scale-95"
                >
                  {gemeldet.length > 0 ? `${gemeldet.length} gemeldet` : "verteilen"}
                </button>
              ) : t.personen.some((sid) => meineStudentIds.includes(sid)) ? (
                <span className="shrink-0 rounded-lg bg-bezahlt-grund px-2.5 py-1.5 text-[12px] font-bold text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300">
                  du bist eingeteilt ✓
                </span>
              ) : voll && !ich ? (
                <span className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-tinte-leise">
                  voll belegt
                </span>
              ) : (
                <button
                  onClick={() => onEintragen(t.id, !ich)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition active:scale-95 ${
                    ich
                      ? "border border-brand text-brand"
                      : "bg-brand text-white"
                  }`}
                >
                  {ich ? "eingetragen ✓" : "eintragen"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {schichten.length > 4 && (
        <button
          onClick={() => setAlle(!alle)}
          className="mt-2 w-full rounded-lg py-1.5 text-[12px] font-bold text-brand"
        >
          {alle ? "weniger anzeigen" : `alle ${schichten.length} Termine anzeigen`}
        </button>
      )}
    </div>
  );
}

/**
 * Eine Schicht verteilen.
 *
 * Die Gemeldeten stehen nach Mithilfe-Prozent sortiert – wer am wenigsten hat,
 * steht oben. So geht die Schicht dahin, wo sie am meisten bringt, statt an
 * den, der am schnellsten getippt hat.
 */
function SchichtSheet({
  schicht, aktion, onSchliessen,
}: {
  schicht: Termin;
  aktion: Aktion | null;
  onSchliessen: () => void;
}) {
  const { termine, aktionen, bewerbungen, zuteilen, bewerben, bewerbungEntfernen, loeschen } = useTermine();
  const [suche, setSuche] = useState("");
  const { profiles } = useRole();
  const { students, punkte, settings } = useStore();
  const { profile } = useProfiles();

  const plaetze = schicht.plaetze ?? 1;
  const gemeldet = bewerbungen[schicht.id] || [];

  const studentVon = useMemo(() => {
    const m = new Map<string, string>(); // user_id -> student_id
    for (const p of profiles) if (p.student_id) m.set(p.user_id, p.student_id);
    return m;
  }, [profiles]);

  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Punkte, die schon "unterwegs" sind: wer in anderen, noch nicht
  // abgeschlossenen Schichten eingeteilt ist, bekommt sie ja noch. Ohne das
  // stünde jemand mit drei geplanten Schichten weiter ganz oben.
  const eingeplant = useMemo(() => {
    const prozent = new Map(aktionen.map((a) => [a.id, a.prozent]));
    const m: Record<string, number> = {};
    for (const t of termine) {
      if (t.id === schicht.id || !t.aktion_id || t.abschluss) continue;
      const p = prozent.get(t.aktion_id) || 0;
      if (!p) continue;
      for (const sid of t.personen) m[sid] = (m[sid] || 0) + p;
    }
    return m;
  }, [termine, aktionen, schicht.id]);

  const liste = useMemo(() => {
    const zeilen = gemeldet.map((uid) => {
      const sid = studentVon.get(uid) || null;
      const s = sid ? nachId.get(sid) : null;
      return {
        uid,
        sid,
        name: s ? `${s.nachname}, ${s.vorname}` : profile[uid]?.anzeigename || "Unbekannt",
        prozent: sid ? prozentVon((punkte[sid] || 0) + (eingeplant[sid] || 0), settings) : 0,
        geplant: sid ? eingeplant[sid] || 0 : 0,
        zugeteilt: Boolean(sid && schicht.personen.includes(sid)),
      };
    });
    // Wenig Mithilfe zuerst, bereits Zugeteilte oben drüber
    return zeilen.sort(
      (a, b) => Number(b.zugeteilt) - Number(a.zugeteilt) || a.prozent - b.prozent || a.name.localeCompare(b.name, "de"),
    );
  }, [gemeldet, studentVon, nachId, profile, punkte, settings, schicht.personen, eingeplant]);

  // Zugeteilte, die sich nie gemeldet haben (vom Team direkt gesetzt)
  const ohneMeldung = schicht.personen.filter((sid) => !liste.some((z) => z.sid === sid));

  return (
    <Sheet open onClose={onSchliessen}>
      <div className="mb-3 flex items-start gap-3">
        <span className="text-2xl leading-none">{aktion?.icon || "📌"}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-zahl text-[1.15rem] font-extrabold leading-tight tracking-[-0.02em]">
            {schicht.titel}
          </span>
          <span className="mt-0.5 block text-[12px] text-tinte-leise">
            {tagLang(schicht.datum)} · {zeitText(schicht)}
            {schicht.ort && ` · ${schicht.ort}`}
          </span>
        </span>
        <button className="iconbtn shrink-0" onClick={onSchliessen} aria-label="Schließen">
          ✕
        </button>
      </div>

      <div
        className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 ${
          schicht.personen.length >= plaetze
            ? "bg-bezahlt-grund text-bezahlt dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-papier-matt dark:bg-slate-800"
        }`}
      >
        <span className="text-[13px] font-semibold">
          {schicht.personen.length >= plaetze ? "Voll belegt ✓" : "Eingeteilt"}
        </span>
        <span className="zahl ml-auto text-[15px] font-extrabold">
          {schicht.personen.length} / {plaetze}
        </span>
      </div>
      {schicht.personen.length >= plaetze && (
        <p className="-mt-1.5 mb-3 text-[11px] leading-relaxed text-tinte-leise">
          Alle Plätze sind vergeben. Wer eingeteilt ist, lässt sich mit „eingeteilt ✓" wieder austragen.
        </p>
      )}

      {liste.length === 0 && ohneMeldung.length === 0 ? (
        <p className="rounded-xl border border-dashed border-papier-linie py-8 text-center text-[13px] text-tinte-leise dark:border-slate-700">
          Noch hat sich niemand gemeldet.
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold text-tinte-matt">Gemeldet</h3>
            <span className="text-[11px] text-tinte-leise">wenig Mithilfe zuerst · geplante Schichten zählen mit</span>
          </div>
          <ul className="grid gap-1.5">
            {liste.map((z) => (
              <li
                key={z.uid}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                  z.zugeteilt ? "bg-brand/10 dark:bg-brand/20" : "bg-papier-matt dark:bg-slate-800/60"
                }`}
              >
                <Avatar userId={z.uid} name={z.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{z.name}</span>
                  <span className="block text-[11px] text-tinte-leise">
                    <span className="zahl font-semibold">{z.prozent} %</span> Mithilfe
                    {z.geplant > 0 && <span> · davon {z.geplant} % eingeplant</span>}
                  </span>
                </span>
                <button
                  disabled={!z.sid || (!z.zugeteilt && schicht.personen.length >= plaetze)}
                  onClick={() => z.sid && zuteilen(schicht.id, z.sid, !z.zugeteilt)}
                  className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition active:scale-95 disabled:opacity-40 ${
                    z.zugeteilt ? "border border-brand text-brand" : "bg-brand text-white"
                  }`}
                >
                  {z.zugeteilt ? "eingeteilt ✓" : "einteilen"}
                </button>
                <button
                  onClick={async () => {
                    if (!(await frage(`${z.name} von der Meldung für diese Schicht streichen?`, "Streichen", true))) return;
                    if (z.zugeteilt && z.sid) void zuteilen(schicht.id, z.sid, false);
                    void bewerbungEntfernen(schicht.id, z.uid);
                  }}
                  className="shrink-0 rounded-lg px-1.5 py-1 text-[15px] leading-none text-tinte-leise hover:text-red-500"
                  aria-label="Meldung streichen"
                  title="Meldung streichen"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {ohneMeldung.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1.5 text-[13px] font-semibold text-tinte-matt">Direkt eingeteilt</h3>
          <ul className="grid gap-1.5">
            {ohneMeldung.map((sid) => {
              const st = nachId.get(sid);
              return (
                <li key={sid} className="flex items-center gap-2.5 rounded-xl bg-brand/10 px-2.5 py-2 dark:bg-brand/20">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {st ? `${st.nachname}, ${st.vorname}` : "Unbekannt"}
                  </span>
                  <button
                    onClick={() => void zuteilen(schicht.id, sid, false)}
                    className="shrink-0 rounded-lg border border-red-300 px-2.5 py-1 text-[12px] font-bold text-red-500 dark:border-red-500/40"
                  >
                    austragen
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Jemanden einteilen, der sich nicht gemeldet hat */}
      {schicht.personen.length < plaetze && (
        <div className="mt-3">
          <input
            className="field"
            placeholder="Jemanden direkt einteilen – Name suchen …"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          {suche.trim().length >= 2 && (
            <ul className="mt-1.5 grid max-h-44 gap-1 overflow-y-auto">
              {students
                .filter(
                  (st) =>
                    !schicht.personen.includes(st.id) &&
                    `${st.vorname} ${st.nachname}`.toLowerCase().includes(suche.trim().toLowerCase()),
                )
                .slice(0, 8)
                .map((st) => (
                  <li key={st.id}>
                    <button
                      onClick={() => {
                        void zuteilen(schicht.id, st.id, true);
                        setSuche("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg bg-papier-matt px-2.5 py-2 text-left text-[13px] font-semibold dark:bg-slate-800"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {st.nachname}, {st.vorname}
                      </span>
                      <span className="zahl shrink-0 text-[11px] text-tinte-leise">
                        {prozentVon((punkte[st.id] || 0) + (eingeplant[st.id] || 0), settings)} %
                      </span>
                      <span className="shrink-0 text-brand">+ einteilen</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-tinte-leise">
        Wer eingeteilt ist, sieht die Schicht als „für dich" im eigenen Kalender.
      </p>

      <button className="btn-primary mt-4" onClick={onSchliessen}>
        Fertig
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={() => bewerben(schicht.id, true)}
          className="text-[12px] font-semibold text-tinte-leise"
        >
          Mich selbst dazu melden
        </button>
        <button
          onClick={async () => {
            if (await frage(`Diese Schicht am ${tagLang(schicht.datum)} ganz löschen? Eingeteilte verlieren sie aus dem Kalender.`, "Löschen", true)) {
              void loeschen(schicht.id);
              onSchliessen();
            }
          }}
          className="text-[12px] font-bold text-red-500"
        >
          Schicht löschen
        </button>
      </div>
    </Sheet>
  );
}
