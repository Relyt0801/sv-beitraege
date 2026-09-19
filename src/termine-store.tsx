import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import type { Aktion, NeueAnfrage, NeuerTermin, Termin, TerminAnfrage } from "./lib/termine";

const LS = "sv-beitraege:termine";
const LOCAL_UID = "local-user";

interface TermineValue {
  termine: Termin[];
  /** Ausschreibungen: Waffelverkauf, Kuchen backen … */
  aktionen: Aktion[];
  /** termin_id -> user_ids, die sich fuer die Schicht gemeldet haben */
  bewerbungen: Record<string, string[]>;
  ready: boolean;
  /** Komitee-Slugs, in denen ich (oder mein Kind) bin */
  meineKomitees: string[];
  /** student_ids, die zu mir gehoeren – eigener Eintrag und Kinder */
  meineStudentIds: string[];
  anlegen: (t: NeuerTermin) => Promise<string | null>;
  /** Mehrere Schichten auf einmal – fuer Wiederholungen. */
  anlegenViele: (liste: NeuerTermin[]) => Promise<string | null>;
  aendern: (id: string, t: NeuerTermin) => Promise<string | null>;
  loeschen: (id: string) => Promise<void>;
  aktionAnlegen: (a: Omit<Aktion, "id" | "created_at">) => Promise<string | null>;
  aktionAendern: (id: string, patch: Partial<Aktion>) => Promise<void>;
  aktionLoeschen: (id: string) => Promise<void>;
  /** Sich selbst fuer eine Schicht ein- oder austragen. */
  bewerben: (terminId: string, an: boolean) => Promise<void>;
  /** Person der Schicht zuteilen oder wieder herausnehmen. */
  zuteilen: (terminId: string, studentId: string, an: boolean) => Promise<void>;
  /** Wer bin ich? Fuer "habe ich mich schon eingetragen". */
  meineUid: string | null;

