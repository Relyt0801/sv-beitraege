import { useEffect, useMemo, useState } from "react";
import { useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { pushAnPersonen } from "../lib/push";
import { hasSupabase } from "../lib/supabase";
import { heuteKey, schichtEnde as endeVon, tagLang, terminIcon, uhr, type Termin } from "../lib/termine";
import { Sheet } from "./Sheet";

/** Ereignis, mit dem der Hinweis im Events-Reiter das Fenster wieder öffnet. */
const OEFFNEN = "sv:schicht-abschluss";

/**
 * Alle Schichten, die vorbei sind und noch auf „Punkte vergeben / ohne“
 * warten – für alle, die das bestätigen dürfen (Team oder „Mithilfe
 * eintragen“). Ohne Zeitgrenze: auch Vergessenes von vor Wochen taucht auf.
 */
export function useOffeneAbschluesse(): Termin[] {
  const { termine, aktionen, ready } = useTermine();
  const { isStaff, can } = useRole();
  const darf = isStaff || can("hilfen.edit");
  // Einmal pro Minute neu rechnen, damit eine Schicht pünktlich „vorbei“ ist
  const [takt, setTakt] = useState(0);
  useEffect(() => {
    if (!darf) return;
    const id = setInterval(() => setTakt((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, [darf]);
  return useMemo(() => {
    if (!darf || !ready) return [];
    const aktionVon = new Map(aktionen.map((a) => [a.id, a]));
    const jetzt = new Date();
    return termine
      .filter((t) => {
        const a = t.aktion_id ? aktionVon.get(t.aktion_id) : null;
        if (!a || !(a.prozent > 0) || t.abschluss || t.personen.length === 0) return false;
        if (t.datum > heuteKey()) return false;
        return endeVon(t) < jetzt;
      })
      .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von || "").localeCompare(b.von || ""));
    // takt: absichtlich als Auslöser
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darf, ready, termine, aktionen, takt]);
}

/** Fenster „Schichten sind vorbei“ von überall wieder öffnen. */
export function abschlussOeffnen() {
  window.dispatchEvent(new Event(OEFFNEN));
}

/**
 * Bleibender Hinweis im Events-Reiter: Wer das Pop-up weggewischt hat, findet
 * die offenen Schichten hier wieder. Nur sichtbar, solange etwas offen ist.
 */
export function AbschlussHinweis() {
  const offen = useOffeneAbschluesse();
  if (!offen.length) return null;
  return (
    <button
      onClick={abschlussOeffnen}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-left transition active:scale-[.99] dark:border-amber-400/30 dark:bg-amber-500/10"
    >
      <span className="text-xl leading-none" aria-hidden>
        🙌
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-amber-800 dark:text-amber-200">
          {offen.length === 1 ? "1 Schicht ist vorbei" : `${offen.length} Schichten sind vorbei`}
        </span>
        <span className="block text-[12px] text-amber-800/80 dark:text-amber-200/80">
          Mithilfe für die Eingeteilten bestätigen
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-amber-700 px-2.5 py-1.5 text-[12px] font-bold text-white">
        bestätigen
      </span>
    </button>
  );
}

/**
 * Nach einer Schicht: das Stufenteam bekommt ein Pop-up und trägt mit einem
 * Tipp die Beitragspunkte für alle Eingeteilten ein. Nur für Schichten, die
 * überhaupt Punkte bringen. Die Datenbank trägt jede Schicht genau einmal ein
 * (schicht_abschliessen), auch wenn zwei aus dem Team gleichzeitig tippen.
 */
export function SchichtAbschluss() {
  const { aktionen, abschliessen } = useTermine();
  const { students } = useStore();
  const [spaeter, setSpaeter] = useState<Set<string>>(() => new Set());
  // Vom Hinweis im Events-Reiter geöffnet: alle offenen zeigen, auch ältere
  const [vonHand, setVonHand] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");

  const aktionVon = useMemo(() => new Map(aktionen.map((a) => [a.id, a])), [aktionen]);
  const alleOffen = useOffeneAbschluesse();

  useEffect(() => {
    const auf = () => {
      setSpaeter(new Set());
      setVonHand(true);
    };
    window.addEventListener(OEFFNEN, auf);
    return () => window.removeEventListener(OEFFNEN, auf);
  }, []);

  // Von selbst geht das Fenster nur für die letzten 14 Tage auf – ältere
  // stehen im Hinweis im Events-Reiter.
  const offen = useMemo(() => {
    const grenze = Date.now() - 14 * 86400000;
    return alleOffen
      .filter((t) => vonHand || endeVon(t).getTime() > grenze)
      .filter((t) => !spaeter.has(t.id));
  }, [alleOffen, vonHand, spaeter]);

  if (!offen.length) return null;
  function wegLegen() {
    setSpaeter(new Set([...spaeter, ...offen.map((t) => t.id)]));
    setVonHand(false);
  }
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
    <Sheet open onClose={wegLegen}>
      <div className="mb-1 font-zahl text-[1.2rem] font-extrabold tracking-[-0.02em]">
        {offen.length === 1 ? "Eine Schicht ist vorbei" : `${offen.length} Schichten sind vorbei`}
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-tinte-leise">
        Haben alle Eingeteilten mitgemacht? Dann bekommen sie mit einem Tipp ihre Beitragspunkte.
        Wer nicht da war, vorher in der Schicht austragen. Weggewischt? Im Reiter Events steht
        es weiter oben, bis alles bestätigt ist.
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
        onClick={wegLegen}
        className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold text-tinte-leise"
      >
        Später
      </button>
    </Sheet>
  );
}
