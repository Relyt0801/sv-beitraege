import { useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { pushAnPersonen } from "../lib/push";
import { hasSupabase } from "../lib/supabase";
import { heuteKey, tagLang, terminIcon, uhr, type Termin } from "../lib/termine";
import { Sheet } from "./Sheet";

/** Wann ist ein Termin vorbei? Ganztägig: Tagesende; ohne Ende: 45 Minuten. */
function endeVon(t: Termin): Date {
  const [j, m, d] = (t.bis_datum || t.datum).split("-").map(Number);
  const zeit = uhr(t.bis) || (t.von ? plus45(uhr(t.von)) : "23:59");
  const [h, min] = zeit.split(":").map(Number);
  return new Date(j, m - 1, d, h, min);
}
function plus45(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const x = h * 60 + m + 45;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

/**
 * Nach einer Schicht: das Stufenteam bekommt ein Pop-up und trägt mit einem
 * Tipp die Beitragspunkte für alle Eingeteilten ein. Nur für Schichten, die
 * überhaupt Punkte bringen. Die Datenbank trägt jede Schicht genau einmal ein
 * (schicht_abschliessen), auch wenn zwei aus dem Team gleichzeitig tippen.
 */
export function SchichtAbschluss() {
  const { termine, aktionen, abschliessen, ready } = useTermine();
  const { isStaff, can } = useRole();
  const { students } = useStore();
  const [spaeter, setSpaeter] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");

  const darf = isStaff || can("hilfen.edit");
  const aktionVon = useMemo(() => new Map(aktionen.map((a) => [a.id, a])), [aktionen]);

  const offen = useMemo(() => {
    if (!darf || !ready) return [] as Termin[];
    const jetzt = new Date();
    const grenze = new Date(jetzt.getTime() - 14 * 86400000);
    return termine
      .filter((t) => {
        const a = t.aktion_id ? aktionVon.get(t.aktion_id) : null;
        if (!a || !(a.prozent > 0) || t.abschluss || t.personen.length === 0) return false;
        if (t.datum > heuteKey()) return false;
        const ende = endeVon(t);
        return ende < jetzt && ende > grenze;
      })
      .filter((t) => !spaeter.has(t.id))
      .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));
  }, [darf, ready, termine, aktionVon, spaeter]);

  if (!offen.length) return null;
  const namen = new Map(students.map((s) => [s.id, `${s.vorname} ${s.nachname}`]));
  const vornamen = new Map(students.map((s) => [s.id, s.vorname]));

  async function erledigen(t: Termin, vergeben: boolean) {
    setBusy(t.id);
    setFehler("");
    const a = t.aktion_id ? aktionVon.get(t.aktion_id) : null;
    const r = await abschliessen(t.id, vergeben);
    setBusy(null);
    if (typeof r === "string") {
      setFehler(r);
      return;
    }
    // Die Eingeteilten (und ihre Eltern) bekommen Bescheid – nur wenn wirklich eingetragen.
    if (vergeben && r > 0 && a && hasSupabase) {
      void pushAnPersonen(
        t.personen.map((sid) => ({
          student_id: sid,
          title: `🙌 Mithilfe eingetragen (+${a.prozent} %)`,
          body: `${a.titel} am ${tagLang(t.datum)}${vornamen.get(sid) ? ` – ${vornamen.get(sid)}` : ""}. Danke fürs Mithelfen!`,
        })),
        "./#kasse",
        { ohneEltern: true },
      );
    }
  }

  return (
    <Sheet open onClose={() => setSpaeter(new Set([...spaeter, ...offen.map((t) => t.id)]))}>
      <div className="mb-1 font-zahl text-[1.2rem] font-extrabold tracking-[-0.02em]">
        {offen.length === 1 ? "Eine Schicht ist vorbei" : `${offen.length} Schichten sind vorbei`}
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-tinte-leise">
        Haben alle Eingeteilten mitgemacht? Dann bekommen sie mit einem Tipp ihre Beitragspunkte.
        Wer nicht da war, vorher in der Schicht austragen.
      </p>

      <ul className="grid gap-2.5">
        {offen.map((t) => {
          const a = aktionVon.get(t.aktion_id!)!;
          return (
            <li key={t.id} className="rounded-2xl border border-papier-linie p-3 dark:border-slate-700">
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none">{terminIcon(t, a.icon)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{t.titel}</span>
                  <span className="block text-[12px] text-tinte-leise">
                    {tagLang(t.datum)}
                    {t.von ? ` · ${uhr(t.von)}${t.bis ? `–${uhr(t.bis)}` : ""}` : ""}
                  </span>
                </span>
                <span className="zahl shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand dark:bg-brand/20">
                  +{a.prozent} %
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.personen.map((sid) => (
                  <span key={sid} className="rounded-full bg-papier-matt px-2 py-0.5 text-[12px] font-semibold dark:bg-slate-800">
                    {namen.get(sid) || "Unbekannt"}
                  </span>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  disabled={busy === t.id}
                  onClick={() => void erledigen(t, true)}
                  className="btn-primary min-w-0 flex-1 !py-2.5 !text-[14px] disabled:opacity-50"
                >
                  {busy === t.id ? "…" : `Punkte vergeben (${t.personen.length})`}
                </button>
                <button
                  disabled={busy === t.id}
                  onClick={() => void erledigen(t, false)}
                  className="shrink-0 rounded-xl border border-papier-linie px-3 text-[13px] font-bold text-tinte-matt disabled:opacity-50 dark:border-slate-700"
                >
                  ohne
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">Das hat nicht geklappt: {fehler}</p>}

      <button
        onClick={() => setSpaeter(new Set([...spaeter, ...offen.map((t) => t.id)]))}
        className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold text-tinte-leise"
      >
        Später
      </button>
    </Sheet>
  );
}
