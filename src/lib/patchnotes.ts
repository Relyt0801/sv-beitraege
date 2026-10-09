/**
 * Patch Notes – erscheinen einmal pro Version nach dem nächsten Öffnen.
 * Eltern sehen keine. Einträge mit nur: "team" sehen nur Stufenteam, Admin,
 * Kassenwart und Sprecher. Die Nummern (1.1, 1.2 …) werden je Ansicht neu
 * gezählt, damit bei Schülern keine Lücken entstehen.
 */
export interface PatchEintrag {
  text: string;
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
  version: "1.3",
  datum: "Oktober 2026",
  bereiche: [
    {
      bereich: "Aufgeräumt",
      icon: "✨",
      eintraege: [
        { text: "Ruhigeres Design: Abi-Album, Abimotto, Zitate und Rankings sind jetzt schlichte Karten – auf dem iPad und Laptop zwei nebeneinander." },
        { text: "Dein Profil ist wie die iPhone-Einstellungen sortiert: Darstellung, Mitteilungen, Konto. Was du nicht brauchst, bleibt zugeklappt." },
        { text: "Neu im Profil: ein eigenes Hintergrundbild. Es liegt privat – nur du siehst es." },
        { text: "Steckbriefe zeigen alle Felder gleich breit, Spotify-Links stehen nicht mehr als Text da." },
      ],
    },
    {
      bereich: "Abstimmen in Runden",
      icon: "🗳️",
      eintraege: [
        { text: "Abimotto, Zitate, Rankings und Umfragen können eine engere Auswahl bekommen: Runde 2, Finale … Du siehst oben, wie viele Stimmen du noch hast." },
        { text: "Komitees starten Runden für ihre Bereiche, legen die Stimmen je Person fest und geben das Ergebnis frei, wann sie wollen.", nur: "team" },
      ],
    },
    {
      bereich: "Fair bleiben",
      icon: "🛡️",
      eintraege: [
        { text: "Wer sehr viele Nachrichten in kurzer Zeit schickt oder mehrfach gesperrte Wörter benutzt, wird kurz automatisch gesperrt – mit Grund und Restzeit in der App." },
        { text: "Wortfilter: Wörter löschen, Liste durchsuchen und je Bereich an- und ausschalten (auch direkt im Bereich, z. B. Zitate → Prüfen).", nur: "team" },
        { text: "Wer ein Motto oder Zitat eingereicht hat, sehen die Verwaltenden über ein kleines ⓘ – alle anderen nicht.", nur: "team" },
      ],
    },
    {
      bereich: "Fürs Team",
      icon: "🔑",
      eintraege: [
        { text: "Profil → Freigaben: festlegen, wie viele zustimmen müssen (Termine, Kosten, Entsperren, Zitate), und wer Nachträge bearbeitet.", nur: "team" },
        { text: "Neues Passwort generieren: bei der Person (Stammdaten) oder im Sperr-Menü. Es wird einmal angezeigt.", nur: "team" },
        { text: "Funktionen nach Thema zugeklappt; Komitees können einzelne Bereiche an- und ausschalten und Runden leiten.", nur: "team" },
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
