// Stresstest der Oberfläche im Demo-Modus mit Massendaten (ohne Datenbank):
// 400 Personen mit extremen Namen (sehr lang, Sonderzeichen, Emoji, Bindestriche),
// 1.500 Chat-Nachrichten mit langen Texten und Links ohne Leerzeichen.
//
// Prüft: Startzeit, Reiterwechsel, Chat mit Hunderten Nachrichten, 20 schnelle
// Nachrichten + eine mit 5.000 Zeichen, Doppeltipp auf "Senden", Nachricht aus
// Leerzeichen, 60 schnelle Reiterwechsel, lange Blockaden (Long Tasks), Speicher –
// und dass dabei nie etwas seitlich übersteht oder ein Fehler auftritt.
//
// Vorbereitung wie bei ui-check.mjs (Demo-Build + Vorschau auf Port 4173), dann:
//   node tests/masse-check.mjs        (optional N=…, NACHRICHTEN=…)
import fs from 'node:fs';
import path from 'node:path';
import { browserStarten, DEMO_BASIS, ordner } from './_umgebung.mjs';

const N = Number(process.env.N || 400);
const NACHRICHTEN = Number(process.env.NACHRICHTEN || 1500);
const HJ = ['EF.1', 'EF.2', 'Q1.1', 'Q1.2', 'Q2.1', 'Q2.2'];
// Ausgedachte Namen, die Layouts gern sprengen
const vornamen = ['Anna-Lena Marie-Sophie', 'José', 'Zoë', 'Maximilian-Alexander', 'Li', 'Ömer', 'Jean-Baptiste', 'Ælfrida', 'Mia', 'Ben'];
const nachnamen = ['Wolfeschlegelsteinhausenbergerdorff', 'Ñúñez-García', 'von und zu Hohenzollern-Sigmaringen', 'Meyer-Lüdenscheidt', "O'Brien", 'Kowalczyk-Wiśniewska', '李', 'Nguyễn', 'Özdemir', 'Test 😀'];
const students = Array.from({ length: N }, (_, i) => ({
  id: `st-${i}`, nachname: nachnamen[i % nachnamen.length] + (i >= 10 ? ` ${i}` : ''), vorname: vornamen[(i * 7) % vornamen.length],
  beigetreten_ab: HJ[i % 3], verlaesst_ab: i % 37 === 0 ? 'Q2.1' : null, beteiligungen: i % 9,
  terms: Object.fromEntries(HJ.map((h, j) => [h, { status: (i + j) % 4 === 0 ? 'bezahlt' : (i + j) % 11 === 0 ? 'erlassen' : 'offen' }])),
}));
const koms = ['mottowoche', 'abiball', 'zeugnisvergabe', 'gottesdienst', 'motto-pullis', 'abizeitung', 'chaostag', 'aufsichtsrat'];
const jetzt = Date.now();
const alt = new Date(jetzt - 9e8).toISOString();
const topics = [
  ...koms.map((k) => ({ id: `tp-${k}`, title: k, kind: 'chat', status: 'offen', tag: k, pinned: false, admin_only: false, visibility: 'komitee', parent_id: null, created_by: 'local-user', created_at: alt })),
  { id: 'tp-team', title: 'Stufenteam', kind: 'chat', status: 'offen', tag: '', pinned: false, admin_only: false, visibility: 'stufenteam', parent_id: null, created_by: 'local-user', created_at: alt },
];
const lang = 'Das ist eine sehr lange Nachricht mit Umlauten äöüß und Emojis 🎉🔥 '.repeat(8);
const link = 'https://example.org/' + 'x'.repeat(220);
const items = Array.from({ length: NACHRICHTEN }, (_, i) => ({
  id: `it-${i}`, topic_id: i % 3 === 0 ? 'tp-abiball' : i % 3 === 1 ? 'tp-team' : topics[i % topics.length].id,
  type: i % 50 === 0 ? 'umfrage' : 'nachricht', title: i % 50 === 0 ? 'Welche Location?' : '',
  body: i % 7 === 0 ? link : i % 5 === 0 ? lang : `Nachricht ${i}`,
  options: i % 50 === 0 ? [{ id: 'a', label: 'Stadthalle ' + 'sehr lang '.repeat(6) }, { id: 'b', label: 'Schulaula' }] : null,
  done: false, pinned: i % 200 === 0, author: vornamen[i % 10] + ' ' + nachnamen[i % 10], author_role: 'schueler', author_koms: ['abiball'],
  created_by: i % 4 === 0 ? 'local-user' : `demo-st-${i % N}`, created_at: new Date(jetzt - (NACHRICHTEN - i) * 60000).toISOString(),
}));
const tagMembers = { abiball: ['local-user', ...students.slice(0, 60).map((s) => `demo-${s.id}`)] };
const saat = { students, topics: { topics, items, members: {}, topicTags: {}, tagMembers, myVotes: {}, reads: {} } };

