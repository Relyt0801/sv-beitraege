import { useEffect, useState } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { hasSupabase, supabase } from "../lib/supabase";
import { abonniere } from "../lib/realtime";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { Avatar } from "./Avatar";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { entscheideKomitee, ladeKomiteeAntraege, type KomiteeRequest } from "../lib/komitee-antrag";

import { meldeFehler } from "../lib/melder";
/** Anträge auf Komitee-Wechsel – wie die Entbannungsanfragen oben in den Events. */
export function KomiteeRequests({ onAnzahl }: { onAnzahl?: (n: number) => void } = {}) {
  const { can } = useRole();
  const { profile } = useProfiles();
  const [liste, setListe] = useState<KomiteeRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = () => void ladeKomiteeAntraege().then(setListe);
  useEffect(() => {
    laden();
    // Live: entscheidet jemand anderes, verschwindet der Antrag sofort
    const abmelden = hasSupabase
      ? abonniere({
          name: "sv-komitee-antraege",
          nachholen: laden,
          aufbauen: (kanal) =>
            kanal.on("postgres_changes", { event: "*", schema: "public", table: "komitee_requests" }, () => laden()),
        })
      : null;
    const t = setInterval(laden, 60000); // Rückfall, falls die Verbindung hängt
    return () => {
      clearInterval(t);
      abmelden?.();
    };
  }, []);

  useSprungziel("komitee", can("komitees.assign") && liste.length > 0, () => hinScrollen("sprung-komitee"));
  // Anzahl offener Einträge für die Kachel/den Zähler im Chats-Reiter
  const anzahl = can("komitees.assign") ? liste.length : 0;
  useEffect(() => {
    onAnzahl?.(anzahl);
  }, [anzahl, onAnzahl]);
  if (!can("komitees.assign") || liste.length === 0) return null;

  async function entscheiden(r: KomiteeRequest, annehmen: boolean) {
    setBusy(r.id);
    const res = await entscheideKomitee(r, annehmen);
    setBusy(null);
    if (!res.ok) meldeFehler("Fehler: " + res.error);
    laden();
  }

  return (
    <div id="sprung-komitee" className="grid gap-2.5 lg:col-span-2 lg:grid-cols-2">
      {liste.map((r) => (
        // Eine Zelle je Antrag (wie die Gruppen in den iOS-Einstellungen), Knöpfe als Kapseln
        <div key={r.id} className="gruppe-zellen">
          <div className="px-4 py-3.5">
            <div className="flex items-start gap-3">
              <Avatar userId={r.user_id} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-snug">{profile[r.user_id]?.anzeigename || "Jemand"}</div>
                <div className="mt-0.5 text-[13.5px] leading-snug text-tinte-matt dark:text-slate-300">
                  möchte zu {committeeIcon(r.wunsch_tag)} <b>{committeeLabel(r.wunsch_tag)}</b>
                  {r.nachricht ? ` – „${r.nachricht}“` : ""}
                </div>
                <div className="mt-1 text-[12px] text-tinte-leise">{new Date(r.created_at).toLocaleString("de-DE")}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy === r.id}
                onClick={() => void entscheiden(r, false)}
                className="btn-klein-grau flex-1"
              >
                Ablehnen
              </button>
              <button
                disabled={busy === r.id}
                onClick={() => void entscheiden(r, true)}
                className="btn-klein flex-1"
              >
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
