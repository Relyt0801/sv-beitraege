# Anleitung: Import-Datei für die Stufenkasse erstellen

**Diese Datei ist für eine KI gedacht.** Gib sie einer KI zusammen mit einer Schülerliste
(PDF, Foto, Tabelle, Text …). Die KI soll daraus eine JSON-Datei erzeugen, die in der
Stufenkasse-WebApp über **Filter (⚙︎) → Import** eingelesen werden kann.

---

## Aufgabe für die KI

Lies die beigefügte Liste und erzeuge **genau eine** JSON-Datei im unten beschriebenen
Format. Gib am Ende nur die JSON-Datei aus (keine Erklärungen im JSON). Wenn ein Name
oder ein Häkchen unklar ist, markiere die Unsicherheit **außerhalb** des JSON in einer
kurzen Liste.

---

## JSON-Format

```json
{
  "students": [
    {
      "id": "eindeutige-id",
      "nachname": "Mustermann",
      "vorname": "Max",
      "beigetreten_ab": "EF.1",
      "verlaesst_ab": null,
      "beteiligungen": 0,
      "terms": {
        "EF.1": { "status": "bezahlt" },
        "EF.2": { "status": "offen" },
        "Q1.1": { "status": "offen" },
        "Q1.2": { "status": "offen" },
        "Q2.1": { "status": "offen" },
        "Q2.2": { "status": "offen" }
      }
    }
  ],
  "settings": { "aktuelles_halbjahr": "EF.1", "benoetigt": 3, "zusatz": 25 }
}
```

### Feld-Bedeutung

| Feld | Werte | Bedeutung |
|---|---|---|
| `id` | eindeutiger String | Pro Schüler einmalig. Nimm eine zufällige UUID (z. B. `"a1b2c3d4-..."`) oder `"s1"`, `"s2"`, … – Hauptsache **eindeutig** und **nie doppelt**. |
| `nachname`, `vorname` | Text | Original-Schreibweise **mit** Umlauten/ß/Akzenten beibehalten (`Müller`, `Weiß`, `Josée`). Nicht alphabetisch sortieren nötig – die App sortiert selbst. |
| `beigetreten_ab` | ein Halbjahr | Ab wann die Person in der Stufe ist. Standard `"EF.1"`. Bei Neuzugängen das Halbjahr des Beitritts (z. B. `"Q1.1"`). Halbjahre davor zählen dann nicht. |
| `verlaesst_ab` | ein Halbjahr **oder** `null` | Ab wann die Person weg ist. `null` = bleibt. |
| `beteiligungen` | ganze Zahl | Gesamtzahl der Beteiligungen. Wenn die Liste dazu nichts sagt: `0`. |
| `terms` | Objekt mit **allen 6** Halbjahren | Zahlungsstatus je Halbjahr. |

### Die 6 Halbjahre (immer genau diese Schlüssel, in dieser Reihenfolge)

```
"EF.1", "EF.2", "Q1.1", "Q1.2", "Q2.1", "Q2.2"
```

### Status je Halbjahr (`terms[...]["status"]`)

| Wert | Bedeutung |
|---|---|
| `"offen"` | Beitrag noch nicht bezahlt (Standard) |
| `"bezahlt"` | Beitrag bezahlt (Häkchen in der Liste) |
| `"erlassen"` | Beitrag erlassen (durchgestrichen, wegen Beteiligung o. Ä.) |

### settings

| Feld | Bedeutung | Sinnvoller Standard |
|---|---|---|
| `aktuelles_halbjahr` | Welches Halbjahr gerade läuft | `"EF.1"` (oder passend zum Stand der Liste) |
| `benoetigt` | Benötigte Beteiligungen bis Q2.2 | `3` |
| `zusatz` | Zusatzbetrag (€), fällig bei Q2.2, wenn `benoetigt` nicht erreicht | `25` |

> `settings` ist optional. Wenn du es weglässt, behält die App ihre aktuellen Einstellungen.

---

## Regeln zum Übersetzen einer typischen Liste

Eine typische Liste hat Spalten wie **Nachname · Vorname · 1. Zahlung · 2. Zahlung · Bemerkung**.

