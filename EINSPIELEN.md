# Einspielen – Protokoll, tägliche Sicherung, App-Installation, Impressum

## Was dieses Paket enthält

**1. Protokoll (nur für dich als Admin)**
Ein Protokoll, das die Datenbank selbst führt: Rollenänderungen, neue und
gelöschte Zugänge, Passwortwechsel und -rücksetzungen, Komitees, Beiträge,
Kassenbuch, Rechte. Du findest es über **dein Profil → „Protokoll & Sicherung"**.
Es taucht bei niemandem sonst auf, und **niemand kann es ändern oder löschen** –
auch du nicht. Nach zwei Jahren räumt es sich selbst auf.

**2. Tägliche Sicherung**
Jede Nacht um **0:00 Uhr deutscher Zeit** schreibt die Datenbank den Stand von
Personen, Beiträgen, Beteiligungen, Kassenbuch, Komitees, Rollen und Rechten
weg. Im selben Bereich stehen dann:

* **„Speicherstand von 21.09.2026 übernehmen"** – setzt die Daten auf den Stand
  der letzten Nacht zurück. Nur für dich als Admin, mit Rückfrage und
  Sicherheitskopie des jetzigen Stands.
* **„Sicherheitskopie herunterladen"** – als Datei. Das darf auch der
  **Kassenwart**, aber der sieht kein Protokoll und kann nichts zurücksetzen.

**3. „Zur Startseite hinzufügen"**
Eine Karte auf der Kasse-Seite und ein einmaliger Bildschirm beim ersten
Öffnen. Auf Android/Windows startet ein Tipp den echten Installationsdialog.
Auf iPad und iPhone kann das kein Browser (Apple lässt es nicht zu) – dort
steht stattdessen eine kurze Anleitung „Teilen → Zum Home-Bildschirm".
Beides verschwindet, sobald die App installiert ist.

**4. Impressum und Datenschutzerklärung**
Verlinkt unter dem Anmeldeformular (also auch ohne Anmeldung erreichbar) und
im Profil.

---

## So spielst du es ein

1. Das ZIP entpacken.
2. Den Inhalt des Ordners `sv-beitraege` in
   `C:\Users\tyler\Documents\sv-beitraege` kopieren – **überschreiben**, wenn
   Windows fragt.
3. Dort `hochladen.bat` doppelklicken.

---

## Datenbank – **hier ist etwas zu tun**

Anders als beim letzten Mal muss diesmal eine Datei in die Datenbank:

| Datei | Zustand |
|---|---|
| `supabase/protokoll-und-sicherung.sql` | **muss noch eingespielt werden** |

So geht's: Supabase-Dashboard → **SQL Editor** → **New query** → den ganzen
Inhalt der Datei hineinkopieren → **Run**. Dauert ein paar Sekunden. Die Datei
ist mehrfach ausführbar; ein zweiter Lauf schadet nicht.

> ### Die eine Sache, die wirklich schiefgehen kann
>
> Dass beim Kopieren nur ein **Teil** der Datei ankommt. Dann meldet Postgres
> so etwas wie `relation "public.daten_snapshots" does not exist` – und das
> klingt nach einem Fehler im Code, ist aber keiner.
>
> **Am sichersten kopierst du so:** auf GitHub die Datei
> `supabase/protokoll-und-sicherung.sql` öffnen und oben rechts auf
> **„Copy raw file"** klicken. Das nimmt garantiert die ganze Datei – anders
> als Markieren mit der Maus in einer Vorschau.
>
> **Vor dem Run einmal nach unten scrollen.** Die letzte Zeile muss lauten:
>
> ```sql
> select * from public.sicherung_pruefen() order by nr;
> ```
>
> und die Zeilennummer davor muss **vierstellig** sein (über 1000). Steht dort
> eine dreistellige Zahl, ist nur ein Stück angekommen: Datei noch einmal
> öffnen, **Cmd+A**, **Cmd+C**, im Editor **Cmd+A**, **Cmd+V**.
>
> Die Datei fängt die häufigsten dieser Fälle selbst ab und sagt dann im
> Klartext, was zu tun ist – aber nicht jeden möglichen Schnitt. Die
> Zeilennummer ist der sichere Test.

**Nichts nachzutippen.** Die Datei prüft sich am Ende selbst und gibt eine
Tabelle aus:

```
 nr | pruefung                                 | ergebnis
----+------------------------------------------+--------------------------------
  1 | Protokoll (Tabelle audit_log)            | ✅ da, 0 Einträge
  2 | Protokoll ist unveränderbar              | ✅ ja – niemand darf schreiben …
  3 | Protokoll-Trigger an den Tabellen        | ✅ 20 Stück
  4 | Passwortwechsel werden protokolliert     | ✅ ja
  5 | Speicherstände (Tabelle daten_snapshots) | ✅ neuester Stand vom …
  6 | pg_cron eingeschaltet                    | ✅ ja
  7 | Nächtlicher Speicherstand geplant        | ✅ ja – läuft 7 * * * * …
  8 | Wer kommt an das Protokoll               | ✅ nur die Rolle admin …
```

**Steht überall ✅, ist Schluss.** Steht bei 6 oder 7 ein ❌, dann ist nur
`pg_cron` noch aus: **Database → Extensions → `pg_cron` einschalten**, danach
dieselbe Datei noch einmal komplett ausführen. Ohne `pg_cron` funktioniert
alles andere – nur der nächtliche Speicherstand entsteht nicht von allein.

Der Job läuft stündlich (`7 * * * *`) und tut nur in der Stunde nach
Mitternacht etwas. So stimmt die Uhrzeit auch nach der Zeitumstellung, denn
`pg_cron` rechnet in UTC.

---

## Noch offen – von dir zu erledigen

- **Impressum und Datenschutzerklärung ausfüllen.** In der App sind die
  offenen Stellen gelb markiert. Was genau hin muss, steht in
  `docs/DATENSCHUTZ.md`. **Das muss vor dem Livegang unter der eigenen Domain
  passieren.**
- **Domain `remi-abi28.com`**: Anleitung in `docs/DOMAIN-IONOS.md`. Die
  IP-Adresse dort **nicht** aus irgendeiner Anleitung abschreiben – Vercel
  zeigt dir die richtige auf der Domain-Karte.
- Im Supabase-Dashboard **„Allow new users to sign up" ausschalten**.
- Testzugang `admin.test` löschen, wenn du ihn nicht mehr brauchst.
