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

### SQL-Dateien brechen nicht mehr beim zweiten Ausführen ab

`supabase/termine.sql` und `supabase/schema.sql` haben Tabellen ohne Schutz zur
Live-Liste hinzugefügt. Beim zweiten Durchlauf brach das Skript mittendrin ab –
und man wusste nicht, was davor noch durchgelaufen war. Jetzt ist es überall
derselbe Schutz wie in den anderen Dateien.

---

## Bewusst nicht gemacht

_(wird während der Arbeit gefüllt)_
