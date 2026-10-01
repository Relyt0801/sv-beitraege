@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo  Stufenkasse - offene Nachtraege mit Claude Code
echo ============================================================
echo.

rem ---------- Claude Code da? ----------
where claude >nul 2>nul
if errorlevel 1 (
  echo Claude Code ist auf diesem Rechner nicht installiert.
  echo Einmal installieren:  npm install -g @anthropic-ai/claude-code
  echo Danach diese Datei noch einmal starten.
  pause & exit /b 1
)

rem ---------- Zugangsdaten da? ----------
if not exist "privat\.env" (
  echo Es fehlt privat\.env mit diesen drei Zeilen:
  echo   SUPABASE_URL=https://....supabase.co
  echo   SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
  echo   NACHTRAEGE_ALS=dein.benutzername
  echo Der Ordner privat\ wird nie hochgeladen.
  pause & exit /b 1
)

if not exist "node_modules" (
  echo Installiere Abhaengigkeiten ...
  call npm install
)

rem ---------- los ----------
claude "/nachtraege"
