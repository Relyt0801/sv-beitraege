/**
 * Patch Notes – erscheinen einmal pro Version nach dem nächsten Öffnen
 * (App.tsx vergleicht PATCH.version mit dem Merker im Gerät; wer die
 * Einführung gerade gesehen hat, bekommt sie nicht zusätzlich).
 * Nach Rollen (seit 1.4): jeder Eintrag kann mit `fuer` auf Gruppen begrenzt
 * werden (Komitee, Team, Kasse, Admin, Eltern – siehe PatchGruppe). Eltern
 * sehen in ihrer eigenen App nur die Einträge für Eltern (ElternApp.tsx).
 *
 * Seit 1.4 im Stil von Apples „Neu in …“-Bildschirm: je Eintrag ein farbiges
 * Symbol, ein fetter Titel und ein kurzer Satz. `icon` ist ein Name aus
 * components/Icon.tsx (IconName), `farbe` eine Tailwind-Hintergrundklasse.
 * Ältere Einträge ohne Titel (nur `text`) werden weiter einfach angezeigt.
 */
/**
 * Für wen ein Eintrag ist (Update 1.4, nach Rollen):
 *   komitee  Mitglied in mindestens einem Komitee (und das Team)
 *   team     Stufenteam, Kassenwart, Admin, Sprecher
 *   kasse    darf das Kassenbuch führen (finanzen.manage)
 *   admin    Admin
 *   eltern   Elternkonten (eigene App, sehen nur ihre Einträge)
 * Ohne `fuer` sehen den Eintrag alle außer Eltern.
 */
export type PatchGruppe = "komitee" | "team" | "kasse" | "admin" | "eltern";

export interface PatchEintrag {
  /** Kurzer Titel, fett (seit 1.4) */
  titel?: string;
  /** Ein Satz Erklärung – für Schüler verständlich */
  text: string;
  /** Symbol-Name aus Icon.tsx (seit 1.4) */
  icon?: string;
  /** Hintergrund des Symbol-Kästchens, z. B. "bg-[#34C759]" */
  farbe?: string;
  /** Nur für diese Gruppen (eine reicht); ohne: alle außer Eltern */
  fuer?: PatchGruppe[];
}
export interface PatchBereich {
  bereich: string;
  icon: string;
  eintraege: PatchEintrag[];
}
export interface PatchVersion {
  version: string;
  datum: string;
  bereiche: PatchBereich[];
}

