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
      bereich: "Neu",
      icon: "✨",
      eintraege: [
        { text: "🗳️ Abstimmungsrunden für Motto, Zitate, Rankings und Umfragen" },
        { text: "❤️ Sieger der Herzen: eigene Herzstimme für die Honorable Mentions" },
        { text: "🖼️ Eigenes Hintergrundbild – nur für dich" },
        { text: "😁 Mehr Reaktionen im Chat, über „+“ jedes Emoji" },
        { text: "🛡️ Spam und gesperrte Wörter sperren kurz automatisch" },
      ],
    },
    {
      bereich: "Fürs Team",
      icon: "🔑",
      eintraege: [
        { text: "👥 Freigaben mit mehreren Zustimmungen (Profil → Freigaben)", nur: "team" },
        { text: "👁️ Je Abstimmung: Ergebnisse nur fürs Komitee oder für alle", nur: "team" },
        { text: "🔁 Neues Passwort generieren, Ausgetretene ausgeblendet", nur: "team" },
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
