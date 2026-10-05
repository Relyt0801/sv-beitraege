import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { useRole } from "../auth/RoleProvider";

/**
 * Funktionen an/aus (Profil → Funktionen, Recht funktionen.verwalten).
 * Schaltet ganze Bereiche für alle. Wer innerhalb eines Bereichs was darf,
 * steht weiter im Rechte-Reiter. Gespeichert in app_settings.funktionen
 * (supabase/funktionen-zitate.sql); ändern nur über funktion_setzen().
 *
 * Ausgeschaltetes sieht nur, wer die Funktionen verwaltet – mit Hinweis –,
 * damit man vorbereiten kann, bevor alle es sehen.
 */
export type FunktionKey = "abiball" | "album" | "zitate" | "rankings" | "umfragen" | "spotify" | "motto";

export const FUNKTIONEN: { key: FunktionKey; titel: string; zeichen: string; text: string }[] = [
  { key: "abiball", titel: "Abiball-Tickets", zeichen: "🎟️", text: "Ticket-Bereich bei Schülern und Eltern." },
  { key: "album", titel: "Abi-Album", zeichen: "📖", text: "Steckbriefe mit Kommentaren und Likes." },
  { key: "zitate", titel: "Zitatwand", zeichen: "💬", text: "Zitate von Lehrern und Mitschülern sammeln und abstimmen." },
  { key: "rankings", titel: "Abi-Rankings", zeichen: "🏆", text: "Schüler- und Lehrer-Ranking mit Top 3." },
  { key: "motto", titel: "Abimotto", zeichen: "✨", text: "Mottos vorschlagen, mit 👍 und 🔥 abstimmen." },
  { key: "spotify", titel: "Spotify im Steckbrief", zeichen: "🎵", text: "Lieder aus Spotify-Links mit Cover und 30-Sekunden-Hörprobe." },
  { key: "umfragen", titel: "Pop-up-Umfragen", zeichen: "📊", text: "Umfragen, die beim Öffnen der App erscheinen." },
];

const STANDARD: Record<FunktionKey, boolean> = { abiball: true, album: false, zitate: false, rankings: false, umfragen: true, spotify: true, motto: false };
const DEMO = "sv-funktionen-demo";

interface Ctx {
  an: Record<FunktionKey, boolean>;
  bereit: boolean;
  /** an – oder man verwaltet die Funktionen (dann mit Hinweis) */
  sichtbar: (k: FunktionKey) => boolean;
  setzen: (k: FunktionKey, wert: boolean) => Promise<string | null>;
}

const FunktionenCtx = createContext<Ctx | null>(null);

export function FunktionenProvider({ children }: { children: ReactNode }) {
  const { can, ready } = useRole();
  const [an, setAn] = useState<Record<FunktionKey, boolean>>(() => {
    if (hasSupabase) return STANDARD;
    try {
      return { ...STANDARD, album: true, zitate: true, rankings: true, motto: true, ...JSON.parse(localStorage.getItem(DEMO) || "{}") };
    } catch {
      return { ...STANDARD, album: true, zitate: true, rankings: true, motto: true };
    }
  });
  const [bereit, setBereit] = useState(!hasSupabase);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("app_settings").select("funktionen").eq("id", 1).maybeSingle();
    const f = (data as { funktionen?: Partial<Record<FunktionKey, boolean>> } | null)?.funktionen;
    if (f) setAn({ ...STANDARD, ...f });
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!ready || !hasSupabase) return;
    void laden();
    return abonniere({
      name: "sv-funktionen",
      nachholen: laden,
      aufbauen: (k) =>
        k.on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p) => {
          const f = (p.new as { funktionen?: Partial<Record<FunktionKey, boolean>> }).funktionen;
          if (f) setAn({ ...STANDARD, ...f });
        }),
    });
  }, [ready, laden]);

  const verwaltet = can("funktionen.verwalten");
  const sichtbar = useCallback((k: FunktionKey) => an[k] || verwaltet, [an, verwaltet]);

  const setzen = useCallback(async (k: FunktionKey, wert: boolean) => {
    setAn((a) => ({ ...a, [k]: wert }));
    if (!hasSupabase) {
      setAn((a) => {
        try {
          localStorage.setItem(DEMO, JSON.stringify(a));
        } catch {
          /* privater Modus */
        }
        return a;
      });
      return null;
    }
    const { data, error } = await supabase!.rpc("funktion_setzen", { p_name: k, p_an: wert });
    if (error) {
      setAn((a) => ({ ...a, [k]: !wert }));
      return error.message;
    }
    if (data) setAn({ ...STANDARD, ...(data as Partial<Record<FunktionKey, boolean>>) });
    return null;
  }, []);

  return createElement(FunktionenCtx.Provider, { value: { an, bereit, sichtbar, setzen } }, children);
}

export function useFunktionen(): Ctx {
  const v = useContext(FunktionenCtx);
  // Ohne Provider (z. B. in Tests): alles wie Standard, nichts änderbar
  return v ?? { an: STANDARD, bereit: true, sichtbar: (k) => STANDARD[k], setzen: async () => "Nicht verfügbar" };
}
