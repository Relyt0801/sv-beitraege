import { useMemo, useState } from "react";
import { PersonRechteSheet } from "./PermissionsTab";
import { useNachschub } from "../lib/liste";
import { useVerzoegert } from "../lib/entwurf";
import { hatVerlassen, normalize } from "../lib/logic";
import { useStore } from "../store";
import { useRole, type Profile, type Role } from "../auth/RoleProvider";
import { usePasswortNeu } from "./PasswortNeu";
import { useTopics } from "../topics-store";
import { useEltern } from "../eltern-store";
import { COMMITTEES } from "../lib/committees";
import { rolleName } from "../lib/permissions";
import { KontoZeile, Suchfeld } from "./KontoZeile";
import { PersonAnlegenSheet } from "./PersonAnlegenSheet";
import { KinderSheet } from "./KinderSheet";
import { Icon } from "./Icon";
import { Schalter } from "./Schalter";
import { Gruppe, Wert, Zeile, ZeileMitSchalter } from "./Liste";
import { Sheet, SheetKopf } from "./Sheet";
// Sperrdauern und die Ist-gesperrt-Frage stehen beim Chat-Knopf – eine Quelle fuer beide.
import { DAUERN, isBanned } from "./MuteKnopf";

import { frage } from "../lib/melder";
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
  const { profiles, setRole, setBan, can, isAdmin, isOp, opUserId, uid, refreshProfiles } = useRole();
  const pw = usePasswortNeu();
  const { zuordnung } = useEltern();
  const [anlegen, setAnlegen] = useState(false);
  const [zeigeEltern, setZeigeEltern] = useState(false);
  // Wer die Stufe verlassen hat, steht standardmäßig nicht mehr in der Liste
  const [zeigeWeg, setZeigeWeg] = useState(false);
  const canAssignKom = can("komitees.assign");
  const canTimeout = can("mod.timeout");
  const { students, reload, settings } = useStore();
  const { committeesOf, setUserCommittee } = useTopics();
  const [q, setQ] = useState("");
  // Angetippte Person: ihr Blatt (Rolle, Komitees, Rechte, Konto)
  const [personId, setPersonId] = useState<string | null>(null);
  // Elternzugang, dessen Kinder gerade bearbeitet werden
  const [kinderFuer, setKinderFuer] = useState<Profile | null>(null);
  // Person angetippt: ihre einzelnen Rechte (vorher eigene Liste im Reiter Rechte)
  const [rechteFuer, setRechteFuer] = useState<{ p: Profile; name: string } | null>(null);
  const darfRechte = can("perms.manage");
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
  const weg = (p: Profile) => {
    const s = p.student_id ? nachId.get(p.student_id) : undefined;
    return !!s && hatVerlassen(s, settings.aktuelles_halbjahr);
  };
  const wegAnzahl = profiles.filter(weg).length;

  // Beim Suchen: wie viele Treffer stecken in ausgeblendeten Konten
  // (Elternzugänge, Ausgetretene)? Vorher blieb „Keine Konten gefunden“
  // stumm, obwohl es das Konto gab – es war nur ausgeblendet.
  const versteckt = useMemo(() => {
    const norm = normalize(suche);
    if (!norm) return { eltern: 0, weg: 0 };
    let eltern = 0;
    let wegT = 0;
    for (const p of profiles) {
      const istEltern = VERSTECKT.includes(p.role);
      const istWeg = weg(p);
      if ((zeigeEltern || !istEltern) && (zeigeWeg || !istWeg)) continue;
      const s = p.student_id ? nachId.get(p.student_id) : undefined;
      const kinder = p.role === "eltern" ? kinderVon(p).map((k) => `${k.vorname} ${k.nachname}`) : [];
      if (!normalize(`${p.username} ${s ? `${s.nachname}, ${s.vorname}` : ""} ${kinder.join(" ")}`).includes(norm)) continue;
      if (!zeigeEltern && istEltern) eltern++;
      else if (!zeigeWeg && istWeg) wegT++;
    }
    return { eltern, weg: wegT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, suche, nachId, zeigeEltern, zeigeWeg, zuordnung, settings.aktuelles_halbjahr]);

  const rows = useMemo(() => {
    const norm = normalize(suche);
    return [...profiles]
      .filter((p) => zeigeEltern || !VERSTECKT.includes(p.role))
      .filter((p) => zeigeWeg || !weg(p))
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
  }, [profiles, suche, nachId, zeigeEltern, zeigeWeg, zuordnung, settings.aktuelles_halbjahr]);

  const { sichtbar, marke, rest } = useNachschub(rows.length, [suche, zeigeEltern]);

  return (
    <div>
      {pw.anzeige}
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

      {/* Anzeige-Schalter als eine iOS-Gruppe – beim Suchen ausgeblendet,
          damit die Treffer direkt unter dem Feld stehen (wie in der Kasse) */}
      {!q.trim() && (
        <Gruppe className="mb-4">
          {(isAdmin || isOp) && <Zeile label="Person hinzufügen" blau onClick={() => setAnlegen(true)} />}
          <ZeileMitSchalter label={<>Elternzugänge anzeigen <span className="ml-1 text-tinte-leise">{elternAnzahl}</span></>}>
            <Schalter an={zeigeEltern} onChange={setZeigeEltern} />
          </ZeileMitSchalter>
          {wegAnzahl > 0 && (
            <ZeileMitSchalter label={<>Ausgetretene anzeigen <span className="ml-1 text-tinte-leise">{wegAnzahl}</span></>}>
              <Schalter an={zeigeWeg} onChange={setZeigeWeg} />
            </ZeileMitSchalter>
          )}
        </Gruppe>
      )}

      {/* Eine Liste wie in den iOS-Einstellungen: links die Person, rechts
          knapp der Stand, Antippen öffnet das Blatt mit Rolle, Komitees,
          Rechten und Konto. Vorher: zwei Spalten Karten mit je zwei großen
          Auswahlfeldern und Knöpfen – unruhig und am Laptop schwer zu lesen. */}
      <Gruppe titel={`${rows.length} ${rows.length === 1 ? "Konto" : "Konten"}`} className="">
        {rows.slice(0, sichtbar).map(({ p, kinder }) => {
          const koms = committeesOf(p.user_id);
          const banned = isBanned(p);
          const istEltern = p.role === "eltern";
          return (
            <button
              key={p.user_id}
              type="button"
              onClick={() => setPersonId(p.user_id)}
              className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
            >
              <div className="min-w-0 flex-1">
                <KontoZeile
                  profil={p}
                  student={p.student_id ? nachId.get(p.student_id) ?? null : null}
                  punkt={p.must_change_password === false}
                  hinweis={istEltern ? (kinder.length ? kinder.join(" und ") : "kein Kind verknüpft – sieht nichts") : undefined}
                  hinweisWarnt={istEltern && kinder.length === 0}
                />
              </div>
              {banned && <span className="shrink-0 text-[13px] font-semibold text-red-600 dark:text-red-400">gesperrt</span>}
              {!istEltern && koms.length > 0 && (
                <span className="shrink-0 text-[13px] text-tinte-leise">
                  {koms.length} {koms.length === 1 ? "Komitee" : "Komitees"}
                </span>
              )}
              <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
            </button>
          );
        })}
        {rest > 0 && (
          <div ref={marke} className="py-6 text-center text-[13px] text-tinte-leise">
            lädt weitere … ({rest} übrig)
          </div>
        )}
        {rows.length === 0 && (
          <div className={`px-4 text-center text-[15px] text-tinte-leise ${versteckt.eltern || versteckt.weg ? "py-5" : "py-10"}`}>
            Keine Konten gefunden.
          </div>
        )}
        {rows.length === 0 && (isAdmin || isOp) && <Zeile label="Person hinzufügen" blau onClick={() => setAnlegen(true)} />}
        {versteckt.eltern > 0 && (
          <Zeile
            label={`Auch ${versteckt.eltern} ${versteckt.eltern === 1 ? "Elternzugang" : "Elternzugänge"} zeigen`}
            blau
            onClick={() => setZeigeEltern(true)}
          />
        )}
        {versteckt.weg > 0 && (
          <Zeile
            label={`Auch ${versteckt.weg} ausgetretene ${versteckt.weg === 1 ? "Person" : "Personen"} zeigen`}
            blau
            onClick={() => setZeigeWeg(true)}
          />
        )}
      </Gruppe>

      {(() => {
        const p = personId ? profiles.find((x) => x.user_id === personId) : undefined;
        if (!p) return null;
        const st = p.student_id ? nachId.get(p.student_id) : null;
        const name = st ? `${st.vorname} ${st.nachname}` : p.username || "Konto";
        const geschuetzt = p.is_op || p.user_id === opUserId;
        const rolleGesperrt = geschuetzt || (!isAdmin && NUR_ADMIN.includes(p.role));
        const istEltern = p.role === "eltern";
        const kinder = istEltern ? kinderVon(p).map((k) => `${k.vorname} ${k.nachname}`) : [];
        const koms = committeesOf(p.user_id);
        const banned = isBanned(p);
        return (
          <PersonBlatt
            name={name}
            profil={p}
            onClose={() => setPersonId(null)}
            rolleGesperrt={rolleGesperrt}
            gesperrtGrund={geschuetzt ? "Diese Rolle kann nicht geändert werden." : rolleGesperrt ? "Diese Rolle darf nur der Admin ändern." : undefined}
            auswahl={ROLLEN_AUSWAHL.filter((r) => isAdmin || !NUR_ADMIN.includes(r) || p.role === r)}
            vergeben={(r) => NUR_EINMAL.includes(r) && profiles.some((x) => x.role === r && x.user_id !== p.user_id)}
            onRolle={async (neu) => {
              if (neu === p.role) return true;
              // Jeder Rollenwechsel mit Rückfrage – vorher wurde z. B. aus
              // Schüler mit einem einzigen Tipp Kassenwart.
              const heikel = p.role === "eltern" || neu === "eltern" || neu === "admin";
              const text = `${name} wirklich von „${rolleName(p.role)}“ zu „${rolleName(neu)}“ machen?${heikel ? " Das ändert, was das Konto sehen darf." : ""}`;
              if (!(await frage(text, "Ändern"))) return false;
              void setRole(p.user_id, neu);
              return true;
            }}
            kinder={istEltern ? { text: kinder.length === 0 ? (darfKinder ? "Kind wählen" : "Kein Kind") : kinder.join(", "), warnt: kinder.length === 0, oeffnen: () => setKinderFuer(p) } : undefined}
            komitees={!istEltern && canAssignKom ? { gewaehlt: koms, setzen: (slug, an) => setUserCommittee(p.user_id, slug, an) } : undefined}
            onRechte={darfRechte && !istEltern ? () => setRechteFuer({ p, name }) : undefined}
            onPasswort={pw.darf && !geschuetzt && p.user_id !== uid ? () => void pw.zuruecksetzen(p.user_id, p.username || "diese Person") : undefined}
            pwBusy={pw.busy}
            sperre={
              canTimeout && !geschuetzt && !istEltern
                ? {
                    gesperrt: banned,
                    aufheben: () => void setBan(p.user_id, null, false),
                    sperren: (ms) => void setBan(p.user_id, ms ? new Date(Date.now() + ms).toISOString() : null, ms === null),
                  }
                : undefined
            }
          />
        );
      })()}

      {rechteFuer && (
        <PersonRechteSheet profil={rechteFuer.p} name={rechteFuer.name} onClose={() => setRechteFuer(null)} />
      )}
      {kinderFuer && (
        <KinderSheet profil={kinderFuer} darf={darfKinder} onClose={() => setKinderFuer(null)} />
      )}
    </div>
  );
}

