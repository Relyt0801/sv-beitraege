import { useProfiles } from "../profiles-store";
import { farbe as farbeVon, farbKontur, farbeAusName, farbwert, initialen as initialenVon, lesbarerName, schriftAuf } from "../lib/profil";
import { personIcon } from "../lib/committees";
import { useTheme } from "../lib/theme";

/** Runder Namenskreis mit den Initialen in der Farbe der Person. */
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
  const dunkel = theme === "dark";
  const p = userId ? profile[userId] : undefined;
  const anzeige = lesbarerName(p?.anzeigename || name || "");
  const kurz = p?.initialen || initialenVon(anzeige);
  const f = farbeVon(p?.farbe || farbeAusName(anzeige || String(userId ?? "")));

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      title={anzeige}
      style={{
        width: size,
        height: size,
        backgroundColor: dunkel ? f.dunkel : f.hell,
        border: f.kontur ? "1px solid rgba(100,116,139,.5)" : undefined,
      }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full ${
        ring ? "ring-2 ring-white dark:ring-slate-900" : ""
      } ${onClick ? "transition active:scale-95" : ""}`}
    >
      <span
        style={{ fontSize: Math.round(size * 0.4), color: schriftAuf(dunkel ? f.dunkel : f.hell) }}
        className="font-extrabold leading-none"
      >
        {kurz}
      </span>
    </Tag>
  );
}

/**
 * Name mit vorangestelltem Emoji, eingefärbt: "💻 | Tyler Adams".
 * Rolle sticht Komitee (Admin 💻, Kassenwart 💸, Stufenteam 👑).
 */
export function PersonName({
  userId,
  name,
  role,
  koms,
  className,
}: {
  userId?: string | null;
  name?: string;
  role?: string | null;
  koms?: string[] | null;
  className?: string;
}) {
  const { profile } = useProfiles();
  const { theme } = useTheme();
  const dunkel = theme === "dark";
  const p = userId ? profile[userId] : undefined;
  const anzeige = lesbarerName(p?.anzeigename || name || "Unbekannt");
  const key = p?.farbe || farbeAusName(anzeige);
  return (
    <span
      className={className}
      style={{ color: farbwert(key, dunkel), textShadow: farbKontur(key, dunkel) }}
    >
      {personIcon(role, koms)} | {anzeige}
    </span>
  );
}
