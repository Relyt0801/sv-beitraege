// Konfigurierbare Berechtigungen – muss mit supabase/permissions.sql übereinstimmen.
export type PermKey =
  | "chats.view_all"
  | "chats.delete_messages"
  | "chats.delete_items"
  | "chats.manage"
  | "komitees.assign"
  | "komitees.access"
  | "mod.timeout"
  | "kasse.edit"
  | "data.edit"
  | "hilfen.edit"
  | "beitraege.manage"
  | "termine.manage"
  | "kalender.test"
  | "finanzen.basis"
  | "finanzen.view"
  | "finanzen.manage"
  | "roles.manage"
  | "perms.manage"
  | "album.nutzen"
  | "album.kategorien"
  | "album.moderieren"
  | "umfragen.verwalten"
  | "umfragen.ergebnisse"
  | "zitate.nutzen"
  | "zitate.pruefen"
  | "funktionen.verwalten"
  | "rankings.nutzen"
  | "rankings.verwalten"
  | "lehrer.verwalten";

/** eltern: Das Recht lässt sich auch Elternzugängen geben (eigene Schaltfläche im Rechte-Reiter). */
export interface PermDef { key: PermKey; label: string; desc: string; eltern?: boolean }
export interface PermCategory { label: string; icon: string; perms: PermDef[] }

export const PERM_CATEGORIES: PermCategory[] = [
  {
    label: "Chats & Übersicht", icon: "📋", perms: [
      { key: "chats.view_all", label: "Alle Chats sehen", desc: "Zugriff auf alle Ordner/Chats (außer vom Admin gesperrte)." },
      { key: "chats.delete_messages", label: "Nachrichten löschen", desc: "Beiträge anderer Personen löschen." },
      { key: "chats.delete_items", label: "To-dos & Abstimmungen löschen", desc: "To-dos, Abstimmungen und Angepinntes anderer Personen in der Übersicht eines Chats löschen. Eigene gehen immer." },
      { key: "chats.manage", label: "Ordner verwalten", desc: "Ordner erstellen, umbenennen, anheften, Personen verwalten." },
    ],
  },
  {
    label: "Komitees", icon: "🏷️", perms: [
      { key: "komitees.assign", label: "Komitees zuweisen", desc: "Anderen Personen Komitees geben oder entziehen." },
      { key: "komitees.access", label: "Fremdzugriff verwalten", desc: "Personen oder ganzen Komitees Lese- oder Schreibrechte an fremden Komitees geben." },
    ],
  },
  {
    label: "Moderation", icon: "🛡️", perms: [
      { key: "mod.timeout", label: "Timeout / Chat-Sperre", desc: "Personen vom Schreiben sperren oder wieder entsperren." },
    ],
  },
  {
    label: "Kasse", icon: "💶", perms: [
      { key: "kasse.edit", label: "Beiträge ändern", desc: "Bezahlt / offen / erlassen setzen." },
    ],
  },
  {
    label: "Daten", icon: "🗂️", perms: [
      { key: "data.edit", label: "Daten bearbeiten", desc: "Namen, Personen, Halbjahr, Import/Export." },
      { key: "hilfen.edit", label: "Beteiligungen eintragen", desc: "Mithilfe/Beitragshilfen (Prozent) bei Personen eintragen – einzeln oder für mehrere auf einmal." },
      { key: "beitraege.manage", label: "Beiträge-Reiter", desc: "Halbjahresbeiträge, Möglichkeiten zum Prozentsammeln und die Abiball-Staffel festlegen." },
    ],
  },
  {
    label: "Finanzen", icon: "💰", perms: [
      { key: "finanzen.basis", label: "Finanzen ansehen – Standard", desc: "Kontostand, Anteil am Geldziel, Summe der offenen Beiträge, Stufenbeiträge je EF/Q1/Q2 und jede Aktion mit Einnahmen, Ausgaben und Saldo. Keine Namen, keine einzelnen Buchungen.", eltern: true },
      { key: "finanzen.view", label: "Finanzen ansehen – Erweitert", desc: "Das komplette Kassenbuch: jede Buchung mit Namen, Verlauf, Kostenanfragen, Bankabgleich. (Der Aufsichtsrat darf das automatisch.)" },
      { key: "finanzen.manage", label: "Kassenbuch führen", desc: "Buchungen eintragen und löschen, Kostenanfragen entscheiden, Ziel setzen, mit der Bank abgleichen." },
    ],
  },
  {
    label: "Termine", icon: "📅", perms: [
      { key: "termine.manage", label: "Termine verwalten", desc: "Termine anlegen, ändern, löschen und festlegen, wer sie sehen darf." },
      { key: "kalender.test", label: "Kalender-Verbindung (Testphase)", desc: "Stufen-Termine als Abo ins Handy holen und den eigenen Handy-Kalender in der App anzeigen. Noch im Test – nur einzelnen Personen geben." },
    ],
  },
  {
    label: "Abizeitung (Album, Zitate, Rankings)", icon: "📖", perms: [
      { key: "album.nutzen", label: "Abi-Album nutzen", desc: "Eigenen Steckbrief ausfüllen, die anderen ansehen, kommentieren und liken." },
      { key: "album.kategorien", label: "Steckbrief-Kategorien", desc: "Die Stammdaten-Felder festlegen (z. B. Nach dem Abi, Lieblingslied)." },
      { key: "album.moderieren", label: "Album moderieren", desc: "Kommentare und Texte anderer entfernen." },
      { key: "zitate.nutzen", label: "Zitatwand nutzen", desc: "Zitate einreichen, die freigegebenen ansehen und mit 🔥 abstimmen." },
      { key: "zitate.pruefen", label: "Zitate prüfen", desc: "Eingereichte Zitate freigeben, ablehnen, nachträglich ändern oder löschen." },
      { key: "rankings.nutzen", label: "Rankings nutzen", desc: "In den Schüler- und Lehrer-Rankings abstimmen und die Top 3 sehen." },
      { key: "rankings.verwalten", label: "Rankings verwalten", desc: "Ranking-Kategorien anlegen, ändern, löschen – auch direkt aus Umfrage-Ergebnissen." },
      { key: "lehrer.verwalten", label: "Lehrerliste pflegen", desc: "Lehrkräfte für Lehrer-Rankings und Zitate eintragen, ändern, löschen." },
    ],
  },
  {
    label: "Umfragen", icon: "📊", perms: [
      { key: "umfragen.verwalten", label: "Umfragen verwalten", desc: "Pop-up-Umfragen anlegen, starten und beenden. Sie erscheinen beim nächsten Öffnen der App." },
      { key: "umfragen.ergebnisse", label: "Ergebnisse sehen", desc: "Gezählte Ergebnisse ansehen – auch während eine Umfrage läuft. Einzelne Antworten sieht niemand." },
    ],
  },
  {
    label: "Rollen & Rechte", icon: "👑", perms: [
      { key: "roles.manage", label: "Rollen ändern", desc: "Rollen anderer Personen setzen." },
      { key: "perms.manage", label: "Berechtigungen vergeben", desc: "Diesen Rechte-Reiter benutzen." },
      { key: "funktionen.verwalten", label: "Funktionen an/aus", desc: "Ganze Bereiche für alle ein- oder ausschalten (Abiball-Tickets, Abi-Album, Zitate, Rankings, Umfragen) – im Profil." },
    ],
  },
];

