import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import type { NeuerTermin, Termin } from "./lib/termine";
import { meldeFehler } from "./lib/melder";
import { abonniere } from "./lib/realtime";

const LS = "sv-beitraege:termine";
const LOCAL_UID = "local-user";

interface TermineValue {
  termine: Termin[];
  ready: boolean;
  /** Komitee-Slugs, in denen ich (oder mein Kind) bin */
  meineKomitees: string[];
  /** student_ids, die zu mir gehoeren – eigener Eintrag und Kinder */
  meineStudentIds: string[];
  anlegen: (t: NeuerTermin) => Promise<string | null>;
  aendern: (id: string, t: NeuerTermin) => Promise<string | null>;
  loeschen: (id: string) => Promise<void>;
}

const Ctx = createContext<TermineValue | null>(null);
export const useTermine = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTermine ausserhalb des Providers");
  return v;
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function TermineProvider({ children }: { children: ReactNode }) {
  const [termine, setTermine] = useState<Termin[]>([]);
  const [meineKomitees, setMeineKomitees] = useState<string[]>([]);
  const [meineStudentIds, setMeineStudentIds] = useState<string[]>([]);
  const [ready, setReady] = useState(!hasSupabase);
  const uidRef = useRef<string>(LOCAL_UID);
  // Realtime feuert bei jeder Aenderung dreimal (Termin, Komitees, Personen).
  // Buendeln, statt drei Abfragen hintereinander zu schicken.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------- lokal
  useEffect(() => {
    if (hasSupabase) return;
    try {
      setTermine(JSON.parse(localStorage.getItem(LS) || "[]"));
    } catch {
      /* kaputter Speicher – dann eben leer */
    }
  }, []);

  const lokalSpeichern = useCallback((next: Termin[]) => {
    localStorage.setItem(LS, JSON.stringify(next));
  }, []);

  // ---------------------------------------------------------- laden
  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [t, k, p] = await Promise.all([
      supabase!.from("termine").select("*").order("datum"),
      supabase!.from("termin_komitees").select("*"),
      supabase!.from("termin_personen").select("*"),
    ]);

    const tags = new Map<string, string[]>();
    for (const r of k.data || []) {
      const l = tags.get(r.termin_id) || [];
      l.push(r.tag);
      tags.set(r.termin_id, l);
    }
    const pers = new Map<string, string[]>();
    for (const r of p.data || []) {
      const l = pers.get(r.termin_id) || [];
      l.push(r.student_id);
      pers.set(r.termin_id, l);
    }

    setTermine(
      (t.data || []).map((r) => ({
        ...(r as Omit<Termin, "tags" | "personen">),
        tags: tags.get(r.id) || [],
        personen: pers.get(r.id) || [],
      })),
    );
    setReady(true);
  }, []);

  /** Wessen Termine gehen mich etwas an? Kommt aus denselben Funktionen,
   *  die auch die Datenbank fuer die Sichtbarkeit benutzt. */
  const michLaden = useCallback(async () => {
    if (!hasSupabase) return;
    const [k, p] = await Promise.all([
      supabase!.rpc("meine_komitees"),
      supabase!.rpc("meine_personen"),
    ]);
    // setof text / setof uuid kommt als einfache Liste von Zeichenketten zurueck
    const liste = (d: unknown): string[] =>
      Array.isArray(d) ? d.filter((x): x is string => typeof x === "string") : [];
    setMeineKomitees(liste(k.data));
    setMeineStudentIds(liste(p.data));
  }, []);

  const planeNachladen = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void laden(), 220);
  }, [laden]);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let abmelden: (() => void) | null = null;

    const start = async () => {
      const { data } = await supabase!.auth.getSession();
      uidRef.current = data.session?.user.id || LOCAL_UID;
      if (!data.session) {
        if (alive) setReady(true);
        return;
      }
      await Promise.all([laden(), michLaden()]);
      // Siehe events-store: der Kanal entsteht erst nach einem await, deshalb
      // hier pruefen, ob die Ansicht ueberhaupt noch da ist.
      if (!alive || abmelden) return;
      abmelden = abonniere({
        name: "sv-termine",
        nachholen: planeNachladen,
        aufbauen: (kanal) =>
          kanal
            .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, planeNachladen)
            .on("postgres_changes", { event: "*", schema: "public", table: "termin_komitees" }, planeNachladen)
            .on("postgres_changes", { event: "*", schema: "public", table: "termin_personen" }, planeNachladen),
      });
    };
    void start();

    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTermine([]);
        setMeineKomitees([]);
        setMeineStudentIds([]);
        abmelden?.();
        abmelden = null;
        void start();
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      abmelden?.();
    };
  }, [laden, michLaden, planeNachladen]);

  // ---------------------------------------------------------- schreiben
  /** Die Zuordnungen stehen in zwei eigenen Tabellen. Beim Speichern erst
   *  weg, dann neu – sonst bleiben abgewaehlte Komitees stehen. */
  const zuordnungSchreiben = useCallback(async (id: string, t: NeuerTermin) => {
    await Promise.all([
      supabase!.from("termin_komitees").delete().eq("termin_id", id),
      supabase!.from("termin_personen").delete().eq("termin_id", id),
    ]);
    if (t.sichtbar === "komitee" && t.tags.length)
      await supabase!.from("termin_komitees").insert(t.tags.map((tag) => ({ termin_id: id, tag })));
    if (t.sichtbar === "personen" && t.personen.length)
      await supabase!
        .from("termin_personen")
        .insert(t.personen.map((student_id) => ({ termin_id: id, student_id })));
  }, []);

  const felder = (t: NeuerTermin) => ({
    titel: t.titel.trim(),
    beschreibung: t.beschreibung.trim(),
    ort: t.ort.trim(),
    datum: t.datum,
    bis_datum: t.bis_datum || null,
    von: t.von || null,
    bis: t.bis || null,
    sichtbar: t.sichtbar,
    fuer_eltern: t.fuer_eltern,
  });

  const anlegen = useCallback<TermineValue["anlegen"]>(
    async (t) => {
      if (!hasSupabase) {
        const neu: Termin = {
          id: uuid(),
          ...felder(t),
          created_by: LOCAL_UID,
          created_at: new Date().toISOString(),
          tags: t.tags,
          personen: t.personen,
        };
        setTermine((prev) => {
          const next = [...prev, neu].sort((a, b) => a.datum.localeCompare(b.datum));
          lokalSpeichern(next);
          return next;
        });
        return null;
      }
      const { data, error } = await supabase!
        .from("termine")
        .insert({ ...felder(t), created_by: uidRef.current })
        .select("id")
        .single();
      if (error) return error.message;
      await zuordnungSchreiben(data.id, t);
      await laden();
      return null;
    },
    [laden, lokalSpeichern, zuordnungSchreiben],
  );

  const aendern = useCallback<TermineValue["aendern"]>(
    async (id, t) => {
      if (!hasSupabase) {
        setTermine((prev) => {
          const next = prev
            .map((x) => (x.id === id ? { ...x, ...felder(t), tags: t.tags, personen: t.personen } : x))
            .sort((a, b) => a.datum.localeCompare(b.datum));
          lokalSpeichern(next);
          return next;
        });
        return null;
      }
      const { error } = await supabase!.from("termine").update(felder(t)).eq("id", id);
      if (error) return error.message;
      await zuordnungSchreiben(id, t);
      await laden();
      return null;
    },
    [laden, lokalSpeichern, zuordnungSchreiben],
  );

  const loeschen = useCallback<TermineValue["loeschen"]>(
    async (id) => {
      const vorher = termine;
      setTermine((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (!hasSupabase) lokalSpeichern(next);
        return next;
      });
      if (!hasSupabase) return;
      const { error } = await supabase!.from("termine").delete().eq("id", id);
      if (error) {
        setTermine(vorher);
        meldeFehler("Der Termin konnte nicht gelöscht werden: " + error.message);
      }
    },
    [termine, lokalSpeichern],
  );

  return (
    <Ctx.Provider
      value={{ termine, ready, meineKomitees, meineStudentIds, anlegen, aendern, loeschen }}
    >
      {children}
    </Ctx.Provider>
  );
}
