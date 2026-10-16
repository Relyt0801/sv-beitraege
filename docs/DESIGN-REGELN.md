# Design-Regeln (verbindlich)

Gilt für jede Änderung an der Oberfläche – egal ob Mensch oder KI.
Ziel: **ein** ruhiges, einheitliches Apple-Design (iOS-/iPadOS-Einstellungen
als Vorbild) auf Handy, iPad und Laptop, hell und dunkel, mit und ohne
eigenes Hintergrundbild.

Anlass (Okt. 2026): Am Laptop war „Beiträge“ schmaler und linksbündig, während
Titel und Push-Hinweis breiter waren; jede Zeile hatte links einen Schalter,
ganz rechts einen roten Mülleimer; Rollen stand als zwei Spalten Karten mit
großen Auswahlfeldern da; im Kopf schimmerte der große Titel durch;
Abschnittstitel waren auf dem Hintergrundbild nicht lesbar. **Das darf nicht
wieder passieren.**

---

## 1. Breite und Ausrichtung

- **Eine Spalte für alles:** `App.tsx` gibt `mx-auto max-w-5xl px-3 sm:px-5`
  vor. Titel, Segment, Gruppen, Hinweise und Knöpfe eines Reiters fluchten
  links UND rechts an dieser Spalte.
- **Kein eigenes `max-w-*` im Inhalt eines Reiters.** Wer doch eins braucht
  (Lesetext, leerer Zustand), setzt **immer** `mx-auto` dazu **und** zentriert
  den Text. Ein `max-w-*` ohne `mx-auto` ist ein Fehler.
- Hilfsprüfung: `grep -rn "max-w-" src | grep -v mx-auto` – jede Fundstelle
  muss begründet sein (Blätter, Toasts, kleine Texte in leeren Zuständen).
- Keine Mehrspalten-Raster für Listen von Personen/Einträgen. Listen sind
  **eine** Gruppe aus Zeilen. Raster nur für echte Kacheln (Übersicht,
  Kennzahlen) und dann gleich hohe Kacheln.
- Am Laptop nie Inhalte in der Mitte des Bildschirms enden lassen, während
  anderes bis zum Rand geht.

## 2. Zeilen wie in iOS (`Gruppe`, `Zeile`, `ZeileMitSchalter`, `ZeileEingabe`)

- Aufbau einer Zeile: **links Bezeichnung** (optional zweite Zeile klein),
  **rechts Wert / Schalter / „›“**. Nie ein Schalter links neben dem Text.
- Höchstens **ein** Bedienelement pro Zeile. Braucht ein Eintrag mehrere
  (Name, Wert, Schalter, Löschen, Rolle, Komitees …): Zeile antippbar machen
  (`Zeile onClick` mit „›“) und alles in einem **Blatt** (`Sheet` +
  `SheetKopf` + `Gruppe`n) bearbeiten.
- **Löschen nie als roter Mülleimer in jeder Zeile.** Löschen steht im Blatt
  ganz unten als eigene Gruppe: `<Zeile label="… löschen" rot onClick=…/>`
  mit Rückfrage (`frage(…, "Löschen", true)`).
- „Neu anlegen“ ist die letzte Zeile der Gruppe in Blau
  (`<Zeile label="Neue …" blau onClick=…/>`) und öffnet ein Blatt mit
  `FussLeiste` + `btn-primary`. Keine bildschirmbreiten Primärknöpfe mitten
  auf der Seite am Laptop.
- Auswahl aus mehreren Möglichkeiten (Rolle, Komitees): Liste im Blatt mit
  Häkchen rechts – keine nativen `<select>`, keine Aufklapp-Menüs in Karten.
- Schalter immer über `Schalter` in `ZeileMitSchalter` (ganze Zeile tippbar).

## 3. Kopfleisten und Ebenen

