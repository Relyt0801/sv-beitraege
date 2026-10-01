import { useEffect, useMemo, useState } from "react";
import { Sheet } from "./Sheet";
import { neuFuer, neuSchluessel, type NeuKontext } from "../lib/neues";

/**
 * „Was ist neu“ – einmal je Update und Konto, nur mit den Punkten, die die
 * Person betreffen. Erscheint erst, wenn nichts anderes offen ist
 * (Einführung, Datenschutz-Frage).
 */
export function WasIstNeu({ kontext, uid, frei }: { kontext: NeuKontext; uid: string | null; frei: boolean }) {
  const [zu, setZu] = useState(false);
  const update = useMemo(
    () =>
      neuFuer(kontext, (id) => {
        try {
          return localStorage.getItem(neuSchluessel(uid, id)) !== null;
        } catch {
          return true; // ohne Speicher lieber gar nicht als bei jedem Start
        }
      }),
    [kontext, uid],
  );
  // Kurz warten, damit es nicht über das Laden springt.
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBereit(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!update || zu || !frei || !bereit) return null;
  const fertig = () => {
    try {
      localStorage.setItem(neuSchluessel(uid, update.id), new Date().toISOString());
    } catch {
      /* dann eben beim nächsten Mal noch einmal */
    }
    setZu(true);
  };

  return (
    <Sheet open onClose={fertig}>
      <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-brand">Was ist neu</div>
      <div className="mb-3 font-zahl text-[1.5rem] font-extrabold tracking-[-0.02em]">{update.titel}</div>
      <ul className="grid gap-3">
        {update.punkte.map((p) => (
          <li key={p.titel} className="flex gap-3">
            <span className="w-8 shrink-0 text-center text-[24px] leading-none">{p.zeichen}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{p.titel}</span>
              <span className="block text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <button className="btn-primary mt-5" onClick={fertig}>
        Verstanden
      </button>
    </Sheet>
  );
}
