import { useProfiles } from "../profiles-store";
import { farbwert, initialen as initialenVon } from "../lib/profil";
import { useTheme } from "../lib/theme";

/**
 * Runder Namenskreis mit den Initialen in der Farbe der Person.
 * name überschreibt den gespeicherten Namen (z. B. bei alten Nachrichten).
 */
export function Avatar({
  userId,
  name,
  size = 32,
  onClick,
  ring,
}: {
  userId?: string | null;
  name?: string;
  size?: number;
  onClick?: () => void;
  ring?: boolean;
}) {
  const { profile } = useProfiles();
  const { theme } = useTheme();
  const p = userId ? profile[userId] : undefined;
  const anzeige = p?.anzeigename || name || "";
  const kurz = p?.initialen || initialenVon(anzeige);
  const farbe = farbwert(p?.farbe, theme === "dark");

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={anzeige}
      style={{ width: size, height: size, backgroundColor: farbe }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full ${
        ring ? "ring-2 ring-white dark:ring-slate-900" : ""
      } ${onClick ? "transition active:scale-95" : ""}`}
    >
      <span
        style={{ fontSize: Math.round(size * 0.4) }}
        className={`font-extrabold leading-none ${theme === "dark" ? "text-slate-900" : "text-white"}`}
      >
        {kurz}
      </span>
    </Tag>
  );
}

/** Name in der gewählten Farbe der Person. */
export function NameText({ userId, name, className }: { userId?: string | null; name?: string; className?: string }) {
  const { profile } = useProfiles();
  const { theme } = useTheme();
  const p = userId ? profile[userId] : undefined;
  return (
    <span className={className} style={{ color: farbwert(p?.farbe, theme === "dark") }}>
      {p?.anzeigename || name || "Unbekannt"}
    </span>
  );
}
