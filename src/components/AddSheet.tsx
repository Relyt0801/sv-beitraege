import { useState } from "react";
import { HY, type Halbjahr } from "../lib/types";
import { useStore } from "../store";
import { Sheet } from "./Sheet";

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
      <div className="mb-4 flex items-center gap-3">
        <span className="flex-1 text-xl font-bold">Person hinzufügen</span>
        <button className="iconbtn" onClick={onClose} aria-label="Schließen">
          ✕
        </button>
      </div>

      <input
        className="field mb-3"
        placeholder="Nachname"
        autoFocus
        value={nachname}
        onChange={(e) => setNachname(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input
        className="field mb-4"
        placeholder="Vorname"
        value={vorname}
        onChange={(e) => setVorname(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />

      <label className="mb-2 block text-sm font-medium text-slate-500">Dabei ab welchem Halbjahr?</label>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {HY.map((h) => (
          <button
            key={h}
            onClick={() => setAb(h)}
            className={`rounded-xl border py-2.5 text-sm font-bold transition ${
              ab === h
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {h}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Halbjahre vor dem Beitritt bleiben grau und zählen nicht zum Beitrag.
      </p>

      <button className="btn-primary" onClick={submit}>
        Hinzufügen
      </button>
    </Sheet>
  );
}
