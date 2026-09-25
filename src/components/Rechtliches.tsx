import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";

/**
 * Impressum und Datenschutzerklärung.
 *
 * Name, Anschrift und E-Mail des Betreibers stehen NICHT im Code (und damit
 * nicht im Git), sondern kommen beim Bauen aus den Umgebungsvariablen
 * VITE_BETREIBER_NAME / _STRASSE / _ORT / _MAIL (Vercel → Settings →
 * Environment Variables, lokal in .env). Fehlt eine, steht an der Stelle ein
 * gelber Platzhalter. Was sonst noch offen ist: docs/DATENSCHUTZ.md.
 *
 * Die Texte liegen bewusst in der App und nicht in einer Datenbank: Impressum
 * und Datenschutzerklärung müssen auch dann erreichbar sein, wenn gerade nichts
 * lädt oder jemand nicht angemeldet ist.
 */

const P = ({ children }: { children: ReactNode }) => (
  <p className="mb-2.5 text-[13.5px] leading-relaxed text-tinte-matt">{children}</p>
);

const H = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-1.5 mt-4 text-[15px] font-bold">{children}</h3>
);

/** Noch auszufüllen – fällt im Text sofort auf. */
const Lueck = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-amber-400/25 px-1 font-semibold text-amber-800 dark:text-amber-300">[{children}]</span>
);

/** Betreiberangaben – kommen aus den Umgebungsvariablen, nie aus dem Git. */
const BETREIBER = {
  name: (import.meta.env.VITE_BETREIBER_NAME || "").trim(),
  strasse: (import.meta.env.VITE_BETREIBER_STRASSE || "").trim(),
  ort: (import.meta.env.VITE_BETREIBER_ORT || "").trim(),
  mail: (import.meta.env.VITE_BETREIBER_MAIL || "").trim(),
};
const Wert = ({ v, fehlt }: { v: string; fehlt: string }) => (v ? <>{v}</> : <Lueck>{fehlt}</Lueck>);
const Mail = () =>
  BETREIBER.mail ? (
    <a className="font-semibold underline underline-offset-2" href={`mailto:${BETREIBER.mail}`}>
      {BETREIBER.mail}
    </a>
  ) : (
    <Lueck>E-Mail-Adresse</Lueck>
  );

/** Anschrift-Block, gleich für Impressum und Datenschutz. */
const Anschrift = () => (
  <>
    <Wert v={BETREIBER.name} fehlt="Vor- und Nachname" />
    <br />
    <Wert v={BETREIBER.strasse} fehlt="Straße und Hausnummer" />
    <br />
    <Wert v={BETREIBER.ort} fehlt="PLZ und Ort" />
    <br />
    Deutschland
  </>
);

function Impressum() {
  return (
    <>
      <P>Angaben nach § 5 Digitale-Dienste-Gesetz (DDG).</P>

      <H>Diensteanbieter</H>
      <P>
        <Anschrift />
      </P>

      <H>Kontakt</H>
      <P>
        E-Mail: <Mail />
      </P>

      <H>Verantwortlich für den Inhalt</H>
      <P>
        Verantwortlich für den Inhalt ist immer der Ersteller bzw. Verwalter der Datenbank (schulintern):{" "}
        <Wert v={BETREIBER.name} fehlt="Name" />, Anschrift wie oben.
      </P>

      <H>Was diese Seite ist</H>
      <P>
        Die Stufenkasse ist ein internes Werkzeug des Abiturjahrgangs 2028 am Gymnasium Remigianum in
        Borken. Sie verwaltet Beiträge, Beteiligungen, Termine und die Absprachen der
        Komitees. Es wird nichts verkauft und nichts beworben. Alle Inhalte liegen hinter einer Anmeldung;
        Zugänge vergibt ausschließlich das Stufenteam.
      </P>

      <H>Streitbeilegung</H>
      <P>
        Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind wir nicht
        verpflichtet und nicht bereit.
      </P>
    </>
  );
}

