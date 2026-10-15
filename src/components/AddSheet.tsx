import { useEffect, useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase } from "../lib/supabase";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, ZeileEingabe, ZeileSegmente } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { PersonAnlegenSheet } from "./PersonAnlegenSheet";
import { melde } from "../lib/melder";

/**
 * „+ Person“ in der Kasse.
 *
 * Prüfung Okt. 2026: Es gab zwei verschiedene Blätter „Person hinzufügen“ –
 * hier (Nachname zuerst, fest „EF.1“) und unter Rollen (Vorname zuerst, fest
 * „Q1.1“, mit Login). Jetzt:
 *   • Admin mit Datenbank bekommt hier dasselbe Blatt wie unter Rollen
 *     (Eintrag + Login in einem Schritt). Wer nur einen Listeneintrag ohne
 *     Login will, kommt von dort mit einem Tipp hierher.
 *   • Alle anderen (Kassenwart, Stufenteam, Demo) legen einen Eintrag in der
 *     Kassenliste an – gleiche Reihenfolge (Vorname, Nachname), „Dabei ab“
 *     steht auf dem laufenden Halbjahr, der Knopf klebt unten.
 */
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload } = useStore();
  const { isAdmin, isOp, refreshProfiles } = useRole();
  const mitLogin = hasSupabase && (isAdmin || isOp);
  const [nurListe, setNurListe] = useState(false);
  useEffect(() => {
    if (open) setNurListe(false);
  }, [open]);

  if (mitLogin && !nurListe)
    return (
      <PersonAnlegenSheet
        open={open}
        onClose={onClose}
        onFertig={() => {
          // Konten UND Personen neu holen (wie unter Rollen)
          refreshProfiles();
          reload();
        }}
        onNurListe={() => setNurListe(true)}
      />
    );

  return <ListenEintrag open={open} onClose={onClose} zurueck={mitLogin ? () => setNurListe(false) : undefined} />;
}

/** Eintrag nur in der Kassenliste – ohne Login. */
function ListenEintrag({ open, onClose, zurueck }: { open: boolean; onClose: () => void; zurueck?: () => void }) {
  const { addStudent, settings } = useStore();
  const laeuft = settings.aktuelles_halbjahr;
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [ab, setAb] = useState<Halbjahr>(laeuft);

  // Jedes Öffnen beginnt leer – und auf dem Halbjahr, das gerade läuft
  useEffect(() => {
    if (!open) return;
    setVorname("");
    setNachname("");
    setAb(laeuft);
  }, [open, laeuft]);

  function submit() {
    if (!nachname.trim()) return;
    addStudent(nachname, vorname, ab);
    // Rückmeldung: die neue Zeile steht oft weit unten in der Liste
    melde(`${[vorname.trim(), nachname.trim()].filter(Boolean).join(" ")} hinzugefügt – dabei ab ${ab}`, "erfolg");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf
        titel="Person hinzufügen"
        unter={hasSupabase ? "Eintrag in der Kassenliste, ohne Login." : undefined}
        zurueck={zurueck ? { text: "Mit Login", onClick: zurueck } : undefined}
        onClose={onClose}
      />

      <Gruppe titel="Name" className="">
        <ZeileEingabe label="Vorname" value={vorname} onChange={setVorname} placeholder="Vorname" autoFocus onEnter={submit} />
        <ZeileEingabe label="Nachname" value={nachname} onChange={setNachname} placeholder="Pflicht" onEnter={submit} />
      </Gruppe>

      <Gruppe titel="Dabei ab" fuss="Halbjahre davor zählen nicht zum Beitrag.">
        <ZeileSegmente werte={HY} wert={ab} onWahl={setAb} />
      </Gruppe>

      <FussLeiste>
        <button className="btn-primary" onClick={submit} disabled={!nachname.trim()}>
          Hinzufügen
        </button>
      </FussLeiste>
    </Sheet>
  );
}
