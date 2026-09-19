# Änderungen – Stand 19.09.2026

Diese Datei erklärt, was sich in den letzten Runden geändert hat, **wo** es im
Code steht und **warum** es so gebaut ist. Die Kommentare im Code selbst sind
ausführlich (auf Deutsch); hier steht der Überblick dazu.

> **Vertrauliches steht nicht im Repo.** Personendaten, Passwortlisten,
> Bankdaten, der `service_role`-Schlüssel und der VAPID Private Key liegen nur
> in der Datenbank bzw. als Supabase-Secret. `privat/` ist per `.gitignore`
> ausgeschlossen. Bitte so beibehalten.

---

## Überblick der Commits

| Commit | Inhalt |
|---|---|
| `6971ceb` | Termine Schritt 1: Wochenstreifen, Kalender (Monat/Woche/Tag), Sichtbarkeit je Termin |
| `cbe7b7d` | Aktionsvorlagen und Schichten, Komiteevorsitz, Terminanfragen, wiederholbare Termine |
| `8759219` | Benachrichtigungen repariert, Elternansicht überarbeitet |
| *(dieser)* | Benachrichtigungen für Termine/Schichten/Anfragen, rote Zähler, Löschen fürs Team, Verwendungszweck, Push-Diagnose |

---

## 1. Termine und Kalender

**Dateien:** `src/lib/termine.ts`, `src/termine-store.tsx`,
`src/components/Wochenstreifen.tsx`, `Kalender.tsx`, `TerminSheet.tsx`,
`supabase/termine.sql`

- Oben im Reiter **Events** steht ein Wochenstreifen (Mo–So) mit Punkten an
  Tagen mit Terminen; darüber öffnet „Kalender“ die große Ansicht.
- **Datum und Uhrzeit sind `date` / `time`, nicht `timestamptz`.** Ein Termin um
  14:00 bleibt 14:00, egal welche Zeitzone das Handy hat.
- **Sichtbarkeit** je Termin: `alle`, `komitee` (Tabelle `termin_komitees`) oder
  `personen` (Tabelle `termin_personen`). Die Regel steckt in der
  Datenbankfunktion `kann_termin_sehen()` – RLS, nicht nur Oberfläche.
  Eltern sehen nur Termine mit `fuer_eltern = true`.
- **Wiederholungen** („jeden Mo und Do bis zu den Ferien“) werden beim Anlegen
  in echte Einzeltermine umgerechnet (`wiederholungsTage()`). Absicht: fällt ein
  Tag aus, löscht man genau diesen einen.
- Termin antippen (Wochenstreifen oder Kalender) → `TerminAnsehen`. Fürs Team
  mit **„Nur diesen löschen“** und **„Alle N kommenden löschen“** (gleiche
  Bezeichnung + Uhrzeit + Aktion, ab heute).

## 2. Aktionen und Schichten (z. B. Waffelverkauf)

**Dateien:** `src/components/AktionSheet.tsx`, `AktionenListe.tsx`,
`supabase/aktionen.sql`

- Im Events-(+) gibt es den Reiter **Vorlagen**. Startvorlagen: Waffelverkauf
  1./2. große Pause 🧇, Kuchen backen 🍰, Waffelteig mitbringen 🥣.
- Eine **Schicht ist ein normaler Termin** mit `aktion_id` und `plaetze`.
  Eingeteilt = Zeile in `termin_personen` → erscheint automatisch im Kalender
  der Person als „für dich“.
- Schüler melden sich (`aktion_bewerbungen`), das Team teilt ein.
  Die Gemeldeten stehen **nach Mithilfe-Prozent aufsteigend** – wer wenig hat,
  steht oben (faire Verteilung).
- Neu fürs Team im Schicht-Fenster: Meldung streichen (✕), Direkt-Eingeteilte
  austragen, **Person per Namenssuche direkt einteilen**, Schicht löschen.
- Wer eingeteilt ist, sieht „du bist eingeteilt ✓“.

