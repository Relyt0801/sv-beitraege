import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { abonniere } from "../lib/realtime";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { Avatar } from "./Avatar";
import { committeeIcon, committeeLabel } from "../lib/committees";
import { entscheideKomitee, ladeKomiteeAntraege, type KomiteeRequest } from "../lib/komitee-antrag";

import { meldeFehler } from "../lib/melder";
/** Anträge auf Komitee-Wechsel – wie die Entbannungsanfragen oben in den Events. */
export function KomiteeRequests() {
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

  if (!can("komitees.assign") || liste.length === 0) return null;

  return (
    <div className="mb-4 grid gap-2.5">
      {liste.map((r) => (
        <div key={r.id} className="card border-brand/40 p-4">
          <div className="flex items-start gap-2.5">
            <Avatar userId={r.user_id} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">
                Komitee-Wunsch {profile[r.user_id]?.anzeigename || ""}
              </div>
              <div className="mt-0.5 text-[13px] text-tinte-matt dark:text-slate-300">
                möchte zu {committeeIcon(r.wunsch_tag)} <b>{committeeLabel(r.wunsch_tag)}</b>
                {r.nachricht ? ` – „${r.nachricht}"` : ""}
              </div>
              <div className="mt-1 text-[11px] text-tinte-leise">{new Date(r.created_at).toLocaleString("de-DE")}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                const res = await entscheideKomitee(r, false);
                setBusy(null);
                if (!res.ok) meldeFehler("Fehler: " + res.error);
                laden();
              }}
              className="flex-1 rounded-xl border border-papier-linie py-2 text-sm font-bold text-tinte-matt dark:border-slate-700"
            >
              Ablehnen
            </button>
            <button
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                const res = await entscheideKomitee(r, true);
                setBusy(null);
                if (!res.ok) meldeFehler("Fehler: " + res.error);
                laden();
              }}
              className="flex-1 rounded-xl bg-brand py-2 text-sm font-bold text-white"
            >
              Übernehmen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
