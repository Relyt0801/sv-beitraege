import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useTermine } from "../termine-store";
import { basisOffen } from "../lib/logic";
import { useNachschub } from "../lib/liste";
import {
  EINNAHME_QUELLEN, QUELLE_NAME, centAus, euro, euroKurz, useFinanzen,
  type Buchung, type Quelle,
} from "../lib/finanzen";

/** Folgt dem Hell/Dunkel-Schalter der App (Klasse "dark" am <html>). */
function useDunkel(): boolean {
  const [dunkel, setDunkel] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const beob = new MutationObserver(() => setDunkel(document.documentElement.classList.contains("dark")));
    beob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => beob.disconnect();
  }, []);
  return dunkel;
}

const heute = () => new Date().toISOString().slice(0, 10);

/**
 * Reiter "Finanzen": wie viel Geld die Stufe hat, woher es kommt und was noch
 * fehlt. Sehen dürfen Admin und Kassenwart – und wen der Admin im Rechte-Reiter
 * freischaltet (Recht "Finanzen ansehen"). Buchen nur mit "Kassenbuch führen".
 */
export function FinanzenTab() {
  const { can } = useRole();
  const darfBuchen = can("finanzen.manage");
  const fin = useFinanzen(true);
  const { students, settings } = useStore();
  const { aktionen } = useTermine();

  // ------------------------------------------------ Zahlen
  const zahlen = useMemo(() => {
    let stand = 0;
    let ein = 0;
    let aus = 0;
    const jeQuelle: Record<string, number> = { beitrag: 0, aktion: 0, spende: 0, sonstiges: 0 };
    const jeAktion = new Map<string, number>();
    let letzterAbgleich: string | null = null;
    for (const b of fin.buchungen) {
      stand += b.cent;
      if (b.quelle === "abgleich") {
        if (!letzterAbgleich || b.datum > letzterAbgleich) letzterAbgleich = b.datum;
        continue;
      }
      if (b.quelle === "ausgabe") {
        aus += -b.cent;
        continue;
      }
      ein += b.cent;
      jeQuelle[b.quelle] = (jeQuelle[b.quelle] || 0) + b.cent;
      if (b.quelle === "aktion") {
        const k = b.aktion_id || "";
        jeAktion.set(k, (jeAktion.get(k) || 0) + b.cent);
      }
    }
    return { stand, ein, aus, jeQuelle, jeAktion, letzterAbgleich };
  }, [fin.buchungen]);

  const offen = useMemo(() => {
    let cent = 0;
    let personen = 0;
    for (const s of students) {
      const o = basisOffen(s, settings.aktuelles_halbjahr, settings);
      if (o > 0) {
        cent += Math.round(o * 100);
        personen++;
      }
    }
    return { cent, personen };
  }, [students, settings]);

  if (!fin.bereit)
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-tinte-leise">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-papier-linie border-t-brand dark:border-slate-700" />
        <span className="text-sm">Kassenbuch wird geladen …</span>
      </div>
    );

  if (fin.fehler)
    return (
      <div className="card p-6 text-center text-sm text-tinte-matt">
        Das Kassenbuch lässt sich nicht laden: {fin.fehler}
      </div>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {/* ================================================ Kopf */}
      <section className="card p-5 lg:col-span-2">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-tinte-leise">Kontostand</div>
        <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className={`zahl font-zahl text-[2.4rem] font-extrabold leading-none tracking-[-0.02em] ${zahlen.stand < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
            {euro(zahlen.stand)}
          </span>
          <span className="pb-1 text-[12px] text-tinte-leise">
            laut Kassenbuch
            {zahlen.letzterAbgleich
              ? ` · zuletzt mit der Bank abgeglichen am ${new Date(zahlen.letzterAbgleich).toLocaleDateString("de-DE")}`
              : " · noch nie mit der Bank abgeglichen"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Kachel titel="Eingenommen" wert={euroKurz(zahlen.ein)} ton="plus" />
          <Kachel titel="Ausgegeben" wert={euroKurz(zahlen.aus)} ton="minus" />
          <Kachel
            titel="Noch offen"
            wert={euroKurz(offen.cent)}
            unter={`${offen.personen} ${offen.personen === 1 ? "Person" : "Personen"} · bis ${settings.aktuelles_halbjahr}`}
            breit
          />
        </div>
      </section>

      {/* ================================================ Ziel */}
      <ZielKarte
        zahlen={zahlen}
        ziel={fin.ziel}
        aktionName={(id) => aktionen.find((a) => a.id === id)?.titel || "Ohne Zuordnung"}
        aktionIcon={(id) => aktionen.find((a) => a.id === id)?.icon || "📌"}
        darf={darfBuchen}
        onZiel={fin.zielSetzen}
      />

      {/* ================================================ Buchen */}
      {darfBuchen && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <BuchenKarte onBuchen={fin.buchen} aktionen={aktionen} />
          <AbgleichKarte stand={zahlen.stand} onBuchen={fin.buchen} />
        </div>
      )}

      {/* ================================================ Verlauf */}
      <VerlaufKarte
        buchungen={fin.buchungen}
        darf={darfBuchen}
        onLoeschen={fin.loeschen}
        aktionName={(id) => aktionen.find((a) => a.id === id)?.titel || ""}
      />
    </div>
  );
}

function Kachel({
  titel, wert, unter, ton, breit,
}: { titel: string; wert: string; unter?: string; ton?: "plus" | "minus"; breit?: boolean }) {
  return (
    <div className={`rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800 ${breit ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tinte-leise">{titel}</div>
      <div
        className={`zahl mt-0.5 text-[1.2rem] font-extrabold leading-tight ${
          ton === "plus" ? "text-bezahlt dark:text-emerald-400" : ton === "minus" ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {ton === "plus" ? "+ " : ton === "minus" ? "− " : ""}
        {wert}
      </div>
      {unter && <div className="text-[11px] text-tinte-leise">{unter}</div>}
    </div>
  );
}

// ==================================================================== Ziel

function ZielKarte({
  zahlen, ziel, aktionName, aktionIcon, darf, onZiel,
}: {
  zahlen: { ein: number; stand: number; jeQuelle: Record<string, number>; jeAktion: Map<string, number> };
  ziel: { ziel_cent: number; ziel_titel: string };
  aktionName: (id: string) => string;
  aktionIcon: (id: string) => string;
  darf: boolean;
  onZiel: (z: { ziel_cent: number; ziel_titel: string }) => Promise<string | null>;
}) {
  const dunkel = useDunkel();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [betrag, setBetrag] = useState("");
  const [titel, setTitel] = useState("");

  const teile = EINNAHME_QUELLEN.map((q) => ({
    ...q,
    farbe: dunkel ? q.dunkel : q.hell,
    cent: Math.max(0, zahlen.jeQuelle[q.key] || 0),
  }));
  const summe = teile.reduce((n, t) => n + t.cent, 0);
  // Mit Ziel: der Kreis steht für das Ziel, der Rest bleibt grau.
  // Ohne Ziel: der Kreis zeigt nur die Aufteilung der Einnahmen.
  const ganz = ziel.ziel_cent > 0 ? Math.max(ziel.ziel_cent, summe) : summe;
  const prozent = ziel.ziel_cent > 0 ? Math.round((summe / ziel.ziel_cent) * 100) : null;

  const aktionListe = [...zahlen.jeAktion.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">
            {ziel.ziel_cent > 0 ? `Ziel: ${ziel.ziel_titel}` : "Woher das Geld kommt"}
          </h2>
          <p className="text-[12px] text-tinte-leise">
            {ziel.ziel_cent > 0
              ? `${euroKurz(summe)} von ${euroKurz(ziel.ziel_cent)} eingenommen`
              : "Noch kein Zielbetrag gesetzt."}
          </p>
        </div>
        {darf && (
          <button
            onClick={() => {
              setBetrag(ziel.ziel_cent ? String(ziel.ziel_cent / 100) : "");
              setTitel(ziel.ziel_titel);
              setBearbeiten(!bearbeiten);
            }}
            className="shrink-0 rounded-lg border border-papier-linie px-2.5 py-1.5 text-[12px] font-bold text-tinte-matt dark:border-slate-700 dark:text-slate-300"
          >
            {bearbeiten ? "Abbrechen" : "Ziel ändern"}
          </button>
        )}
      </div>

      {bearbeiten && (
        <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-brand/50 p-3">
          <input className="field" placeholder="Wofür? z. B. Abiball" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <div className="flex items-center gap-2">
            <input
              className="field min-w-0 flex-1"
              inputMode="decimal"
              placeholder="Zielbetrag, z. B. 12000"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
            <span className="font-bold text-tinte-matt">€</span>
            <button
              onClick={async () => {
                const c = centAus(betrag) ?? 0;
                const f = await onZiel({ ziel_cent: Math.max(0, c), ziel_titel: titel.trim() || "Abiball" });
                if (f) alert("Hat nicht geklappt: " + f);
                else setBearbeiten(false);
              }}
              className="btn-primary !w-auto shrink-0 px-4"
            >
              Speichern
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Kreis teile={teile} ganz={ganz} prozent={prozent} summe={summe} dunkel={dunkel} />

        {/* Legende: Name, Betrag, Anteil – immer lesbar, nie nur Farbe */}
        <ul className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 sm:w-auto sm:flex-1">
          {teile.map((t) => (
            <li key={t.key} className="flex items-center gap-2.5 text-[13px]">
              <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: t.farbe }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{t.label}</span>
              <span className="zahl shrink-0 font-bold">{euroKurz(t.cent)}</span>
              <span className="zahl w-10 shrink-0 text-right text-[12px] text-tinte-leise">
                {summe ? Math.round((t.cent / summe) * 100) : 0} %
              </span>
            </li>
          ))}
          {ziel.ziel_cent > summe && (
            <li className="flex items-center gap-2.5 text-[13px] text-tinte-leise">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-papier-linie dark:bg-slate-700" />
              <span className="min-w-0 flex-1 truncate">Fehlt noch</span>
              <span className="zahl shrink-0 font-bold">{euroKurz(ziel.ziel_cent - summe)}</span>
              <span className="w-10 shrink-0" />
            </li>
          )}
        </ul>
      </div>

      {aktionListe.length > 0 && (
        <div className="mt-4 border-t border-papier-linie pt-3 dark:border-slate-800">
          <div className="mb-1.5 text-[12px] font-semibold text-tinte-leise">Aktionen im Einzelnen</div>
          <ul className="grid gap-1">
            {aktionListe.map(([id, cent]) => (
              <li key={id} className="flex items-center gap-2 text-[13px]">
                <span className="shrink-0">{id ? aktionIcon(id) : "📌"}</span>
                <span className="min-w-0 flex-1 truncate">{id ? aktionName(id) : "Ohne Zuordnung"}</span>
                <span className="zahl shrink-0 font-semibold">{euroKurz(cent)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Das Kreisdiagramm (Ring). Jede Quelle ein Bogen, dazwischen 2 px Luft in
 * Hintergrundfarbe; der Rest bis zum Ziel bleibt als graue Spur stehen.
 */
function Kreis({
  teile, ganz, prozent, summe, dunkel,
}: {
  teile: { key: string; label: string; farbe: string; cent: number }[];
  ganz: number;
  prozent: number | null;
  summe: number;
  dunkel: boolean;
}) {
  const [aktiv, setAktiv] = useState<string | null>(null);
  const G = 176;
  const r = 70;
  const dicke = 20;
  const umfang = 2 * Math.PI * r;
  const luft = 2.5; // Abstand zwischen den Bögen in px
  const sichtbare = teile.filter((t) => t.cent > 0);

  let start = 0;
  const boegen = sichtbare.map((t) => {
    const laenge = ganz > 0 ? (t.cent / ganz) * umfang : 0;
    const b = { ...t, start, laenge: Math.max(0, laenge - (sichtbare.length > 1 || ganz > summe ? luft : 0)) };
    start += laenge;
    return b;
  });
  const hervor = aktiv ? sichtbare.find((t) => t.key === aktiv) : null;

  return (
    <div className="relative shrink-0" style={{ width: G, height: G }}>
      <svg width={G} height={G} viewBox={`0 0 ${G} ${G}`} className="-rotate-90" role="img" aria-label="Einnahmen nach Quelle">
        <circle cx={G / 2} cy={G / 2} r={r} fill="none" strokeWidth={dicke} stroke={dunkel ? "#334155" : "#e7e5df"} />
        {boegen.map((b) => (
          <circle
            key={b.key}
            cx={G / 2}
            cy={G / 2}
            r={r}
            fill="none"
            stroke={b.farbe}
            strokeWidth={aktiv === b.key ? dicke + 4 : dicke}
            strokeDasharray={`${b.laenge} ${umfang}`}
            strokeDashoffset={-b.start}
            className="cursor-pointer transition-[stroke-width] duration-150"
            onMouseEnter={() => setAktiv(b.key)}
            onMouseLeave={() => setAktiv(null)}
            onClick={() => setAktiv(aktiv === b.key ? null : b.key)}
          >
            <title>{`${b.label}: ${euroKurz(b.cent)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center leading-tight">
        {hervor ? (
          <>
            <span className="text-[11px] font-semibold text-tinte-leise">{hervor.label}</span>
            <span className="zahl text-[1.15rem] font-extrabold">{euroKurz(hervor.cent)}</span>
          </>
        ) : prozent !== null ? (
          <>
            <span className="zahl text-[1.7rem] font-extrabold">{prozent} %</span>
            <span className="text-[11px] text-tinte-leise">vom Ziel</span>
          </>
        ) : (
          <>
            <span className="zahl text-[1.15rem] font-extrabold">{euroKurz(summe)}</span>
            <span className="text-[11px] text-tinte-leise">eingenommen</span>
          </>
        )}
      </div>
    </div>
  );
}

// ==================================================================== Buchen

function BuchenKarte({
  onBuchen, aktionen,
}: {
  onBuchen: ReturnType<typeof useFinanzen>["buchen"];
  aktionen: { id: string; titel: string; icon: string }[];
}) {
  const [art, setArt] = useState<"ein" | "aus">("ein");
  const [quelle, setQuelle] = useState<Quelle>("aktion");
  const [aktionId, setAktionId] = useState("");
  const [betrag, setBetrag] = useState("");
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(heute());
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");

  async function speichern() {
    setFehler("");
    const c = centAus(betrag);
    if (!c || c <= 0) return setFehler("Bitte einen Betrag über 0 eingeben.");
    const q: Quelle = art === "aus" ? "ausgabe" : quelle;
    const aktion = aktionen.find((a) => a.id === aktionId);
    const t = titel.trim() || (q === "aktion" && aktion ? aktion.titel : "");
    if (!t) return setFehler("Wofür war das? Kurze Beschreibung reicht.");
    setBusy(true);
    const f = await onBuchen({
      datum,
      cent: art === "aus" ? -c : c,
      quelle: q,
      titel: t,
      aktion_id: q === "aktion" ? aktionId || null : null,
    });
    setBusy(false);
    if (f) return setFehler("Hat nicht geklappt: " + f);
    setOk(`${art === "aus" ? "Ausgabe" : "Einnahme"} über ${euro(c)} gebucht.`);
    setTimeout(() => setOk(""), 2500);
    setBetrag("");
    setTitel("");
  }

  const seg = "flex-1 rounded-lg py-2 text-[13px] font-bold transition";
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Buchung eintragen</h2>
      <p className="text-[12px] text-tinte-leise">
        Stufenbeiträge buchen sich von selbst, sobald sie auf „bezahlt“ stehen.
      </p>

      <div className="mt-3 flex gap-1.5 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
        <button onClick={() => setArt("ein")} className={`${seg} ${art === "ein" ? "bg-emerald-600 text-white" : "text-tinte-matt"}`}>
          + Einnahme
        </button>
        <button onClick={() => setArt("aus")} className={`${seg} ${art === "aus" ? "bg-red-600 text-white" : "text-tinte-matt"}`}>
          − Ausgabe
        </button>
      </div>

      {art === "ein" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EINNAHME_QUELLEN.filter((q) => q.key !== "beitrag").map((q) => (
            <button
              key={q.key}
              onClick={() => setQuelle(q.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${
                quelle === q.key ? "border-brand bg-brand/10 text-brand" : "border-papier-linie text-tinte-matt dark:border-slate-700"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: q.hell }} />
              {q.label}
            </button>
          ))}
        </div>
      )}

      {art === "ein" && quelle === "aktion" && (
        <select
          className="field mt-2"
          value={aktionId}
          onChange={(e) => setAktionId(e.target.value)}
        >
          <option value="">Welche Aktion?</option>
          {aktionen.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon} {a.titel}
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          className="field"
          placeholder={art === "aus" ? "Wofür? z. B. Waffeleisen" : "Beschreibung (optional bei Aktionen)"}
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
        />
        <div className="flex items-center gap-1 rounded-xl bg-papier-matt px-3 dark:bg-slate-800">
          <input
            className="w-20 bg-transparent py-2.5 text-right text-[15px] font-bold outline-none"
            inputMode="decimal"
            placeholder="0,00"
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void speichern()}
          />
          <span className="font-bold text-tinte-matt">€</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-semibold text-tinte-leise">
          Datum
          <input
            type="date"
            className="min-w-0 flex-1 rounded-lg border border-papier-linie bg-white px-2.5 py-2 text-[14px] text-tinte dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </label>
        <button disabled={busy} onClick={speichern} className="btn-primary !w-auto shrink-0 px-5 disabled:opacity-50">
          {busy ? "…" : "Buchen"}
        </button>
      </div>
      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
      {ok && <p className="mt-2 text-[13px] font-semibold text-bezahlt dark:text-emerald-400">✓ {ok}</p>}
    </section>
  );
}

/**
 * Abgleich: den echten Kontostand aus dem Online-Banking eintragen. Die App
 * bucht die Differenz als "Abgleich mit der Bank" – danach stimmt der Stand,
 * und im Verlauf steht nachvollziehbar, wann und um wie viel korrigiert wurde.
 */
function AbgleichKarte({ stand, onBuchen }: { stand: number; onBuchen: ReturnType<typeof useFinanzen>["buchen"] }) {
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);
  const c = centAus(bank);
  const diff = c === null ? null : c - stand;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Mit der Bank abgleichen</h2>
      <p className="text-[12px] leading-relaxed text-tinte-leise">
        Kontostand aus dem Online-Banking eintragen. Die Differenz wird als Abgleich gebucht.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-papier-matt px-3 dark:bg-slate-800">
          <input
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-bold outline-none"
            inputMode="decimal"
            placeholder="Stand laut Bank"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
          />
          <span className="font-bold text-tinte-matt">€</span>
        </div>
        <button
          disabled={busy || diff === null || diff === 0}
          onClick={async () => {
            if (diff === null || diff === 0) return;
            if (!confirm(`Kontostand auf ${euro(c!)} setzen? Gebucht wird ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}.`)) return;
            setBusy(true);
            const f = await onBuchen({ datum: heute(), cent: diff, quelle: "abgleich", titel: "Abgleich mit der Bank" });
            setBusy(false);
            if (f) alert("Hat nicht geklappt: " + f);
            else setBank("");
          }}
          className="btn-primary !w-auto shrink-0 px-4 disabled:opacity-40"
        >
          Abgleichen
        </button>
      </div>
      {diff !== null && (
        <p className="mt-2 text-[12px] text-tinte-matt dark:text-slate-400">
          {diff === 0
            ? "Stimmt genau mit dem Kassenbuch überein."
            : `Unterschied zum Kassenbuch: ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}`}
        </p>
      )}
    </section>
  );
}

