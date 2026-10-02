// Supabase Edge Function "assistent" – Nachträge im Chat mit dem Stufenteam.
//
// Die App ruft sie nach jeder eigenen Nachricht in einer „Frage ans
// Stufenteam“ auf: POST { item_id } mit Anmeldung.
//
// Ablauf (siehe auch regeln.ts):
//   1. Prüfen: Ticket, eigene Nachricht, keine Eltern, Testphase freigeschaltet
//      (ki_freigeschaltet), Einwilligung, Assistent im Admin-Bereich an.
//      Fehlt etwas → nichts tun, das Team antwortet wie bisher.
//   2. Einschätzen über begrenzte Fragen: Absicht, gemeinte Schicht (aus
//      einer festen Liste aus der Datenbank). Mit Jev-Schlüssel macht das Jev
//      und schätzt zusätzlich ein, wie stimmig die Angaben sind (kann den Wert
//      nur senken). Ohne Jev-Schlüssel ordnet Claude ein – ohne „stimmig“,
//      der Wert kommt dann nur aus der Bilanz.
//   3. Bei „Mithilfe nachtragen“ + sicherer Schicht: anwesenheit_melden_fuer
//      in der Datenbank. Die trägt NUR automatisch ein, wenn die Person
//      eingeteilt war und ihr Score über der Schwelle liegt – sonst offen.
//   4. Antwort: feste Bestätigung, oder Claude formuliert eine Rückfrage im
//      Stil des Stufenteams, oder nur ein Vorschlag fürs Team.
//
// Was an Claude geht: der Text der Nachricht (eigene Namen → „Person“, Namen
// anderer aus der Stufe → „[Name]“), Titel/Datum/Uhrzeit möglicher Schichten.
// Nur mit Jev zusätzlich an Jev: frühere eigene Nachrichten an das Stufenteam
// (60 Tage, ebenso ohne Namen) und die Bilanz als zwei Zahlen. Keine
// Kennungen, nichts aus Gruppenchats, nichts von Eltern.
//
// Deploy: supabase functions deploy assistent   (JWT-Prüfung bleibt an)
// Secrets: ANTHROPIC_API_KEY (reicht). Optional später TYPESAFE_API_KEY oder
// OPENROUTER_API_KEY für Jev – vorher Datenschutzerklärung + Einwilligung
// anpassen (neue Version), siehe docs/DATENSCHUTZ.md.

import { createClient } from "npm:@supabase/supabase-js@2";
import { jevFragen, jevWeg, leseScore, leseWahl, type Frage } from "./jev.ts";
import { frageClaude, ordneEin, type ClaudeAusgabe } from "./claude.ts";
import {
  antwortNachMelden, aufEins, ausClaude, entscheide, pseudonymisiere, schichtText,
  type Antwort, type DbErgebnis, type Einschaetzung,
} from "./regeln.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, "content-type": "application/json" } });

const URL_BASIS = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_BASIS, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STIMMIG_STUFEN = [
  "Widersprüchlich: die Angaben passen nicht zusammen oder nicht zu früheren Nachrichten",
  "Eher zweifelhaft: vage, ausweichend oder mit Ungereimtheiten",
  "Unauffällig: nichts spricht dagegen, aber wenig Konkretes",
  "Stimmig und konkret: nachvollziehbare Angaben, die zueinander passen",
];

