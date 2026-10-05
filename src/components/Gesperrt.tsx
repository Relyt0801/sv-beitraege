import { useRole } from "../auth/RoleProvider";

/**
 * Wer gesperrt ist (Chat-Sperre), kann überall nur noch ansehen: nichts
 * einreichen, kommentieren, liken oder abstimmen. Die Datenbank blockt das
 * ohnehin (Trigger gesperrt_blocken) – hier steht es vorher sichtbar da.
 */
export function GesperrtZeile({ className = "", hell }: { className?: string; hell?: boolean }) {
  const { banned } = useRole();
  if (!banned) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-3 py-2 text-[12.5px] font-semibold leading-snug ${
        hell ? "bg-white/15 text-white" : "bg-red-500/10 text-red-700 dark:text-red-300"
      } ${className}`}
    >
      🚫 Du bist gesperrt – du kannst gerade nur ansehen, nichts einreichen oder abstimmen.
    </p>
  );
}

export const GESPERRT_TEXT = "Du bist gesperrt und kannst gerade nichts einreichen, kommentieren oder abstimmen.";
