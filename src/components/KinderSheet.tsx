import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useEltern } from "../eltern-store";
import { normalize } from "../lib/logic";
import type { Profile } from "../auth/RoleProvider";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import { useRole } from "../auth/RoleProvider";
import { Gruppe, Wert, Zeile, ZeileHaken } from "./Liste";
import { Suchfeld } from "./KontoZeile";
import { frage } from "../lib/melder";

/**
 * Welche Kinder gehoeren zu einem Elternzugang?
 *
 * Ersetzt bei Elternkonten die Komitee-Auswahl im Rollen-Reiter. Oben die
 * zugeordneten Kinder als iOS-Zeilen (antippen öffnet die Unterseite mit
 * „Verknüpfung entfernen“ – mit Rückfrage, kein rotes „Entfernen“ in jeder
 * Zeile). Darunter alle Personen mit Haken: ein Tipp ordnet zu, ein Tipp auf
 * einen Haken fragt vor dem Entfernen nach. Ein Zugang ohne Kind sieht in der
 * App gar nichts.
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
  // Geöffnetes Kind (Unterseite „‹ Kinder verknüpfen“)
  const [kind, setKind] = useState<string | null>(null);

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

  const nameVon = (id: string) => {
    const s = nachId.get(id);
    return s ? `${s.vorname} ${s.nachname}` : "Person nicht mehr in der Liste";
  };

  async function setzen(id: string, an: boolean): Promise<boolean> {
    if (!darf || !profil) return false;
    setFehler("");
    setBusy(id);
    const f = await kindZuordnen(profil.user_id, id, an);
    setBusy(null);
    if (f) {
      setFehler(f);
      return false;
    }
    return true;
  }

  /** Entfernen immer mit Rückfrage – ob aus der Unterseite oder über den Haken */
  async function entfernen(id: string): Promise<boolean> {
    const ok = await frage(
      `${nameVon(id)} von „${profil!.username}“ lösen?\n\nDer Elternzugang sieht danach keine Beiträge, Mithilfe und Kontodaten dieses Kindes mehr.`,
      "Lösen",
      true,
    );
    return ok ? setzen(id, false) : false;
  }

  const offenAndere = kind ? auchBei.get(kind) ?? 0 : 0;

  return (
    <Sheet open onClose={onClose}>
      <SheetKopf
        titel="Kinder verknüpfen"
        unter={
          <>
            Elternzugang <span className="font-semibold text-tinte dark:text-slate-100">{profil.username}</span>
          </>
        }
        onClose={onClose}
      />

      {/* Zugeordnet: iOS-Zeilen, antippen öffnet die Unterseite */}
      <Gruppe
        titel={`Zugeordnet · ${meine.length}`}
        className="mt-1"
        fuss="Der Zugang sieht nur die Kinder, die hier stehen – ihre Beiträge, ihre Mithilfe und die Kontodaten. Ohne Kind sieht er nichts."
      >
        {meine.length === 0 ? (
          <div className="flex min-h-[48px] items-center gap-3 px-4 py-2 text-[14px] text-offen">
            <Icon name="info" size={18} />
            Noch kein Kind – dieser Zugang sieht gerade nichts.
          </div>
        ) : (
          meine.map((id) => {
            const s = nachId.get(id);
            return (
              <Zeile
                key={id}
                symbol={<Avatar userId={s ? userByStudent[s.id] ?? null : null} name={s ? `${s.nachname}, ${s.vorname}` : "?"} size={30} />}
                label={<span className="block truncate">{nameVon(id)}</span>}
                onClick={() => setKind(id)}
              />
            );
          })
        )}
      </Gruppe>

      {darf ? (
        <section className="mt-4">
          <h3 className="auf-bild mb-1.5 px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-tinte-leise">Kind hinzufügen</h3>
          <Suchfeld wert={q} onChange={setQ} platzhalter="Name suchen" />
          {fehler && <p className="mb-2 px-4 text-[13px] font-semibold text-red-600 dark:text-red-400">{fehler}</p>}
          <div className="gruppe-zellen">
            {liste.length === 0 && <div className="flex min-h-[48px] items-center px-4 text-[14px] text-tinte-leise">Niemand gefunden.</div>}
            {liste.map((s) => {
              const an = meine.includes(s.id);
              const andere = auchBei.get(s.id) ?? 0;
              return (
                <ZeileHaken
                  key={s.id}
                  symbol={<Avatar userId={userByStudent[s.id] ?? null} name={`${s.nachname}, ${s.vorname}`} size={30} />}
                  label={
                    <span className="block truncate">
                      {s.nachname}, {s.vorname}
                    </span>
                  }
                  unter={andere > 0 ? `hat schon ${andere === 1 ? "einen weiteren Elternzugang" : `${andere} weitere Elternzugänge`}` : undefined}
                  gewaehlt={an}
                  disabled={busy === s.id}
                  onClick={() => void (an ? entfernen(s.id) : setzen(s.id, true))}
                />
              );
            })}
          </div>
          <p className="auf-bild mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">Antippen ordnet zu. Ein Haken lässt sich mit Rückfrage wieder lösen.</p>
        </section>
      ) : (
        <p className="auf-bild mt-3 px-4 text-[13px] text-tinte-leise">Kinder verknüpfen darf nur der Admin.</p>
      )}

      {/* Ein zugeordnetes Kind – Unterseite „‹ Kinder verknüpfen“ */}
      <Sheet open={kind !== null} onClose={() => setKind(null)}>
        {kind && (
          <>
            <SheetKopf titel={nameVon(kind)} unter="Mit diesem Elternzugang verknüpft" onClose={() => setKind(null)} />
            <Gruppe className="mt-1">
              <Zeile label="Elternzugang">
                <Wert>{profil.username}</Wert>
              </Zeile>
              <Zeile label="Weitere Elternzugänge">
                <Wert>{offenAndere ? offenAndere : "keine"}</Wert>
              </Zeile>
            </Gruppe>
            {darf ? (
              <Gruppe fuss="Der Elternzugang sieht danach nichts mehr von diesem Kind. Zuordnen geht jederzeit wieder.">
                <Zeile
                  label="Verknüpfung lösen"
                  rot
                  disabled={busy === kind}
                  onClick={() =>
                    void entfernen(kind).then((ok) => {
                      if (ok) setKind(null);
                    })
                  }
                />
              </Gruppe>
            ) : (
              <p className="mt-3 px-4 text-[13px] text-tinte-leise">Lösen darf nur der Admin.</p>
            )}
          </>
        )}
      </Sheet>
    </Sheet>
  );
}