## 3. Komiteevorsitz und Terminanfragen

**Dateien:** `src/components/VorsitzSheet.tsx`, `AnfrageSheet.tsx`,
`TerminAnfragen.tsx`, `supabase/vorsitz-und-anfragen.sql`

- **Genau zwei Vorsitzende je Komitee**, gesetzt vom Team auf der Komiteeseite.
  Die Grenze steht als Trigger in der Datenbank (`vorsitz_hoechstens_zwei`).
- Vorsitzende **fragen** Termine an, sie tragen nicht selbst ein. Anfragen sind
  eine eigene Tabelle (`termin_requests`) und tauchen nie im Kalender auf.
- „Übernehmen“ öffnet das normale Terminformular **vorausgefüllt**; erst nach dem
  Speichern gilt die Anfrage als angenommen.

## 4. Benachrichtigungen (Push)

**Dateien:** `src/lib/push.ts`, `src/components/PushHinweis.tsx`, `src/sw.ts`,
`supabase/functions/send-push/index.ts`, `supabase/push-diagnose.sql`

### Was kaputt war
1. Seit 17.09. fragte die App niemanden mehr (die Frage steckte im entfernten
   Zustimmungsbildschirm) → am 18.09. war von 260 Konten genau eines angemeldet.
2. Die Knöpfe holten erst den Schlüssel vom Server und fragten **danach** den
   Browser. iPhone/Firefox lehnen die Frage dann still ab, weil sie nicht mehr
   „direkt aus dem Tippen“ kommt.
3. Der VAPID-Schlüssel in `.env`/Vercel passt **nicht** zum Server. Bei kurzem
   Serveraussetzer wurde damit ein Abo angelegt, das nie etwas empfing
   (bei einer Person 22 tote Abos).

### Wie es jetzt läuft
- `enablePush()` ruft `Notification.requestPermission()` **als Erstes** auf.
- Neue Abos nur noch mit dem **Schlüssel vom Server** (`vapid-info`).
  Der Wert aus `.env` ist nur noch Notnagel und wird zum Anlegen nicht benutzt.
- Speichern über die DB-Funktion `push_abo_uebernehmen()`: meldet sich auf einem
  Gerät ein anderes Konto an, übernimmt es das Abo (vorher scheiterte das still).
- Hat der Server ein Abo als tot entfernt, legt das Gerät beim nächsten Öffnen
  ein neues an (`sv:push-endpoint` in localStorage).
- `abmelden()` meldet das Gerät auch von den Benachrichtigungen ab.
- Oben in der App steht die Karte **„🔔 Benachrichtigungen einschalten“**
  (Schüler und Eltern); auf dem iPhone im Browser mit Anleitung „Zum Home-Bildschirm“.
- **Diagnose:** jeder Einschaltversuch landet mit Browserkennung in
  `push_diagnose` (lesen nur fürs Team). Abfrage:
  `select created_at, schritt, fehler, erlaubnis, ua from push_diagnose order by created_at desc;`

### `send-push` (Edge Function)
- Nur noch **angemeldete** Absender (vorher reichte der öffentliche App-Schlüssel –
  damit hätte jeder beliebigen Text an alle Handys schicken können).
- Modi: `user_ids` (direkt), `event_id` (Beitrag), `termin_id` (an alle, die den
  Termin sehen dürfen – gleiche Regeln wie im Kalender), `an_team`.
- `url` bestimmt, wohin ein Tippen führt (`./#events`, `./#chats`, `./#infos`);
  nur Ziele innerhalb der App sind erlaubt.
- `probe: true` zählt nur die Empfänger, verschickt nichts (zum Testen).
- Versand mit `urgency: high`, `TTL: 1 Tag`.