interface Kandidat {
  termin_id: string;
  titel: string;
  icon: string | null;
  datum: string;
  von: string | null;
  bis: string | null;
  eingeteilt: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  // ---- Wer fragt? -----------------------------------------------------------
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: wer } = await admin.auth.getUser(jwt);
  const uid = wer?.user?.id;
  if (!uid) return json({ error: "Bitte anmelden." }, 401);
  const { item_id } = (await req.json().catch(() => ({}))) as { item_id?: string };
  if (!item_id || !/^[0-9a-f-]{36}$/i.test(item_id)) return json({ error: "item_id fehlt" }, 400);

  // ---- Darf der Assistent hier überhaupt etwas tun? -------------------------
  const { data: it } = await admin.from("topic_items")
    .select("id, topic_id, type, body, created_by, created_at").eq("id", item_id).maybeSingle();
  if (!it || it.created_by !== uid || it.type !== "nachricht") return json({ ok: true, still: "keine eigene Nachricht" });
  const { data: tp } = await admin.from("topics").select("id, kind, created_by").eq("id", it.topic_id).maybeSingle();
  if (!tp || tp.kind !== "ticket" || tp.created_by !== uid) return json({ ok: true, still: "kein eigenes Ticket" });

  const { data: ich } = await admin.from("profiles")
    .select("user_id, username, role, student_id").eq("user_id", uid).maybeSingle();
  if (!ich || ich.role === "eltern") return json({ ok: true, still: "Elternzugang" });

  const [{ data: frei }, { data: einw }, { data: einst }] = await Promise.all([
    admin.rpc("ki_freigeschaltet", { uid }),
    admin.from("ki_einwilligung").select("ja").eq("user_id", uid).maybeSingle(),
    admin.from("ki_einstellungen").select("assistent_an, stil").eq("id", 1).maybeSingle(),
  ]);
  if (!frei) return json({ ok: true, still: "Testphase – nicht freigeschaltet" });
  if (!einw?.ja) return json({ ok: true, still: "keine Einwilligung" });
  if (!einst?.assistent_an) return json({ ok: true, still: "Assistent aus" });
  if (!Deno.env.get("ANTHROPIC_API_KEY") && !jevWeg()) return json({ ok: true, still: "kein KI-Schlüssel" });

  // Jede Nachricht genau einmal (zwei Aufrufe gleichzeitig: einer gewinnt).
  const { error: doppelt } = await admin.from("assistent_vorschlaege").insert({
    item_id, topic_id: tp.id, user_id: uid, student_id: ich.student_id, ergebnis: "laeuft",
  });
  if (doppelt) return json({ ok: true, still: "schon bearbeitet" });

  const ergebnis = await bearbeite({
    jwt, uid, studentId: ich.student_id, username: ich.username || "", text: String(it.body || ""),
    topicId: tp.id, itemId: item_id, stil: String(einst.stil || ""),
  }).catch((e) => {
    console.log("assistent: Fehler", (e as Error)?.message);
    return { ergebnis: "fehler", absicht: "sonstiges", termin_id: null, antwort: null, vorschlag: "Der Assistent hatte einen Fehler – bitte selbst antworten.", sql: null };
  });

  await admin.from("assistent_vorschlaege").update({
    ergebnis: ergebnis.ergebnis,
    absicht: ergebnis.absicht,
    termin_id: ergebnis.termin_id,
    antwort: ergebnis.antwort,
    vorschlag: ergebnis.vorschlag,
    sql_vorschlag: ergebnis.sql,
    // Automatisch erledigt: nichts mehr für das Team zu tun.
    status: ergebnis.ergebnis === "auto" ? "erledigt" : "offen",
  }).eq("item_id", item_id);

  return json({ ok: true, ergebnis: ergebnis.ergebnis });
});

interface Lage {
  jwt: string;
  uid: string;
  studentId: string | null;
  username: string;
  text: string;
  topicId: string;
  itemId: string;
  stil: string;
}

interface Ergebnis {
  ergebnis: "auto" | "rueckfrage" | "team" | "fehler";
  absicht: string;
  termin_id: string | null;
  antwort: string | null;
  vorschlag: string | null;
  sql: string | null;
}

