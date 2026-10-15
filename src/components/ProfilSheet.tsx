import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { SELECTABLE_COMMITTEES, committeeIcon, rolleUndKomitees } from "../lib/committees";
import { ladeKomiteeAntraege, stelleKomiteeAntrag } from "../lib/komitee-antrag";
import { useTheme } from "../lib/theme";
import { abmelden, enablePush, pushConfigured, pushDiagnose, pushPermission } from "../lib/push";
import { ProtokollSheet } from "./ProtokollSheet";
import { RechtLinks } from "./Rechtliches";
import { FunktionenSheet } from "./FunktionenSheet";
import { WortfilterSheet } from "./Melden";
import { FreigabenSheet } from "./FreigabenSheet";
import { Schalter } from "./Schalter";
import { Gruppe, Symbol, Wert, Zeile, ZeileAuswahl, ZeileMitSchalter } from "./Liste";
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

  const darfFunktionen = (["abiball", "album", "zitate", "rankings", "spotify", "motto", "umfragen"] as const).some((k) => darfSchalten(can, k));
  // Freigaben gibt es auch in der Demo (dort nur auf diesem Gerät) – so lässt
  // sich das Blatt ohne Datenbank ansehen. Alles andere braucht die Datenbank.
  const darfFreigaben = istAdmin;
  const darfWortfilter = hasSupabase && can("wortfilter.verwalten");
  const verwaltung = darfFunktionen || darfFreigaben || darfWortfilter;
  const darfLoeschfristen = hasSupabase && (istAdmin || can("perms.manage"));
  const daten = hasSupabase && (istAdmin || istKassenwart || can("perms.manage"));
  const pushText = !pushConfigured() ? "Nicht eingerichtet" : perm === "granted" ? "An" : perm === "denied" ? "Blockiert" : "Aus";

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Mein Profil" onClose={onClose} />

      {/* Kopf: wie die Account-Zelle ganz oben in den iOS-Einstellungen.
          Elternzugaenge tragen kein Bild. */}
      <div className="gruppe-zellen">
       <div className="flex items-center gap-4 px-4 py-3.5">
        {!istEltern && <Avatar userId={uid} size={60} />}
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[19px] font-semibold tracking-[-0.01em]"
            style={istEltern ? undefined : { color: namensfarbe(mein?.farbe, theme === "dark") }}
          >
            {istEltern ? mein?.anzeigename || "Ihr Zugang" : `${personIcon(role, meine)} | ${lesbarerName(mein?.anzeigename || "") || "Dein Name"}`}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-tinte-leise">
            {istEltern ? "Elternzugang" : rolleUndKomitees(role, meine) || "Noch kein Komitee"}
          </div>
        </div>
       </div>
      </div>

      {farbFehler && <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-500">{farbFehler}</div>}

      {/* ------------------------------------------------ Darstellung */}
      <Gruppe titel="Darstellung" className="mt-6">
        {!istEltern && (
          <AufZeile
            symbol={<Sym icon="person" farbe="bg-[#FF9500]" />}
            label="Farbe deines Namens"
            auf={farbenOffen}
            onClick={() => setFarbenOffen((o) => !o)}
          >
            <span
              className="h-[22px] w-[22px] rounded-full"
              style={{ backgroundColor: farbwert(mein?.farbe, theme === "dark"), boxShadow: "inset 0 0 0 1px rgba(100,116,139,.3)" }}
            />
          </AufZeile>
        )}
        {!istEltern && farbenOffen && (
          <div className="grid animate-fadeIn grid-cols-8 gap-2.5 px-4 pb-3.5 pt-3">
            {waehlbareFarben({ staff: isStaff, op: isOp }).map((f) => {
              const aktiv = (mein?.farbe || "indigo") === f.key;
              return (
                <button
                  key={f.key}
                  title={f.label}
                  aria-label={f.label}
                  aria-pressed={aktiv}
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
                  style={{ backgroundColor: theme === "dark" ? f.dunkel : f.hell, boxShadow: f.kontur ? "inset 0 0 0 1px rgba(100,116,139,.5)" : undefined }}
                  className={`aspect-square w-full rounded-full transition duration-200 ease-ios active:scale-90 ${
                    aktiv ? "ring-[2.5px] ring-brand ring-offset-2 ring-offset-[rgb(var(--zelle))]" : ""
                  }`}
                />
              );
            })}
          </div>
        )}
        <HintergrundZeile />
      </Gruppe>

      {/* ------------------------------------------------ Mitteilungen */}
      {(hasSupabase || !istEltern) && (
        <Gruppe
          titel="Mitteilungen"
          fuss={
            <>
              {!istEltern && "Wichtiges – Angepinntes, Team und Events – kommt immer. "}
              {hasSupabase && perm === "denied" && "Dein Browser blockiert Mitteilungen – in den Browser-Einstellungen wieder erlauben. "}
              {hasSupabase && <Pushpruefung />}
            </>
          }
        >
          {!istEltern && (
            <ZeileMitSchalter label="Chats" symbol={<Sym icon="chats" farbe="bg-[#34C759]" />}>
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
            </ZeileMitSchalter>
          )}
          {hasSupabase && (
            <Zeile label="Aufs Gerät" symbol={<Sym icon="info" farbe="bg-[#FF3B30]" />}>
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
                  className="btn-klein !min-h-[2rem] !px-3.5 !text-[13px]"
                >
                  {pushBusy ? "…" : "Anschalten"}
                </button>
              ) : (
                <Wert>{pushText}</Wert>
              )}
            </Zeile>
          )}
        </Gruppe>
      )}

      {/* ------------------------------------------------ Konto */}
      {(hasSupabase || (!isStaff && !istEltern)) && (
        <Gruppe titel="Konto" fuss={hatAntrag && !isStaff && !istEltern ? "Dein Komitee-Wunsch liegt beim Stufenteam." : undefined}>
          {hasSupabase && (
            <AufZeile
              symbol={<Sym icon="schluessel" farbe="bg-[#8E8E93]" />}
              label="Passwort ändern"
              auf={pwOffen}
              onClick={() => {
                setPwOffen((o) => !o);
                setPwInfo("");
              }}
            />
          )}
          {hasSupabase && pwOffen && (
            <>
              <input
                type="password"
                autoComplete="new-password"
                className={EINGABE}
                placeholder="Neues Passwort"
                value={pw1}
                autoFocus
                onChange={(e) => setPw1(e.target.value)}
              />
              <input
                type="password"
                autoComplete="new-password"
                className={EINGABE}
                placeholder="Noch einmal zur Sicherheit"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void passwortSpeichern()}
              />
              {pwInfo && <div className="px-4 py-2.5 text-[13px] font-medium text-red-500">{pwInfo}</div>}
              <Zeile label={pwBusy ? "Wird gespeichert …" : "Passwort speichern"} blau disabled={pwBusy || !pw1} onClick={() => void passwortSpeichern()} />
            </>
          )}
          {!isStaff && !istEltern && (
            <AufZeile
              symbol={<Sym icon="rollen" farbe="bg-[#32ADE6]" />}
              label={meine.length ? "Komitee wechseln" : "Komitee wählen"}
              auf={antragOffen}
              onClick={() => !hatAntrag && setAntragOffen((o) => !o)}
              wert={hatAntrag ? "Angefragt" : undefined}
              ohnePfeil={hatAntrag}
            />
          )}
          {!isStaff && !istEltern && antragOffen && !hatAntrag && (
            <>
              <Zeile label="Wunsch">
                <ZeileAuswahl label="Wunsch-Komitee" value={wunsch} onChange={setWunsch}>
                  <option value="">Auswählen</option>
                  {SELECTABLE_COMMITTEES.filter((c) => !meine.includes(c.slug)).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {committeeIcon(c.slug)} {c.label}
                    </option>
                  ))}
                </ZeileAuswahl>
              </Zeile>
              <textarea
                rows={2}
                maxLength={300}
                className={`${EINGABE} resize-none py-3`}
                placeholder="Warum? Ein Satz reicht"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
              />
              <Zeile
                label="Antrag senden"
                blau
                disabled={!wunsch}
                onClick={async () => {
                  const r = await stelleKomiteeAntrag(wunsch, grund);
                  if (r.ok) {
                    setHatAntrag(true);
                    setAntragOffen(false);
                  } else meldeFehler(r.error || "Das hat nicht geklappt.");
                }}
              />
            </>
          )}
        </Gruppe>
      )}

      {/* ------------------------------------------------ Verwaltung */}
      {verwaltung && (
        <Gruppe titel="Verwaltung">
          {darfFunktionen && <Zeile label="Funktionen" symbol={<Sym icon="auswahl" farbe="bg-brand" />} onClick={() => setFunktionenOffen(true)} />}
          {darfFreigaben && <Zeile label="Freigaben & Nachträge" symbol={<Sym icon="stimme" farbe="bg-[#34C759]" />} onClick={() => setFreigabenOffen(true)} />}
          {darfWortfilter && <Zeile label="Wortfilter" symbol={<Sym icon="schild" farbe="bg-[#FF3B30]" />} onClick={() => setWortfilterOffen(true)} />}
        </Gruppe>
      )}

      {/* ------------------------------------------------ Daten (Admin, Kassenwart) */}
      {daten && (
        <Gruppe titel="Daten">
          {istAdmin && <Zeile label="Protokoll & Sicherung" symbol={<Sym icon="beitraege" farbe="bg-[#8E8E93]" />} onClick={() => setProtokollOffen(true)} />}
          {istKassenwart && <Zeile label="Sicherheitskopie" symbol={<Sym icon="beitraege" farbe="bg-[#8E8E93]" />} onClick={() => setProtokollOffen(true)} />}
          {darfLoeschfristen && <Zeile label="Automatisch löschen" symbol={<Sym icon="muell" farbe="bg-[#FF9500]" />} onClick={() => setLoeschOffen(true)} />}
          {darfLoeschfristen && (
            <Zeile
              label="Update bei allen erzwingen"
              symbol={<Sym icon="pfeile" farbe="bg-[#32ADE6]" />}
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
        </Gruppe>
      )}

      {/* ------------------------------------------------ Hilfe */}
      {onTutorial && (
        <Gruppe titel="Hilfe">
          <Zeile label="Einführung noch mal ansehen" symbol={<Sym icon="info" farbe="bg-brand" />} onClick={onTutorial} />
        </Gruppe>
      )}

      {/* Abmelden: gefährlich, deshalb rot, allein und ganz unten */}
      {hasSupabase && (
        <div className="gruppe-zellen mt-6">
          <button
            className="flex min-h-[48px] w-full items-center justify-center px-4 text-[15px] text-red-600 transition active:bg-black/[0.04] dark:text-red-400 dark:active:bg-white/[0.06]"
            onClick={() =>
              void frage("Wirklich abmelden?", "Abmelden", true).then((ok) => {
                if (ok) void abmelden();
              })
            }
          >
            Abmelden
          </button>
        </div>
      )}

      <div className="mt-5">
        <RechtLinks />
      </div>

      <LoeschfristenSheet open={loeschOffen} onClose={() => setLoeschOffen(false)} />
      <FunktionenSheet open={funktionenOffen} onClose={() => setFunktionenOffen(false)} />
      <WortfilterSheet open={wortfilterOffen} onClose={() => setWortfilterOffen(false)} />
      {istAdmin && <FreigabenSheet open={freigabenOffen} onClose={() => setFreigabenOffen(false)} />}
      {(istAdmin || istKassenwart) && <ProtokollSheet open={protokollOffen} onClose={() => setProtokollOffen(false)} nurSicherung={!istAdmin} />}
    </Sheet>
  );
}