const aus = ordner();
const browser = await browserStarten();
const ergebnis = [];
const probleme = [];
const ueberlauf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const rolle of ['admin', 'schueler']) for (const vp of [{ w: 320, h: 568 }, { w: 390, h: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, locale: 'de-DE' });
  await ctx.addInitScript((s) => {
    if (window.top !== window) return;
    try {
      if (sessionStorage.getItem('gesaet')) return;
      localStorage.setItem('sv-beitraege:students', JSON.stringify(s.students));
      localStorage.setItem('sv-beitraege:topics', JSON.stringify(s.topics));
      const d = new Date().toISOString();
      for (const k of ['sv:tour:v3:team', 'sv:tour:v3:schueler', 'sv:tour:v3:eltern']) localStorage.setItem(k, d);
      sessionStorage.setItem('gesaet', '1');
    } catch { /* Rahmen ohne Speicher */ }
  }, saat);
  await ctx.addInitScript(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* ältere Browser */ }
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', (e) => fehler.push('pageerror: ' + String(e).slice(0, 150)));
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text().slice(0, 150)); });
  const r = { rolle, breite: vp.w };
  const merke = (was, px) => { if (px > 0) { r['ueberlauf_' + was] = px; probleme.push(`${rolle}/${vp.w}: ${was} steht ${px} px über`); } };

  const t0 = Date.now();
  await page.goto(`${DEMO_BASIS}/?rolle=${rolle}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  r.start_ms = Date.now() - t0;

  const reiter = await page.$$eval('nav button', (bs) => bs.filter((b) => b.offsetParent).map((b) => (b.innerText || '').trim().split('\n')[0]).filter(Boolean));
  r.reiter_ms = {};
  for (const t of reiter) {
    const s = Date.now();
    await page.locator('nav button:visible', { hasText: t }).first().click();
    await page.waitForLoadState('networkidle');
    r.reiter_ms[t] = Date.now() - s;
    merke('Reiter ' + t, await ueberlauf(page));
  }

  // Komitee-Chat mit Hunderten Nachrichten
  await page.locator('nav button:visible', { hasText: 'Chats' }).first().click();
  await page.waitForTimeout(300);
  const chat = page.getByText('Abiball', { exact: false }).first();
  if (await chat.count()) {
    const s = Date.now();
    await chat.click();
    await page.waitForTimeout(300);
    r.chat_oeffnen_ms = Date.now() - s;
    const chatReiter = page.getByRole('button', { name: /^Chat/ }).first();
    if (await chatReiter.count()) { await chatReiter.click(); await page.waitForTimeout(400); }
    merke('Chatverlauf', await ueberlauf(page));
    const feld = page.locator('textarea:visible, input[type=text]:visible').last();
    if (await feld.count()) {
      const s2 = Date.now();
      for (let i = 0; i < 20; i++) { await feld.fill('Stress ' + i); await feld.press('Enter'); }
      await feld.fill('Z'.repeat(5000)); await feld.press('Enter');
      r.senden_21_ms = Date.now() - s2;
      await page.waitForTimeout(300);
      merke('Chat nach 5000 Zeichen', await ueberlauf(page));
      // Doppeltipp auf Senden darf nur EINE Nachricht erzeugen
      await feld.fill('Doppeltest-4711');
      const senden = page.locator('button[aria-label*="senden" i]').last();
      if (await senden.count()) await senden.dblclick(); else { await feld.press('Enter'); await feld.press('Enter'); }
      await page.waitForTimeout(600);
      r.doppeltipp = await page.evaluate(() => (document.body.innerText.match(/Doppeltest-4711/g) || []).length);
      if (r.doppeltipp !== 1) probleme.push(`${rolle}/${vp.w}: Doppeltipp ergab ${r.doppeltipp} Nachrichten`);
      // Nur Leerzeichen dürfen nicht gesendet werden
      const vorher = await page.evaluate(() => document.body.innerText.length);
      await feld.fill('     '); await feld.press('Enter');
      await page.waitForTimeout(300);
      r.leerzeichen_gesendet = (await page.evaluate(() => document.body.innerText.length)) > vorher + 5;
      if (r.leerzeichen_gesendet) probleme.push(`${rolle}/${vp.w}: Nachricht aus Leerzeichen wurde gesendet`);
    }
  }

  // 60 schnelle Reiterwechsel
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const s3 = Date.now();
  let fehlklicks = 0;
  for (let i = 0; i < 60; i++) await page.locator('nav button:visible').nth(i % Math.max(1, reiter.length)).click({ timeout: 1500 }).catch(() => { fehlklicks++; });
  r.klicksturm_60_ms = Date.now() - s3;
  r.fehlklicks = fehlklicks;
  merke('nach Klicksturm', await ueberlauf(page));
  r.longtasks = await page.evaluate(() => ({ anzahl: window.__lt.length, max_ms: Math.max(0, ...window.__lt), summe_ms: window.__lt.reduce((a, b) => a + b, 0) }));
  r.speicher_mb = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
  r.fehler = [...new Set(fehler)].slice(0, 8);
  if (r.fehler.length) probleme.push(`${rolle}/${vp.w}: ${r.fehler[0]}`);
  ergebnis.push(r);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(aus, 'masse.json'), JSON.stringify(ergebnis, null, 1));
for (const e of ergebnis) {
  console.log(`${e.rolle.padEnd(9)} ${e.breite}px  Start ${e.start_ms} ms · Chat öffnen ${e.chat_oeffnen_ms ?? '–'} ms · 21 Nachrichten ${e.senden_21_ms ?? '–'} ms · 60 Reiterwechsel ${e.klicksturm_60_ms} ms · längste Blockade ${e.longtasks.max_ms} ms · ${e.speicher_mb ?? '?'} MB`);
}
console.log(probleme.length ? '\n!! ' + probleme.join('\n!! ') : '\nkeine Probleme');
process.exit(probleme.length ? 1 : 0);
