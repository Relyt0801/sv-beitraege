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
  version: "1.2",
  datum: "3. Oktober 2026",
  bereiche: [
    {
      bereich: "Abiball-Ticket",
      icon: "🎟️",
      eintraege: [
        { text: "Dein Abiball-Ticket mit deinem Namen: Der volle Preis steht durchgestrichen darauf, darunter, was es dich bei deinem Stand wirklich kostet. Daneben das Ticket für jedes weitere (Eltern und Gäste)." },
        { text: "Ticket antippen: Die Ticket-Ansicht zeigt Zeile für Zeile, wie sich der Preis zusammensetzt." },
        { text: "Sobald der Verkauf startet, bestellst du rechts neben dem Ticket und überweist mit eigenem Verwendungszweck. Vorher läuft dort ein Countdown." },
        { text: "Wenn das Stufenteam es einschaltet, zählt Mithilfe auch über 100 %: Der Ring wird golden, und dein erstes Ticket wird noch günstiger." },
      ],
    },
    {
      bereich: "Beiträge",
      icon: "💶",
      eintraege: [
        { text: "Beiträge → Ticket: Bonus über 100 % mit zwei Reglern (bis wie viel Prozent, wie viel Rabatt). Standardmäßig aus.", nur: "team" },
        { text: "Ort und Datum des Abiballs eintragen. Beides erscheint erst dann auf den Tickets.", nur: "team" },
        { text: "Ticketverkauf starten: Startzeit, höchstens Tickets je Person und Tickets insgesamt.", nur: "team" },
        { text: "Bestellungen als bezahlt markieren oder stornieren. Oben siehst du, wie viel eingegangen und wie viel noch offen ist.", nur: "team" },
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
