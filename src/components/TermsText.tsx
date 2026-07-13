/**
 * Nutzungsbedingungen & Datenschutzhinweise der Stufenkasse-App.
 * HINWEIS: Vorlage nach bestem Wissen (DSGVO-orientiert), ersetzt keine Rechtsberatung.
 * Vor breitem Einsatz idealerweise von der/dem Datenschutzbeauftragten der Schule prüfen lassen.
 */

export const TERMS_VERSION = "1.0 (Stand: 10.07.2026)";

export function TermsText() {
  const h = "mb-1 mt-5 text-base font-bold";
  const p = "mb-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300";
  const li = "mb-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300";
  return (
    <div>
      <div className="mb-1 text-xl font-bold">Nutzungsbedingungen &amp; Datenschutz</div>
      <div className="mb-4 text-xs text-slate-400">Stufenkasse „Abi 28" · Version {TERMS_VERSION}</div>

      <div className={h}>1. Was ist diese App?</div>
      <p className={p}>
        Die Stufenkasse-App ist ein privat vom Stufenteam der Jahrgangsstufe organisiertes Werkzeug zur
        Verwaltung der Stufenkasse (Beiträge und Beteiligungen) sowie zur Organisation der Stufe
        (Infobeiträge, Abstimmungen, Mitteilungen). Sie ist kein offizielles Angebot der Schule.
      </p>

      <div className={h}>2. Verantwortlich / Kontakt</div>
      <p className={p}>
        Verantwortlich für die App und die Datenverarbeitung ist das Stufenteam der Jahrgangsstufe
        (Ansprechpartner: Tyler Adams, erreichbar persönlich in der Schule oder über die bekannten
        Stufenteam-Kanäle). An ihn kannst du dich mit allen Fragen zu deinen Daten wenden.
      </p>

      <div className={h}>3. Welche Daten werden verarbeitet?</div>
      <ul className="mb-2 list-disc pl-5">
        <li className={li}>Vor- und Nachname (zur Zuordnung in der Stufenliste)</li>
        <li className={li}>Nutzername und Passwort (Passwörter werden ausschließlich verschlüsselt/gehasht gespeichert und sind für niemanden – auch nicht für Admins – einsehbar)</li>
        <li className={li}>Beitragsstatus je Halbjahr (offen / bezahlt / erlassen) und Anzahl der Beteiligungen</li>
        <li className={li}>Zeitpunkt des Stufen-Beitritts bzw. -Austritts (z. B. Schulwechsel)</li>
        <li className={li}>Deine Antworten bei Abstimmungen sowie Gelesen-Status von Mitteilungen</li>
        <li className={li}>Ob du dich schon einmal angemeldet hast, Zustimmung zu diesen Bedingungen (Zeitstempel)</li>
        <li className={li}>Bei aktivierten Benachrichtigungen: ein technisches Push-Abo deines Browsers/Geräts (kein Standort, keine Telefonnummer)</li>
      </ul>
      <p className={p}>Es werden keine weiteren Daten erhoben – insbesondere keine Adressen, Noten, Fotos oder Standortdaten. Es findet kein Tracking zu Werbezwecken statt; es werden keine Daten verkauft oder an Dritte weitergegeben.</p>

      <div className={h}>4. Wer kann was sehen? (Rollen)</div>
      <ul className="mb-2 list-disc pl-5">
        <li className={li}><b>Schüler:innen</b> sehen ausschließlich die eigenen Daten (nur lesend).</li>
        <li className={li}><b>Stufenteam</b> sieht die Daten aller Stufenmitglieder und kann Organisatorisches bearbeiten (nicht den Beitragsstatus).</li>
        <li className={li}><b>Kassenwart</b> kann zusätzlich den Beitragsstatus (bezahlt/offen/erlassen) ändern.</li>
        <li className={li}><b>Admin</b> verwaltet Konten und Rollen.</li>
      </ul>
      <p className={p}>Bei Abstimmungen kann eingestellt sein, dass Ergebnisse für alle Teilnehmenden sichtbar sind; das ist an der jeweiligen Abstimmung erkennbar.</p>

      <div className={h}>5. Wo liegen die Daten?</div>
      <p className={p}>
        Die Daten werden bei Supabase (Datenbank/Login, Serverstandort EU – Region Paris, Frankreich)
        gespeichert. Die App selbst wird über Vercel bereitgestellt. Mit beiden Anbietern bestehen
        Standard-Datenschutzverträge (DPA). Push-Benachrichtigungen werden technisch über den
        Push-Dienst deines Browsers (z. B. Google, Apple, Mozilla) zugestellt; Inhalt ist nur der
        jeweilige Mitteilungstext.
      </p>

      <div className={h}>6. Rechtsgrundlagen &amp; Freiwilligkeit</div>
      <p className={p}>
        <b>Kassenliste:</b> Die Stufenkasse (Name und Beitragsstatus) führt das Stufenteam unabhängig
        von dieser App – vorher auf Papier, jetzt digital. Rechtsgrundlage dafür ist das berechtigte
        Interesse der Jahrgangsstufe an einer geordneten Kassenführung (Art. 6 Abs. 1 lit. f DSGVO).
        Du kannst dieser Verarbeitung widersprechen; deine Beiträge werden dann außerhalb der App
        (z. B. auf Papier) verwaltet.
      </p>
      <p className={p}>
        <b>App-Nutzung:</b> Dein Konto, Abstimmungen, Mitteilungen, Benachrichtigungen und alles
        Weitere in der App beruhen auf deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du mit dem
        Bestätigen dieser Bedingungen erteilst. Die Nutzung ist freiwillig. Du kannst die Einwilligung
        jederzeit mit Wirkung für die Zukunft widerrufen (beim Stufenteam melden) – dann werden dein
        Konto und deine App-Daten gelöscht. Benachrichtigungen sind separat freiwillig und können
        jederzeit in den Browser-/Geräteeinstellungen deaktiviert werden. Bist du unter 16 Jahre alt,
        besprich die Nutzung bitte mit deinen Erziehungsberechtigten.
      </p>

      <div className={h}>7. Deine Rechte</div>
      <p className={p}>
        Du hast das Recht auf Auskunft über deine gespeicherten Daten, Berichtigung, Löschung,
        Einschränkung der Verarbeitung und Datenübertragbarkeit sowie das Recht, dich bei einer
        Datenschutz-Aufsichtsbehörde zu beschweren (für NRW: Landesbeauftragte für Datenschutz und
        Informationsfreiheit Nordrhein-Westfalen). Wende dich für alle Anliegen zuerst ans Stufenteam –
        wir kümmern uns schnell und unkompliziert.
      </p>

      <div className={h}>8. Speicherdauer</div>
      <p className={p}>
        Die Daten werden für die Dauer der Oberstufenzeit (bis einschließlich Abitur 2028) gespeichert
        und danach gelöscht. Verlässt du die Schule vorher, werden deine Daten auf Wunsch umgehend,
        spätestens aber mit Ende des Schuljahres gelöscht.
      </p>

      <div className={h}>9. Deine Pflichten als Nutzer:in</div>
      <ul className="mb-2 list-disc pl-5">
        <li className={li}>Halte deine Zugangsdaten geheim und gib dein Konto nicht weiter.</li>
        <li className={li}>Ändere dein Startpasswort beim ersten Login (wird automatisch verlangt).</li>
        <li className={li}>Keine Manipulationsversuche, kein Zugriff auf fremde Daten.</li>
      </ul>

      <div className={h}>10. Haftung &amp; Änderungen</div>
      <p className={p}>
        Die App wird ehrenamtlich und ohne Gewähr auf ständige Verfügbarkeit betrieben. Der in der App
        angezeigte Beitragsstatus dient der Organisation; verbindlich ist die Kassenführung des
        Stufenteams. Änderungen an diesen Bedingungen werden in der App angekündigt; bei wesentlichen
        Änderungen wird die Zustimmung erneut abgefragt.
      </p>
    </div>
  );
}
