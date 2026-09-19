import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { useTermine } from "../termine-store";
import { useProfiles } from "../profiles-store";
import { basisOffen } from "../lib/logic";
import { useNachschub } from "../lib/liste";
import { COMMITTEES, committeeIcon, committeeLabel } from "../lib/committees";
import {
  EINNAHME_QUELLEN, QUELLE_NAME, centAus, euro, euroKurz, useFinanzen,
  type Buchung, type FinanzenValue, type Quelle,
} from "../lib/finanzen";
import type { KostenAnfrage, KostenValue } from "../lib/kosten";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";

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
const kurzTag = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Wofür eine Buchung ist – in einem Wort. */
function zuweisungText(b: Buchung, aktionName: (id: string) => string): string {
  if (b.aktion_id && aktionName(b.aktion_id)) return aktionName(b.aktion_id);
  if (b.komitee) return committeeLabel(b.komitee);
  return QUELLE_NAME[b.quelle];
}

/**
 * Reiter "Finanzen".
 *
 * Wer was sieht:
 *  - Kassenwart/Admin ("Kassenbuch führen"): alles, bucht, entscheidet Kostenanfragen
 *  - "Finanzen ansehen" (vom Admin freigeschaltet) und der Aufsichtsrat: alles, nur lesen
 *  - Komitee-Vorsitzende: nur ihre Kostenanfragen
 */
export function FinanzenTab({ kosten }: { kosten: KostenValue }) {
  const { can, isStaff } = useRole();
  const darfBuchen = can("finanzen.manage");
  const darfSehen = darfBuchen || can("finanzen.view") || kosten.aufsichtsrat;
  const nurLesen = darfSehen && !darfBuchen;
  const fin = useFinanzen(darfSehen);
  const { students, settings } = useStore();
  const { aktionen, meineVorsitze } = useTermine();
  const [buchen, setBuchen] = useState<"ein" | "aus" | null>(null);
  const [einstellungen, setEinstellungen] = useState(false);

  const aktionName = (id: string) => aktionen.find((a) => a.id === id)?.titel || "";

  // ------------------------------------------------ Zahlen
  const zahlen = useMemo(() => {
    let stand = 0;
    let ein = 0;
    let aus = 0;
    const jeQuelle: Record<string, number> = { beitrag: 0, aktion: 0, spende: 0, sonstiges: 0 };
    let letzterAbgleich: string | null = null;
    for (const b of fin.buchungen) {
      stand += b.cent;
      if (b.quelle === "abgleich") {
        if (!letzterAbgleich || b.datum > letzterAbgleich) letzterAbgleich = b.datum;
        continue;
      }
      if (b.cent < 0) {
        aus += -b.cent;
        continue;
      }
      ein += b.cent;
      jeQuelle[b.quelle] = (jeQuelle[b.quelle] || 0) + b.cent;
    }
    return { stand, ein, aus, jeQuelle, letzterAbgleich };
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

  // Nur Vorsitz, keine Finanzrechte: nur die Kostenanfragen
  if (!darfSehen) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6">
        <KostenKarte kosten={kosten} darfEntscheiden={false} vorsitze={meineVorsitze} />
      </div>
    );
  }

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

  const zeigeAnfragen = darfSehen || meineVorsitze.length > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      {nurLesen && (
        <div className="rounded-xl bg-papier-matt px-4 py-2.5 text-[13px] text-tinte-matt dark:bg-slate-800 dark:text-slate-300 lg:col-span-2">
          👁 Nur lesen{kosten.aufsichtsrat ? " – du siehst die Finanzen als Aufsichtsrat" : ""}. Buchen kann nur der Kassenwart.
        </div>
      )}

      {/* ================================================ Übersicht */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <UebersichtKarte
          zahlen={zahlen}
          offen={isStaff ? offen : null}
          halbjahr={settings.aktuelles_halbjahr}
          ziel={fin.ziel}
          darf={darfBuchen}
          onEinstellungen={() => setEinstellungen(true)}
        />
        {darfBuchen && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBuchen("ein")}
              className="rounded-2xl bg-emerald-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm active:scale-[0.98]"
            >
              + Einnahme
            </button>
            <button
              onClick={() => setBuchen("aus")}
              className="rounded-2xl bg-red-600 py-3.5 text-[15px] font-extrabold text-white shadow-sm active:scale-[0.98]"
            >
              − Ausgabe
            </button>
          </div>
        )}
      </div>

      {/* ================================================ Kostenanfragen */}
      {zeigeAnfragen && (
        <KostenKarte kosten={kosten} darfEntscheiden={darfBuchen} vorsitze={meineVorsitze} onEntschieden={fin.neuLaden} />
      )}

      {/* ================================================ Verlauf */}
      <VerlaufKarte buchungen={fin.buchungen} darf={darfBuchen} onLoeschen={fin.loeschen} aktionName={aktionName} />

      {darfBuchen && (
        <>
          <BuchungSheet
            art={buchen}
            onClose={() => setBuchen(null)}
            onBuchen={fin.buchen}
            aktionen={aktionen}
          />
          <EinstellungenSheet
            open={einstellungen}
            onClose={() => setEinstellungen(false)}
            fin={fin}
            stand={zahlen.stand}
          />
        </>
      )}
    </div>
  );
}

