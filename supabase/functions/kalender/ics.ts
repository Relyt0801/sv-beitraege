// iCalendar (RFC 5545) schreiben und lesen – ohne Abhängigkeiten.
//
// Wird an zwei Stellen benutzt:
//   * in der Edge Function "kalender" (Deno): Abo-Kalender erzeugen und fremde
//     Kalender (iCloud, Google, Outlook) lesen
//   * in der App (Vite): einen einzelnen Termin als .ics zum Übernehmen
//
// Termine der Stufe haben Datum und Uhrzeit ohne Zeitzone ("14:00 ist 14:00").
// Im Kalender stehen sie deshalb mit TZID=Europe/Berlin – so zeigt das Handy
// sie richtig an, auch nach der Zeitumstellung.

export interface IcsTermin {
  id: string;
  titel: string;
  beschreibung?: string | null;
  ort?: string | null;
  /** "2026-09-24" */
  datum: string;
  bis_datum?: string | null;
  /** "14:00" oder "14:00:00"; null = ganztägig */
  von?: string | null;
  bis?: string | null;
  icon?: string | null;
  created_at?: string | null;
}

/** Ein Termin aus einem fremden Kalender, so weit die App ihn braucht. */
export interface FremderTermin {
  uid: string;
  titel: string;
  ort: string;
  datum: string;
  bis_datum: string | null;
  von: string | null;
  bis: string | null;
}

const ZONE = "Europe/Berlin";

// Sommerzeit wie in der EU: letzter Sonntag im März bis letzter Sonntag im Oktober.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// ------------------------------------------------------------------ Schreiben

/** Text für ein iCal-Feld: Backslash, Semikolon, Komma und Zeilenumbrüche escapen. */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen länger als 75 Byte umbrechen (Folgezeilen beginnen mit Leerzeichen). */
function falten(zeile: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(zeile).length <= 75) return zeile;
  const teile: string[] = [];
  let aktuell = "";
  for (const zeichen of zeile) {
    const grenze = teile.length === 0 ? 75 : 74; // Folgezeilen: 1 Byte fürs Leerzeichen
    if (bytes.encode(aktuell + zeichen).length > grenze) {
      teile.push(aktuell);
      aktuell = zeichen;
    } else aktuell += zeichen;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}

const nurZiffern = (s: string) => s.replace(/[^0-9]/g, "");
const datumWert = (key: string) => nurZiffern(key).slice(0, 8);
const zeitWert = (t: string) => (nurZiffern(t) + "0000").slice(0, 4) + "00";

function naechsterTag(key: string): string {
  const [j, m, t] = key.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + 1));
  return d.toISOString().slice(0, 10);
}

