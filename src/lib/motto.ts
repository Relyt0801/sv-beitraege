import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { useStimmenZahlen } from "./ergebnisse";
import type { Teil } from "./teile";

/**
 * Abimotto (supabase/komitees-motto.sql)
 *
 *   vorschlagen   wer motto.nutzen hat – sofort sichtbar
 *   👍            beliebig vielen Mottos, umschaltbar. Zahlen sieht nur, wer
 *                 das Motto verwaltet – alle anderen lesen nur ihre eigenen
 *                 Stimmen (Policy „motto stimmen lesen“).
 *   (🔥 gibt es nicht mehr; die Datenbank nimmt nur noch 'like' an)
 *   verwalten     motto.verwalten (Standard: Komitee Motto & Pullis):
 *                 ändern, ausblenden, als Motto festlegen
 *
 * Reihenfolge: 🔥 zählen doppelt, dann 👍. Ohne Datenbank liegt alles im Browser.
 *
 * Zwei Phasen (app_settings.motto_abstimmung, setzt motto.verwalten):
 *   Vorschläge   alle reichen ein, abstimmen geht noch nicht
 *   Abstimmung   👍/🔥 offen, neue Vorschläge nur noch vom Komitee
 * Die Datenbank prüft beides (Policies auf motto_vorschlaege/motto_stimmen).
 *
 * Offiziell / Inoffiziell (supabase/offiziell-inoffiziell.sql, Update 1.4):
 * Jeder Vorschlag liegt in genau einem Teil (Spalte bereich). Eingereicht
 * wird in den Teil, der gerade offen ist; verschieben geht nur mit
 * Zustimmungen (lib/teile.ts → useVerschiebungen). Bestand = inoffiziell.
 * Das offizielle Motto kürt man über die Gewinner-Tabelle (gewinner_kueren
 * setzt dann gewaehlt + gewaehlt_at); daran hängt die Enthüllung für alle.
 */
export type MottoArt = "like" | "feuer";

/**
 * Alle Motto-Stimmen seitenweise: Wer das Motto verwaltet, darf alle lesen –
 * die Datenbank liefert aber höchstens 1000 Zeilen je Abfrage. Ohne Seiten
 * fehlten ab der 1001. Stimme still Zeilen – dann auch eigene Stimmen (nicht
 * zurücknehmbar) und die Zahlen, bis stimmen_zahlen() geantwortet hat.
 * Sortiert nach dem Primärschlüssel, damit sich die Seiten nicht überlappen.
 */
async function alleStimmen(): Promise<{ data: unknown[] | null; error: unknown }> {
  const SEITE = 1000;
  const alle: unknown[] = [];
  for (let von = 0; von < 20 * SEITE; von += SEITE) {
    const r = await supabase!
      .from("motto_stimmen")
      .select("vorschlag_id, user_id, art")
      .eq("an", true)
      .order("vorschlag_id")
      .order("user_id")
      .order("art")
      .range(von, von + SEITE - 1);
    if (r.error) return { data: null, error: r.error };
    alle.push(...(r.data || []));
    if ((r.data || []).length < SEITE) break;
  }
  return { data: alle, error: null };
}

export interface Motto {
  id: string;
  text: string;
  erklaerung: string;
  /** Nur im Demo-Modus – die Datenbank gibt Einreicher nicht mehr heraus */
  von?: string;
  von_name?: string;
  created_at: string;
  ausgeblendet: boolean;
  gewaehlt: boolean;
  /** Teil: offiziell (kommt ins Abibuch) oder inoffiziell (nur die Stufe) */
  bereich: Teil;
  /** Seit wann das Motto feststeht (nur beim gekürten offiziellen Motto) */
  gewaehlt_at?: string | null;
  /** Gelöscht (Komitee/Admin, motto_loeschen) – wird nicht mehr angezeigt */
  geloescht_at?: string | null;
}

interface Stimme {
  vorschlag_id: string;
  user_id: string;
  art: MottoArt;
}

