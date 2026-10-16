import { useCallback, useEffect, useMemo, useState } from "react";
import { hasSupabase, supabase } from "./supabase";
import { nochFehlend, zustimmen } from "./zustimmung";
import { abonniere } from "./realtime";
import { pushToUsers } from "./push";
import { committeeLabel } from "./committees";
import { euro } from "./finanzen";
import { demoRolle, demoUid } from "./demo";

/**
 * Kostenanfragen: Komitee-Vorsitzende fragen eine Ausgabe an, Kassenwart oder
 * Admin genehmigen (dann steht sie sofort als Ausgabe im Kassenbuch) oder
 * lehnen ab. Der Aufsichtsrat sieht alles, kann aber nichts ändern.
 *
 * Entscheiden läuft über die Datenbank-Funktion `kostenanfrage_entscheiden`,
 * damit Buchung und Status immer zusammen passieren.
 */

export interface KostenAnfrage {
  id: string;
  tag: string;
  titel: string;
  nachricht: string;
  cent: number;
  benoetigt_am: string | null;
  status: "offen" | "genehmigt" | "abgelehnt";
  antwort: string;
  buchung_id: string | null;
  created_by: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface NeueKostenAnfrage {
  tag: string;
  titel: string;
  nachricht: string;
  cent: number;
  benoetigt_am: string | null;
}

export interface KostenValue {
  anfragen: KostenAnfrage[];
  aufsichtsrat: boolean;
  bereit: boolean;
  stellen: (a: NeueKostenAnfrage) => Promise<string | null>;
  zurueckziehen: (id: string) => Promise<string | null>;
  entscheiden: (a: KostenAnfrage, genehmigt: boolean, antwort: string, datum: string) => Promise<string | null>;
}

/** Datum in n Tagen als „JJJJ-MM-TT“ (Ortszeit) – nur für die Demo-Beispiele. */
function tagIn(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ohne Datenbank (Demo/lokal) leben Anfragen nur im Browser. Die Demo-Rolle
 * „vorsitz“ startet mit einer offenen und einer genehmigten Anfrage – sonst
 * stand dort immer nur „Keine Anfragen“, und den Stand der eigenen Anfragen
 * konnte man in der Demo gar nicht ansehen (Prüfung Okt. 2026).
 */
function demoAnfragen(): KostenAnfrage[] {
  if (hasSupabase || demoRolle() !== "vorsitz") return [];
  const basis = { tag: "abizeitung", antwort: "", buchung_id: null, created_by: demoUid("vorsitz") ?? "local-user", decided_by: null, decided_at: null };
  return [
    { ...basis, id: "demo-kosten-1", titel: "Probedruck Abizeitung", nachricht: "Zwei Probeexemplare zum Korrekturlesen.", cent: 4500, benoetigt_am: tagIn(10), status: "offen", created_at: `${tagIn(-1)}T16:00:00.000Z` },
    { ...basis, id: "demo-kosten-2", titel: "Speicherkarte für Fotos", nachricht: "", cent: 1999, benoetigt_am: null, status: "genehmigt", antwort: "Passt – Beleg bitte abgeben.", decided_by: "demo-kasse", decided_at: `${tagIn(-3)}T12:00:00.000Z`, created_at: `${tagIn(-5)}T12:00:00.000Z` },
  ];
}

export function useKostenAnfragen(aktiv: boolean): KostenValue {
  const [anfragen, setAnfragen] = useState<KostenAnfrage[]>(demoAnfragen);
  const [aufsichtsrat, setAufsichtsrat] = useState(false);
  const [bereit, setBereit] = useState(!hasSupabase);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [a, r] = await Promise.all([
      supabase!.from("kosten_anfragen").select("*").order("created_at", { ascending: false }).limit(200),
      supabase!.rpc("ist_aufsichtsrat"),
    ]);
    setAnfragen((a.data as KostenAnfrage[]) || []);
    setAufsichtsrat(r.data === true);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!aktiv || !hasSupabase) return;
    void laden();
    return abonniere({
      name: "sv-kostenanfragen",
      nachholen: () => void laden(),
      aufbauen: (kanal) =>
        kanal
          .on("postgres_changes", { event: "*", schema: "public", table: "kosten_anfragen" }, () => void laden())
          .on("postgres_changes", { event: "*", schema: "public", table: "tag_members" }, () => void laden()),
    });
  }, [aktiv, laden]);

  const stellen = useCallback<KostenValue["stellen"]>(
    async (a) => {
      if (!hasSupabase) {
        // Demo/lokal: nur im Browser, ohne Benachrichtigung
        const neu: KostenAnfrage = {
          id: `lokal-${Date.now()}`,
          tag: a.tag,
          titel: a.titel.trim(),
          nachricht: a.nachricht.trim(),
          cent: a.cent,
          benoetigt_am: a.benoetigt_am || null,
          status: "offen",
          antwort: "",
          buchung_id: null,
          created_by: demoUid(demoRolle()) ?? "local-user",
          created_at: new Date().toISOString(),
          decided_by: null,
          decided_at: null,
        };
        setAnfragen((p) => [neu, ...p]);
        return null;
      }
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return "Bitte neu anmelden.";
      const { error } = await supabase!.from("kosten_anfragen").insert({
        tag: a.tag,
        titel: a.titel.trim(),
        nachricht: a.nachricht.trim(),
        cent: a.cent,
        benoetigt_am: a.benoetigt_am || null,
        created_by: uid,
      });
      if (error) return error.message;
      await laden();
      // Kassenwart und Admin Bescheid geben
      const { data: ids } = await supabase!.rpc("finanz_verwalter_ids");
      const an = (Array.isArray(ids) ? (ids as string[]) : []).filter((x) => x !== uid);
      void pushToUsers(
        an,
        `Kostenanfrage: ${a.titel.trim()}`,
        `${committeeLabel(a.tag)} fragt ${euro(a.cent)} an. Tippen zum Entscheiden.`,
        "./#anfrage-kosten",
        { art: "anfrage" },
      );
      return null;
    },
    [laden],
  );

  const zurueckziehen = useCallback<KostenValue["zurueckziehen"]>(
    async (id) => {
      setAnfragen((p) => p.filter((x) => x.id !== id));
      if (!hasSupabase) return null;
      const { error } = await supabase!.from("kosten_anfragen").delete().eq("id", id);
      if (error) {
        void laden();
        return error.message;
      }
      return null;
    },
    [laden],
  );

  const entscheiden = useCallback<KostenValue["entscheiden"]>(
    async (a, genehmigt, antwort, datum) => {
      if (!hasSupabase) {
        // Demo/lokal: nur den Status setzen (keine Buchung im Kassenbuch)
        const status: KostenAnfrage["status"] = genehmigt ? "genehmigt" : "abgelehnt";
        setAnfragen((p) => p.map((x) => (x.id === a.id ? { ...x, status, antwort: antwort.trim(), decided_at: new Date().toISOString() } : x)));
        return null;
      }
      // Genehmigen braucht ggf. mehrere Zustimmungen (Profil → Freigaben)
      if (genehmigt) {
        const z = await zustimmen("kosten", a.id);
        if ("error" in z) return z.error;
        if (!z.fertig) return nochFehlend(z);
      }
      const { error } = await supabase!.rpc("kostenanfrage_entscheiden", {
        p_id: a.id,
        p_genehmigt: genehmigt,
        p_antwort: antwort.trim(),
        p_datum: datum,
      });
      if (error) return error.message;
      await laden();
      void pushToUsers(
        [a.created_by],
        `Kostenanfrage ${genehmigt ? "genehmigt ✓" : "abgelehnt"}: ${a.titel}`,
        genehmigt
          ? `${euro(a.cent)} für ${committeeLabel(a.tag)} sind freigegeben.${antwort.trim() ? " " + antwort.trim() : ""}`
          : antwort.trim() || "Der Kassenwart hat die Anfrage abgelehnt.",
        "./#finanzen",
      );
      return null;
    },
    [laden],
  );

  return useMemo(
    () => ({ anfragen, aufsichtsrat, bereit, stellen, zurueckziehen, entscheiden }),
    [anfragen, aufsichtsrat, bereit, stellen, zurueckziehen, entscheiden],
  );
}
