import { hasSupabase } from "./supabase";
import type { Profile, Role } from "../auth/RoleProvider";
import type { BankKonto, Student } from "./types";
import type { Buchung } from "./finanzen";

/**
 * Demo-Modus – nur ohne Datenbank (`npm run demo` oder lokaler Modus).
 *
 * Über die Adresse wählt man, als wer man die App sieht:
 *   ?rolle=schueler | stufenteam | kassenwart | admin | eltern | eltern-leer
 * "eltern-leer" ist ein Elternzugang ohne zugeordnetes Kind.
 *
 * Alles hier sind erfundene Daten im Browser. Mit echter Datenbank gibt
 * demoRolle() immer null zurück – dann hat nichts in dieser Datei Wirkung.
 */
export type DemoRolle = Role | "eltern-leer";

const ROLLEN: DemoRolle[] = ["schueler", "sprecher", "stv_sprecher", "stufenteam", "kassenwart", "admin", "eltern", "eltern-leer"];
const MERKER = "sv:demo-rolle";

export function demoRolle(): DemoRolle | null {
  if (hasSupabase) return null;
  try {
    const aus = new URLSearchParams(window.location.search).get("rolle") as DemoRolle | null;
    if (aus && ROLLEN.includes(aus)) {
      sessionStorage.setItem(MERKER, aus);
      return aus;
    }
    const gemerkt = sessionStorage.getItem(MERKER) as DemoRolle | null;
    return gemerkt && ROLLEN.includes(gemerkt) ? gemerkt : null;
  } catch {
    return null;
  }
}

/** Die Rolle, mit der die App rechnet ("eltern-leer" ist auch nur "eltern"). */
export function demoRolleAlsRolle(r: DemoRolle | null): Role | null {
  if (!r) return null;
  return r === "eltern-leer" ? "eltern" : r;
}

/** Eigene Kennung im Demo-Modus. */
export function demoUid(r: DemoRolle | null): string | null {
  if (!r) return null;
  if (r === "eltern") return "demo-eltern-2";
  if (r === "eltern-leer") return "demo-eltern-3";
  return "local-user";
}

const klein = (s: string) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

/** Konten, wie sie im Rollen-Reiter stehen. */
export function demoProfile(students: Student[]): Profile[] {
  const rollen: Role[] = ["admin", "kassenwart", "sprecher", "stufenteam"];
  const schueler: Profile[] = students.map((s, i) => ({
    user_id: `demo-${s.id}`,
    username: `${klein(s.nachname)}.${klein(s.vorname)}`,
    role: rollen[i] ?? "schueler",
    student_id: s.id,
    has_logged_in: i % 3 !== 2,
    must_change_password: i % 3 === 2,
    chat_banned_until: null,
  }));
  const eltern = (id: string, username: string): Profile => ({
    user_id: id,
    username,
    role: "eltern",
    student_id: null,
    has_logged_in: true,
    must_change_password: false,
    chat_banned_until: null,
  });
  const k = (i: number) => students[i] ? `${klein(students[i].vorname)}.${klein(students[i].nachname)}` : `eltern${i}`;
  return [
    ...schueler,
    eltern("demo-eltern-1", k(0)),
    eltern("demo-eltern-2", k(4)),
    eltern("demo-eltern-3", "familie.neu"),
  ];
}

/** Welches Demo-Elternkonto zu welchen Kindern gehört. */
export function demoZuordnung(students: Student[]): Record<string, string[]> {
  const id = (i: number) => students[i]?.id;
  return {
    "demo-eltern-1": [id(0)].filter(Boolean) as string[],
    "demo-eltern-2": [id(4), id(5)].filter(Boolean) as string[],
    "demo-eltern-3": [],
  };
}

export const DEMO_KONTO: BankKonto = {
  inhaber: "Stufenkasse Abi 28 (Demo)",
  iban: "DE02 1203 0000 0000 2020 51",
  bic: "BYLADEM1001",
  bank: "Demo-Bank",
  hinweis: "Bei mehreren Kindern bitte für jedes Kind einzeln überweisen.",
};

/** Ein paar erfundene Buchungen fürs Kassenbuch. */
export function demoBuchungen(students: Student[]): Buchung[] {
  const heute = new Date();
  const tag = (vor: number) => {
    const d = new Date(heute);
    d.setDate(d.getDate() - vor);
    return d.toISOString().slice(0, 10);
  };
  let n = 0;
  const b = (vor: number, cent: number, quelle: Buchung["quelle"], titel: string, extra: Partial<Buchung> = {}): Buchung => ({
    id: `demo-b${++n}`,
    datum: tag(vor),
    cent,
    quelle,
    titel,
    aktion_id: null,
    student_id: null,
    halbjahr: null,
    komitee: null,
    anfrage_id: null,
    automatisch: false,
    created_by: "local-user",
    created_at: new Date(heute.getTime() - vor * 864e5).toISOString(),
    ...extra,
  });
  const s = (i: number) => students[i];
  const beitrag = (vor: number, i: number) =>
    s(i)
      ? [b(vor, 2500, "beitrag", `Stufenbeitrag EF.1 – ${s(i)!.vorname} ${s(i)!.nachname}`, {
          student_id: s(i)!.id,
          halbjahr: "EF.1",
          automatisch: true,
          created_by: null,
        })]
      : [];
  return [
    b(1, 18650, "aktion", "Kuchenverkauf 2. Pause"),
    ...beitrag(2, 0),
    ...beitrag(2, 1),
    b(4, -4780, "ausgabe", "Waffelteig und Deko", { komitee: "abiball" }),
    b(9, 50000, "spende", "Sponsor Autohaus"),
    ...beitrag(12, 3),
    b(20, -12000, "ausgabe", "Kaution Location", { anfrage_id: "demo-anfrage" }),
    b(35, 9340, "aktion", "Waffelstand Elternsprechtag"),
    b(40, 32000, "abgleich", "Abgleich mit der Bank"),
  ].sort((x, y) => (x.datum < y.datum ? 1 : -1));
}
