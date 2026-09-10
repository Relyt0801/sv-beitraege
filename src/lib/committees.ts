// ============================================================
// Komitees / AKs der Stufe.
// NEUES KOMITEE HINZUFÜGEN: einfach hier eine Zeile ergänzen.
//   slug  = interner Name (klein, ohne Leer-/Sonderzeichen, EINDEUTIG, nie ändern)
//   label = Anzeigename
// Nach dem Ändern: git commit + push -> Vercel deployt automatisch. Kein SQL nötig.
// ============================================================
export const COMMITTEES: { slug: string; label: string; icon: string; teamOnly?: boolean }[] = [
  { slug: "mottowoche", label: "Mottowoche", icon: "🎭" },
  { slug: "abiball", label: "Abiball", icon: "🥂" },
  { slug: "zeugnisvergabe", label: "Zeugnisvergabe", icon: "🎓" },
  { slug: "gottesdienst", label: "Gottesdienst", icon: "⛪" },
  { slug: "motto-pullis", label: "Motto & Pullis", icon: "👕" },
  { slug: "abizeitung", label: "Abizeitung", icon: "📰" },
  // teamOnly: nicht selbst wählbar – nur das Stufenteam kann zuordnen.
  { slug: "aufsichtsrat", label: "Aufsichtsrat", icon: "🪑", teamOnly: true },
];

/** Emoji je Rolle – sticht das Komitee-Emoji. */
export const ROLE_ICON: Record<string, string> = {
  admin: "💻",
  kassenwart: "💸",
  stufenteam: "👑",
};

/** Komitees, die man sich selbst geben darf. */
export const SELECTABLE_COMMITTEES = COMMITTEES.filter((c) => !c.teamOnly);

const bySlug = new Map(COMMITTEES.map((c) => [c.slug, c.label]));
const iconBySlug = new Map(COMMITTEES.map((c) => [c.slug, c.icon]));
export const committeeLabel = (slug: string): string => bySlug.get(slug) || slug;
export const committeeIcon = (slug: string): string => iconBySlug.get(slug) || "💬";

/**
 * Emoji vor dem Namen: Rolle geht vor Komitee.
 * Beispiel: "👑 | Yula Musterfrau", "⛪ | Jonas Müller"
 */
export function personIcon(role?: string | null, koms?: string[] | null): string {
  if (role && ROLE_ICON[role]) return ROLE_ICON[role];
  // koms kann aus der Datenbank auch mal kein Array sein – dann nicht abstürzen.
  const liste = Array.isArray(koms) ? koms : [];
  const first = liste.find((k) => iconBySlug.has(k));
  return first ? iconBySlug.get(first)! : "🙂";
}
