# Änderungen – Stand 03.10.2026

Diese Datei erklärt, was sich in den letzten Runden geändert hat, **wo** es im
Code steht und **warum** es so gebaut ist. Die Kommentare im Code selbst sind
ausführlich (auf Deutsch); hier steht der Überblick dazu.

> **Vertrauliches steht nicht im Repo.** Personendaten, Passwortlisten,
> Bankdaten, der `service_role`-Schlüssel und der VAPID Private Key liegen nur
> in der Datenbank bzw. als Supabase-Secret. `privat/` ist per `.gitignore`
> ausgeschlossen. Bitte so beibehalten.

---


## 10.10.2026: Fotos, Sprungziele, Scrollen

- **Steckbrief-Fotos** (`supabase/album-fotos.sql`, `lib/album-fotos.ts`, `FotoFreigaben.tsx`):
  - Jede Person kann ein Foto hochladen; es liegt im privaten Bucket `album-fotos`.
  - Andere sehen es erst, wenn das Stufenteam es freigegeben hat (Freigabe-Art `foto`, Standard 3, im Profil → Freigaben einstellbar).
  - Ein neues Hochladen ergibt eine neue Version, die erneut freigegeben werden muss.
- **Mitteilung antippen → direkt hin**: Chat-Mitteilungen öffnen `#chat-<id>` (send-push v28), Kosten- und Foto-Anfragen springen direkt zur Prüfstelle.
- **Scrollsperre am Handy behoben** (`lib/scrollsperre.ts`): Ein Zähler statt Speichern und Wiederherstellen pro Blatt. Bisher konnte ein Blatt, das sich überlappend schloss, die Sperre stehen lassen.
- **Kopfzeile im Chat**: Das Band geht über die volle Breite, ohne Unschärfe, wenn ein Hintergrundbild gesetzt ist. Neben „Ändern“ gibt es keine Vorschau mehr.
- **Chats**: Unter der letzten Nachricht entsteht kein Leerraum mehr. Die Reaktionsauswahl steht in 2 Zeilen zu je 5.
- **ⓘ „Von wem“**: Das Fenster wird jetzt über den Body gelegt und an den Bildschirmrand angepasst, damit es nicht mehr abgeschnitten wird.
- **🔥-Zahlen sehen** ist für Zitate und Motto direkt in der Wand einstellbar. Sind die Zahlen sichtbar, können alle nach Top/Neu sortieren.
- **Zitate ohne doppelte Anführungszeichen**: Der Trigger `zitat_zeichen_weg` (`supabase/zitate-ohne-anfuehrungszeichen.sql`) entfernt sie; die bestehenden Zitate sind bereinigt.
- **Steckbrief-Farben**: Es gibt 16 Verläufe, und der Hash wird besser gemischt, sodass die Farben wieder bunt sind.

## 09.10.2026 (3): Feedback zu Update 1.3

- **Bunte Karten zurück** (`Kachel.tsx` → `FarbKarte`): Album rot-pink, Motto orange, Zitate dunkel mit Gold, Rankings blau/grün. Jede Karte hat eine kräftige Farbe, Verläufe gibt es nur innerhalb dieser Farbe, kein Lila. Runden-Marke und „♥ Sieger der Herzen“ stehen auf den Karten.
- **Honorable Mentions / Sieger der Herzen** (`supabase/honorable-mentions.sql`, `Runden.tsx`):
  - Beim Start einer Runde wählt das Komitee neben der Wahl auch Honorable Mentions aus (♥). Das geht beim Motto und bei den Zitaten; die Anzahl ist einstellbar (Top X).
  - Die Honorable Mentions bekommen ein eigenes, inoffizielles Voting mit genau 1 Stimme. Eine neue Herzstimme ersetzt die alte.
  - Sie zählen nicht zur Wahl und haben eigene Farbe, eigenen Zähler und eigenes Ergebnis.
  - Je Runde abschaltbar (`runde_hm_setzen`).
- **Ergebnisse sehen: Nur Komitee | Alle** – bei jeder Abstimmung:
  - Runden: beim Start und laufend (`runde_starten` mit 7 Parametern).
  - Motto, Zitate, Rankings: `app_settings.ergebnisse` und `ergebnisse_setzen`. Die Zahlen kommen aus `stimmen_zahlen()`, ohne zu verraten, wer was gewählt hat.
  - Umfragen: wie bisher je Umfrage.
  - Admins sehen immer alles.
- **Ausgetretene ausblenden** (`supabase/ausgetretene-ausblenden.sql`, `noch_dabei()`): Wer im laufenden Halbjahr oder früher „verlässt“, fehlt in Album, Rankings (auch Top 3) und bei den Zitat-Namen. In der Rollenliste gibt es einen Schalter dafür; in der Kasse bleibt die Person.
- **Neues Passwort**: 8 Zeichen aus Buchstaben und Ziffern, ohne 0/O/1/l/I (Edge Function `person-anlegen` v6).
- **Hintergrundbild**: bis 2560 px, WebP/JPEG 90 %. Ist das Original klein genug, bleibt es unverändert. Gespeichert wird in der Cache API, das Bucket-Limit liegt jetzt bei 6 MB.
- **Chat-Reaktionen**: 😁 😭 ❤️ sind neu dazugekommen. Über „+“ geht jedes Emoji, die Datenbank prüft den Emoji-Filter. Der Constraint-Tausch steht in `supabase/reaktionen-frei.sql` (läuft im SQL Editor).
- **Chat-Kopf**: deckend statt Glas; am Laptop als Karte ohne Farbschein.
- **Nach dem Livegang**: `supabase/stimmen-schuetzen.sql`. Danach liest jede/r nur noch die eigenen Zitat-Stimmen.

## 09.10.2026 (2): Update 1.3 – Runden, Freigaben, Apple-Design

Erst als Vorschau für Admin und Testkonto: Branch `update-1-3` → Vercel-Vorschau.
Die Datenbank-Teile sind schon eingespielt und stören die alte Version nicht.

- **Abstimmungsrunden:** Motto, Zitate, Rankings (je Kategorie) und Umfragen (je Frage).
  - DB in `supabase/runden-und-freigaben.sql`: `abstimm_runden`, `runden_kandidaten`,
    `runden_stimmen` und die RPCs `runde_starten`, `runde_aendern`, `runde_stimme`, `runde_zahlen`.
  - App: `lib/runden.ts` und `components/Runden.tsx`.
  - Neue Rechte `<bereich>.runden`, auch für Komitees.
- **Freigaben:** Wie viele zustimmen müssen (Termine, Kosten, Entsperren, Zitate), mit
  Trigger-Prüfung in der DB. Nachtrag-Bearbeiter in `nachtrag_bearbeiter`.
  App: `lib/zustimmung.ts` und `components/FreigabenSheet.tsx`.
- **Wortfilter:**
  - Wörter löschen, Liste durchsuchen.
  - Je Bereich an/aus (`app_settings.wortfilter_bereiche`); Zitate standardmäßig aus.
  - Links und Spotify-IDs zählen nicht (`wf_ohne_links`).
  - Schalter auch direkt in den Bereichen (`WortfilterSchalter`).
- **ⓘ Einreicher:** `autor_info()` nur für Verwaltende. „Meine“ Einträge über `meine_eintraege()`.
  `supabase/autor-spalten-schuetzen.sql` sperrt die Namensspalten – **erst nach dem Livegang** ausführen.
- **Passwort zurücksetzen:** Edge Function `person-anlegen` mit `passwort_neu_fuer`.
  Das Passwort wird einmal angezeigt; im Protokoll steht, wer es war.
  App: `components/PasswortNeu.tsx`.
- **Hintergrundbild:** privater Storage-Bucket `hintergruende` (nur eigener Ordner),
  `profiles.hintergrund_at`.
  App: `lib/hintergrund.ts` und `components/HintergrundEbene.tsx`.
- **Funktionen/Rechte:** nach Thema zugeklappt. Neue Rechte `funktion.<name>`, damit Komitees
  ihren Bereich selbst schalten.
- **Design:**
  - Startseiten-Kacheln (`components/Kachel.tsx`) statt Farbverläufen.
  - Ab iPad stehen zwei Kacheln nebeneinander.
  - Das Profil ist wie die iOS-Einstellungen aufgebaut.
  - Steckbrief-Felder sind gleich breit.
  - Kein Leuchten mehr um Weiß/Schwarz-Namen (`namensfarbe`).
  - „Laufendes Halbjahr“ ist zugeklappt.

## 09.10.2026: Automatische Sperren, Emoji-Filter

- **Datenbank:** `supabase/auto-sperre.sql`. Die Stufe je Person und Art steht in
  `auto_sperren`. 24 Stunden nach dem Ende der letzten Sperre geht es wieder bei
  Stufe 1 los.
  - **Spam** (10 Beiträge in 30 Sekunden): 1 Minute → 5 Minuten → 1 Stunde.
  - **Wortfilter** (3 geblockte Versuche in 10 Minuten): 5 Minuten → 1 Stunde → 1 Tag.
  - Admins werden nie automatisch gesperrt, und eine längere Sperre vom Team wird
    nie verkürzt.
  - Jede automatische Sperre steht im Protokoll (Moderation).
- **Grund:** `profiles.ban_grund`. Die App zeigt ihn in der Sperr-Zeile und im Chat.
  Gesperrte bekommen sofort eine Meldung, und die App merkt das Ende der Sperre von
  selbst (`RoleProvider`). Statt „row-level security“ steht eine verständliche
  Meldung da (`melder.ts`).
- **Emojis:** In `app_settings.wortfilter_zeichen` blockt jedes Zeichen wie ein Wort.
  Gepflegt wird die Liste im Wortfilter-Fenster unter „Emojis blocken“.
- **Wörter:** Die Liste steht nur in der Datenbank, nicht im Repo.

## 07.10.2026: Wortfilter und Melden

- **Wortfilter** (SQL `supabase/wortfilter-melden.sql`, Funktionen
  `wf_norm`, `wf_kand`, `wortfilter_treffer`, Trigger `wortfilter` auf allen
  Text-Tabellen außer Zitaten): Die Datenbank prüft vor dem Speichern und
  lehnt ab mit „Bitte ohne beleidigende Wörter formulieren („a***h“).“
  Erkennt Umgehungen: Groß/klein, Umlaute/ae, Akzente, kyrillische
  Doppelgänger, unsichtbare Zeichen, Leetspeak (4rsch, w1chser, $),
  Zeichen im Wort (A.r.s.c.h), Einzelbuchstaben (a r s c h), getrennt
  (Ar sch, Sieg Heil), Wiederholungen (Arrrsch), ph/ck, Sternchen (f*ck,
  a**loch). Links/IDs zählen nicht. Modi je Wort: nur als Wort / Wortanfang /
  überall, dazu Ausnahmen (z. B. „idiotensicher“). 68 Testfälle geprüft.
- Die **Liste selbst steht nur in der Datenbank** (nicht im Repo). Pflege:
  Profil → Wortfilter (Recht `wortfilter.verwalten`, Standard Admin) mit
  Test-Feld. Namen aus der Stufe, die zufällig treffen, sind als Ausnahme
  eingetragen.
- Geblockte Versuche: `wortfilter_versuch()` zählt; ab 3 in 10 Minuten ein
  Protokoll-Eintrag (Bereich „Wortfilter“), ohne Text.
- **Zitate** laufen nicht durch den Filter; beim Prüfen steht
  „⚠ enthält ein Wort aus dem Wortfilter“.
- **Melden** (`lib/melden.ts`, `components/Melden.tsx`, Tabelle `meldungen`):
  Chat-Nachricht (gedrückt halten → Melden), Album-Kommentar, Steckbrief,
  Motto-Vorschlag, Zitat. Grund + Notiz; Auszug und Person füllt die
  Datenbank. Eigenes kann man nicht melden, höchstens 10 pro Stunde. Das
  Team (Recht `meldungen.bearbeiten`) bekommt eine Mitteilung und sieht die
  Meldung unter Chats → Anfragen: Entfernen, „Ist in Ordnung“ oder sperren.
  Bearbeitete Meldungen stehen im Protokoll.

## 06.10.2026: Protokoll zeigt Mithilfe, Anfragen und Schichten

- Eingetragene Mithilfe stand nicht mehr im Protokoll (beim Verschlanken
  am 04.10. bewusst herausgenommen). Jetzt wieder – zusammengefasst je
  Aktion, mit Herkunft: „Schicht abgeschlossen – …“ / „Nachtrag angenommen – …“.
- Neu im Bereich „Anfragen“: Nachtrag abgelehnt, Komitee-Wunsch,
  Entsperr-, Termin- und Kostenanfrage angenommen/abgelehnt.
- Neu: Schicht-Einteilung (Termine mit Plätzen), zusammengefasst je Schicht.
- SQL: `supabase/protokoll-mehr.sql` (schon eingespielt). Filter in der App:
  „Mithilfe & Schichten“, „Anfragen“ (`lib/protokoll.ts`).

## 05.10.2026 (7): Abimotto – Likes, Ergebnisse nur fürs Komitee

- Abstimmen = 👍 bei allen Mottos, die einem gefallen (🔥 entfällt). Keine
  Zahlen und keine Rangliste für Schüler; die Datenbank gibt jedem nur die
  eigenen Stimmen heraus.
- Komitee Motto & Pullis und Admin (Recht `motto.verwalten`): Zahnrad →
  „Ergebnisse“ mit Rangliste, Balken, Anzahl Abstimmender, Abstimmung
  freigeben und „Als Motto festlegen“. Das festgelegte Motto steht groß auf
  der Karte; der Admin kann es jederzeit ändern.

## 05.10.2026 (6): Keine Namen an Texten, direkt zum Ziel springen

- **Keine Verfasser mehr sichtbar**: „geschrieben von“/„korrigiert von“ am
  Steckbrief-Text, „von …“ bei Zitaten (auch beim Prüfen) und beim Abimotto
  sind weg; die Zitat-Benachrichtigung nennt niemanden mehr. Nur die Person
  selbst sieht bei ihrem Steckbrief einmal ein kleines ⓘ („Bearbeitet von …“,
  `BearbeitetInfo` in `components/Album.tsx`) – beim nächsten Öffnen ist es
  weg, bis wieder jemand etwas ändert (gemerkt auf dem Gerät).
