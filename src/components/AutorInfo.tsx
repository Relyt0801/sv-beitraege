import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [ort, setOrt] = useState<{ x: number; y: number } | null>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const blase = useRef<HTMLSpanElement>(null);

  // Schließen beim Tippen daneben, beim Scrollen und bei Größenänderung
  useEffect(() => {
    if (!ort) return;
    const weg = (e: Event) => {
      const t = e.target as Node;
      if (knopf.current?.contains(t) || blase.current?.contains(t)) return;
      setOrt(null);
    };
    const zu = () => setOrt(null);
    window.addEventListener("pointerdown", weg);
    window.addEventListener("scroll", zu, true);
    window.addEventListener("resize", zu);
    return () => {
      window.removeEventListener("pointerdown", weg);
      window.removeEventListener("scroll", zu, true);
      window.removeEventListener("resize", zu);
    };
  }, [ort]);

  // Die Blase bleibt immer ganz im Bild: links/rechts an den Rand geschoben,
  // passt sie oben nicht hin, steht sie unter dem Knopf.
  useLayoutEffect(() => {
    const b = blase.current;
    const k = knopf.current;
    if (!ort || !b || !k) return;
    const r = k.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
    if (Math.abs(x - ort.x) > 0.5 || Math.abs(y - ort.y) > 0.5) setOrt({ x, y });
  }, [ort, name]);

  const zeigen = async () => {
    if (ort) return setOrt(null);
    const r = knopf.current?.getBoundingClientRect();
    setOrt({ x: r ? r.left : 8, y: r ? r.top - 40 : 8 });
    if (name !== undefined) return;
    if (!hasSupabase) return setName("Demo-Person");
    const { data, error } = await supabase!.rpc("autor_info", { p_art: art, p_id: id });
    if (error) return setName(null);
    setName((data as string | null) || null);
  };

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={knopf}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void zeigen();
        }}
        aria-label="Wer hat das eingereicht?"
        aria-expanded={!!ort}
        className="-m-2 flex h-9 w-9 items-center justify-center rounded-full text-tinte-leise transition active:scale-90"
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-current text-[11px] font-bold italic leading-none">i</span>
      </button>
      {ort &&
        createPortal(
          <span
            ref={blase}
            role="status"
            style={{ left: ort.x, top: ort.y }}
            className="fixed z-[120] max-w-[calc(100vw-16px)] rounded-xl bg-[#1C1C1E] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg dark:bg-slate-700"
          >
            {name === undefined ? "Lädt …" : name ? `Eingereicht von ${name}` : "Nicht bekannt"}
          </span>,
          document.body,
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