export const ALL_PERMS: PermKey[] = PERM_CATEGORIES.flatMap((c) => c.perms.map((p) => p.key));

export type RolleKey = "schueler" | "sprecher" | "stv_sprecher" | "stufenteam" | "kassenwart" | "admin" | "eltern";

/**
 * Wie eine Rolle heisst – einmal ausgeschrieben, einmal kurz.
 * Steht hier zentral, damit Rollen-Reiter und Rechte-Reiter dieselben
 * Bezeichnungen benutzen und nirgends der rohe Schluessel durchrutscht.
 */
export const ROLLE_LANG: Record<string, string> = {
  schueler: "Schüler",
  sprecher: "Stufensprecher*in",
  stv_sprecher: "Stv. Schülersprecher*in",
  stufenteam: "Stufenteam",
  kassenwart: "Kassenwart",
  admin: "Admin",
  eltern: "Eltern",
};

export const ROLLE_KURZ: Record<string, string> = {
  schueler: "Schüler",
  sprecher: "Sprecher",
  stv_sprecher: "Sprecher",
  stufenteam: "Team",
  kassenwart: "Kasse",
  admin: "Admin",
  eltern: "Eltern",
};

/** Rollenname zum Anzeigen. Unbekannte Rollen fallen auf den Schluessel zurueck. */
export function rolleName(role: string): string {
  return ROLLE_LANG[role] ?? role;
}

/**
 * Für Rechte zählen Stufensprecher*in und Stv. als EINE Rolle: beide bekommen
 * immer dieselben Rechte. Deshalb gibt es im Rechte-Reiter nur eine Spalte
 * "Sprecher", und jede Änderung wird auf beide Rollen geschrieben.
 */
export const PERM_ROLES: { key: RolleKey; label: string }[] = [
  { key: "schueler", label: "Schüler" },
  { key: "sprecher", label: "Sprecher*innen" },
  { key: "stufenteam", label: "Stufenteam" },
  { key: "kassenwart", label: "Kassenwart" },
  { key: "admin", label: "Admin" },
];

/** Welche Rolle bestimmt die Rechte? Stv. hängt an der Sprecher-Zeile. */
export function rechteRolle(role: string): string {
  return role === "stv_sprecher" ? "sprecher" : role;
}

/** Alle Rollen, die zu einer Rechte-Zeile gehören (zum Speichern). */
export function rollenDerZeile(key: string): string[] {
  return key === "sprecher" ? ["sprecher", "stv_sprecher"] : [key];
}

// Standard-Rechte je Rolle (Fallback im Client, Seeds in permissions.sql identisch)
const TEAM_STANDARD: PermKey[] = ["chats.view_all", "chats.delete_messages", "chats.delete_items", "chats.manage", "komitees.assign", "data.edit", "hilfen.edit", "termine.manage", "mod.timeout", "finanzen.basis", "finanzen.view"];

export const ROLE_DEFAULTS: Record<string, PermKey[]> = {
  schueler: ["finanzen.basis"],
  eltern: ["finanzen.basis"], // Elternzugang: nur die Standard-Ansicht der Finanzen
  sprecher: [...TEAM_STANDARD],
  stv_sprecher: [...TEAM_STANDARD],
  stufenteam: [...TEAM_STANDARD],
  kassenwart: [...TEAM_STANDARD, "kasse.edit", "beitraege.manage", "finanzen.manage"],
  admin: [...ALL_PERMS],
};