export const PATCH: PatchVersion = {
  version: "1.4",
  datum: "Oktober 2026",
  bereiche: [
    {
      bereich: "Für alle",
      icon: "✨",
      eintraege: [
        {
          titel: "Leisten an fester Stelle",
          text: "Kopfzeile und Reiter stehen auf jedem Gerät immer am selben Platz. Die Zurück-Taste schließt nur das Oberste – die App bleibt offen.",
          icon: "haus",
          farbe: "bg-brand",
        },
        {
          titel: "Übersicht mit weniger Scrollen",
          text: "„Für dich offen“ steht ganz oben. Album, Motto, Zitate und Rankings wischst du am Handy seitlich durch.",
          icon: "haken",
          farbe: "bg-[#FF9500]",
        },
        {
          titel: "Blätter wie in iOS",
          text: "Öffnet sich etwas aus einem Blatt, kommst du oben links mit „‹ Zurück“ wieder hin; das ✕ schließt alles.",
          icon: "chevron",
          farbe: "bg-[#32ADE6]",
        },
        {
          titel: "Offiziell & Inoffiziell",
          text: "Kommentare, Zitate, Mottos und Rankings gibt es meist zweimal: offiziell für die Abizeitung, inoffiziell nur für die Stufe. Das (i) erklärt, was wohin kommt.",
          icon: "schild",
          farbe: "bg-[#5856D6]",
        },
        {
          titel: "Kalender wie auf dem iPhone",
          text: "Monat mit Punkten, darunter die Termine des Tages.",
          icon: "kalender",
          farbe: "bg-[#FF3B30]",
        },
        {
          titel: "Eigene Antwort",
          text: "Bei Abstimmungen kannst du auch selbst etwas eintragen.",
          icon: "stimme",
          farbe: "bg-[#34C759]",
        },
        {
          titel: "Hell, Dunkel oder Automatisch",
          text: "Im Profil unter „Darstellung“ – Automatisch folgt deinem Gerät.",
          icon: "mond",
          farbe: "bg-[#5856D6]",
        },
      ],
    },
    {
      bereich: "Für Komitees",
      icon: "🗂️",
      eintraege: [
        {
          titel: "Offiziell oder inoffiziell?",
          text: "Offiziell kann in die Abizeitung – später lesen es auch Eltern und Lehrkräfte. Inoffiziell bleibt in der Stufe. Nach inoffiziell reicht eine Stimme, nach offiziell braucht es Zustimmungen. Ob es die Trennung überhaupt gibt, stellt ihr im Zahnrad ganz oben ein.",
          icon: "schild",
          farbe: "bg-[#5856D6]",
          fuer: ["komitee"],
        },
        {
          titel: "Komitee-Pinnwand",
          text: "„Chat | Pinnwand“: erst Angepinntes und To-dos, dann offene Abstimmungen.",
          icon: "pin",
          farbe: "bg-[#5856D6]",
          fuer: ["komitee"],
        },
        {
          titel: "Aus deinen Komitees",
          text: "Offene Abstimmungen und To-dos deiner Komitees stehen jetzt auch in der Übersicht.",
          icon: "haken",
          farbe: "bg-[#FF9500]",
          fuer: ["komitee"],
        },
      ],
    },
    {
      bereich: "Fürs Team",
      icon: "🔑",
      eintraege: [
        {
          titel: "Zu erledigen",
          text: "Die Übersicht zählt, was auf dich wartet: Schichten bestätigen, Anfragen, Zitate prüfen – ein Tipp springt an die richtige Stelle.",
          icon: "haken",
          farbe: "bg-[#FF9500]",
          fuer: ["team"],
        },
        {
          titel: "Fragen von Eltern",
          text: "Neue Elternfragen und Antworten kommen jetzt zuverlässig als Mitteilung an.",
          icon: "chats",
          farbe: "bg-[#34C759]",
          fuer: ["team"],
        },
        {
          titel: "Einstellungen aufgeräumt",
          text: "Profil, Rechte und Funktionen im Stil der iPhone-Einstellungen – Bearbeiten und Löschen auf einer Unterseite, Löschen rot unten mit Rückfrage.",
          icon: "regler",
          farbe: "bg-[#8E8E93]",
          fuer: ["team"],
        },
      ],
    },
    {
      bereich: "Kasse & Finanzen",
      icon: "💶",
      eintraege: [
        {
          titel: "Kasse zuerst",
          text: "Die Kasse ist dein erster Reiter. „Beiträge & Abiball“ schaltest du oben um, abgehakte Personen bleiben sichtbar.",
          icon: "kasse",
          farbe: "bg-brand",
          fuer: ["kasse"],
        },
        {
          titel: "Finanzen wie in Wallet",
          text: "Am Handy die neuesten Buchungen, „Alle Buchungen“ mit Suche und Filter. Am Laptop scrollen beide Spalten getrennt.",
          icon: "finanzen",
          farbe: "bg-[#34C759]",
          fuer: ["kasse"],
        },
        {
          titel: "Sicherheitskopie",
          text: "Ältere Speicherstände lädst du mit einem Tipp herunter.",
          icon: "beitraege",
          farbe: "bg-[#8E8E93]",
          fuer: ["kasse"],
        },
      ],
    },
    {
      bereich: "Verwaltung",
      icon: "🛠️",
      eintraege: [
        {
          titel: "Personen & Rechte",
          text: "Rolle, Komitees und Passwort-Stand je Person als Zeilen; beim Fremdzugriff lässt sich „Darf“ jetzt ändern.",
          icon: "rollen",
          farbe: "bg-[#5856D6]",
          fuer: ["admin"],
        },
        {
          titel: "Protokoll & Umfragen",
          text: "Speicherstände und Fragen einer Umfrage bearbeitest du auf einer Unterseite – Übernehmen und Entfernen mit Rückfrage.",
          icon: "umfrage",
          farbe: "bg-[#FF9500]",
          fuer: ["admin"],
        },
      ],
    },
    {
      bereich: "Für Eltern",
      icon: "👪",
      eintraege: [
        {
          titel: "Übersicht kompakter",
          text: "Je Kind eine Karte mit Mithilfe und Abiball-Ticket; Geschwister stehen nebeneinander.",
          icon: "kind",
          farbe: "bg-brand",
          fuer: ["eltern"],
        },
        {
          titel: "Fragen ans Stufenteam",
          text: "Ihre Frage erreicht das Stufenteam jetzt sicher als Mitteilung. Ein angefangener Text bleibt erhalten.",
          icon: "chats",
          farbe: "bg-[#34C759]",
          fuer: ["eltern"],
        },
        {
          titel: "Infos und Konto",
          text: "Neues vom Stufenteam als übersichtliche Liste, Kontodaten mit großem Kopieren-Knopf.",
          icon: "bank",
          farbe: "bg-[#FF9500]",
          fuer: ["eltern"],
        },
      ],
    },
  ],
};

/** Die Bereiche, die diese Person sieht – ohne leere. Eltern sehen nur Einträge für Eltern. */
export function patchFuer(gruppen: PatchGruppe[]): PatchBereich[] {
  const eltern = gruppen.includes("eltern");
  return PATCH.bereiche
    .map((b) => ({ ...b, eintraege: b.eintraege.filter((e) => (e.fuer ? e.fuer.some((g) => gruppen.includes(g)) : !eltern)) }))
    .filter((b) => b.eintraege.length > 0);
}

export const PATCH_MERKER = "sv:patch:gesehen";
