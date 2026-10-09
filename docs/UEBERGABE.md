# Übergabe für den nächsten Chat (Stand 09.10.2026)

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
  - `Claude-Session: https://claude.ai/code/session_018XCxUj6kmssZhKshvRA49f`

## Git-Stand

- `origin/main`: cf8aff4 (Wortfilter + Melden).
- `abi-album` lokal und auf dem Laptop:
  - a7789ce Automatische Sperren
  - 0eeb59c Update 1.3
  - dazu dieser Fix-Commit (Kacheln überlappen, Übergabe)
- **Update 1.3 soll NICHT live.** Der Nutzer will es erst als Vorschau für Admin und Testkonto: `git push origin abi-album:update-1-3`, dann die Vercel-Vorschau-URL nutzen.

## Offene ToDos beim Nutzer

1. Im Supabase SQL Editor ausführen: `privat\inhalte-loeschen.sql` (26 ausgeblendete Mottos und 1 Zitat endgültig löschen).
2. Im Supabase SQL Editor ausführen: `supabase/meldungen-aufraeumen.sql`.
3. Erst nach dem Livegang auf `main`: `supabase/autor-spalten-schuetzen.sql` (Einreicher-Spalten sperren).

## Offenes Feedback zu Update 1.3 (aus der letzten Nachricht, noch NICHT erledigt)

1. **Design „wirkt leblos“.**
   - Die alten bunten Karten (Album, Motto, Zitate, Rankings) gefielen besser.
   - Vorschlag: die alten Karten wiederherstellen (Stand vor 0eeb59c in `MyKasse`/`AlbumKarte`/`MottoKarte`/`ZitateKarte`/`RankingKarten`), aber ohne lila „AI slop“.
   - Kräftige Einzelfarben, Verläufe höchstens innerhalb einer Farbe.
   - Die neuen Funktionen (Runden-Marke, Zitat-Vorschau) einbauen.
   - Überlappende Kacheln sind gefixt (Wrapper `flex flex-col`, Kachel `flex-1`).
2. **Personen ausblenden, die die Schule verlassen haben.**
   - Kriterium: `students.verlaesst_ab` liegt vor dem aktuellen Halbjahr.
   - Betrifft: Album, Rankings-Auswahl, Zitat-Namensauswahl, Rollenliste, Kasse-Liste (prüfen, wo sinnvoll).
3. **Neues Passwort: 8 Zeichen aus Buchstaben und Ziffern, keine Wort-Zusammensetzung.**
   - Ort: `supabase/functions/person-anlegen/index.ts`, Modus `passwort_neu_fuer`.
   - Mit `crypto.getRandomValues`, ohne verwechselbare Zeichen (0/O, 1/l/I).
   - Danach neu deployen (`verify_jwt: true`).
   - Der Nutzer erwähnte „Hat man ein Pop Up erhalten“ – nachfragen, was genau gemeint ist. Das Passwort erscheint bereits im Pop-up/Sheet `PasswortNeu.tsx`.
4. **Hintergrundbild in schlechter Qualität.**
   - In `lib/hintergrund.ts` steht aktuell 1600 px, JPEG 0,82, Cache als data-URL in localStorage (5-MB-Grenze).
   - Besser: 2560 px (Retina), Qualität 0,9 bzw. WebP.
   - Cache in IndexedDB oder der Cache API statt localStorage.
   - `file_size_limit` im Bucket `hintergruende` liegt bei 2 MB; bei Bedarf erhöhen (`update storage.buckets`).
5. **Reaktionen im Chat:**
   - Neue Emojis: 😁 (sehr glücklich), 😭, ❤️.
   - Dazu ein „+“-Knopf, der die Emoji-Tastatur des Geräts öffnet: unsichtbares Eingabefeld fokussieren und das erste eingegebene Emoji übernehmen.
   - Prüfen, ob `topic_reaktionen.emoji` per Check-Constraint auf eine feste Liste begrenzt ist. Wenn ja, mit `alter table … drop constraint` per SQL-File für den Nutzer lösen oder durch einen Längen-Check ersetzen.
   - Den Wortfilter für Emojis (`app_settings.wortfilter_zeichen`) beachten.
6. **Chat-Kopf auf dem Laptop:**
   - Der Blur bzw. Farbverlauf hinter der Leiste wirkt verwirrend (Screenshot: blauer Schein rechts oben im Kopf).
   - Ursache vermutlich: Hintergrundbild plus `glas`-Klasse plus die Leiste in App.tsx bei `lg`.
   - Den Kopf ruhig machen: deckender Hintergrund oder dezentes Glas ohne Farbschein.

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
