/**
 * Nutzungsbedingungen & Datenschutz – kurz und verständlich.
 * Hinweis: nach bestem Wissen formuliert, ersetzt keine Rechtsberatung.
 */

export const TERMS_VERSION = "2.0 (Stand: 10.09.2026)";

export function TermsText() {
  const h = "mb-1 mt-5 text-[15px] font-bold";
  const p = "mb-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300";
  const li = "mb-1 ml-4 list-disc text-sm leading-relaxed text-slate-600 dark:text-slate-300";
  return (
    <div>
      <div className="mb-1 text-xl font-bold">Nutzungsbedingungen &amp; Datenschutz</div>
      <div className="mb-4 text-xs text-slate-400">Stufenkasse „Abi 28" · Version {TERMS_VERSION}</div>

      <p className={p}>
        Diese App gehört der Jahrgangsstufe, nicht der Schule. Wir verwalten damit die Stufenkasse und
        organisieren die Komitees. Hier steht in kurz, was gespeichert wird und welche Regeln gelten.
      </p>

      <div className={h}>Was gespeichert wird</div>
      <ul className="mb-2">
        <li className={li}>Dein Name</li>
        <li className={li}>Ob dein Beitrag pro Halbjahr bezahlt, offen oder erlassen ist</li>
        <li className={li}>Deine Beitragspunkte und wofür du sie bekommen hast</li>
        <li className={li}>Dein Komitee</li>
        <li className={li}>Was du in Chats, Abstimmungen und To-dos schreibst</li>
        <li className={li}>Nutzername und Passwort für den Login (das Passwort verschlüsselt)</li>
      </ul>
      <p className={p}>
        Mehr nicht. Keine Adresse, keine Noten, keine Standortdaten, keine Werbung, keine Weitergabe an
        Dritte.
      </p>

      <div className={h}>Wo die Daten liegen</div>
      <p className={p}>
        Die App läuft über den Dienst <b>Supabase</b> (Server in Frankfurt) und wird über einen Hoster
        bereitgestellt. Wenn wir später eine eigene Adresse nutzen, kommt sie von einem deutschen Anbieter
        (IONOS oder Strato). Alles bleibt damit innerhalb der EU.
      </p>

      <div className={h}>Regeln fürs Miteinander</div>
      <ul className="mb-2">
        <li className={li}>Freundlich bleiben. Keine Beleidigungen, kein Mobbing, keine Drohungen.</li>
        <li className={li}>Keine fremden Fotos, Screenshots oder privaten Nachrichten posten.</li>
        <li className={li}>Was hier steht, bleibt hier – nichts nach außen weitertragen.</li>
        <li className={li}>Dein Passwort gehört dir. Nicht weitergeben.</li>
      </ul>
      <p className={p}>
        Wer sich nicht daran hält, kann vom Schreiben gesperrt werden. Gegen eine Sperre kannst du in der
        App eine Anfrage ans Stufenteam stellen.
      </p>

      <div className={h}>Deine Rechte</div>
      <p className={p}>
        Du kannst jederzeit erfahren, was über dich gespeichert ist, Falsches korrigieren und deine Daten
        löschen lassen – melde dich dafür beim Stufenteam. Offene Beiträge bleiben davon unberührt, weil
        die Stufenkasse ihr Geld ja trotzdem abrechnen muss.
      </p>

      <div className={h}>Wer verantwortlich ist</div>
      <p className={p}>
        Das Stufenteam der Jahrgangsstufe. Bei Fragen, Ärger oder wenn etwas gelöscht werden soll:
        sprich uns an oder stell eine Frage im Stufenteam-Chat.
      </p>

      <p className="mt-5 text-xs text-slate-400">
        Mit dem Häkchen bestätigst du, dass du das gelesen hast und dich an die Regeln hältst.
      </p>
    </div>
  );
}