/** „heute, 15:42 Uhr“ bzw. „Fr., 16.10., 15:42 Uhr“ */
function zeitText(d: Date): string {
  const zeit = `${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  if (new Date().toDateString() === d.toDateString()) return `heute, ${zeit}`;
  return `${d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })}, ${zeit}`;
}

/** Wann eine Sperre dieser Dauer endet (Unterseite „Chat sperren“) */
function sperreBis(ms: number | null): string {
  return ms === null ? "bis jemand sie aufhebt" : `bis ${zeitText(new Date(Date.now() + ms))}`;
}

/** Stand einer laufenden Sperre für die Zeile „Chat-Sperre aufheben“ */
function gesperrtText(p: Profile): string {
  if (p.chat_ban_permanent) return "Gesperrt, ohne Ende";
  return p.chat_banned_until ? `Gesperrt bis ${zeitText(new Date(p.chat_banned_until))}` : "Gesperrt";
}

/** Kurzer Satz unter jeder Rolle im Menü – was sie bedeutet. */
const ROLLE_HINWEIS: Partial<Record<Role, string>> = {
  schueler: "Normales Mitglied der Stufe",
  sprecher: "Gibt es nur einmal",
  stv_sprecher: "Stellvertretung – gibt es nur einmal",
  stufenteam: "Organisation – Rechte unter „Rechte je Rolle“",
  kassenwart: "Kassenbuch – Rechte unter „Rechte je Rolle“",
  admin: "Alle Rechte",
  eltern: "Sieht nur die eigenen Kinder",
};

/**
 * Blatt einer Person – aufgebaut wie eine Seite der iOS-Einstellungen:
 * oben EINE Zeile „Rolle“ (selten geändert – die Auswahl mit Häkchen und
 * einem Satz je Rolle liegt auf einer Unterseite im selben Blatt), darunter
 * das Häufige: Komitees mit Häkchen, einzelne Rechte und Konto. Vorher
 * füllten sieben Rollen-Zeilen den ersten Bildschirm, Rechte und Konto
 * lagen unter dem Rand.
 */
function PersonBlatt({
  name, profil, onClose, rolleGesperrt, gesperrtGrund, auswahl, vergeben, onRolle,
  kinder, komitees, onRechte, onPasswort, pwBusy, sperre,
}: {
  name: string;
  profil: Profile;
  onClose: () => void;
  rolleGesperrt: boolean;
  gesperrtGrund?: string;
  auswahl: Role[];
  vergeben: (r: Role) => boolean;
  /** true = gewechselt (oder dieselbe Rolle), false = in der Rückfrage abgebrochen */
  onRolle: (r: Role) => boolean | Promise<boolean>;
  kinder?: { text: string; warnt: boolean; oeffnen: () => void };
  komitees?: { gewaehlt: string[]; setzen: (slug: string, an: boolean) => void };
  onRechte?: () => void;
  onPasswort?: () => void;
  pwBusy?: boolean;
  sperre?: { gesperrt: boolean; aufheben: () => void; sperren: (ms: number | null) => void };
}) {
  const [seite, setSeite] = useState<null | "rolle" | "sperre">(null);

  // Chat sperren: die Dauern auf einer eigenen Unterseite oben im Blatt.
  // Vorher klappten sie unter dem Knopf auf – am iPhone unter dem Rand, und
  // „1 Stunde“ lag genau unter dem Finger (Doppeltipp sperrte sofort).
  if (seite === "sperre" && sperre)
    return (
      <Sheet open hoch onClose={onClose}>
        <SheetKopf titel="Chat sperren" unter={`Wie lange darf ${name} im Chat nicht schreiben?`} zurueck={{ text: name, onClick: () => setSeite(null) }} onClose={onClose} />
        <Gruppe className="" fuss="Die Sperre lässt sich im Blatt der Person jederzeit wieder aufheben.">
          {DAUERN.map((d) => (
            <Zeile
              key={d.label}
              label={d.label}
              unter={sperreBis(d.ms)}
              rot
              onClick={() => {
                sperre.sperren(d.ms);
                setSeite(null);
              }}
            />
          ))}
        </Gruppe>
      </Sheet>
    );

  if (seite === "rolle")
    return (
      <Sheet open hoch onClose={onClose}>
        <SheetKopf titel="Rolle" zurueck={{ text: name, onClick: () => setSeite(null) }} onClose={onClose} />
        <Gruppe className="" fuss="Was jede Rolle darf, steht unter „Rechte je Rolle“.">
        {auswahl.map((r) => {
          const aktiv = r === profil.role;
          const belegt = vergeben(r);
          return (
            <button
              key={r}
              type="button"
              disabled={belegt}
              aria-pressed={aktiv}
              onClick={async () => {
                // Abbrechen in der Rückfrage: auf der Rollenliste bleiben
                if (await onRolle(r)) setSeite(null);
              }}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition enabled:active:bg-black/[0.04] disabled:cursor-default dark:enabled:active:bg-white/[0.06]"
            >
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] ${belegt ? "text-tinte-leise" : ""}`}>{rolleName(r)}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-tinte-leise">
                  {belegt ? "Schon vergeben – erst der anderen Person wegnehmen" : ROLLE_HINWEIS[r]}
                </span>
              </span>
              {aktiv && (
                <span className="shrink-0 text-brand-dark dark:text-brand">
                  <Icon name="haken" size={18} strich={2.5} />
                </span>
              )}
            </button>
          );
        })}
        </Gruppe>
      </Sheet>
    );

  // Blatt mit Unterseiten (Rolle, Sperre, Rechte, Kinder): am Handy gleich
  // in voller Höhe, damit der Kopf beim Umblättern nicht springt
  return (
    <Sheet open hoch onClose={onClose}>
      <SheetKopf titel={name} unter={`${profil.username ?? ""} · ${rolleName(profil.role)}`} onClose={onClose} />

      <Gruppe className="" fuss={gesperrtGrund}>
        <Zeile label="Rolle" onClick={rolleGesperrt ? undefined : () => setSeite("rolle")}>
          <Wert>{rolleName(profil.role)}</Wert>
        </Zeile>
      </Gruppe>

      {kinder && (
        <Gruppe titel="Kinder">
          <Zeile label="Verknüpfte Kinder" onClick={kinder.oeffnen}>
            <span className={`truncate text-[15px] ${kinder.warnt ? "font-medium text-offen" : "text-tinte-matt dark:text-slate-300"}`}>{kinder.text}</span>
          </Zeile>
        </Gruppe>
      )}

      {komitees && (
        <Gruppe titel="Komitees">
          {COMMITTEES.map((c) => {
            const an = komitees.gewaehlt.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={an}
                onClick={() => komitees.setzen(c.slug, !an)}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
              >
                <span className="min-w-0 flex-1 truncate text-[15px]">{c.label}</span>
                {an && (
                  <span className="shrink-0 text-brand-dark dark:text-brand">
                    <Icon name="haken" size={18} strich={2.5} />
                  </span>
                )}
              </button>
            );
          })}
        </Gruppe>
      )}

      {onRechte && (
        <Gruppe fuss="Ausnahmen nur für diese Person – zusätzlich zu dem, was ihre Rolle darf.">
          <Zeile label="Einzelne Rechte" onClick={onRechte} />
        </Gruppe>
      )}

      {(onPasswort || sperre) && (
        <Gruppe titel="Konto">
          {onPasswort && <Zeile label={pwBusy ? "Wird erzeugt …" : "Passwort zurücksetzen"} blau disabled={pwBusy} onClick={onPasswort} />}
          {sperre &&
            (sperre.gesperrt ? (
              <Zeile label="Chat-Sperre aufheben" unter={gesperrtText(profil)} blau onClick={sperre.aufheben} />
            ) : (
              <Zeile label="Chat sperren" rot onClick={() => setSeite("sperre")} />
            ))}
        </Gruppe>
      )}
    </Sheet>
  );
}
