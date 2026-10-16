// Prüf-Helfer (Bildschirmfotos im Demo-Modus): node geraet.mjs <geraet> <rolle> <ausgabe> [schritt ...]
// geraet: iphone (390x844) | se (375x667) | android (360x800) | pixel (412x915) | ipad (820x1180) | ipadquer (1180x820) | laptop (1440x900)
// Schritte: Text (Teilstring, klickt erstes Treffer) | css:<sel> | scroll:<px> | warte:<ms> | tippe:<text> | shot:<name> | offline | online | dunkel | zurueck (Escape)
// Umgebung: DARK=1 (Dunkel), BILD=1 (eigenes Hintergrundbild simulieren), TOUR=1 (Einführung nicht wegklicken), BASIS=<url>, CHROMIUM_PATH=<browser>
// Ausgabe: PNG je shot unter tests/ergebnisse/<ausgabe>-<name>.png und am Ende <ausgabe>.png; Konsolenfehler + Zeitmessungen auf stdout
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const AUS = fileURLToPath(new URL('./ergebnisse/', import.meta.url));
mkdirSync(AUS, { recursive: true });
const BASIS = process.env.BASIS || 'http://127.0.0.1:5173';
const G = { iphone: [390, 844, true], se: [375, 667, true], android: [360, 800, true], pixel: [412, 915, true], ipad: [820, 1180, true], ipadquer: [1180, 820, true], laptop: [1440, 900, false] };
(async () => {
  const [geraet, rolle, aus, ...schritte] = process.argv.slice(2);
  const [w, h, mobil] = G[geraet] || G.iphone;
  // wie _umgebung.mjs: CHROMIUM_PATH nur nötig, wenn Playwright seinen eigenen Browser nicht findet
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobil, hasTouch: mobil, colorScheme: process.env.DARK === '1' ? 'dark' : 'light', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const log = []; p.on('pageerror', e => log.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text().slice(0, 200)); });
  const t0 = Date.now();
  await p.goto(BASIS + '/?rolle=' + rolle, { timeout: 30000 });
  await p.waitForTimeout(1200);
  log.push('geladen nach ' + (Date.now() - t0) + ' ms');
  if (process.env.TOUR !== '1') for (let i = 0; i < 4; i++) { const u = p.getByText('Überspringen', { exact: true }); if (await u.count()) { await u.first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300); } }
  if (process.env.TOUR !== '1') for (const t of ['Fertig', 'Später']) { const u = p.getByRole('button', { name: t, exact: true }); if (await u.count()) { await u.first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300); } }
  // Hintergrundbild simulieren – vor JEDEM Foto erneut, weil HintergrundEbene die Klasse
  // mit-hintergrund beim Neuzeichnen zurücksetzt (sonst fehlt das Bild auf späteren Fotos)
  const bild = async () => { if (process.env.BILD === '1') await p.evaluate(() => { document.getElementById('test-bild')?.remove(); const G='radial-gradient(circle at 20% 30%,#e8a33d 0,transparent 35%),radial-gradient(circle at 80% 60%,#3d7be8 0,transparent 40%),repeating-linear-gradient(35deg,#2b2b2b 0 18px,#6b5a3a 18px 40px,#c9c2b0 40px 52px)'; document.documentElement.classList.add('mit-hintergrund'); document.documentElement.style.setProperty('--hg-bild', G); const d = document.createElement('div'); d.id = 'test-bild'; d.setAttribute('aria-hidden','true'); d.style.cssText='position:fixed;inset:0;z-index:-10;pointer-events:none;background:'+G; const s = document.createElement('div'); s.style.cssText='position:absolute;inset:0;background:rgb(var(--papier)/0.45)'; d.appendChild(s); document.body.appendChild(d); }).catch(() => {}); };
  await bild();
  for (const s of schritte) {
    const t1 = Date.now();
    try {
      if (s.startsWith('scroll:')) await p.mouse.wheel(0, +s.slice(7));
      else if (s.startsWith('warte:')) await p.waitForTimeout(+s.slice(6));
      else if (s.startsWith('tippe:')) await p.keyboard.type(s.slice(6));
      else if (s.startsWith('shot:')) { await bild(); await p.screenshot({ path: `${AUS}${aus}-${s.slice(5)}.png`, timeout: 15000 }); continue; }
      else if (s === 'offline') await ctx.setOffline(true);
      else if (s === 'online') await ctx.setOffline(false);
      else if (s === 'zurueck') await p.keyboard.press('Escape');
      else {
        const loc = s.startsWith('css:') ? p.locator(s.slice(4)).first() : p.getByText(s, { exact: false }).first();
        try { await loc.click({ timeout: 3000 }); } catch { await loc.evaluate(el => el.click()).catch(() => log.push('klick fehlgeschlagen: ' + s)); }
      }
      await p.waitForTimeout(700);
      log.push(`${s} → ${Date.now() - t1} ms`);
    } catch (e) { log.push('fehler bei ' + s + ': ' + e.message.slice(0, 120)); }
  }
  // Waagerechtes Überlaufen der Seite?
  const breit = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  if (breit > 1) log.push('WARNUNG: Seite ist ' + breit + ' px breiter als der Bildschirm');
  await bild();
  await p.screenshot({ path: `${AUS}${aus}.png`, timeout: 15000 }).catch(e => log.push('screenshot: ' + e.message));
  console.log(log.join('\n'));
  await b.close();
})().catch(e => { console.log('ABBRUCH', e.message); process.exit(1); });
