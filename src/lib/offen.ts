import { useEffect, useMemo, useState } from "react";
import { useEvents } from "../events-store";
import { useSchichtStatus, useTermine } from "../termine-store";
import { useRole } from "../auth/RoleProvider";
import { useFunktionen } from "./funktionen";
import { hasSupabase, supabase } from "./supabase";
import { useZitate } from "./zitate";
import { abHeute, heuteKey, plusTage, schichtEnde, type Termin } from "./termine";
import type { EventItem } from "./events";
import type { Sprungziel } from "./sprung";
import { useOffeneAbschluesse } from "../components/SchichtAbschluss";

/**
 * „Was wartet auf mich?“ – für die Gruppe ganz oben in der Übersicht
 * (components/ZuErledigen.tsx).
 *
 * Anlass (Prüfung Okt. 2026): Eine offene Abstimmung stand erst im Reiter
 * Events nach 1200 px, die eigene Schicht und „Wichtig“-Infos kamen in der
 * Übersicht gar nicht vor. Beim Team lagen die Prüfaufgaben auf vier Reiter
 * verteilt (Schichten bestätigen in Events, Anfragen in Chats, Kosten in
 * Finanzen, Zitate in einer Kapsel der Zitat-Karte). Hier wird alles
 * gezählt; die Übersicht zeigt nur, was wirklich offen ist.
 */

// ------------------------------------------------------------------ Sprünge

/**
 * In einen anderen Reiter springen. App.tsx hört auf hashchange: „#events“
 * öffnet Events, „#anfrage-…“ den Reiter der Anfrage (lib/sprung.ts), wo die
 * Anfrage-Komponente selbst hinscrollt; „#zitate“ öffnet das Prüfen-Blatt
 * der Zitat-Karte.
 */
export function springe(ziel: "events" | "zitate" | Sprungziel) {
  const hash = ziel === "events" || ziel === "zitate" ? ziel : `anfrage-${ziel}`;
  // Steht dieselbe Marke noch da (noch nicht abgeholt), feuert kein
  // hashchange – also erst wegräumen.
  if (window.location.hash === `#${hash}`) history.replaceState(null, "", window.location.pathname + window.location.search);
  window.location.hash = hash;
}

// ------------------------------------------------------------------ für mich

/** Abstimmungen älter als das gelten nicht mehr als „offen für dich“. */
const ABSTIMMUNG_TAGE = 30;
/** Die eigene nächste Schicht nur, wenn sie bald ist. */
const SCHICHT_TAGE = 14;

export interface FuerMichOffen {
  /** Abstimmungen ohne eigene Stimme, neueste zuerst */
  abstimmungen: EventItem[];
  /** „Wichtig“-Infos, die man noch nicht gesehen hat */
  wichtig: EventItem[];
  /** Die nächste Schicht, in die man eingeteilt ist (in den nächsten 14 Tagen) */
  schicht: Termin | null;
}

export function useFuerMichOffen(): FuerMichOffen {
  const { events, myVotes, reads } = useEvents();
  const { termine } = useTermine();
  const st = useSchichtStatus();
  const { studentId } = useRole();

  const { abstimmungen, wichtig } = useMemo(() => {
    const grenze = Date.now() - ABSTIMMUNG_TAGE * 86400000;
    const neu = (e: EventItem) => Date.parse(e.created_at) >= grenze;
    const nachNeu = (a: EventItem, b: EventItem) => b.created_at.localeCompare(a.created_at);
    // Gezielt an andere Personen (das Team sieht auch diese): nicht „für dich“
    const fuerMich = (e: EventItem) =>
      e.audience !== "selected" || !e.target_ids.length || (studentId != null && e.target_ids.includes(studentId));
    return {
      abstimmungen: events
        .filter((e) => e.type === "umfrage" && fuerMich(e) && !(myVotes[e.id] || []).length && neu(e))
        .sort(nachNeu),
      wichtig: events.filter((e) => e.is_warning && fuerMich(e) && !reads.has(e.id)).sort(nachNeu),
    };
  }, [events, myVotes, reads, studentId]);

  const schicht = useMemo(() => {
    const bis = plusTage(heuteKey(), SCHICHT_TAGE);
    const jetzt = Date.now();
    return (
      abHeute(termine).find(
        (t) => st(t) === "eingeteilt" && !t.abschluss && schichtEnde(t).getTime() >= jetzt && t.datum <= bis,
      ) ?? null
    );
  }, [termine, st]);

  return { abstimmungen, wichtig, schicht };
}

// ------------------------------------------------------------------ Team

export type TeamArt =
  | "schichten"
  | "termin"
  | "kosten"
  | "nachtrag"
  | "komitee"
  | "entsperren"
  | "meldung"
  | "foto"
  | "zitate";

export type TeamAufgaben = Record<TeamArt, number>;

const LEER: TeamAufgaben = {
  schichten: 0,
  termin: 0,
  kosten: 0,
  nachtrag: 0,
  komitee: 0,
  entsperren: 0,
  meldung: 0,
  foto: 0,
  zitate: 0,
};

type ServerArt = Exclude<TeamArt, "schichten" | "termin">;

/**
 * Offene Prüfaufgaben des Teams – nur, was man auch bearbeiten darf (gleiche
 * Rechte wie in den Anfrage-Komponenten). Was schon im Speicher liegt
 * (Schichten, Terminanfragen), kostet nichts. Der Rest wird mit Datenbank nur
 * GEZÄHLT (head-Abfragen, keine Live-Verbindung): beim Öffnen, wenn die App
 * wieder in den Vordergrund kommt und alle zwei Minuten.
 */
