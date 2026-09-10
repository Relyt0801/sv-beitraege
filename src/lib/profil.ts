import { hasSupabase, supabase } from "./supabase";

/**
 * 16 Auswahlfarben für den eigenen Namen – bewusst 16, damit sie im Raster
 * (8 Spalten) auf Handy wie iPad exakt zwei Reihen ergeben.
 * hell = Wert auf hellem Grund, dunkel = Wert im Dunkelmodus.
 */
export const NAME_FARBEN: { key: string; label: string; hell: string; dunkel: string }[] = [
  { key: "indigo", label: "Indigo", hell: "#4f46e5", dunkel: "#a5b4fc" },
  { key: "blau", label: "Blau", hell: "#0369a1", dunkel: "#7dd3fc" },
  { key: "himmel", label: "Himmelblau", hell: "#0891b2", dunkel: "#67e8f9" },
  { key: "tuerkis", label: "Türkis", hell: "#0f766e", dunkel: "#5eead4" },
  { key: "mint", label: "Mint", hell: "#059669", dunkel: "#6ee7b7" },
  { key: "gruen", label: "Grün", hell: "#15803d", dunkel: "#86efac" },
  { key: "oliv", label: "Oliv", hell: "#4d7c0f", dunkel: "#bef264" },
  { key: "gelb", label: "Gelb", hell: "#ca8a04", dunkel: "#fde047" },
  { key: "gold", label: "Gold", hell: "#a16207", dunkel: "#fcd34d" },
  { key: "orange", label: "Orange", hell: "#c2410c", dunkel: "#fdba74" },
  { key: "koralle", label: "Koralle", hell: "#e11d48", dunkel: "#fda4af" },
  { key: "rot", label: "Rot", hell: "#b91c1c", dunkel: "#fca5a5" },
  { key: "pink", label: "Pink", hell: "#be185d", dunkel: "#f9a8d4" },
  { key: "lila", label: "Lila", hell: "#7e22ce", dunkel: "#d8b4fe" },
  { key: "braun", label: "Braun", hell: "#78350f", dunkel: "#d6bfa6" },
  { key: "grau", label: "Grau", hell: "#475569", dunkel: "#cbd5e1" },
];

const byKey = new Map(NAME_FARBEN.map((f) => [f.key, f]));

/** Hex-Wert einer Farbe – dunkel = für dunklen Hintergrund. */
export function farbwert(key: string | null | undefined, dunkel: boolean): string {
  const f = byKey.get(key || "indigo") || NAME_FARBEN[0];
  return dunkel ? f.dunkel : f.hell;
}

/** "Tyler Adams" -> "TA", "Anna-Lena Meyer zu Hof" -> "AM" */
export function initialen(name: string): string {
  const teile = (name || "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!teile.length) return "?";
  const a = teile[0][0] ?? "";
  const b = teile.length > 1 ? teile[teile.length - 1][0] ?? "" : "";
  return (a + b).toUpperCase();
}

export interface PublicProfile {
  user_id: string;
  anzeigename: string;
  initialen: string;
  farbe: string;
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
