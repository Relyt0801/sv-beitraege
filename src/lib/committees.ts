// ============================================================
// Komitees / AKs der Stufe.
// NEUES KOMITEE HINZUFÜGEN: einfach hier eine Zeile ergänzen.
//   slug  = interner Name (klein, ohne Leer-/Sonderzeichen, EINDEUTIG, nie ändern)
//   label = Anzeigename
// Nach dem Ändern: git commit + push -> Vercel deployt automatisch. Kein SQL nötig.
// ============================================================
export const COMMITTEES: { slug: string; label: string }[] = [
  { slug: "mottowoche", label: "Mottowoche" },
  { slug: "abiball", label: "Abiball" },
  { slug: "zeugnisvergabe", label: "Zeugnisvergabe" },
  { slug: "gottesdienst", label: "Gottesdienst" },
  { slug: "motto-pullis", label: "Motto & Pullis" },
  { slug: "abizeitung", label: "Abizeitung" },
  { slug: "aufsichtsrat", label: "Aufsichtsrat" },
];

const bySlug = new Map(COMMITTEES.map((c) => [c.slug, c.label]));
export const committeeLabel = (slug: string): string => bySlug.get(slug) || slug;
