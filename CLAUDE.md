# CLAUDE.md – Regeln für dieses Projekt

App der Stufe (Abi 28): React + Vite + TypeScript + Tailwind (PWA),
Supabase (RLS, RPCs), Hosting auf Vercel. Sprache im Code und in der
Oberfläche: Deutsch. Antworten an Tyler: Deutsch, direkt, Schwächen zuerst.

## 1. Vertraulichkeit (hat Vorrang vor allem)

- **Keine Personendaten ins Git**: keine Namen, Logins, Passwörter, Kontakte,
  Lehrernamen, Wörter der Wortfilter-Liste. Echte Daten liegen nur in der
  Datenbank. Vertrauliche Dateien gehören nach `privat/` (ignoriert).
- Keine Schlüssel ins Git oder in den Chat: service_role nur als
  `$env:`-Variable in PowerShell, VAPID-Private-Key nur als Secret.
  `verify_jwt` bleibt an.
- Demo- und Testdaten sind erfunden (`--mode demo`).
- Protokoll ist in der App nicht löschbar – so lassen.

## 2. Ablauf

- Arbeiten auf einem Branch, erst **Vorschau** (Vercel-Preview) – nach `main`
  erst nach ausdrücklicher Freigabe durch Tyler.
- SQL mit `DELETE`/`DROP` nicht über Werkzeuge ausführen, sondern Tyler für
  den Supabase SQL Editor geben (Konsole nennen).
- Vor jedem Commit: `npm run typecheck` und `npm run build` ohne Fehler.
- Änderungen in `docs/AENDERUNGEN.md` kurz festhalten.
- Am Ende jeder Runde den Git-Stand nennen (Branch, letzter Commit, gepusht?).

## 3. Oberfläche – Pflichtlektüre: `docs/DESIGN-REGELN.md`

Kurzfassung der häufigsten Fehler, die **nicht** mehr vorkommen dürfen:

1. Kein `max-w-*` ohne `mx-auto` im Inhalt eines Reiters – alles fluchtet an
   der Spalte `max-w-5xl` aus `App.tsx`.
2. Zeilen: Text links, Wert/Schalter/„›“ rechts. Mehr als ein Bedienelement
   → Zeile antippbar, Bearbeiten im Blatt (`Sheet`).
3. Kein roter Mülleimer in Listenzeilen; Löschen unten im Blatt, mit Rückfrage.
4. Keine Karten-Raster mit großen Auswahlfeldern für Listen (Rollen,
   Personen) – eine `Gruppe` aus Zeilen.
5. Klebende Kopfleisten lassen nichts durchscheinen.
6. Text direkt auf dem Hintergrundbild: Klasse `auf-bild`.
7. EINE Kopfzeile je Gerät: am Laptop kein zweites Band darunter – ein
   geöffneter Chat legt seinen Kopf in `#kopf-ebene` (siehe Design-Regeln 3).
8. Jede sichtbare Änderung mit `tests/geraet.mjs` fotografieren: iPhone und
   Laptop, hell, dunkel und dunkel mit `BILD=1` – und die Bilder ansehen,
   bevor „fertig“ gemeldet wird.
