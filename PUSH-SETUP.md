# Web-Push einrichten (Benachrichtigung bei neuem Event)

Push aufs Gerät bei geschlossener App. Der Code liegt schon im Projekt – es fehlen nur
die Schlüssel, die Datenbank-Tabelle und das Deploy der Function. Alles einmalig.

## 1. VAPID-Schlüssel erzeugen (lokal)
```bash
npx web-push generate-vapid-keys
```
Du bekommst **Public Key** und **Private Key**.

## 2. Public Key in die App
- Bei **Vercel** → Project → Settings → Environment Variables:
  `VITE_VAPID_PUBLIC_KEY = <Public Key>` → neu deployen.
- (Lokal in `.env` dieselbe Zeile, falls du lokal testest.)

## 3. Datenbank-Tabelle
Supabase → SQL Editor → Inhalt von `supabase/push.sql` ausführen.

## 4. Edge Function deployen
Einmalig die Supabase CLI installieren und einloggen, dann im Projektordner:
```bash
supabase link --project-ref sdlgfdaxeazjxagajnvt
supabase secrets set VAPID_PUBLIC_KEY="<Public Key>" VAPID_PRIVATE_KEY="<Private Key>" VAPID_SUBJECT="mailto:deine@mail.de"
supabase functions deploy send-push
```
> Der **Private Key** ist geheim – nur als Secret setzen, nie ins Repo.

## 5. Fertig
- In der App im **📣 Events**-Reiter erscheint „🔔 Benachrichtigungen aktivieren" → antippen, Erlaubnis geben.
- Ab dann bekommt jede Person mit aktivierter Erlaubnis eine Push-Nachricht, sobald ein neues Event an sie (oder an alle) veröffentlicht wird.

## iPhone/iPad
Push geht nur, wenn die App **zum Home-Bildschirm hinzugefügt** wurde (Safari → Teilen →
„Zum Home-Bildschirm") und iOS **16.4+** ist. Im normalen Safari-Tab kommt kein Push.
Android/Laptop funktioniert auch im Browser.