- **Eine Kopfzeile, immer an derselben Stelle** (Anlass Okt. 2026: am Laptop
  stand unter der App-Leiste ein zweites Band mit Zurück, Chat-Name und
  „Chat | Übersicht“ – „die Headbar ist nach unten verschoben“):
  - Handy/iPad hoch: oben die Kopfzeile (kleiner Titel erst nach dem
    Scrollen, rechts die Knöpfe), unten die Reiterleiste. Ein geöffneter Chat
    ist eine Vollbild-Ebene mit eigener Kopfzeile oben und Eingabe unten –
    wie in iMessage.
  - Laptop/iPad quer (ab 1024 px): oben EINE Kopfzeile – links Titel (fest,
    kein großer Titel im Inhalt), rechts Seiten-Knöpfe und die Knöpfe der App
    (Hell/Dunkel, Nachtragen, Profil); darunter die Reiterleiste. Ein
    geöffneter Chat legt seinen Kopf über `ChatEbene` → `#kopf-ebene` genau
    in diese Zeile (Zurück + Name links, „Chat | Pinnwand“ rechts). Sind
    mehrere Ebenen offen, legt nur die **oberste** ihren Kopf dorthin
    (Ebenen-Stapel in `ChatBlasen.tsx`) – nie zwei Zurück-Knöpfe. Mit
    `onSchliessen` schließt Esc die oberste Ebene (nicht, solange unten Text
    im Eingabefeld steht). Auch der Kalender ist so eine Ebene.
  - Umschalter und Knöpfe für eine ganze Seite (Kasse „Personen | Beiträge &
    Abiball“, Rollen „Personen | Rechte je Rolle“, Finanzen „Für alle
    sichtbar | Alle Buchungen“ + Einnahme/Ausgabe) in `<InKopf>` packen: am
    Handy stehen sie über dem Inhalt, am Laptop rechts in der Kopfzeile
    (`#kopf-aktionen`) – wie „Chat | Pinnwand“ im Chat. Jeder Umschalter
    dort ist 19 rem breit; „+ Person/Neu“ steht links davon, damit alle
    Umschalter auf jeder Seite an derselben Stelle enden.
  - Zahlen an Reitern stehen nie im Textfluss (`GlasLeiste`: absolut an der
    Ecke) – sonst rutscht die mittig gesetzte Leiste, sobald eine Zahl kommt
    oder geht. In einem `ChatKopf` stehen Seiten-Knöpfe („+ Neu“) VOR dem
    Umschalter. Ebenen mit eigenen Pfeilen im Kopf (Kalender) beschriften den
    Zurück-Knopf („‹ Events“), die Pfeile sind blau ohne Kreis.
  - Zurück-Taste (Android/Browser) und Esc schliessen immer nur die oberste
    Ebene (`useEscapeSchliesst` in `Sheet.tsx` führt eine History-Wache);
    jede neue Ebene meldet sich dort an.
  - Die Reiter-Reihenfolge richtet sich nach der Rolle (`reiterOrdnen` in
    App.tsx) – für eine Person steht jeder Reiter immer an derselben Stelle.
    Jeder Reiter behält seine Scroll-Stelle (`useReiter`).
  - Meldungen zu Pflichtfeldern stehen in der `FussLeiste` direkt über dem
    Knopf (sonst wirkt der Knopf tot, wenn das Feld weit oben liegt).
  - Reiter noch einmal antippen geht zur Wurzel zurück (wie iOS):
    `useReiter` feuert `sv:reiter-wurzel` (detail = Reiter); wer Ebenen
    öffnet (ChatsTab, EventsTab/Kalender), hört darauf und schließt sie.
  - Keine zweite klebende Leiste unter der Kopfzeile. Neue Unterseiten als
    `ChatEbene` mit `ChatKopf` oder als Blatt (`Sheet`).
- Die Spalte (`max-w-5xl`) ist eine Variable (`--spalte`, index.css): 64rem,
  ab 1400 px 74rem, ab 1700 px 84rem. Nie eine feste Breite dagegen setzen.

- Klebende Kopfleisten (`kopf-band`, `SheetKopf`, `ChatEbene`-Kopf und -Fuß,
  Reiterleisten, Auswahl-Leiste) dürfen Inhalt **nie durchscheinen lassen**:
  Hintergrund `rgb(var(--glas))` ohne Alpha.
