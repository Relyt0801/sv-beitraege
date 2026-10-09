/**
 * Die Seite hinter Blättern und Fenstern nicht mitscrollen lassen.
 *
 * Früher merkte sich jedes Blatt den alten Wert von body.style.overflow und
 * setzte ihn beim Schließen zurück. Sind zwei Blätter offen und schließt das
 * untere zuerst, stellt das obere beim Schließen „hidden“ wieder her – dann
 * scrollt am Handy nichts mehr, obwohl Knöpfe noch gehen. Jetzt zählt ein
 * Zähler mit: gesperrt ist, solange mindestens eins offen ist.
 */
let offen = 0;

function anwenden() {
  if (typeof document === "undefined") return;
  document.body.style.overflow = offen > 0 ? "hidden" : "";
}

/** Sperren; gibt die Funktion zum Freigeben zurück (genau einmal wirksam). */
export function scrollSperren(): () => void {
  offen++;
  anwenden();
  let frei = false;
  return () => {
    if (frei) return;
    frei = true;
    offen = Math.max(0, offen - 1);
    anwenden();
  };
}

// Sicherheitsnetz: kommt die App zurück in den Vordergrund und ist kein Blatt
// mehr im DOM, darf auch nichts mehr gesperrt sein.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!document.querySelector('[role="dialog"][aria-modal="true"]')) {
      offen = 0;
      anwenden();
    }
  });
}
