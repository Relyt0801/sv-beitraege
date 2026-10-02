// Spielregeln des Assistenten mit erfundenen Jev-/Claude-Antworten (kein Netz, keine Datenbank).
// Ausführen im Projektordner:  node --experimental-strip-types --test tests/assistent-regeln.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  antwortNachMelden, aufEins, ausClaude, entscheide, istZweifel, pseudonymisiere, schichtText, type Einschaetzung,
} from "../supabase/functions/assistent/regeln.ts";

const jev = (x: Partial<Einschaetzung>): Einschaetzung => ({
  absicht: { wahl: "mithilfe_nachtrag", sicherheit: 0.95 },
  schicht: { wahl: "s1", sicherheit: 0.95 },
  stimmig: { wert: 0.8, sicherheit: 0.8 },
  ...x,
});

test("KI fällt aus → Team, nichts automatisch", () => {
  assert.deepEqual(entscheide(null), { art: "team", grund: "ki_fehler" });
});

test("ohne Jev: Claude – nur „eindeutig“ reicht zum Melden", () => {
  const c = (a: "eindeutig" | "wahrscheinlich" | "unklar", s: "eindeutig" | "wahrscheinlich" | "unklar", schicht = "s1") =>
    ausClaude({ absicht: "mithilfe_nachtrag", absicht_klarheit: a, schicht, schicht_klarheit: s }, true);
  assert.deepEqual(entscheide(c("eindeutig", "eindeutig")), { art: "melden", terminKey: "s1" });
  assert.equal(entscheide(c("eindeutig", "wahrscheinlich")).art, "rueckfrage");
  assert.equal(entscheide(c("eindeutig", "eindeutig", "keine_passt")).art, "rueckfrage");
  assert.deepEqual(entscheide(c("wahrscheinlich", "eindeutig")), { art: "team", grund: "absicht_unklar" });
  // Claude bewertet nicht, wie stimmig jemand ist – also nie „Zweifel“
  assert.equal(c("eindeutig", "eindeutig").stimmig, null);
  assert.equal(antwortNachMelden("offen", c("eindeutig", "eindeutig").stimmig, "X").art, "fest");
  // keine Schichten zur Auswahl → Rückfrage statt Raten
  const ohne = ausClaude({ absicht: "mithilfe_nachtrag", absicht_klarheit: "eindeutig", schicht: "s1", schicht_klarheit: "eindeutig" }, false);
  assert.equal(entscheide(ohne).art, "rueckfrage");
  // anderes Anliegen → Team
  const zahl = ausClaude({ absicht: "zahlung", absicht_klarheit: "eindeutig", schicht: "keine_passt", schicht_klarheit: "eindeutig" }, true);
  assert.deepEqual(entscheide(zahl), { art: "team", grund: "andere_absicht" });
});

test("andere Absicht → Team", () => {
  assert.deepEqual(entscheide(jev({ absicht: { wahl: "zahlung", sicherheit: 0.9 } })), { art: "team", grund: "andere_absicht" });
});

test("Absicht unsicher → Team", () => {
  assert.deepEqual(entscheide(jev({ absicht: { wahl: "mithilfe_nachtrag", sicherheit: 0.6 } })), { art: "team", grund: "absicht_unklar" });
});

test("Schicht unklar oder keine passt → Rückfrage", () => {
  assert.equal(entscheide(jev({ schicht: { wahl: "keine_passt", sicherheit: 0.99 } })).art, "rueckfrage");
  assert.equal(entscheide(jev({ schicht: { wahl: "s2", sicherheit: 0.7 } })).art, "rueckfrage");
  assert.equal(entscheide(jev({ schicht: null })).art, "rueckfrage");
});

test("sicher → Datenbank entscheiden lassen", () => {
  assert.deepEqual(entscheide(jev({})), { art: "melden", terminKey: "s1" });
});

test("nach dem Melden", () => {
  assert.equal(antwortNachMelden("auto", null, "X").art, "fest");
  assert.equal(antwortNachMelden("auto", null, "X").teamFragen, false);
  // offen ohne Zweifel: Bestätigung, Team wird gefragt
  const offen = antwortNachMelden("offen", { wert: 0.7, sicherheit: 0.9 }, "X");
  assert.equal(offen.art, "fest");
  assert.equal(offen.teamFragen, true);
  // offen mit deutlichem Zweifel: Rückfrage, Team wird gefragt
  const zweifel = antwortNachMelden("offen", { wert: 0.1, sicherheit: 0.9 }, "X");
  assert.deepEqual(zweifel, { art: "rueckfrage", grund: "zweifel", teamFragen: true });
  // Zweifel, aber Jev unsicher: kein Zweifel
  assert.equal(antwortNachMelden("offen", { wert: 0.1, sicherheit: 0.5 }, "X").art, "fest");
  assert.equal(antwortNachMelden("entschieden", null, "X").art, "still");
});

test("Score umrechnen und Zweifel", () => {
  assert.equal(aufEins(3, 4), 1);
  assert.equal(aufEins(0, 4), 0);
  assert.equal(aufEins(1.5, 4), 0.5);
  assert.equal(aufEins(NaN, 4), 0.5);
  assert.equal(istZweifel({ wert: 0.2, sicherheit: 0.75 }), true);
  assert.equal(istZweifel({ wert: 0.5, sicherheit: 0.99 }), false);
  assert.equal(istZweifel(null), false);
});

test("Namen werden ersetzt, ganze Wörter", () => {
  assert.equal(pseudonymisiere("Hi, hier ist Ben Müller", ["Ben", "Müller"]), "Hi, hier ist Person Person");
  assert.equal(pseudonymisiere("Benjamin war auch da", ["Ben"]), "Benjamin war auch da");
  assert.equal(pseudonymisiere("ich bin ben.mueller", ["ben.mueller"]), "ich bin Person");
});

test("Namen anderer aus der Stufe werden auch ersetzt", () => {
  const andere = ["Lena", "Schmidt", "Ben", "Mai", "Al"];
  assert.equal(pseudonymisiere("Ich war mit Lena Schmidt da", ["Ben"], andere), "Ich war mit [Name] [Name] da");
  // eigener Name bleibt „Person“, auch wenn er in der Liste der anderen steht
  assert.equal(pseudonymisiere("Ben hier", ["Ben"], andere), "Person hier");
  // Monate und sehr kurze Namen bleiben – sonst wäre das Datum weg
  assert.equal(pseudonymisiere("Waffeln am 3. Mai, Al war da", [], andere), "Waffeln am 3. Mai, Al war da");
});

test("Schicht als Text", () => {
  assert.equal(schichtText({ titel: "Waffelverkauf", datum: "2026-09-29", von: "10:00:00", bis: "11:00:00" }), "Waffelverkauf am Di 29.09., 10:00–11:00");
  assert.equal(schichtText({ titel: "Teig", datum: "2026-10-01", von: null, bis: null }), "Teig am Do 01.10.");
});