- **„✍️ Text wartet auf dich“** ist ein Knopf: bei einem Steckbrief geht er
  direkt dorthin, bei mehreren öffnet das Album gefiltert auf „wartet auf
  deinen Text“. Die Einladungs-Benachrichtigung führt ebenfalls dorthin
  (`./#album-fuer-mich`).
- **Anfragen-Benachrichtigungen** (`lib/sprung.ts`): Nachtrag, Komitee-Wunsch,
  Entsperr- und Terminanfrage öffnen `./#anfrage-…`. Die App geht in den
  richtigen Reiter; eine einzelne Mithilfe-Anfrage öffnet sich sofort, sonst
  wird die Anfrage in die Mitte gescrollt und kurz blau umrandet.

## 05.10.2026 (5): Steckbriefe korrigieren, Album sortieren

- **Korrigieren** (Recht `album.redigieren`, RPC `album_redigieren`,
  Spalten `korrigiert_von_name`/`korrigiert_at`): Komitee Abizeitung und
  Admin sehen bei jedem fremden Steckbrief „✏️ Korrigieren“ und können
  Stammdaten und Text ändern (Rechtschreibung o. Ä.). „Geschrieben von“
  bleibt, die Person sieht zusätzlich „korrigiert von …“.
- **Sortieren** im Album: „A–Z“ (Nachname, dann Vorname) oder
  „Fortschritt“ (fertige zuerst, mit „✓ fertig“), daneben „x/y fertig“.
  Die Wahl merkt sich das Gerät.

## 05.10.2026 (4): Abimotto in zwei Phasen

- **Vorschläge → Abstimmung** (`app_settings.motto_abstimmung`, RPC
  `motto_abstimmung_setzen`, Recht `motto.verwalten` = Komitee Motto & Pullis):
  Zuerst steht auf der Karte „Reiche Vorschläge für unser Abimotto ein“,
  abstimmen geht noch nicht. Gibt das Komitee über das Zahnrad die
  Abstimmung frei, steht dort „Abstimmen …“, 👍/🔥 sind offen und neue
  Vorschläge kommen nur noch vom Komitee. Die Datenbank prüft beides.

## 05.10.2026 (3): Rankings getrennt, Abimotto, Komitee-Rechte, Sperre überall

- **Rankings getrennt** (`components/Rankings.tsx` → `RankingKarten`): zwei
  Karten nebeneinander, „Schüler“ (blau) und „Lehrer“ (orange), jede öffnet
  ihr eigenes Blatt mit den Kategorien als Kacheln (Top 3).
- **Abimotto** (`lib/motto.ts`, `components/Motto.tsx`, SQL
  `supabase/komitees-motto.sql`, Tabellen `motto_vorschlaege`,
  `motto_stimmen`): Karte wie Zitate/Album. Vorschlagen, 👍 beliebig oft, 🔥
  nur einmal je Person (Favorit, zählt doppelt). Verwalten (Zahnrad): ändern,
  ausblenden, als Motto festlegen – dann steht es groß auf der Karte.
  Funktion „Abimotto“ in Profil → Funktionen (Standard aus), Rechte
  `motto.nutzen` (alle Schüler + Team) und `motto.verwalten`.
- **Komitee-Rechte** (Tabelle `komitee_rechte`, `has_perm()` neu,
  Rollen & Rechte → Rechte → Komitee-Rechte): ganze Komitees bekommen
  Verwaltungsrechte. Start: Abizeitung = Zitate prüfen, Rankings verwalten,
  Lehrerliste; Motto & Pullis = Abimotto verwalten. Reihenfolge: persönliche
  Ausnahme > Komitee > Rolle. Admin kann alles weiter verteilen.
- **Bestätigungsanfragen**: Neues Zitat → Push an alle mit „Zitate prüfen“
  (`send-push` Modus `zitat_id`, Empfänger über `perm_empfaenger()` – der
  Admin nur, wenn er selbst im Komitee ist). Tippen öffnet direkt „Prüfen“.
- **Gesperrt = überall nur ansehen**: Trigger `gesperrt_blocken` auf Zitaten,
  Album (Steckbrief, Kommentare, Likes), Rankings, Umfragen, Abimotto,
  Nachträgen und Komitee-Anfragen. In der App steht ein Hinweis, Knöpfe zum
  Einreichen sind weg, Pop-up-Umfragen erscheinen nicht.

## 05.10.2026 (2): Lehrerliste gefüllt, Lied suchen, Nachtragen, Reaktionen

- **Lehrerliste**: Die Lehrkräfte von der Schul-Webseite stehen jetzt in der
  Tabelle `lehrer` (nur in der Datenbank, nicht im Repo), mit Kürzel und
  Fächern. Pflege wie bisher über Profil → Funktionen → Lehrerliste.
- **Lied suchen** (`components/Spotify.tsx` → `LiedSuche`, Edge Function
  `spotify-info` Modus `suche`): Im Steckbrief beim Lied-Feld „Lied auf
  Spotify suchen“ – Treffer mit Cover, antippen übernimmt Titel, Künstler und
  Link. Die Suche in der App braucht die Supabase-Secrets
  `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` (eigene Spotify-Developer-App,
  Client-Credentials). Ohne sie: „In Spotify suchen“ öffnet Spotify mit der
  Suche, dort Teilen → Link kopieren, zurück und „Kopierten Link einfügen“.
  Ein Zurückspringen aus Spotify mit dem gewählten Lied gibt es ohne
  Spotify-Login nicht.
- **Nachtragen** (`components/NachtragSheet.tsx`): Aktionen stehen nicht mehr
  alle als unterschiedlich breite Kacheln da. „Aktion ›“ öffnet eine Liste
  mit Suche (einzeilig, Werte rechtsbündig), „Sonstiges …“ darunter.
- **Chat-Reaktionen wie WhatsApp** (`components/ChatBlasen.tsx`): ein
  Schildchen mit bis zu drei Emojis und Gesamtzahl ragt unten über den Rand
  der Blase (nicht über den Text), Rand in Hintergrundfarbe, kein blauer
  Kreis mehr. Antippen zeigt, wer wie reagiert hat; die eigene Reaktion lässt
  sich dort antippen und entfernen.

## 05.10.2026: Sichtbarkeit für alle, Funktionen-Zentrale, Spotify-Karte

- **Warum andere nichts sahen:** Album, Zitate und Rankings brauchen neben
  dem Funktionen-Schalter das Recht „… nutzen“, und das hatte nur der Admin.
  Jetzt (Datenbank, sofort wirksam) dürfen alle Schüler und das Team sie
  nutzen; sichtbar wird es erst über den Schalter. Verwalten bleibt Admin.
- **Profil → Funktionen** ist die Zentrale: je Bereich der An/Aus-Schalter,
  „Nutzen dürfen: …“ mit Schnell-Schalter (alle Schüler + Team) und Knöpfe
  zu den Einstellungen – Steckbrief-Kategorien, Lehrerliste,
  Ranking-Kategorien, Umfragen.
- **Spotify** (`components/Spotify.tsx`, Edge Function `spotify-info`, Tabelle
  `spotify_titel`, SQL `supabase/spotify.sql`): Karte mit Cover, Titel,
  Künstler und 30-Sekunden-Hörprobe (eigener Player mit Fortschrittsring),
  „Ganzes Lied in Spotify“ öffnet Spotify (mit Konto ganzes Lied). Infos holt
  der Server, gespeichert 30 Tage. Eigener Funktionen-Schalter „Spotify im
  Steckbrief“ (Standard an). Vorschau schon beim Ausfüllen.

## 04.10.2026: Abi-Rankings, Lehrerliste, Übernehmen aus Umfragen, iOS-Leiste

- **Abi-Rankings** (`lib/rankings.ts`, `components/Rankings.tsx`, SQL
  `supabase/rankings-lehrer.sql`): Karte im Profil, Blatt mit zwei Spalten
  Schüler | Lehrer, je Kategorie die Top 3 (Treppchen), aktualisiert sich
  alle 15 s. Stimmen geheim (nur gezählt über `ranking_stand()`), änderbar,
  „weiß nicht“ möglich. Funktion „rankings“, Rechte `rankings.nutzen`,
  `rankings.verwalten`.
- **Pflicht über Umfragen**: Umfrage-Schalter „Abi-Rankings abfragen“
  (`umfragen.mit_rankings`) bzw. Vorlage „Rankings ausfüllen“ – jede aktive
  Kategorie wird ein Schritt im Pop-up; die Stimme landet direkt im Ranking.
- **Übernehmen aus Ergebnissen**: bei Auswahl- und Freitextfragen
  „Übernehmen als Ranking / Steckbrief-Feld …“ – meistgewählte sind
  vorausgewählt, vorhandene Titel werden übersprungen.
- **Lehrerliste** (Recht `lehrer.verwalten`): Zahnrad in den Rankings und in
  der Zitatwand; Lehrkräfte sind beim Zitat-Einreichen und im Lehrer-Ranking
  auswählbar (Mitschüler über `stufe_personen()`), „Andere …“ als Freitext.
- **Zitate**: Karte zeigt immer das neueste freigegebene Zitat; wer prüft,
  kann Zitate nachträglich bearbeiten und löschen (wird geleert).
- **Spotify**: Steht ein Spotify-Link im Steckbrief (z. B. Lieblingslied),
  gibt es „Auf Spotify abspielen“ – der Player lädt erst nach dem Tippen
  (2-Klick, vorher geht nichts an Spotify). Ohne Spotify-Konto Hörprobe.
- **iPhone**: Tab-Leiste rutschte nach dem Tippen (Tastatur) in die Mitte
  (iOS-Fehler, Fenster bleibt verkleinert). `lib/ios-fenster.ts` misst nach
  dem Verlassen eines Feldes neu.
- Profil: Abschnittstitel mit weißen Symbolen auf farbigen Flächen statt
  Emojis; Umfrage-Vorlagen als Raster (Handy untereinander).

## 04.10.2026: Funktionen an/aus, Zitatwand, Events aufgeräumt

- **Funktionen** (`lib/funktionen.ts`, `components/Funktionen.tsx`, SQL
  `supabase/funktionen-zitate.sql`): Profil → Funktionen schaltet Abiball-
  Tickets, Abi-Album, Zitatwand und Pop-up-Umfragen für alle an/aus
  (`app_settings.funktionen`, nur über `funktion_setzen()`; ein Trigger hält
  das Team davon ab, die Spalte direkt zu ändern). Recht
  `funktionen.verwalten`. Wer verwaltet, sieht Ausgeschaltetes weiter mit
  Hinweis „Aus – nur du siehst das“. Wer innerhalb was darf: Rechte-Reiter.
- **Zitatwand** (`lib/zitate.ts`, `components/Zitate.tsx`): dunkle Karte im
  Profil mit „Zitat des Tages“, Einreichen mit Live-Vorschau, Wand mit
  Filter Lehrer/Schüler, Sortierung 🔥 Top / Neu, Plätze 1–3. Prüfen (✓/✕)
  für `zitate.pruefen`; Abgelehntes wird geleert. Rechte `zitate.nutzen`,
  `zitate.pruefen`.
- **Abi-Album**: Zahnrad oben im Album (Recht `album.kategorien`) für die
  Kategorien – jetzt auch löschen (🗑). Der Eintrag im Profil ist weg.
- **Events**: „Nachricht“ ist raus. „Info“ hat jetzt alle Optionen
  (Hervorheben, „alle mit offenem Beitrag auswählen“); im Feed steht nur
  „Info“ (alte Nachrichten ebenfalls). Neu im Formular: „📊 Umfrage“ öffnet
  die Pop-up-Umfragen; oben im Reiter eine Umfragen-Karte. Im Profil sind
  die Umfragen nicht mehr.

## 04.10.2026: Abi-Album, Pop-up-Umfragen, Nachtragen oben

- **Abi-Album** (`lib/album.ts`, `components/Album.tsx`, SQL `supabase/abi-album.sql`):
  Karte „Dein Steckbrief“ im Profil (Kasse-Ansicht). Stammdaten-Felder legt das
  Team fest (Profil → Steckbrief-Kategorien); ausfüllen kann sie **nur die
  Person selbst** (RPC `album_stammdaten_speichern`). Den freien Text schreibt
  man selbst oder gibt ihn frei – für alle oder gezielt (`album_freigabe_setzen`,
  `album_text_schreiben` prüft die Freigabe). Kommentare und Likes wie bei
  Instagram, auch auf Kommentare. Mitschüler dürfen `students` nicht lesen –
  Namen kommen über `album_personen()`, der Verfassername wird beim Schreiben
  festgehalten. Kein Löschen über die API: Likes werden umgeschaltet (`an`),
  Kommentare ausgeblendet und geleert (`album_kommentar_entfernen`).
- **Pop-up-Umfragen** (`lib/umfragen.ts`, `components/Umfragen.tsx`): Profil →
  Umfragen. Vorlagen „Schülerranking“, „Welche Rankings?“, „Steckbrief-
  Kategorien“. Fragetypen: eine/mehrere Antworten, Freitext, Person, Skala.
  Läuft eine Umfrage, erscheint sie beim nächsten Öffnen (nach Einführung und
  Patch Notes); Pflicht-Umfragen ohne „Später“. Jede Antwort wird sofort
  gespeichert, beim nächsten Öffnen geht es an derselben Stelle weiter.
  Ergebnis nur gezählt über `umfrage_ergebnis()`.
- **Rechte** (alle neu, Standard nur Admin): `album.nutzen`,
  `album.kategorien`, `album.moderieren`, `umfragen.verwalten`,
  `umfragen.ergebnisse`. Zum Freischalten im Rechte-Reiter der Rolle geben.
- **Nachtragen**: grüner Knopf oben neben dem Profilbild, einmaliger Hinweis
  beim nächsten Öffnen (`sv:hinweis:nachtragen`). Der Knopf unten in den
  Chats ist weg.
