// Gemeinsame Helfer für die Test-Skripte in diesem Ordner.
//
// Hier stehen bewusst KEINE Schlüssel, Passwörter, Kennungen oder Namen.
// Adresse und öffentlicher Schlüssel der Datenbank kommen aus der Umgebung
// oder aus .env.local / .env im Projektordner (beide in .gitignore).
// Test-Konten werden nur über Umgebungsvariablen übergeben (tests/README.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ERGEBNISSE = path.join(WURZEL, 'tests', 'ergebnisse');

// Wie src/lib/supabase.ts: BOM und Steuerzeichen entfernen (PowerShell schreibt
// .env gern mit BOM).
const sauber = (v) => (v ? [...v].filter((ch) => { const c = ch.charCodeAt(0); return !(c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0xfeff || (c >= 0x200b && c <= 0x200d)); }).join('').trim() : '');

function ausEnvDatei(name) {
  for (const datei of ['.env.local', '.env']) {
    try {
      const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
      const m = text.match(new RegExp('^\\uFEFF?\\s*' + name + '\\s*=\\s*(.*)$', 'm'));
      if (m) return sauber(m[1]).replace(/^["']|["']$/g, '');
    } catch { /* Datei fehlt – nächste versuchen */ }
  }
  return '';
}

/** Nur für Skripte, die mit der echten Datenbank reden (edge-check, last-test). */
export function datenbank() {
  const url = sauber(process.env.VITE_SUPABASE_URL) || ausEnvDatei('VITE_SUPABASE_URL');
  const key = sauber(process.env.VITE_SUPABASE_ANON_KEY) || ausEnvDatei('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) {
    console.error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen (Umgebung oder .env.local im Projektordner).');
    process.exit(2);
  }
  return { url: url.replace(/\/+$/, ''), key };
}

export function pflicht(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Umgebungsvariable ${name} fehlt – siehe tests/README.md`);
    process.exit(2);
  }
  return v;
}

// undici statt eingebautem fetch: begrenzte Verbindungen (wie ein Browser) und
// ein eventuell gesetzter HTTPS_PROXY wird beachtet.
export async function neueVerbindungen(anzahl) {
  const { Agent, EnvHttpProxyAgent } = await import('undici');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const opts = { connections: anzahl, keepAliveTimeout: 30000 };
  return proxy ? new EnvHttpProxyAgent(opts) : new Agent(opts);
}
let _agent;
export async function holen(url, opts = {}) {
  const { fetch: ufetch } = await import('undici');
  _agent ??= await neueVerbindungen(Number(process.env.VERBINDUNGEN || 32));
  return ufetch(url, { dispatcher: _agent, ...opts });
}
export async function verbindungenSchliessen() { if (_agent) await _agent.close(); _agent = undefined; }

export async function anmelden(db, email, passwort) {
  const r = await holen(`${db.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: db.key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: passwort }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`Anmeldung fehlgeschlagen (${r.status}) – E-Mail/Passwort prüfen`);
  return j.access_token;
}

async function antwort(r, t0) {
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: r.status, body, ms: Math.round(performance.now() - t0) };
}

/** Edge Function aufrufen. body als Objekt oder als roher Text (für kaputtes JSON). */
export async function funktion(db, name, body, token) {
  const t0 = performance.now();
  const h = { apikey: db.key, 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await holen(`${db.url}/functions/v1/${name}`, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return antwort(r, t0);
}

/** Nur lesend: GET auf die REST-Schnittstelle. */
export async function lesen(db, pfad, token) {
  const t0 = performance.now();
  const h = { apikey: db.key };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await holen(`${db.url}/rest/v1/${pfad}`, { headers: h });
  return antwort(r, t0);
}

/** Chromium für die Oberflächen-Tests. CHROMIUM_PATH nur nötig, wenn Playwright
 *  seinen eigenen Browser nicht findet. */
export async function browserStarten() {
  const { chromium } = await import('playwright');
  const opts = { args: ['--no-proxy-server'] };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  return chromium.launch(opts);
}

/** Einführungen als "schon gesehen" markieren, damit sie die Tests nicht verdecken. */
export const TOUR_WEG = () => {
  if (window.top !== window) return;
  try {
    const d = new Date().toISOString();
    for (const k of ['sv:tour:v3:team', 'sv:tour:v3:schueler', 'sv:tour:v3:eltern']) localStorage.setItem(k, d);
  } catch { /* Rahmen ohne Speicher */ }
};

export const DEMO_BASIS = process.env.BASE || 'http://127.0.0.1:4173';

export function ordner(...teile) {
  const p = path.join(ERGEBNISSE, ...teile);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
