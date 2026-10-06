import { hasSupabase, supabase } from "./supabase";
import { PERM_CATEGORIES, rolleName } from "./permissions";

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
  { key: "mithilfe", label: "Mithilfe & Schichten", icon: "🙌" },
  { key: "anfragen", label: "Anfragen", icon: "📨" },
  { key: "kasse", label: "Kasse", icon: "💰" },
  { key: "sicherung", label: "Sicherung", icon: "🗄️" },
];

/**
 * Jede Zeile gleich gebaut: wer/was betroffen ist (Name) und kurz, was
 * passiert ist – Stichworte statt ganzer Sätze. Funktioniert auch für alte
 * Einträge, die noch als Satz gespeichert sind.
 */
export function protokollKurz(z: Pick<LogZeile, "aktion" | "bereich" | "ziel_name" | "klartext" | "akteur_name">): {
  name: string;
  was: string;
} {
  const t = (z.klartext || "").trim();
  const ziel = (z.ziel_name || "").trim();
  // „Name: Rest“ → „Rest“
  const ohneName = ziel && t.startsWith(`${ziel}: `) ? t.slice(ziel.length + 2) : t.replace(/^[^:„"]{2,60}: /, "");
  const anf = (x: string) => (x.match(/[„"]([^“"]+)[“"]/) || [])[1] || "";
  const betrag = (t.match(/(\d[\d.]*,\d{2} €)/) || [])[1] || "";
  const rolle = (x: string) => x.replace(/\b([a-z_]+)\b/g, (r) => (/^(schueler|sprecher|stv_sprecher|stufenteam|kassenwart|admin|eltern)$/.test(r) ? rolleName(r) : r));
  // erster Buchstabe groß, kein Satzpunkt
  const kurz = (x: string) => {
    const y = x.replace(/[.!]$/, "").trim();
    return y.charAt(0).toUpperCase() + y.slice(1);
  };
  const recht = (k: string) => PERM_CATEGORIES.flatMap((c) => c.perms).find((p) => p.key === k)?.label || k;

  switch (z.aktion) {
    case "beitrag.geaendert":
      return { name: ziel, was: kurz(ohneName.replace(/^Beitrag /, "")) };
    case "einstellungen.geaendert":
      return { name: "Einstellungen", was: t.replace(/^Einstellungen geändert: /, "") };
    case "eltern.verknuepft":
      return { name: ziel, was: `Elternzugang verknüpft${anf(t) ? ` · ${anf(t)}` : ""}` };
    case "eltern.geloest":
      return { name: ziel, was: `Elternzugang gelöst${anf(t) ? ` · ${anf(t)}` : ""}` };
    case "kasse.gebucht":
      return { name: ziel || "Kasse", was: `Buchung ${betrag}`.trim() };
    case "kasse.geloescht":
      return { name: ziel || "Kasse", was: `Buchung gelöscht ${betrag}`.trim() };
    case "komitee.vorsitz":
      return { name: ziel, was: `Vorsitz ${anf(t)}`.trim() };
    case "komitee.vorsitz_weg":
      return { name: ziel, was: `Vorsitz ${anf(t)} abgegeben`.replace("  ", " ") };
    case "komitee.zugeteilt":
      return { name: ziel, was: `Komitee ${anf(t)}`.trim() };
    case "komitee.entfernt":
      return { name: ziel, was: `Komitee ${anf(t)} verlassen`.replace("  ", " ") };
    case "konto.erstellt": {
      const r = (t.match(/Rolle: ([a-z_]+)/) || [])[1];
      return { name: ziel || anf(t), was: `Zugang angelegt${r ? ` · ${rolleName(r)}` : ""}` };
    }
    case "konto.geloescht":
      return { name: ziel || anf(t), was: "Zugang gelöscht" };
    case "konto.verknuepft":
      return { name: ziel, was: "Verknüpfung geändert" };
    case "passwort.zurueckgesetzt":
      return { name: ziel, was: "Passwort zurückgesetzt" };
    case "passwort.geaendert":
      return { name: ziel, was: "Passwort geändert" };
    case "person.angelegt":
      return { name: ziel || anf(t), was: "Person angelegt" };
    case "mithilfe.geloescht":
      return { name: ziel, was: `Mithilfe gelöscht · ${anf(t)}${(t.match(/ (\+\d+ %)/) || [])[1] ? ` ${(t.match(/ (\+\d+ %)/) || [])[1]}` : ""}` };
    case "mithilfe.geaendert":
      return { name: ziel, was: kurz(ohneName.replace(/^Mithilfe /, "Mithilfe: ")) };
    case "rolle.geaendert":
      return { name: ziel, was: rolle(ohneName) };
    case "recht.geaendert":
      return {
        name: ziel ? rolle(ziel) : "Rechte",
        was: kurz(ohneName.replace(/^Recht [„"]([^“"]+)[“"]/, (_m, k: string) => recht(k))),
      };
  }
  // alles andere: Name vorne, Rest kurz
  return { name: ziel || z.akteur_name || "System", was: kurz(ohneName) };
}

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
  const kopf = ["Zeitpunkt", "Name", "Was", "Von", "Bereich"];
  const zeile = (w: string[]) => w.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";");
  const text = [
    zeile(kopf),
    ...zeilen.map((z) => {
      const k = protokollKurz(z);
      return zeile([zeitpunktDe(z.at), k.name, k.was, z.akteur_name || "System", z.bereich]);
    }),
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
