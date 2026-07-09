// Nutzername-Schema: nachname.vorname – alles klein, Umlaute ausgeschrieben
// (ä->ae, ö->oe, ü->ue, ß->ss), Leerzeichen/Zweitnamen mit Bindestrich.
//   Müller, Jonas            -> mueller.jonas
//   Weiß, Tom                -> weiss.tom
//   Große Kleimann, Lotta    -> grosse-kleimann.lotta
//   Ebbing, Anna-Lena        -> ebbing.anna-lena
//   von Laszewski, Juli C.   -> von-laszewski.juli-charlotte
//   Çelik, Deniz             -> celik.deniz
export function usernamePart(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // übrige Akzente (é->e, ç->c …)
    .replace(/[^a-z0-9]+/g, "-") // alles andere (Leerzeichen, Punkte …) -> Bindestrich
    .replace(/^-+|-+$/g, ""); // führende/abschließende Bindestriche weg
}

export function makeUsername(nachname: string, vorname: string): string {
  return `${usernamePart(nachname)}.${usernamePart(vorname)}`;
}
