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

- Klebende Kopfleisten (`kopf-band`, `SheetKopf`, `ChatEbene`-Kopf) dürfen
  Inhalt **nie lesbar durchscheinen lassen**. Mit Hintergrundbild ist der Kopf
  deckend (`index.css`, `html.mit-hintergrund .kopf-band::before`). Keine
  Deckkraft unter 0.94 ohne Weichzeichner.
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
  `SheetKopf`, `FussLeiste`, `GlasLeiste`, `TeilUmschalter`, `Suchfeld`.

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
`eltern-leer`. Bilder landen in `tests/ergebnisse/` (nicht im Git).
Auf jedem Bild fragen: Fluchtet alles an der Spalte? Ist jede Schrift
lesbar? Scheint irgendwo etwas durch? Steht ein Bedienelement links vom Text?
