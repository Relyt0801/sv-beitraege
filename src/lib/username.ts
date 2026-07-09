// Namens-Schema (angelehnt an die Schulmail vorname.nachname@…):
//   - Bindestrich-Vornamen bleiben:            Anna-Lena        -> anna-lena
//   - Zweitname mit Leerzeichen fällt weg:     Juli Charlotte   -> juli
//   - Mehrteilige Nachnamen zusammengezogen:   von Laszewski    -> vonlaszewski
//   - Umlaute ae/oe/ue, ß->ss, Akzente weg:    Knüsting -> knuesting, Gâta -> gata
//
// App-Nutzername:  nachname.vorname   -> ebbing.anna-lena, vonlaszewski.juli
// Schulmail:       vorname.nachname@… -> anna-lena.ebbing@…, juli.vonlaszewski@…

function clean(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vorname: nur der erste (Leerzeichen-getrennte) Name, Bindestriche bleiben. */
export function vornamePart(s: string): string {
  return clean(s).split(" ")[0].replace(/^-+|-+$/g, "");
}

/** Nachname: alle Teile zusammengezogen (Leerzeichen entfernt). */
export function nachnamePart(s: string): string {
  return clean(s).replace(/ /g, "").replace(/^-+|-+$/g, "");
}

export function makeUsername(nachname: string, vorname: string): string {
  return `${nachnamePart(nachname)}.${vornamePart(vorname)}`;
}

export function makeSchoolEmail(nachname: string, vorname: string, domain: string): string {
  return `${vornamePart(vorname)}.${nachnamePart(nachname)}@${domain}`;
}
