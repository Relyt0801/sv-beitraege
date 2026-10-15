import { useState } from "react";
import { SkelettText } from "./Skelett";
import { useEltern } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import type { Student } from "../lib/types";
import { basisOffen } from "../lib/logic";
import { Icon } from "./Icon";
import { melde } from "../lib/melder";

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
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Manche Browser (In-App-Browser, WebViews, ohne https) verweigern die
      // Zwischenablage. Dann der alte Weg über ein unsichtbares Textfeld –
      // vorher passierte hier still gar nichts.
      ok = kopierenAlt(text);
    }
    if (ok) {
      setKopiert(was);
      setTimeout(() => setKopiert(null), 1800);
    } else {
      melde("Kopieren nicht möglich – bitte den Wert lange drücken und kopieren.", "fehler");
    }
  }

  // Beträge zeigen wir nur, wo die Person selbst überweist: Eltern (ihre Kinder)
  // und Schüler (sich selbst) – nicht in der Gesamtliste für Admin/Kassenwart.
  const mitBetrag = !festerZweck && (role === "eltern" || Boolean(personen));
  const jahr = jahrgangKurz(settings.aktuelles_halbjahr);
  const mehrere = kinder.length > 1;
  // Eigene Seite (Eltern, Reiter „Konto“): der Seitentitel reicht als
  // Überschrift, am Rechner zweispaltig. Im Blatt (personen) eine Spalte.
  const seite = !personen;
  // Der Hinweis der Kasse (Admin) – nicht für Schüler, er ist für Eltern geschrieben
  const kassenHinweis = konto.hinweis && !du ? konto.hinweis : "";

  // grid-cols-1 (statt nur grid): Karten duerfen schmaler werden als ihr
  // laengster Inhalt. Sonst schiebt die IBAN auf kleinen iPhones die ganze
  // Seite breiter als den Bildschirm.
  // Kleine Überschrift über einer Gruppe – wie in den iOS-Einstellungen
  const kopf = (text: string) => <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise">{text}</h3>;

  return (
    <div className="grid grid-cols-1 gap-3">
      <section className={seite ? "card p-5" : ""}>
        {/* Keine eigene Überschrift („So überweisen Sie“): Auf der eigenen
            Seite steht oben schon „Kontodaten“, im Blatt (personen) der Titel
            des Blatts („Überweisen“, „Tickets überweisen“) – sie wäre doppelt */}
        <p className={`text-[13px] leading-relaxed text-tinte-matt dark:text-slate-400 ${seite ? "px-4" : ""}`}>
          {hinweis
            ? hinweis
            : du
            ? "Meistens zahlen das deine Eltern. Falls du selbst überweist: bitte immer den Verwendungszweck angeben – sonst können wir das Geld nicht zuordnen."
            : // Der „je Kind einzeln“-Satz nur bei Geschwistern – und nicht, wenn
              // ihn der Hinweis der Kasse ohnehin schon sagt
              "Bitte immer den Verwendungszweck angeben – sonst können wir das Geld nicht zuordnen." +
              (mehrere && !kassenHinweis ? " Bitte für jedes Kind einzeln überweisen." : "")}
        </p>

        {/* Eltern am Rechner: links wohin, rechts was (je Kind) – vorher eine
            schmale Spalte mitten im Bildschirm. Beide Spalten beginnen mit
            einer kleinen Überschrift, damit die Gruppen auf einer Höhe
            stehen. Im Blatt (personen) bleibt es eine Spalte. */}
        <div className={seite ? "mt-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-4" : ""}>
          {/* Wohin das Geld geht */}
          <div>
            {seite && kopf("Konto der Stufenkasse")}
            <div className={`gruppe-zellen ${seite ? "" : "mt-4"}`} data-tour="konto-daten">
              <KontoWert label="Empfänger" wert={konto.inhaber} onKopieren={() => kopieren(konto.inhaber, "inhaber")} kopiert={kopiert === "inhaber"} />
              <KontoWert
                label="IBAN"
                wert={ibanLesbar(konto.iban)}
                gross
                inline={seite}
                onKopieren={() => kopieren(konto.iban.replace(/\s+/g, ""), "iban")}
                kopiert={kopiert === "iban"}
              />
              {/* Die Bank als zweite Zeile unter der BIC statt einer eigenen Zeile */}
              <KontoWert label="BIC" wert={konto.bic} unter={konto.bank || undefined} onKopieren={() => kopieren(konto.bic, "bic")} kopiert={kopiert === "bic"} />
            </div>
            {/* Hinweis der Kasse direkt unter den Kontodaten (vorher ganz unten
                über die volle Breite) */}
            {seite && kassenHinweis && <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-matt dark:text-slate-300">{kassenHinweis}</p>}
          </div>

          {/* Was überwiesen wird: je Kind Betrag und Verwendungszweck zum Kopieren */}
          <div>
            {festerZweck ? (
              <div className="gruppe-zellen mt-3">
                {betrag && <KontoWert label="Betrag" wert={betrag} stark onKopieren={() => kopieren(betrag.replace(/\s*€$/, ""), "betrag")} kopiert={kopiert === "betrag"} />}
                <KontoWert label="Verwendungszweck" gross wert={festerZweck} onKopieren={() => kopieren(festerZweck, "fest")} kopiert={kopiert === "fest"} />
              </div>
            ) : (
              (kinder.length ? kinder : [null]).map((k, i) => {
                // Kein Komma vor der Stufe: "Adams, Tyler Q2"
                const zweck = k ? `${k.nachname}, ${k.vorname} ${jahr}` : `Nachname, Vorname ${jahr}`;
                const id = k ? `zweck-${k.id}` : "zweck";
                const offen = mitBetrag && k ? basisOffen(k, settings.aktuelles_halbjahr, settings) : null;
                // Die Überschrift sagt schon, für wen – die Zeilen heißen dann
                // nur „Betrag“ und „Verwendungszweck“ (vorher dreimal der Name).
                // Auf der eigenen Seite immer mit Überschrift (auch bei einem
                // Kind), damit beide Spalten gleich beginnen.
                const ueber = k && (mehrere || seite);
                return (
                  <div key={id} className={`mt-3 ${seite && i === 0 ? "lg:mt-0" : ""}`}>
                    {ueber && kopf(`Für ${k.vorname}`)}
                    <div className="gruppe-zellen">
                      {offen !== null &&
                        (offen > 0 ? (
                          <KontoWert
                            label="Betrag"
                            name={ueber ? `Betrag für ${k.vorname}` : undefined}
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
                        label="Verwendungszweck"
                        name={ueber ? `Verwendungszweck für ${k.vorname}` : undefined}
                        gross
                        inline={seite}
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

        {/* Im Blatt: der Hinweis der Kasse am Ende (er ist für Eltern geschrieben) */}
        {!seite && kassenHinweis && (
          <p className="mt-3 px-1 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">{kassenHinweis}</p>
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
  name,
  wert,
  gross,
  inline,
  stark,
  unter,
  onKopieren,
  kopiert,
}: {
  label: string;
  /** Name für Vorlesehilfen, wenn die Beschriftung allein nicht eindeutig ist („Verwendungszweck für Nour“) */
  name?: string;
  wert: string;
  /** Lange Werte (IBAN, Verwendungszweck): bekommen die volle Breite unter dem Knopf. */
  gross?: boolean;
  /** Mit `gross`: am Rechner trotzdem Wert und Knopf in einer Zeile (spart Höhe) */
  inline?: boolean;
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
      aria-label={`${name ?? label} kopieren`}
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
  // „inline“: am Rechner ist genug Platz – dann wie eine normale Zeile
  // (Beschriftung und Wert links, Knopf rechts), am Handy wie gehabt.
  if (gross && inline)
    return (
      // Handy: oben Beschriftung | Knopf, darunter der Wert über die volle
      // Breite. Rechner: Knopf rechts über beide Zeilen, Wert unter der
      // Beschriftung – eine normale Zeile.
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 lg:min-h-[56px]">
        <div className="col-start-1 row-start-1 min-w-0 text-[12px] font-medium leading-tight text-tinte-leise">{label}</div>
        <div className="col-start-2 row-start-1 lg:row-span-2">{knopf}</div>
        <div className="no-scrollbar col-span-2 row-start-2 mt-1 select-all overflow-x-auto whitespace-nowrap text-[clamp(12px,3.75vw,18px)] font-semibold tabular-nums tracking-[0.03em] text-tinte dark:text-slate-100 lg:col-span-1 lg:mt-0.5 lg:whitespace-normal lg:text-[17px] lg:leading-snug">
          {wert}
        </div>
      </div>
    );
  if (gross)
    return (
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          {beschriftung}
          {knopf}
        </div>
        {/* Ab 12 px passt die IBAN auch aufs iPhone SE (320 px). Reicht es
            trotzdem nicht, scrollt nur diese Zeile, nie die ganze Seite. */}
        <div className="no-scrollbar mt-1 select-all overflow-x-auto whitespace-nowrap text-[clamp(12px,3.75vw,18px)] font-semibold tabular-nums tracking-[0.03em] text-tinte dark:text-slate-100">
          {wert}
        </div>
      </div>
    );
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-tight text-tinte-leise">{label}</div>
        <div className={`mt-0.5 select-all break-words font-semibold text-tinte dark:text-slate-100 ${stark ? "zahl text-[1.4rem] leading-tight" : "text-[15px]"}`}>
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

/**
 * Kopieren ohne Zwischenablage-Schnittstelle: über ein unsichtbares Textfeld.
 * `readonly`, damit auf dem iPhone keine Tastatur aufspringt.
 */
function kopierenAlt(text: string): boolean {
  try {
    const feld = document.createElement("textarea");
    feld.value = text;
    feld.setAttribute("readonly", "");
    feld.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(feld);
    feld.select();
    feld.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    feld.remove();
    return ok;
  } catch {
    return false;
  }
}
