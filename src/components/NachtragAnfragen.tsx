import { useState } from "react";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { useProfiles } from "../profiles-store";
import { useNachtraege, type Nachtrag } from "../lib/nachtrag";
import { tagLang } from "../lib/termine";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { Gruppe, Zeile } from "./Liste";

/**
 * Anträge „Mithilfe nachtragen“ fürs Team. Je Antrag eine Karte wie eine
 * Rechnung; Antippen öffnet das Blatt zum Annehmen oder Ablehnen.
 */
export function NachtragAnfragen() {
  const { isStaff, can } = useRole();
  const darf = isStaff || can("hilfen.edit");
  const { liste } = useNachtraege(darf);
  const [auf, setAuf] = useState<Nachtrag | null>(null);
  const offen = liste.filter((n) => n.status === "offen");
  if (!darf || offen.length === 0) return null;
  return (
    <>
      {offen.map((n) => (
        <NachtragKarte key={n.id} n={n} onOpen={() => setAuf(n)} />
      ))}
      {auf && <NachtragEntscheiden n={auf} onClose={() => setAuf(null)} />}
    </>
  );
}

function useName(n: Nachtrag) {
  const { students } = useStore();
  const { profile } = useProfiles();
  const s = students.find((x) => x.id === n.student_id);
  return s ? `${s.vorname} ${s.nachname}` : profile[n.user_id]?.anzeigename || "Jemand";
}

function NachtragKarte({ n, onOpen }: { n: Nachtrag; onOpen: () => void }) {
  const name = useName(n);
  return (
    <button onClick={onOpen} className="card flex w-full items-center gap-3 p-4 text-left transition active:scale-[.99]">
      <Avatar userId={n.user_id} name={name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{name}</span>
        <span className="block truncate text-[12.5px] text-tinte-matt dark:text-slate-300">
          🙌 {n.titel} · {tagLang(n.datum)}
        </span>
      </span>
      <span className="zahl shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-bold text-brand dark:bg-brand/20">
        {n.punkte !== null ? `+${n.punkte} %` : "% ?"}
      </span>
      <span className="text-slate-300">›</span>
    </button>
  );
}

/** Entscheiden – oben groß der Wert, darunter die Angaben, unten zwei Knöpfe. */
function NachtragEntscheiden({ n, onClose }: { n: Nachtrag; onClose: () => void }) {
  const name = useName(n);
  const { entscheiden } = useNachtraege(false);
  const [wert, setWert] = useState(n.punkte !== null ? String(n.punkte) : "");
  const [antwort, setAntwort] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  const zahl = Number(wert);
  const wertOk = wert.trim() !== "" && Number.isFinite(zahl) && zahl >= 0 && zahl <= 100;

  async function los(annehmen: boolean) {
    setBusy(true);
    setFehler("");
    const f = await entscheiden(n, annehmen, annehmen ? Math.round(zahl) : null, antwort);
    setBusy(false);
    if (f) setFehler(f);
    else onClose();
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center pt-1 text-center">
          <Avatar userId={n.user_id} name={name} size={48} />
          <div className="mt-2 text-[13px] font-semibold text-tinte-leise">{name} möchte nachtragen</div>
          <div className="zahl mt-1 text-[2.6rem] font-extrabold leading-none tracking-[-0.03em]">
            {wertOk ? `+${Math.round(zahl)} %` : <span className="text-tinte-leise">– %</span>}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold">{n.titel}</div>
        </div>

        <Gruppe titel="Angaben">
          <Zeile label="Datum">
            <span className="text-[15px] text-tinte-matt dark:text-slate-300">{tagLang(n.datum)}</span>
          </Zeile>
          <Zeile label="Art">
            <span className="text-[15px] text-tinte-matt dark:text-slate-300">
              {n.vorlage_id ? (n.punkte === null ? "Vorlage (% frei)" : "Vorlage") : "Sonstiges"}
            </span>
          </Zeile>
          {n.beschreibung && (
            <div className="px-4 py-3 text-[14.5px] leading-relaxed">
              <span className="mb-0.5 block text-[12px] font-semibold text-tinte-leise">Beschreibung</span>
              {n.beschreibung}
            </div>
          )}
          <Zeile label="Wert">
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                aria-label="Wert in Prozent"
                placeholder="?"
                className="w-16 rounded-lg bg-white px-2 py-1 text-right text-[15px] font-bold text-brand outline-none dark:bg-slate-800"
                value={wert}
                onChange={(e) => setWert(e.target.value)}
              />
              <span className="text-[15px] font-bold text-brand">%</span>
            </span>
          </Zeile>
        </Gruppe>

        <Gruppe titel="Antwort (freiwillig)">
          <div className="px-4 py-3">
            <textarea
              className="min-h-[56px] w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-tinte-leise"
              placeholder="z. B. Danke! oder warum es nicht geht"
              maxLength={300}
              value={antwort}
              onChange={(e) => setAntwort(e.target.value)}
            />
          </div>
        </Gruppe>

        {fehler && <p className="mt-3 text-center text-[13px] font-semibold text-red-600">Das hat nicht geklappt: {fehler}</p>}

        <div className="mt-4 flex gap-2">
          <button
            disabled={busy}
            onClick={() => void los(false)}
            className="flex-1 rounded-2xl bg-[rgb(118_118_128/0.12)] py-3 text-[15px] font-bold text-red-600 transition active:scale-[.98] disabled:opacity-40 dark:bg-[rgb(118_118_128/0.24)] dark:text-red-400"
          >
            Ablehnen
          </button>
          <button
            disabled={busy || !wertOk}
            onClick={() => void los(true)}
            className="flex-[1.4] rounded-2xl bg-brand py-3 text-[15px] font-bold text-white transition active:scale-[.98] disabled:opacity-40"
          >
            {wertOk ? `Annehmen (+${Math.round(zahl)} %)` : "Wert angeben"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11.5px] text-tinte-leise">
          Annehmen trägt die Mithilfe mit dem Datum des Antrags ein. {name.split(" ")[0]} bekommt Bescheid.
        </p>
      </div>
    </Sheet>
  );
}
