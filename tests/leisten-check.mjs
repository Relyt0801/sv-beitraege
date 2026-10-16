// Kopf- und Reiterleiste an fester Stelle (Demo-Modus, gefahrlos).
//
// Anlass Okt. 2026: „die Headbar ist nach unten verschoben“ – am Laptop stand
// bei offenem Chat unter der App-Kopfzeile ein zweites Band (DESIGN-REGELN 3).
// Dieser Test misst je Gerät × Rolle die festen Leisten:
//   oben  = feste/klebende Bänder am oberen Rand (Breite > 60 %, 30–200 px hoch)
//   unten = feste Leisten am unteren Rand (Reiterleiste am Handy)
// in jedem Reiter oben und ganz unten gescrollt, beim Reiterwechsel aus
// gescrollter Lage, nach Schließen eines Blatts und von Chat/Kalender.
// Erwartung: je Gerät überall dieselben Leisten an derselben Stelle.
// Chat und Kalender: am Laptop/iPad quer EINE Kopfzeile, ihr Kopf steht in
// #kopf-ebene; am Handy/iPad hoch eine Vollbild-Ebene über der Reiterleiste.
//
// Vorher wie bei ui-check.mjs die Demo bauen und bereitstellen, dann:
//   node tests/leisten-check.mjs        (GERAETE=390x844,1440x900 / ROLLEN=… zum Eingrenzen)
// Ergebnis: Zusammenfassung in der Konsole, Details in tests/ergebnisse/leisten.json,
// Exit-Code 1 bei Abweichungen.
import fs from 'node:fs';
import path from 'node:path';
import { browserStarten, TOUR_WEG, DEMO_BASIS, ordner } from './_umgebung.mjs';

const GERAETE = (process.env.GERAETE || '320x568,360x800,375x667,390x844,820x1180,1180x820,1440x900').split(',').map((s) => s.split('x').map(Number));
const ROLLEN = (process.env.ROLLEN || 'schueler,vorsitz,sprecher,stufenteam,kassenwart,admin,eltern').split(',');
const BREIT = 1024; // ab hier eine Kopfzeile mit Reiterleiste darin (App.tsx, useBreit)

const messen = (page) =>
  page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const istBand = (e) => {
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
      const r = e.getBoundingClientRect();
      return r.width > vw * 0.6 && r.height >= 30 && r.height <= 200;
    };
    const baender = [...document.querySelectorAll('body *')].filter(istBand);
    const aussen = baender.filter((e) => !baender.some((o) => o !== e && o.contains(e)));
    const lage = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
    const oben = aussen.filter((e) => e.getBoundingClientRect().top < 160 && e.getBoundingClientRect().bottom < vh / 2).map(lage);
    const unten = aussen.filter((e) => e.getBoundingClientRect().bottom > vh - 140 && e.getBoundingClientRect().top > vh / 2).map(lage);
    // Vollbild-Ebene (Chat/Kalender am Handy): festes Element ganz oben, Reiterleiste verdeckt?
    let ebene = document.elementFromPoint(vw / 2, 3);
    while (ebene && ebene !== document.body && getComputedStyle(ebene).position !== 'fixed') ebene = ebene.parentElement;
    const er = ebene && ebene !== document.body ? ebene.getBoundingClientRect() : null;
    const untenDrauf = document.elementFromPoint(vw / 2, vh - 25);
    const ke = document.getElementById('kopf-ebene');
    // Zurück-Knopf einer offenen Ebene (Chat: aria-label „Zurück“, Kalender:
    // „‹ Events“ mit Pfeil). Steht er UNTER der App-Kopfzeile, ist das genau das
    // zweite Band („Headbar nach unten verschoben“).
    const kopf = document.querySelector('header');
    const kopfUnten = kopf ? kopf.getBoundingClientRect().bottom : 0;
    const zurueck = [...document.querySelectorAll('button')]
      .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; })
      .filter((x) => /^Zurück/.test(x.getAttribute('aria-label') || '') || x.innerHTML.includes('m15 6-6 6 6 6'))
      .map((x) => Math.round(x.getBoundingClientRect().top));
    return {
      zurueckOben: zurueck,
      zurueckUnterKopf: zurueck.some((t) => t >= kopfUnten - 2),
      oben: JSON.stringify(oben),
      unten: JSON.stringify(unten),
      ebene: er ? [Math.round(er.top), Math.round(er.bottom)] : null,
      reiterleisteVerdeckt: !untenDrauf?.closest('nav'),
      kopfEbene: ke ? ke.children.length : -1,
    };
  });

const reiterKnoepfe = (page) => page.locator('nav:not([aria-label]) button').filter({ visible: true });
async function reiterListe(page) {
  return page.$$eval('nav:not([aria-label]) button', (bs) => [
    ...new Set(
      bs
        .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; })
        .map((x) => (x.getAttribute('aria-label') || x.innerText || '').trim().split('\n').filter((s) => !/^\d+$/.test(s.trim()))[0]?.trim())
        .filter(Boolean),
    ),
  ]);
}

