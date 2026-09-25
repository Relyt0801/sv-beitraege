import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { abonniere } from "./lib/realtime";
import type { BankKonto } from "./lib/types";
import { pushToUsers, sendePush } from "./lib/push";
import { DEMO_KONTO, demoRolle, demoUid, demoZuordnung } from "./lib/demo";
import { useStore } from "./store";

import { meldeFehler } from "./lib/melder";
export interface ElternInfo {
  id: string;
  titel: string;
  text: string;
  angeheftet: boolean;
  autor: string | null;
  created_at: string;
}

export interface ElternTicket {
  id: string;
  user_id: string;
  betreff: string;
  erledigt: boolean;
  created_at: string;
  updated_at: string;
  /** Wann die Eltern zuletzt reingeschaut haben. */
  gelesen_eltern: string | null;
  /** Wann das Stufenteam zuletzt reingeschaut hat. */
  gelesen_team: string | null;
  /** true = das Stufenteam hat das Gespräch begonnen. */
  von_team: boolean;
}

/** Ein Elternkonto, wie das Stufenteam es zum Anschreiben braucht. */
export interface Elternkonto {
  user_id: string;
  username: string;
  anzeigename: string;
  kinder: string[];
}

export interface TicketNachricht {
  id: string;
  ticket_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

interface ElternCtx {
  bereit: boolean;
  konto: BankKonto | null;
  infos: ElternInfo[];
  tickets: ElternTicket[];
  nachrichten: TicketNachricht[];
  /** Kennungen der eigenen Kinder (nur bei einem Eltern-Konto gefüllt). */
  kinder: string[];
  /** Alle Elternkonten – nur fürs Stufenteam gefüllt, zum Anschreiben. */
  konten: Elternkonto[];
  /** Wie viele Gespräche ungelesene Nachrichten haben. */
  ungelesen: number;
  /**
   * Welches Elternkonto gehoert zu welchen Kindern. Fuer das Stufenteam
   * gefuellt, damit zwei Zugaenge mit gleichem Nachnamen auseinanderzuhalten
   * sind. Eltern sehen hier nur sich selbst.
   */
  zuordnung: Record<string, string[]>;
  /**
   * Die Zuordnung liess sich nicht laden (Netz weg o. Ä.). Dann nicht
   * faelschlich "kein Kind" zeigen, sondern auf das zurueckfallen, was die
   * Datenbank ohnehin nur an Personen herausgibt.
   */
  zuordnungFehlt: boolean;
  neuesTicket: (betreff: string, text: string) => Promise<string | null>;
  /** Das Stufenteam schreibt ein bestimmtes Elternhaus an. */
  anEltern: (userId: string, betreff: string, text: string) => Promise<string | null>;
  /** Merken, dass dieses Gespräch gelesen wurde. */
  alsGelesen: (ticketId: string) => void;
  antworten: (ticketId: string, text: string) => Promise<void>;
  ticketSchliessen: (ticketId: string, erledigt: boolean) => Promise<void>;
  ticketLoeschen: (ticketId: string) => Promise<void>;
  infoAnlegen: (titel: string, text: string, angeheftet: boolean) => Promise<void>;
  infoLoeschen: (id: string) => Promise<void>;
  kontoSpeichern: (patch: Partial<BankKonto>) => Promise<string | null>;
  /**
   * Einem Elternzugang ein Kind zuordnen (an=true) oder wegnehmen. Die
   * Datenbank laesst das nur mit dem Recht "Daten bearbeiten" zu – im
   * Rollen-Reiter bietet die App es nur dem Admin an.
   */
  kindZuordnen: (userId: string, studentId: string, an: boolean) => Promise<string | null>;
}

const Ctx = createContext<ElternCtx | null>(null);
export const useEltern = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEltern ausserhalb des Providers");
  return v;
};

const LEER: BankKonto = { inhaber: "", iban: "", bic: "", bank: "", hinweis: "" };

/**
 * Alles rund um die Eltern: die angehefteten Infos, ihre Anfragen ans
 * Stufenteam und die Kontodaten der Stufenkasse.
 *
 * Die Kontodaten stehen ausschliesslich in der Datenbank – nie im Quellcode
 * und nie im Git-Verlauf. Lesen darf sie jedes angemeldete Konto, aendern nur
 * Admin und Kassenwart.
 */
