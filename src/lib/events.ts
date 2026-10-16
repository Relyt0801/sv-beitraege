export type EventType = "info" | "umfrage" | "nachricht";

export interface PollOption {
  id: string;
  label: string;
}

export interface EventItem {
  id: string;
  type: EventType;
  title: string;
  body: string;
  is_warning: boolean;
  audience: "all" | "selected" | "komitee";
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  /** anonym = nur das Stufenteam sieht, wer wie gestimmt hat */
  poll_anon: boolean;
  created_by: string | null;
  created_at: string;
  options: PollOption[];
  target_ids: string[];
  /** Komitee-Slugs, wenn audience = "komitee" */
  tags: string[];
}

export interface NewEvent {
  type: EventType;
  title: string;
  body: string;
  is_warning: boolean;
  audience: "all" | "selected" | "komitee";
  target_ids: string[];
  tags: string[];
  poll_multiple: boolean;
  poll_min_one: boolean;
  poll_show_results: boolean;
  poll_anon: boolean;
  options: string[]; // Antwort-Labels
}

/**
 * "nachricht" gibt es nur noch für alte Beiträge – neu angelegt wird nur
 * Info (mit allen Optionen, die früher die Nachricht hatte) und Abstimmung.
 */
export const TYPE_META: Record<EventType, { label: string; icon: string }> = {
  info: { label: "Info", icon: "📌" },
  umfrage: { label: "Abstimmung", icon: "🗳️" },
  nachricht: { label: "Info", icon: "📌" },
};

/** Was man im Formular neu anlegen kann */
export const NEUE_TYPEN: EventType[] = ["info", "umfrage"];

// ================================================================ Gruppieren

/**
 * Füllwörter, die beim Vergleichen von Titeln nichts sagen. „Waffelverkauf
 * am Dienstag“ und „Waffelverkauf – neue Schichten“ sollen als gleichartig
 * gelten; das „am“ oder „neue“ darf den Vergleich nicht stören.
 */
const FUELLWOERTER = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer",
  "am", "an", "im", "in", "zum", "zur", "fuer", "und", "mit", "von", "vom", "bis", "ab", "auf", "bei", "nach",
  "info", "infos", "wichtig", "neu", "neue", "neues", "update", "erinnerung", "achtung", "hinweis", "termin", "termine",
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  "januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember",
  "heute", "morgen", "naechste", "naechsten", "diese", "dieser", "diesen", "woche", "pause", "grosse", "kleine",
]);

