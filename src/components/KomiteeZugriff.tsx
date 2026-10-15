import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { COMMITTEES, committeeLabel } from "../lib/committees";
import { useRole } from "../auth/RoleProvider";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile, ZeileHaken } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { Suchfeld } from "./KontoZeile";

import { frage, meldeFehler } from "../lib/melder";
interface Zugriff {
  id: string;
  tag: string;
  user_id: string | null;
  from_tag: string | null;
  mode: "read" | "write";
}

/** Demo (ohne Server): ein erfundener Eintrag, damit die Liste nicht leer ist. */
const DEMO_ZUGRIFFE: Zugriff[] = [{ id: "demo-1", tag: "motto-pullis", user_id: null, from_tag: "abizeitung", mode: "read" }];

const MODUS_TEXT = { read: "Nur lesen", write: "Lesen und schreiben" } as const;
const ERKLAERUNG = "Lesen = mitlesen. Schreiben = mitreden, abstimmen, To-dos abhaken.";

/**
 * Fremdzugriff: Wer darf in ein Komitee schauen, dem er nicht angehört?
 * Entweder eine einzelne Person oder ein ganzes Komitee.
 *
 * Aufgebaut wie die iOS-Einstellungen: je Zugriff EINE Zeile („Abizeitung –
 * liest in Motto & Pullis“), antippen öffnet ein Blatt mit „Zugriff
 * entziehen“ ganz unten. „Neuer Zugriff“ ist die letzte, blaue Zeile und
 * öffnet ein Blatt mit Auswahllisten (Häkchen) statt nativer Auswahlfelder.
 * Vorher: zwei <select>, zwei lose Knöpfe, ein bildschirmbreiter Knopf mitten
 * auf der Seite und ein 🗑 in jeder Zeile.
 */
export function KomiteeZugriff() {
  const { profiles, can } = useRole();
  const { students } = useStore();
  const [liste, setListe] = useState<Zugriff[]>(() => (hasSupabase ? [] : DEMO_ZUGRIFFE));
  const [detail, setDetail] = useState<Zugriff | null>(null);
  // Beim Schließen bleibt der letzte Eintrag stehen, damit das Blatt mit
  // Inhalt wegfährt statt leer (wie PostenDetail in FinanzBereiche)
  const letzter = useRef<Zugriff | null>(null);
  if (detail) letzter.current = detail;
  const zeige = detail ?? letzter.current;
  const [neu, setNeu] = useState(false);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("committee_access").select("*").order("tag");
    setListe((data as Zugriff[]) || []);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const nameVon = useCallback(
    (userId: string) => {
      const p = profiles.find((x) => x.user_id === userId);
      const st = p?.student_id ? students.find((s) => s.id === p.student_id) : null;
      return st ? `${st.vorname} ${st.nachname}` : p?.username || "Unbekannt";
    },
    [profiles, students],
  );

  // Für die Auswahl: nach Nachnamen sortiert wie überall in der App
  // (Elternzugänge gehören nicht in Komitees)
  const personen = useMemo(
    () =>
      profiles
        .filter((p) => p.role !== "eltern")
        .map((p) => {
          const st = p.student_id ? students.find((s) => s.id === p.student_id) : null;
          return { id: p.user_id, name: nameVon(p.user_id), sortier: st ? `${st.nachname}, ${st.vorname}` : p.username || "" };
        })
        .sort((a, b) => a.sortier.localeCompare(b.sortier, "de")),
    [profiles, students, nameVon],
  );

  if (!can("komitees.access")) return null;

  const werText = (z: Zugriff) => (z.from_tag ? `Komitee ${committeeLabel(z.from_tag)}` : nameVon(z.user_id!));

  async function entziehen(z: Zugriff) {
    if (!(await frage(`${werText(z)} den Zugriff auf „${committeeLabel(z.tag)}“ entziehen?`, "Entziehen", true))) return;
    if (hasSupabase) {
      const { error } = await supabase!.from("committee_access").delete().eq("id", z.id);
      if (error) return meldeFehler("Nicht möglich: " + error.message);
      void laden();
    } else setListe((l) => l.filter((x) => x.id !== z.id));
    setDetail(null);
  }

  async function geben(tag: string, wer: string, modus: "read" | "write"): Promise<boolean> {
    const eintrag = {
      tag,
      mode: modus,
      user_id: wer.startsWith("kom:") ? null : wer,
      from_tag: wer.startsWith("kom:") ? wer.slice(4) : null,
    };
    if (!hasSupabase) {
      setListe((l) => [...l, { id: `demo-${Date.now()}`, ...eintrag }]);
      return true;
    }
    const { error } = await supabase!.from("committee_access").insert(eintrag);
    if (error) {
      meldeFehler("Nicht möglich: " + error.message);
      return false;
    }
    void laden();
    return true;
  }

  return (
    <>
      <Gruppe titel="Fremdzugriff auf Komitees" className="" fuss={ERKLAERUNG}>
        {liste.map((z) => (
          <Zeile
            key={z.id}
            label={werText(z)}
            unter={`${z.mode === "write" ? "liest und schreibt" : "liest"} in ${committeeLabel(z.tag)}`}
            onClick={() => setDetail(z)}
          />
        ))}
        {liste.length === 0 && <div className="px-4 py-3 text-[15px] text-tinte-leise">Noch kein Fremdzugriff vergeben.</div>}
        <Zeile label="Neuer Zugriff" blau onClick={() => setNeu(true)} />
      </Gruppe>

      <Sheet open={detail !== null} onClose={() => setDetail(null)}>
        {zeige && (
          <>
            <SheetKopf titel={werText(zeige)} unter={`Zugriff auf ${committeeLabel(zeige.tag)}`} onClose={() => setDetail(null)} />
            <Gruppe className="">
              <Zeile label="Komitee">
                <Wert>{committeeLabel(zeige.tag)}</Wert>
              </Zeile>
              <Zeile label="Wer">
                <Wert>{zeige.from_tag ? `Ganzes Komitee ${committeeLabel(zeige.from_tag)}` : nameVon(zeige.user_id!)}</Wert>
              </Zeile>
              <Zeile label="Darf">
                <Wert>{MODUS_TEXT[zeige.mode]}</Wert>
              </Zeile>
            </Gruppe>
            <p className="mt-1.5 px-4 text-[13px] leading-snug text-tinte-leise">{ERKLAERUNG}</p>
            <Gruppe className="mt-6">
              <Zeile label="Zugriff entziehen" rot onClick={() => void entziehen(zeige)} />
            </Gruppe>
          </>
        )}
      </Sheet>

      <NeuerZugriffSheet open={neu} onClose={() => setNeu(false)} personen={personen} nameVon={nameVon} onGeben={geben} />
    </>
  );
}

