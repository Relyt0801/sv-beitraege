// Platz und Scrollen messen (Demo-Modus, gefahrlos).
//
// Anlass Okt. 2026: „so übersichtlich, dass kaum leere Freiräume existieren
// … optimiere Layouts, so dass man kaum scrollen muss“ – bisher gab es dafür
// keine Zahl, nur Fotos. Dieser Test misst je Gerät × Rolle × Reiter:
//   bildschirme  – Seitenhöhe ÷ Bildschirmhöhe (1,0 = passt ohne Scrollen)
//   loecher      – Anteil leerer Stellen ZWISCHEN Inhalten im ersten
//                  Bildschirm (Raster aus Messpunkten in der Inhaltsspalte,
//                  ohne Kopf- und Reiterleiste)
//   endeLeer     – Anteil des ersten Bildschirms unter dem letzten Inhalt
//                  (kurze Seite – meist harmlos, am Laptop aber sichtbar)
//   luecke       – größter senkrechter Abstand zwischen zwei Inhalten (px)
//   innen        – Bereiche, die in sich scrollen (Laptop: Spalten)
// „Inhalt“ ist, was eine eigene Fläche hat (Karte, Zeile, Knopf, Bild) oder
// Text trägt; Seitenhintergrund und Abstände zählen als leer.
//
// Vorher wie bei ui-check.mjs die Demo bauen und bereitstellen, dann:
//   node tests/platz-check.mjs        (GERAETE=390x844 / ROLLEN=… zum Eingrenzen)
// Ergebnis: Rangliste in der Konsole, alle Werte in tests/ergebnisse/platz.json.
// Exit-Code 1, wenn eine Ansicht über den Grenzen liegt (GRENZEN unten).
import fs from 'node:fs';
import path from 'node:path';
import { browserStarten, TOUR_WEG, DEMO_BASIS, ordner } from './_umgebung.mjs';

const GERAETE = (process.env.GERAETE || '320x568,390x844,820x1180,1180x820,1440x900').split(',').map((s) => s.split('x').map(Number));
const ROLLEN = (process.env.ROLLEN || 'schueler,vorsitz,sprecher,stufenteam,kassenwart,admin,eltern').split(',');
// Grenzen je Geräteklasse – darüber gilt eine Ansicht als auffällig
const GRENZEN = {
  handy: { bildschirme: 4, loecher: 0.3, luecke: 72 },
  tablet: { bildschirme: 3, loecher: 0.3, luecke: 72 },
  laptop: { bildschirme: 2.5, loecher: 0.3, luecke: 72 },
};
const klasse = (w, h) => (w < 700 ? 'handy' : w < 1024 && h > w ? 'tablet' : 'laptop');

