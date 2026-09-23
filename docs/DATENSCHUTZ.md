# Datenschutz, Impressum – was fertig ist und was du noch tun musst

Stand: 23.09.2026. Diese Datei ist eine Arbeitsliste, keine Rechtsberatung.
Bei einer App, in der **Daten von Minderjährigen** stehen, lohnt sich ein Blick
der Schule oder des Datenschutzbeauftragten, bevor sie unter einer eigenen
Domain öffentlich erreichbar ist.

---

## 1. Was jetzt in der App drin ist

* **Impressum** und **Datenschutzerklärung** als eigene Seiten
  (`src/components/Rechtliches.tsx`). Erreichbar
  * unter dem Anmeldeformular – also **ohne** Anmeldung, wie es sein muss
  * im eigenen Profil
* **Protokoll** über Rollen-, Zugangs-, Passwort-, Komitee- und
  Zahlungsänderungen. Nur der Admin sieht es, niemand kann es ändern oder
  löschen, nach zwei Jahren löscht es sich selbst.
* **Speicherstände** mit begrenzter Aufbewahrung (30 bzw. 90 Tage).

## 2. Betreiberangaben – kommen aus Vercel, nicht aus dem Git

Name, Anschrift und E-Mail stehen **nicht** im Code. Die App liest sie beim
Bauen aus vier Umgebungsvariablen. So landet die Privatanschrift nie in der
Git-Historie – auch dann nicht, wenn das Repo öffentlich ist.

**Einmalig in Vercel eintragen** (Browser → vercel.com → Projekt
`sv-beitraege` → Settings → Environment Variables → für *Production* und
*Preview*), danach einmal neu deployen (Deployments → ⋯ → Redeploy):

| Variable | Inhalt |
|---|---|
| `VITE_BETREIBER_NAME` | Vor- und Nachname |
| `VITE_BETREIBER_STRASSE` | Straße und Hausnummer |
| `VITE_BETREIBER_ORT` | PLZ und Ort |
| `VITE_BETREIBER_MAIL` | E-Mail-Adresse |

Fehlt eine Variable, steht an der Stelle in der App ein **gelber Platzhalter**.

Schon fest im Text (keine persönlichen Daten):

* Jahrgang und Schule: Abiturjahrgang 2028, Gymnasium Remigianum Borken
* Nutzung ab 16 Jahren (Oberstufe), jüngere nur mit Zustimmung der Eltern
* Supabase-Region: **eu-west-3 (Paris)** – laut Supabase-Projekt, also EU
* Aufsichtsbehörde: **LDI NRW**, Postfach 20 04 44, 40102 Düsseldorf
* Schriften kommen aus dem eigenen Build (`@fontsource`), **nicht mehr von
  Google Fonts** – vorher ging bei jedem Aufruf die IP-Adresse an Google,
  ohne dass das in der Datenschutzerklärung stand.

Noch gelb in der App: nur die Bestätigung der **Auftragsverarbeitungsverträge**
(siehe Abschnitt 4) – die Zeile löschen, sobald alle drei abgeschlossen sind.

**Wer ist verantwortlich?** Das ist keine Formsache. Entweder eine
volljährige Privatperson mit echter Anschrift – dann steht diese Adresse
öffentlich im Netz – oder die **Schule** als Stelle, dann muss die Schulleitung
das vorher wirklich abgesegnet haben. Beides ist möglich, ausgedacht werden
darf keines von beiden.

## 3. Braucht es überhaupt ein Impressum?

Strenggenommen gilt § 5 DDG für „geschäftsmäßige" digitale Dienste. Eine
Stufenkasse ohne Werbung und ohne Verkauf fällt da eher nicht drunter. Aber:

* Die **Datenschutzerklärung** nach Art. 13 DSGVO ist **auf jeden Fall**
  Pflicht, sobald personenbezogene Daten verarbeitet werden – und das tut
  diese App reichlich.
* Ein Impressum kostet nichts und nimmt die Diskussion vorweg. Deshalb ist
  beides drin.

## 4. Offene Punkte, die nicht im Code liegen

- [ ] **Auftragsverarbeitungsverträge** (Art. 28 DSGVO) mit **Supabase**,
      **Vercel** und **IONOS** abschließen. Alle drei bieten einen DPA an;
      bei Supabase und Vercel im Dashboard unter Legal/Privacy, bei IONOS im
      Vertragsbereich.
- [x] **Supabase-Region geprüft:** eu-west-3 (Paris). Steht so in der
      Datenschutzerklärung.
- [ ] **Unter 16?** Die App ist ab 16 freigegeben. Falls doch jemand jünger
      ist: Zustimmung der Eltern schriftlich einholen und aufbewahren
      (Art. 8 DSGVO).
- [ ] **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30 DSGVO) anlegen.
      Für diese Größe reicht eine Seite: welche Daten, wozu, wie lange, wer
      bekommt sie.
- [ ] **Löschkonzept**: Was passiert nach dem Abi mit der Datenbank? Ein
      Datum festlegen und dann auch löschen.
- [ ] **„Allow new users to sign up" im Supabase-Dashboard ausschalten**
      (steht schon länger auf der Liste in EINSPIELEN.md).

## 5. App Store – die ehrliche Antwort

Die Stufenkasse ist eine **Progressive Web App**. Eine PWA lässt sich **nicht**
in den App Store stellen. Wer das will, braucht:

* eine native Hülle (z. B. Capacitor), einen Mac mit Xcode und ein
  Apple-Developer-Programm für 99 $ im Jahr,
* und muss durch die Prüfung. Apples Richtlinie **4.2 (Minimum Functionality)**
  lehnt Apps ab, die „nicht ausreichend anders sind als die Webseite im
  Browser". Eine reine Hülle um diese App fällt genau darunter.

Apple selbst verweist für solche Fälle auf den Weg über den Home-Bildschirm –
und genau den macht der neue Knopf auf der Startseite jetzt leichter. Deshalb:
**kein App Store**, und das ist hier kein Verzicht, sondern der vorgesehene Weg.

Was trotzdem sinnvoll war: Die Punkte, an denen eine Store-Abgabe rechtlich
scheitern würde – fehlende Datenschutzerklärung, kein Impressum, keine Angabe
zur Löschung des Kontos – sind jetzt abgeräumt.

## 6. Eine Lücke, die vorher schon da war

Am 17.09. ist der Zustimmungsbildschirm aus der App geflogen
(`supabase/eltern-und-beitraege.sql`: `has_consented()` gibt seitdem immer
`true` zurück). Seitdem bekommt **niemand** beim ersten Anmelden noch einen
Datenschutzhinweis zu sehen. Die Spalte `profiles.terms_accepted_at` steht noch
da, wird aber nicht mehr benutzt.

Das ist jetzt insofern entschärft, als die Datenschutzerklärung unter dem
Anmeldeformular verlinkt ist – die Informationspflicht nach Art. 13 DSGVO ist
damit erfüllt, denn sie verlangt Information, nicht Zustimmung. Wenn ihr
zusätzlich eine **dokumentierte Kenntnisnahme** wollt (praktisch, wenn jemand
später fragt), wäre der nächste Schritt, `terms_accepted_at` wieder zu setzen –
diesmal aber als reine Bestätigung, ohne die Datenbank zu blockieren.