- Profil: Abschnittstitel mit farbigem Zeichen. Demo: Album für alle außer
  Eltern freigeschaltet (nur ohne Datenbank).

## 04.10.2026: Wischen, Chats, Buchungen nach Monaten, Prüfrunde

- Kalender (Monat/Woche/Tag) und Wochenleiste: waagerecht wischen blättert
  (`lib/wischen.ts`), die neue Ansicht gleitet von der Seite herein.
- Chats: Mitteilungs-Schalter für Schüler-/Eltern-Chats und Anfragen sitzen
  jetzt als Zeile IM jeweiligen Feld. Komitee: zwei Knöpfe „Chat“ (Standard)
  und „Übersicht“, jeder mit eigenem roten Punkt, oben fest.
- Finanzen → Buchungen: je Monat ein aufklappbares Feld mit Anzahl und Summe,
  nur der neueste Monat ist offen; beim Suchen alle Treffer-Monate.
- Tickets: „bezahlt“ schickt der Person und ihren Eltern eine Mitteilung;
  Beiträge → Ticket hat „📣 Alle informieren“ (Verkaufsstart).
- Datenbank (eingespielt): Trigger-Funktionen nicht mehr per API aufrufbar,
  feste search_path für sechs Hilfsfunktionen. Push-Protokoll der letzten
  24 h ohne Fehler.

## 04.10.2026: Apple-Schema in der ganzen App

- `components/Liste.tsx`: gemeinsame Bausteine – `RechnungKopf` (oben mittig
  Bild, große Zahl, Titel, ✕), `Gruppe` (mit Fußnote), `Zeile` (optional
  antippbar mit ›, rot für Löschen), `Wert`, `ZeileAuswahl`, `ZeileEingabe`,
  `ZeileSegmente`. Neue Ansichten bitte nur noch damit bauen.
- Person (StudentSheet), Mithilfe (PunkteSheet), Person hinzufügen (AddSheet)
  wie eine Rechnung; Halbjahre als Liste mit Status-Kapsel (antippen schaltet um).
- Alle Blätter haben denselben Kopf (SheetKopf) bzw. den Rechnungskopf;
  doppelte „Fertig“-Knöpfe sind weg.
- Chats: Komitees und Stufenteam als eine gruppierte Liste statt einzelner Karten.
- index.css: alte Kästen mit grauem Rahmen werden automatisch zu gefüllten
  Zellen (ohne Rahmen); Abschnittsüberschriften in Formularen einheitlich klein.
- PunkteBar.tsx entfernt (nicht mehr benutzt).

## 04.10.2026: Feinschliff zu 1.2 (ohne Patch Notes)

- **Tab-Leiste** (App.tsx, ElternApp.tsx): wie in iOS ganz unten angedockt,
  volle Breite, deckender Hintergrund mit Haarlinie – nichts scheint mehr durch.
- **Ring** (Ring.tsx): dreistellige Zahl kleiner, „%“ klein daneben – passt in
  den Ring, die Stufen-Striche schneiden nicht mehr hinein.
- **Bonus über 100 %** neu gedacht: alle `bonusSchritt` % über 100 wird das
  1. Ticket um `bonusProSchritt` € günstiger, höchstens `bonusMax` €
  (`bonusGrenze()` = ab da zählt nichts mehr). App (lib/logic.ts) und Server
  (`ticket_erstes_cent`, eingespielt) rechnen gleich.
- **Abiball**: Tag und Uhrzeit getrennt einstellbar, stehen auf beiden Tickets.
  Gäste-Ticket schwarz-gold; bei Eltern steht es oben.
- **Ticket-Ansicht**: gruppiert wie der Rest der App (1. Ticket, weitere
  Tickets, Abiball), ohne „Helferzuschuss bei 0 %“. Vor dem Verkaufsstart keine
  Kasse mehr, nur eine kleine Info. Lange Hinweistexte gekürzt.
- **Mithilfe eintragen** (MithilfeBlatt.tsx): Blatt wie eine Rechnung, Aktion
  über „Aktion ›“ mit Suche auswählen – für eine Person und für mehrere.
- **Automatisch löschen**: 1 Tag, 3 Tage, 1 Woche, 1 Monat; neu auch fürs
  Protokoll (`loeschen_protokoll_tage`, `loeschfristen_setzen(c, a, p)`).
- **Protokoll schlanker**: `audit_schreiben()` (eingespielt) lässt Passwortwechsel,
  Komitee-Beitritte, einzelne Mithilfe und automatische Beitragsbuchungen weg,
  kürzt Texte und speichert keine Details mehr.
- Noch im SQL Editor auszuführen: `supabase/aufraeumen-kuerzer.sql` (Fristen ab
  1 Tag, `aufraeumen()` mit Protokoll, altes Protokoll einmalig ausdünnen).

## 03.10.2026: Update 1.2 – Abiball-Ticket, Bonus über 100 %, Ticketverkauf

**Datenbank** (`supabase/abiball-tickets.sql`, eingespielt):
- `app_settings.abiball` (jsonb): `ueber100`, `bonusSchritt`, `bonusProSchritt`, `bonusMax`,
  `verkaufAb`, `maxProPerson`, `kontingent`, `ort`, `datum`, `uhrzeit`. Standard: Bonus aus,
  Verkauf nicht freigegeben.
- Tabelle `ticket_bestellungen` (Person, Anzahl, Betrag in Cent, Status
  offen/bezahlt/storniert). Lesen: eigene, Eltern über `parent_children`,
  Team/Kasse alle. Ändern (Status): nur Team, `kasse.edit`, `finanzen.manage`.
  Kein direktes Insert – bestellt wird nur über `ticket_bestellen(n)`.
- `ticket_bestellen()` prüft Freigabe/Startzeit, Preis > 0, Höchstzahl je Person
  und Kontingent (mit Advisory-Lock) und rechnet den Betrag auf dem Server:
  1. Ticket über `ticket_erstes_cent()` (nur intern aufrufbar), alle weiteren
  zum Grundpreis. `ticket_stand()` liefert verkauft/meine.

**Preislogik** (`lib/logic.ts → ticketPreise()`, eine Stelle für alle Ansichten):
`standard` = Grundpreis + Helferzuschuss bei 0 % (durchgestrichen auf dem
Ticket), `erstes` = Grundpreis + Zuschlag der erreichten Stufe − Bonus,
`weiteres` = Grundpreis. Bonus siehe 04.10.2026. Der Preis fällt nie unter 0 €.

**Oberfläche:**
- `AbiTicket.tsx`: personalisiertes Ticket (Name, Ort/Datum erst wenn
  eingetragen, Preis-Abriss), Ticket für jedes weitere, Ticket-Ansicht mit
  Rechnung, `TicketKasse` (Countdown → Bestellen → Überweisen mit Nummer im
  Verwendungszweck). Ersetzt `TicketErklaerung.tsx` und die „1. Ticket kostet …“-Texte.
- `Ring.tsx`/`Staffel.tsx`/`PunkteBar.tsx`: über 100 % goldene zweite Runde,
  goldene Zahl mit „✦ Bonus“, Bonus-Kachel.
- `AbiballEinstellungen.tsx` in Beiträge → Ticket: Schalter + Regler, Ort/Datum,
  Verkauf freigeben (Startzeit, „Jetzt starten“), je Person/insgesamt, Bestellliste.
- `lib/tickets.ts`: Hook, Countdown, Demo-Modus über localStorage.

## 03.10.2026: Update 1.1

Patch Notes erscheinen einmal nach dem nächsten Öffnen (`src/lib/patchnotes.ts`,
`PatchNotes.tsx`, Merker `sv:patch:gesehen`). Eltern sehen keine, Schüler keine
Team-Punkte. Neue Zugänge sehen die Einführung; die setzt den Merker mit.

**Datenbank** (eingespielt, Dateien zum Nachvollziehen):
- `supabase/chats-1-1.sql`: `topic_reads.last_read_uebersicht` + `chat_gelesen()`
  (Serverzeit, Chat und Übersicht getrennt), Tabelle `topic_reaktionen`
  (👍 👎 🔥 😢 😂 ❓, eine je Person, RLS wie der Chat), `profiles.mitteilungen`
  (Schalter des Teams), Tabelle `app_aktiv` + `bin_aktiv()` (Herzschlag, solange
  die App sichtbar ist).
- `supabase/mithilfe-nachtrag.sql`: Tabelle `mithilfe_nachtraege` +
  `nachtrag_entscheiden()` (nur Team / `hilfen.edit`, legt genau einen
  contributions-Eintrag an, Protokoll-Quelle „nachtrag“).
- `supabase/auto-loeschen.sql`: Spalten `loeschen_chat_tage` /
  `loeschen_antraege_tage` und `loeschfristen_setzen()` sind eingespielt.
  **`aufraeumen()` und der nächtliche Cron-Job müssen noch im SQL Editor laufen**
  (das Werkzeug hier darf keine Funktion mit DELETE anlegen).
- `send-push` v23: lässt aktive Personen aus (`app_aktiv`), filtert nach den
  Schaltern (`art: "anfrage" | "eltern"`, Kategorie „schueler“ bei Fragen,
  Komitee-Schalter), Chat-Meldungen mit `tag: chat-<id>` + `gruppe`.

**Alle**
- Chats-Zähler (`lib/chat-zaehler.ts`): nur offene Gespräche, eigene bzw.
  eingeschaltete Komitee-Chats, Stufenteam-Chat; erledigte Elterngespräche
  zählen fürs Team nicht mehr. Gelesen-Marke mit Serverzeit.
- Keine Pop-ups, solange man in der App ist (`lib/aktiv.ts`); beim Öffnen
  verschwinden angezeigte Mitteilungen. Mehrere Nachrichten aus einem Chat →
  eine Mitteilung „N neue Nachrichten“ (`sw.ts`).
- Reaktionen: Nachricht gedrückt halten (Rechtsklick am Computer) →
  Leiste mit 6 Reaktionen + „Kopieren“ (`ChatBlasen.tsx`).
- Komitee-/Team-Chat öffnet im Chat; „Übersicht“ rechts oben, beide mit
  eigenem roten Punkt (`KomiteePage.tsx`, `unreadCount(id, bereich)`).
- „Mithilfe nachtragen“ (`NachtragSheet.tsx`): Vorlage oder Sonstiges (Name
  Pflicht), Datum, Text; Rechnungs-Optik, grüner Haken, eigene Anträge mit Stand.
- „Keine Live-Verbindung“ entfernt (`Verbindungshinweis.tsx` gelöscht), die App
  verbindet still neu; Ladezustände als Skelette (`Skelett.tsx`).
- Version und Uhrzeit im Profil entfernt. Datenschutz ergänzt, festes Datum.

**Team**
- Chats: Bereiche Stufenteam / Komitees / Chats mit Schülern / Chats mit Eltern
  / Anfragen (Nachträge, Komitee-Wechsel, Entsperrungen). 🔔/🔕 je Bereich und je
  Komitee (`lib/mitteilungen.ts`).
- Reiter „Profil“ (eigene Schüleransicht), Start dort, wenn der Zugang einen
  eigenen Eintrag hat.
- Rollen & Rechte in einem Reiter (`RollenRechteTab.tsx`); Person antippen →
  ihre einzelnen Rechte (`PersonRechteSheet`), Rechte-Bereiche zugeklappt.
- Mehrfachauswahl → Mithilfe: dasselbe Blatt wie für eine Person, mit Datum
  (`MithilfeEintragen` in `PunkteSheet.tsx`).
- Profil → „Automatisch löschen“ (Admin / `perms.manage`).

---


## 01.10.2026: Mithilfe für vergangene Schichten bestätigen – wiederfindbar

- **Hinweis im Events-Reiter:** Wer Schichten bestätigen darf (Team oder
  „Mithilfe eintragen“, `hilfen.edit`), sieht oben einen orangen Hinweis
  „N Schichten sind vorbei – Mithilfe bestätigen“, solange etwas offen ist.
  Antippen öffnet wieder das Fenster mit „Punkte vergeben / ohne“ – auch für
  ältere Schichten (das Fenster geht von selbst nur für die letzten 14 Tage
  auf). Vorher war nach dem Wegwischen bis zum nächsten App-Start nichts mehr
  zu sehen (`AbschlussHinweis`, `useOffeneAbschluesse` in `SchichtAbschluss.tsx`).
- **Ganztägige Schichten** („Waffelteig mitbringen“, „Waffeleisen
  bereitstellen“ …) gelten jetzt um **14:00** als vorbei statt um 23:59. Die
  Erinnerung ans Team kam sonst mitten in der Nacht, und bis dahin ließ sich
  nichts bestätigen. SQL: `supabase/schicht-ende-ganztags.sql` (eingespielt),
  App: `endeVon()` in `SchichtAbschluss.tsx`.
- **Mitmachen-Liste aufgeräumt:** Bestätigte Schichten („Punkte vergeben“
  oder „ohne“) verschwinden für alle. Vorbei, aber noch nicht bestätigt,
  sieht nur das Team – mit „vorbei · bestätigen“ (öffnet das Fenster) und
  „verteilen“, um vorher auszutragen, wer nicht da war. Schüler sehen vorbei
  Schichten nicht mehr; „Deine Schichten“ zeigt nur Kommendes. Im Kalender
  bleiben alle Termine als Verlauf stehen. Gelöscht wird nichts.
- Die Erinnerung (Push) geht wie bisher genau einmal je Schicht ans Team
  (Stufenteam, Kassenwart, Admin, Sprecher, OP) – das sind genau die Rollen
  mit `hilfen.edit`.

---


## 30.09.2026: Rollen-Menü statt nativem Auswahlfeld

Kein SQL, keine Mitteilung.

- **Problem:** Unter Windows (helles System) mit der App im Dunkelmodus war
  die Rollenliste hellgrau mit fast weißer Schrift – kaum lesbar. Ursache:
  `color-scheme: light dark` folgte dem Betriebssystem, die App aber ihrem
  eigenen Schalter.
