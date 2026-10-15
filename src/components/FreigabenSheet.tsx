import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Stepper } from "./Runden";
import { Avatar } from "./Avatar";
import { useProfiles } from "../profiles-store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { lesbarerName } from "../lib/profil";
import { melde, meldeFehler } from "../lib/melder";
import { rolleName } from "../lib/permissions";
import { Gruppe, Symbol, Zeile } from "./Liste";
import { Icon, type IconName } from "./Icon";

/**
 * Profil → Freigaben (nur Admin)
 *
 *  1. Wie viele Personen müssen zustimmen, bevor eine Anfrage durch ist?
 *     Termine, Kosten, Entsperren, Zitate, Steckbrief-Fotos und das
 *     Verschieben zwischen offiziell und inoffiziell – je 1 bis 10.
 *  2. Wer bearbeitet Mithilfe-Nachträge? Niemand ausgewählt = wie bisher
 *     alle aus dem Team und alle mit „Beteiligungen eintragen“.
 *
 * Aufgebaut wie die iOS-Einstellungen: zwei Gruppen mit farbigen Symbolen,
 * darunter je eine Fußnote, die erklärt, was die Zahl bewirkt.
 */
type ArtKey = "termin" | "kosten" | "entsperren" | "zitat" | "foto" | "verschieben";
interface Art {
  key: ArtKey;
  titel: string;
  text: string;
  icon: IconName;
  farbe: string;
  /** Wert, solange in der Datenbank nichts steht (wie in der SQL) */
  standard?: number;
}
/** Anfragen an das Team */
const ANFRAGEN: Art[] = [
  { key: "termin", titel: "Terminanfragen", text: "Vom Komitee-Vorsitz an das Team", icon: "kalender", farbe: "bg-[#FF3B30]" },
  { key: "kosten", titel: "Kostenanfragen", text: "Ausgaben, die die Kasse übernimmt", icon: "finanzen", farbe: "bg-[#34C759]" },
  { key: "entsperren", titel: "Entsperr-Anfragen", text: "Wenn jemand eine Sperre anficht", icon: "schluessel", farbe: "bg-[#8E8E93]" },
];
/** Inhalte, die erst nach Zustimmung sichtbar werden oder den Teil wechseln */
const INHALTE: Art[] = [
  { key: "zitat", titel: "Zitate freigeben", text: "Bevor ein Zitat auf der Wand steht", icon: "zitat", farbe: "bg-[#A2845E]" },
  { key: "foto", titel: "Steckbrief-Fotos", text: "Bevor andere das Foto sehen", icon: "bild", farbe: "bg-[#FF2D55]", standard: 3 },
  // Neu in 1.4: bestaetigungen.verschieben (RPC bestaetigungen_setzen kennt den Schlüssel)
  { key: "verschieben", titel: "Verschieben", text: "Offiziell ↔ inoffiziell", icon: "pfeile", farbe: "bg-[#5856D6]", standard: 3 },
];

