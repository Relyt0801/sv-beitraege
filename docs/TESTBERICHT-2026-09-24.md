# Testbericht 24./25.09.2026

Anlass: Einige Komitees gab es doppelt, und Eltern bekamen „Infos für Eltern“
nicht als Pop-up. Dazu kam eine ausführliche Testphase mit Rechten, Last,
Edge Functions, Datenschutz und Oberfläche.

Alle Tests liefen gegen die echte Datenbank, aber nur **lesend oder in
zurückgerollten Transaktionen**. Die Oberflächentests liefen im Demo-Modus.
Wiederholen lassen sie sich mit den Werkzeugen aus `tests/README.md`.

## Kurzfassung – zuerst die Schwächen

1. **Die Eltern-Pop-ups sind repariert, es kommt aber trotzdem noch nichts an.**
   Von 133 Elternzugängen hat sich bisher einer angemeldet, und **keiner** hat
   Mitteilungen erlaubt. Eine Meldung kann nur ankommen, wenn die Eltern sich
   anmelden und „Mitteilungen erlauben“ tippen. Auf dem iPhone geht das nur in
   der Home-Bildschirm-App (ab iOS 16.4). Das kann keine Code-Änderung ersetzen.
2. **Selbst verursacht:** Beim Beschleunigen der Zugriffsregeln konnten sich
   Schüler etwa 10 Minuten lang nicht selbst in ein Komitee eintragen (Fehler
   „infinite recursion detected in policy“). Das habe ich sofort behoben, die
   Ursache steht unten und in `supabase/rls-schneller.sql`.
3. **Zwei echte Sicherheitslücken** waren offen und sind jetzt geschlossen:
   Jeder Schüler konnte sich über die Schnittstelle selbst in den Aufsichtsrat
   eintragen und dann das ganze Kassenbuch lesen. Außerdem konnte jedes Konto
   beliebigen Text als Pop-up an beliebige Handys schicken.
4. **Datenschutz im öffentlichen Repo:** In Kommentaren, einem Beispielbefehl,
   einer Skript-Liste und im Änderungsprotokoll standen echte Schülernamen
   bzw. Nutzernamen. Im aktuellen Stand sind sie ersetzt. **In der
   Git-Historie auf GitHub stehen sie weiter** (siehe offene Punkte).
5. **Nicht mit Anmeldung geprüft:** Die neuen Skripte `tests/edge-check.mjs`
   und `tests/last-test.mjs` sind in dieser Form nur ohne Anmeldung gelaufen.
   Die gleichen Fälle liefen vorher als einzelne Test-Skripte, und dabei war
   alles grün. Einmal selbst mit Testkonten laufen lassen (siehe README).

## 1. Doppelte Komitees

**Ursache (24.09., 12:57):** Ein Konto wurde live von „Schüler“ auf
„Stufenteam“ umgestellt. Die offene App hatte noch die Chat-Liste aus der
Schülersicht, in der nur das eigene Komitee zu sehen war, bekam aber sofort das
Recht „Chats verwalten“. Die Regel „fehlende Chats einmal anlegen“ hielt alle
unsichtbaren Chats für fehlend und legte 8 Chats ein zweites Mal an.

**Behoben**

- Datenbank (`supabase/komitee-chats-eindeutig.sql`, eingespielt):
  - Die Doppelten sind zusammengeführt. Der älteste Chat bleibt, Nachrichten,
    Mitglieder, Ordner und Lesestände ziehen mit um.
  - Ein Trigger überspringt doppeltes Anlegen still.
  - Ein eindeutiger Index ist die harte Grenze, auch bei gleichzeitigen
    Aufrufen.
- App (`ChatsTab.tsx`): Fehlende Chats legt nur noch an, wer **alle** Chats
  sieht.

**Grenze:** Bei einem Live-Rollenwechsel kann die App-Regel allein weiter
danebenliegen, weil Recht und Liste nicht gleichzeitig aktualisiert werden.
Deshalb sitzt die eigentliche Sperre in der Datenbank.

**Nachweis:** 9 Chats (8 Komitees und der Stufenteam-Chat), jeder genau
einmal. Auch der Test an der echten Seite als Admin zeigte jedes Komitee nur
einmal.

## 2. „Infos für Eltern“ ohne Pop-up

**Ursache:** „Veröffentlichen“ hat die Info nur gespeichert und nie eine
Meldung ausgelöst.

**Behoben**

- `send-push` v19 hat einen neuen Modus `eltern_info_id`:
  - Auslösen darf nur das Team.
  - Empfänger sind alle Elternzugänge mit zugeordnetem Kind.
  - Angeheftete Infos kommen mit 📌, das Tippen öffnet den Reiter „Infos“.
