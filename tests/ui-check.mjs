// Oberflächen-Test im Demo-Modus (ohne Datenbank, gefahrlos):
// jede Rolle × 4 Bildschirmgrößen × hell/dunkel × jeder Reiter.
//
// Prüft je Ansicht: nichts ragt seitlich raus, Knöpfe groß genug, Knöpfe mit
// Namen, letzter Inhalt nicht unter der Tab-Leiste, keine Fehler in der
// Konsole; auf der iPhone-Größe zusätzlich Barrierefreiheit (axe, WCAG 2.2 AA).
//
// Vorher im Projektordner (zweites Fenster):
//   npx vite build --mode demo --outDir dist-demo
//   npx vite preview --outDir dist-demo --port 4173 --strictPort
// Dann:  node tests/ui-check.mjs          (BILDER=1 speichert Bildschirmfotos)
// Ergebnis: Zusammenfassung in der Konsole, Details in tests/ergebnisse/ui.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { browserStarten, TOUR_WEG, DEMO_BASIS, ordner } from './_umgebung.mjs';

const ROLLEN = (process.env.ROLLEN || 'schueler,sprecher,stufenteam,kassenwart,admin,eltern,eltern-leer').split(',');
const GROESSEN = [
  { n: 'SE320', w: 320, h: 568, mobil: true },
  { n: 'iPhone390', w: 390, h: 844, mobil: true },
  { n: 'Tablet768', w: 768, h: 1024, mobil: true },
  { n: 'Desktop1280', w: 1280, h: 800, mobil: false },
];
const axeQuelle = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const aus = ordner();
const bilder = process.env.BILDER ? ordner('bilder') : null;

const browser = await browserStarten();
const ergebnis = [];
for (const rolle of ROLLEN) for (const g of GROESSEN) for (const thema of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: g.w, height: g.h }, isMobile: g.mobil, hasTouch: g.mobil, colorScheme: thema, locale: 'de-DE' });
  await ctx.addInitScript(TOUR_WEG);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => fehler.push('pageerror: ' + String(e).slice(0, 160)));
  await page.goto(`${DEMO_BASIS}/?rolle=${rolle}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const sichtbareReiter = () => page.$$eval('nav button', (bs) => bs
    .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; })
    .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().split('\n')[0]));
  const reiter = (await sichtbareReiter()).filter(Boolean);
  for (const tab of reiter.length ? reiter : ['(ohne Reiter)']) {
    if (tab !== '(ohne Reiter)') {
      for (const b of await page.$$('nav button')) {
        const txt = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || '').trim().split('\n')[0];
        if (txt === tab && (await b.isVisible())) { await b.click(); break; }
      }
      await page.waitForTimeout(500);
    }
    const pruef = await page.evaluate(() => {
      const vw = window.innerWidth;
      const sichtbar = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      const imScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return true; return false; };
      const raus = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!sichtbar(el)) continue;
        const r = el.getBoundingClientRect();
        if ((r.right > vw + 1 || r.left < -1) && !imScroller(el) && getComputedStyle(el).position !== 'fixed') raus.push(`${el.tagName.toLowerCase()} "${(el.innerText || '').slice(0, 30).replace(/\s+/g, ' ')}"`);
      }
      const klein = [];
      for (const el of document.querySelectorAll('button, a[href], [role=button], input[type=checkbox], input[type=radio], select')) {
        if (!sichtbar(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) klein.push(`${(el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const ohneName = [...document.querySelectorAll('button, a[href], [role=button]')].filter((el) => sichtbar(el) && !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).length;
      return { ueberlauf: document.documentElement.scrollWidth - vw, raus: raus.slice(0, 6), kleinUnter24: [...new Set(klein)].slice(0, 8), ohneName };
    });
    const ende = await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 350));
      const navs = [...document.querySelectorAll('nav')].filter((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().height > 0);
      // Oberkante der Knöpfe (die Leiste selbst kann oben einen durchsichtigen Rand haben)
      const oben = navs.length ? Math.min(...navs.map((n) => {
        const t = [...n.querySelectorAll('button')].map((b) => b.getBoundingClientRect().top).filter((x) => x > 0);
        return t.length ? Math.min(...t) : n.getBoundingClientRect().top;
      })) : window.innerHeight;
      let unten = -1;
      for (const el of document.querySelectorAll('#root *')) {
        if (el.closest('nav') || el.children.length || !(el.innerText || '').trim()) continue;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.height && cs.visibility !== 'hidden' && cs.position !== 'fixed') unten = Math.max(unten, r.bottom);
      }
      window.scrollTo(0, 0);
      return unten > oben + 1 ? Math.round(unten - oben) : 0;
    });
    let axe = null;
    if (g.n === 'iPhone390') {
      await page.evaluate(axeQuelle);
      axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }))
        .violations.map((v) => ({ id: v.id, n: v.nodes.length, bsp: v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join(' | ') })));
    }
    if (bilder) await page.screenshot({ path: path.join(bilder, `${rolle}_${g.n}_${thema}_${tab.replace(/[^A-Za-z0-9äöüÄÖÜ]+/g, '-')}.png`) });
    ergebnis.push({ rolle, groesse: g.n, thema, tab, ...pruef, verdecktPx: ende, axe });
  }
  ergebnis.push({ rolle, groesse: g.n, thema, tab: '__konsole__', fehler: [...new Set(fehler)].slice(0, 10) });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(aus, 'ui.json'), JSON.stringify(ergebnis, null, 1));

// ---- Zusammenfassung -------------------------------------------------------
const ansichten = ergebnis.filter((e) => e.tab !== '__konsole__');
const ueber = ansichten.filter((e) => e.ueberlauf > 0 || e.raus.length);
const verdeckt = ansichten.filter((e) => e.verdecktPx > 0);
const konsole = ergebnis.filter((e) => e.tab === '__konsole__' && e.fehler.length);
const axeSumme = {};
for (const e of ansichten) for (const v of e.axe || []) axeSumme[v.id] = (axeSumme[v.id] || 0) + v.n;
console.log(`${ansichten.length} Ansichten geprüft (${ROLLEN.length} Rollen × ${GROESSEN.length} Größen × hell/dunkel × Reiter)`);
console.log(`Seitlich überstehend: ${ueber.length}${ueber.length ? '  z. B. ' + ueber.slice(0, 3).map((e) => `${e.rolle}/${e.groesse}/${e.tab}: ${e.raus[0] || e.ueberlauf + ' px'}`).join('; ') : ''}`);
console.log(`Letzter Inhalt unter der Tab-Leiste: ${verdeckt.length}${verdeckt.length ? '  z. B. ' + verdeckt.slice(0, 3).map((e) => `${e.rolle}/${e.groesse}/${e.tab} (${e.verdecktPx} px)`).join('; ') : ''}`);
console.log(`Knöpfe ohne Namen: ${ansichten.reduce((a, e) => a + e.ohneName, 0)} · Knöpfe unter 24 px: ${ansichten.reduce((a, e) => a + e.kleinUnter24.length, 0)}`);
console.log(`Konsolenfehler: ${konsole.length ? konsole.map((e) => `${e.rolle}/${e.groesse}/${e.thema}: ${e.fehler[0]}`).slice(0, 5).join(' · ') : 'keine'}`);
console.log(`axe (iPhone-Größe, Summe betroffener Stellen): ${Object.keys(axeSumme).length ? JSON.stringify(axeSumme) : 'nichts gefunden'}`);
process.exit(ueber.length || konsole.length ? 1 : 0);
