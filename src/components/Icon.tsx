/**
 * Die Strichzeichnungen fuer die Navigation.
 *
 * Vorher standen dort Emojis. Die sehen auf jedem Geraet anders aus – auf dem
 * iPhone bunt und rund, auf Windows flach und eckig – und passen zu keinem
 * Dashboard. Diese Zeichen sind ueberall gleich und nehmen die Schriftfarbe an.
 */
export type IconName =
  | "kasse"
  | "events"
  | "chats"
  | "beitraege"
  | "rollen"
  | "rechte"
  | "haus"
  | "pin"
  | "bank";

const PFADE: Record<IconName, JSX.Element> = {
  kasse: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 11h20" />
    </>
  ),
  events: (
    <>
      <path d="M3 11v3a1 1 0 0 0 1 1h3l4 3V7L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
    </>
  ),
  chats: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
  beitraege: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h10" />
      <path d="M4 17h7" />
    </>
  ),
  rollen: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M17 11a3 3 0 1 0-1.5-5.6" />
      <path d="M17.5 20a6 6 0 0 0-2-4.5" />
    </>
  ),
  rechte: <path d="M12 3l7 3v5c0 4.4-2.9 8.3-7 10-4.1-1.7-7-5.6-7-10V6z" />,
  haus: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 7 3 3v2H7v-2l3-3z" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10h18" />
      <path d="m12 3 9 7H3z" />
      <path d="M6 10v8M12 10v8M18 10v8" />
      <path d="M3 21h18" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PFADE[name]}
    </svg>
  );
}
