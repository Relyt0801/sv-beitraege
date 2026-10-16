import { useEffect, useState } from "react";

/**
 * Uhrzeit-Feld im 24-Stunden-Format („07:35“), unabhängig von der Sprache des
 * Browsers.
 *
 * Warum nicht <input type="time">? Im englischen Browser zeigt es „07:35 AM“
 * und schnitt in schmalen Zeilen die Zeitangabe ab (Prüfung 15.10.2026). Hier
 * tippt man nur Ziffern („0735“ oder „735“); der Doppelpunkt kommt von selbst.
 * Nach außen geht immer ein gültiges „HH:MM“ – oder gar nichts, solange die
 * Eingabe unvollständig ist. Beim Verlassen springt ein ungültiger Text auf
 * den letzten gültigen Wert zurück.
 */
export function ZeitFeld({
  wert,
  onChange,
  label,
  className = "",
}: {
  /** „07:35“ */
  wert: string;
  onChange: (v: string) => void;
  /** Für Screenreader („Beginn“, „Ende“) */
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(wert);
  // Kommt von außen ein neuer Wert (Schnellwahl), ihn übernehmen
  useEffect(() => setText(wert), [wert]);

  /** Aus beliebigen Ziffern ein „HH:MM“ machen – oder null, wenn es keine Uhrzeit ist. */
  function lesen(roh: string): string | null {
    const z = roh.replace(/\D/g, "");
    if (z.length < 3 || z.length > 4) return null;
    const h = Number(z.length === 3 ? z.slice(0, 1) : z.slice(0, 2));
    const m = Number(z.slice(-2));
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder="hh:mm"
      maxLength={5}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const roh = e.target.value;
        // Nach den ersten zwei Ziffern den Doppelpunkt ergänzen
        const z = roh.replace(/\D/g, "").slice(0, 4);
        const t = z.length > 2 ? `${z.slice(0, 2)}:${z.slice(2)}` : z;
        setText(t);
        const ok = lesen(t);
        if (ok && z.length === 4) onChange(ok);
      }}
      onBlur={() => {
        const ok = lesen(text);
        if (ok) {
          setText(ok);
          if (ok !== wert) onChange(ok);
        } else setText(wert);
      }}
      className={`zahl w-[4.5rem] rounded-lg bg-[rgb(118_118_128/0.12)] px-2 py-2 text-center text-[16px] font-semibold text-tinte outline-none placeholder:font-normal placeholder:text-tinte-leise focus:ring-2 focus:ring-brand/40 dark:bg-[rgb(118_118_128/0.24)] dark:text-slate-100 ${className}`}
    />
  );
}
