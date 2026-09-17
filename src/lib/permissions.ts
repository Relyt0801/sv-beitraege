// Konfigurierbare Berechtigungen – muss mit supabase/permissions.sql übereinstimmen.
export type PermKey =
  | "chats.view_all"
  | "chats.delete_messages"
  | "chats.manage"
  | "komitees.assign"
  | "komitees.access"
  | "mod.timeout"
  | "kasse.edit"
  | "data.edit"
  | "beitraege.manage"
  | "roles.manage"
  | "perms.manage";

export interface PermDef { key: PermKey; label: string; desc: string }
export interface PermCategory { label: string; icon: string; perms: PermDef[] }

export const PERM_CATEGORIES: PermCategory[] = [
  {
    label: "Chats & Übersicht", icon: "📋", perms: [
      { key: "chats.view_all", label: "Alle Chats sehen", desc: "Zugriff auf alle Ordner/Chats (außer vom Admin gesperrte)." },
      { key: "chats.delete_messages", label: "Nachrichten löschen", desc: "Beiträge anderer Personen löschen." },
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
      { key: "data.edit", label: "Daten bearbeiten", desc: "Namen, Beteiligungen, Personen, Halbjahr, Import/Export." },
      { key: "beitraege.manage", label: "Beiträge-Reiter", desc: "Halbjahresbeiträge, Möglichkeiten zum Prozentsammeln und die Abiball-Staffel festlegen." },
    ],
  },
  {
    label: "Rollen & Rechte", icon: "👑", perms: [
      { key: "roles.manage", label: "Rollen ändern", desc: "Rollen anderer Personen setzen." },
      { key: "perms.manage", label: "Berechtigungen vergeben", desc: "Diesen Rechte-Reiter benutzen." },
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
const TEAM_STANDARD: PermKey[] = ["chats.view_all", "chats.delete_messages", "chats.manage", "komitees.assign", "data.edit"];

export const ROLE_DEFAULTS: Record<string, PermKey[]> = {
  schueler: [],
  eltern: [], // Elternzugang bekommt keine der Befugnisse
  sprecher: [...TEAM_STANDARD],
  stv_sprecher: [...TEAM_STANDARD],
  stufenteam: ["chats.view_all", "chats.delete_messages", "chats.manage", "komitees.assign", "data.edit"],
  kassenwart: ["chats.view_all", "chats.delete_messages", "chats.manage", "komitees.assign", "data.edit", "kasse.edit", "beitraege.manage"],
  admin: [...ALL_PERMS],
};
