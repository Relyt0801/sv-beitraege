import { useRole } from "../auth/RoleProvider";
import { sperrText } from "../lib/unban";

/**
 * Wer gesperrt ist (Chat-Sperre), kann überall nur noch ansehen: nichts
 * einreichen, kommentieren, liken oder abstimmen. Die Datenbank blockt das
 * ohnehin (Trigger gesperrt_blocken) – hier steht es vorher sichtbar da.
 */
export function GesperrtZeile({ className = "", hell }: { className?: string; hell?: boolean }) {
  const { banned, bannedUntil, bannPermanent, banGrund } = useRole();
  if (!banned) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-3 py-2 text-[12.5px] font-semibold leading-snug ${
        hell ? "bg-white/15 text-white" : "bg-red-500/10 text-red-700 dark:text-red-300"
      } ${className}`}
    >
      🚫 Du bist {sperrText(bannedUntil, bannPermanent)} – du kannst gerade nur ansehen, nichts einreichen oder abstimmen.
      {banGrund && <span className="mt-0.5 block font-medium opacity-80">Grund: {banGrund}</span>}
    </p>
  );
}

export const GESPERRT_TEXT = "Du bist gesperrt und kannst gerade nichts einreichen, kommentieren oder abstimmen.";
