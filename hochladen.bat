@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo  Stufenkasse hochladen  -  Termine, Vorlagen, Vorsitz
echo ============================================================
echo.

rem ---------- 1. Liegen wir im richtigen Ordner? ----------
if not exist "package.json" (
  echo FEHLER: Hier ist kein package.json.
  echo Diese Datei muss DIREKT im Ordner sv-beitraege liegen.
  pause & exit /b 1
)
if not exist ".git" (
  echo FEHLER: Hier ist kein Git-Ordner.
  echo Kopiere die Dateien aus dem Paket in C:\Users\tyler\Documents\sv-beitraege
  echo und starte diese Datei dort.
  pause & exit /b 1
)

rem ---------- 2. Ist alles angekommen? ----------
set FEHLT=
for %%F in (
  "src\lib\termine.ts"
  "src\termine-store.tsx"
  "src\components\TerminSheet.tsx"
  "src\components\Kalender.tsx"
  "src\components\Wochenstreifen.tsx"
  "src\components\AktionSheet.tsx"
  "src\components\AktionenListe.tsx"
  "src\components\VorsitzSheet.tsx"
  "src\components\AnfrageSheet.tsx"
  "src\components\TerminAnfragen.tsx"
  "src\components\EventsTab.tsx"
  "src\components\KomiteePage.tsx"
  "supabase\termine.sql"
  "supabase\aktionen.sql"
  "supabase\vorsitz-und-anfragen.sql"
) do (
  if not exist "%%~F" ( echo FEHLT: %%~F & set FEHLT=1 )
)
if defined FEHLT (
  echo.
  echo Abbruch: Es fehlen Dateien aus dem Paket. Nichts wurde geaendert.
  pause & exit /b 1
)
echo Alle Dateien da.

rem ---------- 3. Baut es ueberhaupt? ----------
echo.
echo Baue die App (das dauert eine halbe Minute) ...
call npm run build
if errorlevel 1 (
  echo.
  echo Abbruch: Der Build ist fehlgeschlagen - es wurde NICHTS hochgeladen.
  echo Schick mir bitte die letzten Zeilen von oben.
  pause & exit /b 1
)
echo Build in Ordnung.

rem ---------- 4. Hochladen ----------
echo.
git add -A
git commit -m "Termine: Vorlagen, Kalender, Komiteevorsitz und Terminanfragen" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
if errorlevel 1 echo (Nichts zu committen - dann war schon alles gespeichert.)
git push
if errorlevel 1 (
  echo.
  echo Der Push hat nicht geklappt. Alles ist lokal gespeichert -
  echo du kannst "git push" spaeter nochmal ausfuehren.
  pause & exit /b 1
)

echo.
echo ============================================================
echo  Fertig. Vercel baut jetzt von selbst.
echo ============================================================
pause
