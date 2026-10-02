import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { abonniere } from "./lib/realtime";
import { useRole } from "./auth/RoleProvider";
import { useTermine } from "./termine-store";
import { useStore } from "./store";
import { demoRolle } from "./lib/demo";
import { pushAnTeam } from "./lib/push";
import { heuteKey, plusTage, schichtEnde, tagLang, type Aktion, type Termin } from "./lib/termine";
import { DATENSCHUTZ_VERSION, fehltSql, type Anwesenheit, type Vorschlag } from "./lib/ki";

/** Eine beendete Schicht mit ihrer Aktion. */
export interface Schicht {
  termin: Termin;
  aktion: Aktion;
}

interface KiValue {
  /** update-abi28.sql ist eingespielt (sonst bleibt alles Neue unsichtbar). */
  verfuegbar: boolean;
  /** Testphase: darf diese Person den Vertrauens-Check überhaupt bekommen? */
  freigeschaltet: boolean;
  /** null = noch nicht gefragt (oder ältere Version), sonst die Antwort. */
  einwilligung: boolean | null;
  einwilligen: (ja: boolean) => Promise<string | null>;
  /** Angaben „war da / nicht da“ – Schüler sehen ihre eigenen, das Team alle. */
  anwesenheit: Anwesenheit[];
  /** „Warst du da?“ – beendete Schichten, in denen ich eingeteilt war und noch nichts gesagt habe. */
  meineAbfragen: Schicht[];
  /** Beendete Schichten der letzten 30 Tage (für die Übersicht des Teams). */
  beendet: Schicht[];
  /** Offene „war da“-Angaben, die das Team prüfen soll. */
  offeneAngaben: Anwesenheit[];
  melden: (s: Schicht, da: boolean) => Promise<{ status?: string; fehler?: string }>;
  pruefen: (id: string, stimmt: boolean) => Promise<string | null>;
  vorschlaege: Vorschlag[];
  vorschlagErledigen: (id: string, status: "erledigt" | "verworfen") => Promise<void>;
  /** Nach einer eigenen Nachricht ans Stufenteam: Assistent fragen (nur mit Freischaltung + Einwilligung). */
  assistentAnstossen: (itemId: string) => void;
}

const Ctx = createContext<KiValue | null>(null);
export const useKi = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKi ausserhalb des Providers");
  return v;
};
/** Wie useKi, aber null statt Fehler (für Bauteile, die auch die Elternansicht nutzt). */
export const useKiOptional = () => useContext(Ctx);

const LS_EINW = "sv:ki-einwilligung";
const ZEITRAUM_TAGE = 30;
const ABFRAGE_TAGE = 14;

