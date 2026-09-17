import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import type { BankKonto } from "./lib/types";

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
  /**
   * Welches Elternkonto gehoert zu welchen Kindern. Fuer das Stufenteam
   * gefuellt, damit zwei Zugaenge mit gleichem Nachnamen auseinanderzuhalten
   * sind. Eltern sehen hier nur sich selbst.
   */
  zuordnung: Record<string, string[]>;
  neuesTicket: (betreff: string, text: string) => Promise<string | null>;
  antworten: (ticketId: string, text: string) => Promise<void>;
  ticketSchliessen: (ticketId: string, erledigt: boolean) => Promise<void>;
  infoAnlegen: (titel: string, text: string, angeheftet: boolean) => Promise<void>;
  infoLoeschen: (id: string) => Promise<void>;
  kontoSpeichern: (patch: Partial<BankKonto>) => Promise<string | null>;
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
  const [bereit, setBereit] = useState(!hasSupabase);
  const [konto, setKonto] = useState<BankKonto | null>(null);
  const [infos, setInfos] = useState<ElternInfo[]>([]);
  const [tickets, setTickets] = useState<ElternTicket[]>([]);
  const [nachrichten, setNachrichten] = useState<TicketNachricht[]>([]);
  const [kinder, setKinder] = useState<string[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, string[]>>({});
  const uid = useRef<string | null>(null);

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
    const paare = (kd.data as { user_id: string; student_id: string }[]) || [];
    const karte: Record<string, string[]> = {};
    for (const r of paare) (karte[r.user_id] ||= []).push(r.student_id);
    setZuordnung(karte);
    setKinder(karte[uid.current] || []);
    setBereit(true);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    void laden();
    let kanal: ReturnType<NonNullable<typeof supabase>["channel"]> | null = supabase!
      .channel("sv-eltern")
      .on("postgres_changes", { event: "*", schema: "public", table: "eltern_infos" }, () => void laden())
      .on("postgres_changes", { event: "*", schema: "public", table: "eltern_tickets" }, () => void laden())
      .on("postgres_changes", { event: "*", schema: "public", table: "eltern_ticket_nachrichten" }, (p) => {
        const row = p.new as TicketNachricht;
        if (!row?.id) return;
        setNachrichten((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe();
    const { data: sub } = supabase!.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") void laden();
    });
    return () => {
      sub.subscription.unsubscribe();
      if (kanal) {
        supabase!.removeChannel(kanal);
        kanal = null;
      }
    };
  }, [laden]);

  const neuesTicket = useCallback<ElternCtx["neuesTicket"]>(async (betreff, text) => {
    if (!hasSupabase || !uid.current) return "Du bist nicht angemeldet.";
    const { data, error } = await supabase!
      .from("eltern_tickets")
      .insert({ user_id: uid.current, betreff: betreff.trim() })
      .select()
      .single();
    if (error || !data) return error?.message || "Die Anfrage konnte nicht angelegt werden.";
    const ticket = data as ElternTicket;
    setTickets((prev) => [ticket, ...prev]);
    const { error: e2 } = await supabase!
      .from("eltern_ticket_nachrichten")
      .insert({ ticket_id: ticket.id, user_id: uid.current, text: text.trim() });
    if (e2) return e2.message;
    void laden();
    return null;
  }, [laden]);

  const antworten = useCallback<ElternCtx["antworten"]>(async (ticketId, text) => {
    if (!hasSupabase || !uid.current || !text.trim()) return;
    const vorlaeufig: TicketNachricht = {
      id: crypto.randomUUID(),
      ticket_id: ticketId,
      user_id: uid.current,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    setNachrichten((prev) => [...prev, vorlaeufig]);
    const { error } = await supabase!
      .from("eltern_ticket_nachrichten")
      .insert({ ticket_id: ticketId, user_id: uid.current, text: text.trim() });
    if (error) {
      setNachrichten((prev) => prev.filter((x) => x.id !== vorlaeufig.id));
      alert("Die Nachricht ging nicht raus: " + error.message);
      return;
    }
    void supabase!.from("eltern_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId);
  }, []);

  const ticketSchliessen = useCallback<ElternCtx["ticketSchliessen"]>(async (ticketId, erledigt) => {
    if (!hasSupabase) return;
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, erledigt } : t)));
    await supabase!.from("eltern_tickets").update({ erledigt }).eq("id", ticketId);
  }, []);

  const infoAnlegen = useCallback<ElternCtx["infoAnlegen"]>(async (titel, text, angeheftet) => {
    if (!hasSupabase || !uid.current) return;
    const { error } = await supabase!
      .from("eltern_infos")
      .insert({ titel: titel.trim(), text: text.trim(), angeheftet, autor: uid.current });
    if (error) alert("Die Info konnte nicht gespeichert werden: " + error.message);
    else void laden();
  }, [laden]);

  const infoLoeschen = useCallback<ElternCtx["infoLoeschen"]>(async (id) => {
    if (!hasSupabase) return;
    setInfos((prev) => prev.filter((x) => x.id !== id));
    await supabase!.from("eltern_infos").delete().eq("id", id);
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
        neuesTicket,
        antworten,
        ticketSchliessen,
        infoAnlegen,
        infoLoeschen,
        kontoSpeichern,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