export function ElternProvider({ children }: { children: ReactNode }) {
  const { students } = useStore();
  // Ohne Datenbank wird "bereit" erst gesetzt, wenn die Demo-Zuordnung steht.
  const [bereit, setBereit] = useState(false);
  const [konto, setKonto] = useState<BankKonto | null>(null);
  const [infos, setInfos] = useState<ElternInfo[]>([]);
  const [tickets, setTickets] = useState<ElternTicket[]>([]);
  const [nachrichten, setNachrichten] = useState<TicketNachricht[]>([]);
  const [kinder, setKinder] = useState<string[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, string[]>>({});
  const [konten, setKonten] = useState<Elternkonto[]>([]);
  const [zuordnungFehlt, setZuordnungFehlt] = useState(false);
  const istTeam = useRef(false);
  /** Kennungen des Stufenteams – damit Antworten der Eltern dort ankommen. */
  const teamIds = useRef<string[]>([]);
  const uid = useRef<string | null>(null);

  // Ohne Datenbank (Demo): erfundene Zuordnung, Kontodaten und eine Info.
  const demoGeladen = useRef(false);
  useEffect(() => {
    if (hasSupabase || demoGeladen.current || !students.length) return;
    demoGeladen.current = true;
    const karte = demoZuordnung(students);
    uid.current = demoUid(demoRolle()) ?? "local-user";
    setZuordnung(karte);
    setKinder(karte[uid.current] || []);
    setKonto(DEMO_KONTO);
    setInfos([
      {
        id: "demo-info",
        titel: "Kuchenverkauf am Freitag",
        text: "Wir freuen uns über jede Kuchenspende – bitte bis 7:45 Uhr im Foyer abgeben.",
        angeheftet: true,
        autor: null,
        created_at: new Date().toISOString(),
      },
    ]);
    istTeam.current = uid.current === "local-user";
    setBereit(true);
  }, [students]);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data: s } = await supabase!.auth.getSession();
    uid.current = s.session?.user.id ?? null;
    if (!uid.current) {
      setBereit(true);
      return;
    }
    const [k, i, t, n, kd] = await Promise.all([
      supabase!.from("bank_konto").select("*").eq("id", 1).maybeSingle(),
      supabase!.from("eltern_infos").select("*").order("angeheftet", { ascending: false }).order("created_at", { ascending: false }),
      supabase!.from("eltern_tickets").select("*").order("updated_at", { ascending: false }),
      supabase!.from("eltern_ticket_nachrichten").select("*").order("created_at"),
      supabase!.from("parent_children").select("user_id, student_id"),
    ]);
    setKonto((k.data as BankKonto) || LEER);
    setInfos((i.data as ElternInfo[]) || []);
    setTickets((t.data as ElternTicket[]) || []);
    setNachrichten((n.data as TicketNachricht[]) || []);
    // Die Datenbank liefert nur, was man sehen darf: Eltern ihre eigene Zeile,
    // das Stufenteam alle.
    setZuordnungFehlt(Boolean(kd.error));
    if (kd.error) console.warn("[eltern] Zuordnung nicht geladen:", kd.error.message);
    const paare = (kd.data as { user_id: string; student_id: string }[]) || [];
    const karte: Record<string, string[]> = {};
    for (const r of paare) (karte[r.user_id] ||= []).push(r.student_id);
    setZuordnung(karte);
    setKinder(karte[uid.current] || []);

    // Nur das Stufenteam sieht fremde Profile – die Datenbank laesst nichts
    // anderes zu. Daraus bauen wir die Liste zum Anschreiben.
    const { data: meins } = await supabase!
      .from("profiles").select("role").eq("user_id", uid.current).maybeSingle();
    istTeam.current = ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"]
      .includes(((meins as { role?: string } | null)?.role) || "");

    // Wer gehoert zum Stufenteam? Eltern duerfen das nicht sehen, deshalb
    // bleibt die Liste bei ihnen leer und der Server verteilt selbst.
    const { data: team } = await supabase!
      .from("profiles").select("user_id")
      .in("role", ["stufenteam", "kassenwart", "admin", "sprecher", "stv_sprecher"]);
    teamIds.current = ((team as { user_id: string }[]) || []).map((r) => r.user_id);

    if (istTeam.current) {
      const { data: alle } = await supabase!
        .from("profiles").select("user_id, username").eq("role", "eltern");
      const ids = ((alle as { user_id: string }[]) || []).map((r) => r.user_id);
      const { data: namen } = ids.length
        ? await supabase!.from("public_profiles").select("user_id, anzeigename").in("user_id", ids)
        : { data: [] as { user_id: string; anzeigename: string }[] };
      const nameVon: Record<string, string> = {};
      for (const r of (namen as { user_id: string; anzeigename: string }[]) || [])
        nameVon[r.user_id] = r.anzeigename;
      setKonten(
        ((alle as { user_id: string; username: string }[]) || [])
          .map((r) => ({
            user_id: r.user_id,
            username: r.username,
            anzeigename: nameVon[r.user_id] || r.username,
            kinder: karte[r.user_id] || [],
          }))
          .sort((a, b) => a.anzeigename.localeCompare(b.anzeigename, "de")),
      );
    }

    setBereit(true);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    void laden();
    const abmelden = abonniere({
      name: "sv-eltern",
      nachholen: () => void laden(),
      aufbauen: (kanal) =>
        kanal
          .on("postgres_changes", { event: "*", schema: "public", table: "eltern_infos" }, () => void laden())
          .on("postgres_changes", { event: "*", schema: "public", table: "eltern_tickets" }, () => void laden())
          // Kind zugeordnet oder weggenommen: Eltern sehen es sofort, ohne Neuladen.
          .on("postgres_changes", { event: "*", schema: "public", table: "parent_children" }, () => void laden())
          .on("postgres_changes", { event: "*", schema: "public", table: "eltern_ticket_nachrichten" }, (p) => {
            const row = p.new as TicketNachricht;
            if (!row?.id) return;
            setNachrichten((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
          }),
    });
    const { data: sub } = supabase!.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") void laden();
    });
    return () => {
      sub.subscription.unsubscribe();
      abmelden();
    };
  }, [laden]);

  const neuesTicket = useCallback<ElternCtx["neuesTicket"]>(async (betreff, text) => {
    if (!hasSupabase || !uid.current) return "Nicht angemeldet – bitte einmal ab- und wieder anmelden.";
    const { data, error } = await supabase!
      .from("eltern_tickets")
      .insert({ user_id: uid.current, betreff: betreff.trim() })
      .select()
      .single();
    if (error || !data) return "Die Anfrage konnte nicht gesendet werden. Bitte später noch einmal versuchen.";
    const ticket = data as ElternTicket;
    setTickets((prev) => [ticket, ...prev]);
    const { error: e2 } = await supabase!
      .from("eltern_ticket_nachrichten")
      .insert({ ticket_id: ticket.id, user_id: uid.current, text: text.trim() });
    if (e2) return "Die Nachricht konnte nicht gespeichert werden. Bitte später noch einmal versuchen.";
    void laden();
    return null;
  }, [laden]);

  const antworten = useCallback<ElternCtx["antworten"]>(async (ticketId, text) => {
    if (!hasSupabase || !uid.current || !text.trim()) return;
    // Die Kennung wird hier erzeugt und beim Speichern mitgegeben. Sonst kommt
    // dieselbe Nachricht ueber die Live-Verbindung mit einer anderen Kennung
    // zurueck und stuende zweimal im Verlauf.
    const neueId = crypto.randomUUID();
    const vorlaeufig: TicketNachricht = {
      id: neueId,
      ticket_id: ticketId,
      user_id: uid.current,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    setNachrichten((prev) => (prev.some((x) => x.id === neueId) ? prev : [...prev, vorlaeufig]));
    const { error } = await supabase!
      .from("eltern_ticket_nachrichten")
      .insert({ id: neueId, ticket_id: ticketId, user_id: uid.current, text: text.trim() });
    if (error) {
      setNachrichten((prev) => prev.filter((x) => x.id !== neueId));
      meldeFehler("Die Nachricht ging nicht raus: " + error.message);
      return;
    }
    supabase!.from("eltern_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId).then(({ error }) => { if (error) console.warn("[speichern]", error.message); }); // then() nötig, sonst wird nie gesendet

    // Die Gegenseite benachrichtigen.
    const t = tickets.find((x) => x.id === ticketId);
    if (t) {
      const anTeam = t.user_id === uid.current;
      const ziel = anTeam ? teamIds.current : [t.user_id];
      // Titel = Betreff des Gesprächs, damit man in der Mitteilung sofort sieht,
      // worum es geht.
      void pushToUsers(
        ziel.filter((z) => z !== uid.current),
        anTeam ? `Eltern: ${t.betreff}` : t.betreff,
        anTeam ? text.trim().slice(0, 110) : `Antwort vom Stufenteam: ${text.trim().slice(0, 90)}`,
        anTeam ? "./#chats" : "./#infos",
      );
    }
  }, [tickets]);

  /** Das Stufenteam schreibt ein bestimmtes Elternhaus an. */
  const anEltern = useCallback<ElternCtx["anEltern"]>(async (userId, betreff, text) => {
    if (!hasSupabase || !uid.current) return "Du bist nicht angemeldet.";
    if (!betreff.trim() || !text.trim()) return "Betreff und Text dürfen nicht leer sein.";
    const { data, error } = await supabase!
      .from("eltern_tickets")
      .insert({ user_id: userId, betreff: betreff.trim(), von_team: true })
      .select()
      .single();
    if (error || !data) return error?.message || "Die Nachricht konnte nicht angelegt werden.";
    const ticket = data as ElternTicket;
    const { error: e2 } = await supabase!
      .from("eltern_ticket_nachrichten")
      .insert({ ticket_id: ticket.id, user_id: uid.current, text: text.trim() });
    if (e2) return e2.message;
    void pushToUsers([userId], betreff.trim(), `Das Stufenteam schreibt: ${text.trim().slice(0, 90)}`, "./#infos");
    void laden();
    return null;
  }, [laden]);

  /** Gespraech als gelesen markieren – je nachdem, wer gerade schaut. */
  const alsGelesen = useCallback<ElternCtx["alsGelesen"]>((ticketId) => {
    if (!hasSupabase || !uid.current) return;
    const jetzt = new Date().toISOString();
    const feld = istTeam.current ? "gelesen_team" : "gelesen_eltern";
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, [feld]: jetzt } : t)));
    supabase!.from("eltern_tickets").update({ [feld]: jetzt }).eq("id", ticketId).then(({ error }) => { if (error) console.warn("[speichern]", error.message); }); // then() nötig, sonst wird nie gesendet
  }, []);

  const ticketSchliessen = useCallback<ElternCtx["ticketSchliessen"]>(async (ticketId, erledigt) => {
    if (!hasSupabase) return;
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, erledigt } : t)));
    await supabase!.from("eltern_tickets").update({ erledigt }).eq("id", ticketId);
  }, []);

  /**
   * Ein Gespraech ganz entfernen. Die Nachrichten haengen per ON DELETE CASCADE
   * am Ticket, die gehen von selbst mit. Laeuft das Loeschen ins Leere, sagt die
   * App es – sonst steht der Eintrag nach dem naechsten Laden wieder da.
   */
  const ticketLoeschen = useCallback<ElternCtx["ticketLoeschen"]>(async (ticketId) => {
    if (!hasSupabase) return;
    const vorher = tickets;
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
    setNachrichten((prev) => prev.filter((n) => n.ticket_id !== ticketId));
    const { error } = await supabase!.from("eltern_tickets").delete().eq("id", ticketId);
    if (error) {
      setTickets(vorher);
      void laden();
      meldeFehler("Das Gespräch konnte nicht gelöscht werden: " + error.message);
    }
  }, [tickets, laden]);

  const infoAnlegen = useCallback<ElternCtx["infoAnlegen"]>(async (titel, text, angeheftet) => {
    if (!hasSupabase || !uid.current) return;
    const { data, error } = await supabase!
      .from("eltern_infos")
      .insert({ titel: titel.trim(), text: text.trim(), angeheftet, autor: uid.current })
      .select("id")
      .single();
    if (error) {
      meldeFehler("Die Info konnte nicht gespeichert werden: " + error.message);
      return;
    }
    void laden();
    // Alle Elternzugänge mit zugeordnetem Kind bekommen eine Mitteilung.
    // Die Empfänger rechnet der Server aus – im Browser sieht das Team die
    // Elternkonten nicht zuverlässig vollständig.
    if (data?.id) void sendePush({ eltern_info_id: data.id });
  }, [laden]);

  const infoLoeschen = useCallback<ElternCtx["infoLoeschen"]>(async (id) => {
    if (!hasSupabase) return;
    setInfos((prev) => prev.filter((x) => x.id !== id));
    await supabase!.from("eltern_infos").delete().eq("id", id);
  }, []);

  const kindZuordnen = useCallback<ElternCtx["kindZuordnen"]>(async (userId, studentId, an) => {
    // Sofort anzeigen, bei einem Fehler zuruecknehmen.
    const setzen = (dazu: boolean) => {
      setZuordnung((prev) => {
        const alt = prev[userId] || [];
        const neu = dazu ? (alt.includes(studentId) ? alt : [...alt, studentId]) : alt.filter((x) => x !== studentId);
        return { ...prev, [userId]: neu };
      });
      setKonten((prev) =>
        prev.map((k) =>
          k.user_id !== userId
            ? k
            : { ...k, kinder: dazu ? [...new Set([...k.kinder, studentId])] : k.kinder.filter((x) => x !== studentId) },
        ),
      );
      if (userId === uid.current)
        setKinder((prev) => (dazu ? [...new Set([...prev, studentId])] : prev.filter((x) => x !== studentId)));
    };
    setzen(an);
    if (!hasSupabase) return null;
    const { error } = an
      ? await supabase!.from("parent_children").upsert({ user_id: userId, student_id: studentId })
      : await supabase!.from("parent_children").delete().eq("user_id", userId).eq("student_id", studentId);
    if (!error) return null;
    setzen(!an);
    return /row-level security/i.test(error.message)
      ? "Dafür fehlen dir die Rechte. Kinder zuordnen darf nur der Admin."
      : error.message;
  }, []);

  const kontoSpeichern = useCallback<ElternCtx["kontoSpeichern"]>(async (patch) => {
    if (!hasSupabase) return "Ohne Datenbank geht das nicht.";
    const next = { ...(konto || LEER), ...patch };
    setKonto(next);
    const { error } = await supabase!
      .from("bank_konto")
      .upsert({ id: 1, ...next, updated_at: new Date().toISOString() });
    if (!error) return null;
    return /row-level security/i.test(error.message)
      ? "Dafür fehlen dir die Rechte. Die Kontodaten dürfen nur Admin und Kassenwart ändern."
      : error.message;
  }, [konto]);

  /**
   * Wie viele Gespraeche haben etwas Neues?
   * Neu heisst: die letzte Nachricht kommt nicht von mir und ist juenger als
   * der Zeitpunkt, an dem ich zuletzt reingeschaut habe.
   */
  const ungelesen = tickets.filter((t) => {
    const meine = nachrichten.filter((n) => n.ticket_id === t.id);
    const fremd = meine.filter((n) => n.user_id !== uid.current);
    if (!fremd.length) return false;
    const letzte = fremd[fremd.length - 1].created_at;
    const gesehen = istTeam.current ? t.gelesen_team : t.gelesen_eltern;
    return !gesehen || letzte > gesehen;
  }).length;

  return (
    <Ctx.Provider
      value={{
        bereit,
        konto,
        infos,
        tickets,
        nachrichten,
        kinder,
        zuordnung,
        zuordnungFehlt,
        konten,
        ungelesen,
        neuesTicket,
        anEltern,
        alsGelesen,
        antworten,
        ticketSchliessen,
        ticketLoeschen,
        infoAnlegen,
        infoLoeschen,
        kontoSpeichern,
        kindZuordnen,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
