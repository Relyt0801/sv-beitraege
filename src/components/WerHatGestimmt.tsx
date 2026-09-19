import { useState } from "react";
import { useProfiles } from "../profiles-store";
import { lesbarerName } from "../lib/profil";
import { Avatar } from "./Avatar";

/**
 * "Wer hat abgestimmt?" – bei nicht-anonymen Umfragen die Namen je Antwort.
 * Eingeklappt, damit die Karte kurz bleibt; ein Tipp klappt die Liste auf.
 * Steht außerhalb der Antwort-Knöpfe, sonst würde das Tippen mit abstimmen.
 */
export function WerHatGestimmt({
  optionen, stimmen,
}: {
  optionen: { id: string; label: string }[];
  stimmen: { option_id: string; user_id: string }[];
}) {
  const { profile } = useProfiles();
  const [offen, setOffen] = useState(false);
  if (stimmen.length === 0) return null;
  const name = (u: string) => lesbarerName(profile[u]?.anzeigename || "Unbekannt");

  return (
    <div className="mt-1">
      <button
        onClick={() => setOffen(!offen)}
        className="text-[12px] font-bold text-brand"
        aria-expanded={offen}
      >
        {offen ? "▾ Namen ausblenden" : `▸ Wer hat abgestimmt? (${new Set(stimmen.map((s) => s.user_id)).size})`}
      </button>
      {offen && (
        <div className="mt-2 grid gap-2.5 rounded-xl bg-papier-matt p-3 dark:bg-slate-800">
          {optionen.map((o) => {
            const leute = stimmen
              .filter((s) => s.option_id === o.id)
              .map((s) => s.user_id)
              .sort((a, b) => name(a).localeCompare(name(b), "de"));
            if (leute.length === 0) return null;
            return (
              <div key={o.id} className="min-w-0">
                <div className="mb-1 text-[12px] font-bold text-tinte-matt dark:text-slate-300">
                  {o.label} · {leute.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {leute.map((u) => (
                    <span
                      key={u}
                      className="flex max-w-full items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold dark:bg-slate-900"
                    >
                      <Avatar userId={u} size={20} />
                      <span className="truncate">{name(u)}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
