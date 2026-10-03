import { useEffect, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { meldeFehler } from "./melder";

/**
 * Mitteilungs-Schalter fürs Team (Spam-Schutz). Gespeichert in
 * profiles.mitteilungen (nur die eigene Zeile, „profiles self“). Der Server
 * (send-push) liest dieselben Schalter.
 *
 *  schueler  – Chats mit Schülern (Fragen ans Stufenteam)      Standard: an
 *  eltern    – Chats mit Eltern                                Standard: an
 *  anfragen  – Anfragen (Nachträge, Komitee-Wechsel, …)        Standard: an
 *  komitees  – je Komitee-Chat: true = Mitteilungen und roter Punkt auch
 *              ohne Mitglied zu sein; false = aus, auch als Mitglied.
 *              Fehlt der Eintrag: an für eigene Komitees, aus für fremde.
 */
export interface Mitteilungen {
  schueler?: boolean;
  eltern?: boolean;
  anfragen?: boolean;
  komitees?: Record<string, boolean>;
}
export type Kategorie = "schueler" | "eltern" | "anfragen";

let stand: Mitteilungen = {};
let geladen = false;
let laedt: Promise<void> | null = null;
const hoerer = new Set<(m: Mitteilungen) => void>();
const melden = () => hoerer.forEach((h) => h(stand));

async function laden(): Promise<void> {
  if (!hasSupabase) {
    geladen = true;
    return;
  }
  const { data: s } = await supabase!.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return;
  const { data } = await supabase!.from("profiles").select("mitteilungen").eq("user_id", uid).maybeSingle();
  stand = ((data as { mitteilungen?: Mitteilungen } | null)?.mitteilungen as Mitteilungen) || {};
  geladen = true;
  melden();
}

export function kategorieAn(m: Mitteilungen, k: Kategorie): boolean {
  return m[k] !== false;
}

/** Komitee-Chat: zählt er für mich (roter Punkt, Mitteilungen)? */
export function komiteeAn(m: Mitteilungen, slug: string, binMitglied: boolean): boolean {
  const w = m.komitees?.[slug];
  return w === undefined ? binMitglied : w;
}

export function useMitteilungen() {
  const [m, setM] = useState<Mitteilungen>(stand);
  useEffect(() => {
    hoerer.add(setM);
    if (!geladen && !laedt) laedt = laden().finally(() => (laedt = null));
    return () => {
      hoerer.delete(setM);
    };
  }, []);

  async function speichern(neu: Mitteilungen) {
    const vorher = stand;
    stand = neu;
    melden();
    if (!hasSupabase) return;
    const { data: s } = await supabase!.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return;
    const { error } = await supabase!.from("profiles").update({ mitteilungen: neu }).eq("user_id", uid);
    if (error) {
      stand = vorher;
      melden();
      meldeFehler("Speichern ging nicht: " + error.message);
    }
  }

  return {
    mitteilungen: m,
    setKategorie: (k: Kategorie, an: boolean) => speichern({ ...stand, [k]: an }),
    setKomitee: (slug: string, an: boolean) => speichern({ ...stand, komitees: { ...(stand.komitees || {}), [slug]: an } }),
  };
}

/** Beim Abmelden vergessen (anderes Konto auf demselben Gerät). */
export function mitteilungenVergessen() {
  stand = {};
  geladen = false;
}

if (hasSupabase) {
  supabase!.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      mitteilungenVergessen();
      if (hoerer.size) laedt = laden().finally(() => (laedt = null));
    }
  });
}
