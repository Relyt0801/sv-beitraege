import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { hasSupabase, supabase } from "../lib/supabase";
import { melde, meldeFehler } from "../lib/melder";
import { Gruppe } from "./NachtragSheet";

const WAHL: { tage: number | null; text: string }[] = [
  { tage: null, text: "Nie" },
  { tage: 30, text: "30 Tage" },
  { tage: 90, text: "90 Tage" },
  { tage: 180, text: "180 Tage" },
  { tage: 365, text: "1 Jahr" },
];

/**
 * Automatisch löschen (supabase/auto-loeschen.sql): Nach wie vielen Tagen
 * räumt die Datenbank nachts auf? Nur Admin bzw. „Rechte verwalten“.
 */
export function LoeschfristenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chat, setChat] = useState<number | null>(null);
  const [antraege, setAntraege] = useState<number | null>(null);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    if (!open || !hasSupabase) return;
    void supabase!
      .from("app_settings")
      .select("loeschen_chat_tage, loeschen_antraege_tage")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as { loeschen_chat_tage?: number | null; loeschen_antraege_tage?: number | null } | null;
        setChat(d?.loeschen_chat_tage ?? null);
        setAntraege(d?.loeschen_antraege_tage ?? null);
        setBereit(true);
      });
  }, [open]);

  async function speichern(c: number | null, a: number | null) {
    setChat(c);
    setAntraege(a);
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("loeschfristen_setzen", { p_chat: c, p_antraege: a });
    if (error) meldeFehler("Speichern ging nicht: " + error.message);
    else melde("Gespeichert");
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mx-auto max-w-md">
        <h2 className="text-[1.375rem] font-bold tracking-[-0.02em]">Automatisch löschen</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-tinte-matt dark:text-slate-400">
          Damit die Datenbank nicht vollläuft, räumt sie jede Nacht auf. Gilt für alle in der Stufe. Gelöschtes
          lässt sich nicht zurückholen.
        </p>

        <Gruppe titel="Chat-Nachrichten">
          <Auswahl wert={chat} bereit={bereit} onWahl={(t) => void speichern(t, antraege)} />
          <p className="px-4 pb-3 text-[12px] leading-relaxed text-tinte-leise">
            Nachrichten und ihre Reaktionen, erledigte Gespräche mit Schülern und Eltern. Angepinntes, Abstimmungen
            und To-dos bleiben.
          </p>
        </Gruppe>

        <Gruppe titel="Bearbeitete Anträge">
          <Auswahl wert={antraege} bereit={bereit} onWahl={(t) => void speichern(chat, t)} />
          <p className="px-4 pb-3 text-[12px] leading-relaxed text-tinte-leise">
            Entschiedene Nachträge, Komitee-Wechsel, Entsperrungen, Termin- und Kostenanfragen. Offene bleiben immer,
            Buchungen im Kassenbuch auch.
          </p>
        </Gruppe>
      </div>
    </Sheet>
  );
}

function Auswahl({ wert, bereit, onWahl }: { wert: number | null; bereit: boolean; onWahl: (t: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-3">
      {WAHL.map((w) => {
        const an = bereit && wert === w.tage;
        return (
          <button
            key={w.text}
            disabled={!bereit}
            onClick={() => onWahl(w.tage)}
            aria-pressed={an}
            className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition active:scale-[.97] disabled:opacity-40 ${
              an ? "bg-brand text-white" : "bg-white text-tinte dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {w.text}
          </button>
        );
      })}
    </div>
  );
}
