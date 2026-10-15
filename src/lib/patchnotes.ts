/**
 * Patch Notes – erscheinen einmal pro Version nach dem nächsten Öffnen
 * (App.tsx vergleicht PATCH.version mit dem Merker im Gerät; wer die
 * Einführung gerade gesehen hat, bekommt sie nicht zusätzlich).
 * Eltern sehen keine. Einträge mit nur: "team" sehen nur Stufenteam, Admin,
 * Kassenwart und Sprecher.
 *
 * Seit 1.4 im Stil von Apples „Neu in …“-Bildschirm: je Eintrag ein farbiges
 * Symbol, ein fetter Titel und ein kurzer Satz. `icon` ist ein Name aus
 * components/Icon.tsx (IconName), `farbe` eine Tailwind-Hintergrundklasse.
 * Ältere Einträge ohne Titel (nur `text`) werden weiter einfach angezeigt.
 */
export interface PatchEintrag {
  /** Kurzer Titel, fett (seit 1.4) */
  titel?: string;
  /** Ein Satz Erklärung – für Schüler verständlich */
  text: string;
  /** Symbol-Name aus Icon.tsx (seit 1.4) */
  icon?: string;
  /** Hintergrund des Symbol-Kästchens, z. B. "bg-[#34C759]" */
  farbe?: string;
  nur?: "team";
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
      bereich: "Neu",
      icon: "✨",
      eintraege: [
        {
          titel: "Neue Reiterleiste",
          text: "Aus Glas – am Handy unten, am Laptop und iPad quer oben. Ein geöffneter Chat steht am Laptop in derselben Kopfzeile wie jede Seite.",
          icon: "haus",
          farbe: "bg-brand",
        },
        {
          titel: "Übersicht",
          text: "Deine Startseite mit Betrag, Abizeitung und Ticket heißt jetzt für alle „Übersicht“. Die App öffnet den Reiter, den du zuletzt benutzt hast.",
          icon: "haus",
          farbe: "bg-[#34C759]",
        },
        {
          titel: "Offiziell & Inoffiziell",
          text: "Rankings, Zitate, Mottos und Kommentare gibt es zweimal: offiziell fürs Abibuch, inoffiziell nur für die Stufe.",
          icon: "schild",
          farbe: "bg-[#5856D6]",
        },
        {
          titel: "Gewinner",
          text: "Das Team kürt Gewinner – sie stehen ganz oben, und Ergebnisse siehst du direkt ohne Suchen.",
          icon: "pokal",
          farbe: "bg-[#FF9500]",
        },
        {
          titel: "Eigene Antwort",
          text: "Bei Abstimmungen kannst du jetzt auch selbst etwas eintragen.",
          icon: "stimme",
          farbe: "bg-[#34C759]",
        },
        {
          titel: "Events gebündelt",
          text: "Zusammengehöriges steht beisammen – weniger Scrollen.",
          icon: "events",
          farbe: "bg-[#FF2D55]",
        },
        {
          titel: "Klarere Meldungen",
          text: "Ohne Internet sagt dir die App genau, was gerade nicht geht – unten, ohne etwas zu verdecken.",
          icon: "info",
          farbe: "bg-[#32ADE6]",
        },
        {
          titel: "Hell, Dunkel oder Automatisch",
          text: "Im Profil unter „Darstellung“ – Automatisch folgt deinem Gerät.",
          icon: "mond",
          farbe: "bg-[#5856D6]",
        },
        {
          titel: "Kalender kurz pausiert",
          text: "Termine ins Handy übernehmen ist vorübergehend aus und kommt bald zurück.",
          icon: "kalender",
          farbe: "bg-[#8E8E93]",
        },
      ],
    },
    {
      bereich: "Fürs Team",
      icon: "🔑",
      eintraege: [
        {
          titel: "Einstellungen aufgeräumt",
          text: "Ein Zahnrad je Bereich, Profil und Rechte im Stil der iPhone-Einstellungen.",
          icon: "regler",
          farbe: "bg-[#8E8E93]",
          nur: "team",
        },
        {
          titel: "Beiträge in der Kasse",
          text: "„Beiträge & Abiball“ ist kein eigener Reiter mehr: oben in der Kasse umschalten. Einnahme und Ausgabe stehen in Finanzen ganz oben.",
          icon: "kasse",
          farbe: "bg-brand",
          nur: "team",
        },
        {
          titel: "Verschieben mit Zustimmung",
          text: "Offiziell ↔ inoffiziell braucht Zustimmungen – wie viele, steht unter Profil → Freigaben.",
          icon: "pfeile",
          farbe: "bg-[#5856D6]",
          nur: "team",
        },
      ],
    },
  ],
};

/** Die Bereiche, die diese Person sieht – ohne leere. */
export function patchFuer(team: boolean): PatchBereich[] {
  return PATCH.bereiche
    .map((b) => ({ ...b, eintraege: b.eintraege.filter((e) => team || e.nur !== "team") }))
    .filter((b) => b.eintraege.length > 0);
}

export const PATCH_MERKER = "sv:patch:gesehen";