- **Rollen-Reiter:** Die Rolle wählt man jetzt in einem eigenen Menü
  (`RollenMenue` in `RolesTab.tsx`) im selben Stil wie „Komitees“: aktuelle
  Rolle mit Häkchen, je Rolle ein Satz Erklärung, vergebene Rollen mit 🔒 und
  Grund, Trennlinien zwischen Schüler / Team / Eltern. Rückfrage bei
  heiklen Wechseln (Eltern, Admin) wie bisher. Escape schließt.
- **Alle anderen Auswahlfelder:** `color-scheme` folgt jetzt der App
  (`html.dark`), Optionen haben Karten-Hintergrund und Textfarbe der App
  (`src/index.css`).

---


## 30.09.2026: Schicht bekommen / nicht bekommen – auf einen Blick

Kein SQL, keine Mitteilung. Nur Anzeige – wer eingeteilt ist, entscheidet
weiter das Stufenteam.

Jede Schicht hat für mich jetzt einen von drei Ständen
(`schichtStatus()` in `src/lib/termine.ts`, Hook `useSchichtStatus()` in
`src/termine-store.tsx`):

| Stand | Wann | Aussehen |
|---|---|---|
| **bekommen** | ich (oder mein Kind) bin eingeteilt | sattes Grün, Haken, „deine Schicht“ |
| **gemeldet** | gemeldet, Plätze noch frei, nicht abgeschlossen | normale Farbe mit feinem blauem Rand, ⏳ |
| **nicht bekommen** | gemeldet, aber Plätze ohne mich voll, Schicht abgeschlossen oder vorbei | verblasst, gestrichelter Rand, „nicht bekommen“ |

- **Events → „Deine Schichten“:** Bekommene, kommende Schichten stehen oben
  als grüne „Tickets“: links der Abriss mit Monat/Tag/Wochentag, gepunktete
  Perforation, rechts Aktion, Zeit, Ort und „Du bist eingeteilt“
  (`SchichtTicket` in `AktionenListe.tsx`).
- **Mitmachen-Liste:** bekommene Zeile grün umrandet mit grünem Balken links;
  nicht bekommene Zeile verblasst und gestrichelt mit „Die Plätze sind ohne
  dich vergeben – danke fürs Melden!“; gemeldete Zeile „⏳ gemeldet“
  (antippen = austragen, wie bisher).
- **Kalender (Monat/Woche/Tag) und Wochenstreifen:** dieselben drei Looks.
  Bekommene Schichten grün mit „✓“, der Punkt im Wochenstreifen grün mit
  Ring, nicht bekommene gestrichelt und blass. Oben im Kalender steht eine
  kleine Legende – nur, wenn man überhaupt mit einer Schicht zu tun hat.
  In der Tagesansicht steht das Schildchen unter dem Titel (daneben brach ein
  langer Titel mitten im Wort um).
- Die Bestätigung nach „eintragen“ erklärt jetzt: „Bekommst du sie, wird sie
  grün mit Haken – oben unter ‚Deine Schichten‘ und im Kalender.“
- Styles zentral in `TerminZeichen.tsx`: `chipKlasse`/`punktKlasse` mit
  Schicht-Stand, `SchichtSchild`, `schichtRahmen`, `SchichtLegende`.

---


## 28.09.2026 (spät): Überweisen für Schüler, Bestätigung beim Eintragen

Kein SQL (Schüler durften die Kontodaten schon lesen, `bank_konto`: „konto
lesen“). Keine Mitteilung.

- **Überweisen für Schüler:** In „Deine Stufenkasse“ gibt es den Knopf
  „Überweisen – Kontodaten“. Er öffnet dieselben Daten wie bei den Eltern
  (Empfänger, IBAN, BIC, Bank, Verwendungszweck „Nachname, Vorname Q1“, alles
  zum Kopieren), in Du-Form und nur mit der eigenen Person. Der Eltern-Hinweis
  („bei mehreren Kindern …“) wird dort nicht gezeigt.
- **Eintragen bei einer Schicht:** Nach „eintragen“ erscheint ein Fenster wie
  beim Bezahlen (Apple Pay): drehender Ring → grüner Kreis mit Haken. Darunter:
  „Noch keine feste Schicht. Das Stufenteam teilt ein – wer bisher wenig
  Mithilfe hat, kommt zuerst dran. Bist du eingeteilt, steht die Schicht als
  ‚für dich‘ in deinem Kalender.“ Der Knopf heißt danach „gemeldet ✓“ statt
  „eingetragen ✓“ (`MeldeBestaetigung.tsx`). Bei „Bewegung reduzieren“ ohne
  Animation.

---


## 28.09.2026 (abends): iPhone-Befunde, Kalender-Test, Update erzwingen

Kein SQL. Function `kalender` neu eingespielt (v3, JWT-Prüfung wie bisher aus,
weil Kalender-Apps sich nicht anmelden; die Function prüft selbst).

- **„lädt weitere …“ blieb stehen (Kasse, Rollen, Rechte, Buchungen):** Die
  Liste lädt in 40er-Schritten nach, sobald die Marke unten in Sicht kommt.
  Der Beobachter startete aber nur, wenn die Marke schon beim Laden der Daten
  im Bild war. Wurde die App auf einem anderen Reiter geöffnet (z. B. durch
  Tippen auf eine Mitteilung → Chats) und erst dann die Kasse angesehen, fehlte
  er – die Liste blieb bei 40 Personen stehen. Jetzt startet er, sobald die
  Marke erscheint (`useNachschub`, `App.tsx`); zusätzlich ist die Marke
  antippbar („jetzt anzeigen“). Nicht iPhone-spezifisch, fiel dort nur auf.
- **Selbst eintragen fürs Team:** Wer Schichten verteilen darf, sah an jeder
  Schicht nur „x gemeldet“ und konnte sich nicht selbst melden. Jetzt steht
  daneben „mich eintragen“ (bzw. „eingetragen ✓“ / „du ✓“) – auch bei vollen
  Schichten, weil das Team ohnehin selbst einteilt.
- **Kalender-Verbindung (Testphase):** neues Recht „Kalender-Verbindung
  (Testphase)“ (`kalender.test`, Rechte-Reiter → Termine). Admins haben es
  automatisch; einzelnen Personen gibt man es dort. Keine Namen mehr im Code
  (App und Function prüfen das Recht).
- **Update erzwingen** (`sw.ts`): Übernimmt ein neuer Stand, werden Fenster im
  Hintergrund sofort neu geladen und alte Zwischenspeicher gelöscht – auch
  bei alten App-Ständen ohne eigene Update-Prüfung. Das Fenster im Vordergrund
  lädt wie bisher neu (nicht mitten im Tippen). Zusammen mit `/version.json`
  kommt damit jedes Update an.
- **Reiter-Leiste im Safari-Browser (iPhone):** Safari legt seine eigene Leiste
  unten über die Seite; die Reiter-Leiste der App steht deshalb darüber und
  man sieht darunter Inhalt durchscheinen. Das ist Safari; in der App vom
  Home-Bildschirm („Zum Home-Bildschirm“) sitzt sie richtig.

---


## 28.09.2026: Mithilfe-Werte an die Vorlagen angeglichen

SQL dazu: `supabase/aktion-prozent.sql` (Migration `aktion_prozent_und_angleichen`,
eingespielt). Keine Mitteilungen – die Werte wurden direkt in der Datenbank
geändert, Mitteilungen schickt nur die App.

- **Eingetragene Mithilfe** an die Möglichkeiten im Beiträge-Reiter
  angeglichen (gleicher Titel, auch mit „ EF“ am Ende): „Waffel-/Kuchenverkauf
  außerhalb der Schulzeit“ 10 → 15 % (19 Einträge). Alle anderen passten schon.
- **Aktionen (Mitmachen)** angeglichen: Waffeleisen 20 %, Puderzucker,
  Besteck und Tischdecke je 5 %, „Waffelverkauf 1. große Pause“ 8 % (Vorlage
  „Waffelverkauf in der Pause“). Kuchen backen / Waffelteig blieben bei 5 %.
- Tippfehler in der Vorlage behoben: „Lehrerkarten Unterstützung“.
- **Prozent nachträglich ändern:** Team bzw. „Termine verwalten“ tippt an der
  Aktion im Events-Reiter auf „ändern“ neben „zählt als +x %“ und wählt eine
  Möglichkeit aus dem Beiträge-Reiter. Neue Funktion
  `aktion_prozent_setzen()`: setzt den Wert und passt schon vergebene Mithilfe
  der abgeschlossenen Schichten dieser Aktion mit an. Auch „anpassen“ im
  Aktions-Fenster nutzt sie jetzt.

---


## 28.09.2026: Alte App-Stände auf iPhone/iPad

Kein SQL. Keine Mitteilung.

- **Befund (Beispiel eines Schülerkontos):** Rechte und Datenbank stimmen –
  „Finanzen ansehen – Standard“ ist an, `finanz_uebersicht()` liefert Daten.
  Das Apple-Gerät hat sich am 25.09. um 07:02 (UTC) angemeldet; den
  Finanzen-Reiter für alle gibt es erst seit 25.09. 12:29 (UTC). Das Gerät
  läuft sehr wahrscheinlich noch mit dem alten App-Stand, weil iOS die
  Web-App im Speicher hält und den Service Worker nur selten nach Updates
  fragt.
- **Sicherheitsnetz** (`vite.config.ts`, `main.tsx`): Jeder Build legt
  `/version.json` mit dem Bau-Zeitpunkt ab. Die App fragt sie beim Start, alle
  5 Minuten und beim Zurückholen in den Vordergrund ab (ohne Zwischenspeicher).
  Ist online ein neuerer Stand, wird erst das normale Update versucht; kommt es
  nicht binnen 15 s, werden Service Worker und Zwischenspeicher gelöscht und
  die Seite neu geladen – nie beim Tippen, pro Stand höchstens einmal (getestet:
  lädt einmal neu, keine Schleife).
- Geräte, die noch einen Stand **vor** dieser Änderung haben, brauchen einmal
  einen echten Neustart der App (ganz schließen, neu öffnen) – danach
  aktualisieren sie sich selbst.

---


## 28.09.2026 (spät): Chat-Kreise, Vorsitz

Kein SQL. Keine Mitteilung, keine neue Einführung.

- **Kreis mit Initialen oben – in allen Chats:** Die Komitee-Chats hatten
  eine eigene Kopie der Nachrichtenblase, darum griff die letzte Änderung dort
  nicht. Jetzt gibt es eine Blase für alle (`ChatBlase` in `ChatBlasen.tsx`,
  genutzt von `KomiteePage.tsx` und den übrigen Chats). Der Kreis steht oben
  auf Höhe des Namens, bei eigenen Nachrichten rechts. Das gilt für alte und
  neue Nachrichten – die Darstellung kommt aus der App.
- **Vorsitz: „Unbekannt“ behoben** (`VorsitzSheet.tsx`): Wer sich noch nie
  angemeldet hat, hat noch kein öffentliches Profil. Das Stufenteam sieht
  jetzt den Namen aus der Schülerliste (Konto → Schülereintrag), sonst steht
  dort „Noch nicht angemeldet“. Bewusst **nicht** vorab öffentliche Profile
  angelegt: sonst stünden die Namen aller nie angemeldeten Schüler für alle
  (auch Eltern) lesbar in der Datenbank.
- **Keine Mitteilung mehr beim neuen Vorsitz** (`termine-store.tsx`).

---


## 28.09.2026 (abends): Live-Verbindung, Chats, Kalender

SQL dazu: `supabase/chat-eintraege-loeschen.sql` (Migration
`chat_eintraege_loeschen`, eingespielt). Keine Mitteilung, keine neue Einführung.

- **„Keine Live-Verbindung“ repariert sich selbst** (`lib/realtime.ts`):
  Bisher wurden nur die Kanäle neu angemeldet – über eine tote Leitung. Jetzt
  wird gemacht, was ein Neustart macht: Sitzung/Token erneuern, die
  WebSocket-Leitung trennen und neu aufbauen, alle Kanäle neu anmelden.
  Automatisch, wenn die App länger als 20 s im Hintergrund war, wenn ein
  Kanal dreimal scheitert und wenn die Verbindung 15 s weg ist (Wächter alle
  5 s). Bleibt sie 90 s weg, lädt die App neu (höchstens alle 5 Minuten, nie
  beim Tippen). Der Knopf „Neu verbinden“ macht dasselbe sofort und lädt neu,
  wenn es nach 8 s immer noch nicht klappt.
- **Chats:** der Kreis mit den Initialen steht oben neben dem Namen statt
  unten an der Blase (`ChatBlasen.tsx`).
- **To-dos, Abstimmungen, Angepinntes löschen:** neues Recht
  `chats.delete_items` („To-dos & Abstimmungen löschen“, Rechte-Reiter →
  Chats & Übersicht). Standard: alle, die fremde Nachrichten löschen dürfen
  (Rollen und Einzelrechte übernommen). Eigene To-dos darf jeder löschen –
  neuer Mülleimer an jedem To-do. Zugriffsregel `titems delete` angepasst.
  Rechte-Test: 1 neuer Fall (137).
- **Kalender, Monat auf dem Handy:** statt bloßer Punkte kleine Schilder in
  der Farbe des Termins mit Bildzeichen und Anfang des Titels (🧇 Waffe…),
  Klausuren als Kürzel (M, EK); bis zu zwei je Tag, dazu „+n“.

---


## 28.09.2026: Buchen wie gewohnt, Geplante Aktionen, immer neueste Version

SQL dazu: `supabase/finanzen-geplant.sql` (neu) und `supabase/finanzen-kategorien.sql`
(Spalte `kasse_buchungen.farbe`, `finanz_uebersicht()` mit Unterpunkten) –
Migration `finanzen_geplant_farbe_unterpunkte`, eingespielt. Keine Mitteilung,
keine neue Einführung.

- **Keine Mitteilungen mehr bei Zahlungen/Buchungen:** „bezahlt“/„erlassen“
  schickt Schülern und Eltern nichts mehr (einzeln und in der
  Massenbearbeitung, `store.tsx`). Kassenbuchungen haben nie etwas geschickt.
