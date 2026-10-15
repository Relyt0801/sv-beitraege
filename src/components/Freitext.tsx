import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { abonniere } from "../lib/realtime";
import { useRole } from "../auth/RoleProvider";
import { frage, meldeFehler } from "../lib/melder";
import { alsZahl } from "../lib/umfragen";
import { Avatar, PersonName } from "./Avatar";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile } from "./Liste";
import { Schalter } from "./Schalter";
import { Icon } from "./Icon";
import { WerHatGestimmt } from "./WerHatGestimmt";
import { DEMO_ANTWORTEN_LS, useTopics, type TopicItem } from "../topics-store";

/**
 * Abstimmungen im Chat (Pinnwand eines Komitee-Chats) und freie Antworten.
 *
 * Eine Abstimmung hat entweder
 *   a) Auswahl-Möglichkeiten (topic_items.options, Stimmen in topic_votes) –
 *      optional mit „Eigene Antwort“: eine Möglichkeit mit Kennzeichen
 *      { frei: true }. Wer sie ankreuzt, schreibt kurz dazu (topic_antworten,
 *      supabase/abstimmung-sonstiges.sql) – wie „Sonstiges: ____“ in Formularen.
 *   b) eine freie Antwort statt Auswahl (topic_items.antwort_art,
 *      supabase/freitext-abstimmungen.sql):
 *        kurz  eine Zeile, höchstens 120 Zeichen
 *        lang  mehrere Zeilen
 *        zahl  nur eine Zahl – dazu Ø, Median, kleinste und größte
 *
 * Jede Person hat höchstens einen Text je Abstimmung und kann ihn ändern
 * oder zurückziehen. Anonym: Texte ohne Namen (Namen nur für Admins, wie bei
 * den Stimmen). Gleiche Texte werden in der Auswertung zusammengefasst
 * („Donnerstag ×3“) und bei vielen Antworten eingeklappt.
 *
 * Hier liegen auch die Karte einer Abstimmung (AbstimmungKarte) und das
 * Blatt zum Anlegen von Angepinntem, Abstimmungen und To-dos
 * (NeuEintragSheet) – KomiteePage.tsx bindet beide nur ein.
 */
export type AntwortArt = "kurz" | "lang" | "zahl";
export const ANTWORT_ART_NAME: Record<AntwortArt, string> = { kurz: "Kurzer Text", lang: "Langer Text", zahl: "Zahl" };
/** So heißt die freie Möglichkeit in einer Auswahl-Abstimmung. */
export const EIGENE_ANTWORT = "Eigene Antwort";

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
          <span className="block text-[12px] font-semibold uppercase tracking-[0.04em] text-tinte-leise">{t}</span>
          <span className="zahl block text-[16px] font-bold">{zahlText(n)}</span>
        </span>
      ))}
    </li>
  );
}

/* ====================================================================== */
/* Gleiche Texte zusammenfassen                                           */
/* ====================================================================== */
export interface TextGruppe {
  /** So wird der Text gezeigt (die erste Schreibweise) */
  text: string;
  /** Wie oft kam er vor? */
  n: number;
  /** Wer hat ihn geschrieben (nur, wenn bekannt) */
  leute: string[];
}

/**
 * „Donnerstag“, „donnerstag.“ und „ Donnerstag “ zählen als derselbe Text:
 * Groß/klein, doppelte Leerzeichen und Satzzeichen am Ende spielen keine Rolle.
 */
const textSchluessel = (t: string) =>
  t.trim().replace(/\s+/g, " ").replace(/[.!?…,;:]+$/u, "").toLocaleLowerCase("de");

/**
 * Texte gruppieren – häufigste zuerst, bei Gleichstand in der Reihenfolge
 * des Eingangs. Mit `nachZahl` stattdessen der Größe nach (Zahl-Antworten).
 */
export function gruppiereTexte(eintraege: { text: string; user_id?: string }[], nachZahl = false): TextGruppe[] {
  const map = new Map<string, TextGruppe & { erst: number }>();
  eintraege.forEach((e, i) => {
    const t = (e.text || "").trim();
    if (!t) return;
    const k = nachZahl ? String(alsZahl(t) ?? t) : textSchluessel(t);
    const g = map.get(k) ?? { text: t, n: 0, leute: [], erst: i };
    g.n += 1;
    if (e.user_id) g.leute.push(e.user_id);
    map.set(k, g);
  });
  const liste = [...map.values()];
  liste.sort(nachZahl ? (a, b) => (alsZahl(a.text) ?? 0) - (alsZahl(b.text) ?? 0) : (a, b) => b.n - a.n || a.erst - b.erst);
  return liste.map(({ text, n, leute }) => ({ text, n, leute }));
}

