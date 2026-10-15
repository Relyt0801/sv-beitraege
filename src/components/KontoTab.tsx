import { useState } from "react";
import { SkelettText } from "./Skelett";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import type { Student } from "../lib/types";
import { basisOffen } from "../lib/logic";
import { Icon } from "./Icon";

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
export function KontoTab({
  personen,
  du = false,
  zweck: festerZweck,
  betrag,
  hinweis,
}: {
  personen?: Student[];
  du?: boolean;
  /** Fester Verwendungszweck (z. B. für eine Ticketbestellung) statt „Name Stufe“ */
  zweck?: string;
  /** Betrag, der überwiesen werden soll (wird oben mit angezeigt) */
  betrag?: string;
  /** Eigener Hinweistext unter der Überschrift */
  hinweis?: string;
} = {}) {
  const { konto, kontoSpeichern, kinder: meineKinder } = useEltern();
  const { role } = useRole();
  // Eltern sehen hier nur die eigenen Kinder – dafür sorgt die Datenbank,
  // und zur Sicherheit filtert die App noch einmal nach der Zuordnung.
  // Schüler (personen) sehen nur sich selbst.
  const { students, settings } = useStore();
  // Gleiche Reihenfolge wie in der Übersicht: nach Vorname
  const kinder = (personen ?? (role === "eltern" ? students.filter((s) => meineKinder.includes(s.id)) : students))
    .slice()
    .sort((a, b) => a.vorname.localeCompare(b.vorname, "de"));
  const [kopiert, setKopiert] = useState<string | null>(null);
  const darfAendern = !personen && (role === "admin" || role === "kassenwart");

  if (!konto)
    return (
      <div className="card p-6">
        <SkelettText zeilen={4} />
      </div>
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

  // Beträge zeigen wir nur, wo die Person selbst überweist: Eltern (ihre Kinder)
  // und Schüler (sich selbst) – nicht in der Gesamtliste für Admin/Kassenwart.
  const mitBetrag = !festerZweck && (role === "eltern" || Boolean(personen));
  const jahr = jahrgangKurz(settings.aktuelles_halbjahr);
  const mehrere = kinder.length > 1;

  // grid-cols-1 (statt nur grid): Karten duerfen schmaler werden als ihr
  // laengster Inhalt. Sonst schiebt die IBAN auf kleinen iPhones die ganze
  // Seite breiter als den Bildschirm.
  return (
    <div className="grid grid-cols-1 gap-3">
      <section className={personen ? "" : "card p-5"}>
        <h2 className="text-[1.25rem] font-bold tracking-[-0.01em]">{du ? "So überweist du" : "So überweisen Sie"}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400">
          {hinweis
            ? hinweis
            : du
            ? "Meistens zahlen das deine Eltern. Falls du selbst überweist: bitte immer den Verwendungszweck angeben – sonst können wir das Geld nicht zuordnen."
            : "Bitte immer den Verwendungszweck angeben – sonst können wir das Geld nicht zuordnen. Bei mehreren Kindern bitte für jedes Kind einzeln überweisen."}
        </p>

        {/* Eltern am Rechner: links wohin, rechts was (je Kind) – vorher eine
            schmale Spalte mitten im Bildschirm. Im Blatt (personen) bleibt es
            eine Spalte. */}
        <div className={personen ? "" : "lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4"}>
        {/* Wohin das Geld geht */}
        <div className="gruppe-zellen mt-4" data-tour="konto-daten">
          <KontoWert label="Empfänger" wert={konto.inhaber} onKopieren={() => kopieren(konto.inhaber, "inhaber")} kopiert={kopiert === "inhaber"} />
          <KontoWert
            label="IBAN"
            wert={ibanLesbar(konto.iban)}
            gross
            onKopieren={() => kopieren(konto.iban.replace(/\s+/g, ""), "iban")}
            kopiert={kopiert === "iban"}
          />
          <KontoWert label="BIC" wert={konto.bic} onKopieren={() => kopieren(konto.bic, "bic")} kopiert={kopiert === "bic"} />
          <KontoWert label="Bank" wert={konto.bank} />
        </div>

        {/* Was überwiesen wird: je Kind Betrag und Verwendungszweck zum Kopieren */}
        <div className={personen ? "" : "lg:pt-1"}>
        {festerZweck ? (
          <div className="gruppe-zellen mt-3">
            {betrag && <KontoWert label="Betrag" wert={betrag} stark onKopieren={() => kopieren(betrag.replace(/\s*€$/, ""), "betrag")} kopiert={kopiert === "betrag"} />}
            <KontoWert label="Verwendungszweck" gross wert={festerZweck} onKopieren={() => kopieren(festerZweck, "fest")} kopiert={kopiert === "fest"} />
          </div>
        ) : (
          (kinder.length ? kinder : [null]).map((k) => {
            // Kein Komma vor der Stufe: "Adams, Tyler Q2"
            const zweck = k ? `${k.nachname}, ${k.vorname} ${jahr}` : `Nachname, Vorname ${jahr}`;
            const id = k ? `zweck-${k.id}` : "zweck";
            const offen = mitBetrag && k ? basisOffen(k, settings.aktuelles_halbjahr, settings) : null;
            return (
              <div key={id} className="mt-3">
                {mehrere && k && <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">Für {k.vorname}</h3>}
                <div className="gruppe-zellen">
                  {offen !== null &&
                    (offen > 0 ? (
                      <KontoWert
                        label={mehrere && k ? `Betrag für ${k.vorname}` : "Betrag"}
                        wert={`${offen} €`}
                        stark
                        unter="Beitrag, der bis jetzt offen ist"
                        onKopieren={() => kopieren(String(offen), `betrag-${id}`)}
                        kopiert={kopiert === `betrag-${id}`}
                      />
                    ) : (
                      <KontoWert label="Betrag" wert="0 € – nichts offen" />
                    ))}
                  <KontoWert
                    label={mehrere && k ? `Verwendungszweck für ${k.vorname}` : "Verwendungszweck"}
                    gross
                    wert={zweck}
                    onKopieren={() => kopieren(zweck, id)}
                    kopiert={kopiert === id}
                  />
                </div>
              </div>
            );
          })
        )}
        </div>
        </div>

        {/* Der Hinweis ist für Eltern geschrieben („bei mehreren Kindern …“) */}
        {konto.hinweis && !du && (
          <p className="mt-3 px-1 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">{konto.hinweis}</p>
        )}
      </section>

      {darfAendern && <KontoBearbeiten onSpeichern={kontoSpeichern} konto={konto} />}
    </div>
  );
}

/**
 * Eine Zeile der Kontodaten: kleine Beschriftung oben, Wert darunter,
 * „kopieren“ rechts (mind. 44 px hoch). Die Beschriftung bricht nur zwischen
 * Wörtern um, nie mitten im Wort.
 */
function KontoWert({
  label,
  wert,
  gross,
  stark,
  unter,
  onKopieren,
  kopiert,
}: {
  label: string;
  wert: string;
  /** Lange Werte (IBAN, Verwendungszweck): bekommen die volle Breite unter dem Knopf. */
  gross?: boolean;
  /** Betrag: größere Schrift */
  stark?: boolean;
  unter?: string;
  onKopieren?: () => void;
  kopiert?: boolean;
}) {
  const knopf = onKopieren && (
    <button
      type="button"
      onClick={onKopieren}
      className={`${kopiert ? "btn-klein !bg-[#1E7B34]" : "btn-klein-grau"} shrink-0`}
      aria-label={`${label} kopieren`}
    >
      {kopiert ? (
        <>
          <Icon name="haken" size={15} strich={2.6} /> kopiert
        </>
      ) : (
        "kopieren"
      )}
    </button>
  );
  const beschriftung = <div className="min-w-0 flex-1 text-[12px] font-medium leading-tight text-tinte-leise">{label}</div>;
  // Lange Werte: Knopf in die Kopfzeile, damit der Wert die volle Breite hat.
  if (gross)
    return (
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          {beschriftung}
          {knopf}
        </div>
        {/* Ab 12 px passt die IBAN auch aufs iPhone SE (320 px). Reicht es
            trotzdem nicht, scrollt nur diese Zeile, nie die ganze Seite. */}
        <div className="no-scrollbar mt-1 overflow-x-auto whitespace-nowrap text-[clamp(12px,3.75vw,18px)] font-semibold tabular-nums tracking-[0.03em] text-tinte dark:text-slate-100">
          {wert}
        </div>
      </div>
    );
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-tight text-tinte-leise">{label}</div>
        <div className={`mt-0.5 break-words font-semibold text-tinte dark:text-slate-100 ${stark ? "zahl text-[1.4rem] leading-tight" : "text-[15px]"}`}>
          {wert}
        </div>
        {unter && <div className="text-[12px] text-tinte-leise">{unter}</div>}
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
        className="btn-grau"
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
          className="btn-primary flex-1"
        >
          Speichern
        </button>
        <button
          onClick={() => setOffen(false)}
          className="btn-grau flex-1"
        >
          Abbrechen
        </button>
      </div>
    </section>
  );
}