### Welche Meldungen es gibt
| Auslöser | Titel | Text |
|---|---|---|
| Schicht zugewiesen / ausgetragen | 🧇 Waffelverkauf 1. große Pause | „Das Stufenteam hat dich für Mo, 12.10.26 (09:10–09:30) eingeteilt.“ |
| Neue Schichtreihe | Aktion | „12 Schichten von … bis … – jetzt eintragen!“ (eine Meldung) |
| Neuer Termin | Terminname | Datum · Uhrzeit · Ort |
| Terminanfrage | ans Team / zurück an den Vorsitz | angenommen oder abgelehnt mit Grund |
| Team → Eltern | Betreff | „Das Stufenteam schreibt: …“ |
| Chat, Komitee | wie bisher | – |

### Geräte
- Android (Chrome/Samsung): ja. Windows/Mac: ja, solange der Browser läuft.
- iPhone/iPad: **nur** als App vom Home-Bildschirm (Apple-Vorgabe).
- **Firefox: noch offen.** Seit dem Update kam kein Firefox-Abo an; die Ursache
  soll die Tabelle `push_diagnose` zeigen.

## 5. Rote Zähler („wo wartet etwas?“)

- Reiter **Events**: ungelesene Beiträge + neue Termine + (Team) offene Terminanfragen.
- Knopf **Kalender**: Anzahl neuer Termine; darunter ein Hinweis, der direkt zum
  Datum springt. „Neu“ = seit dem letzten Öffnen des Kalenders angelegt oder neu
  eingeteilt; gemerkt pro Gerät (`sv:termine-gesehen:<uid>`).
- Reiter **Chats**: fürs Team inklusive ungelesener Elterngespräche; die haben
  zusätzlich ein „N neu“.
- Komiteeseite: Knopf **Chat** trägt die Zahl neuer Nachrichten.
- Zahl auch am **App-Symbol** (Badging-API, wo unterstützt).

## 6. Elternansicht

**Dateien:** `src/components/ElternApp.tsx`, `KontoTab.tsx`,
`TicketErklaerung.tsx`, `ElternInfosTab.tsx`, `Ring.tsx`

- Oben steht **„Familie <Nachname>“** statt „Mein Zugang“.
- Prozent als „N %“.
- Ticket-Erklärung: Zusatzbeitrag gilt **nur für das 1. Ticket des eigenen
  Kindes**; „Jedes weitere Ticket“ zeigt den Preis oder „Preis noch offen“.
- Konto: **Verwendungszweck zum Kopieren** je Kind („Adams, Tyler Q1“);
  IBAN steht in einer Zeile (auch auf 360 px).
- Infos: Feld „Betreff“ mit kurzem Platzhalter.

## 7. Datenbank-Migrationen

Alle sind in der Produktions-Datenbank **bereits eingespielt**; die Dateien liegen
im Repo, damit ein Neuaufbau funktioniert:

| Datei | Inhalt |
|---|---|
| `supabase/termine.sql` | Termine, Sichtbarkeit, `kann_termin_sehen()` |
| `supabase/aktionen.sql` | Aktionen, Bewerbungen, Startvorlagen |
| `supabase/vorsitz-und-anfragen.sql` | Komiteevorsitz, Terminanfragen |
| `supabase/eltern-gespraeche-loeschen.sql` | Löschrechte für Elterngespräche |
| `supabase/eltern-tickets-nachtrag.sql` | Spalten `von_team`, `gelesen_*` (fehlten im Repo) |
| `supabase/push-diagnose.sql` | `push_diagnose`, `push_abo_uebernehmen()` |

## 8. Offen

- Firefox-Benachrichtigungen (siehe oben, Diagnose abwarten).
- VAPID-Wert in `.env`/Vercel an den Server angleichen oder entfernen
  (wird nicht mehr zum Anlegen benutzt, stiftet aber Verwirrung).
- Supabase-Dashboard: „Allow new users to sign up“ ausschalten.
- Jeder angemeldete Nutzer kann über `send-push` an jeden senden – ggf. auf
  Team bzw. gemeinsame Chats einschränken.

---

## 9. Nachtrag: Lesebestätigung, Chat-Leiste, Eltern in Komitees

