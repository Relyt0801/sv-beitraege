import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = Boolean(url && key);
export const ACCESS_CODE = (import.meta.env.VITE_ACCESS_CODE as string | undefined) || "";

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string)
  : null;

/** Username -> technische Pseudo-Adresse (kein echter Mailversand nötig). */
export function usernameToEmail(username: string): string {
  const clean = username
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  return `${clean}@sv-beitraege.local`;
}