const messen = (page) =>
  page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const main = document.querySelector('main');
    if (!main) return null;
    // Bereich: unter der Kopfzeile, über der Reiterleiste, in der Inhaltsspalte.
    // Leisten = header und FEST stehende nav – eine Karte kann selbst ein
    // <nav> sein (z. B. die Pinnwand-Zeilen der Eltern), die ist Inhalt.
    const fest = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (/(fixed|sticky)/.test(getComputedStyle(a).position)) return true; return false; };
    const kopf = document.querySelector('header');
    const oben = kopf ? Math.max(0, Math.round(kopf.getBoundingClientRect().bottom)) : 0;
    const leistenEl = [...document.querySelectorAll('nav')].filter(fest);
    const leisten = leistenEl.map((n) => n.getBoundingClientRect()).filter((r) => r.height > 0 && r.top > vh / 2);
    const unten = leisten.length ? Math.round(Math.min(...leisten.map((r) => r.top))) : vh;
    const inLeiste = (e) => !!e.closest('header, [role=dialog]') || leistenEl.some((n) => n.contains(e));
    let spalte = main.parentElement;
    while (spalte && spalte !== document.body && spalte.getBoundingClientRect().width >= vw - 1) spalte = spalte.parentElement === document.body ? null : spalte.parentElement;
    const sr = (spalte && spalte !== document.body ? spalte : main).getBoundingClientRect();
    const links = Math.max(0, Math.round(Math.min(sr.left, main.getBoundingClientRect().left)));
    const rechts = Math.min(vw, Math.round(Math.max(sr.right, main.getBoundingClientRect().right)));

    const seitenweit = (e) => { const r = e.getBoundingClientRect(); return r.width >= vw * 0.98 && r.height >= vh * 0.9; };
    const hatFlaeche = (e) => {
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      const deckend = bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\)$/.test(bg);
      return deckend || cs.backgroundImage !== 'none' || (cs.boxShadow && cs.boxShadow !== 'none') || parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) > 0;
    };
    const textDirekt = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const istInhalt = (x, y) => {
      let e = document.elementFromPoint(x, y);
      if (!e) return null;
      if (inLeiste(e)) return null; // Leisten und Blätter nicht messen
      if (/^(IMG|SVG|PATH|CANVAS|INPUT|TEXTAREA|SELECT|VIDEO|BUTTON|A)$/i.test(e.tagName) || e.closest('button, a, svg')) return true;
      if (textDirekt(e)) return true;
      for (; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
        if (e.id === 'test-bild' || seitenweit(e)) continue;
        if (hatFlaeche(e)) return true;
      }
      return false;
    };

    const SCHRITT = 12;
    const zeilen = [];
    let leer = 0, voll = 0;
    for (let y = oben + SCHRITT / 2; y < unten; y += SCHRITT) {
      let inZeile = false;
      for (let x = links + SCHRITT / 2; x < rechts; x += SCHRITT) {
        const i = istInhalt(x, y);
        if (i === null) continue;
        if (i) { voll++; inZeile = true; } else leer++;
      }
      zeilen.push({ y, inZeile });
    }
    // Zeilen unter dem letzten Inhalt zählen als „Ende“, nicht als Loch
    const letzte = [...zeilen].reverse().find((z) => z.inZeile);
    const endeY = letzte ? letzte.y + SCHRITT / 2 : oben;
    let leerBisEnde = 0, alleBisEnde = 0;
    for (let y = oben + SCHRITT / 2; y < Math.min(endeY, unten); y += SCHRITT)
      for (let x = links + SCHRITT / 2; x < rechts; x += SCHRITT) {
        const i = istInhalt(x, y);
        if (i === null) continue;
        alleBisEnde++;
        if (!i) leerBisEnde++;
      }
    // größte senkrechte Lücke zwischen Zeilen mit Inhalt
    let luecke = 0, lauf = 0, begonnen = false;
    for (const z of zeilen) {
      if (z.inZeile) { if (begonnen) luecke = Math.max(luecke, lauf); lauf = 0; begonnen = true; }
      else if (begonnen) lauf += SCHRITT;
    }
    const innen = [...main.querySelectorAll('*')].filter((e) => {
      const cs = getComputedStyle(e);
      return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 80;
    }).length;
    const hoehe = document.scrollingElement.scrollHeight;
    return {
      bildschirme: +(hoehe / vh).toFixed(2),
      loecher: alleBisEnde ? +(leerBisEnde / alleBisEnde).toFixed(2) : 0,
      endeLeer: +(Math.max(0, unten - endeY) / Math.max(1, unten - oben)).toFixed(2),
      luecke,
      innen,
      spalte: [links, rechts],
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
const werte = [];
const seitenfehler = [];
for (const [w, h] of GERAETE) for (const rolle of ROLLEN) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1000, hasTouch: w < 1000, locale: 'de-DE', serviceWorkers: 'block' });
  await ctx.addInitScript(TOUR_WEG);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => seitenfehler.push(`${w}x${h} ${rolle}: ${String(e).slice(0, 160)}`));
  await page.goto(`${DEMO_BASIS}/?rolle=${rolle}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  for (const t of await reiterListe(page)) {
    await reiterKnoepfe(page).filter({ hasText: t }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
    const m = await messen(page);
    if (m) werte.push({ geraet: `${w}x${h}`, klasse: klasse(w, h), rolle, reiter: t, ...m });
  }
  await ctx.close();
}
await browser.close();

const auffaellig = werte.filter((v) => {
  const g = GRENZEN[v.klasse];
  return v.bildschirme > g.bildschirme || v.loecher > g.loecher || v.luecke > g.luecke;
});
fs.writeFileSync(path.join(ordner(), 'platz.json'), JSON.stringify({ werte, auffaellig, seitenfehler }, null, 1));

const fmt = (v) => `${v.geraet.padEnd(9)} ${v.rolle.padEnd(10)} ${v.reiter.padEnd(10)} ${String(v.bildschirme).padStart(5)} Bildschirme · Löcher ${Math.round(v.loecher * 100)} % · Ende leer ${Math.round(v.endeLeer * 100)} % · Lücke ${v.luecke} px${v.innen ? ` · ${v.innen} innen` : ''}`;
for (const k of ['handy', 'tablet', 'laptop']) {
  const l = werte.filter((v) => v.klasse === k);
  if (!l.length) continue;
  const mittel = (f) => (l.reduce((n, v) => n + v[f], 0) / l.length).toFixed(2);
  console.log(`\n${k}: ${l.length} Ansichten · Mittel ${mittel('bildschirme')} Bildschirme · Löcher ${Math.round(mittel('loecher') * 100)} % · Ende leer ${Math.round(mittel('endeLeer') * 100)} %`);
  console.log('  am längsten:');
  for (const v of [...l].sort((a, b) => b.bildschirme - a.bildschirme).slice(0, 5)) console.log('   ', fmt(v));
  console.log('  meiste Löcher:');
  for (const v of [...l].sort((a, b) => b.loecher - a.loecher).slice(0, 5)) console.log('   ', fmt(v));
}
console.log(`\n${werte.length} Ansichten · auffällig: ${auffaellig.length} · Seitenfehler: ${seitenfehler.length}`);
for (const v of auffaellig) console.log('  !', fmt(v));
process.exit(auffaellig.length || seitenfehler.length ? 1 : 0);