// ==================================================================== Übersicht

function UebersichtKarte({
  zahlen, offen, halbjahr, ziel, darf, onEinstellungen,
}: {
  zahlen: { stand: number; ein: number; aus: number; jeQuelle: Record<string, number>; letzterAbgleich: string | null };
  /** null: wer nicht alle Personen sieht, bekäme hier eine falsche Summe */
  offen: { cent: number; personen: number } | null;
  halbjahr: string;
  ziel: { ziel_cent: number; ziel_titel: string };
  darf: boolean;
  onEinstellungen: () => void;
}) {
  const dunkel = useDunkel();
  const teile = EINNAHME_QUELLEN.map((q) => ({
    ...q,
    farbe: dunkel ? q.dunkel : q.hell,
    cent: Math.max(0, zahlen.jeQuelle[q.key] || 0),
  }));
  const summe = teile.reduce((n, t) => n + t.cent, 0);
  const ganz = ziel.ziel_cent > 0 ? Math.max(ziel.ziel_cent, summe) : summe;
  const prozent = ziel.ziel_cent > 0 ? Math.round((summe / ziel.ziel_cent) * 100) : null;

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-tinte-leise">Kontostand</div>
          <div
            className={`zahl mt-0.5 font-zahl text-[2.3rem] font-extrabold leading-none tracking-[-0.02em] ${
              zahlen.stand < 0 ? "text-red-600 dark:text-red-400" : ""
            }`}
          >
            {euro(zahlen.stand)}
          </div>
          <div className="mt-1 text-[11px] text-tinte-leise">
            {zahlen.letzterAbgleich
              ? `mit der Bank abgeglichen am ${new Date(zahlen.letzterAbgleich).toLocaleDateString("de-DE")}`
              : "noch nicht mit der Bank abgeglichen"}
          </div>
        </div>
        {darf && (
          <button onClick={onEinstellungen} className="iconbtn shrink-0" aria-label="Ziel und Bankabgleich" title="Ziel und Bankabgleich">
            ⚙︎
          </button>
        )}
      </div>

      {/* Drei Zahlen in einer Zeile */}
      <dl className={`mt-4 grid gap-2 text-center ${offen ? "grid-cols-3" : "grid-cols-2"}`}>
        <Zahl titel="Rein" wert={euroKurz(zahlen.ein)} ton="plus" />
        <Zahl titel="Raus" wert={euroKurz(zahlen.aus)} ton="minus" />
        {offen && <Zahl titel="Noch offen" wert={euroKurz(offen.cent)} unter={`${offen.personen} Pers. · ${halbjahr}`} />}
      </dl>

      {/* Kreis + Legende */}
      <div className="mt-4 flex flex-col items-center gap-4 border-t border-papier-linie pt-4 dark:border-slate-800 sm:flex-row">
        <Kreis teile={teile} ganz={ganz} prozent={prozent} summe={summe} dunkel={dunkel} />
        <div className="w-full min-w-0 sm:flex-1">
          <div className="mb-1.5 text-[13px] font-bold">
            {ziel.ziel_cent > 0 ? `Ziel ${ziel.ziel_titel}: ${euroKurz(ziel.ziel_cent)}` : "Woher das Geld kommt"}
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {teile.map((t) => (
              <li key={t.key} className="flex items-center gap-2.5 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: t.farbe }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{t.label}</span>
                <span className="zahl shrink-0 font-bold">{euroKurz(t.cent)}</span>
              </li>
            ))}
            {ziel.ziel_cent > summe && (
              <li className="flex items-center gap-2.5 text-[13px] text-tinte-leise">
                <span className="h-3 w-3 shrink-0 rounded-[3px] bg-papier-linie dark:bg-slate-700" />
                <span className="min-w-0 flex-1 truncate">Fehlt noch</span>
                <span className="zahl shrink-0 font-bold">{euroKurz(ziel.ziel_cent - summe)}</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Zahl({ titel, wert, unter, ton }: { titel: string; wert: string; unter?: string; ton?: "plus" | "minus" }) {
  return (
    <div className="min-w-0 rounded-xl bg-papier-matt px-1.5 py-2 dark:bg-slate-800">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-tinte-leise">{titel}</dt>
      <dd
        className={`zahl truncate text-[15px] font-extrabold leading-tight ${
          ton === "plus" ? "text-bezahlt dark:text-emerald-400" : ton === "minus" ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {wert}
      </dd>
      {unter && <dd className="truncate text-[10.5px] text-tinte-leise">{unter}</dd>}
    </div>
  );
}

// ==================================================================== Buchen

/**
 * Eine Buchung in vier Angaben: Art, Betrag, Datum, wofür.
 * Die Beschreibung ist freiwillig – ohne steht dort die Zuordnung.
 */
function BuchungSheet({
  art, onClose, onBuchen, aktionen,
}: {
  art: "ein" | "aus" | null;
  onClose: () => void;
  onBuchen: FinanzenValue["buchen"];
  aktionen: { id: string; titel: string; icon: string }[];
}) {
  const [typ, setTyp] = useState<"ein" | "aus">("ein");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState(heute());
  const [zu, setZu] = useState("");
  const [titel, setTitel] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!art) return;
    setTyp(art);
    setBetrag("");
    setDatum(heute());
    setZu("");
    setTitel("");
    setFehler("");
  }, [art]);

  // Zuordnung als "aktion:<id>", "komitee:<slug>" oder eine Quelle
  function aufloesen(): { quelle: Quelle; aktion_id: string | null; komitee: string | null; name: string } | null {
    if (!zu) return null;
    const [k, v] = zu.split(":");
    if (k === "aktion") {
      const a = aktionen.find((x) => x.id === v);
      return { quelle: typ === "aus" ? "ausgabe" : "aktion", aktion_id: v, komitee: null, name: a?.titel || "Aktion" };
    }
    if (k === "komitee")
      return { quelle: typ === "aus" ? "ausgabe" : "sonstiges", aktion_id: null, komitee: v, name: committeeLabel(v) };
    if (k === "spende") return { quelle: "spende", aktion_id: null, komitee: null, name: "Spende" };
    return { quelle: typ === "aus" ? "ausgabe" : "sonstiges", aktion_id: null, komitee: null, name: typ === "aus" ? "Ausgabe" : "Sonstiges" };
  }

  async function speichern() {
    setFehler("");
    const c = centAus(betrag);
    if (!c || c <= 0) return setFehler("Bitte einen Betrag über 0 eingeben.");
    const z = aufloesen();
    if (!z) return setFehler("Wofür? Bitte eine Zuordnung wählen.");
    setBusy(true);
    const f = await onBuchen({
      datum,
      cent: typ === "aus" ? -c : c,
      quelle: z.quelle,
      titel: titel.trim() || z.name,
      aktion_id: z.aktion_id,
      komitee: z.komitee,
    });
    setBusy(false);
    if (f) return setFehler("Hat nicht geklappt: " + f);
    onClose();
  }

  const seg = "rounded-xl border py-2.5 text-[14px] font-bold transition";
  const aus = typ === "aus";
  return (
    <Sheet open={art !== null} onClose={onClose}>
      <h2 className="mb-3 text-xl font-extrabold">Buchung</h2>

      {/* Gleiches Raster wie Datum | Wofür darunter – die Kanten fluchten */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <button
          onClick={() => setTyp("ein")}
          className={`${seg} ${!aus ? "border-emerald-600 bg-emerald-600 text-white" : "border-papier-linie text-tinte-matt dark:border-slate-700"}`}
        >
          + Einnahme
        </button>
        <button
          onClick={() => setTyp("aus")}
          className={`${seg} ${aus ? "border-red-600 bg-red-600 text-white" : "border-papier-linie text-tinte-matt dark:border-slate-700"}`}
        >
          − Ausgabe
        </button>
      </div>

      <label className="mt-4 block text-[12px] font-semibold text-tinte-leise">Betrag</label>
      <div className="mt-1 flex items-center gap-1 rounded-xl bg-papier-matt px-4 dark:bg-slate-800">
        <input
          className="zahl min-w-0 flex-1 bg-transparent py-3 text-[1.6rem] font-extrabold outline-none"
          inputMode="decimal"
          placeholder="0,00"
          value={betrag}
          autoFocus
          onChange={(e) => setBetrag(e.target.value)}
        />
        <span className="text-xl font-bold text-tinte-matt">€</span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <label className="block text-[12px] font-semibold text-tinte-leise">Datum</label>
          <input type="date" className="field mt-1 h-12" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="block text-[12px] font-semibold text-tinte-leise">Wofür</label>
          <select className="field mt-1 h-12" value={zu} onChange={(e) => setZu(e.target.value)}>
            <option value="">Bitte wählen …</option>
            {aktionen.length > 0 && (
              <optgroup label="Aktion">
                {aktionen.map((a) => (
                  <option key={a.id} value={`aktion:${a.id}`}>
                    {a.icon} {a.titel}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Komitee">
              {COMMITTEES.map((k) => (
                <option key={k.slug} value={`komitee:${k.slug}`}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sonst">
              {!aus && <option value="spende">🤝 Spende / Sponsor</option>}
              <option value="sonstiges">📌 Sonstiges</option>
            </optgroup>
          </select>
        </div>
      </div>

      <label className="mt-3 block text-[12px] font-semibold text-tinte-leise">Notiz (freiwillig)</label>
      <input
        className="field mt-1"
        placeholder={aus ? "z. B. Waffelteig, Deko" : "z. B. Kuchenverkauf 2. Pause"}
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void speichern()}
      />

      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
      <button
        disabled={busy}
        onClick={speichern}
        className={`mt-4 w-full rounded-2xl py-3.5 text-[15px] font-extrabold text-white disabled:opacity-50 ${
          aus ? "bg-red-600" : "bg-emerald-600"
        }`}
      >
        {busy ? "…" : aus ? "Ausgabe buchen" : "Einnahme buchen"}
      </button>
      <p className="mt-2 text-center text-[11px] text-tinte-leise">
        Stufenbeiträge buchen sich von selbst, sobald sie auf „bezahlt“ stehen.
      </p>
    </Sheet>
  );
}

// ==================================================================== Einstellungen

/** Selten gebraucht, darum im Zahnrad: Zielbetrag und Abgleich mit der Bank. */
function EinstellungenSheet({
  open, onClose, fin, stand,
}: {
  open: boolean;
  onClose: () => void;
  fin: FinanzenValue;
  stand: number;
}) {
  const [titel, setTitel] = useState("");
  const [betrag, setBetrag] = useState("");
  const [bank, setBank] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitel(fin.ziel.ziel_titel);
    setBetrag(fin.ziel.ziel_cent ? String(fin.ziel.ziel_cent / 100).replace(".", ",") : "");
    setBank("");
  }, [open, fin.ziel]);

  const c = centAus(bank);
  const diff = c === null ? null : c - stand;

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-extrabold">Ziel & Bank</h2>

      <h3 className="mt-4 text-[13px] font-bold">Sparziel</h3>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
        <input className="field" placeholder="Wofür? z. B. Abiball" value={titel} onChange={(e) => setTitel(e.target.value)} />
        <input className="field text-right" inputMode="decimal" placeholder="Betrag €" value={betrag} onChange={(e) => setBetrag(e.target.value)} />
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const f = await fin.zielSetzen({ ziel_cent: Math.max(0, centAus(betrag) ?? 0), ziel_titel: titel.trim() || "Abiball" });
          setBusy(false);
          if (f) alert("Hat nicht geklappt: " + f);
          else onClose();
        }}
        className="btn-primary mt-2"
      >
        Ziel speichern
      </button>

      <h3 className="mt-6 text-[13px] font-bold">Mit der Bank abgleichen</h3>
      <p className="text-[12px] text-tinte-leise">
        Stand aus dem Online-Banking eintragen. Die Differenz wird als Abgleich gebucht.
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          className="field min-w-0 flex-1"
          inputMode="decimal"
          placeholder="Stand laut Bank"
          value={bank}
          onChange={(e) => setBank(e.target.value)}
        />
        <button
          disabled={busy || diff === null || diff === 0}
          onClick={async () => {
            if (diff === null || diff === 0) return;
            if (!confirm(`Kontostand auf ${euro(c!)} setzen? Gebucht wird ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}.`)) return;
            setBusy(true);
            const f = await fin.buchen({ datum: heute(), cent: diff, quelle: "abgleich", titel: "Abgleich mit der Bank" });
            setBusy(false);
            if (f) alert("Hat nicht geklappt: " + f);
            else onClose();
          }}
          className="btn-primary !w-auto shrink-0 px-4 disabled:opacity-40"
        >
          Abgleichen
        </button>
      </div>
      {diff !== null && (
        <p className="mt-1.5 text-[12px] text-tinte-matt dark:text-slate-400">
          {diff === 0 ? "Stimmt genau mit dem Kassenbuch überein." : `Unterschied: ${diff > 0 ? "+" : "−"} ${euro(Math.abs(diff))}`}
        </p>
      )}
    </Sheet>
  );
}

// ==================================================================== Kostenanfragen

const STATUS: Record<KostenAnfrage["status"], { text: string; klasse: string }> = {
  offen: { text: "wartet", klasse: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  genehmigt: { text: "genehmigt", klasse: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  abgelehnt: { text: "abgelehnt", klasse: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

function KostenKarte({
  kosten, darfEntscheiden, vorsitze, onEntschieden,
}: {
  kosten: KostenValue;
  darfEntscheiden: boolean;
  vorsitze: string[];
  onEntschieden?: () => void;
}) {
  const { profile } = useProfiles();
  const [neu, setNeu] = useState(false);
  const [auswahl, setAuswahl] = useState<KostenAnfrage | null>(null);
  const [alle, setAlle] = useState(false);

  const offene = kosten.anfragen.filter((a) => a.status === "offen");
  const erledigte = kosten.anfragen.filter((a) => a.status !== "offen");
  const sichtbarErledigt = alle ? erledigte : erledigte.slice(0, 3);

  return (
    <section className="card min-w-0 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Kostenanfragen</h2>
          <p className="text-[12px] text-tinte-leise">
            {vorsitze.length > 0
              ? "Du brauchst Geld fürs Komitee? Hier anfragen – der Kassenwart entscheidet."
              : darfEntscheiden
                ? "Anfragen der Komitee-Vorsitzenden. Genehmigen bucht die Ausgabe sofort."
                : "Anfragen der Komitee-Vorsitzenden an den Kassenwart."}
          </p>
        </div>
        {vorsitze.length > 0 && (
          <button onClick={() => setNeu(true)} className="btn-primary !w-auto shrink-0 px-3.5 text-[13px]">
            + Anfragen
          </button>
        )}
      </div>

      {!kosten.bereit ? (
        <p className="py-6 text-center text-[13px] text-tinte-leise">Lädt …</p>
      ) : kosten.anfragen.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-tinte-leise">Keine Kostenanfragen.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
          {[...offene, ...sichtbarErledigt].map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setAuswahl(a)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                  a.status === "offen" && darfEntscheiden
                    ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5"
                    : "border-papier-linie dark:border-slate-800"
                }`}
              >
                <span className="shrink-0 text-lg">{committeeIcon(a.tag)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{a.titel}</span>
                  <span className="block truncate text-[11px] text-tinte-leise">
                    {committeeLabel(a.tag)} · {profile[a.created_by]?.anzeigename || "Vorsitz"}
                    {a.benoetigt_am ? ` · bis ${kurzTag(a.benoetigt_am)}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="zahl text-[14px] font-bold">{euro(a.cent)}</span>
                  <span className={`rounded-full px-1.5 py-px text-[10.5px] font-bold ${STATUS[a.status].klasse}`}>
                    {STATUS[a.status].text}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {erledigte.length > 3 && (
        <button onClick={() => setAlle(!alle)} className="mt-2 w-full text-center text-[12px] font-bold text-brand">
          {alle ? "Weniger anzeigen" : `Alle ${erledigte.length} erledigten anzeigen`}
        </button>
      )}

      <KostenAnfrageSheet open={neu} onClose={() => setNeu(false)} vorsitze={vorsitze} onStellen={kosten.stellen} />
      <AnfrageDetailSheet
        anfrage={auswahl}
        onClose={() => setAuswahl(null)}
        darfEntscheiden={darfEntscheiden}
        kosten={kosten}
        onEntschieden={onEntschieden}
        name={auswahl ? profile[auswahl.created_by]?.anzeigename || "Vorsitz" : ""}
      />
    </section>
  );
}

function KostenAnfrageSheet({
  open, onClose, vorsitze, onStellen,
}: {
  open: boolean;
  onClose: () => void;
  vorsitze: string[];
  onStellen: KostenValue["stellen"];
}) {
  const [tag, setTag] = useState("");
  const [titel, setTitel] = useState("");
  const [betrag, setBetrag] = useState("");
  const [bis, setBis] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTag(vorsitze[0] || "");
    setTitel("");
    setBetrag("");
    setBis("");
    setNachricht("");
    setFehler("");
  }, [open, vorsitze]);

  async function senden() {
    setFehler("");
    const c = centAus(betrag);
    if (!titel.trim()) return setFehler("Wofür brauchst du das Geld?");
    if (!c || c <= 0) return setFehler("Bitte einen Betrag über 0 eingeben.");
    setBusy(true);
    const f = await onStellen({ tag, titel, nachricht, cent: c, benoetigt_am: bis || null });
    setBusy(false);
    if (f) return setFehler("Hat nicht geklappt: " + f);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-extrabold">Kosten anfragen</h2>
      <p className="text-[12px] text-tinte-leise">Kassenwart und Admin bekommen eine Benachrichtigung.</p>

      {vorsitze.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {vorsitze.map((k) => (
            <button
              key={k}
              onClick={() => setTag(k)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold ${
                tag === k ? "border-brand bg-brand/10 text-brand" : "border-papier-linie text-tinte-matt dark:border-slate-700"
              }`}
            >
              {committeeIcon(k)} {committeeLabel(k)}
            </button>
          ))}
        </div>
      )}
      {vorsitze.length === 1 && (
        <div className="mt-3 text-[13px] font-semibold">
          {committeeIcon(tag)} {committeeLabel(tag)}
        </div>
      )}

      <label className="mt-3 block text-[12px] font-semibold text-tinte-leise">Wofür</label>
      <input className="field mt-1" placeholder="z. B. Deko für den Abiball" value={titel} maxLength={120} onChange={(e) => setTitel(e.target.value)} />

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <label className="block text-[12px] font-semibold text-tinte-leise">Betrag</label>
          <div className="mt-1 flex items-center gap-1 rounded-xl bg-papier-matt px-3 dark:bg-slate-800">
            <input
              className="zahl min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-bold outline-none"
              inputMode="decimal"
              placeholder="0,00"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
            <span className="font-bold text-tinte-matt">€</span>
          </div>
        </div>
        <div className="min-w-0">
          <label className="block text-[12px] font-semibold text-tinte-leise">Gebraucht bis (freiwillig)</label>
          <input type="date" className="field mt-1" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
      </div>

      <label className="mt-3 block text-[12px] font-semibold text-tinte-leise">Begründung (freiwillig)</label>
      <textarea
        className="field mt-1 min-h-[4rem]"
        placeholder="z. B. Angebot vom Baumarkt, 3 Rollen Lichterkette"
        value={nachricht}
        maxLength={1000}
        onChange={(e) => setNachricht(e.target.value)}
      />

      {fehler && <p className="mt-2 text-[13px] font-semibold text-amber-600">{fehler}</p>}
      <button disabled={busy} onClick={senden} className="btn-primary mt-4 disabled:opacity-50">
        {busy ? "…" : "Anfrage senden"}
      </button>
    </Sheet>
  );
}