/**
 * Gruppierte Texte als Liste. Bei mehr als `max` Gruppen klappt der Rest ein
 * („Alle 12 Antworten anzeigen“), damit die Karte kurz bleibt.
 */
export function TextGruppen({
  gruppen,
  zeigeNamen = false,
  ich,
  max = 3,
  zahl = false,
  leer,
  onEigene,
}: {
  gruppen: TextGruppe[];
  zeigeNamen?: boolean;
  /** eigene Kennung – die eigene Antwort bekommt ein „du“ */
  ich?: string | null;
  max?: number;
  /** Zahl-Antworten: als Zahl formatieren */
  zahl?: boolean;
  /** Text, wenn es noch keine Antwort gibt (sonst nichts zeigen) */
  leer?: string;
  /** Die Gruppe mit der eigenen Antwort ist antippbar („Ändern“) */
  onEigene?: () => void;
}) {
  const [alle, setAlle] = useState(false);
  if (!gruppen.length) return leer ? <p className="px-1 text-[13px] text-tinte-leise">{leer}</p> : null;
  // Eine einzelne versteckte Gruppe lohnt das Einklappen nicht
  const klappbar = gruppen.length > max + 1;
  const sichtbar = alle || !klappbar ? gruppen : gruppen.slice(0, max);
  const summe = gruppen.reduce((s, g) => s + g.n, 0);
  return (
    <div>
      <ul className="space-y-1">
        {sichtbar.map((g) => {
          const meins = Boolean(ich && g.leute.includes(ich));
          const z = zahl ? alsZahl(g.text) : null;
          const innen = (
            <>
              <span className="min-w-0 flex-1">
                <span className={`block whitespace-pre-wrap break-words text-[14.5px] leading-snug ${zahl ? "zahl font-semibold" : ""}`}>
                  {z !== null ? zahlText(z) : g.text}
                </span>
                {zeigeNamen && g.leute.length > 0 && (
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {g.leute.slice(0, 4).map((u) => (
                      <PersonName key={u} userId={u} className="text-[12px] font-semibold" />
                    ))}
                    {g.leute.length > 4 && <span className="text-[12px] text-tinte-leise">+{g.leute.length - 4}</span>}
                  </span>
                )}
              </span>
              {meins && <span className="mt-0.5 shrink-0 text-[12px] font-semibold text-brand-dark dark:text-brand">du</span>}
              {g.n > 1 && (
                <span className="zahl mt-px shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[12px] font-bold text-brand-dark dark:bg-brand/20 dark:text-brand">
                  ×{g.n}
                </span>
              )}
              {meins && onEigene && <span className="mt-0.5 shrink-0 text-[13px] font-semibold text-brand-dark dark:text-brand">Ändern</span>}
            </>
          );
          return meins && onEigene ? (
            <li key={g.text}>
              <button
                type="button"
                onClick={onEigene}
                className="flex min-h-[44px] w-full items-start gap-2.5 rounded-xl zelle px-3 py-2 text-left transition active:scale-[.99]"
              >
                {innen}
              </button>
            </li>
          ) : (
            <li key={g.text} className="flex items-start gap-2.5 rounded-xl zelle px-3 py-2">
              {innen}
            </li>
          );
        })}
      </ul>
      {klappbar && (
        <button className="mt-1.5 px-1 text-[13px] font-semibold text-brand-dark dark:text-brand" onClick={() => setAlle(!alle)} aria-expanded={alle}>
          {alle ? "Weniger anzeigen" : `Alle ${summe} ${summe === 1 ? "Antwort" : "Antworten"} anzeigen`}
        </button>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Texte einer Abstimmung laden und speichern                             */
/* ====================================================================== */
interface Antwort {
  user_id: string;
  wert: string;
  updated_at: string;
}

/** Demo ohne Datenbank: Texte liegen im Browser (Startwerte aus topics-store). */
function demoLesen(): Record<string, Antwort[]> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_ANTWORTEN_LS) || "{}") as Record<string, Antwort[]>;
  } catch {
    return {};
  }
}
function demoSchreiben(itemId: string, liste: Antwort[]) {
  try {
    const d = demoLesen();
    d[itemId] = liste;
    localStorage.setItem(DEMO_ANTWORTEN_LS, JSON.stringify(d));
  } catch {
    /* privater Modus */
  }
}

/**
 * Alle Texte einer Abstimmung, live. `speichern`/`zurueckziehen` zeigen die
 * Änderung sofort und holen bei einem Fehler den echten Stand zurück.
 * Leere Kennung (`itemId = ""`) = nichts laden (Abstimmung ohne Texte).
 */