- Die App ruft den Modus nach dem Speichern auf.
- Doppeltipp-Schutz auf „Veröffentlichen“, sonst entstünden zwei Infos und
  zwei Meldungen.
- Der Hinweistext für das Team sagt jetzt, dass nur Eltern mit erlaubten
  Mitteilungen ein Pop-up bekommen.

**Nachweis (Probelauf ohne Versand, gegen `send-push` v19)**

- Ein Elternkonto kann den Modus nicht auslösen (403).
- Eine unbekannte oder kaputte Info-Kennung führt zu 404.

**Grenze**

- Siehe Kurzfassung Punkt 1.
- Mit einer echten Info lief es nicht, weil gerade keine existiert. Die
  Empfängerliste (alle Elternzugänge mit Kind) ist nur am Code geprüft.
- Die Zustellung aufs Handy war nicht testbar.
- Der erste echte Test: eine Info veröffentlichen, während ein Eltern-Testgerät
  Mitteilungen erlaubt hat.

## 3. Rechte und Sicherheit

**Rechte-Test** (`supabase/tests/rechte-test.sql`, 106 Fälle, alle Rollen
inklusive „nicht angemeldet“): **105 ok · 0 Abweichungen · 0 unklar ·
1 Hinweis.**

- Jeder Fall läuft in einer eigenen Transaktion, die sofort zurückgerollt wird.
- Die Testpersonen sucht der Test selbst aus. Es gibt keine festen Kennungen
  in der Datei.
- Neu ist die Bewertung „unklar“ statt stillem „ok“: Ein Versuch, der aus einem
  anderen Grund scheitert (z. B. eine Spalte wurde umbenannt), wird angezeigt.
  Vorher hätte er als „verboten“ gegolten und dabei nichts geprüft.

**Gefunden und geschlossen**

| Lücke | Wie | Behoben in |
|---|---|---|
| Schüler trägt sich selbst in den Aufsichtsrat ein → liest Kassenbuch und Kostenanfragen | ein Aufruf an die Schnittstelle | `supabase/aufsichtsrat-schutz.sql` |
| Jedes Konto schickt beliebigen Text an beliebige Handys | `send-push` Direkt-Modus ohne Prüfung | `send-push` v19 |
| Fremde Chat-, Termin- und Event-Meldungen auslösen, eigener Text über fremde Termine | `send-push` | `send-push` v19 |
| Ohne Anmeldung: Kennung des Betreiber-Kontos abfragen und über `audit_name` den Namen dazu | öffentlicher Schlüssel reicht | `supabase/anon-abdichten.sql` |

Nach `anon-abdichten.sql` schreibt das Protokoll weiter. Der OP-Schutz greift
weiter, das ist in einer zurückgerollten Transaktion geprüft.

**Hinweis (bewusst offen):** Der Kassenwart kann eine Buchung als
„automatisch“ markieren. Das ist Teil der Arbeit im Zweig
`eltern-kinder-apple-design`.

**Edge Functions:** Ohne Anmeldung, mit falschem Token und bei kaputtem JSON
kommt die richtige Ablehnung. Überlange Titel und Texte werden gekürzt
(80/200 Zeichen). Der Direkt-Modus ist auf 500 Empfänger gedeckelt.

## 4. Geschwindigkeit und Last

- **Zugriffsregeln 30- bis 95-mal schneller** (`supabase/rls-schneller.sql`):

  | Tabelle | vorher | nachher |
  |---|---|---|
  | Konten | 32–37 ms | 0,4–0,5 ms |
  | Personen | 15–54 ms | 0,5–0,7 ms |
  | Profile | 19–40 ms | 0,6–0,8 ms |
  | Kinder-Zuordnung | bis 54 ms | 0,6 ms |

  Der Vergleich über 9 Rollen × 43 Tabellen (387 Vergleiche) ergab
  0 inhaltliche Unterschiede.
- **Stolperstein dabei:** Eine Regel, die ihre eigene Tabelle abfragt, führt
  nach dem Umbau zu „infinite recursion“. Daher kam die 10-Minuten-Störung aus
  der Kurzfassung. Jetzt übernimmt das die Funktion `hat_eigenes_komitee()`,
  und `rls-schneller.sql` lässt solche Tabellen aus.
- **Lasttest:** 260 Personen öffnen gleichzeitig die App (je 22 Startabfragen):
  5.720 Anfragen, **0 Fehler**, rund 340 Anfragen pro Sekunde, gemessen aus der
  Cloud-Testumgebung.

## 5. Oberfläche (UI/UX)

**`tests/ui-check.mjs`:** 200 Ansichten = 7 Rollen × 4 Größen (320, 390,
768, 1280 px) × hell/dunkel × jeder Reiter.

