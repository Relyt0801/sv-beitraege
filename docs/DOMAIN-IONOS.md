# Domain remi-abi28.com bei IONOS auf die App zeigen lassen

Die App liegt bei **Vercel** (`hochladen.bat` pusht, Vercel baut). Die Domain
liegt bei **IONOS**. IONOS soll also nur sagen: „Diese Adresse gehört zu
Vercel." Umziehen muss nichts.

> **Wichtig vorweg:** Trag die IP-Adresse und den CNAME **nicht aus dieser
> Anleitung** ab. Vercel vergibt sie inzwischen pro Projekt aus einem Anycast-
> Bereich; ältere Anleitungen im Netz nennen `76.76.21.21`, neuere Projekte
> bekommen etwas anderes (z. B. `216.198.79.1`). **Die richtigen Werte stehen
> in Vercel auf der Karte der Domain**, sobald du sie dort hinzugefügt hast.
> Nur die nimmst du.

## Schritt 1 – Domain in Vercel eintragen

1. Vercel öffnen → Projekt `sv-beitraege` → **Settings** → **Domains**.
2. `remi-abi28.com` eintragen, dann noch einmal `www.remi-abi28.com`.
3. Vercel zeigt jetzt zu jeder Domain eine Karte mit den **genauen** Werten:
   * für `remi-abi28.com` einen **A-Record** mit einer IP-Adresse
   * für `www.remi-abi28.com` einen **CNAME** (etwas in der Art
     `cname.vercel-dns.com` – der genaue Name steht auf der Karte)
4. Diese beiden Werte abschreiben. Sie gelten ab jetzt.

## Schritt 2 – Bei IONOS eintragen

IONOS → **Domains & SSL** → `remi-abi28.com` → **DNS**.

| Typ | Hostname | Wert | TTL |
|---|---|---|---|
| A | `@` | *die IP von der Vercel-Karte* | 1 Stunde |
| CNAME | `www` | *der CNAME von der Vercel-Karte* | 1 Stunde |

Alte `A`- oder `CNAME`-Einträge für `@` und `www` (IONOS legt oft eine
Platzhalterseite an) vorher **löschen** – zwei widersprüchliche Einträge sind
der häufigste Grund, warum es danach nicht geht.

**Nicht anfassen:** MX-Einträge (E-Mail) und TXT-Einträge bleiben, wie sie sind.

## Schritt 3 – Warten und prüfen

DNS-Änderungen brauchen zwischen ein paar Minuten und ein paar Stunden. In
Vercel wird die Karte grün, sobald es durch ist; das HTTPS-Zertifikat stellt
Vercel dann von selbst aus.

Prüfen von der Kommandozeile:

```
nslookup remi-abi28.com
nslookup www.remi-abi28.com
```

## Schritt 4 – Danach in der App nachziehen

1. **Supabase → Authentication → URL Configuration**: `Site URL` auf
   `https://remi-abi28.com` setzen und die alte Vercel-Adresse unter
   *Redirect URLs* stehen lassen, bis alles läuft.
2. **Push-Benachrichtigungen**: Ein Push-Abo hängt an der Adresse. Wer die App
   unter der alten Adresse auf dem Home-Bildschirm hat, bekommt unter der
   neuen erst wieder welche, wenn er sie dort einmal neu erlaubt. Sag das der
   Stufe vorher an – sonst heißt es hinterher, die Benachrichtigungen seien
   kaputt.
3. **Alte Adresse weiterleiten**: In Vercel bei der alten `*.vercel.app`-
   Adresse nichts abschalten, solange noch jemand sie benutzt.
4. Impressum und Datenschutzerklärung müssen ausgefüllt sein, **bevor** die
   Domain öffentlich erreichbar ist – siehe `docs/DATENSCHUTZ.md`.

## Was NICHT nötig ist

* Kein Webhosting-Paket bei IONOS. Die Domain allein reicht.
* Kein SSL-Zertifikat bei IONOS kaufen. Vercel macht das kostenlos.
* Keine Weiterleitung („Domain-Weiterleitung") bei IONOS einrichten. Die
  erzeugt nur einen Rahmen um die Seite und bricht dabei die App.