function useAntworten(itemId: string, uid: string | null) {
  const [liste, setListe] = useState<Antwort[]>(() => (hasSupabase || !itemId ? [] : demoLesen()[itemId] || []));
  const laden = useCallback(async () => {
    if (!itemId) return;
    if (!hasSupabase) return setListe(demoLesen()[itemId] || []);
    const { data } = await supabase!.from("topic_antworten").select("user_id, wert, updated_at").eq("item_id", itemId).order("updated_at");
    setListe((data as Antwort[]) || []);
  }, [itemId]);
  useEffect(() => {
    if (!itemId) return;
    void laden();
    if (!hasSupabase) return;
    return abonniere({
      name: `sv-freitext-${itemId}`,
      nachholen: laden,
      aufbauen: (k) => k.on("postgres_changes", { event: "*", schema: "public", table: "topic_antworten", filter: `item_id=eq.${itemId}` }, () => void laden()),
    });
  }, [itemId, laden]);

  const speichern = useCallback(
    async (wert: string): Promise<boolean> => {
      if (!uid || !itemId) return false;
      const neu = (l: Antwort[]) => [...l.filter((a) => a.user_id !== uid), { user_id: uid, wert, updated_at: new Date().toISOString() }];
      setListe(neu);
      if (!hasSupabase) {
        demoSchreiben(itemId, neu(demoLesen()[itemId] || []));
        return true;
      }
      const { error } = await supabase!.from("topic_antworten").upsert({ item_id: itemId, user_id: uid, wert }, { onConflict: "item_id,user_id" });
      if (error) {
        // RLS: Frist vorbei oder (bei „Eigene Antwort“) nicht angekreuzt
        meldeFehler(
          "Ging nicht: " +
            (error.message.includes("row-level security") ? "Die Abstimmung ist beendet oder „Eigene Antwort“ ist nicht angekreuzt." : error.message),
        );
        void laden();
        return false;
      }
      return true;
    },
    [itemId, uid, laden],
  );

  const zurueckziehen = useCallback(async () => {
    if (!uid || !itemId) return;
    setListe((l) => l.filter((a) => a.user_id !== uid));
    if (!hasSupabase) {
      demoSchreiben(itemId, (demoLesen()[itemId] || []).filter((a) => a.user_id !== uid));
      return;
    }
    const { error } = await supabase!.from("topic_antworten").delete().eq("item_id", itemId).eq("user_id", uid);
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    }
  }, [itemId, uid, laden]);

  return { liste, speichern, zurueckziehen };
}

/* ====================================================================== */
/* Abstimmung mit freier Antwort (antwort_art)                            */
/* ====================================================================== */
export function FreiAntworten({ item, abgelaufen }: { item: TopicItem; abgelaufen: boolean }) {
  const { uid, isAdmin, banned } = useRole();
  const art = (item.antwort_art || "kurz") as AntwortArt;
  const { liste, speichern, zurueckziehen } = useAntworten(item.id, uid);
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
  // Gleiche Antworten zusammen (Zahlen der Größe nach)
  const gruppen = useMemo(() => gruppiereTexte(liste.map((a) => ({ text: a.wert, user_id: a.user_id })), art === "zahl"), [liste, art]);

  async function abschicken() {
    const w = text.trim();
    if (!w || !zahlOk || !uid) return;
    setBusy(true);
    await speichern(art === "zahl" ? String(alsZahl(w)) : w);
    setBusy(false);
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
              onKeyDown={(e) => e.key === "Enter" && void abschicken()}
            />
          )}
          {!zahlOk && text.trim() && <p className="mt-1 px-1 text-[12.5px] font-semibold text-red-600 dark:text-red-400">Bitte nur eine Zahl eingeben.</p>}
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-klein" disabled={busy || !text.trim() || !zahlOk || !geaendert} onClick={() => void abschicken()}>
              {meine ? "Antwort ändern" : "Antworten"}
            </button>
            {meine && (
              <button
                className="text-[13px] font-semibold text-tinte-leise"
                onClick={() => {
                  setText("");
                  void zurueckziehen();
                }}
              >
                Zurückziehen
              </button>
            )}
            {art === "kurz" && <span className="ml-auto text-[12px] text-tinte-leise">{text.length} / 120</span>}
          </div>
        </div>
      )}
      {art === "zahl" && werte.length > 0 && (
        <ul className="mb-1.5">
          <ZahlenAuswertung werte={werte} />
        </ul>
      )}
      <TextGruppen gruppen={gruppen} zeigeNamen={zeigeNamen} ich={uid} zahl={art === "zahl"} max={art === "lang" ? 2 : 4} leer="Noch keine Antwort." />
      <div className="mt-1.5 px-1 text-[12px] text-tinte-leise">
        {liste.length} {liste.length === 1 ? "Antwort" : "Antworten"}
        {item.poll_anon && !isAdmin ? " · anonym" : ""}
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Karte einer Abstimmung im Chat                                         */
/* ====================================================================== */
const fristText = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Eine Abstimmung: Frage, Möglichkeiten mit Ergebnis (Prozent + Anzahl,
 * führende Möglichkeit hervorgehoben) und – falls erlaubt – „Eigene Antwort“
 * mit Textfeld und den gruppierten Texten darunter.
 *
 * kompakt: Ist die Abstimmung beendet, zeigt die Karte nur Frage und Ergebnis
 * (eine Zeile) – ein Tipp klappt sie auf. Vorher stand eine beendete
 * Abstimmung mit allen Balken ganz oben auf der Pinnwand.
 *
 * Löschen steht nicht mehr als Mülleimer an jeder Karte, sondern hinter „…“
 * in einem Blatt (ganz unten, rot, mit Rückfrage).
 */
