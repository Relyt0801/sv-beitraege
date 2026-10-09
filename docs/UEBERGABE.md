# Übergabe für den nächsten Chat (Stand 09.10.2026, abends)

Diese Datei ist der Einstieg für eine neue Sitzung. Erst lesen, dann loslegen.

## Projekt in Kürze

- Stufenkasse / SV-App (React + Vite + TypeScript + Tailwind, PWA).
- Supabase-Projekt `sdlgfdaxeazjxagajnvt` mit RLS, plpgsql-Triggern und SECURITY-DEFINER-RPCs.
- Vercel deployt `main` aus GitHub `Relyt0801/sv-beitraege`. Jeder andere Branch bekommt eine Vorschau-URL.
- Arbeits-Repo in der Cloud: `/tmp/svgit`, Branch `abi-album`. Dieser Ordner ist in einem neuen Chat weg – dort das Repo neu holen (Bundle oder GitHub).
- Laptop des Nutzers: `C:\Users\tyler\Documents\sv-beitraege`, Bundles liegen in `privat\`.
- Lieferweg:
  1. `git bundle create … 3138b82..abi-album`
  2. SendUserFile
  3. `device_commit_files` nach `privat\X.bundle`
  4. auf dem Gerät: `git fetch -q privat/X.bundle +abi-album:abi-album`
- Pushen macht der Nutzer selbst, weil auf dem Gerät keine Zugangsdaten liegen.
- Alte `.lock`-Dateien in `.git` beim Nutzer umbenennen, nicht löschen (Löschen ist nicht erlaubt).

## Feste Regeln des Nutzers

- **Keine vertraulichen Daten ins Git:**
  - keine Personendaten, Lehrernamen oder Wortfilter-Wörter;
  - der service_role-Key gehört nur in PowerShell `$env:`;
  - der VAPID Private Key nur in ein Supabase-Secret.
- Keine Zugangsdaten oder API-Keys für den Nutzer eintragen; `verify_jwt` bleibt an.
- **DELETE/DROP über die MCP-SQL-Tools hängt** (wartet auf Bestätigung). Stattdessen:
  - ein SQL-File für den Supabase SQL Editor erzeugen, oder
  - per RLS-Policy im Client löschen.
  - `create policy … for delete` funktioniert.
- **Stil der Antworten:**
  - Deutsch, Schwächen zuerst.
  - Bei ToDos immer sagen, in welcher Konsole sie laufen.
  - Am Ende jeder Runde ungefragt den Git-Stand nennen.
  - Bei `git add` einzelne Dateien angeben.
- **Commits** mit `-c user.name=Relyt0801 -c user.email=tyleradams2910@gmail.com` und diesen Trailern:
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: <aktuelle Session-URL>`

## Git-Stand

- `origin/main`: cf8aff4 (Wortfilter + Melden) – live.
- `origin/update-1-3`: 0eeb59c (Vorschau, alter Stand).
- `abi-album` (lokal, als Bundle auf dem Laptop): Update 1.3 plus das komplette Feedback vom 09.10. (siehe docs/AENDERUNGEN.md, Abschnitt „09.10.2026 (3)“).
- **Update 1.3 soll NICHT live.** Vorschau: `git push -f origin abi-album:update-1-3`, dann die Vercel-Vorschau-URL.

## Offene ToDos beim Nutzer

1. Im Supabase SQL Editor ausführen: `supabase/reaktionen-frei.sql`. Ohne das gehen nur die alten 6 Reaktionen, die neuen melden „Datenbank kennt es noch nicht“.
2. Im Supabase SQL Editor ausführen: `supabase/meldungen-aufraeumen.sql` (noch von vorher).
3. Erst nach dem Livegang auf `main`: `supabase/autor-spalten-schuetzen.sql` und `supabase/stimmen-schuetzen.sql`.

## Schon in der Datenbank (per MCP eingespielt)

- `honorable-mentions.sql`: Runden mit Honorable Mentions, `stimmen_zahlen`, `ergebnisse_setzen`, `ranking_stand` mit Sichtbarkeit.
- `ausgetretene-ausblenden.sql`: `noch_dabei()`, gefilterte `stufe_personen`, `album_personen` und `ranking_stand`.
- Trigger `reaktion_pruefen` (Emoji-Filter für Reaktionen). Bucket `hintergruende` auf 6 MB.
- Edge Function `person-anlegen` v6 (Zufallspasswort mit 8 Zeichen).

## Feedback zu Update 1.3

Alles erledigt (siehe docs/AENDERUNGEN.md, „09.10.2026 (3)“). Offen ist nur eine Rückfrage zum Passwort: „Hat man ein Pop Up erhalten“ – noch unklar, was gemeint ist. Das neue Passwort erscheint nach dem Erzeugen im Blatt „Neues Passwort“ (`PasswortNeu.tsx`).

## Was in Update 1.3 steckt (Kurzfassung, Details in docs/AENDERUNGEN.md)

- **Datenbank** (eingespielt, alles in `supabase/runden-und-freigaben.sql`):
  - Abstimmungsrunden, Freigaben/Zustimmungen, Wortfilter je Bereich (`wf_ohne_links`).
  - `autor_info` und `meine_eintraege`.
  - Bucket `hintergruende`, `nachtrag_bearbeiter`.
  - Neue Rechte `*.runden` und `funktion.*`.
- **Automatische Sperren** in `supabase/auto-sperre.sql` (eingespielt).
- **Edge Function `person-anlegen` v5:** Modus `passwort_neu_fuer`.
- **App, neue Dateien:**
  - `lib/runden.ts`, `lib/zustimmung.ts`, `lib/wortfilter-bereiche.ts`, `lib/hintergrund.ts`
  - `components/Runden.tsx`, `AutorInfo.tsx`, `Kachel.tsx`, `FreigabenSheet.tsx`, `PasswortNeu.tsx`, `HintergrundEbene.tsx`
- **Getestet:**
  - Runden, Stimmen-Limit, Zustimmungs-Trigger, Spalten-Sperre und Link-Filter in der Datenbank (Transaktionen mit Rollback).
  - UI in der Demo (`npx vite build --mode demo`, Vorschau auf Port 4173, `?rolle=schueler|admin`). Playwright liegt unter `/tmp/svgit/tests/node_modules/playwright`.
