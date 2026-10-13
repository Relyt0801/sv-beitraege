import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { abonniere } from "../lib/realtime";
import { useRole } from "../auth/RoleProvider";
import { meldeFehler } from "../lib/melder";
import { alsZahl } from "../lib/umfragen";
import { Avatar, PersonName } from "./Avatar";
import type { TopicItem } from "../topics-store";

/**
 * Freie Antworten – für Abstimmungen im Chat (topic_antworten,
 * supabase/freitext-abstimmungen.sql) und die Auswertung von Umfragen.
 *
 *   kurz  eine Zeile, höchstens 120 Zeichen
 *   lang  mehrere Zeilen
 *   zahl  nur eine Zahl – dazu Ø, Median, kleinste und größte
 *
 * Jede Person hat eine Antwort und kann sie ändern oder zurückziehen.
 * Anonym: Antworten ohne Namen (Namen nur für Admins, wie bei Stimmen).
 */
export type AntwortArt = "kurz" | "lang" | "zahl";
export const ANTWORT_ART_NAME: Record<AntwortArt, string> = { kurz: "Kurzer Text", lang: "Langer Text", zahl: "Zahl" };

const zahlText = (n: number) => (Math.round(n * 100) / 100).toLocaleString("de-DE");

/** Ø, Median, kleinste, größte – für Zahl-Antworten */
export function ZahlenAuswertung({ werte }: { werte: number[] }) {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const mitte = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const schnitt = s.reduce((a, b) => a + b, 0) / s.length;
  const felder: [string, number][] = [
    ["Ø", schnitt],
    ["Median", mitte],
    ["Kleinste", s[0]],
    ["Größte", s[s.length - 1]],
  ];
  return (
    <li className="grid grid-cols-4 gap-1.5">
      {felder.map(([t, n]) => (
        <span key={t} className="rounded-xl bg-brand/10 px-2 py-2 text-center">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{t}</span>
          <span className="zahl block text-[16px] font-bold">{zahlText(n)}</span>
        </span>
      ))}
    </li>
  );
}

interface Antwort {
  user_id: string;
  wert: string;
  updated_at: string;
}

function useAntworten(itemId: string) {
  const [liste, setListe] = useState<Antwort[]>([]);
  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("topic_antworten").select("user_id, wert, updated_at").eq("item_id", itemId).order("updated_at");
    setListe((data as Antwort[]) || []);
  }, [itemId]);
  useEffect(() => {
    void laden();
    if (!hasSupabase) return;
    return abonniere({
      name: `sv-freitext-${itemId}`,
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "topic_antworten", filter: `item_id=eq.${itemId}` }, () => void laden()),
    });
  }, [itemId, laden]);
  return { liste, setListe, laden };
}

/** Inhalt einer Abstimmungs-Karte mit freier Antwort */
export function FreiAntworten({ item, abgelaufen }: { item: TopicItem; abgelaufen: boolean }) {
  const { uid, isAdmin, banned } = useRole();
  const art = (item.antwort_art || "kurz") as AntwortArt;
  const { liste, setListe, laden } = useAntworten(item.id);
  const meine = liste.find((a) => a.user_id === uid);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const geladen = useRef(false);
  useEffect(() => {
    if (meine && !geladen.current) {
      setText(art === "zahl" ? meine.wert.replace(".", ",") : meine.wert);
      geladen.current = true;
    }
  }, [meine, art]);

  const zeigeNamen = !item.poll_anon || isAdmin;
  const zahlOk = art !== "zahl" || alsZahl(text) !== null;
  const werte = useMemo(() => (art === "zahl" ? liste.map((a) => alsZahl(a.wert)).filter((z): z is number => z !== null) : []), [liste, art]);
  const sortiert = art === "zahl" ? [...liste].sort((a, b) => (alsZahl(a.wert) ?? 0) - (alsZahl(b.wert) ?? 0)) : [...liste].reverse();

  async function speichern() {
    const w = text.trim();
    if (!w || !zahlOk || !uid) return;
    setBusy(true);
    const wert = art === "zahl" ? String(alsZahl(w)) : w;
    setListe((l) => [...l.filter((a) => a.user_id !== uid), { user_id: uid, wert, updated_at: new Date().toISOString() }]);
    if (hasSupabase) {
      const { error } = await supabase!.from("topic_antworten").upsert({ item_id: item.id, user_id: uid, wert }, { onConflict: "item_id,user_id" });
      if (error) {
        meldeFehler("Ging nicht: " + error.message);
        void laden();
      }
    }
    setBusy(false);
  }

  async function zurueckziehen() {
    if (!uid) return;
    setListe((l) => l.filter((a) => a.user_id !== uid));
    setText("");
    if (hasSupabase) {
      const { error } = await supabase!.from("topic_antworten").delete().eq("item_id", item.id).eq("user_id", uid);
      if (error) {
        meldeFehler("Ging nicht: " + error.message);
        void laden();
      }
    }
  }

  const geaendert = text.trim() !== (meine ? (art === "zahl" ? meine.wert.replace(".", ",") : meine.wert) : "");

  return (
    <div className="mt-3">
      {!abgelaufen && !banned && (
        <div className="mb-3">
          {art === "lang" ? (
            <textarea className="field min-h-[90px] resize-y" maxLength={2000} placeholder="Deine Antwort …" value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <input
              className={`field ${art === "zahl" ? "zahl" : ""}`}
              inputMode={art === "zahl" ? "decimal" : "text"}
              maxLength={art === "zahl" ? 15 : 120}
              placeholder={art === "zahl" ? "Zahl, z. B. 12 oder 3,5" : "Kurze Antwort …"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void speichern()}
            />
          )}
          {!zahlOk && text.trim() && <p className="mt-1 px-1 text-[12.5px] font-semibold text-red-600 dark:text-red-400">Bitte nur eine Zahl eingeben.</p>}
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-klein" disabled={busy || !text.trim() || !zahlOk || !geaendert} onClick={() => void speichern()}>
              {meine ? "Antwort ändern" : "Antworten"}
            </button>
            {meine && (
              <button className="text-[13px] font-semibold text-tinte-leise" onClick={() => void zurueckziehen()}>
                Zurückziehen
              </button>
            )}
            {art === "kurz" && <span className="ml-auto text-[11.5px] text-tinte-leise">{text.length} / 120</span>}
          </div>
        </div>
      )}
      <ul className="space-y-1.5">
        {art === "zahl" && <ZahlenAuswertung werte={werte} />}
        {sortiert.map((a) => (
          <li key={a.user_id} className="flex items-start gap-2 rounded-xl bg-[rgb(118_118_128/0.08)] px-3 py-2 dark:bg-[rgb(118_118_128/0.18)]">
            {zeigeNamen ? (
              <Avatar userId={a.user_id} size={22} />
            ) : (
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-extrabold text-tinte-matt dark:bg-slate-600 dark:text-slate-300">?</span>
            )}
            <span className="min-w-0 flex-1">
              {zeigeNamen && <PersonName userId={a.user_id} className="block text-[11.5px] font-semibold" />}
              <span className={`block whitespace-pre-wrap break-words text-[14px] ${art === "zahl" ? "zahl font-semibold" : ""}`}>
                {art === "zahl" ? zahlText(Number(a.wert)) : a.wert}
              </span>
            </span>
            {a.user_id === uid && <span className="shrink-0 text-[11px] font-semibold text-brand">du</span>}
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[11px] text-tinte-leise">
        {liste.length} {liste.length === 1 ? "Antwort" : "Antworten"}
        {item.poll_anon && !isAdmin ? " · anonym" : ""}
      </div>
    </div>
  );
}
