# Stufenkasse

WebApp (PWA) zur Verwaltung der **Stufenkasse**: Beiträge (25 €/Halbjahr) und
**Beteiligungen** pro Person über die Halbjahre **EF.1 – Q2.2**. Wer sich beteiligt,
bekommt den Zusatzbeitrag erlassen; wer sich kaum beteiligt, zahlt.

Multi-User, live-synchron über Handy / iPad / Laptop – Backend: **Supabase**.

## Features
- Alphabetische Liste (Umlaut-korrekt), Suche mit Umlaut-/Groß-Klein-/Leerzeichen-Toleranz
- Filter: min/max Beteiligungen · „nur noch offen bis aktuell" · aktuelles Halbjahr · Erlass-Schwelle
- 6 Halbjahre je Person mit 3 Zuständen: **offen / bezahlt / erlassen**
- Detailansicht: Status togglen, Beteiligungen +/-, „dabei ab" und „verlässt ab" Halbjahr
- **Neuzugänge**: beim Anlegen wählbar, ab welchem Halbjahr jemand dabei ist (frühere HJ grau, zählen nicht)
- Schule verlassen → Felder ab dann **rot** und aus der Berechnung raus
- Massen-Bearbeitung mehrerer Personen gleichzeitig
- Aktuelles Halbjahr markiert & manuell umstellbar (Default EF.1)
- Hell/Dunkel, responsive, installierbar (PWA)
- Export/Import (JSON-Backup)

## Lokal starten
```bash
npm install
npm run dev
```
Ohne Supabase-Konfiguration läuft die App im **lokalen Modus** (nur dieses Gerät, kein Login) –
gut zum Ausprobieren.

## Supabase einrichten (für Sync + Login)
1. Auf https://supabase.com ein kostenloses Projekt anlegen – **Region: Europe (Frankfurt)**.
2. **SQL Editor** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**.
3. **Authentication → Providers → Email**: aktiviert lassen, aber **„Confirm email" ausschalten**
   (wir nutzen Benutzernamen ohne echten Mailversand).
4. **Project Settings → API**: `Project URL` und `anon public key` kopieren.
5. `.env` anlegen (Vorlage: `.env.example`):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_ACCESS_CODE=euer-geheimer-code
   ```
6. `npm run dev` – jetzt mit Login. Erstes Konto über „Konto erstellen" (+ Zugangscode) anlegen.

## Deploy (Vercel)
- Repo bei Vercel importieren, Framework: **Vite**.
- Environment Variables setzen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ACCESS_CODE`.
- Build Command `npm run build`, Output `dist`.

## Sicherheit / Datenschutz
- Daten von Minderjährigen → Supabase in EU-Region, Datenminimierung (nur Name + Beträge/Beteiligung).
- RLS: nur eingeloggte Nutzer haben Zugriff.
- Der Zugangscode ist eine **leichte** Registrierungssperre (clientseitig). Für strengeren Schutz:
  in Supabase **öffentliche Registrierung deaktivieren** und Konten manuell anlegen.

## Stack
React + Vite + TypeScript + Tailwind CSS · Supabase (Postgres + Auth + Realtime) · PWA.
