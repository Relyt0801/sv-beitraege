# Tests

Werkzeuge aus der Testphase vom 24.09.2026 (Bericht: `docs/TESTBERICHT-2026-09-24.md`).
Sie gehören nicht zur App: Vercel installiert davon nichts, und in diesem
Ordner stehen **keine** Schlüssel, Passwörter, Kennungen oder Namen.
Test-Konten gibst du nur beim Aufruf als Umgebungsvariable mit.

| Test | Was | Wo | Ändert Daten? |
|---|---|---|---|
| `supabase/tests/rechte-test.sql` | 125 Angriffe/erlaubte Aktionen, jede Rolle | Supabase → SQL Editor | nein (alles zurückgerollt) |
| `edge-check.mjs` | Push- und Anlege-Funktion gegen Missbrauch | PowerShell | nein (Push nur im Probelauf) |
| `last-test.mjs` | bis zu 260 Personen öffnen gleichzeitig die App | PowerShell | nein (nur lesend) |
| `ui-check.mjs` | alle Rollen × 4 Größen × hell/dunkel × jeder Reiter, Barrierefreiheit | PowerShell | nein (Demo-Modus) |
| `masse-check.mjs` | 400 Personen, 1.500 Nachrichten, Klicksturm, Doppeltipp | PowerShell | nein (Demo-Modus) |

## Einmal einrichten (PowerShell, im Projektordner)

```powershell
cd tests
npm install
npx playwright install chromium
cd ..
```

## Rechte-Test (Supabase)

Supabase → SQL Editor → Inhalt von `supabase/tests/rechte-test.sql` einfügen → Run.
Oben steht die Summe. Erwartet: `124 ok / 0 Abweichungen / 0 unklar / 1 Hinweise`.
Jede Zeile mit `!! ABWEICHUNG` ist eine Lücke – sofort melden.
Der eine Hinweis (Kassenwart kann eine Buchung als „automatisch“ markieren) ist bekannt.

Nach jeder neuen SQL-Datei mit Zugriffsregeln einmal laufen lassen.

## Oberfläche (Demo-Modus, ohne Datenbank)

Fenster 1 (PowerShell, Projektordner) – Demo bauen und bereitstellen:

```powershell
npx vite build --mode demo --outDir dist-demo
npx vite preview --outDir dist-demo --port 4173 --strictPort
```

Fenster 2 (PowerShell, Projektordner):

```powershell
node tests/ui-check.mjs
node tests/masse-check.mjs
```

Mit `$env:BILDER="1"` vorher speichert `ui-check` Bildschirmfotos nach
`tests/ergebnisse/bilder/` (der Ordner wird nicht eingecheckt).

## Gegen die echte Datenbank

Adresse und öffentlicher Schlüssel kommen aus `.env.local` bzw. `.env`
(wie bei der App). Das Passwort nur für diese Sitzung setzen (PowerShell):

```powershell
$env:TEST_EMAIL="…Admin-Testkonto…"
$env:TEST_PASSWORT="…"
# optional für die Eltern-Fälle:
$env:ELTERN_EMAIL="…Eltern-Testkonto…"
$env:ELTERN_PASSWORT="…"

node tests/edge-check.mjs
node tests/last-test.mjs
```

`last-test` läuft gegen die echte Datenbank – nicht starten, wenn gerade die
ganze Stufe online ist. Stufen anpassen mit `$env:STUFEN="25x25,50x50"`
(Personen x Verbindungen).

Danach die Variablen wieder löschen:

```powershell
Remove-Item Env:TEST_PASSWORT, Env:ELTERN_PASSWORT -ErrorAction SilentlyContinue
```
