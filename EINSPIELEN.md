# Einspielen – Termine, Vorlagen, Vorsitz

## Was dieses Paket enthält

Den kompletten Stand aus zwei Runden Arbeit:

**Schritt 1 – Termine und Kalender**
Wochenstreifen oben im Events-Reiter, großer Kalender (Monat / Woche / Tag),
Termine anlegen mit Sichtbarkeit (alle / Komitees / einzelne Personen).

**Aktionen und Schichten**
Vorlagen wie Waffelverkauf, Kuchen backen, Waffelteig mitbringen. Eintragen,
Prozentzahl der Bewerber, Zuteilung durch das Stufenteam, Wiederholungen.

**Schritt 2 – Vorsitz und Anfragen** (neu)
Zwei Vorsitzende je Komitee, gesetzt vom Stufenteam auf der Komiteeseite.
Vorsitzende können Termine **anfragen**; das Stufenteam übernimmt sie im
normalen Terminformular oder lehnt sie mit einem Satz ab.
Außerdem: normale Termine lassen sich jetzt wiederholen
(„jeden Montag und Donnerstag bis zu den Ferien").

## So spielst du es ein

1. Das ZIP entpacken.
2. Den Inhalt des Ordners `sv-beitraege` in
   `C:\Users\tyler\Documents\sv-beitraege` kopieren – **überschreiben**, wenn
   Windows fragt.
3. Dort `hochladen.bat` doppelklicken.

Die Datei prüft erst, ob alles angekommen ist, baut die App, und lädt erst
dann hoch. Geht beim Bauen etwas schief, bricht sie ab und ändert nichts.

## Datenbank

**Nichts zu tun.** Die drei Migrationen laufen bereits in der Produktions-
Datenbank:

| Datei | Zustand |
|---|---|
| `supabase/termine.sql` | eingespielt |
| `supabase/aktionen.sql` | eingespielt |
| `supabase/vorsitz-und-anfragen.sql` | eingespielt |
| `supabase/eltern-gespraeche-loeschen.sql` | eingespielt |
| `supabase/eltern-tickets-nachtrag.sql` | war schon in der Datenbank, stand nur im Repo nicht |

Sie liegen im Paket, damit das Repo vollständig ist: Wer die Datenbank
irgendwann neu aufbaut, braucht genau diese Dateien.

## Noch offen – von dir zu erledigen

- Im Supabase-Dashboard **„Allow new users to sign up" ausschalten**.
- Testzugang `admin.test` löschen, wenn du ihn nicht mehr brauchst
  (steht auf Elternzugang, Passwort `Stufentest-2026!`).
