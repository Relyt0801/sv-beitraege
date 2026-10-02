import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Schalter } from "./Schalter";
import { hasSupabase, supabase } from "../lib/supabase";
import { useStore } from "../store";
import { prozentText, type KiEinstellungen, type VertrauenZeile } from "../lib/ki";
import { melde, meldeFehler } from "../lib/melder";
import { normalize } from "../lib/logic";

/**
 * Nur für den Admin: Vertrauens-Score je Person und die Einstellungen des
 * Vertrauens-Checks. Steht bewusst im Profil (wie das Protokoll) und in
 * keinem Reiter – das Team sieht davon nichts, auch keine leere Kachel.
 * Die Datenbank liefert die Liste ohnehin nur dem Admin (vertrauen_liste()).
 */
export function VertrauenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { students } = useStore();
  const [liste, setListe] = useState<VertrauenZeile[] | null>(null);
  const [fehler, setFehler] = useState("");
  const [einst, setEinst] = useState<KiEinstellungen | null>(null);
  const [suche, setSuche] = useState("");
  const [nurMit, setNurMit] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFehler("");
    if (!hasSupabase) {
      // Demo: erfundene Werte, damit man sieht, wie es aussieht.
      setListe(
        students.slice(0, 12).map((s, i) => {
          const b = (i * 7) % 5;
          const f = i % 4 === 3 ? 1 : 0;
          const bilanz = Math.round(((b + 1) / (b + 1 + 3 * f + 1)) * 1000) / 1000;
          return {
            user_id: `demo-${s.id}`, name: `${s.vorname} ${s.nachname}`, username: null, rolle: i < 2 ? "admin" : "schueler",
            student_id: s.id, freigeschaltet: i < 4, einwilligung: i < 4 ? i !== 2 : null, einwilligung_at: null,
            bestaetigt: b, falsch: f, bilanz: i < 4 && i !== 2 ? bilanz : null,
            jev_wert: i === 1 ? 0.2 : i < 4 ? 0.8 : null, jev_sicherheit: i < 4 ? 0.85 : null, jev_at: null,
            wert: i < 4 && i !== 2 ? (i === 1 ? Math.min(bilanz, 0.2) : bilanz) : null, offene_angaben: i === 3 ? 1 : 0,
          };
        }),
      );
      setEinst({ schwelle: 0.8, assistent_an: false, stil: "Du-Form, kurz und locker …" });
      return;
    }
    void supabase!.rpc("vertrauen_liste").then(({ data, error }) => {
      if (error) setFehler(error.message);
      else setListe((data || []) as VertrauenZeile[]);
    });
    void supabase!.from("ki_einstellungen").select("schwelle, assistent_an, stil").eq("id", 1).maybeSingle().then(({ data }) => {
      if (data) setEinst({ ...(data as KiEinstellungen), schwelle: Number((data as KiEinstellungen).schwelle) });
    });
  }, [open, students]);

  const gefiltert = useMemo(() => {
    const q = normalize(suche);
    return (liste || [])
      .filter((z) => !nurMit || z.freigeschaltet)
      .filter((z) => !q || normalize(`${z.name} ${z.username || ""}`).includes(q))
      .sort((a, b) => (a.wert ?? 2) - (b.wert ?? 2) || a.name.localeCompare(b.name, "de"));
  }, [liste, suche, nurMit]);

  async function speichern() {
    if (!einst) return;
    setBusy(true);
    if (hasSupabase) {
      const { error } = await supabase!.rpc("ki_einstellungen_setzen", {
        p_schwelle: einst.schwelle, p_an: einst.assistent_an, p_stil: einst.stil,
      });
      setBusy(false);
      if (error) return meldeFehler("Speichern ging nicht: " + error.message);
    } else setBusy(false);
    melde("Gespeichert.", "erfolg");
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Vertrauen & KI" unter="Nur für dich als Admin · Testphase" onClose={onClose} />

      {fehler && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {/does not exist|schema cache/i.test(fehler) ? "Erst supabase/update-abi28.sql einspielen (siehe EINSPIELEN.md)." : fehler}
        </p>
      )}

      {/* ------------------------------------------ Einstellungen */}
      {einst && (
        <section className="rounded-2xl bg-papier-matt p-4 dark:bg-slate-800/70">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[15px] font-bold">Assistent im Chat</span>
              <span className="block text-[12px] text-tinte-leise">Antwortet auf Nachträge (nur Freigeschaltete mit Zustimmung)</span>
            </span>
            <Schalter an={einst.assistent_an} onChange={(an) => setEinst({ ...einst, assistent_an: an })} />
          </label>

          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold">Schwelle für „sofort eintragen“</span>
              <span className="zahl text-[15px] font-bold">{Math.round(einst.schwelle * 100)} %</span>
            </div>
            <input
              type="range" min={50} max={100} step={5} value={Math.round(einst.schwelle * 100)}
              onChange={(e) => setEinst({ ...einst, schwelle: Number(e.target.value) / 100 })}
              className="mt-2 w-full accent-brand" aria-label="Schwelle"
            />
            <p className="text-[12px] leading-relaxed text-tinte-leise">
              Neue starten bei 50 %. 80 % = drei bestätigte Angaben ohne Fehler. Darunter prüft immer das Team.
            </p>
          </div>

          <label className="mt-4 block text-[15px] font-bold" htmlFor="ki-stil">Euer Schreibstil</label>
          <textarea
            id="ki-stil" className="field mt-1 min-h-[6rem] text-[14px]" maxLength={2000}
            value={einst.stil} onChange={(e) => setEinst({ ...einst, stil: e.target.value })}
          />
          <p className="mt-1 text-[12px] text-tinte-leise">So formuliert der Assistent Rückfragen. Gern mit ein, zwei Beispielsätzen.</p>

          <button disabled={busy} onClick={() => void speichern()} className="btn-primary mt-3 !min-h-[2.75rem] !text-[15px]">
            {busy ? "…" : "Speichern"}
          </button>
        </section>
      )}

      {/* ------------------------------------------ Liste */}
      <div className="mt-4 flex items-center gap-2">
        <input className="field !py-2 text-[15px]" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>
      <label className="mt-2 flex items-center justify-between text-[13px] text-tinte-matt">
        Nur Freigeschaltete (Testphase)
        <Schalter an={nurMit} onChange={setNurMit} />
      </label>

      {!liste ? (
        <p className="py-8 text-center text-sm text-tinte-leise">Wird geladen …</p>
      ) : gefiltert.length === 0 ? (
        <p className="py-8 text-center text-sm text-tinte-leise">Niemand gefunden.</p>
      ) : (
        <ul className="mt-2 divide-y divide-papier-linie overflow-hidden rounded-2xl border border-papier-linie dark:divide-slate-800 dark:border-slate-800">
          {gefiltert.map((z) => (
            <li key={z.user_id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{z.name}</span>
                <span className="block truncate text-[12px] text-tinte-leise">
                  {!z.freigeschaltet
                    ? "nicht in der Testphase"
                    : z.einwilligung === null
                      ? "noch nicht gefragt"
                      : !z.einwilligung
                        ? "nicht zugestimmt – Team prüft alles"
                        : `${z.bestaetigt} bestätigt · ${z.falsch} falsch${z.jev_wert != null ? ` · Jev ${prozentText(z.jev_wert)}` : ""}${z.offene_angaben ? ` · ${z.offene_angaben} offen` : ""}`}
                </span>
              </span>
              <Wert wert={z.wert} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
        Der Wert ist die Bilanz (bestätigt gegen falsch). Der Assistent (Claude) ordnet nur ein, welche Schicht gemeint
        ist – ob jemand glaubwürdig ist, bewertet er nicht. Erst wenn ihr später Jev einrichtet, kann Jev den Wert
        senken (nie heben). Der Wert entscheidet nur, ob „war da“ sofort eingetragen wird oder das Team schaut; er wird
        für nichts anderes benutzt. Fragt jemand nach seinem Wert, sagt ihn ihm (Auskunftsrecht, Art. 15 DSGVO).
      </p>
    </Sheet>
  );
}

function Wert({ wert }: { wert: number | null }) {
  if (wert == null) return <span className="shrink-0 text-[13px] text-tinte-leise">–</span>;
  const farbe = wert >= 0.8 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : wert >= 0.5 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-red-500/15 text-red-700 dark:text-red-300";
  return <span className={`zahl shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold ${farbe}`}>{Math.round(wert * 100)} %</span>;
}
