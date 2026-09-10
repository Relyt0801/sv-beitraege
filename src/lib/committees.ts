// ============================================================
// Komitees / AKs der Stufe.
// NEUES KOMITEE HINZUFÜGEN: einfach hier eine Zeile ergänzen.
//   slug  = interner Name (klein, ohne Leer-/Sonderzeichen, EINDEUTIG, nie ändern)
//   label = Anzeigename
// Nach dem Ändern: git commit + push -> Vercel deployt automatisch. Kein SQL nötig.
// ============================================================
export const COMMITTEES: { slug: string; label: string; teamOnly?: boolean }[] = [
  { slug: "mottowoche", label: "Mottowoche" },
  { slug: "abiball", label: "Abiball" },
  { slug: "zeugnisvergabe", label: "Zeugnisvergabe" },
  { slug: "gottesdienst", label: "Gottesdienst" },
  { slug: "motto-pullis", label: "Motto & Pullis" },
  { slug: "abizeitung", label: "Abizeitung" },
  // teamOnly: nicht selbst wählbar – nur das Stufenteam kann zuordnen.
  { slug: "aufsichtsrat", label: "Aufsichtsrat", teamOnly: true },
];

/** Komitees, die man sich selbst geben darf. */
export const SELECTABLE_COMMITTEES = COMMITTEES.filter((c) => !c.teamOnly);

const bySlug = new Map(COMMITTEES.map((c) => [c.slug, c.label]));
export const committeeLabel = (slug: string): string => bySlug.get(slug) || slug;
