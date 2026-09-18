/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ACCESS_CODE?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Beim Bauen eingesetzt (siehe vite.config.ts). Damit steht im Profil, welcher
 * Stand gerade laeuft - sonst sucht man Fehler in Code, der gar nicht deployt ist.
 */
declare const __BAU_COMMIT__: string;
declare const __BAU_ZEIT__: string;
