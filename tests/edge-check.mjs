// Edge Functions gegen Missbrauch prüfen (send-push, person-anlegen, vapid-info).
//
// send-push läuft nur im Probelauf ("probe": zählt Empfänger, verschickt
// NICHTS). person-anlegen bekommt nur Aufrufe, die abgelehnt werden müssen –
// es wird keine Person angelegt.
//
// Aufruf (Projektordner):  node tests/edge-check.mjs
// Optional (sonst werden diese Fälle übersprungen):
//   TEST_EMAIL / TEST_PASSWORT       ein Admin-Testkonto
//   ELTERN_EMAIL / ELTERN_PASSWORT   ein Eltern-Testkonto
import { datenbank, anmelden, funktion, lesen, verbindungenSchliessen } from './_umgebung.mjs';

const db = datenbank();
const ZUFALL = '00000000-0000-4000-8000-000000000000';
const admin = process.env.TEST_EMAIL && process.env.TEST_PASSWORT ? await anmelden(db, process.env.TEST_EMAIL, process.env.TEST_PASSWORT) : null;
const eltern = process.env.ELTERN_EMAIL && process.env.ELTERN_PASSWORT ? await anmelden(db, process.env.ELTERN_EMAIL, process.env.ELTERN_PASSWORT) : null;

// Ein Schülerkonto als Ziel, das NICHT zur Finanzverwaltung gehört (die dürfen
// Eltern erreichen). Nur mit Admin-Zugang lesbar.
let schuelerId = null;
if (admin) {
  const [s, fv] = await Promise.all([
    lesen(db, 'profiles?select=user_id&role=eq.schueler&limit=100', admin),
    lesen(db, 'rpc/finanz_verwalter_ids', admin),
  ]);
  const verwalter = new Set(Array.isArray(fv.body) ? fv.body.map(String) : []);
  schuelerId = (Array.isArray(s.body) ? s.body : []).map((x) => x.user_id).find((u) => !verwalter.has(u)) ?? null;
}

const status = (...s) => (r) => s.includes(r.status);
const probe = (bed) => (r) => r.status === 200 && r.body?.probe === true && bed(r.body);

// [Name, braucht, Funktion, Körper, Konto, Prüfung, Erwartung in Worten]
const FAELLE = [
  ['ohne Anmeldung: an Team', null, 'send-push', { probe: true, an_team: true }, null, status(401), '401'],
  ['falscher Token', null, 'send-push', { probe: true, an_team: true }, 'kein.echter.token', status(401), '401'],
  ['ohne Anmeldung: Person anlegen', null, 'person-anlegen', { vorname: 'X', nachname: 'Y' }, null, status(401), '401'],
  ['vapid-info', null, 'vapid-info', {}, null, status(200), '200'],

  ['Eltern: Info-Push auslösen', 'eltern', 'send-push', { probe: true, eltern_info_id: ZUFALL }, eltern, status(403), '403'],
  ['Eltern: direkt an Schüler', 'eltern+admin', 'send-push', { probe: true, user_ids: [schuelerId], title: 'Spam' }, eltern, probe((b) => b.empfaenger === 0), '0 Empfänger'],
  ['Eltern: an_personen', 'eltern', 'send-push', { probe: true, an_personen: [{ student_id: ZUFALL, title: 'x', body: 'y' }] }, eltern, status(403), '403'],
  ['Eltern: fremdes/unbekanntes Event', 'eltern', 'send-push', { probe: true, event_id: ZUFALL }, eltern, status(403, 404), '403/404'],
  ['Eltern: an Team, Überlänge', 'eltern', 'send-push', { probe: true, an_team: true, title: 'x'.repeat(500), body: 'y'.repeat(900) }, eltern,
    probe((b) => (b.title || '').length <= 80 && (b.body || '').length <= 200), 'Titel ≤ 80, Text ≤ 200'],
  ['Eltern: Person anlegen', 'eltern', 'person-anlegen', { vorname: 'X', nachname: 'Y' }, eltern, status(403), '403'],

  ['Admin: Info-Push, unbekannte Info', 'admin', 'send-push', { probe: true, eltern_info_id: ZUFALL }, admin, status(404), '404'],
  ['Admin: Info-Push, kaputte Kennung', 'admin', 'send-push', { probe: true, eltern_info_id: 'nicht-uuid' }, admin, status(400, 404), '400/404'],
  ['Admin: 600 Empfänger (Deckel 500)', 'admin', 'send-push', { probe: true, user_ids: Array.from({ length: 600 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }, admin,
    probe((b) => b.empfaenger <= 500), '≤ 500 Empfänger'],
  ['Admin: kaputtes JSON (send-push)', 'admin', 'send-push', '{kaputt', admin, status(400, 404), '400/404'],
  ['Admin: Person ohne Namen', 'admin', 'person-anlegen', { vorname: '', nachname: '' }, admin, status(400), '400'],
  ['Admin: Person, Name 61 Zeichen', 'admin', 'person-anlegen', { vorname: 'A'.repeat(61), nachname: 'B'.repeat(61) }, admin, status(400), '400'],
  ['Admin: Person, kaputtes JSON', 'admin', 'person-anlegen', '{{{', admin, status(400), '400'],
];

let ok = 0, falsch = 0, uebersprungen = 0;
for (const [name, braucht, fn, body, token, pruefe, erwartung] of FAELLE) {
  const fehlt = (braucht?.includes('admin') && !admin) || (braucht?.includes('eltern') && !eltern) || (braucht === 'eltern+admin' && !schuelerId);
  if (fehlt) { uebersprungen++; console.log(`–    ${name.padEnd(38)} übersprungen (Testkonto fehlt)`); continue; }
  const r = await funktion(db, fn, body, token);
  const gut = pruefe(r);
  gut ? ok++ : falsch++;
  const kurz = (typeof r.body === 'object' ? JSON.stringify(r.body) : String(r.body)).slice(0, 110);
  console.log(`${gut ? 'ok  ' : '!!  '} ${name.padEnd(38)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)} ms  erwartet ${erwartung}${gut ? '' : '  → ' + kurz}`);
}
console.log(`\n${ok} ok / ${falsch} falsch / ${uebersprungen} übersprungen`);
await verbindungenSchliessen();
process.exit(falsch ? 1 : 0);
