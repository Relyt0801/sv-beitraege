import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Stepper } from "./Runden";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { lesbarerName } from "../lib/profil";
import { melde, meldeFehler } from "../lib/melder";
import { rolleName } from "../lib/permissions";

/**
 * Profil → Freigaben (nur Admin)
 *
 *  1. Wie viele Personen müssen zustimmen, bevor eine Anfrage durch ist?
 *     Termine, Kosten, Entsperren, Zitate, Steckbrief-Fotos – je 1 bis 10.
 *  2. Wer bearbeitet Mithilfe-Nachträge? Niemand ausgewählt = wie bisher
 *     alle aus dem Team und alle mit „Beteiligungen eintragen“.
 */
const ARTEN: { key: "termin" | "kosten" | "entsperren" | "zitat" | "foto"; titel: string; text: string; standard?: number }[] = [
  { key: "termin", titel: "Terminanfragen", text: "Vom Komitee-Vorsitz an das Team" },
  { key: "kosten", titel: "Kostenanfragen", text: "Ausgaben, die die Kasse übernimmt" },
  { key: "entsperren", titel: "Entsperr-Anfragen", text: "Wenn jemand eine Sperre anficht" },
  { key: "zitat", titel: "Zitate freigeben", text: "Bevor ein Zitat auf der Wand steht" },
  { key: "foto", titel: "Steckbrief-Fotos", text: "Stufenteam, bevor andere das Foto sehen", standard: 3 },
];

export function FreigabenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles } = useRole();
  const { profile } = useProfiles();
  const [werte, setWerte] = useState<Record<string, number>>({});
  const [bearbeiter, setBearbeiter] = useState<string[]>([]);
  const [suche, setSuche] = useState("");
  const [waehlen, setWaehlen] = useState(false);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase!.from("app_settings").select("bestaetigungen").eq("id", 1).maybeSingle(),
      supabase!.from("nachtrag_bearbeiter").select("user_id"),
    ]);
    setWerte(((a as { bestaetigungen?: Record<string, number> } | null)?.bestaetigungen) || {});
    setBearbeiter(((b as { user_id: string }[] | null) || []).map((x) => x.user_id));
  }, []);

  useEffect(() => {
    if (open) void laden();
  }, [open, laden]);

  const name = (uid: string) => lesbarerName(profile[uid]?.anzeigename || "") || profiles.find((p) => p.user_id === uid)?.username || "Unbekannt";

  async function setzeWert(k: string, n: number) {
    setWerte((w) => ({ ...w, [k]: n }));
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("bestaetigungen_setzen", { p: { [k]: n } });
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    }
  }

  async function bearbeiterSetzen(uid: string, an: boolean) {
    setBearbeiter((b) => (an ? [...b, uid] : b.filter((x) => x !== uid)));
    if (!hasSupabase) return;
    const { error } = an
      ? await supabase!.from("nachtrag_bearbeiter").insert({ user_id: uid })
      : await supabase!.from("nachtrag_bearbeiter").delete().eq("user_id", uid);
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    } else melde(an ? `${name(uid)} bearbeitet jetzt Nachträge` : "Entfernt", "erfolg");
  }

  const kandidaten = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return profiles
      .filter((p) => p.role !== "eltern" && !bearbeiter.includes(p.user_id))
      .map((p) => ({ p, n: name(p.user_id) }))
      .filter((x) => !q || x.n.toLowerCase().includes(q))
      .sort((a, b) => a.n.localeCompare(b.n, "de"))
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, bearbeiter, suche, profile]);

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Freigaben" unter="Wie viele zustimmen müssen – und wer Nachträge bearbeitet." onClose={onClose} />

      <h3 className="abschnitt">Nötige Zustimmungen</h3>
      <div className="liste bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {ARTEN.map((a) => (
          <div key={a.key} className="zeile">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{a.titel}</span>
              <span className="block text-[12px] text-tinte-leise">{a.text}</span>
            </span>
            <Stepper wert={Math.max(1, werte[a.key] || a.standard || 1)} max={10} label={`Zustimmungen für ${a.titel}`} onChange={(n) => void setzeWert(a.key, n)} />
          </div>
        ))}
      </div>
      <p className="mt-1.5 px-4 text-[12px] leading-snug text-tinte-leise">
        Bei mehr als 1 stimmt jede Person einzeln zu („1/2 Zustimmungen“). Erst wenn genug zusammen sind, ist die Anfrage angenommen. Ablehnen geht weiter mit einer Person.
      </p>

      <h3 className="abschnitt mt-6">Nachträge bearbeiten</h3>
      <div className="liste bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {bearbeiter.length === 0 && (
          <div className="zeile text-[14px] text-tinte-leise">Niemand ausgewählt – alle aus dem Team dürfen.</div>
        )}
        {bearbeiter.map((uid) => (
          <div key={uid} className="zeile">
            <Avatar userId={uid} size={30} />
            <span className="min-w-0 flex-1 truncate text-[15px]">{name(uid)}</span>
            <button onClick={() => void bearbeiterSetzen(uid, false)} className="text-[14px] font-semibold text-red-600 dark:text-red-400">
              Entfernen
            </button>
          </div>
        ))}
        <button onClick={() => setWaehlen((w) => !w)} className="zeile w-full text-left text-[15px] font-semibold text-brand-dark dark:text-brand">
          {waehlen ? "Fertig" : "+ Person hinzufügen"}
        </button>
      </div>
      {waehlen && (
        <div className="mt-2">
          <input className="field mb-2" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
          <div className="liste max-h-[40vh] overflow-y-auto bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
            {kandidaten.map(({ p, n }) => (
              <button key={p.user_id} onClick={() => void bearbeiterSetzen(p.user_id, true)} className="zeile w-full text-left">
                <Avatar userId={p.user_id} size={30} />
                <span className="min-w-0 flex-1 truncate text-[15px]">{n}</span>
                <span className="text-[12px] text-tinte-leise">{rolleName(p.role)}</span>
              </button>
            ))}
            {kandidaten.length === 0 && <div className="zeile text-[14px] text-tinte-leise">Niemand gefunden.</div>}
          </div>
        </div>
      )}
      <p className="mt-1.5 px-4 text-[12px] leading-snug text-tinte-leise">
        Sobald jemand ausgewählt ist, bearbeiten nur noch diese Personen (und du als Admin) die Nachträge.
      </p>
    </Sheet>
  );
}