function Datenschutz() {
  return (
    <>
      <P>Information nach Art. 13 DSGVO. Kurz gesagt: Wir speichern nur, was die Stufenkasse zum Laufen braucht.</P>

      <H>1. Wer ist verantwortlich?</H>
      <P>
        <Anschrift />
        <br />
        E-Mail: <Mail />
      </P>

      <H>2. Welche Daten werden gespeichert?</H>
      <P>
        <b>Zu jeder Person der Stufe:</b> Vor- und Nachname, ab wann sie dabei ist, ob sie die Stufe verlässt,
        der Zahlungsstand je Halbjahr (offen / bezahlt / erlassen) und die Zahl der Beteiligungen.
      </P>
      <P>
        <b>Zu jedem Zugang:</b> Benutzername, verschlüsseltes Passwort, Rolle, Komitee, Anzeigename und
        Namensfarbe, ob eine Chat-Sperre besteht, und wann zuletzt angemeldet wurde.
      </P>
      <P>
        <b>Beim Benutzen:</b> geschriebene Nachrichten und Abstimmungen, Terminzu- und -absagen, Anmeldungen zu
        Aktionen, Anträge und Kostenanfragen, das Kassenbuch der Stufe.
      </P>
      <P>
        <b>Für Benachrichtigungen:</b> eine technische Kennung des Geräts (Push-Abo) – nur, wenn du
        Benachrichtigungen ausdrücklich erlaubst.
      </P>
      <P>
        <b>Elternzugänge:</b> Benutzername und die Zuordnung zum eigenen Kind. Eltern sehen ausschließlich die
        Daten ihres Kindes, keine Chats und keine Daten anderer.
      </P>
      <P>
        <b>Protokoll:</b> wichtige Änderungen (Rollen, Zugänge, Passwortwechsel, Komitees, Zahlungen,
        Kassenbuch) mit Zeitpunkt und der Person, die sie ausgelöst hat. Das Protokoll sieht ausschließlich der
        Admin.
      </P>
      <P>
        Es gibt <b>keine Werbung, keine Analyse-Werkzeuge und kein Tracking</b>. Es werden keine Daten an
        Werbenetzwerke weitergegeben und keine Cookies zu Werbe- oder Analysezwecken gesetzt.
      </P>

      <H>3. Wozu und auf welcher Grundlage?</H>
      <P>
        Zweck ist allein die Organisation der Stufe: Beiträge im Blick behalten, Aktionen planen, Absprachen
        treffen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung der Vereinbarung innerhalb der
        Stufe) und, soweit die Nutzung freiwillig ist, Art. 6 Abs. 1 lit. a DSGVO (Einwilligung).
      </P>
      <P>
        <b>Alter:</b> Die Stufenkasse ist für die Oberstufe gedacht und darf ab 16 Jahren genutzt werden. Wer
        jünger ist, braucht für eine Einwilligung die Zustimmung der Eltern (Art. 8 DSGVO) und meldet sich
        dafür beim Stufenteam.
      </P>

      <H>4. Wer bekommt die Daten zu sehen?</H>
      <P>
        Innerhalb der App: das Stufenteam und der Kassenwart sehen die Personen- und Beitragsliste; Schülerinnen
        und Schüler sehen nur ihre eigene Zeile; Eltern nur ihr Kind. Chats sehen nur die Personen im jeweiligen
        Ordner. Wer welche Rechte hat, steht im Rechte-Reiter.
      </P>
      <P>
        Außerhalb der App arbeiten wir mit Dienstleistern, die die Daten in unserem Auftrag verarbeiten
        (Auftragsverarbeitung nach Art. 28 DSGVO):
      </P>
      <P>
        • <b>Supabase</b> – Datenbank und Anmeldung. Region: eu-west-3 (Paris, Frankreich) – die Daten
        liegen in der EU.
        <br />• <b>Vercel</b> – Auslieferung der Seite
        <br />• <b>IONOS</b> – Domain und DNS
        <br />
        Schriften werden von dieser Seite selbst geladen, nicht von Google oder anderen Schrift-Diensten.
        <br />• <b>Apple, Google und Mozilla</b> – nur wenn Benachrichtigungen an sind: der Push-Dienst des
        jeweiligen Browserherstellers stellt die Nachricht zu. Der Inhalt ist dabei verschlüsselt.
      </P>
      <P>
        Mit Supabase und Vercel gilt jeweils deren Auftragsverarbeitungsvertrag (Data Processing Addendum),
        der Bestandteil der Nutzungsbedingungen ist. IONOS stellt nur die Domain und die DNS-Einträge bereit
        und verarbeitet dabei keine Daten aus der App.
      </P>

      <H>5. Wie lange?</H>
      <P>
        Personen- und Beitragsdaten bleiben, solange die Stufe besteht, und werden danach gelöscht. Der
        Speicherstand der Nacht wird 30 Tage aufbewahrt, Sicherheitskopien vor einem Zurücksetzen 90 Tage. Das
        Protokoll wird nach zwei Jahren automatisch gelöscht. Wer die Stufe verlässt, kann seinen Zugang beim
        Stufenteam löschen lassen.
      </P>

      <H>6. Was auf deinem Gerät bleibt</H>
      <P>
        Die App speichert im Browser: deine Anmeldung, ob du die Einführung schon gesehen hast, deine Auswahl
        für hell/dunkel und den Programmcode selbst (damit sie offline startet). Das ist technisch nötig und
        deshalb nach § 25 Abs. 2 Nr. 2 TDDDG ohne Einwilligung erlaubt. Alles davon verschwindet, wenn du dich
        abmeldest oder die Websitedaten löschst.
      </P>

      <H>7. Deine Rechte</H>
      <P>
        Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung
        (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine einmal gegebene Einwilligung
        kannst du jederzeit für die Zukunft widerrufen. Melde dich dafür bei der oben genannten verantwortlichen
        Person – im Zweifel reicht eine Nachricht an das Stufenteam.
      </P>
      <P>
        Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der
        für uns zuständigen: Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen
        (LDI NRW), Postfach 20 04 44, 40102 Düsseldorf, poststelle@ldi.nrw.de, www.ldi.nrw.de.
      </P>

      <H>8. Sicherheit</H>
      <P>
        Die Verbindung ist durchgehend verschlüsselt (HTTPS). Passwörter liegen nur verschlüsselt vor und sind
        auch für das Stufenteam nicht lesbar. Wer welche Daten sehen darf, ist nicht nur in der Oberfläche,
        sondern in der Datenbank selbst geregelt (Row Level Security) – eine Abfrage an der App vorbei bringt
        deshalb nichts.
      </P>

      <p className="mt-4 text-[12px] text-tinte-leise">
        Stand: {new Date().toLocaleDateString("de-DE")}
      </p>
    </>
  );
}

export function RechtSheet({
  seite,
  onClose,
}: {
  seite: "impressum" | "datenschutz" | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={seite !== null} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">{seite === "impressum" ? "Impressum" : "Datenschutz"}</span>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      {seite === "impressum" ? <Impressum /> : <Datenschutz />}
      <button type="button" className="btn-primary mt-5" onClick={onClose}>
        Schließen
      </button>
    </Sheet>
  );
}

/** Die beiden Links – stehen unter dem Anmeldeformular und im Profil. */
export function RechtLinks({ klein = false }: { klein?: boolean }) {
  const [seite, setSeite] = useState<"impressum" | "datenschutz" | null>(null);
  return (
    <>
      <div className={`flex items-center justify-center gap-3 ${klein ? "text-[11px]" : "text-[12px]"} text-tinte-leise`}>
        {/* type="button" ist Pflicht: die Links stehen im Anmeldeformular, und
            ein Knopf ohne type schickt das Formular ab. */}
        <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setSeite("impressum")}>
          Impressum
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setSeite("datenschutz")}>
          Datenschutz
        </button>
      </div>
      <RechtSheet seite={seite} onClose={() => setSeite(null)} />
    </>
  );
}
