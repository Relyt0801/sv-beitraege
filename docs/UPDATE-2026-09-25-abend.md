# Update 25.09.2026 (ab 16 Uhr)

Zusammenfassung aller Änderungen aus den Nachrichten ab 16 Uhr. Die Details
stehen in `docs/AENDERUNGEN.md` (Abschnitt „25.09.2026: Termine in Farbe …“).

> Keine Namen, Adressen oder Schlüssel in dieser Datei – die Betreiberdaten
> fürs Impressum stehen nur in den Vercel-Variablen.

## Termine und Kalender

- **Farben** für Termine (8 zur Auswahl) und **Zeichen**: Bildzeichen wie 🧇
  oder ein Fach-Kürzel (M, EK, F7 …).
- **Ferien / unterrichtsfrei** als durchgehendes Farbband in Monat, Woche und
  Wochenstreifen.
- **Klausuren**: mehrere an einem Tag stehen als eine Zeile Kürzel
  („BI CH PH +1“), in der Woche als ein Kärtchen.
- **Stunden-Schnellwahl** im Formular: 1.–10. Stunde (7:35 … 15:30, je 45 Min.).
- „ganze Stufe · auch Eltern“ steht nicht mehr unter jedem Termin.
- Fehler behoben: Schicht über „Ändern“ bearbeitet → verlor still die
  Verbindung zu ihrer Aktion.

## Eingetragen (direkt in der Datenbank, ohne Mitteilung)

- Alle Klausuren Q1 2026/27 (125), Zeiten nach dem Stundenraster, Kürzel als Zeichen.
- 6 Kommunikationsprüfungen (Englisch, Französisch).
- Herbstferien 19.–30.10., Weihnachtsferien 23.12.–06.01., Studientag 30.11.
- Mr. Wissen to go 09.12., Crash-Kurs NRW 22.01., Berufs- und
  Studienorientierung 17.–18.03., Praktikum 12.–15.06.
- Hochschultag 12.11. war schon da – nicht doppelt.
- Waffelschichten am 08.10. und 13.10. gab es nicht – nichts gelöscht.

## Schichten

- Volle Schichten sind markiert, Eintragen dann gesperrt; Austragen geht weiter.
- Beim Verteilen zählen schon geplante Schichten mit (wenig Mithilfe zuerst).
- **Nach Schichtende**: Pop-up fürs Stufenteam + Mitteilung („Schicht vorbei“)
  → „Punkte vergeben“ trägt allen Eingeteilten die Beitragspunkte ein, genau einmal.
- Bestätigung beim Einteilen kommt jetzt auch an, wenn man sich selbst einteilt.
- Ein Konto konnte keine Schichten bestätigen (war keinem Schülereintrag
  zugeordnet) – in der Datenbank korrigiert.

## Beiträge

- Aktionen nehmen ihre Prozente aus dem Beiträge-Reiter (keine freie Zahl mehr).
- Aktions-Vorlagen lassen sich löschen bzw. aus der Auswahl nehmen.
- Einführung: „bei 100 % 0 €“ statt „keiner“.
- **Beitragshilfen / Mithilfe: Mitteilung nur noch an die Person selbst**, nicht
  mehr an die Eltern. Zahlungen (bezahlt/erlassen) gehen weiter an beide.

## Chats

- Angepinnte Nachrichten: loslösen oder ganz löschen (eigene; mit
  `chats.delete_messages` alle).
- Sperren im Chat schreibt eine kursive Zeile ohne Absender
  („… wurde von Moderator … gesperrt“); sperrt der OP: „Relyt hat … in die
  stille Ecke verbannt“.
- Das OP-Konto kann niemand sperren oder bearbeiten.
- Sicherheitslücke geschlossen: Fremde Chat-Einträge konnte bisher jeder mit
  Zugriff ändern – jetzt nur Verfasser, Team und Moderation.

## Impressum

- „Verantwortlich für den Inhalt ist immer der Ersteller/Verwalter der
  Datenbank (schulintern)“.
- Betreiberdaten als Vercel-Variablen gesetzt (`VITE_BETREIBER_*`).
- Hinweis zu den Auftragsverarbeitungsverträgen (Supabase, Vercel, IONOS).

## Server

- `supabase/termine-schichten-chat.sql` eingespielt (neue Spalten, Funktionen,
  Regeln, Cron-Job `schicht-ende` alle 5 Minuten).
- `send-push` v22 (JWT-Prüfung an).
- Rechte-Test: 125 Fälle, die 17 betroffenen geprüft – alle ok.

## Offene Punkte

- Klausurplan: „Do 25.05.“ – der 25.05.2027 ist ein Dienstag. Eingetragen wie im Plan.
- Praktikum 12.–15.06.2027: 12.06. ist ein Samstag, und am 14./15.06. stehen
  Klausuren – bitte gegen das Foto prüfen.
