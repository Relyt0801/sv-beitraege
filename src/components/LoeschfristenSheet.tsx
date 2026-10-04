import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { hasSupabase, supabase } from "../lib/supabase";
import { melde, meldeFehler } from "../lib/melder";
import { Gruppe } from "./NachtragSheet";

const WAHL: { tage: number | null; text: string }[] = [
  { tage: null, text: "Nie" },
  { tage: 1, text: "1 Tag" },
  { tage: 3, text: "3 Tage" },
  { tage: 7, text: "1 Woche" },
  { tage: 30, text: "1 Monat" },
];

/**
 * Automatisch löschen (supabase/auto-loeschen.sql): Nach wie vielen Tagen
 * räumt die Datenbank nachts auf? Nur Admin bzw. „Rechte verwalten“.
 */
export function LoeschfristenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chat, setChat] = useState<number | null>(null);
  const [antraege, setAntraege] = useState<number | null>(null);
  const [protokoll, setProtokoll] = useState<number | null>(null);
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    if (!open || !hasSupabase) return;
    void supabase!
      .from("app_settings")
      .select("loeschen_chat_tage, loeschen_antraege_tage, loeschen_protokoll_tage")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as {
          loeschen_chat_tage?: number | null;
          loeschen_antraege_tage?: number | null;
          loeschen_protokoll_tage?: number | null;
        } | null;
        setChat(d?.loeschen_chat_tage ?? null);
        setAntraege(d?.loeschen_antraege_tage ?? null);
        setProtokoll(d?.loeschen_protokoll_tage ?? null);
        setBereit(true);
      });
  }, [open]);

  async function speichern(c: number | null, a: number | null, p: number | null) {
    setChat(c);
    setAntraege(a);
    setProtokoll(p);
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("loeschfristen_setzen", { p_chat: c, p_antraege: a, p_protokoll: p });
    if (error) meldeFehler("Speichern ging nicht: " + error.message);
    else melde("Gespeichert");
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mx-auto max-w-md">
        <h2 className="text-[1.375rem] font-bold tracking-[-0.02em]">Automatisch löschen</h2>
        <p className="mt-1 text-[13px] text-tinte-leise">Jede Nacht, für alle. Gelöschtes ist weg.</p>

        <Gruppe titel="Chat-Nachrichten">
          <Auswahl wert={chat} bereit={bereit} onWahl={(t) => void speichern(t, antraege, protokoll)} />
          <p className="px-4 pb-3 text-[12px] text-tinte-leise">Angepinntes, Abstimmungen und To-dos bleiben.</p>
        </Gruppe>

        <Gruppe titel="Bearbeitete Anträge">
          <Auswahl wert={antraege} bereit={bereit} onWahl={(t) => void speichern(chat, t, protokoll)} />
          <p className="px-4 pb-3 text-[12px] text-tinte-leise">Offene Anträge und Kassenbuch bleiben.</p>
        </Gruppe>

        <Gruppe titel="Protokoll">
          <Auswahl wert={protokoll} bereit={bereit} onWahl={(t) => void speichern(chat, antraege, t)} />
          <p className="px-4 pb-3 text-[12px] text-tinte-leise">Sonst nach 2 Jahren.</p>
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