export function KiProvider({ children }: { children: ReactNode }) {
  const { can, isOp, isStaff, isEltern, uid, studentId, ready: roleReady } = useRole();
  const { termine, aktionen } = useTermine();
  const { students } = useStore();
  const demo = !hasSupabase;
  const team = isStaff || can("hilfen.edit");

  // Demo-Modus: mit ?ki=1 bekommt auch ein Schüler die Testphase.
  const demoKi = useMemo(() => {
    if (!demo) return false;
    try {
      return new URLSearchParams(window.location.search).get("ki") === "1";
    } catch {
      return false;
    }
  }, [demo]);
  const freigeschaltet = !isEltern && (can("ki.test") || isOp || demoKi);

  const [verfuegbar, setVerfuegbar] = useState(demo);
  const [einwilligung, setEinwilligung] = useState<boolean | null>(() => {
    if (!demo) return null;
    try {
      const x = localStorage.getItem(LS_EINW);
      return x === null ? null : x === "1";
    } catch {
      return null;
    }
  });
  const [anwesenheit, setAnwesenheit] = useState<Anwesenheit[]>([]);
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------- Demo-Schichten
  // Ohne Datenbank gibt es keine Aktionen und Schichten. Damit Abfrage und
  // Übersicht trotzdem klickbar sind: zwei erfundene Waffelschichten.
  const demoLage = useMemo(() => {
    if (!demo || students.length < 6) return null;
    const ich = studentId ?? students[0].id;
    const aktion: Aktion = {
      id: "demo-aktion-waffel", titel: "Waffelverkauf", icon: "🧇", beschreibung: "", prozent: 5,
      geschlossen: false, created_at: new Date().toISOString(),
    };
    const schicht = (id: string, vor: number, von: string, bis: string, personen: string[]): Termin => ({
      id, titel: "Waffelverkauf", beschreibung: "", ort: "Pausenhalle", datum: plusTage(heuteKey(), -vor), bis_datum: null,
      von, bis, sichtbar: "alle", fuer_eltern: false, created_by: null, created_at: new Date().toISOString(), tags: [],
      personen, aktion_id: aktion.id, plaetze: 4, icon: "🧇", abschluss: null,
    });
    const t1 = schicht("demo-schicht-1", 1, "09:30", "10:15", [ich, students[1].id, students[2].id]);
    const t2 = schicht("demo-schicht-2", 3, "11:20", "12:05", [students[3].id, students[4].id]);
    const angaben: Anwesenheit[] = [
      { id: "demo-a1", termin_id: t1.id, student_id: students[1].id, user_id: null, angabe: "da", status: "auto", quelle: "abfrage", eingeteilt: true, created_at: new Date().toISOString() },
      { id: "demo-a2", termin_id: t1.id, student_id: students[2].id, user_id: null, angabe: "nicht_da", status: "erledigt", quelle: "abfrage", eingeteilt: true, created_at: new Date().toISOString() },
      { id: "demo-a3", termin_id: t1.id, student_id: students[5].id, user_id: null, angabe: "da", status: "offen", quelle: "chat", eingeteilt: false, created_at: new Date().toISOString() },
      { id: "demo-a4", termin_id: t2.id, student_id: students[3].id, user_id: null, angabe: "da", status: "offen", quelle: "abfrage", eingeteilt: true, created_at: new Date().toISOString() },
    ];
    return { aktion, termine: [t1, t2], angaben };
  }, [demo, students, studentId, isStaff]);

  useEffect(() => {
    if (demoLage) setAnwesenheit(isStaff ? demoLage.angaben : []);
  }, [demoLage, isStaff]);

  // ---------------------------------------------------------------- Laden
  const laden = useCallback(async () => {
    if (!hasSupabase || !uid) return;
    const [a, e, v] = await Promise.all([
      supabase!.from("anwesenheit").select("*").gte("created_at", new Date(Date.now() - 60 * 864e5).toISOString()),
      supabase!.from("ki_einwilligung").select("ja, version").eq("user_id", uid).maybeSingle(),
      team ? supabase!.from("assistent_vorschlaege").select("*").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
    ]);
    if (a.error && fehltSql(a.error.message)) {
      setVerfuegbar(false);
      return;
    }
    setVerfuegbar(true);
    setAnwesenheit((a.data || []) as Anwesenheit[]);
    const ein = e.data as { ja: boolean; version: string } | null;
    // Neue Version der Erklärung: noch einmal fragen.
    setEinwilligung(ein && ein.version >= DATENSCHUTZ_VERSION ? ein.ja : null);
    if (!v.error) setVorschlaege((v.data || []) as Vorschlag[]);
  }, [uid, team]);

  useEffect(() => {
    if (!hasSupabase || !roleReady || !uid || isEltern) return;
    void laden();
    const spaeter = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void laden(), 400);
    };
    return abonniere({
      name: "sv-ki",
      nachholen: () => void laden(),
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "anwesenheit" }, spaeter)
          .on("postgres_changes", { event: "*", schema: "public", table: "assistent_vorschlaege" }, spaeter),
    });
  }, [roleReady, uid, isEltern, laden]);

  // ---------------------------------------------------------------- Schichten
  const lage = useMemo(() => {
    const ts = demoLage ? [...termine, ...demoLage.termine] : termine;
    const as = demoLage ? [...aktionen, demoLage.aktion] : aktionen;
    return { termine: ts, aktionVon: new Map(as.map((x) => [x.id, x])) };
  }, [termine, aktionen, demoLage]);

  const beendet = useMemo<Schicht[]>(() => {
    const jetzt = Date.now();
    const grenze = jetzt - ZEITRAUM_TAGE * 864e5;
    const liste: Schicht[] = [];
    for (const t of lage.termine) {
      const a = t.aktion_id ? lage.aktionVon.get(t.aktion_id) : null;
      if (!a || !(a.prozent > 0) || t.privat) continue;
      const ende = schichtEnde(t).getTime();
      if (ende > jetzt || ende < grenze) continue;
      liste.push({ termin: t, aktion: a });
    }
    return liste.sort((x, y) => schichtEnde(y.termin).getTime() - schichtEnde(x.termin).getTime());
  }, [lage]);

  const meineAbfragen = useMemo<Schicht[]>(() => {
    const sid = studentId ?? (demoLage && !isStaff ? students[0]?.id : null);
    if (!sid || !verfuegbar || isEltern) return [];
    const grenze = Date.now() - ABFRAGE_TAGE * 864e5;
    return beendet.filter(
      ({ termin: t }) =>
        t.personen.includes(sid) &&
        !t.abschluss &&
        schichtEnde(t).getTime() > grenze &&
        !anwesenheit.some((w) => w.termin_id === t.id && w.student_id === sid),
    );
  }, [beendet, anwesenheit, studentId, verfuegbar, isEltern, demoLage, isStaff, students]);

  const offeneAngaben = useMemo(() => anwesenheit.filter((w) => w.status === "offen" && w.angabe === "da"), [anwesenheit]);

  // ---------------------------------------------------------------- Aktionen
  const einwilligen = useCallback<KiValue["einwilligen"]>(async (ja) => {
    if (!hasSupabase) {
      try {
        localStorage.setItem(LS_EINW, ja ? "1" : "0");
      } catch {
        /* privates Fenster – dann eben nur für jetzt */
      }
      setEinwilligung(ja);
      return null;
    }
    const { error } = await supabase!.rpc("ki_einwilligung_setzen", { p_ja: ja, p_version: DATENSCHUTZ_VERSION });
    if (error) return error.message;
    setEinwilligung(ja);
    return null;
  }, []);

  const melden = useCallback<KiValue["melden"]>(
    async ({ termin: t, aktion: a }, da) => {
      const sid = studentId ?? students[0]?.id ?? "";
      const eingeteilt = t.personen.includes(sid);
      if (!hasSupabase) {
        const status = !da ? "nicht_da" : freigeschaltet && einwilligung && eingeteilt ? "auto" : "offen";
        setAnwesenheit((p) => [
          ...p.filter((w) => !(w.termin_id === t.id && w.student_id === sid)),
          {
            id: `demo-${Date.now()}`, termin_id: t.id, student_id: sid, user_id: uid, angabe: da ? "da" : "nicht_da",
            status: status === "nicht_da" ? "erledigt" : (status as Anwesenheit["status"]), quelle: "abfrage", eingeteilt,
            created_at: new Date().toISOString(),
          },
        ]);
        return { status };
      }
      const { data, error } = await supabase!.rpc("anwesenheit_melden", { tid: t.id, da });
      if (error) return { fehler: error.message };
      const status = String(data);
      // Das Team einmal fragen – aber nur, wenn es nicht ohnehin beim
      // Abschließen der Schicht draufschaut (nicht eingeteilt / schon abgeschlossen).
      if (status === "offen" && (!eingeteilt || t.abschluss)) {
        void pushAnTeam("🙋 Mithilfe bestätigen?", `Jemand sagt: war bei ${a.titel} am ${tagLang(t.datum)}. Bitte kurz prüfen.`, "./#start");
      }
      void laden();
      return { status };
    },
    [studentId, students, freigeschaltet, einwilligung, uid, laden],
  );

  const pruefen = useCallback<KiValue["pruefen"]>(
    async (id, stimmt) => {
      if (!hasSupabase) {
        setAnwesenheit((p) => p.map((w) => (w.id === id ? { ...w, status: stimmt ? "bestaetigt" : "falsch" } : w)));
        return null;
      }
      const { error } = await supabase!.rpc("anwesenheit_pruefen", { aid: id, stimmt });
      if (error) return error.message;
      void laden();
      return null;
    },
    [laden],
  );

  const vorschlagErledigen = useCallback<KiValue["vorschlagErledigen"]>(
    async (id, status) => {
      setVorschlaege((p) => p.map((v) => (v.id === id ? { ...v, status } : v)));
      if (hasSupabase) await supabase!.rpc("vorschlag_erledigen", { vid: id, p_status: status });
    },
    [],
  );

  const assistentAnstossen = useCallback<KiValue["assistentAnstossen"]>(
    (itemId) => {
      if (!hasSupabase || !freigeschaltet || !einwilligung || !verfuegbar) return;
      // Nicht abwarten – die Antwort kommt über den Chat zurück.
      void supabase!.functions.invoke("assistent", { body: { item_id: itemId } }).catch(() => {});
    },
    [freigeschaltet, einwilligung, verfuegbar],
  );

  const value: KiValue = {
    verfuegbar,
    freigeschaltet,
    einwilligung,
    einwilligen,
    anwesenheit,
    meineAbfragen,
    beendet,
    offeneAngaben,
    melden,
    pruefen,
    vorschlaege,
    vorschlagErledigen,
    assistentAnstossen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Ist die Demo aktiv (für Hinweise „erfundene Daten“)? */
export const istDemo = () => !hasSupabase && demoRolle() !== null;