| Prüfung | Ergebnis |
|---|---|
| Etwas steht seitlich über | 0 |
| Letzter Inhalt unter der Tab-Leiste | 0 |
| Knöpfe ohne Namen | 0 |
| Fehler in der Konsole | 0 |
| Stellen mit zu wenig Kontrast | **30** (vorher 442) |

Alle 30 Kontrast-Stellen liegen knapp unter der Norm: 4,1–4,4:1 statt 4,5:1.

**Vorher gefunden und behoben**

- Lange Namen oder Links ohne Leerzeichen schoben auf schmalen Handys die
  Tab-Leiste aus dem Bild.
- Die Auswahl „Komitee-Zugriff“ war breiter als der Bildschirm.
- Kontrast: Markenfarbe im Hell- und Dunkelmodus, halbtransparente weiße
  Schrift, automatische Schriftfarbe auf farbigen Kreisen.
- Fehlende Beschriftungen für Vorleser: Eingaben in „Beiträge“, Leiste der
  Halbjahre.
- Zu kleine Tippflächen: „Offen“ auf der Personenkarte, „Mithilfe“.

**`tests/masse-check.mjs`:** 400 Personen mit extremen Namen, 1.500
Nachrichten, auf 320 und 390 px, als Admin und als Schüler.

| Messung | Ergebnis |
|---|---|
| Start | 1,3–1,4 s |
| Chat öffnen | ca. 0,4 s |
| 60 schnelle Reiterwechsel | 2–3 s, keine Blockade über 50 ms |
| Speicher | 32–46 MB |
| Doppeltipp auf „Senden“ | genau 1 Nachricht |
| Nachricht nur aus Leerzeichen | wird nicht gesendet |
| Seitliches Überstehen | nie |

Gemessen wurde auf einem schnellen Rechner. Alte Handys sind spürbar
langsamer.

**Test an der echten Seite:** Anmeldung als Admin, jeden Reiter geöffnet,
keine Fehler. Jedes Komitee war nur einmal da.

## 6. Nicht geprüft

- **Realtime** (Live-Aktualisierung): Websockets gingen in der Testumgebung
  nicht.
- **Echte Zustellung von Pop-ups** aufs Handy. Getestet ist nur bis zum
  Server (Probelauf).
- **Alte oder langsame Handys**, iOS Safari selbst (getestet mit Chromium).
- `edge-check.mjs` und `last-test.mjs` **mit Anmeldung** in der Repo-Fassung
  (siehe Kurzfassung Punkt 5).

## 7. Offene Punkte

| Punkt | Warum | Wer/wo |
|---|---|---|
| Eltern zum Anmelden und „Mitteilungen erlauben“ bringen | sonst kommt kein Pop-up an | Stufenteam, z. B. Elternbrief |
| `maximum-scale=1` im Viewport entfernen? | verhindert Zoomen (WCAG 1.4.4), axe meldet es auf jeder Seite; dafür zoomt iOS beim Tippen in Felder nicht mehr | Entscheidung |
| 30 Kontrast-Stellen, 16×16-Häkchen in „Beiträge“ | knapp unter der Norm | nach dem Zusammenführen mit dem Apple-Design-Zweig neu prüfen |
| Echte Namen in der Git-Historie | Repo ist öffentlich | Historie bereinigen (Force-Push) oder Repo privat stellen – Entscheidung |
| Zweig `eltern-kinder-apple-design` | noch nicht in main, `supabase/eltern-kinder.sql` nicht eingespielt, Konflikte beim Zusammenführen | Entscheidung |
| Aktuelles Halbjahr steht auf EF.2 | stimmt das? | Einstellungen |
| Zwei Admin-Konten sind zusätzlich als Elternteil zugeordnet (eins davon der eigenen Person) | vermutlich Reste aus Tests | Rollen-Reiter |
| Supabase: Schutz vor geleakten Passwörtern aus | Warnung im Security Advisor | Dashboard → Authentication |
| 6 Funktionen ohne festen `search_path` | Warnung im Security Advisor, geringes Risiko | SQL |
| Eltern können alle Anzeigenamen lesen (`public_profiles`) | mehr als nötig | SQL-Regel |
| Ein 782-KB-Bundle, rund 35 Anfragen beim Start | Ladezeit auf alten Handys | später: Lazy Loading, Abfragen bündeln |
| `supabase/alles-neu.sql` ist veraltet | endet bei `rollen-nur-admin.sql`, viele spätere Dateien fehlen (auch die vier neuen) – ein Neuaufbau daraus hätte die alten Lücken | neu zusammenstellen, am besten nach dem Zusammenführen der Zweige |

**Spuren der Tests:** Im Protokoll stehen Einträge von „System“ am Testkonto
„Familie Test“ (Passwort und Rolle, jeweils zurückgestellt). Das Testkonto
wurde dabei abgemeldet.