// v2: seit Update 1.4 mit Teil (bereich) – alte Demo-Daten ohne Teil bleiben liegen
const DEMO = "sv-motto-demo-v2";
const DEMO_PHASE = "sv-motto-abstimmung-demo";
interface DemoDaten {
  mottos: Motto[];
  stimmen: Stimme[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) {
      const d = JSON.parse(roh) as DemoDaten;
      // Sicherheitshalber: Einträge ohne Teil gelten als inoffiziell (wie in der Datenbank)
      d.mottos = d.mottos.map((x) => ({ ...x, bereich: x.bereich === "offiziell" ? "offiziell" : "inoffiziell" }));
      return d;
    }
  } catch {
    /* privater Modus */
  }
  // Erfundene Beispiele – beide Teile, damit der Umschalter etwas zeigt
  const jetzt = Date.now();
  const m = (i: number, text: string, erklaerung: string, bereich: Teil): Motto => ({
    id: `demo-m${i}`,
    text,
    erklaerung,
    von: "demo",
    von_name: "Demo",
    created_at: new Date(jetzt - i * 36e5 * 30).toISOString(),
    ausgeblendet: false,
    gewaehlt: false,
    bereich,
    gewaehlt_at: null,
  });
  // Likes von erfundenen Personen a–h
  const likes = (id: string, wer: string) => wer.split("").map((u) => ({ vorschlag_id: id, user_id: u, art: "like" as MottoArt }));
  return {
    mottos: [
      m(1, "ABIgeschlossen", "Wortspiel mit abgeschlossen", "offiziell"),
      m(2, "Abiversum – 12 Jahre, ein Ziel", "", "offiziell"),
      m(3, "Mit Abstand die Besten", "", "offiziell"),
      m(4, "Abikalypse – wir haben überlebt", "", "offiziell"),
      m(5, "Abi Wan Kenobi – möge der Schnitt mit uns sein", "", "inoffiziell"),
      m(6, "Abipedia – wir wissen alles, nur nicht wann", "", "inoffiziell"),
      m(7, "Notenlos glücklich", "", "inoffiziell"),
    ],
    stimmen: [
      ...likes("demo-m1", "abcdef"),
      ...likes("demo-m2", "abc"),
      ...likes("demo-m3", "de"),
      ...likes("demo-m4", "abcdefg"),
      ...likes("demo-m5", "abcd"),
      ...likes("demo-m6", "ef"),
      ...likes("demo-m7", "g"),
    ],
  };
}
function demoSchreiben(d: DemoDaten) {
  try {
    localStorage.setItem(DEMO, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}

export function useMotto(aktiv: boolean, uid: string | null) {
  const [mottos, setMottos] = useState<Motto[]>([]);
  const [stimmen, setStimmen] = useState<Stimme[]>([]);
  const [bereit, setBereit] = useState(false);
  const [abstimmung, setAbstimmung] = useState(false);
  const [meineIds, setMeineIds] = useState<Set<string>>(new Set());
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = uid || "local-user";
  // Gezählt wird in der Datenbank (stimmen_zahlen) – nur, wer darf, bekommt Zahlen
  const stimmenRef = useRef<Stimme[]>([]);
  stimmenRef.current = stimmen;
  const z = useStimmenZahlen(
    "motto",
    aktiv,
    () => {
      const n: Record<string, number> = {};
      for (const s of stimmenRef.current) if (s.art === "like") n[s.vorschlag_id] = (n[s.vorschlag_id] || 0) + 1;
      return n;
    },
    true,
  );
  const zBald = z.bald;

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setMottos(d.mottos);
      setStimmen(d.stimmen);
      setMeineIds(new Set(d.mottos.filter((x) => x.von === me).map((x) => x.id)));
      try {
        setAbstimmung(localStorage.getItem(DEMO_PHASE) === "1");
      } catch {
        /* privater Modus */
      }
      setBereit(true);
      return;
    }
    // Einreicher stehen nicht in der Liste (Spalten sind gesperrt) – welche
    // Vorschläge meine sind, sagt meine_eintraege().
    const [m, s, a, mi] = await Promise.all([
      supabase!.from("motto_vorschlaege").select("id, text, erklaerung, created_at, ausgeblendet, gewaehlt, bereich, gewaehlt_at, geloescht_at").order("created_at", { ascending: false }).limit(500),
      alleStimmen(),
      supabase!.from("app_settings").select("motto_abstimmung").eq("id", 1).maybeSingle(),
      supabase!.rpc("meine_eintraege"),
    ]);
    if (!mi.error) setMeineIds(new Set(((mi.data as { motto?: string[] } | null)?.motto) || []));
    if (!a.error) setAbstimmung(Boolean((a.data as { motto_abstimmung?: boolean } | null)?.motto_abstimmung));
    // Gelöschte sind geleert und bleiben nur fürs Protokoll stehen
    if (!m.error) setMottos(((m.data as Motto[]) || []).filter((x) => !x.geloescht_at));
    if (!s.error) setStimmen((s.data as Stimme[]) || []);
    setBereit(true);
    zBald();
  }, [me, zBald]);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    const bald = () => {
      if (zeit.current) clearTimeout(zeit.current);
      zeit.current = setTimeout(() => void laden(), 350);
    };
    return abonniere({
      name: "sv-motto",
      nachholen: laden,
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "motto_vorschlaege" }, bald)
          .on("postgres_changes", { event: "*", schema: "public", table: "motto_stimmen" }, bald)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (p) => {
            const v = (p.new as { motto_abstimmung?: boolean }).motto_abstimmung;
            if (typeof v === "boolean") setAbstimmung(v);
          }),
    });
  }, [aktiv, laden]);

  const vorschlagen = useCallback(
    async (text: string, erklaerung: string, bereich: Teil): Promise<string | null> => {
      const t = text.trim().slice(0, 80);
      const e = erklaerung.trim().slice(0, 200);
      if (t.length < 2) return "Das Motto ist zu kurz";
      // Doppelt nur innerhalb desselben Teils – offiziell und inoffiziell dürfen gleich heißen
      if (mottos.some((x) => x.bereich === bereich && x.text.toLowerCase() === t.toLowerCase())) return "Dieses Motto gibt es schon";
      if (!hasSupabase) {
        const d = demoLesen();
        d.mottos.unshift({ id: crypto.randomUUID(), text: t, erklaerung: e, von: me, von_name: "Ich", created_at: new Date().toISOString(), ausgeblendet: false, gewaehlt: false, bereich, gewaehlt_at: null });
        demoSchreiben(d);
        await laden();
        return null;
      }
      // Der Teil wird beim Einreichen gesetzt (später ändern geht nur über Verschieben)
      const { error } = await supabase!.from("motto_vorschlaege").insert({ text: t, erklaerung: e, bereich });
      if (error) return error.message;
      await laden();
      return null;
    },
    [laden, me, mottos],
  );

  /**
   * Verwalten: Text ändern, aus-/einblenden. gewaehlt setzt die App nur noch
   * im Demo-Modus selbst – mit Datenbank macht das gewinner_kueren().
   */
  const aendern = useCallback(
    async (id: string, patch: Partial<Pick<Motto, "text" | "erklaerung" | "ausgeblendet" | "gewaehlt">>): Promise<string | null> => {
      setMottos((l) =>
        l.map((x) => (x.id === id ? { ...x, ...patch } : patch.gewaehlt ? { ...x, gewaehlt: false } : x)),
      );
      if (!hasSupabase) {
        const d = demoLesen();
        d.mottos = d.mottos.map((x) => (x.id === id ? { ...x, ...patch } : patch.gewaehlt ? { ...x, gewaehlt: false } : x));
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!.from("motto_vorschlaege").update(patch).eq("id", id);
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  /**
   * Löschen (Komitee/Admin): leert den Vorschlag und blendet ihn für immer
   * aus – der Text steht nur noch im Protokoll. Keine Benachrichtigung.
   * Nicht für Kandidaten einer laufenden Runde oder gekürte Gewinner.
   */
  const loeschen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        const d = demoLesen();
        d.mottos = d.mottos.filter((x) => x.id !== id);
        d.stimmen = d.stimmen.filter((x) => x.vorschlag_id !== id);
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.rpc("motto_loeschen", { p_id: id });
      if (error) return error.message;
      setMottos((l) => l.filter((x) => x.id !== id));
      return null;
    },
    [laden],
  );

  /** 👍 oder 🔥 an/aus – sofort sichtbar, dann gespeichert */
  const stimmen_ = stimmen;
  const abstimmen = useCallback(
    async (id: string, art: MottoArt): Promise<string | null> => {
      const an = !stimmen_.some((s) => s.vorschlag_id === id && s.user_id === me && s.art === art);
      const neu = (l: Stimme[]) => {
        let x = l.filter((s) => !(s.vorschlag_id === id && s.user_id === me && s.art === art));
        // 🔥 nur einmal: das alte geht weg
        if (an && art === "feuer") x = x.filter((s) => !(s.user_id === me && s.art === "feuer"));
        return an ? [...x, { vorschlag_id: id, user_id: me, art }] : x;
      };
      setStimmen(neu);
      if (!hasSupabase) {
        const d = demoLesen();
        d.stimmen = neu(d.stimmen);
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!
        .from("motto_stimmen")
        .upsert({ vorschlag_id: id, user_id: me, art, an }, { onConflict: "vorschlag_id,user_id,art" });
      if (error) {
        await laden();
        return error.message;
      }
      zBald();
      return null;
    },
    [stimmen_, me, laden, zBald],
  );

  /** Abstimmung freigeben / zurück zu Vorschlägen (motto.verwalten) */
  const abstimmungSetzen = useCallback(async (an: boolean): Promise<string | null> => {
    setAbstimmung(an);
    if (!hasSupabase) {
      try {
        localStorage.setItem(DEMO_PHASE, an ? "1" : "0");
      } catch {
        /* privater Modus */
      }
      return null;
    }
    const { error } = await supabase!.rpc("motto_abstimmung_setzen", { p_an: an });
    if (error) {
      setAbstimmung(!an);
      return error.message;
    }
    return null;
  }, []);

  const zahl = useCallback(
    (id: string, art: MottoArt) =>
      hasSupabase && z.sichtbar && art === "like" ? z.zahlen[id] ?? 0 : stimmen.filter((s) => s.vorschlag_id === id && s.art === art).length,
    [stimmen, z.sichtbar, z.zahlen],
  );
  const meine = useCallback((id: string, art: MottoArt) => stimmen.some((s) => s.vorschlag_id === id && s.user_id === me && s.art === art), [stimmen, me]);
  const punkte = useCallback((id: string) => 2 * zahl(id, "feuer") + zahl(id, "like"), [zahl]);
  const meinFavorit = mottos.find((m) => meine(m.id, "feuer")) || null;
  /** Wie viele Personen mindestens ein 👍 gegeben haben (nur fürs Komitee sichtbar) */
  const waehlende = hasSupabase ? z.personen : new Set(stimmen.filter((s) => s.art === "like").map((s) => s.user_id)).size;
  /** Darf ich die Zahlen sehen? (Komitee immer, alle nur, wenn freigegeben) */
  const zahlenSichtbar = hasSupabase ? z.sichtbar : true;

  const istMeins = useCallback((id: string) => meineIds.has(id), [meineIds]);

  /**
   * Nur Demo-Modus: Teil direkt wechseln (mit Datenbank geht das nur über
   * verschieben_beantragen mit Zustimmungen – siehe useVerschiebungen).
   */
  const demoVerschieben = useCallback(
    (id: string, nach: Teil) => {
      if (hasSupabase) return;
      const d = demoLesen();
      d.mottos = d.mottos.map((x) => (x.id === id ? { ...x, bereich: nach } : x));
      demoSchreiben(d);
      void laden();
    },
    [laden],
  );

  return { bereit, mottos, me, istMeins, laden, demoVerschieben, zahlenSichtbar, neuZaehlen: z.laden, abstimmung, abstimmungSetzen, vorschlagen, aendern, loeschen, abstimmen, zahl, meine, punkte, meinFavorit, waehlende };
}

export type MottoWahl = ReturnType<typeof useMotto>;
