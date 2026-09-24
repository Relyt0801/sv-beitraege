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
  | "bank"
  | "kalender"
  | "finanzen"
  | "sonne"
  | "mond"
  | "regler"
  | "auswahl"
  | "lupe"
  | "plus"
  | "chevron"
  | "haken"
  | "kind"
  | "pfeil-rein"
  | "pfeil-raus"
  | "muell"
  | "info"
  | "herz"
  | "pfeile";

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
  kalender: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  finanzen: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </>
  ),
  sonne: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  mond: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  regler: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  auswahl: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  lupe: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  haken: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  kind: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  "pfeil-rein": <path d="M12 5v14M6 13l6 6 6-6" />,
  "pfeil-raus": <path d="M12 19V5M6 11l6-6 6 6" />,
  muell: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>
  ),
  herz: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pfeile: (
    <>
      <path d="M7 4v16M3 8l4-4 4 4" />
      <path d="M17 20V4M13 16l4 4 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
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

export function Icon({ name, size = 20, strich = 2 }: { name: IconName; size?: number; strich?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strich}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PFADE[name]}
    </svg>
  );
}
