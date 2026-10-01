import { useState } from "react";
import { RechtSheet } from "./Rechtliches";
import { meldeFehler } from "../lib/melder";

/**
 * Einmalige Frage zum Vertrauens-Check (Update Abi28).
 *
 * Freiwillig: beide Knöpfe sind gleich groß, beide führen in die App. Wer
 * nicht zustimmt, kann alles wie bisher nutzen – „war da“ prüft dann immer
 * das Stufenteam (Art. 7 Abs. 4 DSGVO: keine Kopplung an die Nutzung).
 * Eltern bekommen diese Frage nie. In der Testphase nur Admins/Testkonten.
 */
export function DatenschutzUpdate({ onAntwort }: { onAntwort: (ja: boolean) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [lesen, setLesen] = useState(false);

  async function antworten(ja: boolean) {
    setBusy(true);
    const f = await onAntwort(ja);
    setBusy(false);
    if (f) meldeFehler("Das hat nicht geklappt: " + f);
  }

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] bg-papier p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl dark:bg-slate-900 sm:rounded-[1.75rem]">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-brand">Datenschutz · neu</div>
        <h2 className="mt-1 font-zahl text-[1.45rem] font-extrabold leading-tight tracking-[-0.02em]">
          Darf die App deine Angaben schneller bestätigen?
        </h2>

        <ul className="mt-3 grid gap-2.5 text-[14px] leading-relaxed text-tinte-matt dark:text-slate-300">
          <li className="flex gap-2.5">
            <span aria-hidden>🙋</span>
            <span>
              Sagst du nach einer Schicht <b>„war da“</b>, kann das <b>sofort</b> eingetragen werden – wenn du eingeteilt
              warst und deine Angaben bisher gestimmt haben.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>🤖</span>
            <span>
              Dafür werden deine Nachrichten <b>an das Stufenteam</b> (nicht die Gruppenchats) ohne deinen Namen von einer
              KI (Jev von TypeSafe, Claude von Anthropic, Server in den USA) eingeschätzt, und ein Assistent beantwortet
              Nachträge. Antworten des Assistenten sind als solche markiert.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>👤</span>
            <span>
              Den Wert sieht <b>nur der Admin</b>. Ein niedriger Wert lehnt nie etwas ab – dann schaut einfach das
              Stufenteam drauf, wie bisher.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>↩️</span>
            <span>
              Freiwillig. <b>Ohne Zustimmung</b> funktioniert alles wie bisher. Widerrufen geht jederzeit im Profil –
              dann wird der Wert gelöscht.
            </span>
          </li>
        </ul>

        <button type="button" onClick={() => setLesen(true)} className="mt-3 text-[13px] font-semibold text-brand underline underline-offset-2">
          Ganze Datenschutzerklärung lesen
        </button>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => void antworten(false)} className="btn-grau !text-[16px]">
            Nein danke
          </button>
          <button disabled={busy} onClick={() => void antworten(true)} className="btn-primary !text-[16px]">
            Zustimmen
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-tinte-leise">Testphase – vorerst nur für einzelne Konten.</p>
      </div>
      <RechtSheet seite={lesen ? "datenschutz" : null} onClose={() => setLesen(false)} />
    </div>
  );
}