1. **Zahlungs-Spalten → Halbjahre.** Übliche Zuordnung:
   `1. Zahlung → EF.1`, `2. Zahlung → EF.2` (weitere Spalten der Reihe nach: `Q1.1`, `Q1.2`, `Q2.1`, `Q2.2`).
2. **Häkchen (✓) = `"bezahlt"`, leeres Feld = `"offen"`.**
3. **Halbjahre ohne Spalte in der Liste** bekommen `"offen"`.
4. **Durchgestrichener Name** (Person ist ganz raus) → `"verlaesst_ab": "EF.1"` (alles rot). Falls klar ist, ab wann sie ging, dieses Halbjahr nehmen.
5. **Bemerkung „Verlässt die Schule"** → `"verlaesst_ab"` auf das Halbjahr setzen, **ab dem** die Person weg ist. Ist sie das aktuelle Halbjahr noch dabei und geht danach, nimm das nächste Halbjahr.
6. **Neuzugang** (kommt erst später dazu) → `"beigetreten_ab"` auf das Beitritts-Halbjahr; frühere Halbjahre bleiben `"offen"` (sie werden von der App automatisch ausgegraut und nicht berechnet).
7. **Beteiligungen** nur setzen, wenn die Liste dazu Angaben macht, sonst `0`.
8. Namen **nicht** verändern (Umlaute/Akzente behalten), nicht kürzen, Doppelnamen als ein Feld lassen (z. B. Vorname `"Anna-Lena"`, Nachname `"Große Kleimann"`).

---

## Minimalbeispiel (3 Personen)

Liste:
```
Nachname     Vorname    1. Zahlung   2. Zahlung   Bemerkung
Müller       Jonas         ✓            ✓
Schäfer      Mia           ✓
Neumann      Tobias                                  kommt ab Q1.1
```

Ergebnis:
```json
{
  "students": [
    { "id": "s1", "nachname": "Müller", "vorname": "Jonas", "beigetreten_ab": "EF.1", "verlaesst_ab": null, "beteiligungen": 0,
      "terms": { "EF.1": {"status":"bezahlt"}, "EF.2": {"status":"bezahlt"}, "Q1.1": {"status":"offen"}, "Q1.2": {"status":"offen"}, "Q2.1": {"status":"offen"}, "Q2.2": {"status":"offen"} } },
    { "id": "s2", "nachname": "Schäfer", "vorname": "Mia", "beigetreten_ab": "EF.1", "verlaesst_ab": null, "beteiligungen": 0,
      "terms": { "EF.1": {"status":"bezahlt"}, "EF.2": {"status":"offen"}, "Q1.1": {"status":"offen"}, "Q1.2": {"status":"offen"}, "Q2.1": {"status":"offen"}, "Q2.2": {"status":"offen"} } },
    { "id": "s3", "nachname": "Neumann", "vorname": "Tobias", "beigetreten_ab": "Q1.1", "verlaesst_ab": null, "beteiligungen": 0,
      "terms": { "EF.1": {"status":"offen"}, "EF.2": {"status":"offen"}, "Q1.1": {"status":"offen"}, "Q1.2": {"status":"offen"}, "Q2.1": {"status":"offen"}, "Q2.2": {"status":"offen"} } }
  ],
  "settings": { "aktuelles_halbjahr": "EF.1", "benoetigt": 3, "zusatz": 25 }
}
```

---

## Checkliste vor der Ausgabe

- [ ] Jeder Schüler hat **alle 6** Halbjahre in `terms`.
- [ ] Jede `id` ist **eindeutig**.
- [ ] `status` ist immer `"offen"`, `"bezahlt"` oder `"erlassen"` (nichts anderes).
- [ ] `beigetreten_ab` und (falls gesetzt) `verlaesst_ab` sind eines der 6 Halbjahre.
- [ ] `verlaesst_ab` ist `null`, wenn die Person bleibt.
- [ ] Gültiges JSON (mit einem JSON-Validator geprüft, keine Kommentare, keine Kommas zu viel).
- [ ] Als Datei `stufenkasse-import.json` speichern.

**Wichtig:** Import in der App **ersetzt** die komplette Liste. Wer schon Daten in der App
hat, sollte vorher **Export** (Backup) machen.
