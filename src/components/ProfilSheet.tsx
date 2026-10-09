import { useEffect, useRef, useState } from "react";
import { neuLadenErzwingen } from "../lib/neuladen";
import { LoeschfristenSheet } from "./LoeschfristenSheet";
import { Sheet, SheetKopf } from "./Sheet";
import { Avatar } from "./Avatar";
import { personIcon } from "../lib/committees";
import { useProfiles } from "../profiles-store";
import { useTopicsOptional } from "../topics-store";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { farbwert, lesbarerName, namensfarbe, speichereProfil, waehlbareFarben } from "../lib/profil";
import { passwortProblem } from "../lib/passwort";
import { SELECTABLE_COMMITTEES, committeeIcon, committeeLabel, rolleUndKomitees } from "../lib/committees";
import { ladeKomiteeAntraege, stelleKomiteeAntrag } from "../lib/komitee-antrag";
import { useTheme } from "../lib/theme";
import { abmelden, enablePush, pushConfigured, pushDiagnose, pushPermission } from "../lib/push";
import { ProtokollSheet } from "./ProtokollSheet";
import { RechtLinks } from "./Rechtliches";
import { FunktionenSheet } from "./FunktionenSheet";
import { WortfilterSheet } from "./Melden";
import { FreigabenSheet } from "./FreigabenSheet";
import { Schalter } from "./Schalter";
import { Icon, type IconName } from "./Icon";
import { darfSchalten } from "../lib/funktionen";
import { hintergrundEntfernen, hintergrundSetzen, useHintergrund } from "../lib/hintergrund";