function utcStempel(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function vevent(t: IcsTermin, domain: string, jetzt: Date): string[] {
  const titel = `${t.icon ? t.icon + " " : ""}${t.titel || "Termin"}`;
  const zeilen = ["BEGIN:VEVENT", `UID:${t.id}@${domain}`, `DTSTAMP:${utcStempel(jetzt)}`];
  if (t.created_at) zeilen.push(`CREATED:${utcStempel(new Date(t.created_at))}`);
  const ende = t.bis_datum || t.datum;
  if (!t.von) {
    // Ganztägig: DTEND ist der Tag NACH dem letzten Tag (so will es der Standard).
    zeilen.push(`DTSTART;VALUE=DATE:${datumWert(t.datum)}`);
    zeilen.push(`DTEND;VALUE=DATE:${datumWert(naechsterTag(ende))}`);
  } else {
    zeilen.push(`DTSTART;TZID=${ZONE}:${datumWert(t.datum)}T${zeitWert(t.von)}`);
    // Ohne Ende: eine Stunde, damit der Termin im Kalender sichtbar Platz hat.
    const bis = t.bis || plusStunde(t.von);
    const endTag = t.bis ? ende : bis < t.von ? naechsterTag(ende) : ende;
    zeilen.push(`DTEND;TZID=${ZONE}:${datumWert(endTag)}T${zeitWert(bis)}`);
  }
  zeilen.push(`SUMMARY:${icsText(titel)}`);
  if (t.ort) zeilen.push(`LOCATION:${icsText(t.ort)}`);
  if (t.beschreibung) zeilen.push(`DESCRIPTION:${icsText(t.beschreibung)}`);
  zeilen.push("END:VEVENT");
  return zeilen;
}

function plusStunde(von: string): string {
  const [h, m] = von.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

/** Ganzer Kalender (für das Abo) oder ein einzelner Termin (zum Übernehmen). */
export function kalenderIcs(
  termine: IcsTermin[],
  { name = "Stufenkasse", domain = "sv-beitraege", jetzt = new Date() }: { name?: string; domain?: string; jetzt?: Date } = {},
): string {
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stufenkasse//Termine//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`,
    `X-WR-TIMEZONE:${ZONE}`,
    // Wie oft Kalender-Apps nachsehen sollen (manche halten sich daran).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const t of termine) zeilen.push(...vevent(t, domain, jetzt));
  zeilen.push("END:VCALENDAR");
  return zeilen.map(falten).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ Lesen

interface Eigenschaft {
  name: string;
  params: Record<string, string>;
  wert: string;
}

function entfalten(ics: string): string[] {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function zerlege(zeile: string): Eigenschaft | null {
  // NAME;PARAM=WERT;PARAM2="x:y":WERT – der erste Doppelpunkt außerhalb von Anführungszeichen trennt.
  let inQuote = false;
  let trenn = -1;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) {
      trenn = i;
      break;
    }
  }
  if (trenn < 0) return null;
  const kopf = zeile.slice(0, trenn).split(";");
  const params: Record<string, string> = {};
  for (const p of kopf.slice(1)) {
    const [k, ...v] = p.split("=");
    params[k.toUpperCase()] = v.join("=").replace(/^"|"$/g, "");
  }
  return { name: kopf[0].toUpperCase(), params, wert: zeile.slice(trenn + 1) };
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** Versatz einer Zeitzone zu UTC in Minuten, zu einem bestimmten Zeitpunkt. */
function versatz(zone: string, zeitpunkt: Date): number {
  try {
    const teile = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(zeitpunkt);
    const w = (typ: string) => Number(teile.find((x) => x.type === typ)?.value);
    const alsUtc = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour") % 24, w("minute"), w("second"));
    return Math.round((alsUtc - zeitpunkt.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Wanduhr in einer Zeitzone: Datum und Uhrzeit ("HH:MM:SS") zu einem UTC-Zeitpunkt. */
function inZone(d: Date, zone: string): { datum: string; zeit: string } {
  const iso = new Date(d.getTime() + versatz(zone, d) * 60000).toISOString();
  return { datum: iso.slice(0, 10), zeit: iso.slice(11, 19) };
}

/** UTC-Zeitpunkt zu einer Wanduhrzeit in einer Zeitzone. */
function zoneZuUtc(datum: string, zeit: string, zone: string): Date {
  const naiv = Date.parse(`${datum}T${zeit}Z`);
  const erst = naiv - versatz(zone, new Date(naiv)) * 60000;
  return new Date(naiv - versatz(zone, new Date(erst)) * 60000);
}

function berlin(d: Date): { datum: string; zeit: string } {
  const w = inZone(d, ZONE);
  return { datum: w.datum, zeit: w.zeit.slice(0, 5) };
}

interface Zeitpunkt {
  datum: string;
  /** null = ganztägig */
  zeit: string | null;
  utc: Date;
  /** Zone, in der die Wanduhr des Termins läuft (für Wiederholungen). */
  zone: string;
}

/** DTSTART/DTEND lesen: ganztägig, UTC ("Z"), mit TZID oder "schwebend". */
function zeitpunkt(e: Eigenschaft): Zeitpunkt {
  const w = e.wert.trim();
  const d = w.slice(0, 8);
  const datum = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (e.params.VALUE === "DATE" || w.length === 8) {
    return { datum, zeit: null, utc: new Date(`${datum}T00:00:00Z`), zone: "UTC" };
  }
  const zeit = `${w.slice(9, 11)}:${w.slice(11, 13)}:${w.slice(13, 15) || "00"}`;
  // TZID (z. B. "Europe/Berlin", bei Outlook auch "W. Europe Standard Time")
  // – unbekannte Namen und schwebende Zeiten gelten als Berliner Zeit.
  const zone = w.endsWith("Z") ? "UTC" : e.params.TZID && /\//.test(e.params.TZID) ? e.params.TZID : ZONE;
  const utc = zoneZuUtc(datum, zeit, zone);
  const b = berlin(utc);
  return { datum: b.datum, zeit: b.zeit, utc, zone };
}

const TAGE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function plusTageKey(key: string, n: number): string {
  const [j, m, t] = key.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10);
}
function plusMonateKey(key: string, n: number): string | null {
  const [j, m, t] = key.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + n, t));
  // 31. in einem kürzeren Monat: laut Standard fällt das Vorkommen aus
  return d.getUTCDate() === t ? d.toISOString().slice(0, 10) : null;
}
const wochentag = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

/**
 * Fremden Kalender lesen und die Termine im Zeitraum [von, bis] liefern.
 * Wiederholungen (RRULE) werden für die üblichen Fälle ausgerollt: täglich,
 * wöchentlich (auch an mehreren Wochentagen), monatlich, jährlich, mit
 * INTERVAL, COUNT und UNTIL; EXDATE und geänderte Einzeltermine
 * (RECURRENCE-ID) werden berücksichtigt. Gerechnet wird in der Wanduhr des
 * Termins – ein wöchentlicher Termin um 14:00 bleibt auch nach der
 * Zeitumstellung um 14:00.
 */
export function leseIcs(ics: string, von: string, bis: string, maxAnzahl = 2000): FremderTermin[] {
  const zeilen = entfalten(ics);
  const ergebnis: FremderTermin[] = [];
  const events: Eigenschaft[][] = [];
  let aktuell: Eigenschaft[] | null = null;
  for (const z of zeilen) {
    if (z === "BEGIN:VEVENT") aktuell = [];
    else if (z === "END:VEVENT") {
      if (aktuell) events.push(aktuell);
      aktuell = null;
    } else if (aktuell) {
      const e = zerlege(z);
      if (e) aktuell.push(e);
    }
  }
  // Einzeln geänderte Vorkommen einer Serie: an diesen Tagen gilt die Ausnahme.
  const geaendert = new Map<string, Set<string>>();
  for (const ev of events) {
    const rid = ev.find((e) => e.name === "RECURRENCE-ID");
    if (!rid) continue;
    const uid = ev.find((e) => e.name === "UID")?.wert || "";
    const set = geaendert.get(uid) || new Set<string>();
    set.add(zeitpunkt(rid).datum);
    geaendert.set(uid, set);
  }

  for (const ev of events) {
    if (ergebnis.length >= maxAnzahl) break;
    const hole = (n: string) => ev.find((e) => e.name === n);
    const start = hole("DTSTART");
    if (!start) continue;
    if ((hole("STATUS")?.wert || "").toUpperCase() === "CANCELLED") continue;
    const uid = hole("UID")?.wert || `${hole("SUMMARY")?.wert}-${start.wert}`;
    const titel = unescapeText(hole("SUMMARY")?.wert || "(ohne Titel)");
    const ort = unescapeText(hole("LOCATION")?.wert || "");
    const s = zeitpunkt(start);
    const endeE = hole("DTEND");
    const dauerMs = endeE
      ? Math.max(0, zeitpunkt(endeE).utc.getTime() - s.utc.getTime())
      : hole("DURATION") ? dauerAus(hole("DURATION")!.wert) : s.zeit ? 3600000 : 86400000;
    const ausnahmen = new Set<string>();
    for (const e of ev.filter((x) => x.name === "EXDATE")) {
      for (const teil of e.wert.split(",")) ausnahmen.add(zeitpunkt({ ...e, wert: teil }).datum);
    }

    const vorkommen = (utcStart: Date): FremderTermin | null => {
      const utcEnde = new Date(utcStart.getTime() + dauerMs);
      let datum: string, bisDatum: string, vonZ: string | null, bisZ: string | null;
      if (!s.zeit) {
        datum = utcStart.toISOString().slice(0, 10);
        // DTEND ist exklusiv: der Tag davor ist der letzte Tag
        bisDatum = new Date(utcEnde.getTime() - 86400000).toISOString().slice(0, 10);
        if (bisDatum < datum) bisDatum = datum;
        vonZ = null;
        bisZ = null;
      } else {
        const a = berlin(utcStart), b = berlin(utcEnde);
        datum = a.datum;
        bisDatum = b.zeit === "00:00" && b.datum > a.datum ? plusTageKey(b.datum, -1) : b.datum;
        vonZ = a.zeit;
        bisZ = b.zeit;
      }
      if (bisDatum < von || datum > bis) return null;
      return { uid, titel, ort, datum, bis_datum: bisDatum !== datum ? bisDatum : null, von: vonZ, bis: bisZ };
    };

    const rrule = hole("RRULE");
    if (!rrule || hole("RECURRENCE-ID")) {
      const t = vorkommen(s.utc);
      if (t) ergebnis.push(t);
      continue;
    }

    const regel: Record<string, string> = {};
    for (const teil of rrule.wert.split(";")) {
      const [k, v] = teil.split("=");
      if (k) regel[k.toUpperCase()] = v ?? "";
    }
    const freq = regel.FREQ;
    const intervall = Math.max(1, Number(regel.INTERVAL) || 1);
    const anzahl = regel.COUNT ? Number(regel.COUNT) : Infinity;
    const bisRegel = regel.UNTIL ? zeitpunkt({ name: "UNTIL", params: {}, wert: regel.UNTIL }).utc : null;
    const byday = (regel.BYDAY || "").split(",").map((x) => x.replace(/^[+-]?\d+/, "")).filter(Boolean);
    const geaenderteTage = geaendert.get(uid) || new Set<string>();

    // Wanduhr des Starts in der Zone des Termins – darin wird weitergezählt.
    const wand = s.zeit ? inZone(s.utc, s.zone) : { datum: s.datum, zeit: "00:00:00" };
    const utcVon = (key: string) => (s.zeit ? zoneZuUtc(key, wand.zeit, s.zone) : new Date(`${key}T00:00:00Z`));
    const grenze = plusTageKey(bis, 1);
    let gezaehlt = 0;
    let fertig = false;
    const nimm = (key: string) => {
      const u = utcVon(key);
      if ((bisRegel && u > bisRegel) || gezaehlt >= anzahl || key > grenze) {
        fertig = true;
        return;
      }
      gezaehlt++;
      const tagBerlin = s.zeit ? berlin(u).datum : key;
      if (ausnahmen.has(tagBerlin) || geaenderteTage.has(tagBerlin)) return;
      const t = vorkommen(u);
      if (t) ergebnis.push(t);
    };

    // Serien ohne COUNT, die lange vor dem Zeitraum begonnen haben (tägliche
    // Erinnerung seit 2015): direkt kurz vor den Zeitraum springen, statt jeden
    // Tag seit damals durchzuzählen. Mit COUNT muss ab dem Start gezählt werden.
    let i0 = 0;
    if (anzahl === Infinity && (freq === "DAILY" || freq === "WEEKLY")) {
      const schritt = freq === "DAILY" ? intervall : 7 * intervall;
      const tage = Math.round((Date.parse(von) - Date.parse(wand.datum)) / 86400000);
      i0 = Math.max(0, Math.floor(tage / schritt) - 1);
    }
    // Höchstens 3000 Schritte ab dort – reicht für Jahre täglicher Termine.
    for (let i = i0; i < i0 + 3000 && !fertig && ergebnis.length < maxAnzahl; i++) {
      if (freq === "DAILY") nimm(plusTageKey(wand.datum, i * intervall));
      else if (freq === "WEEKLY") {
        const basis = plusTageKey(wand.datum, i * 7 * intervall);
        if (!byday.length) nimm(basis);
        else {
          const wtStart = wochentag(basis);
          const plus = byday.map((d) => TAGE.indexOf(d)).filter((d) => d >= 0)
            .map((d) => (d - wtStart + 7) % 7).sort((a, b) => a - b);
          for (const p of plus) {
            nimm(plusTageKey(basis, p));
            if (fertig) break;
          }
        }
      } else if (freq === "MONTHLY") {
        const key = plusMonateKey(wand.datum, i * intervall);
        if (key) nimm(key);
      } else if (freq === "YEARLY") {
        const key = plusMonateKey(wand.datum, i * 12 * intervall);
        if (key) nimm(key);
      } else break;
    }
  }
  return ergebnis.sort((a, b) => (a.datum + (a.von || "")).localeCompare(b.datum + (b.von || "")));
}

/** "PT1H30M", "P1D" → Millisekunden */
function dauerAus(w: string): number {
  const m = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/.exec(w);
  const [wo, ta, st, mi, se] = [1, 2, 3, 4, 5].map((i) => Number(m?.[i]) || 0);
  return ((((wo * 7 + ta) * 24 + st) * 60 + mi) * 60 + se) * 1000;
}
