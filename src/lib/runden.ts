import { useCallback, useEffect, useRef, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";

/**
 * Abstimmungsrunden (supabase/runden-und-freigaben.sql)
 *
 * Für Abimotto, Zitate, Rankings und Umfragen: Wer die Runden leitet
 * (<bereich>.runden, z. B. Komitee Motto & Pullis), wählt aus den bisherigen
 * Ergebnissen eine engere Auswahl und legt fest, wie viele Stimmen jede
 * Person hat. Eine neue Runde beendet die vorige derselben Gruppe.
 *
 *   gruppe   ''            ganzer Bereich (Motto, Zitate)
 *            Kategorie-ID  Rankings (je Kategorie eine Stichwahl)
 *            Frage-ID      Umfragen (Stichwahl zu einer Frage)
 *
 * Abstimmen läuft über runde_stimme() – die Datenbank zählt die Stimmen und
 * lehnt zu viele ab. Zahlen sieht nur, wer die Runden leitet, oder alle,
 * wenn das Ergebnis freigegeben ist.
 */
export type RundenBereich = "motto" | "zitate" | "rankings" | "umfragen";

export interface Runde {
  id: string;
  bereich: RundenBereich;
  gruppe: string;
  gruppe_titel: string;
  nr: number;
  titel: string;
  stimmen: number;
  offen: boolean;
  ergebnis_sichtbar: boolean;
  created_at: string;
  beendet_at: string | null;
}
export interface Kandidat {
  runde_id: string;
  ziel_id: string;
  label: string;
  unter: string;
  sort: number;
}
export interface KandidatEingabe {
  id: string;
  label: string;
  unter?: string;
}

const DEMO = "sv-runden-demo";
interface DemoDaten {
  runden: Runde[];
  kandidaten: Kandidat[];
  stimmen: { runde_id: string; ziel_id: string; user_id: string }[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  return { runden: [], kandidaten: [], stimmen: [] };
}
function demoSchreiben(d: DemoDaten) {
  try {
    localStorage.setItem(DEMO, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}

export function useRunden(bereich: RundenBereich, aktiv: boolean, uid: string | null, leitet: boolean) {
  const [runden, setRunden] = useState<Runde[]>([]);
  const [kandidaten, setKandidaten] = useState<Kandidat[]>([]);
  const [meine, setMeine] = useState<Set<string>>(new Set()); // `${runde}|${ziel}`
  const [zahlen, setZahlen] = useState<Record<string, Record<string, number>>>({}); // runde -> ziel -> n
  const [personen, setPersonen] = useState<Record<string, number>>({});
  const zeit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = uid || "local-user";

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      const rs = d.runden.filter((r) => r.bereich === bereich);
      setRunden(rs);
      setKandidaten(d.kandidaten.filter((k) => rs.some((r) => r.id === k.runde_id)));
      setMeine(new Set(d.stimmen.filter((s) => s.user_id === me).map((s) => `${s.runde_id}|${s.ziel_id}`)));
      const z: Record<string, Record<string, number>> = {};
      const p: Record<string, number> = {};
      for (const r of rs) {
        z[r.id] = {};
        const st = d.stimmen.filter((s) => s.runde_id === r.id);
        for (const s of st) z[r.id][s.ziel_id] = (z[r.id][s.ziel_id] || 0) + 1;
        p[r.id] = new Set(st.map((s) => s.user_id)).size;
      }
      setZahlen(z);
      setPersonen(p);
      return;
    }
    // Offene Runden und die zuletzt beendeten (für „Ergebnis“)
    const { data: rs } = await supabase!
      .from("abstimm_runden")
      .select("*")
      .eq("bereich", bereich)
      .order("created_at", { ascending: false })
      .limit(30);
    const liste = (rs as Runde[]) || [];
    setRunden(liste);
    const ids = liste.map((r) => r.id);
    if (!ids.length) {
      setKandidaten([]);
      setMeine(new Set());
      setZahlen({});
      return;
    }
    const [{ data: ks }, { data: st }] = await Promise.all([
      supabase!.from("runden_kandidaten").select("*").in("runde_id", ids).order("sort"),
      supabase!.from("runden_stimmen").select("runde_id, ziel_id, user_id").in("runde_id", ids).eq("an", true),
    ]);
    setKandidaten((ks as Kandidat[]) || []);
    const alle = (st as { runde_id: string; ziel_id: string; user_id: string }[]) || [];
    setMeine(new Set(alle.filter((s) => s.user_id === me).map((s) => `${s.runde_id}|${s.ziel_id}`)));
    // Zahlen: wer leitet, sieht alle Stimmen direkt; sonst nur freigegebene Ergebnisse
    const z: Record<string, Record<string, number>> = {};
    const p: Record<string, number> = {};
    if (leitet) {
      for (const r of liste) {
        z[r.id] = {};
        const s2 = alle.filter((s) => s.runde_id === r.id);
        for (const s of s2) z[r.id][s.ziel_id] = (z[r.id][s.ziel_id] || 0) + 1;
        p[r.id] = new Set(s2.map((s) => s.user_id)).size;
      }
    } else {
      for (const r of liste.filter((x) => x.ergebnis_sichtbar)) {
        const { data } = await supabase!.rpc("runde_zahlen", { p_runde: r.id });
        z[r.id] = {};
        for (const row of (data as { ziel_id: string; n: number; personen: number }[]) || []) {
          z[r.id][row.ziel_id] = row.n;
          p[r.id] = row.personen;
        }
      }
    }
    setZahlen(z);
    setPersonen(p);
  }, [bereich, me, leitet]);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    const bald = () => {
      if (zeit.current) clearTimeout(zeit.current);
      zeit.current = setTimeout(() => void laden(), 400);
    };
    return abonniere({
      name: `sv-runden-${bereich}`,
      nachholen: laden,
      aufbauen: (k) =>
        k
          .on("postgres_changes", { event: "*", schema: "public", table: "abstimm_runden" }, bald)
          .on("postgres_changes", { event: "*", schema: "public", table: "runden_stimmen" }, bald),
    });
  }, [aktiv, laden, bereich]);

  const starten = useCallback(
    async (p: { gruppe?: string; gruppeTitel?: string; titel: string; stimmen: number; kandidaten: KandidatEingabe[] }): Promise<string | null> => {
      if (p.kandidaten.length < 2) return "Bitte mindestens zwei Möglichkeiten auswählen";
      if (!hasSupabase) {
        const d = demoLesen();
        const gruppe = p.gruppe || "";
        d.runden = d.runden.map((r) => (r.bereich === bereich && r.gruppe === gruppe && r.offen ? { ...r, offen: false, beendet_at: new Date().toISOString() } : r));
        const nr = Math.max(1, ...d.runden.filter((r) => r.bereich === bereich && r.gruppe === gruppe).map((r) => r.nr)) + 1;
        const id = crypto.randomUUID();
        d.runden.unshift({ id, bereich, gruppe, gruppe_titel: p.gruppeTitel || "", nr, titel: p.titel || `Runde ${nr}`, stimmen: p.stimmen, offen: true, ergebnis_sichtbar: false, created_at: new Date().toISOString(), beendet_at: null });
        p.kandidaten.forEach((k, i) => d.kandidaten.push({ runde_id: id, ziel_id: k.id, label: k.label, unter: k.unter || "", sort: i }));
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.rpc("runde_starten", {
        p_bereich: bereich,
        p_gruppe: p.gruppe || "",
        p_gruppe_titel: p.gruppeTitel || "",
        p_titel: p.titel,
        p_stimmen: p.stimmen,
        p_kandidaten: p.kandidaten.map((k) => ({ id: k.id, label: k.label.slice(0, 300), unter: (k.unter || "").slice(0, 200) })),
      });
      if (error) return error.message;
      await laden();
      return null;
    },
    [bereich, laden],
  );

  const aendern = useCallback(
    async (id: string, patch: { stimmen?: number; offen?: boolean; ergebnis?: boolean }): Promise<string | null> => {
      setRunden((rs) =>
        rs.map((r) =>
          r.id === id
            ? { ...r, stimmen: patch.stimmen ?? r.stimmen, offen: patch.offen === false ? false : r.offen, ergebnis_sichtbar: patch.ergebnis ?? r.ergebnis_sichtbar }
            : r,
        ),
      );
      if (!hasSupabase) {
        const d = demoLesen();
        d.runden = d.runden.map((r) =>
          r.id === id ? { ...r, stimmen: patch.stimmen ?? r.stimmen, offen: patch.offen === false ? false : r.offen, ergebnis_sichtbar: patch.ergebnis ?? r.ergebnis_sichtbar } : r,
        );
        demoSchreiben(d);
        return null;
      }
      const { error } = await supabase!.rpc("runde_aendern", {
        p_runde: id,
        p_stimmen: patch.stimmen ?? null,
        p_offen: patch.offen ?? null,
        p_ergebnis: patch.ergebnis ?? null,
      });
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  const stimme = useCallback(
    async (runde: Runde, ziel: string): Promise<string | null> => {
      const key = `${runde.id}|${ziel}`;
      const an = !meine.has(key);
      const vergeben = [...meine].filter((k) => k.startsWith(runde.id + "|")).length;
      if (an && vergeben >= runde.stimmen)
        return runde.stimmen === 1
          ? "Du hast deine Stimme schon vergeben – tippe sie erst an, um sie zurückzunehmen."
          : `Du hast schon alle ${runde.stimmen} Stimmen vergeben – nimm erst eine zurück.`;
      setMeine((m) => {
        const n = new Set(m);
        if (an) n.add(key);
        else n.delete(key);
        return n;
      });
      if (!hasSupabase) {
        const d = demoLesen();
        d.stimmen = d.stimmen.filter((s) => !(s.runde_id === runde.id && s.ziel_id === ziel && s.user_id === me));
        if (an) d.stimmen.push({ runde_id: runde.id, ziel_id: ziel, user_id: me });
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.rpc("runde_stimme", { p_runde: runde.id, p_ziel: ziel, p_an: an });
      if (error) {
        await laden();
        return error.message;
      }
      return null;
    },
    [meine, me, laden],
  );

  const offene = runden.filter((r) => r.offen);
  const offeneVon = (gruppe: string) => offene.find((r) => r.gruppe === gruppe) || null;
  const letzteBeendete = (gruppe: string) => runden.find((r) => !r.offen && r.gruppe === gruppe) || null;
  const kandidatenVon = (rundeId: string) => kandidaten.filter((k) => k.runde_id === rundeId).sort((a, b) => a.sort - b.sort);
  const meineIn = (rundeId: string) => [...meine].filter((k) => k.startsWith(rundeId + "|")).map((k) => k.split("|")[1]);
  const hatGewaehlt = (rundeId: string, ziel: string) => meine.has(`${rundeId}|${ziel}`);
  const zahl = (rundeId: string, ziel: string) => zahlen[rundeId]?.[ziel];
  const teilnehmer = (rundeId: string) => personen[rundeId] ?? 0;

  return { runden, offene, offeneVon, letzteBeendete, kandidatenVon, meineIn, hatGewaehlt, zahl, teilnehmer, starten, aendern, stimme, laden };
}

export type RundenStand = ReturnType<typeof useRunden>;