/**
 * Neuer Zugriff: drei Angaben wie ein iOS-Formular – Komitee und Wer als
 * Zeilen, die eine Unterseite mit Häkchen-Liste öffnen (Wer mit Suche),
 * Lesen/Schreiben als Häkchen. „Zugriff geben“ unten in der Fußleiste.
 */
function NeuerZugriffSheet({
  open, onClose, personen, nameVon, onGeben,
}: {
  open: boolean;
  onClose: () => void;
  personen: { id: string; name: string }[];
  nameVon: (userId: string) => string;
  onGeben: (tag: string, wer: string, modus: "read" | "write") => Promise<boolean>;
}) {
  const [tag, setTag] = useState("");
  const [wer, setWer] = useState(""); // "kom:<slug>" oder user_id
  const [modus, setModus] = useState<"read" | "write">("read");
  const [seite, setSeite] = useState<null | "komitee" | "wer">(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTag("");
    setWer("");
    setModus("read");
    setSeite(null);
    setQ("");
  }, [open]);

  const werName = !wer ? null : wer.startsWith("kom:") ? `Komitee ${committeeLabel(wer.slice(4))}` : nameVon(wer);
  const zurueck = { text: "Neuer Zugriff", onClick: () => setSeite(null) };

  async function los() {
    if (!tag || !wer || busy) return;
    setBusy(true);
    const ok = await onGeben(tag, wer, modus);
    setBusy(false);
    if (ok) onClose();
  }

  if (seite === "komitee")
    return (
      <Sheet open={open} onClose={onClose}>
        <SheetKopf titel="Komitee" unter="In welches Komitee darf jemand schauen?" zurueck={zurueck} onClose={onClose} />
        <Gruppe className="">
          {COMMITTEES.map((c) => (
            <ZeileHaken
              key={c.slug}
              label={c.label}
              gewaehlt={tag === c.slug}
              onClick={() => {
                setTag(c.slug);
                // Ein Komitee braucht keinen Zugriff auf sich selbst
                if (wer === `kom:${c.slug}`) setWer("");
                setSeite(null);
              }}
            />
          ))}
        </Gruppe>
      </Sheet>
    );

  if (seite === "wer") {
    const n = normalize(q);
    const komitees = COMMITTEES.filter((c) => c.slug !== tag && (!n || normalize(c.label).includes(n)));
    const leute = personen.filter((p) => !n || normalize(p.name).includes(n));
    const waehle = (w: string) => {
      setWer(w);
      setSeite(null);
    };
    return (
      <Sheet open={open} onClose={onClose}>
        <SheetKopf titel="Wer bekommt Zugriff?" zurueck={zurueck} onClose={onClose} />
        <Suchfeld wert={q} onChange={setQ} platzhalter="Komitee oder Person suchen …" />
        {komitees.length > 0 && (
          <Gruppe titel="Ganzes Komitee" className="">
            {komitees.map((c) => (
              <ZeileHaken key={c.slug} label={c.label} gewaehlt={wer === `kom:${c.slug}`} onClick={() => waehle(`kom:${c.slug}`)} />
            ))}
          </Gruppe>
        )}
        <Gruppe titel="Einzelne Person" className={komitees.length > 0 ? "mt-6" : ""}>
          {leute.map((p) => (
            <ZeileHaken key={p.id} label={p.name} gewaehlt={wer === p.id} onClick={() => waehle(p.id)} />
          ))}
          {leute.length === 0 && <div className="px-4 py-3 text-[15px] text-tinte-leise">Niemand gefunden.</div>}
        </Gruppe>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Neuer Zugriff" unter="Wer darf in ein fremdes Komitee schauen?" onClose={onClose} />
      <Gruppe className="">
        <Zeile label="Komitee" onClick={() => setSeite("komitee")}>
          <Wert>{tag ? committeeLabel(tag) : "Wählen"}</Wert>
        </Zeile>
        <Zeile label="Wer" onClick={() => setSeite("wer")}>
          <Wert>{werName ?? "Wählen"}</Wert>
        </Zeile>
      </Gruppe>
      <Gruppe titel="Darf" fuss={ERKLAERUNG}>
        {(["read", "write"] as const).map((m) => (
          <ZeileHaken key={m} label={MODUS_TEXT[m]} gewaehlt={modus === m} onClick={() => setModus(m)} />
        ))}
      </Gruppe>
      <FussLeiste>
        <button type="button" disabled={!tag || !wer || busy} onClick={() => void los()} className="btn-primary">
          {busy ? "…" : "Zugriff geben"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}
