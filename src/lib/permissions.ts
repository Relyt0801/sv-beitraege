// Konfigurierbare Berechtigungen – muss mit supabase/permissions.sql übereinstimmen.
export type PermKey =
  | "chats.view_all"
  | "chats.delete_messages"
  | "chats.manage"
  | "komitees.assign"
  | "mod.timeout"
  | "kasse.edit"
  | "data.edit"
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

export const PERM_ROLES: { key: "schueler" | "stufenteam" | "kassenwart" | "admin"; label: string }[] = [
  { key: "schueler", label: "Schüler" },
  { key: "stufenteam", label: "Stufenteam" },
  { key: "kassenwart", label: "Kassenwart" },
  { key: "admin", label: "Admin" },
];

// Standard-Rechte je Rolle (Fallback im Client, Seeds in permissions.sql identisch)
export const ROLE_DEFAULTS: Record<string, PermKey[]> = {
  schueler: [],
  stufenteam: ["chats.view_all", "chats.delete_messages", "chats.manage", "komitees.assign", "data.edit"],
  kassenwart: ["chats.view_all", "chats.delete_messages", "chats.manage", "komitees.assign", "data.edit", "kasse.edit"],
  admin: [...ALL_PERMS],
};
