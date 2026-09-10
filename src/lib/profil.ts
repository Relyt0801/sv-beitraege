import { hasSupabase, supabase } from "./supabase";

export type FarbStufe = "alle" | "team" | "op";

export interface NamensFarbe {
  key: string;
  label: string;
  /** Wert auf hellem Grund */
  hell: string;
  /** Wert im Dunkelmodus */
  dunkel: string;
  /** Schriftfarbe im Kreis (Standard weiß) */
  schrift?: string;
  /** helle/dunkle Extremfarben brauchen eine Kontur, sonst verschwinden sie */
  kontur?: boolean;
  /** wer die Farbe wählen darf */
  stufe?: FarbStufe;
}

/**
 * Typische Farben. 14 für alle, Schwarz ab Stufenteam, Magenta nur für den OP –
 * damit bleiben es im 8er-Raster immer genau zwei Reihen.
 */
export const NAME_FARBEN: NamensFarbe[] = [
  { key: "rot", label: "Rot", hell: "#dc2626", dunkel: "#f87171" },
  { key: "orange", label: "Orange", hell: "#ea580c", dunkel: "#fb923c" },
  { key: "gelb", label: "Gelb", hell: "#ca8a04", dunkel: "#facc15", schrift: "#1f2937" },
  { key: "gruen", label: "Grün", hell: "#16a34a", dunkel: "#4ade80" },
  { key: "mint", label: "Mint", hell: "#059669", dunkel: "#6ee7b7" },
  { key: "tuerkis", label: "Türkis", hell: "#0d9488", dunkel: "#5eead4" },
  { key: "blau", label: "Blau", hell: "#2563eb", dunkel: "#60a5fa" },
  { key: "hellblau", label: "Hellblau", hell: "#0284c7", dunkel: "#7dd3fc" },
  { key: "indigo", label: "Indigo", hell: "#4f46e5", dunkel: "#a5b4fc" },
  { key: "lila", label: "Lila", hell: "#7c3aed", dunkel: "#c4b5fd" },
  { key: "pink", label: "Pink", hell: "#db2777", dunkel: "#f9a8d4" },
  { key: "braun", label: "Braun", hell: "#92400e", dunkel: "#d6bfa6" },
  { key: "grau", label: "Grau", hell: "#475569", dunkel: "#cbd5e1" },
  { key: "weiss", label: "Weiß", hell: "#ffffff", dunkel: "#ffffff", schrift: "#1f2937", kontur: true },
  { key: "schwarz", label: "Schwarz", hell: "#0f172a", dunkel: "#1e293b", kontur: true, stufe: "team" },
  { key: "magenta", label: "Magenta", hell: "#c026d3", dunkel: "#f0abfc", stufe: "op" },
];

const byKey = new Map(NAME_FARBEN.map((f) => [f.key, f]));

export function farbe(key: string | null | undefined): NamensFarbe {
  return byKey.get(key || "indigo") || NAME_FARBEN[8];
}

/** Farben, die automatisch vergeben werden dürfen (ohne Sonderfarben). */
const AUTO_FARBEN = NAME_FARBEN.filter((f) => !f.stufe && f.key !== "weiss");

/**
 * Wer noch keine Farbe gewählt hat, bekommt eine feste aus dem Namen berechnet –
 * so bleibt der Kreis nach jedem Neuladen gleich statt immer indigo zu sein.
 */
export function farbeAusName(name: string): string {
  const t = (name || "?").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return AUTO_FARBEN[h % AUTO_FARBEN.length].key;
}

/** Hex-Wert einer Farbe – dunkel = im Dunkelmodus. */
export function farbwert(key: string | null | undefined, dunkel: boolean): string {
  const f = farbe(key);
  return dunkel ? f.dunkel : f.hell;
}

/**
 * Lesbare Schriftfarbe auf einem Untergrund – rechnet die Helligkeit aus,
 * damit Initialen weder auf Schwarz noch auf Weiß untergehen.
 */
export function schriftAuf(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const kanal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  return L > 0.45 ? "#111827" : "#ffffff";
}

/** Kontur für Weiß auf Hell bzw. Schwarz auf Dunkel, sonst nichts. */
export function farbKontur(key: string | null | undefined, dunkel: boolean): string | undefined {
  const f = farbe(key);
  if (!f.kontur) return undefined;
  const unsichtbar = (f.key === "weiss" && !dunkel) || (f.key === "schwarz" && dunkel);
  return unsichtbar ? (dunkel ? "0 0 3px rgba(255,255,255,.75)" : "0 0 3px rgba(15,23,42,.6)") : undefined;
}

/** Welche Farben darf diese Person wählen? */
export function waehlbareFarben(opts: { staff: boolean; op: boolean }): NamensFarbe[] {
  return NAME_FARBEN.filter((f) => {
    if (f.stufe === "op") return opts.op;
    if (f.stufe === "team") return opts.staff || opts.op;
    return true;
  });
}

/**
 * "Tyler Adams" -> "TA".
 * Nutzernamen der Form "adams.tyler" werden vorher gedreht, sonst käme "AT" heraus.
 */
export function initialen(name: string): string {
  const teile = lesbarerName(name)
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!teile.length) return "?";
  const a = teile[0][0] ?? "";
  const b = teile.length > 1 ? teile[teile.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase();
}

/** "adams.tyler" -> "Tyler Adams". Alles andere bleibt, wie es ist. */
export function lesbarerName(name: string): string {
  const n = (name || "").trim();
  const m = /^([\p{L}-]+)\.([\p{L}-]+)$/u.exec(n);
  if (!m) return n;
  const gross = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  return `${gross(m[2])} ${gross(m[1])}`; // nachname.vorname -> Vorname Nachname
}

export interface PublicProfile {
  user_id: string;
  anzeigename: string;
  initialen: string;
  farbe: string;
  /** Pop-up-Benachrichtigungen für Chat-Nachrichten */
  push_chats?: boolean;
}

/** Eigenes Anzeige-Profil anlegen/aktualisieren. */
export async function speichereProfil(patch: Partial<Omit<PublicProfile, "user_id">>): Promise<{ ok: boolean; error?: string }> {
  if (!hasSupabase) return { ok: true };
  const { data: s } = await supabase!.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return { ok: false, error: "nicht angemeldet" };
  const { error } = await supabase!
    .from("public_profiles")
    .upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