async function bearbeite(l: Lage): Promise<Ergebnis> {
  // ---- Namen für die Pseudonymisierung -------------------------------------
  const namen = [l.username, ...l.username.split(/[._-]/)];
  if (l.studentId) {
    const { data: s } = await admin.from("students").select("vorname, nachname").eq("id", l.studentId).maybeSingle();
    if (s) namen.push(s.vorname, s.nachname, ...String(s.vorname).split(/\s+/), ...String(s.nachname).split(/\s+/));
  }
  const { data: pp } = await admin.from("public_profiles").select("anzeigename").eq("user_id", l.uid).maybeSingle();
  if (pp?.anzeigename) namen.push(pp.anzeigename, ...String(pp.anzeigename).split(/\s+/));
  // Namen aller anderen aus der Stufe („ich war mit Lena da“) – die gehen auch nicht raus.
  const [{ data: alle }, { data: anzeige }] = await Promise.all([
    admin.from("students").select("vorname, nachname"),
    admin.from("public_profiles").select("anzeigename"),
  ]);
  const andere: string[] = [];
  for (const s of (alle || []) as { vorname: string | null; nachname: string | null }[]) {
    for (const n of [s.vorname, s.nachname]) if (n) andere.push(n, ...String(n).split(/[\s-]+/));
  }
  for (const a of (anzeige || []) as { anzeigename: string | null }[]) {
    if (a.anzeigename) andere.push(a.anzeigename, ...String(a.anzeigename).split(/\s+/));
  }
  const ohneNamen = (t: string) => pseudonymisiere(t, namen, andere);
  const nachricht = ohneNamen(l.text).slice(0, 2000);

  const { data: kand } = await admin.rpc("assistent_kandidaten", { uid: l.uid });
  const kandidaten = ((kand || []) as Kandidat[]).slice(0, 40);
  const schluessel = new Map(kandidaten.map((k, i) => [`s${i + 1}`, k]));
  const texte = new Map([...schluessel].map(([key, k]) => [key, schichtText(k)]));

  // ---- Jev (nur mit Schlüssel) --------------------------------------------------
  let jev: Einschaetzung | null = null;
  if (jevWeg()) {
    // Frühere eigene Nachrichten an das Stufenteam (nur Tickets, nur eigene, 60 Tage).
    const { data: tickets } = await admin.from("topics").select("id").eq("kind", "ticket").eq("created_by", l.uid);
    const ticketIds = (tickets || []).map((t: { id: string }) => t.id);
    const { data: frueher } = ticketIds.length
      ? await admin.from("topic_items").select("body, created_at")
        .in("topic_id", ticketIds).eq("created_by", l.uid).eq("type", "nachricht").neq("id", l.itemId)
        .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString())
        .order("created_at", { ascending: false }).limit(20)
      : { data: [] };
    const { data: v } = await admin.from("vertrauen").select("bestaetigt, falsch").eq("user_id", l.uid).maybeSingle();
    const state = JSON.stringify({
      neue_nachricht: nachricht,
      fruehere_nachrichten_ans_stufenteam: (frueher || []).map((m: { body: string }) => ohneNamen(String(m.body)).slice(0, 500)),
      bilanz_frueherer_angaben: { vom_team_bestaetigt: v?.bestaetigt ?? 0, vom_team_als_falsch_markiert: v?.falsch ?? 0 },
      moegliche_schichten: [...schluessel].map(([key, k]) => ({ key, schicht: texte.get(key), eingeteilt: k.eingeteilt })),
    });
    const fragen: Record<string, Frage> = {
      absicht: {
        type: "choice",
        instructions: "Worum bittet die Person in `neue_nachricht` das Stufenteam?",
        criteria: {
          mithilfe_nachtrag: "Sie sagt, sie war bei einer Aktion oder Schicht dabei (z. B. Waffelverkauf), und möchte das als Mithilfe eingetragen bekommen",
          zahlung: "Es geht um Beiträge, Bezahlen, Überweisen oder Kontodaten",
          termin: "Es geht um künftige Termine oder Schichten, Einteilung, Tauschen, Absagen",
          sonstiges: "Etwas anderes, oder nicht erkennbar",
        },
      },
      stimmig: {
        type: "score",
        instructions:
          "Wie stimmig sind die Angaben in `neue_nachricht` – für sich, im Vergleich zu `fruehere_nachrichten_ans_stufenteam` und zur `bilanz_frueherer_angaben`?",
        criteria: STIMMIG_STUFEN,
      },
    };
    if (schluessel.size) {
      fragen.schicht = {
        type: "choice",
        instructions: "Welche der `moegliche_schichten` meint die Person in `neue_nachricht`?",
        criteria: {
          ...Object.fromEntries([...texte].map(([key, t]) => [key, t])),
          keine_passt: "Keine dieser Schichten, oder die Nachricht nennt keine bestimmte",
        },
      };
    }
    try {
      const a = await jevFragen(state, fragen);
      const absicht = leseWahl(a, "absicht");
      const s = leseScore(a, "stimmig");
      if (absicht) {
        jev = {
          absicht,
          schicht: schluessel.size ? leseWahl(a, "schicht") : null,
          stimmig: s ? { wert: aufEins(s.score, STIMMIG_STUFEN.length), sicherheit: s.sicherheit } : null,
        };
      }
    } catch (e) {
      console.log("Jev-Fehler (→ Claude):", (e as Error)?.message);
    }
  }

  // ---- Ohne Jev (oder Jev ausgefallen): Claude ordnet ein ------------------------
  // Nur Anliegen und Schicht – kein „stimmig“, der Wert bleibt reine Bilanz.
  const einschaetzung: Einschaetzung | null = jev ?? await ordneEin(nachricht, texte)
    .then((c) => (c ? ausClaude(c, schluessel.size > 0) : null));

  // Jev-Einschätzung speichern, BEVOR eingetragen wird: ein deutlicher Zweifel
  // soll den Auto-Eintrag dieser Nachricht schon verhindern (vertrauen_wert).
  if (jev?.stimmig) {
    await admin.rpc("vertrauen_jev_setzen", { uid: l.uid, p_wert: jev.stimmig.wert, p_sicherheit: jev.stimmig.sicherheit });
  }

  // ---- Regeln -------------------------------------------------------------------
  const schritt = entscheide(einschaetzung);
  const absicht = einschaetzung?.absicht.wahl ?? "sonstiges";

  if (schritt.art === "team") {
    const c = await frageClaude(l.stil, nachricht, {
      art: "nur_team",
      absicht: { zahlung: "Beiträge/Bezahlen", termin: "Termine/Schichten", mithilfe_nachtrag: "Mithilfe nachtragen", sonstiges: "etwas anderes" }[absicht] || "etwas anderes",
    });
    return { ergebnis: schritt.grund === "ki_fehler" ? "fehler" : "team", absicht, termin_id: null, antwort: null, vorschlag: c?.vorschlag_fuers_team ?? null, sql: mitIds(c, l, null) };
  }

  if (schritt.art === "rueckfrage") {
    const c = await frageClaude(l.stil, nachricht, { art: "rueckfrage_schicht", schichten: [...texte.values()].slice(0, 6) });
    if (c?.antwort_an_person) await schreibe(l, c.antwort_an_person);
    return { ergebnis: "rueckfrage", absicht, termin_id: null, antwort: c?.antwort_an_person ?? null, vorschlag: c?.vorschlag_fuers_team ?? "Unklar, welche Schicht gemeint ist.", sql: null };
  }

  // schritt.art === "melden"
  const k = schluessel.get(schritt.terminKey);
  if (!k) return { ergebnis: "team", absicht, termin_id: null, antwort: null, vorschlag: "Schicht nicht gefunden – bitte selbst prüfen.", sql: null };
  const { data: db, error } = await admin.rpc("anwesenheit_melden_fuer", { tid: k.termin_id, uid: l.uid });
  if (error) {
    console.log("anwesenheit_melden_fuer:", error.message);
    return { ergebnis: "fehler", absicht, termin_id: k.termin_id, antwort: null, vorschlag: `Konnte nicht eintragen: ${error.message}`, sql: null };
  }
  const schicht = texte.get(schritt.terminKey) || k.titel;
  const antwort: Antwort = antwortNachMelden(db as DbErgebnis, einschaetzung?.stimmig ?? null, schicht);
  let text: string | null = null;
  let vorschlag: string | null = null;
  if (antwort.art === "fest") text = antwort.text;
  if (antwort.art === "rueckfrage") {
    const c = await frageClaude(l.stil, nachricht, { art: "rueckfrage_zweifel", schicht });
    text = c?.antwort_an_person ?? `Danke! Das Stufenteam schaut sich ${schicht} noch kurz an.`;
    vorschlag = c?.vorschlag_fuers_team ?? null;
  }
  if (text) await schreibe(l, text);
  if (antwort.teamFragen) await teamFragen(l.jwt, schicht, k.eingeteilt);
  return {
    ergebnis: db === "auto" ? "auto" : antwort.art === "rueckfrage" ? "rueckfrage" : "team",
    absicht,
    termin_id: k.termin_id,
    antwort: text,
    vorschlag: vorschlag ?? (db === "auto" ? `Automatisch eingetragen: ${schicht}.` : `Sagt: war bei ${schicht} – bitte in der Schicht-Übersicht bestätigen.`),
    sql: null,
  };
}