const browser = await browserStarten();
const zeilen = [];
const seitenfehler = [];
for (const [w, h] of GERAETE) for (const rolle of ROLLEN) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1000, hasTouch: w < 1000, locale: 'de-DE', serviceWorkers: 'block' });
  await ctx.addInitScript(TOUR_WEG);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => seitenfehler.push(`${w}x${h} ${rolle}: ${String(e).slice(0, 160)}`));
  await page.goto(`${DEMO_BASIS}/?rolle=${rolle}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const merke = async (zustand) => zeilen.push({ geraet: `${w}x${h}`, rolle, zustand, ...(await messen(page)) });
  const reiter = async (t) => { await reiterKnoepfe(page).filter({ hasText: t }).first().click({ timeout: 4000 }); await page.waitForTimeout(650); };
  const tabs = await reiterListe(page);

  for (const t of tabs) {
    await reiter(t);
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250);
    await merke(`${t} oben`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(350);
    await merke(`${t} unten`);
  }
  if (tabs.length > 1) {
    await reiter(tabs[0]);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
    await reiterKnoepfe(page).filter({ hasText: tabs[1] }).first().click(); await page.waitForTimeout(120);
    await merke(`Wechsel ${tabs[0]} → ${tabs[1]} (sofort)`);
    await page.waitForTimeout(600);
    await merke(`Wechsel ${tabs[0]} → ${tabs[1]}`);
  }
  // Ebenen: Chat und Kalender
  const chats = tabs.find((t) => /Chats/.test(t));
  if (chats) {
    await reiter(chats);
    const chat = page.locator('main button, main [role=button]').filter({ visible: true }).filter({ hasText: /Abizeitung|Komitee|Stufenteam|Frage|Chat/ });
    if (await chat.count()) {
      await chat.first().click(); await page.waitForTimeout(900);
      await merke('Chat offen');
      await page.keyboard.press('Escape'); await page.waitForTimeout(600);
      await merke('Chat geschlossen');
    }
  }
  const events = tabs.find((t) => /Events/.test(t));
  if (events) {
    await reiter(events);
    const kal = page.getByRole('button', { name: /Ganzen Kalender öffnen/ }).filter({ visible: true });
    if (await kal.count()) {
      await kal.first().click(); await page.waitForTimeout(900);
      await merke('Kalender offen');
      await page.keyboard.press('Escape'); await page.waitForTimeout(600);
      await merke('Kalender geschlossen');
    }
  }
  // Blatt (Profil) aus gescrollter Lage öffnen und schließen
  await reiter(tabs[0]);
  await page.evaluate(() => scrollTo(0, Math.min(400, document.documentElement.scrollHeight))); await page.waitForTimeout(300);
  await page.locator('header button').filter({ visible: true }).last().click().catch(() => {}); await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  await merke('nach Blatt (gescrollt)');
  await ctx.close();
}
await browser.close();

// Auswertung je Gerät
let abweichungen = 0;
const sig = (z) => `oben ${z.oben} · unten ${z.unten}`;
const nachGeraet = {};
for (const z of zeilen) (nachGeraet[z.geraet] ??= []).push(z);
for (const [g, liste] of Object.entries(nachGeraet)) {
  const breit = +g.split('x')[0] >= BREIT;
  const normal = liste.filter((z) => !/offen$/.test(z.zustand));
  const zaehl = {};
  for (const z of normal) zaehl[sig(z)] = (zaehl[sig(z)] || 0) + 1;
  const soll = Object.entries(zaehl).sort((a, b) => b[1] - a[1])[0][0];
  console.log(`${g}: ${normal.length} Zustände – ${soll}${zaehl[soll] === normal.length ? '' : ` (nur ${zaehl[soll]}×)`}`);
  for (const z of normal) if (sig(z) !== soll) { abweichungen++; console.log(`  ABWEICHUNG ${z.rolle} · ${z.zustand}: ${sig(z)}`); }
  let ebenenFehler = 0;
  for (const z of liste.filter((x) => /offen$/.test(x.zustand))) {
    const ok = breit
      ? sig(z) === soll && z.kopfEbene > 0 && !z.zurueckUnterKopf // eine Kopfzeile, Kopf der Ebene darin, kein Zurück darunter
      : z.ebene && z.ebene[0] === 0 && z.reiterleisteVerdeckt; // Vollbild-Ebene über allem
    if (!ok) { abweichungen++; ebenenFehler++; console.log(`  ABWEICHUNG ${z.rolle} · ${z.zustand}: ${breit ? `${sig(z)} · #kopf-ebene ${z.kopfEbene} · Zurück bei y=${JSON.stringify(z.zurueckOben)}${z.zurueckUnterKopf ? ' (unter der Kopfzeile – zweites Band)' : ''}` : `Ebene ${JSON.stringify(z.ebene)} · Reiterleiste verdeckt: ${z.reiterleisteVerdeckt}`}`); }
  }
  const ebenen = liste.filter((x) => /offen$/.test(x.zustand)).length;
  if (ebenen) console.log(`  Chat/Kalender offen: ${ebenen}× geprüft (erwartet: ${breit ? 'eine Kopfzeile, Kopf in #kopf-ebene' : 'Vollbild-Ebene ab 0 px, Reiterleiste verdeckt'}) – ${ebenenFehler ? `${ebenenFehler} Abweichung(en)` : 'in Ordnung'}`);
}
fs.writeFileSync(path.join(ordner(), 'leisten.json'), JSON.stringify(zeilen, null, 1));
console.log(`\n${zeilen.length} Zustände · Abweichungen: ${abweichungen} · Seitenfehler: ${seitenfehler.length}`);
for (const f of seitenfehler.slice(0, 5)) console.log('  ', f);
process.exit(abweichungen || seitenfehler.length ? 1 : 0);
