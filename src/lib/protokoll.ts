import { hasSupabase, supabase } from "./supabase";

/**
 * Protokoll und Speicherstände.
 *
 * Geschrieben wird beides ausschließlich in der Datenbank (siehe
 * supabase/protokoll-und-sicherung.sql). Diese Datei liest nur und stößt die
 * beiden Knöpfe an. Absicht: Wer die App umgeht und direkt auf die API geht,
 * steht trotzdem im Protokoll – die Trigger hängen an den Tabellen, nicht hier.
 */

export interface LogZeile {
  id: number;
  at: string;
  aktion: string;
  bereich: string;
  akteur_id: string | null;
  akteur_name: string;
  ziel_id: string | null;
  ziel_name: string;
  klartext: string;
  details: Record<string, unknown>;
}

export interface Speicherstand {
  id: string;
  tag: string; // YYYY-MM-DD
  erstellt_at: string;
  art: "automatisch" | "manuell" | "vor_ruecksetzung";
  zeilen: number;
}

/** Die Schubladen im Filter. Die Schlüssel stehen so in der Datenbank. */
export const BEREICHE: { key: string; label: string; icon: string }[] = [
  { key: "", label: "Alles", icon: "📋" },
  { key: "konten", label: "Zugänge", icon: "👤" },
  { key: "rollen", label: "Rollen", icon: "👑" },
  { key: "rechte", label: "Rechte", icon: "🔐" },
  { key: "komitees", label: "Komitees", icon: "🏷️" },
  { key: "beitraege", label: "Beiträge", icon: "💶" },
  { key: "mithilfe", label: "Mithilfe", icon: "🙌" },
  { key: "kasse", label: "Kasse", icon: "💰" },
  { key: "sicherung", label: "Sicherung", icon: "🗄️" },
];

/** Wie viele Zeilen pro Nachladen. */
export const SEITE = 60;

/** Datum aus „2026-09-20" als „20.09.2026" – ohne Zeitzonen-Umweg über Date. */
export function datumDe(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return t && m && j ? `${t}.${m}.${j}` : iso;
}

/** Zeitpunkt für die Protokollzeile: „20.09.2026, 14:03". */
export function zeitpunktDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Protokoll seitenweise laden. `vorId` ist die kleinste bereits geladene id –
 * so bleibt das Nachladen stabil, auch wenn währenddessen neue Zeilen
 * dazukommen (anders als bei range/offset).
 */
export async function ladeProtokoll(opts: {
  bereich?: string;
  suche?: string;
  vorId?: number | null;
}): Promise<{ zeilen: LogZeile[]; mehr: boolean; fehler?: string }> {
  if (!hasSupabase) return { zeilen: [], mehr: false };
  let q = supabase!
    .from("audit_log")
    .select("id, at, aktion, bereich, akteur_id, akteur_name, ziel_id, ziel_name, klartext, details")
    .order("id", { ascending: false })
    .limit(SEITE + 1);

  if (opts.bereich) q = q.eq("bereich", opts.bereich);
  if (opts.vorId) q = q.lt("id", opts.vorId);
  const s = (opts.suche || "").trim();
  if (s) q = q.or(`klartext.ilike.%${s}%,akteur_name.ilike.%${s}%,ziel_name.ilike.%${s}%`);

  const { data, error } = await q;
  if (error) return { zeilen: [], mehr: false, fehler: fehlertext(error.message) };
  const alle = (data as LogZeile[]) || [];
  return { zeilen: alle.slice(0, SEITE), mehr: alle.length > SEITE };
}

export async function ladeSpeicherstaende(): Promise<{ staende: Speicherstand[]; fehler?: string }> {
  if (!hasSupabase) return { staende: [] };
  const { data, error } = await supabase!
    .from("daten_snapshots")
    // inhalt bleibt absichtlich draußen: das sind schnell ein paar Megabyte.
    .select("id, tag, erstellt_at, art, zeilen")
    .order("erstellt_at", { ascending: false })
    .limit(60);
  if (error) return { staende: [], fehler: fehlertext(error.message) };
  return { staende: (data as Speicherstand[]) || [] };
}

/** Der jüngste automatische Stand – der, den der große Knopf anbietet. */
export function letzterAutomatischer(staende: Speicherstand[]): Speicherstand | null {
  return staende.find((s) => s.art === "automatisch") ?? null;
}

export async function speicherstandJetzt(): Promise<{ ok: boolean; fehler?: string }> {
  if (!hasSupabase) return { ok: false, fehler: "Keine Verbindung zur Datenbank." };
  const { error } = await supabase!.rpc("snapshot_jetzt");
  return error ? { ok: false, fehler: fehlertext(error.message) } : { ok: true };
}

export async function speicherstandUebernehmen(id: string): Promise<{ ok: boolean; fehler?: string }> {
  if (!hasSupabase) return { ok: false, fehler: "Keine Verbindung zur Datenbank." };
  const { error } = await supabase!.rpc("snapshot_zuruecksetzen", { p_id: id });
  return error ? { ok: false, fehler: fehlertext(error.message) } : { ok: true };
}

/** Den kompletten Stand holen und als Datei anbieten. */
export async function speicherstandHerunterladen(s: Speicherstand): Promise<{ ok: boolean; fehler?: string }> {
  if (!hasSupabase) return { ok: false, fehler: "Keine Verbindung zur Datenbank." };
  const { data, error } = await supabase!
    .from("daten_snapshots")
    .select("inhalt")
    .eq("id", s.id)
    .maybeSingle();
  if (error) return { ok: false, fehler: fehlertext(error.message) };
  if (!data) return { ok: false, fehler: "Diesen Speicherstand gibt es nicht mehr." };
  datei(
    JSON.stringify((data as { inhalt: unknown }).inhalt, null, 2),
    "application/json",
    `stufenkasse-${s.tag}${s.art === "automatisch" ? "" : "-" + s.art}.json`,
  );
  return { ok: true };
}

/** Das Protokoll als Tabelle für Excel/Numbers. */
export function protokollAlsCsv(zeilen: LogZeile[]) {
  const kopf = ["Zeitpunkt", "Bereich", "Aktion", "Wer", "Betrifft", "Was"];
  const zeile = (w: string[]) => w.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";");
  const text = [
    zeile(kopf),
    ...zeilen.map((z) => zeile([zeitpunktDe(z.at), z.bereich, z.aktion, z.akteur_name, z.ziel_name, z.klartext])),
  ].join("\r\n");
  // BOM, sonst zeigt Excel Umlaute als Kraut an.
  datei("﻿" + text, "text/csv;charset=utf-8", `stufenkasse-protokoll-${new Date().toISOString().slice(0, 10)}.csv`);
}

function datei(inhalt: string, typ: string, name: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Erst freigeben, wenn der Browser wirklich angefangen hat zu speichern.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Datenbankfehler in einen Satz übersetzen, der jemandem etwas sagt. */
function fehlertext(msg: string): string {
  if (/relation .*(audit_log|daten_snapshots).* does not exist|schema cache/i.test(msg))
    return "In der Datenbank fehlt noch protokoll-und-sicherung.sql.";
  if (/function .*snapshot_/i.test(msg))
    return "In der Datenbank fehlt noch protokoll-und-sicherung.sql.";
  if (/permission denied|Nur der Admin/i.test(msg)) return msg.replace(/^.*Nur der Admin/, "Nur der Admin");
  return msg;
}