export function FreigabenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profiles } = useRole();
  const { profile } = useProfiles();
  const [werte, setWerte] = useState<Record<string, number>>({});
  const [bearbeiter, setBearbeiter] = useState<string[]>([]);
  const [suche, setSuche] = useState("");
  const [waehlen, setWaehlen] = useState(false);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase!.from("app_settings").select("bestaetigungen").eq("id", 1).maybeSingle(),
      supabase!.from("nachtrag_bearbeiter").select("user_id"),
    ]);
    setWerte(((a as { bestaetigungen?: Record<string, number> } | null)?.bestaetigungen) || {});
    setBearbeiter(((b as { user_id: string }[] | null) || []).map((x) => x.user_id));
  }, []);

  useEffect(() => {
    if (open) void laden();
  }, [open, laden]);

  const name = (uid: string) => lesbarerName(profile[uid]?.anzeigename || "") || profiles.find((p) => p.user_id === uid)?.username || "Unbekannt";

  async function setzeWert(k: string, n: number) {
    setWerte((w) => ({ ...w, [k]: n }));
    if (!hasSupabase) return;
    const { error } = await supabase!.rpc("bestaetigungen_setzen", { p: { [k]: n } });
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    }
  }

  async function bearbeiterSetzen(uid: string, an: boolean) {
    setBearbeiter((b) => (an ? [...b, uid] : b.filter((x) => x !== uid)));
    if (!hasSupabase) return;
    const { error } = an
      ? await supabase!.from("nachtrag_bearbeiter").insert({ user_id: uid })
      : await supabase!.from("nachtrag_bearbeiter").delete().eq("user_id", uid);
    if (error) {
      meldeFehler("Ging nicht: " + error.message);
      void laden();
    } else melde(an ? `${name(uid)} bearbeitet jetzt Nachträge` : "Entfernt", "erfolg");
  }

  const kandidaten = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return profiles
      .filter((p) => p.role !== "eltern" && !bearbeiter.includes(p.user_id))
      .map((p) => ({ p, n: name(p.user_id) }))
      .filter((x) => !q || x.n.toLowerCase().includes(q))
      .sort((a, b) => a.n.localeCompare(b.n, "de"))
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, bearbeiter, suche, profile]);

  /** Eine Zeile „Symbol · Titel/Erklärung · Stepper“ */
  const zeile = (a: Art) => (
    <Zeile
      key={a.key}
      label={a.titel}
      unter={a.text}
      symbol={
        <Symbol farbe={a.farbe}>
          <Icon name={a.icon} size={16} strich={2.2} />
        </Symbol>
      }
    >
      <Stepper wert={Math.max(1, werte[a.key] || a.standard || 1)} max={10} label={`Zustimmungen für ${a.titel}`} onChange={(n) => void setzeWert(a.key, n)} />
    </Zeile>
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Freigaben" unter="Wie viele zustimmen müssen – und wer Nachträge bearbeitet." onClose={onClose} />

      <Gruppe
        titel="Anfragen an das Team"
        className=""
        fuss="Bei mehr als 1 stimmt jede Person einzeln zu („1/2 Zustimmungen“). Erst wenn genug zusammen sind, ist die Anfrage angenommen. Ablehnen reicht weiter mit einer Person."
      >
        {ANFRAGEN.map(zeile)}
      </Gruppe>

      <Gruppe
        titel="Inhalte"
        className="mt-6"
        fuss={
          <>
            <b className="font-semibold">Verschieben</b> gilt für Zitate, Rankings, Mottos und Album-Kommentare: Offiziell kommt ins Abibuch, inoffiziell sieht nur
            die Stufe. Wer den Bereich verwaltet, beantragt den Wechsel – erst mit genug Zustimmungen wandert der Eintrag. Du als Admin reichst allein.
          </>
        }
      >
        {INHALTE.map(zeile)}
      </Gruppe>

      <Gruppe
        titel="Nachträge bearbeiten"
        className="mt-6"
        fuss={
          bearbeiter.length === 0
            ? "Niemand ausgewählt – alle aus dem Team dürfen Mithilfe-Nachträge bestätigen."
            : "Nur diese Personen (und du als Admin) bearbeiten die Mithilfe-Nachträge."
        }
      >
        {bearbeiter.map((uid) => (
          <Zeile key={uid} label={name(uid)} symbol={<Avatar userId={uid} size={30} />}>
            <button onClick={() => void bearbeiterSetzen(uid, false)} className="text-[15px] text-red-600 dark:text-red-400">
              Entfernen
            </button>
          </Zeile>
        ))}
        <Zeile
          label={waehlen ? "Fertig" : "Person hinzufügen"}
          blau
          onClick={() => {
            setWaehlen((w) => !w);
            setSuche("");
          }}
          symbol={
            !waehlen ? (
              <span aria-hidden className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-white">
                <Icon name="plus" size={16} strich={2.6} />
              </span>
            ) : undefined
          }
        />
      </Gruppe>

      {waehlen && (
        <div className="mt-4 animate-aufsteigen">
          <input className="field mb-2" placeholder="Name suchen" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
          <div className="gruppe-zellen max-h-[40vh] overflow-y-auto">
            {kandidaten.map(({ p, n }) => (
              <Zeile key={p.user_id} label={n} symbol={<Avatar userId={p.user_id} size={30} />} onClick={() => void bearbeiterSetzen(p.user_id, true)} ohnePfeil>
                <span className="text-[13px] text-tinte-leise">{rolleName(p.role)}</span>
              </Zeile>
            ))}
            {kandidaten.length === 0 && <div className="px-4 py-3 text-[14px] text-tinte-leise">Niemand gefunden.</div>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