- **Blätter** (`Sheet`): ab 640 px oben angedockt (6 % unter dem Rand), nie
  senkrecht mittig – das ✕ steht auf jedem Blatt an derselben Stelle.
  Ein Blatt, das über einem **noch offenen** Blatt aufgeht, ist eine
  Unterseite: es steht an derselben Stelle, `SheetKopf` zeigt von selbst
  „‹ <Titel davor>“, ✕ schließt den ganzen Stapel, Esc/„‹“ eine Ebene zurück.
  Dafür das untere Blatt offen lassen – nicht `open={offen && !unterseite}`.
  Keine eigenen Zurück-/Schließen-Knöpfe bauen: `SchliessenKnopf`,
  `ZurueckKnopf`, `useBlattKopf` aus `Sheet.tsx`. Blätter mit eigenen
  Unterseiten (Motto, Album …) als `<Sheet hoch>` (am Handy volle Höhe).
- Vollbild-Ebenen tragen die Klasse `ebene-grund`, damit sie dasselbe
  Hintergrundbild zeigen wie die Seite (sonst: oben Foto, darunter schwarz).
- Banner (Push-Hinweis, Install-Karte) stehen in derselben Spalte wie der
  Inhalt, nie unter/über der Kopfleiste eingeklemmt.

## 4. Text auf dem Hintergrundbild

- Alles, was direkt auf dem Foto steht (Gruppentitel, Fußnoten, großer Titel,
  Texte leerer Zustände), bekommt die Klasse **`auf-bild`** (Gruppe macht das
  selbst). Graue Flächen auf dem Foto (Segment, Suchfeld) werden deckend
  (`.seg` in `main`, `feld-auf-bild`).
- Neue Komponenten mit Text außerhalb von Karten: `auf-bild` setzen.

## 5. Allgemein

- Schrift mindestens 12 px (Ausnahme: Reiterleiste Handy 10 px).
  Antippbare Flächen mindestens 44 × 44 px.
- Keine Emojis als Überschrift oder Knopf-Symbol; Symbole aus `Icon`.
- Farben nur über die Tokens (`--papier`, `--glas`, `--tinte*`, `brand`) –
  keine neuen Grautöne erfinden. Dunkelmodus immer mitdenken (`dark:`).
- Bestehende Bausteine benutzen statt neu bauen: `Gruppe`, `Zeile`,
  `ZeileMitSchalter`, `ZeileEingabe`, `Wert`, `Schalter`, `Sheet`,
  `SheetKopf`, `FussLeiste`, `GlasLeiste`, `TeilUmschalter`, `Suchfeld`,
  `InKopf`, `ChatEbene` + `ChatKopf`.

## 6. Prüfen, bevor etwas als fertig gilt

Jede sichtbare Änderung mit Bildschirmfotos prüfen – **mindestens**:

| Gerät   | Hell | Dunkel | Dunkel + Hintergrundbild |
|---------|------|--------|--------------------------|
| iphone  | ✔    | ✔      | ✔                        |
| laptop  | ✔    | ✔      | ✔                        |
| ipad    | bei Rastern/Leisten | | |

```bash
npm run demo -- --port 5173 --host 127.0.0.1      # Demo-Daten, keine echten Daten
cd tests && npm i                                  # einmalig (Playwright)
DARK=1 BILD=1 node geraet.mjs laptop admin beitraege 'css:[role=tab][aria-label="Beiträge"]' shot:a
```

Rollen: `schueler`, `stufenteam`, `kassenwart`, `admin`, `eltern`,
`eltern-leer`, `vorsitz` (Komitee-Vorsitz: Kostenanfragen, Vorsitz-Zeilen).
Bilder landen in `tests/ergebnisse/` (nicht im Git).
Auf jedem Bild fragen: Fluchtet alles an der Spalte? Ist jede Schrift
lesbar? Scheint irgendwo etwas durch? Steht ein Bedienelement links vom Text?