function AnfrageDetailSheet({
  anfrage, onClose, darfEntscheiden, kosten, name, onEntschieden,
}: {
  anfrage: KostenAnfrage | null;
  onClose: () => void;
  darfEntscheiden: boolean;
  kosten: KostenValue;
  name: string;
  onEntschieden?: () => void;
}) {
  const { uid } = useRole();
  const [antwort, setAntwort] = useState("");
  const [datum, setDatum] = useState(heute());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAntwort("");
    setDatum(heute());
  }, [anfrage]);

  if (!anfrage) return null;
  const a = anfrage;
  const eigene = uid === a.created_by;

  async function entscheiden(ja: boolean) {
    setBusy(true);
    const f = await kosten.entscheiden(a, ja, antwort, datum);
    setBusy(false);
    if (f) return alert("Hat nicht geklappt: " + f);
    onEntschieden?.();
    onClose();
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="flex items-start gap-3">
        <Avatar userId={a.created_by} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-tinte-leise">
            {committeeIcon(a.tag)} {committeeLabel(a.tag)} · {name}
          </div>
          <h2 className="text-xl font-extrabold leading-tight">{a.titel}</h2>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[a.status].klasse}`}>
          {STATUS[a.status].text}
        </span>
      </div>

      <div className="zahl mt-4 text-[2rem] font-extrabold leading-none">{euro(a.cent)}</div>
      <div className="mt-1 text-[12px] text-tinte-leise">
        angefragt am {new Date(a.created_at).toLocaleDateString("de-DE")}
        {a.benoetigt_am ? ` · gebraucht bis ${kurzTag(a.benoetigt_am)}` : ""}
      </div>
      {a.nachricht && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-papier-matt p-3 text-[14px] dark:bg-slate-800">{a.nachricht}</p>
      )}

      {a.status !== "offen" && (
        <div className="mt-3 text-[13px] text-tinte-matt dark:text-slate-300">
          {a.status === "genehmigt" ? "✓ Genehmigt und als Ausgabe gebucht" : "✕ Abgelehnt"}
          {a.decided_at ? ` am ${new Date(a.decided_at).toLocaleDateString("de-DE")}` : ""}
          {a.antwort ? <span className="mt-1 block">„{a.antwort}“</span> : null}
        </div>
      )}

      {a.status === "offen" && darfEntscheiden && (
        <div className="mt-4 border-t border-papier-linie pt-4 dark:border-slate-800">
          <label className="block text-[12px] font-semibold text-tinte-leise">Antwort (freiwillig)</label>
          <input
            className="field mt-1"
            placeholder="z. B. Bitte Kassenbon abgeben"
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
          />
          <label className="mt-2 block text-[12px] font-semibold text-tinte-leise">Buchungsdatum bei Genehmigung</label>
          <input type="date" className="field mt-1" value={datum} onChange={(e) => setDatum(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={busy}
              onClick={() => void entscheiden(false)}
              className="rounded-xl border border-red-300 py-3 text-[14px] font-bold text-red-600 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400"
            >
              Ablehnen
            </button>
            <button
              disabled={busy}
              onClick={() => void entscheiden(true)}
              className="rounded-xl bg-emerald-600 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              Genehmigen
            </button>
          </div>
        </div>
      )}

      {a.status === "offen" && eigene && !darfEntscheiden && (
        <button
          disabled={busy}
          onClick={async () => {
            if (!confirm("Anfrage zurückziehen?")) return;
            setBusy(true);
            const f = await kosten.zurueckziehen(a.id);
            setBusy(false);
            if (f) alert("Hat nicht geklappt: " + f);
            else onClose();
          }}
          className="mt-4 w-full rounded-xl border border-papier-linie py-2.5 text-[13px] font-bold text-tinte-matt dark:border-slate-700"
        >
          Anfrage zurückziehen
        </button>
      )}
    </Sheet>
  );
}

// ==================================================================== Verlauf

type Filter = "alle" | "ein" | "aus";

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
      if (filter === "aus" && (b.cent > 0 || b.quelle === "abgleich")) return false;
      if (n && !`${b.titel} ${zuweisungText(b, aktionName)}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [buchungen, filter, q, aktionName]);

  const { sichtbar, marke } = useNachschub(liste.length, [filter, q]);

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
    ["ein", "Rein"],
    ["aus", "Raus"],
  ];

  return (
    <section className="card min-w-0 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold">Verlauf</h2>
        <div className="flex gap-1 rounded-xl bg-papier-matt p-1 dark:bg-slate-800">
          {FILTER.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1 text-[12px] font-bold transition ${
                filter === k ? "bg-white text-tinte shadow-sm dark:bg-slate-700 dark:text-white" : "text-tinte-matt dark:text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <input className="field mt-2" placeholder="Suchen, z. B. Waffel oder Abiball …" value={q} onChange={(e) => setQ(e.target.value)} />

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
  const plus = b.cent > 0;
  const zu = zuweisungText(b, aktionName);
  const icon = b.komitee
    ? committeeIcon(b.komitee)
    : b.quelle === "beitrag"
      ? "🎓"
      : b.quelle === "aktion"
        ? "🧇"
        : b.quelle === "spende"
          ? "🤝"
          : b.quelle === "abgleich"
            ? "🏦"
            : plus
              ? "📥"
              : "📤";
  return (
    <li className="flex items-center gap-2.5 bg-white px-3 py-2.5 dark:bg-slate-900">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-papier-matt text-[15px] dark:bg-slate-800">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{b.titel || zu}</span>
        <span className="block truncate text-[11px] text-tinte-leise">
          {new Date(b.datum + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          {zu !== b.titel ? ` · ${zu}` : ""}
          {b.anfrage_id ? " · Kostenanfrage" : ""}
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

