// Nutzername-Schema: nachname.vorname – alles klein, ohne Umlaute/Sonderzeichen,
// Leerzeichen und Zweitnamen mit Bindestrich.
//   Müller, Jonas            -> mueller.jonas   (ü->u)  ... hier: u (ohne Umlaut)
//   Weiß, Tom                -> weiss.tom
//   Große Kleimann, Lotta    -> grosse-kleimann.lotta
//   Ebbing, Anna-Lena        -> ebbing.anna-lena
//   von Laszewski, Juli C.   -> von-laszewski.juli-charlotte
//   Çelik, Deniz             -> celik.deniz
export function usernamePart(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // übrige Akzente (é->e, ç->c …)
    .replace(/[^a-z0-9]+/g, "-") // alles andere (Leerzeichen, Punkte …) -> Bindestrich
    .replace(/^-+|-+$/g, ""); // führende/abschließende Bindestriche weg
}

export function makeUsername(nachname: string, vorname: string): string {
  return `${usernamePart(nachname)}.${usernamePart(vorname)}`;
}
