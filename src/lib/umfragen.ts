import { useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { abonniere } from "./realtime";
import { useStore } from "../store";
import { demoRolle } from "./demo";

/**
 * Pop-up-Umfragen (supabase/abi-album.sql)
 *
 * Läuft eine Umfrage für einen, erscheint sie beim nächsten Öffnen der App.
 * Jede Antwort wird sofort gespeichert – wer zwischendurch schließt, macht
 * beim nächsten Mal an derselben Stelle weiter. Ergebnisse gibt es nur
 * gezählt (umfrage_ergebnis), einzelne Antworten sieht niemand.
 */
/** "ranking" gibt es nur im Pop-up: so werden die Abi-Rankings abgefragt (nicht in der Datenbank) */
export type FrageTyp = "einfach" | "mehrfach" | "text" | "person" | "skala" | "ranking";
export type Zielgruppe = "schueler" | "team" | "eltern" | "alle";

export interface Umfrage {
  id: string;
  titel: string;
  beschreibung: string;
  status: "entwurf" | "aktiv" | "beendet";
  pflicht: boolean;
  zielgruppe: Zielgruppe;
  ergebnis_sichtbar: boolean;
  /** Zusätzlich alle aktiven Abi-Rankings abfragen (Stimmen landen im Ranking) */
  mit_rankings?: boolean;
  created_at: string;
  gestartet_at: string | null;
  endet_at: string | null;
}

export interface Frage {
  id: string;
  umfrage_id: string;
  sort: number;
  typ: FrageTyp;
  titel: string;
  optionen: string[];
  pflicht: boolean;
  /**
   * Nur bei Auswahl (einfach/mehrfach): zusätzlich „Eigene Antwort“ anbieten
   * (supabase/umfrage-eigene-antwort.sql). Alte Fragen: fehlt/false.
   */
  eigene?: boolean;
}

export type Wert = string | string[] | number;

export interface Ergebnis {
  teilnehmer: number;
  zielgruppe: number;
  fragen: {
    frage_id: string;
    antworten: number;
    /** Auswahl: Stimmen je Möglichkeit – die freie Möglichkeit heißt hier „Eigene Antwort“ */
    zaehlung: Record<string, number>;
    texte: string[];
    /** Texte zu „Eigene Antwort“ (ohne Namen) – fehlt bei alter Datenbank */
    eigene?: string[];
  }[];
}

export interface UPerson {
  id: string;
  vorname: string;
  nachname: string;
}

export const TYP_NAME: Record<FrageTyp, string> = {
  einfach: "Eine Antwort",
  mehrfach: "Mehrere Antworten",
  text: "Freitext",
  person: "Person wählen",
  skala: "Skala 1–5",
  ranking: "Abi-Ranking",
};

/** Antwort „weiß nicht“ bei Rankings im Pop-up */
export const WEISS_NICHT = "__weiss_nicht__";

export const ZIEL_NAME: Record<Zielgruppe, string> = {
  schueler: "Alle Schüler",
  team: "Nur Stufenteam",
  eltern: "Nur Eltern",
  alle: "Schüler & Eltern",
};

/**
 * Freitext-Fragen gibt es in drei Formen. Gespeichert als Typ „text“, die Form
 * steht in optionen[0] – so braucht die Datenbank keinen neuen Typ.
 *   kurz  eine Zeile (max. 120 Zeichen)
 *   lang  mehrere Zeilen (max. 1000) – Standard, auch für alte Fragen
 *   zahl  nur eine Zahl
 */
export type TextArt = "kurz" | "lang" | "zahl";
export const TEXT_ART_NAME: Record<TextArt, string> = { kurz: "Kurzer Text", lang: "Langer Text", zahl: "Zahl" };
export function textArt(f: Pick<Frage, "typ" | "optionen">): TextArt {
  const a = f.typ === "text" ? f.optionen?.[0] : undefined;
  return a === "kurz" || a === "zahl" ? a : "lang";
}
/** "12,5" → 12.5; keine Zahl → null */
export function alsZahl(t: string): number | null {
  const s = (t || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- Eigene Antwort */
/**
 * „Eigene Antwort“ bei Auswahl-Fragen. In der Datenbank steht im Wert die
 * Marke "__eigene__" (bei Mehrfachwahl als Eintrag der Liste) und der Text
 * in der eigenen Spalte umfrage_antworten.eigene.
 *
 * In der App reisen Marke und Text zusammen als EIN Eintrag
 * "__eigene__:Text" – so bleibt eine Antwort ein einfacher Wert (string bzw.
 * string[]) und das Pop-up muss nichts Neues lernen. Erst beim Speichern wird
 * getrennt (zerlegen), beim Laden wieder zusammengesetzt (zusammensetzen).
 */
export const EIGENE = "__eigene__";
/** So heißt die freie Möglichkeit in Pop-up und Auswertung */
export const EIGENE_NAME = "Eigene Antwort";
export const istEigene = (w: unknown): boolean => typeof w === "string" && (w === EIGENE || w.startsWith(EIGENE + ":"));
export const eigeneText = (w: string) => (w.startsWith(EIGENE + ":") ? w.slice(EIGENE.length + 1) : "");
export const eigenerWert = (text: string) => `${EIGENE}:${text}`;
/** Darf die Frage „Eigene Antwort“ haben? */
export const mitEigener = (f: Pick<Frage, "typ" | "eigene">) => Boolean(f.eigene) && (f.typ === "einfach" || f.typ === "mehrfach");

/** App-Wert → Datenbank: { wert, eigene }. null = (noch) nichts zu speichern. */
export function zerlegen(w: Wert): { wert: Wert; eigene: string | null } | null {
  if (typeof w === "string" && istEigene(w)) {
    const t = eigeneText(w).trim();
    return t ? { wert: EIGENE, eigene: t } : null;
  }
  if (Array.isArray(w)) {
    const frei = w.find(istEigene);
    const t = frei ? eigeneText(frei).trim() : "";
    // Leere eigene Antwort zählt (noch) nicht – nur die normalen Kreuze speichern
    const liste: string[] = w.filter((x): boolean => !istEigene(x)).concat(t ? [EIGENE] : []);
    if (!liste.length && frei) return null;
    return { wert: liste, eigene: t || null };
  }
  return { wert: w, eigene: null };
}

/** Datenbank → App-Wert ("__eigene__" + Text wird "__eigene__:Text"). */
export function zusammensetzen(wert: Wert, eigene: string | null | undefined): Wert {
  if (wert === EIGENE) return eigenerWert(eigene || "");
  if (Array.isArray(wert)) return wert.map((x) => (x === EIGENE ? eigenerWert(eigene || "") : x));
  return wert;
}

/** Ist die Antwort ausgefüllt? */
export function beantwortet(f: Frage, w: Wert | undefined): boolean {
  if (w === undefined || w === null) return false;
  // „Eigene Antwort“ zählt erst mit Text
  if (Array.isArray(w)) return w.some((x): boolean => !istEigene(x) || eigeneText(x).trim().length > 0);
  if (typeof w === "string") {
    if (istEigene(w)) return eigeneText(w).trim().length > 0;
    return f.typ === "text" && textArt(f) === "zahl" ? alsZahl(w) !== null : w.trim().length > 0;
  }
  return true;
}

/* ---------------------------------------------------------------- Demo */
const DEMO = "sv-umfragen-demo";
interface DemoDaten {
  umfragen: Umfrage[];
  fragen: Frage[];
  antworten: { frage_id: string; umfrage_id: string; user_id: string; wert: Wert }[];
  fertig: { umfrage_id: string; user_id: string }[];
}
function demoLesen(): DemoDaten {
  try {
    const roh = localStorage.getItem(DEMO);
    if (roh) return JSON.parse(roh) as DemoDaten;
  } catch {
    /* privater Modus */
  }
  return demoRolle() ? demoBeispiel() : { umfragen: [], fragen: [], antworten: [], fertig: [] };
}

/**
 * Erfundene Beispiele für den Demo-Modus (?rolle=…): eine beendete Umfrage
 * mit Ergebnis (inkl. „Eigene Antwort“) und ein Entwurf. Absichtlich keine
 * laufende – die würde sonst bei jedem Öffnen als Pop-up erscheinen.
 */
function demoBeispiel(): DemoDaten {
  const tag = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
  const u1 = "demo-umfrage-fahrt";
  const u2 = "demo-umfrage-entwurf";
  const umfragen: Umfrage[] = [
    { id: u1, titel: "Abschlussfahrt", beschreibung: "Wohin geht es nach dem Abi?", status: "beendet", pflicht: false, zielgruppe: "schueler", ergebnis_sichtbar: true, created_at: tag(9), gestartet_at: tag(8), endet_at: tag(1) },
    { id: u2, titel: "Abiball-Location", beschreibung: "", status: "entwurf", pflicht: true, zielgruppe: "schueler", ergebnis_sichtbar: false, created_at: tag(0.5), gestartet_at: null, endet_at: null },
  ];
  const fragen: Frage[] = [
    { id: "demo-f-ziel", umfrage_id: u1, sort: 1, typ: "einfach", titel: "Wohin soll die Fahrt gehen?", optionen: ["Prag", "Amsterdam", "Berlin"], pflicht: true, eigene: true },
    { id: "demo-f-wichtig", umfrage_id: u1, sort: 2, typ: "mehrfach", titel: "Was ist dir wichtig?", optionen: ["Günstig", "Strand", "Kultur", "Abends weggehen"], pflicht: true, eigene: true },
    { id: "demo-f-noch", umfrage_id: u1, sort: 3, typ: "text", titel: "Sonst noch etwas?", optionen: ["kurz"], pflicht: false },
    { id: "demo-f-ort", umfrage_id: u2, sort: 1, typ: "einfach", titel: "Wo soll der Abiball stattfinden?", optionen: ["Stadthalle", "Schulaula"], pflicht: true, eigene: true },
  ];
  // Antworten von 14 erfundenen Personen – Werte in App-Form ("__eigene__:Text")
  const ziel = ["Prag", "Amsterdam", "Prag", "Berlin", eigenerWert("Barcelona"), "Amsterdam", "Prag", eigenerWert("barcelona"), "Prag", "Amsterdam", eigenerWert("Kroatien"), "Prag", eigenerWert("Barcelona!"), "Berlin"];
  const wichtig: string[][] = [
    ["Günstig", "Kultur"], ["Strand"], ["Günstig", "Abends weggehen"], ["Kultur"], ["Strand", eigenerWert("Alle zusammen im Hostel")], ["Günstig"],
    ["Abends weggehen", "Strand"], ["Günstig", eigenerWert("Kurze Anreise")], ["Kultur", "Günstig"], ["Strand"], ["Günstig"], [eigenerWert("alle zusammen im Hostel")], ["Abends weggehen"], ["Günstig", "Strand"],
  ];
  const noch = ["Bitte nicht mit dem Bus", "", "Vegetarisches Essen", "", "Nicht in der Klausurphase", "Bitte nicht mit dem Bus", "", "", "", "", "", "", "", ""];
  const antworten: DemoDaten["antworten"] = [];
  const fertig: DemoDaten["fertig"] = [];
  ziel.forEach((w, i) => {
    const user_id = `demo-p${i + 1}`;
    antworten.push({ frage_id: "demo-f-ziel", umfrage_id: u1, user_id, wert: w });
    antworten.push({ frage_id: "demo-f-wichtig", umfrage_id: u1, user_id, wert: wichtig[i] });
    if (noch[i]) antworten.push({ frage_id: "demo-f-noch", umfrage_id: u1, user_id, wert: noch[i] });
    fertig.push({ umfrage_id: u1, user_id });
  });
  return { umfragen, fragen, antworten, fertig };
}
function demoSchreiben(d: DemoDaten) {
  try {
    localStorage.setItem(DEMO, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}
const DEMO_UID = "local-user";

/* ====================================================================== */
/* Für alle: was wartet auf mich?                                         */
/* ====================================================================== */
export function useOffeneUmfragen(aktiv: boolean, fuerMich: (z: Zielgruppe) => boolean) {
  const [umfragen, setUmfragen] = useState<Umfrage[]>([]);
  const [fragen, setFragen] = useState<Frage[]>([]);
  const [antworten, setAntworten] = useState<Record<string, Wert>>({});
  const [fertig, setFertig] = useState<Set<string>>(new Set());
  const [bereit, setBereit] = useState(false);

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setUmfragen(d.umfragen.filter((u) => u.status === "aktiv"));
      setFragen(d.fragen);
      setAntworten(Object.fromEntries(d.antworten.filter((a) => a.user_id === DEMO_UID).map((a) => [a.frage_id, a.wert])));
      setFertig(new Set(d.fertig.filter((f) => f.user_id === DEMO_UID).map((f) => f.umfrage_id)));
      setBereit(true);
      return;
    }
    const sb = supabase!;
    const { data: u, error } = await sb.from("umfragen").select("*").eq("status", "aktiv");
    if (error) {
      setBereit(true);
      return;
    }
    const liste = (u as Umfrage[]) || [];
    setUmfragen(liste);
    if (!liste.length) {
      setBereit(true);
      return;
    }
    const ids = liste.map((x) => x.id);
    const [f, a, t] = await Promise.all([
      sb.from("umfrage_fragen").select("*").in("umfrage_id", ids).order("sort"),
      sb.from("umfrage_antworten").select("frage_id, wert, eigene").in("umfrage_id", ids),
      sb.from("umfrage_teilnahme").select("umfrage_id").in("umfrage_id", ids),
    ]);
    setFragen((f.data as Frage[]) || []);
    setAntworten(
      Object.fromEntries(((a.data as { frage_id: string; wert: Wert; eigene?: string | null }[]) || []).map((x) => [x.frage_id, zusammensetzen(x.wert, x.eigene)])),
    );
    setFertig(new Set(((t.data as { umfrage_id: string }[]) || []).map((x) => x.umfrage_id)));
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    void laden();
    if (!hasSupabase) return;
    // Startet das Team eine Umfrage, erscheint sie auch bei offener App
    return abonniere({
      name: "sv-umfragen",
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "umfragen" }, () => void laden()),
    });
  }, [aktiv, laden]);

  const offen = useMemo(
    () =>
      umfragen
        .filter((u) => u.status === "aktiv" && fuerMich(u.zielgruppe) && !fertig.has(u.id) && (!u.endet_at || new Date(u.endet_at) > new Date()))
        .filter((u) => u.mit_rankings || fragen.some((f) => f.umfrage_id === u.id))
        .sort((a, b) => Number(b.pflicht) - Number(a.pflicht) || (a.gestartet_at || "").localeCompare(b.gestartet_at || "")),
    [umfragen, fertig, fragen, fuerMich],
  );

  /** Eine Antwort speichern – sofort. Gibt Fehlertext zurück oder null. */
  const antworten_ = useCallback(async (f: Frage, wert: Wert): Promise<string | null> => {
    setAntworten((a) => ({ ...a, [f.id]: wert }));
    if (!hasSupabase) {
      const d = demoLesen();
      d.antworten = [...d.antworten.filter((x) => !(x.frage_id === f.id && x.user_id === DEMO_UID)), { frage_id: f.id, umfrage_id: f.umfrage_id, user_id: DEMO_UID, wert }];
      demoSchreiben(d);
      return null;
    }
    // „Eigene Antwort“ ohne Text: nur im Bildschirm merken, noch nicht speichern
    const teile = zerlegen(wert);
    if (!teile) return null;
    const { error } = await supabase!.from("umfrage_antworten").upsert(
      {
        frage_id: f.id,
        umfrage_id: f.umfrage_id,
        wert: teile.wert,
        // Spalte nur mitschicken, wo die Frage sie kennt (alte Fragen bleiben unberührt)
        ...(mitEigener(f) ? { eigene: teile.eigene } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "frage_id,user_id" },
    );
    return error ? error.message : null;
  }, []);

  const abschliessen = useCallback(async (umfrageId: string): Promise<string | null> => {
    if (!hasSupabase) {
      const d = demoLesen();
      d.fertig.push({ umfrage_id: umfrageId, user_id: DEMO_UID });
      demoSchreiben(d);
    } else {
      const { error } = await supabase!.from("umfrage_teilnahme").insert({ umfrage_id: umfrageId });
      if (error && !error.message.includes("duplicate")) return error.message;
    }
    setFertig((s) => new Set(s).add(umfrageId));
    return null;
  }, []);

  return { bereit, offen, alle: umfragen, fragen, antworten, antworten_, abschliessen, neuLaden: laden };
}

/* ====================================================================== */
/* Personen für Personen-Fragen                                           */
/* ====================================================================== */
export function useUmfragePersonen(aktiv: boolean): UPerson[] {
  const { students } = useStore();
  const [liste, setListe] = useState<UPerson[]>([]);
  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void supabase!.rpc("umfrage_personen").then(({ data }) => setListe((data as UPerson[]) || []));
  }, [aktiv]);
  return useMemo(
    () =>
      hasSupabase
        ? liste
        : [...students].sort((a, b) => a.vorname.localeCompare(b.vorname)).map((s) => ({ id: s.id, vorname: s.vorname, nachname: s.nachname })),
    [liste, students],
  );
}