// ==================================================================== Verlauf

type Filter = "alle" | "ein" | "aus" | Quelle;

function VerlaufKarte({
  buchungen, darf, onLoeschen, aktionName,
}: {
  buchungen: Buchung[];
  darf: boolean;
  onLoeschen: (id: string) => Promise<string | null>;
  aktionName: (id: string) => string;
}) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [q, setQ] = useState("");

  const liste = useMemo(() => {
    const n = q.trim().toLowerCase();
    return buchungen.filter((b) => {
      if (filter === "ein" && (b.cent < 0 || b.quelle === "abgleich")) return false;
      if (filter === "aus" && b.quelle !== "ausgabe") return false;
      if (!["alle", "ein", "aus"].includes(filter) && b.quelle !== filter) return false;
      if (n && !b.titel.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [buchungen, filter, q]);

  const { sichtbar, marke } = useNachschub(liste.length, [filter, q]);

  // Nach Monat gruppieren, mit Monatssumme
  const gruppen = useMemo(() => {
    const m = new Map<string, Buchung[]>();
    for (const b of liste.slice(0, sichtbar)) {
      const k = b.datum.slice(0, 7);
      (m.get(k) || m.set(k, []).get(k)!).push(b);
    }
    return [...m.entries()];
  }, [liste, sichtbar]);

  const FILTER: [Filter, string][] = [
    ["alle", "Alle"],
    ["ein", "Einnahmen"],
    ["aus", "Ausgaben"],
    ["beitrag", "Beiträge"],
    ["aktion", "Aktionen"],
    ["spende", "Spenden"],
  ];

  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="text-lg font-bold">Verlauf</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FILTER.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition ${
              filter === k ? "bg-brand text-white" : "bg-papier-matt text-tinte-matt dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input className="field mt-2" placeholder="Suchen, z. B. Name oder Waffel …" value={q} onChange={(e) => setQ(e.target.value)} />

      {liste.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-tinte-leise">Keine Buchungen.</p>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-4">
          {gruppen.map(([monat, zeilen]) => {
            const summe = zeilen.reduce((n, b) => n + b.cent, 0);
            return (
              <div key={monat}>
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-tinte-leise">
                    {new Date(monat + "-01T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
                  </span>
                  <span className="zahl text-[12px] font-semibold text-tinte-leise">
                    {summe >= 0 ? "+" : "−"} {euro(Math.abs(summe))}
                  </span>
                </div>
                <ul className="divide-y divide-papier-linie overflow-hidden rounded-xl border border-papier-linie dark:divide-slate-800 dark:border-slate-800">
                  {zeilen.map((b) => (
                    <Zeile key={b.id} b={b} darf={darf} onLoeschen={onLoeschen} aktionName={aktionName} />
                  ))}
                </ul>
              </div>
            );
          })}
          {sichtbar < liste.length && <div ref={marke} className="h-6" />}
        </div>
      )}
    </section>
  );
}

function Zeile({
  b, darf, onLoeschen, aktionName,
}: {
  b: Buchung;
  darf: boolean;
  onLoeschen: (id: string) => Promise<string | null>;
  aktionName: (id: string) => string;
}) {
  const q = EINNAHME_QUELLEN.find((x) => x.key === b.quelle);
  const plus = b.cent > 0;
  return (
    <li className="flex items-center gap-2.5 bg-white px-3 py-2.5 dark:bg-slate-900">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: q ? q.hell : b.quelle === "ausgabe" ? "#dc2626" : "#94a3b8" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{b.titel || QUELLE_NAME[b.quelle]}</span>
        <span className="block truncate text-[11px] text-tinte-leise">
          {new Date(b.datum + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          {" · "}
          {QUELLE_NAME[b.quelle]}
          {b.aktion_id && aktionName(b.aktion_id) ? ` · ${aktionName(b.aktion_id)}` : ""}
          {b.automatisch ? " · automatisch" : ""}
        </span>
      </span>
      <span className={`zahl shrink-0 text-[14px] font-bold ${plus ? "text-bezahlt dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {plus ? "+" : "−"} {euro(Math.abs(b.cent))}
      </span>
      {darf && !b.automatisch && (
        <button
          onClick={async () => {
            if (!confirm(`Buchung „${b.titel}" über ${euro(Math.abs(b.cent))} löschen?`)) return;
            const f = await onLoeschen(b.id);
            if (f) alert("Löschen hat nicht geklappt: " + f);
          }}
          className="shrink-0 rounded-md px-1.5 text-[15px] text-tinte-leise hover:text-red-500"
          aria-label="Buchung löschen"
          title="Buchung löschen"
        >
          ✕
        </button>
      )}
    </li>
  );
}
