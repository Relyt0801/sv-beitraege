import { useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";
import { Gruppe, KopfBild, RechnungKopf, ZeileEingabe, ZeileSegmente } from "./Liste";

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addStudent } = useStore();
  const [nachname, setNachname] = useState("");
  const [vorname, setVorname] = useState("");
  const [ab, setAb] = useState<Halbjahr>("EF.1");

  function submit() {
    if (!nachname.trim()) return;
    addStudent(nachname, vorname, ab);
    setNachname("");
    setVorname("");
    setAb("EF.1");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mx-auto max-w-md">
        <RechnungKopf bild={<KopfBild text="＋" />} oben="Person hinzufügen" titel={`${vorname} ${nachname}`.trim() || " "} onClose={onClose} />

        <Gruppe titel="Name">
          <ZeileEingabe label="Nachname" value={nachname} onChange={setNachname} placeholder="Pflicht" autoFocus onEnter={submit} />
          <ZeileEingabe label="Vorname" value={vorname} onChange={setVorname} placeholder="Vorname" onEnter={submit} />
        </Gruppe>

        <Gruppe titel="Dabei ab" fuss="Halbjahre davor zählen nicht zum Beitrag.">
          <ZeileSegmente werte={HY} wert={ab} onWahl={setAb} />
        </Gruppe>

        <button className="btn-primary mt-5" onClick={submit} disabled={!nachname.trim()}>
          Hinzufügen
        </button>
      </div>
    </Sheet>
  );
}
