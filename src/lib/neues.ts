/**
 * „Was ist neu“ – je Update eine Liste, je Eintrag: für wen.
 *
 * Jede Person sieht nur, was sie betrifft: Admins die Admin-Sachen, das Team
 * die Team-Sachen, Schüler ihre. Gibt es für jemanden nichts, kommt auch kein
 * Bildschirm. Gesehen wird je Konto und Update einmal gemerkt.
 *
 * Neues Update: oben einen Eintrag in UPDATES ergänzen (neue id).
 */

export interface NeuKontext {
  isAdmin: boolean;
  isStaff: boolean;
  isEltern: boolean;
  /** Recht prüfen, wie useRole().can */
  can: (perm: string) => boolean;
  /** Testphase Vertrauens-Check (Admins und Testkonten) */
  kiTest: boolean;
}

export interface NeuPunkt {
  zeichen: string;
  titel: string;
  text: string;
  fuer: (k: NeuKontext) => boolean;
}

export interface Update {
  id: string;
  titel: string;
  punkte: NeuPunkt[];
}

const schuelerUndTeam = (k: NeuKontext) => !k.isEltern;
const team = (k: NeuKontext) => k.isStaff || k.can("hilfen.edit");

export const UPDATES: Update[] = [
  {
    id: "2026-10-abi28",
    titel: "Update Abi28",
    punkte: [
      {
        zeichen: "🏠",
        titel: "Neue Startseite",
        text: "Was du zahlen musst, was dein Abiball-Ticket kostet, der Kontostand der Stufe, offene Abstimmungen und neue Antworten – alles auf einer Seite. Antippen führt weiter.",
        fuer: schuelerUndTeam,
      },
      {
        zeichen: "🧭",
        titel: "Weniger Reiter",
        text: "Unten stehen nur noch Start, Events und Chats. Beiträge und Finanzen erreichst du über die Startseite.",
        fuer: (k) => !k.isEltern && !k.isStaff,
      },
      {
        zeichen: "🧭",
        titel: "Weniger Reiter am Handy",
        text: "Unten: Start, Kasse, Events, Chats. Was du sonst noch darfst (Finanzen, Beiträge, Rollen, Rechte), steht daneben oder – ab zwei Einträgen – unter „Mehr“.",
        fuer: (k) => k.isStaff,
      },
      {
        zeichen: "🙋",
        titel: "„Warst du da?“",
        text: "Nach einer Schicht fragt die App: Ja oder Nein. Das Stufenteam bestätigt deine Mithilfe dann mit einem Tipp.",
        fuer: (k) => !k.isEltern && !team(k),
      },
      {
        zeichen: "🙋",
        titel: "Wer war da? – auf einen Blick",
        text: "Nach jeder Schicht seht ihr, wer „war da“ oder „nicht da“ gesagt hat. Stimmt etwas nicht: „stimmt nicht“ tippen – dann wird nichts eingetragen.",
        fuer: team,
      },
      {
        zeichen: "📅",
        titel: "Kalender-Abo mit Themen",
        text: "Events → Kalender → „Stufen-Termine ins Handy übernehmen“: Dort wählt ihr, was in den Apple-Kalender soll – Klausuren, eigene Schichten, Ferien … (Testphase fürs Stufenteam).",
        fuer: (k) => k.can("kalender.test"),
      },
      {
        zeichen: "🔒",
        titel: "Datenschutzerklärung ergänzt",
        text: "Neu drin: die Anwesenheits-Abfrage und der Vertrauens-Check. Den Check gibt es vorerst nur im Test – für dich ändert sich nichts.",
        fuer: (k) => !k.isEltern && !k.kiTest,
      },
      {
        zeichen: "🔒",
        titel: "Für Sie ändert sich nichts",
        text: "Die Datenschutzerklärung wurde ergänzt: Nach Schichten fragt die App die Schülerinnen und Schüler, ob sie da waren, und für einzelne Schülerkonten gibt es testweise einen freiwilligen Vertrauens-Check. Elternzugänge betrifft beides nicht – Ihre Nachrichten werden nicht ausgewertet.",
        fuer: (k) => k.isEltern,
      },
      {
        zeichen: "🤖",
        titel: "Vertrauens-Check (Testphase)",
        text: "Wer zustimmt, bei dem kann „war da“ sofort eingetragen werden, wenn die Angaben bisher gestimmt haben. Ein Assistent beantwortet Nachträge im Chat. Freiwillig, jederzeit im Profil widerrufbar.",
        fuer: (k) => k.kiTest,
      },
      {
        zeichen: "📊",
        titel: "Score nur für dich als Admin",
        text: "Profil → „Vertrauen & KI“: Score je Person, Schwelle für den Auto-Eintrag, Assistent an/aus und euer Schreibstil. Erst SQL und Functions einspielen (EINSPIELEN.md).",
        fuer: (k) => k.isAdmin,
      },
      {
        zeichen: "💻",
        titel: "Nachträge im Terminal",
        text: "Auf euren Rechnern: nachtraege.bat bzw. npm run nachtraege startet Claude Code mit allen offenen Nachträgen – es schlägt vor, ihr bestätigt.",
        fuer: (k) => k.isAdmin,
      },
    ],
  },
];

/** Punkte des neuesten Updates für diese Person (leer = nichts zeigen). */
export function neuFuer(k: NeuKontext, gesehen: (id: string) => boolean): Update | null {
  for (const u of UPDATES) {
    if (gesehen(u.id)) continue;
    const punkte = u.punkte.filter((p) => p.fuer(k));
    if (punkte.length) return { ...u, punkte };
  }
  return null;
}

export const neuSchluessel = (uid: string | null, id: string) => `sv:neu:${uid ?? "lokal"}:${id}`;