  // -------------------------------------------------- Vorsitz und Anfragen
  /** Komitee-Slug -> die (hoechstens zwei) user_ids der Vorsitzenden. */
  vorsitz: Record<string, string[]>;
  /** Komitees, deren Vorsitz ich bin. */
  meineVorsitze: string[];
  /** Terminanfragen – das Team sieht alle, alle anderen nur die eigenen. */
  anfragen: TerminAnfrage[];
  /** Die Vorsitzenden eines Komitees setzen. Mehr als zwei nimmt die
   *  Datenbank nicht an, darum wird vorher gekuerzt. */
  vorsitzSetzen: (tag: string, userIds: string[]) => Promise<string | null>;
  anfrageStellen: (a: NeueAnfrage) => Promise<string | null>;
  anfrageEntscheiden: (
    id: string,
    status: "angenommen" | "abgelehnt",
    antwort?: string,
  ) => Promise<string | null>;
  anfrageLoeschen: (id: string) => Promise<void>;
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
  const [aktionen, setAktionen] = useState<Aktion[]>([]);
  const [bewerbungen, setBewerbungen] = useState<Record<string, string[]>>({});
  const [vorsitz, setVorsitz] = useState<Record<string, string[]>>({});
  const [anfragen, setAnfragen] = useState<TerminAnfrage[]>([]);
  const [meineKomitees, setMeineKomitees] = useState<string[]>([]);
  const [meineStudentIds, setMeineStudentIds] = useState<string[]>([]);
  const [ready, setReady] = useState(!hasSupabase);
  const uidRef = useRef<string>(LOCAL_UID);
  const [meineUid, setMeineUid] = useState<string | null>(null);
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
    const [t, k, p, a, b, v, r] = await Promise.all([
      supabase!.from("termine").select("*").order("datum"),
      supabase!.from("termin_komitees").select("*"),
      supabase!.from("termin_personen").select("*"),
      supabase!.from("aktionen").select("*").order("created_at"),
      supabase!.from("aktion_bewerbungen").select("*"),
      supabase!.from("komitee_vorsitz").select("tag,user_id"),
      supabase!.from("termin_requests").select("*").order("created_at", { ascending: false }),
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
    setAktionen((a.data || []) as Aktion[]);

    const bew: Record<string, string[]> = {};
    for (const r of b.data || []) {
      const l = bew[r.termin_id] || [];
      l.push(r.user_id);
      bew[r.termin_id] = l;
    }
    setBewerbungen(bew);

    const vs: Record<string, string[]> = {};
    for (const zeile of v.data || []) (vs[zeile.tag] ||= []).push(zeile.user_id);
    setVorsitz(vs);
    setAnfragen((r.data || []) as TerminAnfrage[]);

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
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    const start = async () => {
      const { data } = await supabase!.auth.getSession();
      uidRef.current = data.session?.user.id || LOCAL_UID;
      setMeineUid(data.session?.user.id ?? null);
      if (!data.session) {
        if (alive) setReady(true);
        return;
      }
      await Promise.all([laden(), michLaden()]);
      if (channel) return;
      channel = supabase!
        .channel("sv-termine")
        .on("postgres_changes", { event: "*", schema: "public", table: "termine" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "termin_komitees" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "termin_personen" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "aktionen" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "aktion_bewerbungen" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "komitee_vorsitz" }, planeNachladen)
        .on("postgres_changes", { event: "*", schema: "public", table: "termin_requests" }, planeNachladen)
        .subscribe();
    };
    void start();

    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTermine([]);
        setAktionen([]);
        setBewerbungen({});
        setVorsitz({});
        setAnfragen([]);
        setMeineKomitees([]);
        setMeineStudentIds([]);
        if (channel) {
          supabase!.removeChannel(channel);
          channel = null;
        }
        void start();
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase!.removeChannel(channel);
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
    aktion_id: t.aktion_id ?? null,
    plaetze: t.plaetze ?? null,
    icon: t.icon ?? null,
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
        alert("Der Termin konnte nicht gelöscht werden: " + error.message);
      }
    },
    [termine, lokalSpeichern],
  );

  // ---------------------------------------------------------- Aktionen
  const aktionAnlegen = useCallback<TermineValue["aktionAnlegen"]>(
    async (a) => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { error } = await supabase!.from("aktionen").insert({ ...a, created_by: uidRef.current });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const aktionAendern = useCallback<TermineValue["aktionAendern"]>(
    async (id, patch) => {
      if (!hasSupabase) return;
      setAktionen((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
      await supabase!.from("aktionen").update(patch).eq("id", id);
    },
    [],
  );

  const aktionLoeschen = useCallback<TermineValue["aktionLoeschen"]>(
    async (id) => {
      if (!hasSupabase) return;
      // Die Schichten haengen per ON DELETE CASCADE an der Aktion.
      setAktionen((prev) => prev.filter((a) => a.id !== id));
      setTermine((prev) => prev.filter((t) => t.aktion_id !== id));
      const { error } = await supabase!.from("aktionen").delete().eq("id", id);
      if (error) {
        void laden();
        alert("Die Aktion konnte nicht gelöscht werden: " + error.message);
      }
    },
    [laden],
  );

  /** Mehrere Schichten in einem Rutsch – Wiederholungen erzeugen viele. */
  const anlegenViele = useCallback<TermineValue["anlegenViele"]>(
    async (liste) => {
      if (!liste.length) return null;
      if (!hasSupabase) {
        for (const t of liste) await anlegen(t);
        return null;
      }
      const { error } = await supabase!
        .from("termine")
        .insert(liste.map((t) => ({ ...felder(t), created_by: uidRef.current })));
      if (error) return error.message;
      await laden();
      return null;
    },
    [anlegen, laden],
  );

  // ---------------------------------------------------------- Schichten
  const bewerben = useCallback<TermineValue["bewerben"]>(
    async (terminId, an) => {
      if (!hasSupabase || !uidRef.current) return;
      const ich = uidRef.current;
      setBewerbungen((prev) => {
        const l = prev[terminId] || [];
        return { ...prev, [terminId]: an ? [...new Set([...l, ich])] : l.filter((u) => u !== ich) };
      });
      const { error } = an
        ? await supabase!.from("aktion_bewerbungen").insert({ termin_id: terminId, user_id: ich })
        : await supabase!
            .from("aktion_bewerbungen")
            .delete()
            .eq("termin_id", terminId)
            .eq("user_id", ich);
      if (error) {
        void laden();
        alert("Das hat nicht geklappt: " + error.message);
      }
    },
    [laden],
  );

  const zuteilen = useCallback<TermineValue["zuteilen"]>(
    async (terminId, studentId, an) => {
      if (!hasSupabase) return;
      setTermine((prev) =>
        prev.map((t) =>
          t.id === terminId
            ? {
                ...t,
                personen: an
                  ? [...new Set([...t.personen, studentId])]
                  : t.personen.filter((x) => x !== studentId),
              }
            : t,
        ),
      );
      const { error } = an
        ? await supabase!.from("termin_personen").insert({ termin_id: terminId, student_id: studentId })
        : await supabase!
            .from("termin_personen")
            .delete()
            .eq("termin_id", terminId)
            .eq("student_id", studentId);
      if (error) {
        void laden();
        alert("Die Zuteilung hat nicht geklappt: " + error.message);
      }
    },
    [laden],
  );

  // ---------------------------------------------------------- Vorsitz
  const vorsitzSetzen = useCallback<TermineValue["vorsitzSetzen"]>(
    async (tag, userIds) => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const zwei = [...new Set(userIds)].slice(0, 2);
      // Erst raeumen, dann setzen: sonst bliebe ein abgewaehlter Vorsitz
      // stehen und das Komitee haette auf einmal drei.
      const weg = await supabase!.from("komitee_vorsitz").delete().eq("tag", tag);
      if (weg.error) return weg.error.message;
      if (zwei.length) {
        const { error } = await supabase!
          .from("komitee_vorsitz")
          .insert(zwei.map((user_id) => ({ tag, user_id, gesetzt_von: uidRef.current })));
        if (error) {
          await laden();
          return error.message;
        }
      }
      await laden();
      return null;
    },
    [laden],
  );

  // ---------------------------------------------------------- Anfragen
  const anfrageStellen = useCallback<TermineValue["anfrageStellen"]>(
    async (a) => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { error } = await supabase!.from("termin_requests").insert({
        tag: a.tag,
        titel: a.titel.trim(),
        ort: a.ort.trim(),
        nachricht: a.nachricht.trim().slice(0, 500),
        datum: a.datum,
        bis_datum: a.bis_datum || null,
        von: a.von || null,
        bis: a.bis || null,
        created_by: uidRef.current,
      });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const anfrageEntscheiden = useCallback<TermineValue["anfrageEntscheiden"]>(
    async (id, status, antwort = "") => {
      if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
      const { error } = await supabase!
        .from("termin_requests")
        .update({
          status,
          antwort: antwort.trim().slice(0, 500),
          decided_by: uidRef.current,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden],
  );

  const anfrageLoeschen = useCallback<TermineValue["anfrageLoeschen"]>(
    async (id) => {
      if (!hasSupabase) return;
      setAnfragen((prev) => prev.filter((a) => a.id !== id));
      const { error } = await supabase!.from("termin_requests").delete().eq("id", id);
      if (error) {
        void laden();
        alert("Die Anfrage konnte nicht zurückgenommen werden: " + error.message);
      }
    },
    [laden],
  );

  const meineVorsitze = useMemo(
    () =>
      meineUid
        ? Object.entries(vorsitz)
            .filter(([, ids]) => ids.includes(meineUid))
            .map(([tag]) => tag)
        : [],
    [vorsitz, meineUid],
  );

  return (
    <Ctx.Provider
      value={{
        termine,
        aktionen,
        bewerbungen,
        ready,
        meineKomitees,
        meineStudentIds,
        anlegen,
        anlegenViele,
        aendern,
        loeschen,
        aktionAnlegen,
        aktionAendern,
        aktionLoeschen,
        bewerben,
        zuteilen,
        meineUid,
        vorsitz,
        meineVorsitze,
        anfragen,
        vorsitzSetzen,
        anfrageStellen,
        anfrageEntscheiden,
        anfrageLoeschen,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