- **Immer die neueste Version** (`main.tsx`): Die App prüft alle 5 Minuten
  und beim Zurückholen in den Vordergrund, ob es einen neuen Stand gibt, und
  lädt dann einmal neu. Wer gerade in ein Feld tippt, wird nicht unterbrochen
  – neu geladen wird, sobald das Feld verlassen wird oder die App im
  Hintergrund ist.
- **Ring:** die Stufen-Striche sind genau so lang, wie der Ring dick ist –
  nichts steht mehr über.
- **Buchen (ein Formular für alles, `BuchungSheet` in `FinanzBereiche.tsx`):**
  „+ Einnahme“ / „− Ausgabe“ → Betrag → **Wofür?** (eine Kategorie wie
  „Lehrerkarten“, „Sonstiges“ oder „+ Neue Kategorie“) → **Bezeichnung
  (Pflicht)**, z. B. „Verpackungsmaterial“ → Tag. Die Farbe kommt von der
  Kategorie und lässt sich für diesen Eintrag ändern („Farbe · ändern“).
  Dasselbe Formular öffnet sich aus dem Detail einer Kategorie – dort ist
  die Kategorie schon gewählt; danach springt es zurück ins Detail.
- **Detail einer Kategorie:** Einnahmen (+), Ausgaben (−), Gewinn/Verlust,
  darunter die Einträge mit Bezeichnung und Tag. Alle sehen die Einträge
  (zusammengefasst je Tag und Bezeichnung) – darum beim Buchen der Hinweis
  „Für alle sichtbar – bitte keine Namen“. Elternbeiträge (mit Namen im
  Titel) tauchen dort nie auf.
- **Übersicht:** Einnahmen mit „+“, Ausgaben mit „−“ – in den Kacheln und an
  jeder Zeile.
- **Kein eigener Ausgaben-Bereich mehr:** Ausgaben gehören zu ihrer
  Kategorie; Ausgaben ohne Kategorie zählen zu „Sonstiges“ (grau).
- **Geplante Aktionen** (`kasse_geplant`): anstehende Geldaktionen mit
  Titel, Tag, Infos, erwartetem Betrag und – freiwillig – Kategorie. Alle mit
  Finanzen sehen sie (vorbei = ausgeblendet), eintragen/ändern/löschen nur
  „Kassenbuch führen“. Rechte-Test: 5 neue Fälle (136).

---


## 27.09.2026 (abends): Finanzen in zwei Bereichen, Posten mit Gewinn

SQL dazu: `supabase/finanzen-kategorien.sql`, Funktion `finanz_uebersicht()`
(Migration `finanz_uebersicht_netto_bereiche`, eingespielt). Keine Mitteilung,
keine neue Einführung.

- **Legende der Halbjahre** passt auf dem Handy in eine Zeile (auch 320 px):
  kleinere Kästchen, Schrift per `clamp`. „nicht dabei“ erscheint nur noch,
  wenn die Person wirklich Halbjahre vor dem Eintritt hat (`HalbjahrLegende`).
- **Prozent-Ring:** die Stufen-Striche schneiden jetzt quer durch den Ring
  (dunkel mit hellem Rand – auf gefülltem und leerem Teil gut sichtbar); der
  aktuelle Strich in der Markenfarbe steht etwas über (`Ring.tsx`).
- **Kennzahlen:** statt drei gequetschter Kacheln zwei (Einnahmen, Ausgaben)
  und darunter eine Zeile „Offene Elternbeiträge · fällig bis … · Schuljahr“
  (`Kennzahlen` in `FinanzBereiche.tsx`, Standard und Erweitert).
- **Zwei Bereiche** statt „Stufenbeiträge“ + „Aktionen, Ausgaben und
  Sonstiges“ (`PostenBereiche`):
  1. **Aktionen, Beiträge und Sonstiges** – Elternbeiträge (blau), jede
     Aktion bzw. jeder Posten in seiner Farbe, Spenden, Sonstiges (grau).
  2. **Ausgaben** – was keiner Aktion gehört (Komitees, sonstige Ausgaben).
  Jede Zeile ist antippbar (ⓘ): Einnahmen, Ausgaben, Gewinn mit Balken;
  bei mehreren Tagen die einzelnen Termine. Elternbeiträge zeigen EF, Q1, Q2
  und die Summe.
- **Wieder ausgetragene Elternbeiträge** werden nicht mehr als Ausgabe
  aufgelistet, sondern mit ihrer Phase verrechnet (netto). Die 25 € vom
  24.09. heben sich so mit der erneuten Zahlung auf; Einnahmen − Ausgaben =
  Kontostand stimmt weiter. In der Datenbank wurde nichts gelöscht.
- **Bearbeiten (Kassenwart/Admin, „Kassenbuch führen“, Ansicht Erweitert):**
  „＋ Neu“ → Name + Farbe → „Weiter“, dann im Detail Betrag + Tag →
  „Einnahme/Ausgabe hinzufügen“. Mehrere Termine = mehrmals hinzufügen,
  alles zusammen = einmal. Einträge per Mülleimer löschen, „Ändern“ für Name
  und Farbe (eine Aktion bekommt dabei einen eigenen Posten mit Farbe, ihre
  Buchungen ziehen mit). Ein Posten ist technisch eine Kategorie
  (`kasse_kategorien`); Rechte unverändert.
- Standard-Ansicht zeigt weiterhin keine Namen und keine Bezeichnungen
  einzelner Buchungen – nur Summen je Posten und je Tag.

---


## 27.09.2026: Rückmeldungen der Eltern (Kasse, Mithilfe, Finanzen)

SQL dazu: `supabase/finanzen-kategorien.sql` (in der Datenbank eingespielt).
Es gibt dazu keine Mitteilung und keine neue Einführung – die App
aktualisiert sich still.

- **Mithilfe:** Eltern lesen „Wenn Ihr Kind bei Aktionen mithilft, zahlt es
  weniger Aufschlag auf das 1. Abiball-Ticket.“ Über den Kacheln steht
  „Aufschlag aufs erste Ticket“ (`StaffelKacheln` in `Staffel.tsx`, auch in
  der Schüleransicht).
- **Prozent-Ring:** (später geändert, siehe oben) außen ein kleiner Strich an jeder Stufe, an der der
  Aufschlag sinkt; der Strich der aktuellen Stufe in der Markenfarbe – wie
  die aktuelle Kachel (`Ring.tsx`, `StaffelRing`).
- **Legende der Halbjahre:** statt Text-Zeichen dieselben Kästchen wie oben
  (Farbe, Rand, ✓ € /), in Eltern- und Schüleransicht (`HalbjahrLegende`).
- **Finanzen:** Hinweis „Das ist die Übersicht für alle …“ entfernt.
  „Rein/Raus“ heißt jetzt „Einnahmen/Ausgaben“, alle Zahlen in derselben
  Farbe. „Beiträge offen“ heißt „Elternbeiträge offen – fällig bis Q1.1
  (2026/27)“ (`schuljahrVon()`).
- **Kategorien mit Farbe** fürs Kassenbuch (`kasse_kategorien`,
  `kasse_buchungen.kategorie_id`): beim Buchen wählen oder neu anlegen, später
  im Detail ändern, im Zahnrad verwalten. Mehrere Kategorien dürfen dieselbe
  Farbe haben. Die Farbe steht im Kreis (Erweitert), im Fortschrittsbalken
  (Standard, Abschnitte nach Farbe) und als Punkt an jeder Zeile. Ohne
  Kategorie gilt die Farbe der Herkunft (Beiträge blau, Aktionen orange …).
  Die Standard-Ansicht bekommt die Farben über `finanz_uebersicht()` – die
  Buchungen selbst sehen weiterhin nur Kassenwart, Team und Aufsichtsrat.
- Rechte-Test: 129 Fälle (neu: Kategorie anlegen – nur mit `finanzen.manage`).
- **Beide Finanz-Ansichten rechnen jetzt gleich** (vorher: Standard 17 %,
  Erweitert 11 %): Einnahmen und Ausgaben sind brutto, Bankabgleiche zählen
  als „Sonstiges“ (grau), zurückgenommene Elternbeiträge als Ausgabe. Damit
  gilt überall Einnahmen − Ausgaben = Kontostand, und der Fortschritt ist in
  beiden Ansichten Kontostand ÷ Ziel. „Sonstiges“ ist jetzt grau.

---


## 25.09.2026 (abends): Mithilfe, ohne eingetragen zu sein

Anlass: Eine Schülerin bekam „🙌 Mithilfe eingetragen … Danke fürs Mithelfen!“
und 5 % angerechnet, ohne sich für eine Schicht eingetragen zu haben. Mithilfe
entsteht nur auf drei Wegen: einzeln im Blatt einer Person, über „Mehrere
auswählen“ in der Kasse oder über „Punkte vergeben“ nach einer Schicht. Welcher
es war, ließ sich nicht klären – dafür fehlte in der Datenbank jede Spur.

**Mehrere auswählen** (`MassBar.tsx`)
- Im Auswahl-Modus wählt ein Tipp irgendwo auf eine Zeile (Name, Betrag,
  Prozent) die Person aus, und eine Auswahl bleibt stehen, wenn Suche oder
  Filter sie ausblenden. Die Leiste zeigte nur „5 ausgewählt“. Ein Fehltipp
  fiel so nicht auf – und die Person bekam Mithilfe samt Mitteilung.
- Jetzt stehen die Namen aller Ausgewählten in der Leiste, auch der
  ausgeblendeten; ein Tipp auf einen Namen wählt ab. Vor „Eintragen“ steht
  noch einmal „Mithilfe für N Personen – alle bekommen sofort eine
  Mitteilung“.

**Nachvollziehbar** (`supabase/mithilfe-nachvollziehen.sql` – muss im SQL
Editor eingespielt werden)
- `created_by`/`created_at` setzt die Datenbank selbst. Vorher schrieb die
  App bei Mithilfe keinen Urheber mit.
- Mithilfe eintragen, ändern, löschen steht im Protokoll (neuer Filter
  „🙌 Mithilfe“). Mehrere auf einmal = eine Zeile mit allen Namen.
- Im Blatt „Gesammelte Prozent“ sieht das Team bei jedem Eintrag „von …“.
- „Punkte vergeben“ geht erst nach Schichtende, auch direkt über die
  Datenbank (`schicht_abschliessen`). Im Protokoll steht dann „Schicht
  abgeschlossen – …“.
- Am Ende der Datei zwei Abfragen (nur lesen), mit denen sich für ältere
  Einträge klären lässt, ob sie von Hand, im Rutsch mit anderen oder über
  eine Schicht kamen.
- Rechte-Test: 127 Fälle (neu: Mithilfe unter fremdem Namen, Punkte für
  laufende Schicht).

Den einen falschen Eintrag löscht das Team in der App: Kasse → Person →
„Mitgeholfen“ → ✎ → Löschen.

---


## 25.09.2026: Termine in Farbe, Ferien, Klausuren, Schicht-Abschluss, Chat-Sperren

SQL dazu: `supabase/termine-schichten-chat.sql` (in der Datenbank eingespielt).

**Termine**
- Neue Spalten `termine.farbe` (8 Farben, `FARBEN` in `src/lib/termine.ts`) und
  `termine.frei` (Ferien/unterrichtsfrei). Im Formular (`TerminSheet.tsx`):
  Farbe, Zeichen (Bildzeichen oder Fach-Kürzel wie „M“, „EK“, „F7“) und der
  Haken „Ferien / unterrichtsfrei“.
- Ferien laufen als Farbband durch Monat, Woche und Wochenstreifen (`freiAn()`),
  statt als Kärtchen jeden Tag Platz zu nehmen.
- Klausuren = Termine mit Kürzel als Zeichen (`istKlausur()`). Mehrere an einem
  Tag stehen als eine Zeile Schilder (`KuerzelLeiste`, `KlausurKarte` in
  `TerminZeichen.tsx` / `Kalender.tsx`): „BI CH PH +1“ statt fünf Kacheln.
- Stunden-Schnellwahl im Formular (`STUNDEN`: 7:35 … 15:30, je 45 Minuten):
  erst Beginn, dann Ende antippen.
- „ganze Stufe · auch Eltern“ steht nicht mehr unter jedem Termin
  (`umfangText()` liefert für „alle“ nichts mehr).
- Behoben: Wer eine Schicht über „Ändern“ bearbeitete, löste sie still von
  ihrer Aktion (und damit von Plätzen und Punkten). Jetzt bleiben `aktion_id`
  und `plaetze` erhalten.
- Eingetragen (direkt in der Datenbank, ohne Mitteilung): alle Klausuren Q1
  2026/27 aus dem Klausurplan (Zeiten nach dem Stundenraster: 45 Minuten
  je Stunde, Pausen dazwischen verschieben das Ende), Kommunikationsprüfungen, Herbst- und Weihnachtsferien,
  Studientag 30.11., Mr. Wissen to go, Crash-Kurs NRW, Berufs- und
  Studienorientierung, Praktikum. Damit kein „138 neue Termine“-Hinweis
  aufgeht, steht ihr `created_at` auf dem 01.09.2026.

**Schichten**
- „voll“ an jeder Schicht, Eintragen gesperrt, wenn alle Plätze vergeben sind;
  Eingeteilte lassen sich weiter austragen.
- Sortierung beim Verteilen rechnet geplante Punkte mit: wer schon in anderen,
  noch nicht abgeschlossenen Schichten steht, rückt nach unten.
- Schicht vorbei → Pop-up fürs Stufenteam (`SchichtAbschluss.tsx`): „Punkte
  vergeben“ trägt allen Eingeteilten die Prozente der Aktion ein – über
  `schicht_abschliessen()` genau einmal, auch bei zwei gleichzeitigen Tipps.
  Zusätzlich Push ans Team: `pg_cron` (alle 5 Minuten) → `pg_net` →
  `send-push` mit `{"schicht_ende": true}`; der Server sucht die Schichten
  selbst (`schicht_enden_offen()`), der Aufruf trägt keinen Text.
