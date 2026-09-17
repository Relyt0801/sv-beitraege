@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Stufenkasse: alles hochladen ===
echo.
git rm -q --ignore-unmatch src/auth/TermsGate.tsx src/components/TermsText.tsx
git add -A src/ scripts/ supabase/
git commit -m "Halbjahresbeitraege, Elternzugaenge, DSGVO raus, einheitliche Personenzeile in Rollen und Rechte"
git push
echo.
echo === Fertig. Vercel baut jetzt neu. ===
echo.
pause