- **Gelesen-Stand wurde nie gespeichert.** Fünf Stellen schrieben mit
  `void supabase.from(...).update(...)`. Supabase-Abfragen laufen aber erst los,
  wenn jemand `.then()`/`await` aufruft – `void` allein schickte nie etwas ab.
  Folge: `topic_reads`, `event_reads`, `gelesen_team/_eltern` und
  `has_logged_in` waren für alle leer, nach jedem Neuladen stand wieder
  „5 neue Nachrichten“ da. Jetzt mit `.then()` (Dateien: `topics-store.tsx`,
  `events-store.tsx`, `eltern-store.tsx`, `auth/RoleProvider.tsx`).
  **Regel für neuen Code: nie `void supabase…` ohne `.then()`.**
- `has_logged_in` wird nur noch einmal gesetzt (jede Änderung an `profiles`
  lässt sonst das ganze Team neu laden).
- **Chat-Eingabe am Rechner:** Die Leiste saß 3,6 rem über dem Rand (Platz für
  die Handy-Navigation, die am Rechner fehlt); darunter liefen Nachrichten
  durch. Jetzt ab `lg` ganz unten (`KomiteePage.tsx`, `ChatBlasen.tsx`).
- **Eltern in Komitees** (`supabase/eltern-ohne-komitee.sql`, eingespielt):
  Ein Elternzugang stand in „abizeitung“ und bekam Komitee-Nachrichten.
  Aufgeräumt; Trigger verhindert das künftig; wird ein Konto zu „eltern“, fliegt
  es aus allen Komitees; `can_access_topic()` sperrt Chats für Eltern zusätzlich.
- **Kontodaten:** einheitliche Zeilen (Beschriftung oben, Wert darunter),
  IBAN in normaler Schrift statt Schreibmaschinenschrift.

---

## 10. Finanzen-Reiter (Kassenbuch) und neuer Beiträge-Reiter

**Dateien:** `src/components/FinanzenTab.tsx`, `src/lib/finanzen.ts`,
`supabase/finanzen.sql` (eingespielt), `BeitraegeTab.tsx`, `permissions.ts`

- **Kontostand = Summe aller Buchungen** in `kasse_buchungen` (Beträge in Cent).
  Keine Bankverbindung; einmal über „Mit der Bank abgleichen“ auf den echten
  Stand bringen – die Differenz wird als Buchung `abgleich` festgehalten.
- **Beiträge buchen sich selbst:** Trigger `beitrag_buchen` auf `students`.
  „bezahlt“ → Einnahme; „bezahlt“ zurückgenommen → Buchung weg (bzw.
  Gegenbuchung, wenn die Zahlung von vor dem Kassenbuch war). Nur bei UPDATE,
  damit ein Import nicht doppelt zählt.
- Was vor dem Kassenbuch schon bezahlt war, steht als **eine Sammelbuchung je
  Halbjahr** drin (EF.1: 111 Personen, EF.2: 100 Personen).
- Kreisdiagramm: Einnahmen nach Quelle (Beiträge, Aktionen, Spenden,
  Sonstiges) im Verhältnis zum **Zielbetrag** (`kasse_einstellungen`).
  Farben aus der geprüften, farbenblind-sicheren Palette; hell/dunkel getrennt.
- Verlauf mit Filtern, Suche, Monatssummen; Realtime → sofort aktuell.
- **Rechte:** `finanzen.view` (lesen) und `finanzen.manage` (buchen).
  Standard: nur Admin und Kassenwart. Der Admin kann im Rechte-Reiter
  (Kategorie „Finanzen“) Rollen oder einzelnen Personen das Lesen erlauben.
  Durchgesetzt per RLS, nicht nur in der Oberfläche.
- Beiträge-Reiter: drei Kacheln oben (Prozente · Halbjahre · Ticket) mit der
  wichtigsten Zahl; ein Bereich zur Zeit statt allem untereinander.