- Bestätigungs-Push beim Einteilen kam nicht an, wenn man sich selbst einteilte
  (Absender wurde immer herausgefiltert). Jetzt `auch_selbst` im Direkt-Modus.
- Aktionen: Prozent kommen aus dem Beiträge-Reiter (Auswahl statt freier Zahl),
  Abweichungen werden angezeigt. Vorlagen lassen sich löschen (ohne Schichten)
  bzw. aus der Auswahl nehmen (mit Schichten – die bleiben stehen).

**Chats**
- Angepinnte Nachrichten: Loslösen oder ganz löschen – für die Person selbst
  und alle mit `chats.delete_messages`.
- Sperren im Chat (`chat_sperren()`): Sperre und eine kursive Zeile ohne
  Absender („… wurde von Moderator … gesperrt“) in einem Schritt. Das
  geschützte OP-Konto lässt sich nicht sperren; sperrt es selbst, heißt die
  Zeile „Relyt hat … in die stille Ecke verbannt“. Systemzeilen kann niemand
  selbst schreiben (`type <> 'system'` in der Einfüge-Regel).
- Lücke geschlossen: Jeder mit Zugriff auf einen Chat durfte bisher fremde
  Einträge ändern (Text, Pins). Jetzt nur Verfasser, Team und Moderation;
  alle anderen dürfen fremde To-dos nur abhaken (`guard_topic_item_update`).

**Sonst**
- Einführung: „bei 100 % 0 €“ statt „keiner“ (Wert aus der Staffel).
- Impressum: Verantwortlich ist der Ersteller/Verwalter der Datenbank
  (schulintern); Hinweis zu den Auftragsverarbeitungsverträgen.
- Rechte-Test: 125 Fälle (neu: Punkte selbst vergeben, fremd sperren,
  OP sperren, Sperr-Zeile fälschen, fremde Nachricht umschreiben).

---


## Testphase 25.09.2026: Termine mit dem eigenen Handy-Kalender verbinden

**Nur für die Testkonten `admin.test` / `test.admin`** (und im Demo-Modus) –
alle anderen sehen nichts davon, auch die Function lehnt sie ab.

Eine Web-App darf den Kalender des Handys nicht direkt lesen oder beschreiben
(dafür gibt es im Browser keine Schnittstelle). Deshalb zwei Richtungen über
den offenen iCal-Standard, den iPhone, Google und Outlook alle können:

- **App → Handy (Abo):** `supabase/functions/kalender` liefert unter einem
  persönlichen Link (`webcal://…/functions/v1/kalender?u=…&t=…`) alle Termine,
  die diese Person in der App sieht – dieselbe Regel wie `kann_termin_sehen()`.
  Im Link steckt ein HMAC-Schlüssel (mit dem service_role-Key gebildet), weil
  Kalender-Apps sich nicht anmelden können. Das iPhone holt neue und geänderte
  Termine selbst ab (etwa stündlich), Google alle paar Stunden.
- **Handy → App:** Der iCal-Link des eigenen Kalenders (iCloud „Öffentlicher
  Kalender“, Google „Privatadresse“, Outlook „ICS-Link“) wird im Browser
  gespeichert; die Function holt ihn (nur von iCloud/Google/Outlook, kein
  offener Proxy) und gibt die Termine zurück. Sie stehen gestrichelt mit 📱 im
  Wochenstreifen und im Kalender – nur für diese Person, nur auf diesem Gerät,
  nur zum Ansehen.
- **Einzelner Termin:** „In meinen Kalender übernehmen“ im Termin lädt eine
  `.ics`-Datei, das Handy bietet dann „Hinzufügen“ an.
- Ändern geht jeweils nur dort, wo ein Termin herkommt. Echtes Zwei-Wege-
  Bearbeiten bräuchte einen eigenen Kalender-Server (CalDAV) – bewusst nicht
  Teil dieser Testphase.
- **Ein-Klick-Knöpfe (nur Stufe → Handy):** Im Blatt „Stufen-Termine ins Handy“
  (`src/components/KalenderSyncSheet.tsx`) je ein Knopf für iPhone-Kalender
  (`webcal://`), Google Kalender (`calendar.google.com/calendar/render?cid=…`)
  und Outlook (`outlook.live.com/…/addfromweb`). Ein Tippen öffnet direkt
  „Abonnieren“. Gekennzeichnet ist das an drei Stellen: der Kalender heißt im
  Handy „Stufen-Termine (Stufenkasse)“, jeder Termin hat die Kategorie „Stufe“
  und in der Beschreibung den Satz „Stufen-Termin aus der Stufenkasse-App.
  Ändern geht nur dort.“ Eigene Handy-Termine gehen dabei nicht in die App.
- `supabase/functions/kalender/ics.ts`: iCal schreiben und lesen ohne
  Abhängigkeiten – Zeitzone Europe/Berlin, Wiederholungen (täglich,
  wöchentlich auch an mehreren Tagen, monatlich, jährlich, COUNT/UNTIL,
  EXDATE, verschobene Einzeltermine), über die Zeitumstellung hinweg richtig.
- Nebenbei: Im großen Kalender passt „＋ Termin“ jetzt auch aufs iPhone SE.

Deploy der Function: `supabase functions deploy kalender --no-verify-jwt`
(ohne JWT-Prüfung, weil Kalender-Apps keinen Login schicken; die Function
prüft selbst).

## Nachtrag 3 (24.09.2026): Übernommen aus dem alten Entwurf PR #1

PR #1 (18.09.) lag noch auf einem viel älteren Stand und ließ sich nicht mehr
mergen. Was davon noch fehlte, steht jetzt angepasst im aktuellen Code:

**Live-Verbindung wird überwacht und neu aufgebaut** (`src/lib/realtime.ts`, alle `*-store.tsx`,
`RoleProvider.tsx`, `lib/kosten.ts`, `lib/finanzen.ts`, `UnbanRequests.tsx`, `KomiteeRequests.tsx`)
- Überall stand `.subscribe()` ohne Rückmeldung. Brach die Verbindung ab (Handy
  gesperrt, WLAN gewechselt, Server voll), zeigte die App still den alten Stand –
  „bei anderen aktualisiert es sich nicht“. Jetzt: Zustand je Kanal, neu verbinden
  mit wachsendem Abstand (1 s … 30 s), danach still nachladen; sofort prüfen beim
  Zurückkehren aus dem Hintergrund und bei „wieder online“.
- Jeder Versuch bekommt einen eigenen Kanalnamen (sonst gibt `supabase.channel()`
  den alten, noch schließenden Kanal zurück), und das CLOSED eines abgebauten
  Kanals löst keinen weiteren Neustart aus.
- Kanäle werden nicht mehr nach einem `await` angelegt, wenn die Ansicht schon
  weg ist (lief unter StrictMode doppelt).
- `Verbindungshinweis.tsx`: Kapsel „Keine Live-Verbindung · Neu verbinden“ oben,
  erst nach 6 s ohne Verbindung, nie vor dem Login.

**Fremde Änderungen werden nicht mehr verschluckt** (`src/lib/echo.ts`, `store.tsx`)
- Das Echo der eigenen Änderung wurde 5 s lang pro Zeile weggeworfen – auch
  fremde Änderungen an derselben Person. Bei den Einstellungen galt ein fester
  Schlüssel: jede Umstellung machte 5 s lang ALLE Einstellungsänderungen aller
  unsichtbar. Jetzt wird zusammengeführt: Serverstand gilt, nur die eigenen
  frisch geschriebenen Felder behalten kurz Vorrang. Beim Abmelden wird geleert.
- Die vier Startabfragen laufen parallel; Nachladen nach einer Unterbrechung
  ersetzt die Liste nicht durch den Ladekreis. Profilfarben: nur die geänderte
  Zeile statt aller Profile neu laden.

**Benachrichtigungen: Fehler sind sichtbar** (`src/lib/push.ts`, `ProfilSheet.tsx`)
- `functions.invoke()` wirft nicht, sondern liefert `{ error }` – das wurde nie
  gelesen. Alle Aufrufe laufen jetzt über `sendePush()`, der Fehler landet in
  „Kommt nichts an? Hier prüfen“ im Profil (Schlüssel, Erlaubnis, Abo, letzter
  Serverfehler).

**Eigene Meldungen und Rückfragen statt Browser-Fenster** (`src/lib/melder.ts`, `components/Melder.tsx`)
- alert()/confirm() an über 60 Stellen ersetzt. Browser bieten nach ein paar
  Fenstern „weitere Dialoge verhindern“ an – danach liefert confirm() stumm
  „nein“ und Löschen tut nichts. Löschen-Rückfragen haben einen roten Knopf.
- Eine Chatnachricht, die nicht gespeichert werden konnte, bleibt stehen und ist
  als „Nicht gesendet“ markiert, statt kommentarlos zu verschwinden.

**Sonstiges**
- Build-Stempel unten im Profil („Stand … · Version abc1234“), damit man sieht,
  was live ist (`vite.config.ts`).
- `schema.sql`, `termine.sql`, `aktionen.sql`: Realtime-Zeilen mehrfach ausführbar.
- Entfernt: `MyCommittee.tsx`, `SettingsSheet.tsx`, `TopicsTab.tsx` (nirgends eingebunden).
- Nicht übernommen, weil schon erledigt oder überholt: `nachtrag.sql`/`pruefen.sql`
  (Spalten der Elterngespräche und die entschärfte Zustimmungsprüfung sind in der
  Datenbank schon da), die Chat-Scroll-Korrektur (kam mit Nachtrag 2), Push-Abo
  der Elternansicht (war schon drin).

## Nachtrag 2 (24.09.2026): Tab-Leiste in der Home-Bildschirm-App, Komitee-Leiste, Rollen-Hinweis

**Tab-Leiste stand bei kurzen Seiten zu hoch** (`src/index.css`)
- Nur in der App vom Home-Bildschirm (iPhone, Statusleiste „black-translucent“):
  Safari rechnet die Seitenhöhe dort ohne die Statusleiste oben. Bei kurzen
  Seiten (Events ohne Einträge, Chats) stand die feste Tab-Leiste deshalb um
  genau diese Höhe (~47 pt) zu weit oben, bei langen Seiten (Kasse) richtig –
  beim Wechsel sprang sie hoch. Jetzt ist jede Seite dort mindestens
  bildschirmhoch (`@media (display-mode: standalone)`), die Leiste steht überall
  gleich. Im normalen Browser ändert sich nichts.

**Komitee-Leiste und Chat-Eingabe unter der Tab-Leiste** (`App.tsx`,
`KomiteePage.tsx`, `ChatBlasen.tsx`, `ChatsTab.tsx`, `lib/gescrollt.ts`)
- „Anpinnen / Abstimmung / To-do“ und die Eingabe im Komitee-Chat hingen noch an
  der Höhe der alten Tab-Leiste (3,6 rem) und lagen halb darunter. Kopf und
  Tab-Leiste werden jetzt gemessen (`--kopf`, `--leiste`), alles Feste richtet
  sich danach. Auch der Plus-Knopf und die Zwischenüberschriften in den Chats.
- Die letzte Nachricht landet über der Eingabe statt dahinter, und beim Lesen
  älterer Nachrichten reißt eine neue Nachricht die Ansicht nicht mehr nach unten.

**Rollen-Reiter: „keiner Person zugeordnet“ nur noch bei Eltern** (`KontoZeile.tsx`, `RolesTab.tsx`)
- Konten ohne eigene Person (Admin, Test) zeigen nur ihre Rolle. Nach „Person
  hinzufügen“ werden auch die Personen neu geladen, damit die neue Person gleich
  mit Namen dasteht statt als Nutzername.

## Nachtrag 24.09.2026: Tab-Leiste auf dem iPhone, schmale Handys

**Tab-Leiste federt nicht mehr hoch** (`src/lib/gescrollt.ts` → `useReiter`,
`src/App.tsx`, `src/components/ElternApp.tsx`, `src/index.css`)
- Auf dem iPhone sprang die Tab-Leiste beim Wechsel zu **Events** nach oben.
  Grund: Erst kam der neue Reiter, danach ging es nach oben. War man vorher
  weit unten und ist der neue Reiter kurz (Events ohne Einträge), stand die
  Seite kurz „hinter dem Ende“ – iOS federt das zurück und nimmt die feste
  Leiste mit. Jetzt geht es erst nach oben, dann in den neuen Reiter.
- Ein Tipp auf den Reiter, in dem man schon ist, scrollt sanft nach oben.
- `overscroll-behavior-y: none` steht jetzt auch an `<html>` – nur dort gilt
  es in Safari für die ganze Seite (an `<body>` wirkte es nicht).

**Nichts mehr breiter als der Bildschirm auf kleinen iPhones (SE, 320 px)**
(`KontoTab.tsx`, `ChatsTab.tsx`, `ElternTeamTab.tsx`)
- Eltern → Konto: Die IBAN schob die ganze Seite breiter; die Tab-Leiste ragte
  über den Rand. Die Schrift wird auf schmalen Handys etwas kleiner (ab 12 px),
  notfalls scrollt nur die Zeile.
- Chats (Team): Lange Titel in „Infos für die Eltern“ drückten die Karten über
  den Rand. Die Listen sind jetzt `grid-cols-1`, dadurch kürzen die Titel wie
  gedacht mit „…“.

## Neu am 24.09.2026: Kinder für Elternzugänge, Apple-Design, neue Einführung

**Rollen-Reiter – Kinder statt Komitees bei Eltern**
(`src/components/RolesTab.tsx`, `KinderSheet.tsx`, `src/eltern-store.tsx` → `kindZuordnen`)
- Bei Elternzugängen steht statt „Komitees“ ein Knopf **„1 Kind / 2 Kinder“**
  (orange **„Kind wählen“**, wenn noch keins zugeordnet ist). Er öffnet das
  Blatt **„Kinder zuordnen“**: oben die zugeordneten Kinder (Entfernen), darunter
  Suche und alle Personen – ein Tipp ordnet zu oder nimmt weg, sofort gespeichert
  in `parent_children`. Zuordnen darf nur der Admin (wie Elternzugänge vergeben);
  alle anderen sehen die Zuordnung nur.
