import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// BOM, Zero-Width- und Steuerzeichen entfernen. Windows/PowerShell schreibt .env
// gern mit UTF-8-BOM; ein solches Zeichen im anon-Key sprengt sonst den
// fetch-Header ("String contains non ISO-8859-1 code point").
const clean = (v?: string): string | undefined => {
  if (!v) return undefined;
  const out = Array.from(v)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return false; // C0/C1-Steuerzeichen
      if (c === 0xfeff || (c >= 0x200b && c <= 0x200d)) return false; // BOM / Zero-Width
      return true;
    })
    .join("")
    .trim();
  return out || undefined;
};

const url = clean(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const hasSupabase = Boolean(url && key);
export const ACCESS_CODE = clean(import.meta.env.VITE_ACCESS_CODE) || "";

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string)
  : null;

/** Username -> technische Pseudo-Adresse (kein echter Mailversand nötig). */
export function usernameToEmail(username: string): string {
  const c = username
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  return `${c}@sv-beitraege.local`;
}
