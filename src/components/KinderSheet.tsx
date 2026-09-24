import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useEltern } from "../eltern-store";
import { normalize } from "../lib/logic";
import type { Profile } from "../auth/RoleProvider";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { useRole } from "../auth/RoleProvider";

/**
 * Welche Kinder gehoeren zu einem Elternzugang?
 *
 * Ersetzt bei Elternkonten die Komitee-Auswahl im Rollen-Reiter. Ein Tipp
 * auf eine Person ordnet sie zu oder nimmt sie wieder weg – sofort
 * gespeichert. Ein Zugang ohne Kind sieht in der App gar nichts.
 */
export function KinderSheet({
  profil,
  darf,
  onClose,
}: {
  profil: Profile | null;
  /** Nur der Admin ordnet zu; alle anderen sehen die Zuordnung nur. */
  darf: boolean;
  onClose: () => void;
}) {
  const { students } = useStore();
  const { zuordnung, kindZuordnen } = useEltern();
  const { userByStudent } = useRole();
  const [q, setQ] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const meine = profil ? zuordnung[profil.user_id] ?? [] : [];
  const nachId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // Zu welchen anderen Elternzugaengen ein Kind schon gehoert – als Hinweis.
  const auchBei = useMemo(() => {
    const m = new Map<string, number>();
    for (const [uid, ids] of Object.entries(zuordnung)) {
      if (uid === profil?.user_id) continue;
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [zuordnung, profil]);

  const liste = useMemo(() => {
    const n = normalize(q);
    return [...students]
      .filter((s) => !n || normalize(`${s.nachname} ${s.vorname} ${s.vorname} ${s.nachname}`).includes(n))
      .sort((a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));
  }, [students, q]);

  if (!profil) return null;

  async function umschalten(id: string) {
    if (!darf || !profil) return;
    setFehler("");
    setBusy(id);
    const f = await kindZuordnen(profil.user_id, id, !meine.includes(id));
    setBusy(null);
    if (f) setFehler(f);
  }

  return (
    <Sheet open onClose={onClose}>
      <SheetKopf
        titel="Kinder zuordnen"
        unter={<>Elternzugang <span className="font-semibold text-tinte dark:text-slate-100">{profil.username}</span></>}
        onClose={onClose}
      />

      <p className="mb-4 rounded-2xl bg-papier px-4 py-3 text-[13px] leading-relaxed text-tinte-matt dark:bg-slate-800 dark:text-slate-300">
        Der Zugang sieht <b>nur</b> die Kinder, die hier ausgewählt sind – ihre Beiträge, ihre Mithilfe und die
        Kontodaten. Ohne Kind sieht er nichts.
      </p>

      {/* Zugeordnet */}
      <div className="abschnitt">Zugeordnet · {meine.length}</div>
      <div className="liste mb-5 border border-black/[0.04] dark:border-white/[0.06]">
        {meine.length === 0 ? (
          <div className="zeile text-[14px] text-offen">
            <Icon name="info" size={18} />
            Noch kein Kind – dieser Zugang sieht gerade nichts.
          </div>
        ) : (
          meine.map((id) => {
            const s = nachId.get(id);
            return (
              <div key={id} className="zeile">
                <Avatar userId={s ? userByStudent[s.id] ?? null : null} name={s ? `${s.nachname}, ${s.vorname}` : "?"} size={32} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s ? `${s.vorname} ${s.nachname}` : "Person nicht mehr in der Liste"}
                </span>
                {darf && (
                  <button
                    disabled={busy === id}
                    onClick={() => void umschalten(id)}
                    className="-my-1 shrink-0 rounded-full px-3 py-2 text-[14px] font-semibold text-red-600 transition active:scale-95 disabled:opacity-40 dark:text-red-400"
                  >
                    Entfernen
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {darf ? (
        <>
          <div className="abschnitt">Kind hinzufügen</div>
          <div className="mb-2 flex h-11 items-center gap-2 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)]">
            <span className="text-tinte-leise">
              <Icon name="lupe" size={17} />
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-tinte-leise"
              placeholder="Name suchen"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Suche leeren" className="px-1 text-tinte-leise">
                ✕
              </button>
            )}
          </div>
          {fehler && <p className="mb-2 px-1 text-[13px] font-semibold text-red-600 dark:text-red-400">{fehler}</p>}
          <div className="liste border border-black/[0.04] dark:border-white/[0.06]">
            {liste.length === 0 && <div className="zeile text-[14px] text-tinte-leise">Niemand gefunden.</div>}
            {liste.map((s) => {
              const an = meine.includes(s.id);
              const andere = auchBei.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  disabled={busy === s.id}
                  onClick={() => void umschalten(s.id)}
                  className="zeile w-full text-left transition active:bg-black/[0.04] disabled:opacity-50 dark:active:bg-white/[0.06]"
                >
                  <Avatar userId={userByStudent[s.id] ?? null} name={`${s.nachname}, ${s.vorname}`} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {s.nachname}, {s.vorname}
                    </span>
                    {andere > 0 && (
                      <span className="block truncate text-[12px] text-tinte-leise">
                        hat schon {andere === 1 ? "einen weiteren Elternzugang" : `${andere} weitere Elternzugänge`}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 text-brand transition ${an ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}>
                    <Icon name="haken" size={20} strich={2.5} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="px-1 text-[13px] text-tinte-leise">Kinder zuordnen darf nur der Admin.</p>
      )}
    </Sheet>
  );
}