export function AbstimmungKarte({
  item, kannLoeschen, onDelete, kompakt = false,
}: { item: TopicItem; kannLoeschen: boolean; onDelete: () => void; kompakt?: boolean }) {
  const abgelaufen = item.poll_deadline ? new Date(item.poll_deadline) < new Date() : false;
  const [auf, setAuf] = useState(false);
  const [mehr, setMehr] = useState(false);
  const zu = kompakt && abgelaufen && !auf;
  const art = item.antwort_art
    ? `Freie Antwort · ${ANTWORT_ART_NAME[item.antwort_art]}`
    : item.poll_multi
      ? "Mehrfachwahl"
      : "Einfachwahl";

  return (
    <div className="card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{item.body}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-tinte-leise">
            {/* Name höchstens 60 % breit – sonst bleibt der Rest auf schmalen Handys zu eng.
                Kein Mini-Kreis mehr davor: dessen Initialen waren 6 px klein und der Name steht ja da. */}
            <PersonName userId={item.created_by} name={item.author} role={item.author_role} koms={item.author_koms} className="min-w-0 max-w-[60%] truncate font-semibold" />
            <span aria-hidden>·</span>
            <span>{art}</span>
            <span aria-hidden>·</span>
            <span>{item.poll_anon ? "anonym" : "mit Namen"}</span>
            {item.poll_deadline && (
              <>
                <span aria-hidden>·</span>
                <span className={abgelaufen ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                  {abgelaufen ? "beendet" : `bis ${fristText(item.poll_deadline)}`}
                </span>
              </>
            )}
          </div>
        </div>
        {kannLoeschen && (
          <button
            type="button"
            onClick={() => setMehr(true)}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tinte-leise transition active:scale-90 active:bg-black/[0.05] dark:active:bg-white/[0.08]"
            aria-label="Mehr zu dieser Abstimmung"
            title="Mehr"
          >
            <Icon name="mehr" size={20} strich={2.4} />
          </button>
        )}
      </div>

      {zu ? (
        <ErgebnisKurz item={item} onAuf={() => setAuf(true)} />
      ) : item.antwort_art ? (
        <FreiAntworten item={item} abgelaufen={abgelaufen} />
      ) : (
        <AuswahlAbstimmung item={item} abgelaufen={abgelaufen} />
      )}
      {kompakt && abgelaufen && auf && (
        <button type="button" onClick={() => setAuf(false)} className="mt-1 min-h-[44px] px-1 text-[13px] font-semibold text-brand-dark dark:text-brand">
          Zuklappen
        </button>
      )}

      <Sheet open={mehr} onClose={() => setMehr(false)}>
        <SheetKopf titel="Abstimmung" unter={item.body} onClose={() => setMehr(false)} />
        <Gruppe className="mt-0" fuss="Die Abstimmung verschwindet mit allen Stimmen und Antworten.">
          <Zeile
            label="Abstimmung löschen"
            rot
            onClick={() =>
              void frage("Abstimmung löschen?", "Löschen", true).then((ok) => {
                if (!ok) return;
                setMehr(false);
                void onDelete();
              })
            }
          />
        </Gruppe>
      </Sheet>
    </div>
  );
}

/** Beendete Abstimmung zugeklappt: nur das Ergebnis in einer Zeile, Tipp klappt auf. */
function ErgebnisKurz({ item, onAuf }: { item: TopicItem; onAuf: () => void }) {
  const { voteCounts } = useTopics();
  let text = "Antworten ansehen";
  let pct: number | null = null;
  if (!item.antwort_art) {
    const optionen = Array.isArray(item.options) ? item.options : [];
    const counts = voteCounts[item.id] || {};
    const gesamt = optionen.reduce((s, o) => s + (counts[o.id] || 0), 0);
    const max = Math.max(0, ...optionen.map((o) => counts[o.id] || 0));
    const sieger = max > 0 ? optionen.filter((o) => (counts[o.id] || 0) === max) : [];
    if (sieger.length) {
      text = `${sieger.length > 1 ? "Gleichstand: " : "Ergebnis: "}${sieger.map((o) => o.label).join(", ")}`;
      pct = gesamt ? Math.round((max / gesamt) * 100) : null;
    } else text = "Keine Stimmen";
  }
  return (
    <button
      type="button"
      onClick={onAuf}
      aria-expanded={false}
      className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-left text-[14px] transition active:scale-[.99] dark:bg-brand/15"
    >
      <span className="shrink-0 text-brand-dark dark:text-brand">
        <Icon name="pokal" size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{text}</span>
      {pct !== null && <span className="zahl shrink-0 font-bold text-brand-dark dark:text-brand">{pct} %</span>}
      <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
    </button>
  );
}

/** Abstimmung mit Möglichkeiten (und optional „Eigene Antwort“) */
function AuswahlAbstimmung({ item, abgelaufen }: { item: TopicItem; abgelaufen: boolean }) {
  const { myVotes, voteCounts, voters, vote } = useTopics();
  const { uid, isAdmin, banned } = useRole();
  const optionen = Array.isArray(item.options) ? item.options : [];
  const frei = optionen.find((o) => o.frei) ?? null;
  const meine = myVotes[item.id] || [];
  const counts = voteCounts[item.id] || {};
  const gesamt = optionen.reduce((s, o) => s + (counts[o.id] || 0), 0);
  const max = Math.max(0, ...optionen.map((o) => counts[o.id] || 0));
  // anonym = nur Admins sehen, wer gestimmt hat
  const zeigeWaehler = !item.poll_anon || isAdmin;
  const gesperrt = abgelaufen || banned;

  // Texte zur freien Möglichkeit – nur laden, wenn es sie gibt
  const texte = useAntworten(frei ? item.id : "", uid);
  const meinText = frei ? texte.liste.find((a) => a.user_id === uid) : undefined;
  // Eigener Text: gesichert steht er nur noch einmal (in der Liste, mit „du“) –
  // antippen holt das Feld zum Ändern zurück
  const [bearbeiten, setBearbeiten] = useState(false);
  const speichern = useCallback(
    async (t: string) => {
      const ok = await texte.speichern(t);
      if (ok) setBearbeiten(false);
      return ok;
    },
    [texte],
  );
  const freiGewaehlt = Boolean(frei && meine.includes(frei.id));
  const gruppen = useMemo(() => gruppiereTexte(texte.liste.map((a) => ({ text: a.wert, user_id: a.user_id }))), [texte.liste]);

  async function waehlen(id: string) {
    if (gesperrt) return;
    const warGewaehlt = meine.includes(id);
    await vote(item.id, id, item.poll_multi);
    // Wer die freie Möglichkeit verlässt (abwählen oder bei Einfachwahl etwas
    // anderes ankreuzen), dessen Text verschwindet mit – sonst stünde ein
    // Text ohne Stimme da.
    if (!frei || !meinText) return;
    const freiWeg = id === frei.id ? warGewaehlt : !item.poll_multi && !warGewaehlt;
    if (freiWeg) await texte.zurueckziehen();
  }

  // Ende: der Gewinner steht oben, ohne dass man rechnen muss
  const sieger = abgelaufen && max > 0 ? optionen.filter((o) => (counts[o.id] || 0) === max) : [];

  return (
    <div className="mt-3">
      {sieger.length > 0 && (
        <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-[13.5px] text-brand-dark dark:bg-brand/15 dark:text-brand">
          <Icon name="pokal" size={16} />
          <span className="min-w-0 flex-1 truncate text-tinte">
            <span className="font-semibold">{sieger.length > 1 ? "Gleichstand: " : "Ergebnis: "}</span>
            {sieger.map((o) => o.label).join(", ")}
          </span>
          <span className="zahl shrink-0 font-bold">{Math.round((max / gesamt) * 100)} %</span>
        </div>
      )}
      <div className="grid gap-1.5">
        {optionen.map((o) => {
          const n = counts[o.id] || 0;
          const pct = gesamt ? Math.round((n / gesamt) * 100) : 0;
          const gewaehlt = meine.includes(o.id);
          const vorne = n > 0 && n === max;
          const waehler = zeigeWaehler ? (voters[item.id] || []).filter((v) => v.option_id === o.id).map((v) => v.user_id) : [];
          return (
            <div key={o.id}>
              <button
                disabled={gesperrt}
                onClick={() => void waehlen(o.id)}
                aria-pressed={gewaehlt}
                className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl zelle px-3 py-2.5 text-left transition active:scale-[.99] disabled:active:scale-100 ${
                  gewaehlt ? "ring-[1.5px] ring-inset ring-brand" : ""
                }`}
              >
                {/* Balken hinter der Zeile: Anteil an allen Stimmen */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-ios ${
                    vorne ? "bg-brand/20 dark:bg-brand/30" : "bg-[rgb(118_118_128/0.12)] dark:bg-[rgb(118_118_128/0.22)]"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span
                  className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center text-white ${item.poll_multi ? "rounded-[5px]" : "rounded-full"} ${
                    gewaehlt ? "bg-brand" : "ring-[1.5px] ring-inset ring-black/25 dark:ring-white/35"
                  }`}
                >
                  {gewaehlt && <Icon name="haken" size={12} strich={3} />}
                </span>
                <span className={`relative min-w-0 flex-1 truncate text-[14.5px] ${vorne ? "font-bold" : "font-medium"} ${o.frei ? "italic" : ""}`}>{o.label}</span>
                {zeigeWaehler && waehler.length > 0 && (
                  <span className="relative flex shrink-0 items-center">
                    {waehler.slice(0, 3).map((u, i) => (
                      <span key={u} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                        <Avatar userId={u} size={18} ring />
                      </span>
                    ))}
                  </span>
                )}
                <span className="relative shrink-0 text-right leading-none">
                  <span className={`zahl block text-[14px] font-bold ${vorne ? "text-brand-dark dark:text-brand" : ""}`}>{pct} %</span>
                  <span className="zahl mt-0.5 block text-[12px] text-tinte-leise">{n === 1 ? "1 Stimme" : `${n} Stimmen`}</span>
                </span>
              </button>
              {o.frei && (freiGewaehlt && !gesperrt ? true : gruppen.length > 0) && (
                <div className="pl-7">
                  {freiGewaehlt && !gesperrt && (!meinText || bearbeiten) && (
                    <EigeneEingabe
                      key={meinText?.wert ?? ""}
                      start={meinText?.wert ?? ""}
                      speichern={speichern}
                      aendern={bearbeiten}
                      onFertig={() => setBearbeiten(false)}
                    />
                  )}
                  {gruppen.length > 0 && (
                    <div className="mt-1.5">
                      <TextGruppen
                        gruppen={gruppen}
                        zeigeNamen={zeigeWaehler}
                        ich={uid}
                        onEigene={freiGewaehlt && !gesperrt && !bearbeiten ? () => setBearbeiten(true) : undefined}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 px-1 text-[12px] text-tinte-leise">
        {gesamt} {gesamt === 1 ? "Stimme" : "Stimmen"}
        {item.poll_multi ? " · mehrere Kreuze möglich" : ""}
      </div>
      {zeigeWaehler && <WerHatGestimmt optionen={optionen} stimmen={voters[item.id] || []} />}
    </div>
  );
}

/** Textfeld unter „Eigene Antwort“ – speichert mit „Sichern“ oder Enter */
function EigeneEingabe({
  start, speichern, aendern = false, onFertig,
}: {
  start: string;
  speichern: (t: string) => Promise<boolean>;
  /** Über „Ändern“ geöffnet: Feld bekommt den Fokus, „Fertig“ klappt es ohne Änderung wieder zu */
  aendern?: boolean;
  onFertig?: () => void;
}) {
  const [text, setText] = useState(start);
  const [busy, setBusy] = useState(false);
  const geaendert = text.trim() !== start.trim();
  const sichern = async () => {
    if (!text.trim() || !geaendert || busy) return;
    setBusy(true);
    await speichern(text.trim());
    setBusy(false);
  };
  return (
    <div className="mt-1.5 flex animate-fadeIn items-center gap-2">
      <input
        className="field min-w-0 flex-1 !py-2 text-[15px]"
        autoFocus={!start || aendern}
        maxLength={120}
        placeholder="Deine Antwort …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void sichern()}
        aria-label={EIGENE_ANTWORT}
      />
      {geaendert || !start ? (
        <button className="btn-klein shrink-0" disabled={busy || !text.trim()} onClick={() => void sichern()}>
          Sichern
        </button>
      ) : aendern && onFertig ? (
        <button type="button" className="btn-klein-grau shrink-0" onClick={onFertig}>
          Fertig
        </button>
      ) : (
        <span className="flex shrink-0 items-center gap-1 px-1 text-[12.5px] font-semibold text-[#1E7B34] dark:text-[#30D158]">
          <Icon name="haken" size={13} strich={2.6} /> gesichert
        </span>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Neu anlegen: Angepinntes, Abstimmung, To-do                            */
/* ====================================================================== */
export type NeuArt = "pin" | "umfrage" | "todo";
export interface NeuDaten {
  art: NeuArt;
  text: string;
  optionen: string[];
  multi: boolean;
  anon: boolean;
  frist: string | null;
  /** null = Auswahl-Möglichkeiten, sonst freie Antwort */
  antwortArt: AntwortArt | null;
  /** Auswahl mit zusätzlicher Möglichkeit „Eigene Antwort“ */
  eigene: boolean;
}

/**
 * Fuß eines Blatts (Haupt-Knopf): bleibt beim Scrollen unten im Blatt sichtbar.
 * Das Blatt (Sheet.tsx) hat links/rechts 1,25 rem und unten Sicherheitsabstand
 * + 1,5 rem Innenabstand. Sticky bezieht sich auf die Innenkante (ohne Innenabstand):
 * mit bottom = -Innenabstand rutscht die Leiste bis an den Blattrand, und mit den
 * negativen Seitenrändern geht der Hintergrund über die volle Breite – nichts
 * scheint darunter oder daneben durch. Hintergrund = Blattfarbe.
 */
export function BlattFuss({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(-1*(env(safe-area-inset-bottom)+1.5rem))] z-10 -mx-5 mt-5 bg-papier px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-0.5px_0_rgba(0,0,0,0.12)] dark:bg-slate-900 dark:shadow-[0_-0.5px_0_rgba(255,255,255,0.12)]">
      {children}
    </div>
  );
}

/**
 * Blatt zum Anlegen – aufgebaut wie die iOS-Einstellungen: weiße Gruppen mit
 * Zeilen und Kippschaltern auf grauem Grund.
 */
export function NeuEintragSheet({ art, onClose, onSave }: { art: NeuArt | null; onClose: () => void; onSave: (d: NeuDaten) => void }) {
  const [text, setText] = useState("");
  const [optionen, setOptionen] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(true);
  const [frist, setFrist] = useState("");
  const [antwortArt, setAntwortArt] = useState<AntwortArt | null>(null);
  const [eigene, setEigene] = useState(false);

  useEffect(() => {
    if (art) {
      setAntwortArt(null);
      setText("");
      setOptionen(["", ""]);
      setMulti(false);
      setAnon(true);
      setFrist("");
      setEigene(false);
    }
  }, [art]);

  if (!art) return null;
  const maxLen = art === "pin" ? 100 : 200;
  const titel = art === "pin" ? "Kurz anpinnen" : art === "todo" ? "Neues To-do" : "Neue Abstimmung";
  const gefuellt = optionen.map((o) => o.trim()).filter(Boolean);
  // „Eigene Antwort“ zählt als Möglichkeit: „Ja“ + „Eigene Antwort“ reicht schon
  const doppelt = eigene && gefuellt.some((o) => o.toLocaleLowerCase("de") === EIGENE_ANTWORT.toLocaleLowerCase("de"));
  const genug = Boolean(antwortArt) || gefuellt.length + (eigene ? 1 : 0) >= 2;
  const gueltig = Boolean(text.trim()) && (art !== "umfrage" || (genug && !doppelt));
  const kaestchen = `h-[18px] w-[18px] shrink-0 ring-[1.5px] ring-inset ring-black/25 dark:ring-white/35 ${multi ? "rounded-[5px]" : "rounded-full"}`;

  return (
    <Sheet open onClose={onClose}>
      <SheetKopf titel={titel} onClose={onClose} />

      <Gruppe className="mt-0" fuss={<span className="block text-right">{text.length} / {maxLen}</span>}>
        <textarea
          rows={2}
          autoFocus
          maxLength={maxLen}
          className="block w-full resize-none bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-tinte-leise"
          placeholder={art === "pin" ? "Kurze Info, die oben stehen bleibt" : art === "todo" ? "Was ist zu tun?" : "Worüber wird abgestimmt?"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Gruppe>

      {art === "umfrage" && (
        <>
          <Gruppe
            titel="Art der Antwort"
            fuss={
              antwortArt === "kurz"
                ? "Alle antworten mit einer Zeile (höchstens 120 Zeichen)."
                : antwortArt === "lang"
                  ? "Alle antworten mit freiem Text, auch mehrere Zeilen."
                  : antwortArt === "zahl"
                    ? "Alle antworten mit einer Zahl. Dazu siehst du Ø, Median, kleinste und größte."
                    : "Alle kreuzen an, was passt."
            }
          >
            <div className="px-3 py-2.5">
              <div className="seg" role="radiogroup" aria-label="Art der Antwort">
                {([null, "kurz", "lang", "zahl"] as (AntwortArt | null)[]).map((a) => (
                  // whitespace-nowrap + schmaler Innenabstand: „Auswahl“ bricht auf 360-px-Handys sonst zu „Auswa/hl“
                  <button key={a ?? "auswahl"} role="radio" aria-checked={antwortArt === a} className={`seg-item whitespace-nowrap !px-0.5 ${antwortArt === a ? "seg-aktiv" : ""}`} onClick={() => setAntwortArt(a)}>
                    {a ? (a === "kurz" ? "Kurz" : a === "lang" ? "Lang" : "Zahl") : "Auswahl"}
                  </button>
                ))}
              </div>
            </div>
          </Gruppe>

          {!antwortArt && (
            <Gruppe
              titel="Möglichkeiten"
              fuss={
                doppelt ? (
                  <span className="font-semibold text-red-600 dark:text-red-400">„{EIGENE_ANTWORT}“ kommt schon über den Schalter dazu – bitte die Zeile umbenennen.</span>
                ) : eigene ? (
                  "Wer „Eigene Antwort“ ankreuzt, schreibt kurz dazu (höchstens 120 Zeichen). Gleiche Antworten werden zusammengezählt."
                ) : undefined
              }
            >
              {optionen.map((o, i) => (
                <div key={i} className="flex min-h-[48px] items-center gap-3 pl-4 pr-2">
                  <span aria-hidden className={kaestchen} />
                  <input
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] outline-none placeholder:text-tinte-leise"
                    placeholder={`Möglichkeit ${i + 1}`}
                    maxLength={80}
                    value={o}
                    onChange={(e) => setOptionen((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {optionen.length > 2 && (
                    <button
                      aria-label={`Möglichkeit ${i + 1} entfernen`}
                      onClick={() => setOptionen((p) => p.filter((_, j) => j !== i))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                    >
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#FF3B30] text-[15px] font-bold leading-none text-white">−</span>
                    </button>
                  )}
                </div>
              ))}
              {eigene && (
                <div className="flex min-h-[48px] items-center gap-3 px-4 text-tinte-leise">
                  <span aria-hidden className={kaestchen} />
                  <span className="flex-1 text-[16px] italic">{EIGENE_ANTWORT}: ____</span>
                </div>
              )}
              <button
                onClick={() => setOptionen((p) => [...p, ""])}
                className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] text-brand-dark transition active:bg-black/[0.04] dark:text-brand dark:active:bg-white/[0.06]"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#34C759] text-white">
                  <Icon name="plus" size={12} strich={3} />
                </span>
                Möglichkeit hinzufügen
              </button>
            </Gruppe>
          )}

          <Gruppe titel="Einstellungen" fuss={anon ? "Anonym: Namen sieht nur ein Admin." : "Alle im Chat sehen, wer was gewählt hat."}>
            {!antwortArt && (
              <Zeile label="Eigene Antwort erlauben">
                <Schalter an={eigene} onChange={setEigene} label="Eigene Antwort erlauben" />
              </Zeile>
            )}
            {!antwortArt && (
              <Zeile label="Mehrere Kreuze erlauben">
                <Schalter an={multi} onChange={setMulti} label="Mehrere Kreuze erlauben" />
              </Zeile>
            )}
            <Zeile label="Anonym">
              <Schalter an={anon} onChange={setAnon} label="Anonym" />
            </Zeile>
            <label className="flex min-h-[48px] items-center gap-3 px-4 py-2">
              <span className="shrink-0 text-[15px]">
                Frist <span className="text-tinte-leise">(optional)</span>
              </span>
              <input
                type="datetime-local"
                aria-label="Frist (optional)"
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-tinte-matt outline-none dark:text-slate-300"
                value={frist}
                onChange={(e) => setFrist(e.target.value)}
              />
            </label>
          </Gruppe>
        </>
      )}

      {/* Fußknopf bleibt unten im Blatt stehen – auch wenn die Abstimmung lang wird */}
      <BlattFuss>
      <button
        className="btn-primary"
        disabled={!gueltig}
        onClick={() =>
          onSave({
            art,
            text: text.trim(),
            optionen: antwortArt ? [] : gefuellt,
            multi: antwortArt ? false : multi,
            antwortArt,
            eigene: antwortArt ? false : eigene,
            anon,
            frist: frist ? new Date(frist).toISOString() : null,
          })
        }
      >
        {art === "pin" ? "Anpinnen" : art === "todo" ? "To-do anlegen" : "Abstimmung starten"}
      </button>
      </BlattFuss>
    </Sheet>
  );
}
