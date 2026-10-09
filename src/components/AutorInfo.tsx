import { useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { Schalter } from "./Schalter";
import { useWfRecht, useWortfilterBereiche, WF_BEREICHE, type WfBereich } from "../lib/wortfilter-bereiche";
import { meldeFehler } from "../lib/melder";

/**
 * ⓘ – wer hat das eingereicht? Nur für alle, die den Bereich verwalten
 * (autor_info() prüft das in der Datenbank; alle anderen bekommen nichts).
 * Der Name wird erst beim Antippen geladen und steht dann daneben.
 */
export function AutorInfo({ art, id, className = "" }: { art: "motto" | "zitat"; id: string; className?: string }) {
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [auf, setAuf] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!auf) return;
    const weg = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAuf(false);
    };
    window.addEventListener("pointerdown", weg);
    return () => window.removeEventListener("pointerdown", weg);
  }, [auf]);

  const zeigen = async () => {
    setAuf((a) => !a);
    if (name !== undefined) return;
    if (!hasSupabase) return setName("Demo-Person");
    const { data, error } = await supabase!.rpc("autor_info", { p_art: art, p_id: id });
    if (error) return setName(null);
    setName((data as string | null) || null);
  };

  return (
    <span ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void zeigen();
        }}
        aria-label="Wer hat das eingereicht?"
        aria-expanded={auf}
        className="-m-2 flex h-9 w-9 items-center justify-center rounded-full text-tinte-leise transition active:scale-90"
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-current text-[11px] font-bold italic leading-none">i</span>
      </button>
      {auf && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#1C1C1E] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg dark:bg-slate-700">
          {name === undefined ? "Lädt …" : name ? `Eingereicht von ${name}` : "Nicht bekannt"}
        </span>
      )}
    </span>
  );
}

/**
 * Wortfilter für einen Bereich an/aus – steht in den Einstellungen jedes
 * Bereichs (Motto, Zitate, Rankings, Umfragen, Album) bei denen, die ihn
 * verwalten. Unsichtbar für alle anderen.
 */
export function WortfilterSchalter({ bereich, className = "", kompakt }: { bereich: WfBereich; className?: string; kompakt?: boolean }) {
  const darf = useWfRecht()(bereich);
  const { an, setzen } = useWortfilterBereiche(darf);
  if (!darf) return null;
  const info = WF_BEREICHE.find((b) => b.key === bereich);
  const umschalten = async (v: boolean) => {
    const f = await setzen(bereich, v);
    if (f) meldeFehler("Ging nicht: " + f);
  };
  if (kompakt)
    return (
      <label className={`flex min-h-[36px] items-center gap-3 ${className}`}>
        <span className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="font-semibold">Wortfilter {info?.titel}: </span>
          <span className="text-tinte-matt dark:text-slate-300">{an[bereich] ? "an" : "aus"}</span>
        </span>
        <Schalter an={an[bereich]} label={`Wortfilter für ${info?.titel ?? bereich}`} onChange={(v) => void umschalten(v)} />
      </label>
    );
  return (
    <label className={`feld-grau flex min-h-[44px] items-center gap-3 px-4 py-2.5 ${className}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Wortfilter · {info?.titel}</span>
        <span className="block text-[12.5px] leading-snug text-tinte-leise">
          {an[bereich] ? "An – beleidigende Wörter werden blockiert." : "Aus – Einträge werden nicht geprüft."}
        </span>
      </span>
      <Schalter
        an={an[bereich]}
        label={`Wortfilter für ${info?.titel ?? bereich}`}
        onChange={async (v) => {
          const f = await setzen(bereich, v);
          if (f) meldeFehler("Ging nicht: " + f);
        }}
      />
    </label>
  );
}