- Eltern haben keinen Chat – der Sperr-Knopf fällt bei ihnen weg.

**Elternzugang ohne Kind sieht nichts** (`src/components/ElternApp.tsx`)
- Kein Kind zugeordnet → nur ein Hinweis, keine Infos, keine Kontodaten, keine
  Reiter. Die App filtert zusätzlich selbst nach der Zuordnung.
- Ordnet der Admin ein Kind zu, erscheint es beim Elternteil **live** (Realtime
  auf `parent_children`, danach lädt die App die Personen neu).
- Datenbank-Seite: **`supabase/eltern-kinder.sql` muss einmal eingespielt
  werden** (siehe unten).

**Design im Apple-Stil** (`tailwind.config.js`, `src/index.css`)
- Systemschrift (San Francisco auf iPhone/iPad/Mac), Systemfarben mit geprüftem
  Kontrast (≥ 4,5:1), gruppierter grauer Hintergrund, echte iOS-Dunkeltöne.
  Grau/Grün/Orange/Rot sind zentral umgestellt – alle Bausteine ziehen mit.
- Großer Titel, der beim Scrollen klein in eine Glas-Leiste wandert
  (`src/lib/gescrollt.ts`); schwebende Tab-Leiste aus Glas (Handy unten, ab
  1024 px oben mittig wie auf dem iPad); Segment-Schalter, iOS-Kippschalter
  (`Schalter.tsx`), Blätter mit Griff zum Runterwischen (`Sheet.tsx`, per Portal
  immer ganz oben).
- Eigene Webschriften entfallen – nichts wird mehr nachgeladen.

**Transaktionsinfos** (`src/components/FinanzenTab.tsx`)
- Buchungen wie in der Wallet-App: farbige Kachel je Art, Titel, Kategorie ·
  Datum, Betrag. Monatsweise gruppiert mit Monatssumme.
- Antippen öffnet das **Detailblatt**: Betrag groß, Titel, Datum, darunter
  Status, Art, Kategorie, Aktion/Komitee, Person und Halbjahr (bei Beiträgen),
  Grundlage (Kostenanfrage), erfasst von/am, Buchungs-Nr. Löschen nur dort
  (nicht mehr als ✕ in jeder Zeile) und nie bei automatischen Buchungen.

**Einführung (Tour)** (`src/components/Tour.tsx`)
- Eigene Rundgänge für **Schüler**, **Stufenteam** (je nach Rechten mit
  Beiträge/Finanzen/Rollen/Rechte) und – neu – **Eltern** (Sie-Form).
- Die Tour **wechselt selbst die Reiter** und zeigt, was dort steht.
- Geräte: Sie nimmt immer das sichtbare Element (Tab-Leiste unten am Handy,
  oben am Rechner). Handy: Karte am freien Rand; Rechner/iPad: Karte direkt am
  Element. Pfeiltasten/Enter/Escape funktionieren.
- Merker jetzt `sv:tour:v3:*` – alle sehen die neue Einführung einmal.

**Demo-Modus zum gefahrlosen Testen** (`src/lib/demo.ts`)
- `npm run demo` startet ohne Datenbank (auch wenn `.env` da ist), Rolle über
  die Adresse: `?rolle=schueler | stufenteam | kassenwart | admin | eltern |
  eltern-leer`. Erfundene Personen, Buchungen und Elternzuordnungen. Im echten
  Build wirkungslos.

**Nach dem Test mit drei Test-Nutzern (Eltern, Schüler, Team) behoben**
- Betragseingabe: „1.500“ ist jetzt 1.500 € (vorher 1,50 €) – auch beim Bankabgleich.
- Buchung: Wechsel von „Spende“ auf „Ausgabe“ leert die Zuordnung (vorher als Spende gebucht).
- Direktlinks `#finanzen`, `#events`, `#chats`, `#infos` landen wieder im richtigen Reiter.
- Chat-Eingabe und Kalender sitzen fest am Bildschirm, über der schwebenden Leiste.
- Spätere Halbjahre sind grau („noch nicht fällig“) statt orange wie eine Schuld.
- Einheitliche Begriffe: „Aufschlag“ und „Abiball-Ticket“; Eltern-Hinweis „bitte jetzt nicht überweisen“.
- Laufendes Halbjahr umstellen und heikle Rollenwechsel (Eltern ↔ Team, Admin) fragen nach.
- Tour: Karte verdeckt das Element nicht mehr (auch iPhone SE), Tab bleibt in der Karte, Enter nur auf dem Knopf.

### Datenbank – einmal einspielen

`supabase/eltern-kinder.sql` im SQL Editor ausführen (mehrfach ausführbar,
prüft sich am Ende selbst). Sie
1. übernimmt die alte Verknüpfung `profiles.student_id` bei Elternkonten nach
   `parent_children` (niemand verliert Zugriff) und leert sie danach,
2. sperrt Kontodaten, Infos und neue Anfragen für Elternzugänge ohne Kind,
3. lässt Eltern Personen und Mithilfe nur noch über die Zuordnung sehen.
4. erlaubt das Zuordnen von Kindern in der Datenbank nur noch dem Admin
   (vorher reichte „Daten bearbeiten“ – Stufenteam hätte per API zuordnen können),
5. schützt automatische Beitragsbuchungen vor Löschen/Ändern von Hand.

---

## Überblick der Commits

| Commit | Inhalt |
|---|---|
| `6971ceb` | Termine Schritt 1: Wochenstreifen, Kalender (Monat/Woche/Tag), Sichtbarkeit je Termin |
| `cbe7b7d` | Aktionsvorlagen und Schichten, Komiteevorsitz, Terminanfragen, wiederholbare Termine |
| `8759219` | Benachrichtigungen repariert, Elternansicht überarbeitet |
| `aa647ef` | Benachrichtigungen für Termine/Schichten/Anfragen, rote Zähler, Löschen fürs Team, Verwendungszweck, Push-Diagnose |
| *(dieser)* | Protokoll für den Admin, tägliche Sicherung, Knopf zum Installieren, Impressum und Datenschutz |

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

## 11. Finanzen aufgeräumt, Kostenanfragen, Aufsichtsrat, Personen anlegen

- **Finanzen-Reiter entschlackt**: oben eine Karte (Kontostand, Rein/Raus/
  Noch offen, Ring mit Ziel), darunter zwei große Knöpfe „+ Einnahme“ und
  „− Ausgabe“. Gebucht wird in einem Fenster mit nur vier Angaben:
  Art, Betrag, Datum, Wofür (Aktion, Komitee, Spende oder Sonstiges);
  Notiz freiwillig. Zielbetrag und Bankabgleich liegen hinter dem Zahnrad.
  Verlauf: nur noch Alle / Rein / Raus + Suche, jede Zeile zeigt die Zuordnung.
- **Kostenanfragen**: Komitee-Vorsitzende sehen den Reiter „Finanzen“ (nur mit
  ihren Anfragen) und können Geld anfragen (Wofür, Betrag, bis wann,
  Begründung). Kassenwart/Admin bekommen eine Benachrichtigung, genehmigen
  oder lehnen ab. Genehmigen bucht die Ausgabe sofort (mit Komitee-Zuordnung),
  der Vorsitz bekommt Bescheid. Rote Zahl am Reiter bei offenen Anfragen.
  Entscheiden läuft über die DB-Funktion `kostenanfrage_entscheiden`
  (Status und Buchung immer zusammen).
- **Aufsichtsrat** (Komitee `aufsichtsrat`) sieht Finanzen und Anfragen,
  kann aber nichts ändern – per RLS (`ist_aufsichtsrat()`), nicht nur in der
  Oberfläche. Eltern zählen nie dazu.
- **Neues Komitee „Chaostag“** in `src/lib/committees.ts`.
- **Admin legt neue Personen an**: Rollen-Reiter → „+ Person hinzufügen“.
  Die Edge Function `person-anlegen` legt Listen-Eintrag und Login an
  (Nutzername nachname.vorname, Startpasswort wird genau einmal angezeigt,
  nirgends gespeichert, muss beim ersten Login geändert werden). Nur Admin/OP.
  Der geheime Schlüssel bleibt auf dem Server.
- Migration: `supabase/kostenanfragen.sql` (bereits eingespielt).

## 12. Abstimmungen: Namen sichtbar, anonym wirklich anonym

- Nicht-anonyme Abstimmungen (Events und Komitee-Chats): unter den Antworten
  „Wer hat abgestimmt? (N)“ – aufklappbar, Namen je Antwort.
- Sicherheitslücke geschlossen: Bei anonymen Abstimmungen konnte man per API
  lesen, wer wie gestimmt hat (die App zeigte es nur nicht an). Jetzt per RLS
  gesperrt; die Zahlen je Antwort kommen namenlos über `stimmen_events()` /
  `stimmen_topics()`. Migration: `supabase/anonyme-abstimmungen.sql` (eingespielt).
  Folge: Bei anonymen Abstimmungen aktualisieren sich fremde Stimmen erst beim
  nächsten Nachladen, nicht mehr live.
- Buchungsfenster: „Einnahme | Ausgabe“ steht im selben Raster wie
  „Datum | Wofür“ darunter, Kanten fluchten.

## 13. Chat-Pop-ups, Stufenteam-Chat, Gespräche mit Schülern, Beitragshilfen-Recht

- **Chat-Pop-ups repariert**: Die Empfänger wurden im Browser berechnet. Ein
  Schüler sieht dort aber nur seine eigene Komitee-Zeile – Pop-ups kamen
  deshalb nur an, wenn das Team schrieb. Jetzt rechnet `send-push`
  (Modus `chat_item_id`) die Empfänger auf dem Server aus.
- **Profil-Schalter „Pop-ups für Chats“** gilt nur für normale Chat-Nachrichten.
  Angepinnte Nachrichten (auch nachträglich angepinnt), Gespräche mit dem
  Stufenteam, Events und Termine kommen immer.
- **Stufenteam-Chat** steht fürs Team ganz oben im Chats-Reiter. Das Team
  sieht ihn per RLS immer, auch ohne „Alle Chats sehen“.
- **Gespräche mit Schülern** (direkt über den Gesprächen mit Eltern):
  Übersicht der Fragen aus der Stufe + „Anschreiben“ (Schüler suchen, Betreff,
  Nachricht). Schüler finden es unter „Frag das Stufenteam“.
- **Events nie für Eltern**, auch nicht über die API (`can_see_event`).
  Knopf im Event-Fenster heißt „Alle Schüler“.
- **Neues Recht „Beteiligungen eintragen“** (`hilfen.edit`) im Rechte-Reiter
  unter Daten, getrennt von „Daten bearbeiten“. Wer data.edit hatte, hat es
  automatisch bekommen.
- **Elternansicht**: kürzere Texte, kein Chat-Schalter im Profil.
- Migration: `supabase/chats-push-und-rechte.sql` (eingespielt), send-push v17.

## 14. Meldungen für Zahlungen, Beteiligungen und Anträge; Live-Aktualisierung; Kasse aufgeräumt

- **Pop-ups an Schüler UND Eltern**, wenn ein Halbjahr als bezahlt oder
  erlassen eingetragen wird (auch per Mehrfachauswahl) und wenn eine
  Beteiligung/Mithilfe eingetragen wird. Neuer Modus `an_personen` in
  `send-push`: der Server sucht Schülerkonto und Elternkonten selbst;
  auslösen darf nur das Team bzw. wer kasse.edit / hilfen.edit hat.
- **Anträge**: Komitee-Wunsch und Entsperr-Anfrage melden sich beim Team;
  die Entscheidung (angenommen/abgelehnt) geht per Pop-up an die Person.
  Kosten- und Terminanfragen hatten das schon.
- **Keine Meldung** bei Rollen, Rechten, Halbjahr und anderen Verwaltungssachen.
- **Live statt Neuladen**: Komitee- und Entsperr-Anträge verschwinden bei allen
  sofort, wenn jemand entschieden hat (Realtime statt 30-s-Abfrage).
- **Reiter-Schutz**: Über eine Adresse wie `#finanzen` kommt niemand mehr in
  einen Reiter, der für ihn nicht vorgesehen ist.
- **Meine Kasse**: Am Rechner links „Mithelfen beim Abiball“ und die Liste
  „Wobei du geholfen hast“, rechts das Abiballticket – keine Lücke mehr.
  Kürzere Ticket-Texte; Legende „noch nicht dabei“ im Dunkelmodus sichtbar.

## 15. Elternzugang beim Anlegen

- „+ Person hinzufügen“ (Rollen-Reiter) legt auf Wunsch gleich den
  Elternzugang mit an (Häkchen, standardmäßig an): Nutzername wie bei allen
  Eltern `vorname.nachname`, Anzeigename „Familie Nachname“, sieht nur dieses
  Kind. Beide Startpasswörter werden genau einmal angezeigt.
- Die Edge Function `person-anlegen` kann mit `eltern_fuer` auch nachträglich
  einen Elternzugang zu einer vorhandenen Person anlegen.
- Zugangslisten bleiben in `privat/` (von Git ausgeschlossen).

## 16. Aktionen mit Zeit-Vorlagen, Kasse bündig

- **Aktion ausschreiben** (Events → ＋ → 🧇 Vorlagen): „ganztägig“ wählbar.
  Ohne gespeicherte Vorlage stehen 07:35–16:15 drin (ganzer Schultag), auch
  im normalen Termin-Fenster.
- **Vorlagen merken sich Zeit, Ort und Plätze** (Häkchen „… merken“; bei neuen
  Aktionen und Aktionen ohne Vorlage automatisch an). Waffelverkauf 1. große
  Pause ist mit 09:10–09:30 vorbelegt, 2. große Pause mit 11:05–11:20. Die Zeit
  steht direkt am Aktions-Knopf.
- Neue Aktionen bekommen ihre Kennung vorab – die Meldung „Öffne das Fenster
  noch einmal für die Schichten“ ist weg.