/* ====================================================================== */
/* Verwaltung (Recht umfragen.verwalten / umfragen.ergebnisse)            */
/* ====================================================================== */
export function useUmfragenVerwaltung(aktiv: boolean) {
  const [umfragen, setUmfragen] = useState<Umfrage[]>([]);
  const [fragen, setFragen] = useState<Frage[]>([]);

  const laden = useCallback(async () => {
    if (!hasSupabase) {
      const d = demoLesen();
      setUmfragen([...d.umfragen].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setFragen(d.fragen);
      return;
    }
    const [u, f] = await Promise.all([
      supabase!.from("umfragen").select("*").order("created_at", { ascending: false }).limit(100),
      supabase!.from("umfrage_fragen").select("*").order("sort"),
    ]);
    if (!u.error) setUmfragen((u.data as Umfrage[]) || []);
    if (!f.error) setFragen((f.data as Frage[]) || []);
  }, []);

  useEffect(() => {
    if (aktiv) void laden();
  }, [aktiv, laden]);

  /** Umfrage samt Fragen speichern (nur Entwürfe dürfen Fragen ändern). */
  const speichern = useCallback(
    async (u: Partial<Umfrage> & { titel: string }, fr: Omit<Frage, "id" | "umfrage_id">[] | null): Promise<{ id?: string; fehler?: string }> => {
      const kopf = {
        titel: u.titel.trim().slice(0, 80),
        beschreibung: (u.beschreibung || "").slice(0, 400),
        pflicht: u.pflicht ?? true,
        zielgruppe: u.zielgruppe || "schueler",
        ergebnis_sichtbar: u.ergebnis_sichtbar ?? false,
        mit_rankings: u.mit_rankings ?? false,
      };
      if (!hasSupabase) {
        const d = demoLesen();
        const id = u.id || crypto.randomUUID();
        const alt = d.umfragen.find((x) => x.id === id);
        d.umfragen = [
          ...d.umfragen.filter((x) => x.id !== id),
          { id, status: "entwurf", created_at: new Date().toISOString(), gestartet_at: null, endet_at: null, ...alt, ...kopf },
        ];
        if (fr) {
          d.fragen = [...d.fragen.filter((x) => x.umfrage_id !== id), ...fr.map((f, i) => ({ ...f, id: crypto.randomUUID(), umfrage_id: id, sort: i + 1 }))];
          d.antworten = d.antworten.filter((a) => a.umfrage_id !== id);
        }
        demoSchreiben(d);
        await laden();
        return { id };
      }
      const sb = supabase!;
      let id = u.id;
      if (id) {
        const { error } = await sb.from("umfragen").update(kopf).eq("id", id);
        if (error) return { fehler: error.message };
      } else {
        const { data, error } = await sb.from("umfragen").insert(kopf).select("id").single();
        if (error) return { fehler: error.message };
        id = (data as { id: string }).id;
      }
      if (fr) {
        // Fragen eines Entwurfs: vorhandene ersetzen
        const { error: e1 } = await sb.from("umfrage_fragen").delete().eq("umfrage_id", id);
        if (e1) return { fehler: e1.message };
        if (fr.length) {
          const { error: e2 } = await sb
            .from("umfrage_fragen")
            .insert(
              fr.map((f, i) => ({
                umfrage_id: id, sort: i + 1, typ: f.typ, titel: f.titel.trim().slice(0, 160), optionen: f.optionen, pflicht: f.pflicht,
                eigene: mitEigener(f),
              })),
            );
          if (e2) return { fehler: e2.message };
        }
      }
      await laden();
      return { id };
    },
    [laden],
  );

  const status = useCallback(
    async (id: string, s: Umfrage["status"], endet: string | null = null): Promise<string | null> => {
      const zeit = s === "aktiv" ? { gestartet_at: new Date().toISOString(), endet_at: endet } : s === "beendet" ? { endet_at: new Date().toISOString() } : {};
      if (!hasSupabase) {
        const d = demoLesen();
        d.umfragen = d.umfragen.map((u) => (u.id === id ? { ...u, status: s, ...zeit } : u));
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("umfragen").update({ status: s, ...zeit }).eq("id", id);
      await laden();
      return error ? error.message : null;
    },
    [laden],
  );

  const loeschen = useCallback(
    async (id: string): Promise<string | null> => {
      if (!hasSupabase) {
        const d = demoLesen();
        d.umfragen = d.umfragen.filter((u) => u.id !== id);
        d.fragen = d.fragen.filter((f) => f.umfrage_id !== id);
        d.antworten = d.antworten.filter((a) => a.umfrage_id !== id);
        d.fertig = d.fertig.filter((a) => a.umfrage_id !== id);
        demoSchreiben(d);
        await laden();
        return null;
      }
      const { error } = await supabase!.from("umfragen").delete().eq("id", id);
      await laden();
      return error ? error.message : null;
    },
    [laden],
  );

  const ergebnis = useCallback(async (id: string): Promise<Ergebnis | string> => {
    if (!hasSupabase) {
      const d = demoLesen();
      const fr = d.fragen.filter((f) => f.umfrage_id === id).sort((a, b) => a.sort - b.sort);
      return {
        teilnehmer: d.fertig.filter((f) => f.umfrage_id === id).length,
        // Demo: kennt keine echte Zielgruppe – wenigstens nicht „14 von 1“
        zielgruppe: Math.max(1, d.fertig.filter((f) => f.umfrage_id === id).length + 6),
        fragen: fr.map((f) => {
          const as = d.antworten.filter((a) => a.frage_id === f.id);
          const zaehlung: Record<string, number> = {};
          const eigene: string[] = [];
          if (f.typ !== "text")
            for (const a of as)
              for (const w of Array.isArray(a.wert) ? a.wert : [a.wert]) {
                // wie umfrage_ergebnis(): Marke heißt „Eigene Antwort“, Texte extra
                if (istEigene(w)) {
                  if (!eigeneText(String(w)).trim()) continue;
                  eigene.push(eigeneText(String(w)).trim());
                }
                const k = istEigene(w) ? EIGENE_NAME : String(w);
                zaehlung[k] = (zaehlung[k] || 0) + 1;
              }
          return { frage_id: f.id, antworten: as.length, zaehlung, texte: f.typ === "text" ? as.map((a) => String(a.wert)).filter((t) => t.trim()) : [], eigene };
        }),
      };
    }
    const { data, error } = await supabase!.rpc("umfrage_ergebnis", { p_id: id });
    if (error) return error.message;
    return data as Ergebnis;
  }, []);

  return { umfragen, fragen, speichern, status, loeschen, ergebnis, neuLaden: laden };
}