/** Eingabe als eigene Zeile in einer Gruppe (Passwort, Begründung) */
const EINGABE = "block min-h-[48px] w-full bg-transparent px-4 text-[15px] outline-none placeholder:text-tinte-leise";

/** Farbiges Symbol-Kästchen mit Icon */
function Sym({ icon, farbe }: { icon: IconName; farbe: string }) {
  return (
    <Symbol farbe={farbe}>
      <Icon name={icon} size={16} strich={2.2} />
    </Symbol>
  );
}

/** Zeile, die darunter etwas aufklappt – der Pfeil dreht sich mit. */
function AufZeile({
  symbol,
  label,
  auf,
  onClick,
  wert,
  ohnePfeil,
  children,
}: {
  symbol: ReactNode;
  label: string;
  auf: boolean;
  onClick: () => void;
  wert?: string;
  ohnePfeil?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={auf}
      className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
    >
      {symbol}
      <span className="min-w-0 flex-1 text-[15px]">{label}</span>
      {children}
      {wert && <Wert>{wert}</Wert>}
      {!ohnePfeil && (
        <span className={`text-tinte-leise transition duration-200 ease-ios ${auf ? "rotate-90" : ""}`} aria-hidden>
          <Icon name="chevron" size={16} />
        </span>
      )}
    </button>
  );
}

/** Eigenes Hintergrundbild: auswählen, ersetzen, entfernen */
function HintergrundZeile() {
  const { uid } = useRole();
  const bild = useHintergrund();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Zeile label="Hintergrundbild" unter="Nur für dich sichtbar" symbol={<Sym icon="bild" farbe="bg-[#32ADE6]" />}>
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
      {bild && (
        <button
          className="px-1 text-[15px] text-red-600 dark:text-red-400"
          onClick={async () => {
            const f = await hintergrundEntfernen(uid);
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        >
          Entfernen
        </button>
      )}
      <button className="btn-klein-grau !min-h-[2rem] !px-3 !text-[13px]" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? "…" : bild ? "Ändern" : "Auswählen"}
      </button>
    </Zeile>
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
    <>
      <button onClick={() => setOffen((v) => !v)} className="font-medium text-brand-dark dark:text-brand">
        {offen ? "Prüfung ausblenden" : "Kommt nichts an? Hier prüfen"}
      </button>
      {offen && <span className="mt-1.5 block leading-relaxed text-tinte-matt dark:text-slate-300">{text}</span>}
    </>
  );
}
