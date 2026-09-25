// Lasttest: viele Personen öffnen gleichzeitig die App.
//
// Jede simulierte Person schickt die ~22 Lese-Anfragen, die die App beim Start
// stellt – NUR LESEND, es wird nichts geändert. Läuft gegen die echte
// Datenbank, also nicht gerade dann starten, wenn die ganze Stufe online ist.
//
// Aufruf (Projektordner):
//   TEST_EMAIL=… TEST_PASSWORT=… node tests/last-test.mjs
// Optional: STUFEN="25x25,50x50,130x60,260x60"  (Personen x Verbindungen)
import { datenbank, anmelden, pflicht, neueVerbindungen, verbindungenSchliessen } from './_umgebung.mjs';
import { fetch as ufetch } from 'undici';

const db = datenbank();
const token = await anmelden(db, pflicht('TEST_EMAIL'), pflicht('TEST_PASSWORT'));

const START = [
  'students?select=*', 'app_settings?select=*', 'contributions?select=*', 'contribution_templates?select=*',
  'topics?select=*', 'topic_items?select=*&order=created_at.desc&limit=500', 'topic_members?select=*', 'topic_tags?select=*',
  'tag_members?select=*', 'topic_reads?select=*', 'events?select=*', 'termine?select=*', 'aktionen?select=*',
  'profiles?select=user_id,username,role,student_id,has_logged_in,must_change_password,chat_banned_until',
  'public_profiles?select=*', 'parent_children?select=*', 'kasse_buchungen?select=*', 'eltern_infos?select=*',
  'eltern_tickets?select=*', 'role_permissions?select=*', 'user_permissions?select=*', 'komitee_vorsitz?select=*',
];
const quantil = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];

async function lauf(personen, verbindungen) {
  const agent = await neueVerbindungen(verbindungen);
  const zeiten = [];
  const fehler = {};
  const t0 = performance.now();
  await Promise.all(Array.from({ length: personen }, () => Promise.all(START.map(async (p) => {
    const s = performance.now();
    try {
      const r = await ufetch(`${db.url}/rest/v1/${p}`, { dispatcher: agent, headers: { apikey: db.key, authorization: 'Bearer ' + token } });
      await r.text();
      if (r.status !== 200) fehler['HTTP ' + r.status] = (fehler['HTTP ' + r.status] || 0) + 1;
    } catch (e) {
      const c = String(e.cause?.code || e.message);
      fehler[c] = (fehler[c] || 0) + 1;
    }
    zeiten.push(Math.round(performance.now() - s));
  }))));
  const dauer = (performance.now() - t0) / 1000;
  await agent.close();
  zeiten.sort((a, b) => a - b);
  return {
    personen, verbindungen, anfragen: zeiten.length, dauer_s: +dauer.toFixed(1), pro_s: Math.round(zeiten.length / dauer),
    p50_ms: quantil(zeiten, 0.5), p95_ms: quantil(zeiten, 0.95), max_ms: zeiten.at(-1), fehler,
  };
}

const stufen = (process.env.STUFEN || '25x25,50x50,130x60,260x60').split(',').map((s) => s.split('x').map(Number));
let fehlerGesamt = 0;
for (const [n, c] of stufen) {
  const e = await lauf(n, c);
  fehlerGesamt += Object.values(e.fehler).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify(e));
}
console.log(fehlerGesamt ? `\n!! ${fehlerGesamt} fehlgeschlagene Anfragen` : '\nkeine Fehler');
await verbindungenSchliessen();
process.exit(fehlerGesamt ? 1 : 0);