import { frage, melde, meldeFehler } from "../lib/melder";
/** Das eigene Profil: Bild, Namensfarbe, Passwort, Komitee-Wechsel, Hilfe. */
export function ProfilSheet({
  open,
  onClose,
  onTutorial,
}: {
  open: boolean;
  onClose: () => void;
  /** Fehlt in der Elternansicht – dort gibt es keine Einführung. */
  onTutorial?: () => void;
}) {
  const { mein, uid, aktualisiere, neuLaden } = useProfiles();
  const { isStaff, isOp, role, can } = useRole();
  const istEltern = role === "eltern";
  // In der Elternansicht laeuft kein Chat-Speicher – dann bleibt die Komiteeliste leer.
  const topics = useTopicsOptional();
  const committeesOf = topics?.committeesOf ?? (() => [] as string[]);
  const { theme } = useTheme();
  const [wunsch, setWunsch] = useState("");
  const [grund, setGrund] = useState("");
  const [antragOffen, setAntragOffen] = useState(false);
  const [farbFehler, setFarbFehler] = useState("");
  const [hatAntrag, setHatAntrag] = useState(false);
  // Passwort ändern direkt im Sheet – prompt() blockieren manche Browser
  const [pwOffen, setPwOffen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwInfo, setPwInfo] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [perm, setPerm] = useState(pushPermission());
  const [pushBusy, setPushBusy] = useState(false);
  // Protokoll und Sicherung. Den ganzen Bereich gibt es NUR hier im eigenen
  // Profil – und nur beim Admin (Kassenwart: nur die Sicherheitskopie).
  const [protokollOffen, setProtokollOffen] = useState(false);
  const [wortfilterOffen, setWortfilterOffen] = useState(false);
  const [loeschOffen, setLoeschOffen] = useState(false);
  const [funktionenOffen, setFunktionenOffen] = useState(false);
  const [freigabenOffen, setFreigabenOffen] = useState(false);
  const [farbenOffen, setFarbenOffen] = useState(false);

  const meine = committeesOf(uid);
  const istAdmin = role === "admin";
  const istKassenwart = role === "kassenwart";

  useEffect(() => {
    if (open) void ladeKomiteeAntraege().then((r) => setHatAntrag(r.some((x) => x.user_id === uid)));
  }, [open, uid]);

  async function passwortSpeichern() {
    setPwInfo("");
    const problem = passwortProblem(pw1, mein?.anzeigename || "");
    if (problem) {
      setPwInfo(problem);
      return;
    }
    if (pw1 !== pw2) {
      setPwInfo("Die beiden Eingaben sind nicht gleich.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw1 });
    setPwBusy(false);
    if (error) {
      setPwInfo("Hat nicht geklappt: " + error.message);
      return;
    }
    // Der graue Punkt in den Listen bedeutet "nutzt noch das Startpasswort".
    // Wer hier ein eigenes setzt, hat genau das hinter sich – ohne diese Zeile
    // blieb die Markierung fuer immer stehen und log ueber den Kontostand.
    const { data: s } = await supabase!.auth.getSession();
    const uid = s.session?.user.id;
    if (uid) await supabase!.from("profiles").update({ must_change_password: false }).eq("user_id", uid);

    setPw1("");
    setPw2("");
    setPwOffen(false);
    setPwInfo("Passwort geändert.");
  }

  // Zeilen wie in den iOS-Einstellungen: gruppierte Listen mit Symbol links
  const row =
    "flex min-h-[2.75rem] w-full items-center gap-3 px-4 py-2 text-left text-[16px] transition active:bg-black/[0.05] dark:active:bg-white/[0.07]";
  const darfFunktionen = (["abiball", "album", "zitate", "rankings", "spotify", "motto", "umfragen"] as const).some((k) => darfSchalten(can, k));
  const verwaltung =
    darfFunktionen || (hasSupabase && (can("wortfilter.verwalten") || istAdmin || istKassenwart || can("perms.manage")));

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Mein Profil" onClose={onClose} />

      {/* Kopf: Namenskreis + Name. Elternzugaenge tragen kein Bild. */}
      <div className="mb-5 flex items-center gap-4">
        {!istEltern && <Avatar userId={uid} size={64} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold" style={istEltern ? undefined : { color: namensfarbe(mein?.farbe, theme === "dark") }}>
            {istEltern ? mein?.anzeigename || "Ihr Zugang" : `${personIcon(role, meine)} | ${lesbarerName(mein?.anzeigename || "") || "Dein Name"}`}
          </div>
          <div className="text-[12px] text-tinte-leise">{istEltern ? "Elternzugang" : rolleUndKomitees(role, meine) || "noch kein Komitee"}</div>
        </div>
      </div>

      {farbFehler && <div className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-500">{farbFehler}</div>}

      {/* ------------------------------------------------ Darstellung */}
      <h3 className="abschnitt">Darstellung</h3>
      <div className="liste mb-5 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {!istEltern && (
          <div>
            <button className={row} onClick={() => setFarbenOffen((o) => !o)} aria-expanded={farbenOffen}>
              <span className="symbol bg-[#FF9500]">
                <Icon name="person" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1">Farbe deines Namens</span>
              <span className="h-5 w-5 rounded-full" style={{ backgroundColor: farbwert(mein?.farbe, theme === "dark"), border: "1px solid rgba(100,116,139,.35)" }} />
              <Pfeil auf={farbenOffen} />
            </button>
            {farbenOffen && (
              <div className="grid max-w-sm grid-cols-8 gap-2 px-4 pb-3 pt-1 sm:gap-2.5">
                {waehlbareFarben({ staff: isStaff, op: isOp }).map((f) => {
                  const aktiv = (mein?.farbe || "indigo") === f.key;
                  return (
                    <button
                      key={f.key}
                      title={f.label}
                      aria-label={f.label}
                      onClick={async () => {
                        aktualisiere({ farbe: f.key });
                        setFarbFehler("");
                        const r = await speichereProfil({ farbe: f.key });
                        if (!r.ok) {
                          setFarbFehler("Farbe konnte nicht gespeichert werden: " + r.error);
                          return;
                        }
                        neuLaden();
                      }}
                      style={{ backgroundColor: theme === "dark" ? f.dunkel : f.hell, border: f.kontur ? "1px solid rgba(100,116,139,.5)" : undefined }}
                      className={`aspect-square w-full rounded-full transition active:scale-90 ${
                        aktiv ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900" : ""
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
        <HintergrundZeile row={row} />
      </div>

      {/* ------------------------------------------------ Mitteilungen */}
      {(hasSupabase || !istEltern) && <h3 className="abschnitt">Mitteilungen</h3>}
      <div className="liste mb-5 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)] [&:empty]:hidden">
        {!istEltern && (
          <label className={row}>
            <span className="symbol bg-[#34C759]">
              <Icon name="chats" size={16} strich={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">Chats</span>
              <span className="block text-[12px] text-tinte-leise">Wichtiges (Angepinntes, Team, Events) kommt immer.</span>
            </span>
            <Schalter
              an={mein?.push_chats ?? true}
              label="Mitteilungen für Chats"
              onChange={async (neu) => {
                aktualisiere({ push_chats: neu });
                const r = await speichereProfil({ push_chats: neu });
                if (!r.ok) setFarbFehler("Einstellung konnte nicht gespeichert werden: " + r.error);
                else neuLaden();
              }}
            />
          </label>
        )}
        {hasSupabase && (
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="symbol bg-[#FF3B30]">
                <Icon name="info" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1 text-[16px]">Aufs Gerät</span>
              {pushConfigured() && perm !== "granted" && perm !== "denied" ? (
                <button
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    const r = await enablePush();
                    setPushBusy(false);
                    setPerm(pushPermission());
                    if (!r.ok && r.error) meldeFehler("Hat nicht geklappt: " + r.error);
                  }}
                  className="btn-klein"
                >
                  {pushBusy ? "…" : "Anschalten"}
                </button>
              ) : (
                <span className={`text-[14px] ${perm === "granted" ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-tinte-leise"}`}>
                  {!pushConfigured() ? "nicht eingerichtet" : perm === "granted" ? "An" : "blockiert"}
                </span>
              )}
            </div>
            {perm === "denied" && (
              <p className="ml-[42px] mt-1 text-[12px] leading-snug text-tinte-leise">Dein Browser blockiert sie. In den Browser-Einstellungen wieder erlauben.</p>
            )}
            <div className="ml-[42px]">
              <Pushpruefung />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------ Konto */}
      {(hasSupabase || (!isStaff && !istEltern)) && <h3 className="abschnitt">Konto</h3>}
      <div className="liste mb-5 [&:empty]:hidden bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
        {hasSupabase && (
          <div>
            <button className={row} onClick={() => { setPwOffen((o) => !o); setPwInfo(""); }} aria-expanded={pwOffen}>
              <span className="symbol bg-[#8E8E93]">
                <Icon name="schluessel" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1">Passwort ändern</span>
              <Pfeil auf={pwOffen} />
            </button>
            {pwOffen && (
              <div className="px-4 pb-3">
                <input type="password" autoComplete="new-password" className="field mb-2" placeholder="Neues Passwort" value={pw1} onChange={(e) => setPw1(e.target.value)} />
                <input
                  type="password"
                  autoComplete="new-password"
                  className="field mb-2"
                  placeholder="Noch einmal zur Sicherheit"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void passwortSpeichern()}
                />
                {pwInfo && <div className="mb-2 text-[13px] font-medium text-red-500">{pwInfo}</div>}
                <button disabled={pwBusy} onClick={passwortSpeichern} className="btn-klein w-full">
                  {pwBusy ? "…" : "Speichern"}
                </button>
              </div>
            )}
          </div>
        )}
        {!isStaff && !istEltern && (
          <div>
            <button className={row} onClick={() => !hatAntrag && setAntragOffen((o) => !o)} aria-expanded={antragOffen}>
              <span className="symbol bg-[#32ADE6]">
                <Icon name="rollen" size={16} strich={2.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{meine.length ? "Komitee wechseln" : "Komitee wählen"}</span>
                {hatAntrag && <span className="block text-[12px] text-tinte-leise">Dein Wunsch liegt beim Stufenteam.</span>}
              </span>
              {!hatAntrag && <Pfeil auf={antragOffen} />}
            </button>
            {antragOffen && !hatAntrag && (
              <div className="px-4 pb-3">
                <select className="field mb-2" value={wunsch} onChange={(e) => setWunsch(e.target.value)}>
                  <option value="">— Wunsch-Komitee —</option>
                  {SELECTABLE_COMMITTEES.filter((c) => !meine.includes(c.slug)).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {committeeIcon(c.slug)} {c.label}
                    </option>
                  ))}
                </select>
                <textarea rows={2} maxLength={300} className="field mb-2 resize-none" placeholder="Warum? Ein Satz reicht" value={grund} onChange={(e) => setGrund(e.target.value)} />
                <button
                  disabled={!wunsch}
                  onClick={async () => {
                    const r = await stelleKomiteeAntrag(wunsch, grund);
                    if (r.ok) {
                      setHatAntrag(true);
                      setAntragOffen(false);
                    } else meldeFehler(r.error || "Das hat nicht geklappt.");
                  }}
                  className="btn-klein w-full"
                >
                  Antrag senden
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ Verwaltung */}
      {verwaltung && (
        <>
          <h3 className="abschnitt">Verwaltung</h3>
          <div className="liste mb-5 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)]">
            {darfFunktionen && (
              <VZeile row={row} icon="auswahl" farbe="bg-brand" text="Funktionen" onClick={() => setFunktionenOffen(true)} />
            )}
            {hasSupabase && can("wortfilter.verwalten") && (
              <VZeile row={row} icon="schild" farbe="bg-[#FF3B30]" text="Wortfilter" onClick={() => setWortfilterOffen(true)} />
            )}
            {hasSupabase && istAdmin && (
              <VZeile row={row} icon="stimme" farbe="bg-[#34C759]" text="Freigaben & Nachträge" onClick={() => setFreigabenOffen(true)} />
            )}
            {hasSupabase && istAdmin && (
              <VZeile row={row} icon="beitraege" farbe="bg-[#8E8E93]" text="Protokoll & Sicherung" onClick={() => setProtokollOffen(true)} />
            )}
            {hasSupabase && istKassenwart && (
              <VZeile row={row} icon="beitraege" farbe="bg-[#8E8E93]" text="Sicherheitskopie der Daten" onClick={() => setProtokollOffen(true)} />
            )}
            {hasSupabase && (istAdmin || can("perms.manage")) && (
              <VZeile row={row} icon="muell" farbe="bg-[#FF9500]" text="Automatisch löschen" onClick={() => setLoeschOffen(true)} />
            )}
            {hasSupabase && (istAdmin || can("perms.manage")) && (
              <VZeile
                row={row}
                icon="pfeile"
                farbe="bg-[#32ADE6]"
                text="Update bei allen erzwingen"
                onClick={() =>
                  void frage("Alle offenen Apps jetzt neu laden?\n\nWer gerade tippt, wird erst danach neu geladen.", "Neu laden").then(async (ok) => {
                    if (!ok) return;
                    const f = await neuLadenErzwingen();
                    if (f) meldeFehler("Ging nicht: " + f);
                    else melde("Alle Apps laden jetzt neu");
                  })
                }
              />
            )}
          </div>
        </>
      )}

      <div className="liste mb-5 bg-[rgb(118_118_128/0.08)] dark:bg-[rgb(118_118_128/0.18)] [&:empty]:hidden">
        {onTutorial && <VZeile row={row} icon="info" farbe="bg-brand" text="Einführung noch mal ansehen" onClick={onTutorial} />}
        {hasSupabase && (
          <button className={`${row} justify-center font-semibold text-red-600 dark:text-red-400`} onClick={() => void frage("Wirklich abmelden?", "Abmelden", true).then((ok) => { if (ok) void abmelden(); })}>
            Abmelden
          </button>
        )}
      </div>

      <RechtLinks />

      <LoeschfristenSheet open={loeschOffen} onClose={() => setLoeschOffen(false)} />
      <FunktionenSheet open={funktionenOffen} onClose={() => setFunktionenOffen(false)} />
      <WortfilterSheet open={wortfilterOffen} onClose={() => setWortfilterOffen(false)} />
      {istAdmin && <FreigabenSheet open={freigabenOffen} onClose={() => setFreigabenOffen(false)} />}
      {(istAdmin || istKassenwart) && <ProtokollSheet open={protokollOffen} onClose={() => setProtokollOffen(false)} nurSicherung={!istAdmin} />}
    </Sheet>
  );
}

function Pfeil({ auf }: { auf: boolean }) {
  return (
    <span className={`text-tinte-leise transition ${auf ? "rotate-90" : ""}`} aria-hidden>
      <Icon name="chevron" size={16} />
    </span>
  );
}

function VZeile({ row, icon, farbe, text, onClick }: { row: string; icon: IconName; farbe: string; text: string; onClick: () => void }) {
  return (
    <button className={row} onClick={onClick}>
      <span className={`symbol ${farbe}`}>
        <Icon name={icon} size={16} strich={2.2} />
      </span>
      <span className="min-w-0 flex-1">{text}</span>
      <Pfeil auf={false} />
    </button>
  );
}

/** Eigenes Hintergrundbild: auswählen, ersetzen, entfernen */
function HintergrundZeile({ row }: { row: string }) {
  const { uid } = useRole();
  const bild = useHintergrund();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={row}>
      <span className="symbol bg-[#32ADE6]">
        <Icon name="bild" size={16} strich={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">Hintergrundbild</span>
        <span className="block text-[12px] text-tinte-leise">Nur für dich sichtbar</span>
      </span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const d = e.target.files?.[0];
          e.target.value = "";
          if (!d) return;
          setBusy(true);
          const f = await hintergrundSetzen(uid, d);
          setBusy(false);
          if (f) meldeFehler("Ging nicht: " + f);
          else melde("Hintergrund gesetzt", "erfolg");
        }}
      />
      <button className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "…" : bild ? "Ändern" : "Auswählen"}
      </button>
      {bild && (
        <button
          aria-label="Hintergrundbild entfernen"
          className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 dark:text-red-400"
          onClick={async () => {
            const f = await hintergrundEntfernen(uid);
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        >
          <Icon name="x" size={16} strich={2.4} />
        </button>
      )}
    </div>
  );
}

/**
 * "Kommt bei mir nichts an?" – aufklappbar, damit es niemanden stört, der kein
 * Problem hat. Bis eben verschluckte die App jeden Fehler beim Versenden (siehe
 * sendePush in src/lib/push.ts); jetzt steht hier, woran es hängt.
 */
function Pushpruefung() {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("Wird geprüft …");

  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    setText("Wird geprüft …");
    void pushDiagnose().then((t) => aktuell && setText(t));
    return () => {
      aktuell = false;
    };
  }, [offen]);

  return (
    <div className="mt-2">
      <button onClick={() => setOffen((v) => !v)} className="text-[12px] font-semibold text-tinte-leise underline">
        {offen ? "Prüfung ausblenden" : "Kommt nichts an? Hier prüfen"}
      </button>
      {offen && <p className="mt-1.5 text-[12px] leading-relaxed text-tinte-matt">{text}</p>}
    </div>
  );
}

