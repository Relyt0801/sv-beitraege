import { useState } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { fotoEntscheiden, useAlbumFotos } from "../lib/album-fotos";
import { useZustimmungen } from "../lib/zustimmung";
import { melde, meldeFehler } from "../lib/melder";
import { ZustimmungsMarke } from "./ZustimmungsMarke";

/**
 * Stufenteam: neue Steckbrief-Fotos freigeben oder ablehnen. Freigeben
 * braucht so viele Zustimmungen wie im Profil → Freigaben eingestellt
 * (Standard 3); Ablehnen geht sofort. Steht bei den Anfragen in den Chats.
 */
export function FotoFreigaben() {
  const { isStaff, uid } = useRole();
  const { students } = useStore();
  const fotos = useAlbumFotos(isStaff);
  const zu = useZustimmungen("foto", isStaff && fotos.offene.length > 0, uid);
  const [busy, setBusy] = useState<string | null>(null);

  useSprungziel("foto", isStaff && fotos.offene.length > 0, () => hinScrollen("sprung-foto"));
  if (!isStaff || fotos.offene.length === 0) return null;

  const name = (sid: string) => {
    const s = students.find((x) => x.id === sid);
    return s ? `${s.vorname} ${s.nachname}` : "Unbekannt";
  };

  return (
    <div id="sprung-foto" className="grid gap-2.5">
      {fotos.offene.map((f) => {
        const url = fotos.urlVon(f.pfad);
        const entscheiden = async (frei: boolean) => {
          setBusy(f.id);
          const fehler = await fotoEntscheiden(f, frei);
          setBusy(null);
          void zu.laden();
          if (fehler) return meldeFehler(fehler);
          melde(frei ? "Foto freigegeben" : "Foto abgelehnt", "erfolg");
        };
        return (
          <div key={f.id} className="card flex gap-3 p-3">
            {url ? (
              <img src={url} alt={`Foto von ${name(f.student_id)}`} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-black/[0.06] text-[24px] dark:bg-white/10">📷</span>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="text-[15px] font-semibold leading-snug">Steckbrief-Foto</div>
              <div className="truncate text-[13px] text-tinte-leise">{name(f.student_id)}</div>
              <ZustimmungsMarke className="mt-1.5 self-start" zahl={zu.zahl(f.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(f.id)} />
              <div className="mt-auto flex justify-end gap-2 pt-2">
                <button
                  aria-label="Ablehnen"
                  disabled={busy === f.id}
                  onClick={() => void entscheiden(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFEDEC] text-[16px] font-bold text-[#D70015] transition active:scale-90 disabled:opacity-40 dark:bg-red-500/15"
                >
                  ✕
                </button>
                <button
                  aria-label="Freigeben"
                  disabled={busy === f.id}
                  onClick={() => void entscheiden(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF6EC] text-[16px] font-bold text-[#248A3D] transition active:scale-90 disabled:opacity-40 dark:bg-green-500/15"
                >
                  ✓
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
