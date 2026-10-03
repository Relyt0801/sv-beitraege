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
  version: "1.1",
  datum: "3. Oktober 2026",
  bereiche: [
    {
      bereich: "Chats",
      icon: "💬",
      eintraege: [
        { text: "Es wurde ein Fehler behoben, dass am Reiter Chats dauerhaft „9+“ stand: Erledigte Gespräche zählen nicht mehr mit." },
        { text: "Nachricht gedrückt halten: mit 👍 👎 🔥 😢 😂 ❓ reagieren oder den Text kopieren." },
        { text: "Komitee-Chats öffnen jetzt direkt im Chat. Die Übersicht (Angepinntes, Abstimmungen, To-dos) liegt oben rechts – beide mit eigenem roten Punkt." },
        { text: "Neu: „Mithilfe nachtragen“ – vergessene Mithilfe mit Datum beantragen, das Stufenteam bestätigt." },
        { text: "Neue Bereiche: Chats mit Schülern, Chats mit Eltern und Anfragen (Nachträge, Komitee-Wechsel, Entsperrungen).", nur: "team" },
        { text: "Mit 🔔 / 🔕 legst du je Bereich und je Komitee fest, ob du Mitteilungen bekommst. Fremde Komitees zählen nur noch, wenn du sie einschaltest.", nur: "team" },
      ],
    },
    {
      bereich: "Mitteilungen",
      icon: "🔔",
      eintraege: [
        { text: "Wenn du gerade in der App bist, kommen keine Pop-ups mehr – die roten Punkte zeigen dir alles." },
        { text: "Mehrere Nachrichten aus einem Chat kommen als eine Mitteilung („3 neue Nachrichten“) statt einzeln." },
      ],
    },
    {
      bereich: "Events",
      icon: "📅",
      eintraege: [
        { text: "Deine Schichten stehen oben als grüne „Tickets“. Bekommene Schichten sind grün mit Haken, nicht bekommene blass und gestrichelt – auch im Kalender." },
        { text: "Vergangene und bestätigte Schichten verschwinden aus „Mitmachen“, damit es übersichtlich bleibt." },
        { text: "Offene Schichten zum Bestätigen stehen als Hinweis oben im Reiter – auch nachdem man das Fenster weggewischt hat.", nur: "team" },
      ],
    },
    {
      bereich: "Allgemein",
      icon: "✨",
      eintraege: [
        { text: "Statt „Keine Live-Verbindung“ verbindet sich die App still neu. Beim Laden siehst du graue Platzhalter statt eines Kreisels." },
        { text: "Im Profil stehen keine Version und Uhrzeit mehr." },
        { text: "Der Datenschutz wurde ergänzt (Reaktionen, Nachträge, automatisches Löschen)." },
      ],
    },
    {
      bereich: "Profil",
      icon: "👤",
      eintraege: [
        { text: "Neuer Reiter „Profil“: deine eigene Ansicht wie bei allen Schülern. Die App startet dort.", nur: "team" },
      ],
    },
    {
      bereich: "Kasse",
      icon: "💶",
      eintraege: [
        { text: "Mithilfe für mehrere Personen: dieselbe Ansicht wie für eine Person – mit Vorlagen und Datum.", nur: "team" },
      ],
    },
    {
      bereich: "Rollen & Rechte",
      icon: "🛡️",
      eintraege: [
        { text: "Rollen und Rechte sind jetzt ein Reiter. Person antippen öffnet ihre einzelnen Rechte; die Rechte-Bereiche sind zugeklappt.", nur: "team" },
        { text: "Profil → Automatisch löschen: Fristen für alte Chat-Nachrichten und bearbeitete Anträge (nur Admin bzw. „Rechte verwalten“).", nur: "team" },
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
