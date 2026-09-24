import { useState } from "react";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";

/**
 * IBAN in Viererblöcken, so wie man sie auf Papier schreibt.
 * DE00123456781234567890 wird zu DE00 1234 5678 1234 5678 90 – das liest sich
 * besser und bricht auf schmalen Bildschirmen an sinnvollen Stellen um.
 * Die echten Kontodaten stehen nur in der Datenbank, nie hier im Code.
 */
export function ibanLesbar(iban: string): string {
  return (iban || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

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
export function KontoTab() {
  const { konto, kontoSpeichern, kinder: meineKinder } = useEltern();
  const { role } = useRole();
  // Eltern sehen hier nur die eigenen Kinder – dafür sorgt die Datenbank,
  // und zur Sicherheit filtert die App noch einmal nach der Zuordnung.
  const { students, settings } = useStore();
  // Gleiche Reihenfolge wie in der Übersicht: nach Vorname
  const kinder = (role === "eltern" ? students.filter((s) => meineKinder.includes(s.id)) : students)
    .slice()
    .sort((a, b) => a.vorname.localeCompare(b.vorname, "de"));
  const [kopiert, setKopiert] = useState<string | null>(null);
  const darfAendern = role === "admin" || role === "kassenwart";

  if (!konto)
    return (
      <div className="card p-6 text-center text-sm text-tinte-matt">Die Kontodaten werden geladen …</div>
    );

  if (!konto.iban)
    return (
      <div className="card p-6 text-center text-sm text-tinte-matt">
        Es sind noch keine Kontodaten hinterlegt.
        <br />
        Das Stufenteam trägt sie in Kürze ein.
      </div>
    );

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
        <h2 className="text-[1.25rem] font-bold tracking-[-0.01em]">So überweisen Sie</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Bitte immer den Verwendungszweck angeben – sonst können wir das Geld nicht zuordnen. Bei
          mehreren Kindern bitte für jedes Kind einzeln überweisen.
        </p>

        <dl className="mt-4 grid gap-2" data-tour="konto-daten">
          <Zeile label="Empfänger" wert={konto.inhaber} onKopieren={() => kopieren(konto.inhaber, "inhaber")} kopiert={kopiert === "inhaber"} />
          <Zeile
            label="IBAN"
            wert={ibanLesbar(konto.iban)}
            gross
            onKopieren={() => kopieren(konto.iban.replace(/\s+/g, ""), "iban")}
            kopiert={kopiert === "iban"}
          />
          <Zeile label="BIC" wert={konto.bic} onKopieren={() => kopieren(konto.bic, "bic")} kopiert={kopiert === "bic"} />
          <Zeile label="Bank" wert={konto.bank} />
        </dl>

        {/* Verwendungszweck zum Kopieren – je Kind eine Zeile */}
        <ul className="mt-2 grid gap-2">
          {(kinder.length ? kinder : [null]).map((k) => {
            const jahr = jahrgangKurz(settings.aktuelles_halbjahr);
            // Kein Komma vor der Stufe: "Adams, Tyler Q2"
            const zweck = k ? `${k.nachname}, ${k.vorname} ${jahr}` : `Nachname, Vorname ${jahr}`;
            const id = k ? `zweck-${k.id}` : "zweck";
            return (
              <li key={id}>
                <Zeile
                  label={kinder.length > 1 && k ? `Verwendungszweck für ${k.vorname}` : "Verwendungszweck"}
                  gross
                  wert={zweck}
                  onKopieren={() => kopieren(zweck, id)}
                  kopiert={kopiert === id}
                />
              </li>
            );
          })}
        </ul>

        {konto.hinweis && (
          <p className="mt-3 rounded-2xl bg-[rgb(118_118_128/0.1)] p-3.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
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
  // Alle Zeilen gleich gebaut: kleine Beschriftung oben, Wert darunter,
  // Kopieren rechts. Die IBAN bekommt dieselbe Schrift wie der Rest (keine
  // Schreibmaschinenschrift), steht aber immer in EINER Zeile.
  const knopf = onKopieren && (
    <button
      onClick={onKopieren}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition duration-200 active:scale-95 ${
        kopiert ? "bg-bezahlt text-white" : "bg-white text-brand-dark shadow-[0_1px_3px_rgba(0,0,0,.08)] dark:bg-slate-700 dark:text-brand"
      }`}
    >
      {kopiert ? "✓ kopiert" : "kopieren"}
    </button>
  );
  // Lange Werte (IBAN, Verwendungszweck): Knopf in die Kopfzeile, damit der
  // Wert die volle Breite hat und nie umbricht.
  if (gross)
    return (
      <div className="rounded-xl bg-papier-matt px-3.5 py-2.5 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <dt className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-tinte-leise">{label}</dt>
          {knopf}
        </div>
        <dd className="mt-1 whitespace-nowrap text-[clamp(14px,4.3vw,18px)] font-semibold tabular-nums tracking-[0.03em] text-tinte dark:text-slate-100">
          {wert}
        </dd>
      </div>
    );
  return (
    <div className="flex items-center gap-3 rounded-xl bg-papier-matt px-3.5 py-2.5 dark:bg-slate-800">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinte-leise">{label}</dt>
        <dd className="mt-0.5 break-words text-[15px] font-semibold text-tinte dark:text-slate-100">{wert}</dd>
      </div>
      {knopf}
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
        className="card p-4 text-[13px] font-bold text-tinte-matt transition active:scale-[.99]"
      >
        Kontodaten ändern
      </button>
    );

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Kontodaten ändern</h2>
      <p className="mt-0.5 text-[13px] text-tinte-matt">
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
            <span className="text-[12px] font-semibold text-tinte-leise">{label}</span>
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
          className="rounded-xl border border-papier-linie px-4 py-2.5 text-sm font-bold text-tinte-matt dark:border-slate-700"
        >
          Abbrechen
        </button>
      </div>
    </section>
  );
}
