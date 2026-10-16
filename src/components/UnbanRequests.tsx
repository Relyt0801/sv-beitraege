import { useEffect, useState } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { hasSupabase, supabase } from "../lib/supabase";
import { abonniere } from "../lib/realtime";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { entscheide, ladeAnfragen, type UnbanRequest } from "../lib/unban";

import { meldeFehler } from "../lib/melder";
import { useZustimmungen } from "../lib/zustimmung";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
import { Icon } from "./Icon";
/** Entbannungsanfragen – erscheinen für die Moderation oben in den Events. */
export function UnbanRequests({ onAnzahl }: { onAnzahl?: (n: number) => void } = {}) {
  const { can, profiles, uid, isStaff } = useRole();
  const zu = useZustimmungen("entsperren", isStaff || can("mod.timeout"), uid);
  const { students } = useStore();
  const [liste, setListe] = useState<UnbanRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const laden = () => void ladeAnfragen().then(setListe);
  useEffect(() => {
    laden();
    // Live: entscheidet jemand anderes, verschwindet der Antrag sofort
    const abmelden = hasSupabase
      ? abonniere({
          name: "sv-entsperr-antraege",
          nachholen: laden,
          aufbauen: (kanal) =>
            kanal.on("postgres_changes", { event: "*", schema: "public", table: "unban_requests" }, () => laden()),
        })
      : null;
    const t = setInterval(laden, 60000); // Rückfall, falls die Verbindung hängt
    return () => {
      clearInterval(t);
      abmelden?.();
    };
  }, []);

  useSprungziel("entsperren", can("mod.timeout") && liste.length > 0, () => hinScrollen("sprung-entsperren"));
  // Anzahl offener Einträge für die Kachel/den Zähler im Chats-Reiter
  const anzahl = can("mod.timeout") ? liste.length : 0;
  useEffect(() => {
    onAnzahl?.(anzahl);
  }, [anzahl, onAnzahl]);
  if (!can("mod.timeout") || liste.length === 0) return null;

  const nameVon = (userId: string) => {
    const p = profiles.find((x) => x.user_id === userId);
    const st = p?.student_id ? students.find((s) => s.id === p.student_id) : null;
    return st ? `${st.vorname} ${st.nachname}` : p?.username || "Unbekannt";
  };

  async function entscheiden(r: UnbanRequest, entsperren: boolean) {
    setBusy(r.id);
    const res = await entscheide(r, entsperren);
    setBusy(null);
    if (!res.ok) meldeFehler(entsperren && res.error?.startsWith("Deine Zustimmung") ? res.error : "Fehler: " + res.error);
    if (entsperren) void zu.laden();
    laden();
  }

  return (
    <div id="sprung-entsperren" className="grid gap-2.5 lg:col-span-2 lg:grid-cols-2">
      {liste.map((r) => (
        // Eine Zelle je Anfrage; Schloss-Symbol statt Emoji
        <div key={r.id} className="gruppe-zellen">
          <div className="px-4 py-3.5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="symbol bg-[#E8590C]">
                <Icon name="schluessel" size={17} strich={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-snug">{nameVon(r.user_id)}</div>
                <div className="text-[12.5px] text-tinte-leise">möchte entsperrt werden</div>
                {r.nachricht && <div className="mt-1 text-[14px] leading-snug text-tinte-matt dark:text-slate-300 [overflow-wrap:anywhere]">{r.nachricht}</div>}
                <div className="mt-1 text-[12px] text-tinte-leise">{new Date(r.created_at).toLocaleString("de-DE")}</div>
                <ZustimmungsMarke className="mt-1.5" zahl={zu.zahl(r.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(r.id)} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={busy === r.id} onClick={() => void entscheiden(r, false)} className="btn-klein-grau flex-1">
                Ablehnen
              </button>
              <button disabled={busy === r.id} onClick={() => void entscheiden(r, true)} className="btn-klein flex-1">
                Entsperren
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
