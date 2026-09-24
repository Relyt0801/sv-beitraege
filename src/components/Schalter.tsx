/** Der grüne Kippschalter aus den iOS-Einstellungen. */
export function Schalter({
  an,
  onChange,
  label,
}: {
  an: boolean;
  onChange: (an: boolean) => void;
  /** Für Screenreader, wenn kein sichtbarer Text daneben steht. */
  label?: string;
}) {
  return (
    <span className="relative inline-block h-[31px] w-[51px] shrink-0">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={an}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="absolute inset-0 rounded-full bg-[rgb(120_120_128/0.16)] transition-colors duration-200 peer-checked:bg-[#34C759] peer-focus-visible:ring-4 peer-focus-visible:ring-brand/30 dark:bg-[rgb(120_120_128/0.32)] dark:peer-checked:bg-[#30D158]" />
      <span className="pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_3px_1px_rgba(0,0,0,.06)] transition-transform duration-300 ease-ios peer-checked:translate-x-5" />
    </span>
  );
}
