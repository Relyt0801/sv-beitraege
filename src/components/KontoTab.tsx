import { useState } from "react";
import { useEltern } from "../eltern-store";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import type { Student } from "../lib/types";

/** Aus "Q1.1" wird "Q1" – so wie es auf die Überweisung gehört. */
export function jahrgangKurz(halbjahr: string): string {
  return halbjahr.split(".")[0];
}

/**
 * Die Kontodaten der Stufenkasse.
 *
 * Die Daten kommen aus der Datenbank und stehen an keiner Stelle im Quellcode.
 * Lesen darf sie jedes angemeldete Konto, ändern nur Admin und Kassenwart.
 */
export function KontoTab({ kinder }: { kinder: Student[] }) {
  const { konto, kontoSpeichern } = useEltern();
  const { settings } = useStore();
  const { role } = useRole();
  const [kopiert, setKopiert] = useState<string | null>(null);
  const darfAendern = role === "admin" || role === "kassenwart";

  if (!konto)
    return (
      <div className="card p-6 text-center text-sm text-slate-500">Die Kontodaten werden geladen …</div>
    );

  if (!konto.iban)
    return (
      <div className="card p-6 text-center text-sm text-slate-500">
        Es sind noch keine Kontodaten hinterlegt.
        <br />
        Das Stufenteam trägt sie in Kürze ein.
      </div>
    );

  const jahr = jahrgangKurz(settings.aktuelles_halbjahr);

  async function kopieren(text: string, was: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 1800);
    } catch {
      /* Manche Browser erlauben das nicht – dann eben von Hand abtippen. */
    }
  }

  return (
    <div className="grid gap-3">
      <section className="card p-5">
        <h2 className="text-lg font-bold">So überweisen Sie</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Bitte immer den Verwendungszweck angeben. Sonst können wir das Geld nicht zuordnen.
        </p>

        <dl className="mt-4 grid gap-2">
          <Zeile label="Empfänger" wert={konto.inhaber} onKopieren={() => kopieren(konto.inhaber, "inhaber")} kopiert={kopiert === "inhaber"} />
          <Zeile label="IBAN" wert={konto.iban} gross onKopieren={() => kopieren(konto.iban, "iban")} kopiert={kopiert === "iban"} />
          <Zeile label="BIC" wert={konto.bic} onKopieren={() => kopieren(konto.bic, "bic")} kopiert={kopiert === "bic"} />
          <Zeile label="Bank" wert={konto.bank} />
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Verwendungszweck</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Name, Vorname und das aktuelle Halbjahr. Bei mehreren Kindern bitte für jedes Kind einzeln
          überweisen.
        </p>

        <ul className="mt-3 grid gap-2">
          {kinder.length === 0 && (
            <li className="rounded-xl bg-slate-100 px-3 py-2.5 text-[14px] font-semibold dark:bg-slate-800">
              Nachname, Vorname, {jahr}
            </li>
          )}
          {kinder.map((k) => {
            const zweck = `${k.nachname}, ${k.vorname}, ${jahr}`;
            return (
              <li key={k.id} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 dark:bg-slate-800">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{zweck}</span>
                <button
                  onClick={() => kopieren(zweck, k.id)}
                  className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-bold text-brand transition active:scale-95 dark:bg-slate-900"
                >
                  {kopiert === k.id ? "kopiert ✓" : "kopieren"}
                </button>
              </li>
            );
          })}
        </ul>

        {konto.hinweis && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            {konto.hinweis}
          </p>
        )}
      </section>

      {darfAendern && <KontoBearbeiten onSpeichern={kontoSpeichern} konto={konto} />}
    </div>
  );
}

function Zeile({
  label,
  wert,
  gross,
  onKopieren,
  kopiert,
}: {
  label: string;
  wert: string;
  gross?: boolean;
  onKopieren?: () => void;
  kopiert?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 dark:bg-slate-800">
      <dt className="w-20 shrink-0 text-[12px] font-semibold text-slate-400">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all font-semibold ${gross ? "text-[15px] tracking-wide" : "text-[14px]"}`}>
        {wert}
      </dd>
      {onKopieren && (
        <button
          onClick={onKopieren}
          className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-bold text-brand transition active:scale-95 dark:bg-slate-900"
        >
          {kopiert ? "kopiert ✓" : "kopieren"}
        </button>
      )}
    </div>
  );
}

/** Nur für Admin und Kassenwart: die Kontodaten ändern. */
function KontoBearbeiten({
  konto,
  onSpeichern,
}: {
  konto: import("../lib/types").BankKonto;
  onSpeichern: (patch: Partial<import("../lib/types").BankKonto>) => Promise<string | null>;
}) {
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState(konto);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (!offen)
    return (
      <button
        onClick={() => {
          setEntwurf(konto);
          setInfo("");
          setOffen(true);
        }}
        className="card p-4 text-[13px] font-bold text-slate-500 transition active:scale-[.99]"
      >
        Kontodaten ändern
      </button>
    );

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Kontodaten ändern</h2>
      <p className="mt-0.5 text-[13px] text-slate-500">
        Diese Angaben sehen alle angemeldeten Konten. Bitte sorgfältig prüfen.
      </p>
      <div className="mt-3 grid gap-2">
        {([
          ["inhaber", "Empfänger"],
          ["iban", "IBAN"],
          ["bic", "BIC"],
          ["bank", "Bank"],
          ["hinweis", "Hinweis"],
        ] as const).map(([feld, label]) => (
          <label key={feld} className="grid gap-1">
            <span className="text-[12px] font-semibold text-slate-400">{label}</span>
            <input
              className="field"
              value={entwurf[feld]}
              onChange={(e) => setEntwurf((p) => ({ ...p, [feld]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {info && <p className="mt-2 text-[13px] font-semibold text-amber-600">{info}</p>}
      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const fehler = await onSpeichern(entwurf);
            setBusy(false);
            if (fehler) setInfo(fehler);
            else setOffen(false);
          }}
          className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Speichern
        </button>
        <button
          onClick={() => setOffen(false)}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 dark:border-slate-700"
        >
          Abbrechen
        </button>
      </div>
    </section>
  );
}