export function useTeamAufgaben(): TeamAufgaben {
  const { isStaff, isAdmin, isEltern, can, uid } = useRole();
  const { sichtbar } = useFunktionen();
  const { anfragen } = useTermine();
  const abschluesse = useOffeneAbschluesse();

  const darfZitate = !isEltern && sichtbar("zitate") && can("zitate.pruefen");
  const rechte: Record<ServerArt, boolean> = {
    kosten: can("finanzen.manage"),
    nachtrag: isStaff || can("hilfen.edit"),
    komitee: can("komitees.assign"),
    entsperren: can("mod.timeout"),
    meldung: can("meldungen.bearbeiten"),
    foto: isStaff,
    zitate: darfZitate,
  };
  const server = useServerZahlen(rechte, isAdmin, uid);

  // Demo (ohne Datenbank): Zitate liegen im Browser – dort billig zu zählen
  const demoZitate = useZitate(!hasSupabase && darfZitate, uid);
  const demoWarten = demoZitate.zitate.filter((z) => z.status === "offen").length;
  // Ohne Live-Verbindung: nach dem Prüfen in der Zitat-Karte (eigener Speicher)
  // die Zahl kurz danach wieder einlesen – nur ein localStorage-Lesen.
  const demoLaden = demoZitate.laden;
  useEffect(() => {
    if (hasSupabase || !darfZitate) return;
    const t = setInterval(() => void demoLaden(), 4000);
    return () => clearInterval(t);
  }, [darfZitate, demoLaden]);

  const darfTermine = isStaff || can("termine.manage");
  return {
    ...LEER,
    ...server,
    schichten: abschluesse.length,
    termin: darfTermine ? anfragen.filter((a) => a.status === "offen").length : 0,
    zitate: hasSupabase ? server.zitate ?? 0 : darfZitate ? demoWarten : 0,
  };
}

function useServerZahlen(rechte: Record<ServerArt, boolean>, isAdmin: boolean, uid: string | null): Partial<Record<ServerArt, number>> {
  const [zahlen, setZahlen] = useState<Partial<Record<ServerArt, number>>>({});
  // Nur bei echten Änderungen der Rechte neu laden, nicht bei jedem Zeichnen
  const schluessel = `${JSON.stringify(rechte)}|${isAdmin}|${uid ?? ""}`;

  useEffect(() => {
    if (!hasSupabase) return;
    const r = JSON.parse(schluessel.split("|")[0]) as Record<ServerArt, boolean>;
    if (!Object.values(r).some(Boolean)) return;
    const sb = supabase!;
    let vorbei = false;
    const zahl = (x: { count: number | null; error: unknown }) => (x.error ? 0 : x.count ?? 0);

    // Offene Einträge einer Tabelle zählen (nur die Zahl, keine Zeilen)
    const zaehle = async (art: ServerArt, tabelle: string): Promise<[ServerArt, number]> => {
      const x = await sb.from(tabelle).select("id", { count: "exact", head: true }).eq("status", "offen");
      return [art, zahl(x)];
    };

    const laden = async () => {
      const auftraege: Promise<[ServerArt, number]>[] = [];
      if (r.kosten) auftraege.push(zaehle("kosten", "kosten_anfragen"));
      if (r.komitee) auftraege.push(zaehle("komitee", "komitee_requests"));
      if (r.entsperren) auftraege.push(zaehle("entsperren", "unban_requests"));
      if (r.foto) auftraege.push(zaehle("foto", "album_fotos"));
      if (r.zitate) auftraege.push(zaehle("zitate", "zitate"));
      if (r.meldung)
        // Wie in den Anfragen: mehrere Meldungen zum selben Inhalt sind EINE Karte
        auftraege.push(
          (async (): Promise<[ServerArt, number]> => {
            const x = await sb.from("meldungen").select("art, ziel_id").eq("status", "offen").limit(200);
            const zeilen = (x.data as { art: string; ziel_id: string }[] | null) || [];
            return ["meldung", x.error ? 0 : new Set(zeilen.map((m) => `${m.art}:${m.ziel_id}`)).size];
          })(),
        );
      if (r.nachtrag)
        // Hat der Admin Bearbeiter festgelegt, zählen die Anträge nur für sie
        // (wie NachtragAnfragen.tsx)
        auftraege.push(
          (async (): Promise<[ServerArt, number]> => {
            const b = await sb.from("nachtrag_bearbeiter").select("user_id");
            const liste = b.error ? [] : ((b.data as { user_id: string }[]) || []).map((x) => x.user_id);
            if (liste.length && !isAdmin && !(uid && liste.includes(uid))) return ["nachtrag", 0];
            const n = await sb.from("mithilfe_nachtraege").select("id", { count: "exact", head: true }).eq("status", "offen");
            return ["nachtrag", zahl(n)];
          })(),
        );
      try {
        const ergebnis = await Promise.all(auftraege);
        if (!vorbei) setZahlen(Object.fromEntries(ergebnis));
      } catch {
        /* offline – beim nächsten Mal */
      }
    };

    void laden();
    const sichtbarGeworden = () => {
      if (document.visibilityState === "visible") void laden();
    };
    document.addEventListener("visibilitychange", sichtbarGeworden);
    const takt = setInterval(() => void laden(), 120000);
    return () => {
      vorbei = true;
      document.removeEventListener("visibilitychange", sichtbarGeworden);
      clearInterval(takt);
    };
  }, [schluessel, isAdmin, uid]);

  return zahlen;
}