/** Platzhalter im SQL-Vorschlag erst hier füllen – Claude sieht keine Kennungen. */
function mitIds(c: ClaudeAusgabe | null, l: Lage, terminId: string | null): string | null {
  if (!c?.sql_vorschlag) return null;
  return c.sql_vorschlag
    .replaceAll("{{student_id}}", l.studentId ?? "<student_id>")
    .replaceAll("{{termin_id}}", terminId ?? "<termin_id>");
}

/** Antwort im Ticket – sichtbar als automatische Antwort (KI-Verordnung Art. 50). */
async function schreibe(l: Lage, text: string) {
  const { error } = await admin.from("topic_items").insert({
    topic_id: l.topicId,
    type: "nachricht",
    title: "",
    body: text,
    author: "🤖 Assistent",
    author_role: "assistent",
    author_koms: null,
    created_by: null,
  });
  if (error) console.log("Antwort schreiben:", error.message);
}

/** Das Stufenteam einmal fragen – über send-push, mit der Anmeldung der Person. */
async function teamFragen(jwt: string, schicht: string, eingeteilt: boolean) {
  try {
    await fetch(`${URL_BASIS}/functions/v1/send-push`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({
        an_team: true,
        title: "🙋 Mithilfe bestätigen?",
        body: `Jemand sagt: war bei ${schicht}${eingeteilt ? "" : " (nicht eingeteilt)"}. Bitte kurz prüfen.`,
        url: "./#events",
      }),
    });
  } catch {
    /* Push ist nett, aber nicht nötig – die Angabe steht in der Übersicht */
  }
}
