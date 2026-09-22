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

**Danach einmal nachsehen:** Steht nach dem Lauf unten eine Meldung mit
`pg_cron`, dann ist die Erweiterung noch aus. In dem Fall:
**Database → Extensions → `pg_cron` einschalten**, danach die Datei noch einmal
laufen lassen. Ohne `pg_cron` funktioniert alles – nur der nächtliche
Speicherstand entsteht nicht von allein.

Prüfen, ob der Zeitplan steht:

```sql
select jobname, schedule, active from cron.job;
```

Da muss `stufenkasse-speicherstand` mit `7 * * * *` stehen. Der Job läuft
stündlich und tut nur in der Stunde nach Mitternacht etwas – so stimmt die
Uhrzeit auch nach der Zeitumstellung, denn `pg_cron` rechnet in UTC.

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
