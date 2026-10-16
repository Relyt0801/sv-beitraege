import { useState, useEffect } from "react";
import { hinScrollen, useSprungziel } from "../lib/sprung";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { fotoEntscheiden, useAlbumFotos } from "../lib/album-fotos";
import { useZustimmungen } from "../lib/zustimmung";
import { melde, meldeFehler } from "../lib/melder";
import { ZustimmungsMarke } from "./ZustimmungsMarke";
import { Icon } from "./Icon";

/**
 * Stufenteam: neue Steckbrief-Fotos freigeben oder ablehnen. Freigeben
 * braucht so viele Zustimmungen wie im Profil → Freigaben eingestellt
 * (Standard 3); Ablehnen geht sofort. Steht bei den Anfragen in den Chats.
 */
export function FotoFreigaben({ onAnzahl }: { onAnzahl?: (n: number) => void } = {}) {
  const { isStaff, uid } = useRole();
  const { students } = useStore();
  const fotos = useAlbumFotos(isStaff);
  const zu = useZustimmungen("foto", isStaff && fotos.offene.length > 0, uid);
  const [busy, setBusy] = useState<string | null>(null);

  useSprungziel("foto", isStaff && fotos.offene.length > 0, () => hinScrollen("sprung-foto"));
  // Anzahl offener Einträge für die Kachel/den Zähler im Chats-Reiter
  const anzahl = isStaff ? fotos.offene.length : 0;
  useEffect(() => {
    onAnzahl?.(anzahl);
  }, [anzahl, onAnzahl]);
  if (!isStaff || fotos.offene.length === 0) return null;

  const name = (sid: string) => {
    const s = students.find((x) => x.id === sid);
    return s ? `${s.vorname} ${s.nachname}` : "Unbekannt";
  };

  return (
    <div id="sprung-foto" className="grid gap-2.5 lg:col-span-2 lg:grid-cols-2">
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
          // Eine Zelle je Foto: Bild links, Name und Stand rechts, darunter beschriftete Knöpfe
          <div key={f.id} className="gruppe-zellen">
            <div className="px-4 py-3.5">
              <div className="flex gap-3">
                {url ? (
                  <img src={url} alt={`Foto von ${name(f.student_id)}`} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span aria-hidden className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-[rgb(118_118_128/0.12)] text-tinte-leise dark:bg-[rgb(118_118_128/0.24)]">
                    <Icon name="bild" size={28} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-snug">Steckbrief-Foto</div>
                  <div className="truncate text-[13.5px] text-tinte-matt dark:text-slate-300">{name(f.student_id)}</div>
                  <ZustimmungsMarke className="mt-1.5" zahl={zu.zahl(f.id)} noetig={zu.noetig} ichSchon={zu.ichSchon(f.id)} />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button disabled={busy === f.id} onClick={() => void entscheiden(false)} className="btn-klein-grau flex-1">
                  Ablehnen
                </button>
                <button disabled={busy === f.id} onClick={() => void entscheiden(true)} className="btn-klein flex-1">
                  Freigeben
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