- Migration: `supabase/aktion-vorlagen.sql` (eingespielt).
- **Meine Kasse**: linke und rechte Spalte enden am Rechner auf einer Höhe.


---

## Protokoll und tägliche Sicherung

**Dateien:** `supabase/protokoll-und-sicherung.sql`, `src/lib/protokoll.ts`,
`src/components/ProtokollSheet.tsx`, `src/components/ProfilSheet.tsx`

### Warum das Protokoll in der Datenbank steht und nicht in der App

Ein Protokoll, das die App schreibt, protokolliert nur, was durch die App
läuft. Wer den anon-Key nimmt und direkt gegen die API geht, taucht dort nie
auf – und genau davor soll ein Protokoll schützen. Deshalb hängen die Trigger
an den Tabellen: `profiles`, `students`, `tag_members`, `komitee_vorsitz`,
`role_permissions`, `user_permissions`, `parent_children`, `kasse_buchungen`,
`kasse_einstellungen`, `bank_konto`, `app_settings` – und für Passwortwechsel
an `auth.users`.

* **Lesen darf nur der Admin** (RLS-Policy `audit lesen`).
* **Schreiben darf niemand.** Es gibt keine INSERT-, UPDATE- oder
  DELETE-Policy. Geschrieben wird ausschließlich über
  `public.audit_schreiben()`, und die ist für `anon` und `authenticated`
  gesperrt – die Trigger rufen sie als `security definer` auf.
* Jede Zeile trägt einen fertigen deutschen Satz (`klartext`). Absicht: das
  Protokoll soll in drei Jahren noch lesbar sein, auch wenn die App die
  Schlüssel bis dahin anders benennt.
* **Die IBAN steht bewusst nicht im Protokoll.** Dass die Bankverbindung
  geändert wurde, ja – womit, nein. Ein Protokoll soll keine zweite Kopie der
  Kontodaten werden.

### Speicherstände

`daten_snapshots` hält den Stand der **Kerndaten** als JSON: Personen,
Beteiligungen, Vorlagen, Einstellungen, Kassenbuch, Sparziel, Bankverbindung,
Komitees, Rollen-/Personenrechte, Elternzuordnungen, Profile.

Nicht dabei – und deshalb beim Zurücksetzen auch nicht angefasst: Chats,
Events, Termine, Aktionen, Abstimmungen, Elterngespräche, Push-Abos.

**Und die Konten selbst schon gar nicht.** Anmeldedaten liegen in
`auth.users`; ein gelöschtes Konto holt kein Speicherstand zurück. Dafür gibt
es nur das Backup der ganzen Datenbank im Supabase-Dashboard. Das steht so
auch in der Oberfläche, damit sich niemand in falscher Sicherheit wiegt.

### Warum der Zeitplan stündlich läuft und nicht um Mitternacht

`pg_cron` rechnet in UTC. `0 0 * * *` wäre im Sommer 2:00 Uhr deutscher Zeit
und im Winter 1:00 Uhr. Deshalb läuft der Job **stündlich** und
`snapshot_taeglich()` prüft selbst, ob es in `Europe/Berlin` gerade die Stunde
nach Mitternacht ist. Das überlebt die Zeitumstellung, ohne dass jemand etwas
umstellen muss.

### Was beim Zurücksetzen passiert

1. Der **jetzige** Zustand wird als `vor_ruecksetzung` weggeschrieben. Ein
   Fehlgriff ist damit rückgängig zu machen.
2. Die Protokoll-Trigger schweigen (`sv.wiederherstellung`), sonst stünden dort
   tausend Zeilen, die niemand ausgelöst hat.
3. Die Automatik „Beitrag bezahlt → Buchung" wird kurz abgeschaltet; das
   Kassenbuch wird gleich selbst zurückgesetzt und würde sonst doppelt buchen.
4. `students` wird **abgeglichen, nicht gelöscht und neu angelegt**. Ein DELETE
   auf `students` reißt per `ON DELETE CASCADE` Elternzuordnungen und
   Event-Einladungen mit, die mit dem Zurücksetzen nichts zu tun haben.
5. `profiles` bekommt **nur** Rolle, Sperre und Verknüpfung zurück. Zeilen
   werden dort nie angelegt oder gelöscht – ein heute existierendes Konto
   verschwindet nicht, weil es im Speicherstand fehlt.
6. Danach genau **ein** Protokolleintrag.

Alles in einer Transaktion: geht etwas schief, ist nichts passiert.

### Wer sieht was

| | Protokoll | Kopie herunterladen | Zurücksetzen |
|---|---|---|---|
| Admin | ja | ja | ja |
| Kassenwart | nein | ja | nein |
| alle anderen | nein | nein | nein |

Das steht nicht nur in der Oberfläche, sondern in den Policies und in den
Funktionen selbst.

---

## „Zur Startseite hinzufügen"

**Dateien:** `src/lib/install.ts`, `src/components/InstallHinweis.tsx`,
`index.html`

Chrome, Edge und Samsung Internet melden `beforeinstallprompt`. Das Ereignis
kommt oft, **bevor React läuft** – deshalb fängt es ein kurzes Skript in
`index.html` ab und legt es unter `window.__svInstall` ab. Ohne das wäre der
Knopf beim ersten Öffnen tot.

**Safari auf iPhone und iPad kennt dieses Ereignis nicht.** Apple hat es nie
eingebaut, und Chrome und Firefox dürfen auf iOS ohnehin nicht installieren.
Dort ist eine Anleitung („Teilen → Zum Home-Bildschirm") das Einzige, was
möglich ist – das ist keine Bequemlichkeit, sondern die Grenze des Browsers.

Daraus folgt eine zweite Grenze, ehrlich gesagt: Ob die App auf einem iPad
schon auf dem Home-Bildschirm liegt, **kann die Seite im Safari-Tab nicht
erkennen**. Sie weiß nur, ob sie gerade als installierte App läuft. Deshalb
gibt es dort „Hab ich gemacht" – danach ist auf dem Gerät Ruhe.

Der Zustand liegt **im Modul**, nicht in jedem Baustein einzeln. Vorher blieb
die Karte auf der Startseite stehen, nachdem jemand über den
Begrüßungs-Bildschirm installiert hatte.

Gar nichts angeboten wird auf Desktop-Browsern ohne Installationsweg (z. B.
Firefox am Rechner) – eine Anleitung, die zu nichts führt, ist schlimmer als
kein Knopf.

---

## Impressum und Datenschutz

**Dateien:** `src/components/Rechtliches.tsx`, `src/auth/AuthGate.tsx`,
`docs/DATENSCHUTZ.md`

Beide Seiten hängen **unter dem Anmeldeformular** – Pflichtangaben müssen ohne
Anmeldung erreichbar sein – und zusätzlich im Profil. Sie liegen im Code und
nicht in der Datenbank: Sie müssen auch dann da sein, wenn gerade nichts lädt.

Die Stellen, für die es echte Angaben braucht (Name, ladungsfähige Anschrift,
Aufsichtsbehörde, Supabase-Region), stehen als **gelb hinterlegte Platzhalter**
drin. Erfundene Adressen wären schlimmer als keine.

`docs/DATENSCHUTZ.md` führt die Liste weiter: Auftragsverarbeitungsverträge,
Einwilligung der Eltern nach Art. 8 DSGVO, Verarbeitungsverzeichnis,
Löschkonzept – und warum der App Store für eine PWA nicht der richtige Weg ist.

## Startpasswort beim Anlegen selbst festlegen

- „+ Person hinzufügen“: Startpasswort für Schüler- und Elternzugang wird von
  Hand eingetippt (mind. 8 Zeichen), mit Knopf „🎲 Vorschlag“ für ein
  zufälliges 8-stelliges Passwort ohne Verwechsler (0/O, 1/l/I).
- Schreibweise eines Nachnamens korrigiert (Personenliste, beide Zugänge,
  Nutzernamen).

## Impressum ausgefüllt, Schriften ohne Google

- Impressum und Datenschutz: Jahrgang/Schule, Nutzung ab 16, Supabase-Region
  eu-west-3 (Paris) und die LDI NRW als Aufsichtsbehörde stehen jetzt fest drin.
- **Name, Anschrift und E-Mail des Betreibers stehen nicht im Code**, sondern
  kommen aus den Vercel-Umgebungsvariablen `VITE_BETREIBER_NAME`, `_STRASSE`,
  `_ORT`, `_MAIL` (Anleitung: `docs/DATENSCHUTZ.md`, Abschnitt 2). Fehlt eine,
  zeigt die App einen gelben Platzhalter.
- Schriften (Public Sans, Bricolage Grotesque) kommen aus dem eigenen Build
  statt von Google Fonts – keine IP-Adressen mehr an Google. Die lateinischen
  Schnitte sind im Offline-Speicher der App.
- GitHub Pages baut nicht mehr bei jedem Push mit (nur noch von Hand), die App
  läuft auf Vercel.

## Testphase 24./25.09.: doppelte Komitees, Eltern-Pop-ups, Sicherheit, Tempo

Ausführlich: `docs/TESTBERICHT-2026-09-24.md`.

- **Doppelte Komitee-Chats** zusammengeführt. Die Datenbank lässt keine
  zweiten mehr zu (Trigger und eindeutiger Index). Fehlende Chats legt die App
  nur noch an, wer alle Chats sieht.
- **„Infos für Eltern“ kommen als Pop-up** – an alle Elternzugänge mit Kind,
  die Mitteilungen erlaubt haben. Neuer Modus `eltern_info_id` in `send-push`,
  nur für das Team. Doppeltipp-Schutz beim Veröffentlichen.
- **Sicherheitslücken geschlossen**
  - Aufsichtsrat nicht mehr selbst wählbar (auch nicht über die
    Schnittstelle).
  - `send-push` verschickt keinen beliebigen Text mehr an beliebige Handys.
  - Ohne Anmeldung lässt sich das Betreiber-Konto nicht mehr ermitteln.
- **Zugriffsregeln 30- bis 95-mal schneller**, inhaltlich unverändert. Die
  Aufrufe sind so eingepackt, dass Postgres sie einmal pro Abfrage statt
  einmal pro Zeile rechnet.
- **Oberfläche**
  - Lange Namen und Links sprengen das Layout nicht mehr.
  - Kontrast verbessert (442 → 30 knappe Stellen).
  - Fehlende Beschriftungen ergänzt, größere Tippflächen.
- **Datenschutz im Repo:** Echte Namen aus Kommentaren, Beispielen und diesem
  Protokoll durch erfundene ersetzt. Die Geschwister-Liste für
  `scripts/eltern-anlegen.mjs` steht jetzt in `privat/geschwister.json`.
- **Tests zum Wiederholen:** `supabase/tests/rechte-test.sql` (106 Fälle) und
  `tests/` (Oberfläche, Massendaten, Last, Edge Functions), Anleitung in
  `tests/README.md`.
- **Eingespielt**
  - `supabase/komitee-chats-eindeutig.sql`
  - `supabase/aufsichtsrat-schutz.sql`
  - `supabase/rls-schneller.sql`
  - `supabase/anon-abdichten.sql`
  - `send-push` v19

## Termine still eintragen, Änderungen auf Wunsch melden

- Neuer Termin: Schalter „Mitteilung an alle, die ihn sehen“ (Standard an).
  Aus = der Termin steht nur im Kalender, niemand bekommt ein Pop-up. Gilt
  auch für Wiederholungen (eine Reihe = eine Mitteilung).
- Termin ändern: Schalter „Änderung als Mitteilung schicken“ (Standard aus).
  An = alle, die den Termin sehen, bekommen „Geändert: Datum · Zeit · Ort“.
- Schichten aus Aktionsvorlagen melden sich wie bisher immer.

## Events: ganzes Team, auch still

- Events (Info, Nachricht, Umfrage) legt jetzt das **ganze Team** an:
  Stufenteam, Kassenwart, Admin, Sprecher, stv. Sprecher – in der App (Knopf)
  und in der Datenbank gleich (`supabase/events-ganzes-team.sql`, eingespielt).
  Vorher: Knopf nur für Admin/Sprecher, Datenbank nur für Stufenteam/
  Kassenwart/Admin – Sprecher bekamen einen Fehler.
- Schüler und Eltern legen keine Events und Termine an. Eigene Termine sehen
  sie nur über die Kalender-Verbindung zum eigenen Handy (nur auf ihrem Gerät).
- Rote Warnungen weiterhin nur Kassenwart und Admin.
- Beim Veröffentlichen: Schalter „Mitteilung an alle, die es sehen“
  (Standard an) – aus = still, nur im Reiter Events.
- Rechte-Test um 4 Fälle erweitert (Events Team, Warnungen).

## Finanzen: Standard- und Erweiterte Ansicht

- Neues Recht **„Finanzen ansehen – Standard“** (im Rechte-Reiter, auch für
  Eltern schaltbar). Standard an für Schüler, Eltern und Team. Zeigt nur
  Summen: Kontostand, Anteil am Geldziel, offene Beiträge (Betrag, keine
  Namen), Stufenbeiträge je EF / Q1 / Q2 und jede Aktion mit Einnahmen,
  Ausgaben und Total. Spenden und Ausgaben ohne Aktion nur als Summe.
- **„Finanzen ansehen – Erweitert“** (bisher „Finanzen ansehen“): das komplette
  Kassenbuch mit Namen und Einzelbuchungen. Standard an für Stufenteam,
  Sprecher, Kassenwart, Admin; der Aufsichtsrat automatisch.
- Die Standard-Ansicht liest das Kassenbuch nicht selbst, sondern bekommt
  fertige Summen aus `finanz_uebersicht()` – Namen kommen gar nicht erst aufs
  Handy (`supabase/finanzen-standard-ansicht.sql`, eingespielt).
- Eltern haben dafür einen neuen Reiter „Finanzen“. Wer die erweiterte Ansicht
  hat, kann oben auf „Standard – wie alle“ umschalten und prüfen, was die
  Stufe sieht.
- Rechte-Test um 5 Fälle erweitert (114 ok).