/** Kleinbuchstaben, Umlaute ausgeschrieben, Zeichen und Ziffern zu Leerzeichen. */
function normalisiert(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * Der Vergleichsschlüssel eines Titels: das erste Wort, das etwas sagt.
 *
 * Beispiele:
 *   „🧇 Waffelverkauf 1. große Pause“  → „waffelverkauf“
 *   „Waffelverkauf am Dienstag“         → „waffelverkauf“
 *   „Waffelteig backen“                 → „waffelteig“
 *   „Info: Stufenversammlung“           → „stufenversammlung“
 *
 * Bewusst einfach gehalten (kein „unscharfer“ Vergleich): lieber eine Gruppe
 * zu wenig als zwei verschiedene Dinge, die plötzlich zusammenkleben.
 */
export function titelSchluessel(titel: string): string {
  const woerter = normalisiert(titel).split(" ").filter(Boolean);
  const erstes = woerter.find((w) => w.length >= 3 && !FUELLWOERTER.has(w));
  return erstes || woerter.join(" ") || titel.trim().toLowerCase();
}

/** Ein Eintrag der gruppierten Liste: entweder einzeln oder eine ganze Gruppe. */
export type Gruppiert<T> =
  | { art: "einzeln"; schluessel: string; eintrag: T }
  | { art: "gruppe"; schluessel: string; titel: string; eintraege: T[] };

/**
 * Gleichartige Einträge zusammenfassen – damit man nicht scrollen muss.
 *
 * Reine Funktion, ohne React: bekommt eine (schon sortierte) Liste und sagt,
 * wie der Titel eines Eintrags lautet. Alles mit demselben Schlüssel (siehe
 * titelSchluessel) landet in einer Gruppe – aber nur, wenn es mindestens
 * `ab` Stück sind (Standard 3). Zwei Waffelverkäufe stehen also weiter
 * einzeln da, ab dem dritten werden sie zu „Waffelverkauf · 3 Termine“.
 *
 * Die Reihenfolge bleibt erhalten: Eine Gruppe steht dort, wo ihr erster
 * Eintrag stand. Bei Terminen (nach Datum sortiert) ist das der nächste
 * Termin, bei Beiträgen (neueste zuerst) der neueste.
 *
 * Der Titel der Gruppe: sind alle Titel gleich, genau dieser – sonst das
 * gemeinsame Wort so geschrieben, wie es im ersten Titel steht.
 */
export function gruppiereAehnliche<T>(liste: T[], titelVon: (x: T) => string, ab = 3): Gruppiert<T>[] {
  const nachSchluessel = new Map<string, T[]>();
  for (const x of liste) {
    const k = titelSchluessel(titelVon(x));
    const l = nachSchluessel.get(k);
    if (l) l.push(x);
    else nachSchluessel.set(k, [x]);
  }
  const fertig = new Set<string>();
  const aus: Gruppiert<T>[] = [];
  for (const x of liste) {
    const k = titelSchluessel(titelVon(x));
    const alle = nachSchluessel.get(k)!;
    if (alle.length < ab) {
      aus.push({ art: "einzeln", schluessel: k, eintrag: x });
      continue;
    }
    if (fertig.has(k)) continue;
    fertig.add(k);
    aus.push({ art: "gruppe", schluessel: k, titel: gruppenTitel(alle.map(titelVon), k), eintraege: alle });
  }
  return aus;
}

/** „Waffelverkauf“ aus „🧇 Waffelverkauf am Dienstag“ – siehe gruppiereAehnliche. */
function gruppenTitel(titel: string[], schluessel: string): string {
  const sauber = titel.map((t) => t.trim());
  if (sauber.every((t) => t === sauber[0])) return sauber[0];
  // Das Wort im Original suchen, damit Groß-/Kleinschreibung und Umlaute stimmen
  for (const wort of sauber[0].split(/[^\p{L}]+/u)) {
    if (normalisiert(wort) === schluessel) return wort.charAt(0).toUpperCase() + wort.slice(1);
  }
  return schluessel.charAt(0).toUpperCase() + schluessel.slice(1);
}

// ================================================================ Alter

/** Ab wie vielen Tagen ein Beitrag als „älter“ gilt und eingeklappt wird. */
export const AELTER_AB_TAGEN = 14;

/**
 * Beiträge in „aktuell“ und „älter“ teilen. Abstimmungen, bei denen man
 * selbst noch nicht abgestimmt hat, bleiben immer aktuell – die sollen nicht
 * im eingeklappten Teil verschwinden.
 */
export function nachAlter(
  events: EventItem[],
  nochOffen: (e: EventItem) => boolean,
  jetzt: number = Date.now(),
  tage: number = AELTER_AB_TAGEN,
): { aktuell: EventItem[]; aelter: EventItem[] } {
  const grenze = jetzt - tage * 864e5;
  const aktuell: EventItem[] = [];
  const aelter: EventItem[] = [];
  for (const e of events) {
    if (new Date(e.created_at).getTime() >= grenze || nochOffen(e)) aktuell.push(e);
    else aelter.push(e);
  }
  return { aktuell, aelter };
}

// ================================================================ Demo

/**
 * Erfundene Beiträge für den Demo-Modus (ohne Datenbank, ?rolle=…). Mit vier
 * „Waffelverkauf“-Beiträgen, damit man das Zusammenfassen sieht, und einem
 * alten Beitrag für den eingeklappten Teil „Älter“. Keine echten Namen.
 */
export function demoEvents(jetzt: number = Date.now()): {
  events: EventItem[];
  stimmen: Record<string, Record<string, number>>;
} {
  const vor = (tage: number, stunden = 0) => new Date(jetzt - tage * 864e5 - stunden * 36e5).toISOString();
  const basis = {
    is_warning: false,
    audience: "all" as const,
    poll_multiple: false,
    poll_min_one: true,
    poll_show_results: true,
    poll_anon: true,
    created_by: "demo-team",
    options: [] as PollOption[],
    target_ids: [] as string[],
    tags: [] as string[],
  };
  const events: EventItem[] = [
    {
      ...basis,
      id: "demo-ev-1",
      type: "umfrage",
      title: "Welcher Termin für die Infoveranstaltung zur Abifahrt?",
      body: "Wir stellen die drei Angebote vor – dauert ca. 30 Minuten.",
      created_at: vor(0, 3),
      options: [
        { id: "demo-ev-1-a", label: "Dienstag, 7. Stunde" },
        { id: "demo-ev-1-b", label: "Donnerstag, 7. Stunde" },
        { id: "demo-ev-1-c", label: "Freitag nach der 6." },
      ],
    },
    {
      ...basis,
      id: "demo-ev-2",
      type: "info",
      title: "Waffelverkauf – neue Schichten online",
      body: "Ab nächster Woche verkaufen wir wieder dienstags und donnerstags. Tragt euch unter „Mitmachen“ ein!",
      created_at: vor(1),
    },
    {
      ...basis,
      id: "demo-ev-3",
      type: "info",
      title: "Stufenbeitrag EF.1 bis Freitag überweisen",
      body: "Wer noch offen ist, sieht es unter „Kasse“. Bei Fragen: Stufenteam ansprechen.",
      is_warning: true,
      created_at: vor(2),
    },
    {
      ...basis,
      id: "demo-ev-4",
      type: "info",
      title: "Waffelverkauf am Dienstag: Teig ist bestellt",
      body: "Bitte 10 Minuten vor der Pause an der Pausenhalle sein.",
      created_at: vor(4),
    },
    {
      ...basis,
      id: "demo-ev-5",
      type: "info",
      title: "Waffelverkauf: Danke fürs Mithelfen!",
      body: "Letzte Woche kamen 186 € zusammen – Rekord!",
      created_at: vor(6),
    },
    {
      ...basis,
      id: "demo-ev-6",
      type: "info",
      title: "Waffelverkauf fällt am Donnerstag aus",
      body: "Wegen der Klausuren verschieben wir auf nächste Woche.",
      created_at: vor(9),
    },
    {
      ...basis,
      id: "demo-ev-7",
      type: "info",
      title: "Fotos vom Sommerfest sind im Album",
      body: "Schaut unter „Abi-Album“ vorbei.",
      created_at: vor(30),
    },
  ];
  return {
    events,
    stimmen: { "demo-ev-1": { "demo-ev-1-a": 9, "demo-ev-1-b": 14, "demo-ev-1-c": 4 } },
  };
}
