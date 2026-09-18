# Was geändert wurde – und was du noch selbst tun musst

Diese Datei wird bei jedem Schritt fortgeschrieben. Sie ist für Menschen
geschrieben, nicht für Entwickler: oben steht, was du tun musst, danach kommt
für jeden Punkt die Erklärung, was kaputt war und warum.

---

## ⚠️ Das musst du selbst tun

Diese Dinge kann ich nicht aus dem Code heraus erledigen – dafür brauchst du
Zugriff auf Supabase bzw. Vercel.

### 1. `supabase/pruefen.sql` ausführen und das Ergebnis anschauen

Supabase-Dashboard → **SQL Editor** → Inhalt von `supabase/pruefen.sql`
einfügen → **Run**. Die Datei ändert **nichts**, sie liest nur.

Sie beantwortet drei Fragen, von denen alles Weitere abhängt:

- Steht in der Datenbank die richtige Fassung von `has_consented()`?
  (Wenn dort die strenge steht, sind für **alle** Nutzer **alle** Listen leer –
  ohne Fehlermeldung. Das erklärt „Nachrichten tauchen nicht auf".)
- Hat `eltern_tickets` die Spalten `von_team`, `gelesen_team`, `gelesen_eltern`?
- Existieren die `termine`-Tabellen überhaupt?

### 2. `supabase/nachtrag.sql` ausführen

Danach. Diese Datei repariert, was Punkt 1 gefunden hat. Sie ist idempotent –
du kannst sie beliebig oft laufen lassen, ohne dass etwas kaputtgeht.

### 3. Prüfen, welcher Stand überhaupt live ist

Nach diesem Update steht unten im Profil (Zahnrad → ganz unten) eine
**Versionszeile** mit Datum und Commit-Kürzel. Vergleiche die mit dem letzten
Commit auf GitHub. Wenn sie nicht passt, ist der Vercel-Deploy nicht
durchgelaufen – und nicht der Code das Problem.

> **Warum das wichtig ist:** Drei der gewünschten Änderungen (Durchschnitts-%
> in der Kasse, farbige Initialen dort, beschriftete Kalender-Ansichten) waren
> zum Zeitpunkt der Fehlermeldung **bereits im Code**. Sie kamen mit dem Commit
> „Termine Schritt 1" vom 18.09. um 17:36 Uhr. Wer sie nicht sieht, schaut auf
> einen älteren Stand.

### 4. Startpasswörter der alten Konten neu vergeben

Die Browser-Warnung „Dieses Passwort wurde bei einem Datenleck gefunden" kommt
**nicht** von der App, sondern von Chrome/Safari – und nur bei Passwörtern, die
in bekannten Leak-Listen stehen. Die App erzeugt seit einiger Zeit sichere
Startpasswörter (`Anker-Muschel-472`), aber **Konten, die vorher angelegt
wurden, haben noch die alten**.

Das lässt sich nur durch Neusetzen beheben:

```bash
node scripts/reset-password.mjs
```

### 5. Push-Benachrichtigungen prüfen

Damit Benachrichtigungen aufs Handy kommen, müssen in Supabase unter
**Edge Functions → Secrets** beide Schlüssel gesetzt sein:
`VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` (erzeugen mit
`npx web-push generate-vapid-keys`). Und beide Functions (`send-push`,
`vapid-info`) müssen deployt sein.

Bisher hat die App jeden Fehler dabei **stillschweigend verschluckt**. Ab jetzt
steht im Profil eine Diagnose-Zeile, die dir sagt, woran es hängt.

### 6. Der Punkt, den du wissen musst: 300 Personen und der Free-Plan

Der Supabase-**Free-Plan erlaubt 200 gleichzeitige Realtime-Verbindungen**. Bei
300 Personen ist diese Grenze erreicht, **egal wie gut der Code ist**. Ich habe
die App deutlich sparsamer gemacht (siehe unten), aber diese Grenze kann Code
nicht wegoptimieren. Wenn wirklich 300 Leute gleichzeitig drin sein sollen,
braucht ihr den Pro-Plan.

---

## Behoben

### Man sieht jetzt, welcher Stand läuft

Unten im Profil steht eine Zeile „Stand 18.09.26, 20:15 · Version 6971ceb".
Das Kürzel ist der Commit, aus dem dieser Build entstanden ist. Stimmt es nicht
mit dem letzten Commit auf GitHub überein, ist der Deploy das Problem und nicht
der Code.

Dateien: `vite.config.ts`, `src/vite-env.d.ts`, `src/components/ProfilSheet.tsx`

### Zwei SQL-Dateien, die die Datenbank prüfen und reparieren

- `supabase/pruefen.sql` – liest nur, ändert nichts. Sagt dir, ob
  `has_consented()` die richtige Fassung hat, ob `eltern_tickets` die drei
  fehlenden Spalten hat, welche Tabellen es gibt und was live aktualisiert wird.
- `supabase/nachtrag.sql` – repariert genau das. Idempotent, beliebig oft
  ausführbar.

Was `nachtrag.sql` im Einzelnen tut:

| Was | Warum |
|---|---|
| `has_consented()` auf „immer ja" setzen | Der Zustimmungs-Bildschirm wurde entfernt, niemand setzt mehr `terms_accepted_at`. Steht in der Datenbank noch die strenge Fassung, liefern **alle** Abfragen leere Listen – ohne Fehlermeldung. |
| `eltern_tickets.von_team`, `.gelesen_team`, `.gelesen_eltern` anlegen | Diese Spalten werden in `src/eltern-store.tsx` benutzt, existierten aber in **keiner** SQL-Datei. Deshalb konnte das Stufenteam Eltern gar nicht anschreiben, und der Ungelesen-Punkt ging nie aus. |
| `topic_reads` live schalten | War als einzige Chat-Tabelle nicht dabei. Wer am Handy las, sah am Laptop weiter den roten Punkt. |
| 12 Indizes | Ohne sie liest Postgres bei jeder Chat-Ansicht die ganze Tabelle. Bei 300 Personen merkt man das. |
| `replica identity full` | Beim Löschen kam bisher nur der Schlüssel an, die App konnte nicht prüfen, ob es sie betrifft. |

### Der Scroll-Fehler aus dem Screenshot

Auf dem Bild hing die „Antworten…"-Leiste mitten im Fenster, lief über die
ganze Breite, und Nachrichten scrollten dahinter durch. Dahinter steckten vier
Fehler auf einmal:

1. Die Leiste war **nicht** auf die Inhaltsbreite begrenzt, der Text aber
   schon. Am Laptop lief sie deshalb über das ganze Fenster.
2. Ihr Abstand nach unten war fest auf die Höhe der **Handy**-Reiterleiste
   gesetzt. Am Rechner steht die Navigation aber oben – dort schwebte die
   Leiste grundlos über dem Rand.
3. Der Abstand am Seitenende reichte nicht für Leiste plus Reiterleiste.
   **Deshalb liefen die letzten Nachrichten dahinter durch.**
4. Das automatische Scrollen ans Ende richtete sich an der Unterkante des
   Fensters aus – also unter der Leiste. Der vorgesehene Freiraum lag hinter
   dem Zielpunkt und wurde einfach mitgescrollt.

Statt der zwölf geratenen Zahlen, die im Code verstreut waren (`3.6rem`,
`5rem`, `52px` – und alle widersprachen sich), misst die App jetzt beim Start
die echte Höhe von Kopf und Reiterleiste und rechnet damit. Nachgemessen im
Browser: die letzte Nachricht endet auf Handy **und** Laptop 32 px über der
Eingabezeile.

Dazu zwei Nebeneffekte:

- Beim Lesen alter Nachrichten reißt es dich nicht mehr nach unten, sobald
  jemand schreibt. Nur wer ohnehin unten steht, rutscht mit.
- Am Handy hängt sich die Leiste nicht mehr ab, wenn die Tastatur aufgeht
  (`interactive-widget=resizes-content` im Viewport).

Außerdem: die Komitee-Seite hatte eine **wortgleiche Kopie** des ganzen Chats.
Jeder Layout-Fehler musste zweimal behoben werden – beim Scroll-Fehler ist
genau das passiert. Jetzt sind es dieselben Bausteine.

### Meldungen und Rückfragen kommen wieder an

Die App hat für alles die eingebauten Fenster des Browsers benutzt: **43 Mal**
`alert()` und `confirm()`. Das hat einen Haken, den man leicht übersieht.

Nach ein paar solchen Fenstern bietet der Browser an, **„weitere Dialoge dieser
Seite zu verhindern"**. Wer das einmal anklickt, bekommt für den Rest der
Sitzung **gar nichts** mehr zu sehen – und `confirm()` antwortet dann stumm mit
„nein". Ab dem Moment passiert beim Löschen einfach nichts, und jede
Fehlermeldung fällt ins Leere. In einer installierten App sind diese Fenster
ohnehin unzuverlässig; für `prompt()` stand das schon länger im Code.

Die App zeichnet die Meldungen jetzt selbst: kurze Hinweise oben am Bildschirm
(Fehler bleiben länger stehen), Rückfragen als Fenster in der Mitte mit rotem
Knopf, wenn etwas endgültig gelöscht wird. Escape bricht ab, Enter bestätigt –
wie vorher auch. Alle 43 Stellen sind umgestellt.

### Nachrichten verschwinden nicht mehr kommentarlos

Wenn das Speichern einer Chatnachricht fehlschlug, hat die App sie **wieder
entfernt** und den Grund per `alert()` gemeldet. Kam der Hinweis nicht durch
(siehe oben), war die Nachricht spurlos weg. Genau das ist mit „Nachrichten
tauchen nicht mehr auf" gemeint.

Jetzt bleibt sie stehen und trägt den Vermerk **„⚠ Nicht gesendet – nochmal
abschicken"**. Man sieht also, dass etwas geschrieben wurde und dass es nicht
angekommen ist.

### Benachrichtigungen: Fehler sind nicht mehr unsichtbar

Der Code hat jeden Fehler beim Verschicken verschluckt:

```ts
try { await supabase.functions.invoke("send-push", …); }
catch { /* Function evtl. nicht deployt – optional */ }
```

Das sieht harmlos aus, ist aber der Kern des Problems: `functions.invoke`
**wirft gar nicht**, sondern gibt `{ data, error }` zurück – und dieses `error`
wurde nie gelesen. Fehlende Schlüssel auf dem Server, eine nicht hochgeladene
Function, ein abgelehnter Zugriff: alles blieb spurlos. Deshalb konnte niemand
sagen, warum keine Benachrichtigungen ankommen.

Jetzt gibt es im Profil unter „Benachrichtigungen aufs Gerät" die Zeile
**„Kommt nichts an? Hier prüfen"**. Sie sagt im Klartext, woran es hängt – vom
fehlenden Schlüssel auf dem Server bis zur abgelehnten Erlaubnis.

Dazu ein eigener Fehler: tote Abos werden vom Server aufgeräumt, neu eintragen
konnte sich aber **nur die Schüler- und Team-Ansicht**. Ein Elternteil, dessen
Abo einmal weggeräumt wurde, bekam nie wieder eine Benachrichtigung. Jetzt
trägt sich auch die Elternansicht wieder ein.

### Live-Aktualisierung: Verbindung wird überwacht und wieder aufgebaut

An sieben Stellen stand `.subscribe()` – **ohne Rückmeldung**. Damit war nicht
zu erkennen, ob die Anmeldung überhaupt geklappt hat. Lehnt der Server sie ab
(passiert, wenn zu viele Geräte gleichzeitig verbunden sind) oder bricht die
Verbindung weg (Handy gesperrt, WLAN gewechselt), passierte genau nichts: kein
Fehler, kein Hinweis, kein neuer Versuch. Die App zeigte einfach weiter den
alten Stand.

Neu:

- Der Verbindungszustand wird ausgewertet. Bricht sie ab, wird mit wachsendem
  Abstand neu verbunden (1 s, 2 s, 4 s … höchstens 30 s). Der Abstand ist
  Absicht: sonst klopfen nach einer Störung 300 Geräte gleichzeitig wieder an.
- Nach dem Wiederverbinden werden die Daten einmal nachgeladen – was während
  der Trennung passiert ist, hat man ja nicht mitbekommen.
- Kommt die App aus dem Hintergrund zurück oder ist das Gerät wieder online,
  wird sofort nachgesehen.
- Ist die Verbindung länger als sechs Sekunden weg, erscheint oben ein
  Streifen: „Keine Live-Verbindung – neue Beiträge kommen gerade nicht an"
  mit einem Knopf zum Neuverbinden.

### Fremde Änderungen werden nicht mehr verschluckt

Die App merkt sich kurz, was man selbst geändert hat, damit das Echo vom Server
die eigene Eingabe nicht überschreibt. Das war richtig gedacht, aber zu grob:
gemerkt wurde nur die **Zeilennummer**, und fünf Sekunden lang wurde dann
*alles* zu dieser Zeile weggeworfen – auch die Änderungen anderer Leute.

Zwei Beispiele aus dem Alltag:

- Du hakst bei Anna ein Halbjahr ab, der Kassenwart trägt zwei Sekunden später
  bei derselben Anna „verlässt ab" ein. Bei dir kam das nie an.
- Bei den Einstellungen war der Schlüssel sogar ein fester Text. Wer irgendetwas
  umstellte, machte damit für fünf Sekunden **alle** Einstellungsänderungen von
  **allen** unsichtbar.

Jetzt wird nichts mehr weggeworfen, sondern zusammengeführt: der Stand vom
Server gilt, nur die Felder, die man selbst gerade geschrieben hat, behalten
kurz Vorrang.

### Weniger Last, damit die Live-Verbindung nicht zumacht

- **Jede Anmeldung löste eine Welle aus.** Beim Start schrieb die App
  ungeprüft `has_logged_in = true` ins eigene Profil. Da Profile live übertragen
  werden, bekam jedes Team-Gerät davon eine Meldung und zeichnete die komplette
  Personenliste neu. Morgens, wenn 300 Leute die App öffnen, sind das 300
  solcher Wellen – pro Gerät. Jetzt wird nur geschrieben, wenn es noch nicht
  gesetzt ist.
- **Farbe ändern lud alles neu.** Änderte eine Person ihre Profilfarbe, holten
  sich alle anderen sofort die komplette Profilliste. Jetzt wird nur die eine
  geänderte Zeile eingepflegt.
- **Vier Abfragen liefen nacheinander** statt gleichzeitig (Personen, Beiträge,
  Vorlagen, Einstellungen). Bei 300 Personen summiert sich das beim Start.
- **Ein Fehler, der nur in der Entwicklung auftrat**, aber jede Messung
  verfälschte: drei Kanäle wurden erst nach einem Ladevorgang angemeldet; war
  die Ansicht bis dahin schon wieder weg, blieb der Kanal für immer offen. Es
  lief alles doppelt.

### Drei Dateien gelöscht, die niemand mehr benutzt hat

`MyCommittee.tsx`, `SettingsSheet.tsx` und `TopicsTab.tsx` waren nirgends mehr
eingebunden. `SettingsSheet` hing sogar noch am längst entfernten
Zustimmungs-Bildschirm.

### SQL-Dateien brechen nicht mehr beim zweiten Ausführen ab

`supabase/termine.sql` und `supabase/schema.sql` haben Tabellen ohne Schutz zur
Live-Liste hinzugefügt. Beim zweiten Durchlauf brach das Skript mittendrin ab –
und man wusste nicht, was davor noch durchgelaufen war. Jetzt ist es überall
derselbe Schutz wie in den anderen Dateien.

---

## Bewusst nicht gemacht

_(wird während der Arbeit gefüllt)_
