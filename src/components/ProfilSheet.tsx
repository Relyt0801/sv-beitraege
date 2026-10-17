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
import { ROLE_TITEL, SELECTABLE_COMMITTEES, committeeLabel } from "../lib/committees";
import { ladeKomiteeAntraege, stelleKomiteeAntrag } from "../lib/komitee-antrag";
import { useTheme, type Modus } from "../lib/theme";
import { fehlerText } from "../lib/netz";
import { abmelden, enablePush, pushConfigured, pushDiagnose, pushPermission } from "../lib/push";
import { ProtokollSheet } from "./ProtokollSheet";
import { RechtLinks } from "./Rechtliches";
import { FunktionenSheet } from "./FunktionenSheet";
import { WortfilterSheet } from "./Melden";
import { FreigabenSheet } from "./FreigabenSheet";
import { Schalter } from "./Schalter";
import { Gruppe, Symbol, Wert, Zeile, ZeileHaken, ZeileMitSchalter } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { Icon, type IconName } from "./Icon";
import { darfSchalten } from "../lib/funktionen";
import { hintergrundEntfernen, hintergrundSetzen, useHintergrund } from "../lib/hintergrund";

import { frage, melde, meldeFehler } from "../lib/melder";
/** Das eigene Profil: Bild, Namensfarbe, Erscheinungsbild, Passwort, Komitee-Wechsel, Hilfe. */
export function ProfilSheet({
  open,
  onClose,
  onTutorial,
  onNeu,
}: {
  open: boolean;
  onClose: () => void;
  /** Fehlt in der Elternansicht – dort gibt es keine Einführung. */
  onTutorial?: () => void;
  /** „Was ist neu“ – öffnet die Patch-Notes wieder (Eltern sehen nur ihre Einträge). */
  onNeu?: () => void;
}) {
  const { mein, uid, aktualisiere, neuLaden } = useProfiles();
  const { isStaff, isOp, role, can } = useRole();
  const istEltern = role === "eltern";
  // In der Elternansicht laeuft kein Chat-Speicher – dann bleibt die Komiteeliste leer.
  const topics = useTopicsOptional();
  const committeesOf = topics?.committeesOf ?? (() => [] as string[]);
  const { theme, modus, setModus } = useTheme();
  const [wunsch, setWunsch] = useState("");
  const [grund, setGrund] = useState("");
  const [antragOffen, setAntragOffen] = useState(false);
  const [farbFehler, setFarbFehler] = useState("");
  const [hatAntrag, setHatAntrag] = useState(false);
  const [antragBusy, setAntragBusy] = useState(false);
  // Passwort ändern direkt im Sheet – prompt() blockieren manche Browser
  const [pwOffen, setPwOffen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwInfo, setPwInfo] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  // Protokoll und Sicherung. Den ganzen Bereich gibt es NUR hier im eigenen
  // Profil – und nur beim Admin (Kassenwart: nur die Sicherheitskopie).
  const [protokollOffen, setProtokollOffen] = useState(false);
  const [wortfilterOffen, setWortfilterOffen] = useState(false);
  const [loeschOffen, setLoeschOffen] = useState(false);
  const [funktionenOffen, setFunktionenOffen] = useState(false);
  const [freigabenOffen, setFreigabenOffen] = useState(false);
  const [farbenOffen, setFarbenOffen] = useState(false);
  const [modusOffen, setModusOffen] = useState(false);

  const meine = committeesOf(uid);
  // Rolle mit eigenem Titel (Stufensprecher, Kassenwart …) – eigene Zeile unter „Konto“;
  // am 320-px-Handy passt „Stv. Schülersprecher*in“ nicht neben „Rolle“
  const rolle = !istEltern && role ? ROLE_TITEL[role] || "" : "";
  const rolleSchmal = role === "stv_sprecher" ? "Stv. Sprecher*in" : rolle;
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
      // fehlerText macht aus „Failed to fetch“ & Co. verständliche deutsche Sätze
      setPwInfo("Hat nicht geklappt: " + fehlerText(error));
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
    setPwInfo("");
    // Der Bereich klappt zu – die Bestätigung muss deshalb außerhalb davon
    // erscheinen (vorher stand sie nur im zugeklappten Teil und war unsichtbar)
    melde("Passwort geändert", "erfolg");
  }

  const darfFunktionen = (["abiball", "album", "zitate", "rankings", "spotify", "motto", "umfragen"] as const).some((k) => darfSchalten(can, k));
  // Freigaben gibt es auch in der Demo (dort nur auf diesem Gerät) – so lässt
  // sich das Blatt ohne Datenbank ansehen. Alles andere braucht die Datenbank.
  const darfFreigaben = istAdmin;
  const darfWortfilter = hasSupabase && can("wortfilter.verwalten");
  const verwaltung = darfFunktionen || darfFreigaben || darfWortfilter;
  const darfLoeschfristen = hasSupabase && (istAdmin || can("perms.manage"));
  // Demo (ohne Datenbank): nur das Protokoll mit erfundenen Einträgen zum Ansehen
  // (lib/protokoll.ts) – Speicher, Löschfristen und Update brauchen die Datenbank.
  const daten = hasSupabase ? istAdmin || istKassenwart || can("perms.manage") : istAdmin;

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Mein Profil" onClose={onClose} />

      {/* Kopf: wie die Account-Zelle ganz oben in den iOS-Einstellungen –
          kompakt in EINER Zeile (Runde 8: vorher 60-px-Bild und Rolle als
          zweite Zeile darunter): Bild, Name links, Rolle rechts.
          Elternzugaenge tragen kein Bild. */}
      <div className="gruppe-zellen">
        <div className="flex min-h-[60px] items-center gap-3 px-4 py-2">
          {!istEltern && <Avatar userId={uid} size={44} />}
          {/* Nur der Name – Rolle und Komitees stehen ausgeschrieben unter
              „Konto“ (vorher rechts daneben, am Handy bis „Stufensprech…“ gekürzt) */}
          <span
            className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.01em]"
            style={istEltern ? undefined : { color: namensfarbe(mein?.farbe, theme === "dark") }}
          >
            {istEltern ? mein?.anzeigename || "Ihr Zugang" : `${personIcon(role, meine)} | ${lesbarerName(mein?.anzeigename || "") || "Dein Name"}`}
          </span>
          {istEltern && <span className="shrink-0 text-[15px] text-tinte-matt dark:text-slate-300">Elternzugang</span>}
        </div>
      </div>

      {farbFehler && <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-fehler">{farbFehler}</div>}

      {/* ------------------------------------------------ Verwaltung
          Gleich unter dem eigenen Konto: Wer verwalten darf, braucht das
          öfter als Darstellung und Mitteilungen (einmal eingestellt) – vorher
          standen Funktionen, Freigaben und Protokoll unter dem Rand. */}
      {verwaltung && (
        <Gruppe titel="Verwaltung">
          {darfFunktionen && <Zeile label="Funktionen" symbol={<Sym icon="auswahl" farbe="bg-brand" />} onClick={() => setFunktionenOffen(true)} />}
          {darfFreigaben && <Zeile label="Freigaben" symbol={<Sym icon="stimme" farbe="bg-[#34C759]" />} onClick={() => setFreigabenOffen(true)} />}
          {darfWortfilter && <Zeile label="Wortfilter" symbol={<Sym icon="schild" farbe="bg-[#FF3B30]" />} onClick={() => setWortfilterOffen(true)} />}
        </Gruppe>
      )}

      {/* ------------------------------------------------ Daten (Admin, Kassenwart) */}
      {daten && (
        <Gruppe titel="Daten">
          {istAdmin && <Zeile label="Protokoll & Sicherung" symbol={<Sym icon="beitraege" farbe="bg-[#8E8E93]" />} onClick={() => setProtokollOffen(true)} />}
          {istKassenwart && <Zeile label="Sicherheitskopie" symbol={<Sym icon="beitraege" farbe="bg-[#8E8E93]" />} onClick={() => setProtokollOffen(true)} />}
          {darfLoeschfristen && <Zeile label="Speicher & Löschen" symbol={<Sym icon="muell" farbe="bg-[#FF9500]" />} onClick={() => setLoeschOffen(true)} />}
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

      {/* ------------------------------------------------ Darstellung
          Runde 8: jede Einstellung EINE Zeile, keine Fußnoten mehr. */}
      <Gruppe titel="Darstellung" className="mt-6">
        {/* Erscheinungsbild: Hell / Dunkel / Automatisch (lib/theme.ts) – wie
            die Namensfarbe eine aufklappbare Zeile mit dem Wert rechts (vorher
            Bezeichnung und Segment untereinander, ~90 px). Der Mond-Knopf oben
            in der Kopfleiste bleibt als Abkürzung. */}
        <AufZeile
          symbol={<Sym icon={theme === "dark" ? "mond" : "sonne"} farbe="bg-[#5856D6]" />}
          label="Erscheinungsbild"
          wert={
            modus === "auto" ? (
              // Am schmalsten Handy (320 px) passt „Automatisch“ nicht neben die Bezeichnung
              <>
                <span className="max-[359px]:hidden">Automatisch</span>
                <span className="min-[360px]:hidden">Auto</span>
              </>
            ) : (
              MODI.find(([m]) => m === modus)?.[1]
            )
          }
          auf={modusOffen}
          onClick={() => setModusOffen((o) => !o)}
        />
        {modusOffen &&
          MODI.map(([wert, text]) => (
            <ZeileHaken
              key={wert}
              // eingerückt bis unter die Bezeichnung – gehört zur Zeile darüber
              symbol={<span aria-hidden className="w-[30px] shrink-0" />}
              label={wert === "auto" ? "Automatisch (wie Gerät)" : text}
              gewaehlt={modus === wert}
              onClick={() => setModus(wert)}
            />
          ))}
        {!istEltern && (
          <AufZeile
            symbol={<Sym icon="person" farbe="bg-[#FF9500]" />}
            label="Namensfarbe"
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

      {/* ------------------------------------------------ Mitteilungen
          Keine Fußnote mehr: Hinweise und „Kommt nichts an?“ klappt die
          Zeile „Dieses Gerät“ auf. */}
      {/* Auch in der Demo (dort „Nicht bereit“, die Prüfung sagt warum) – so
          lassen sich Zeile und Aufklappen ohne Datenbank testen und fotografieren */}
      <Gruppe titel="Mitteilungen">
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
        <PushZeile istEltern={istEltern} />
      </Gruppe>

      {/* ------------------------------------------------ Konto */}
      {/* Ohne Fußnote: „Angefragt“ steht schon rechts in der Komitee-Zeile */}
      {(hasSupabase || (!istEltern && (!isStaff || meine.length > 0 || !!rolle))) && (
        <Gruppe titel="Konto">
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
                placeholder="Neues Passwort (mindestens 8 Zeichen)"
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
              {pwInfo && <div className="px-4 py-2.5 text-[13px] font-medium text-fehler">{pwInfo}</div>}
              <Zeile label={pwBusy ? "Wird gespeichert …" : "Passwort speichern"} blau disabled={pwBusy || !pw1} onClick={() => void passwortSpeichern()} />
            </>
          )}
          {/* Komitee-Wunsch: Unterseite „‹ Mein Profil“ mit Häkchen-Liste (unten) */}
          {rolle && (
            <Zeile symbol={<Sym icon="schild" farbe="bg-[#5856D6]" />} label="Rolle">
              <Wert>
                <span className="max-[359px]:hidden">{rolle}</span>
                <span className="min-[360px]:hidden">{rolleSchmal}</span>
              </Wert>
            </Zeile>
          )}
          {/* Komitee: rechts die eigenen Komitees, ein Tipp → „Komitee wechseln“
              (Stufenteam & Co. tragen ihre Komitees nur zur Ansicht) */}
          {!istEltern && (!isStaff || meine.length > 0) && (
            <Zeile
              symbol={<Sym icon="rollen" farbe="bg-[#32ADE6]" />}
              label={meine.length || isStaff ? "Komitee" : "Komitee wählen"}
              // Ein offener Wechsel steht klein darunter – das jetzige Komitee bleibt sichtbar
              unter={hatAntrag ? (meine.length ? "Wechsel angefragt" : "Angefragt") : undefined}
              onClick={hatAntrag || isStaff ? undefined : () => setAntragOffen(true)}
            >
              {meine.length > 0 && <Wert>{meine.map(committeeLabel).join(", ")}</Wert>}
            </Zeile>
          )}
        </Gruppe>
      )}

      {/* ------------------------------------------------ Hilfe */}
      {(onTutorial || onNeu) && (
        <Gruppe titel="Hilfe">
          {onNeu && <Zeile label="Was ist neu" symbol={<Sym icon="funke" farbe="bg-[#FF9500]" />} onClick={onNeu} />}
          {onTutorial && <Zeile label="Einführung ansehen" symbol={<Sym icon="info" farbe="bg-brand" />} onClick={onTutorial} />}
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

      {!isStaff && !istEltern && (
        <Sheet open={open && antragOffen && !hatAntrag} onClose={() => setAntragOffen(false)}>
          <SheetKopf titel={meine.length ? "Komitee wechseln" : "Komitee wählen"} onClose={() => setAntragOffen(false)} />
          <Gruppe titel="Wunsch-Komitee" className="mt-1">
            {SELECTABLE_COMMITTEES.filter((c) => !meine.includes(c.slug)).map((c) => (
              <ZeileHaken key={c.slug} label={c.label} gewaehlt={wunsch === c.slug} onClick={() => setWunsch(c.slug)} />
            ))}
          </Gruppe>
          <Gruppe titel="Begründung">
            <textarea
              rows={2}
              maxLength={300}
              className={`${EINGABE} resize-none py-3`}
              placeholder="Warum? (optional)"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
            />
          </Gruppe>
          <FussLeiste>
            <button
              type="button"
              className="btn-primary w-full disabled:opacity-40"
              disabled={!wunsch || antragBusy}
              onClick={async () => {
                setAntragBusy(true);
                const r = await stelleKomiteeAntrag(wunsch, grund);
                setAntragBusy(false);
                if (r.ok) {
                  setHatAntrag(true);
                  setAntragOffen(false);
                  melde("Antrag gesendet – das Stufenteam entscheidet", "erfolg");
                } else meldeFehler(r.error || "Das hat nicht geklappt.");
              }}
            >
              {antragBusy ? "…" : "Antrag senden"}
            </button>
          </FussLeiste>
        </Sheet>
      )}
      <LoeschfristenSheet open={loeschOffen} onClose={() => setLoeschOffen(false)} />
      <FunktionenSheet open={funktionenOffen} onClose={() => setFunktionenOffen(false)} />
      <WortfilterSheet open={wortfilterOffen} onClose={() => setWortfilterOffen(false)} />
      {istAdmin && <FreigabenSheet open={freigabenOffen} onClose={() => setFreigabenOffen(false)} />}
      {(istAdmin || istKassenwart) && <ProtokollSheet open={protokollOffen} onClose={() => setProtokollOffen(false)} nurSicherung={!istAdmin} />}
    </Sheet>
  );
}

/** Erscheinungsbild (lib/theme.ts) */
const MODI: [Modus, string][] = [
  ["light", "Hell"],
  ["dark", "Dunkel"],
  ["auto", "Automatisch"],
];

/** Eingabe als eigene Zeile in einer Gruppe (Passwort, Begründung) */
const EINGABE = "block min-h-[48px] w-full bg-transparent px-4 text-[16px] outline-none placeholder:text-tinte-leise";

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
  wert?: ReactNode;
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
      {/* Einzeilig: Mit Wert bleibt die Bezeichnung ganz (höchstens 65 %), der
          Wert kürzt mit „…“ – wie Zeile in Liste.tsx */}
      <span className={`truncate text-[15px] ${wert ? "max-w-[65%] shrink-0" : "min-w-0 flex-1"}`}>{label}</span>
      {children}
      {wert && (
        <span className="flex min-w-0 flex-1 justify-end">
          <Wert>{wert}</Wert>
        </span>
      )}
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
    <>
      {/* Einzeilig (Runde 8): „Nur für dich sichtbar“ stand als zweite Zeile darunter */}
      <Zeile label="Hintergrundbild" symbol={<Sym icon="bild" farbe="bg-[#32ADE6]" />}>
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
        <button className="btn-klein-grau !px-3 !text-[13px]" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? "…" : bild ? "Ändern" : "Auswählen"}
        </button>
      </Zeile>
      {/* „Entfernen“ als eigene Zeile: neben „Ändern“ brach vorher der Text der Zeile um */}
      {bild && (
        <Zeile
          label="Hintergrundbild entfernen"
          rot
          onClick={async () => {
            const f = await hintergrundEntfernen(uid);
            if (f) meldeFehler("Ging nicht: " + f);
          }}
        />
      )}
    </>
  );
}

/**
 * „Dieses Gerät“: Mitteilungen anschalten bzw. ihr Zustand. Ist nichts
 * mehr anzuschalten (an, blockiert, nicht bereit), klappt die Zeile die
 * Prüfung „Kommt bei mir nichts an?“ auf – so stört sie niemanden, der kein
 * Problem hat. Vorher stand sie samt zwei Hinweisen als Fußtext unter der
 * Gruppe. Bis eben verschluckte die App jeden Fehler beim Versenden (siehe
 * sendePush in src/lib/push.ts); jetzt steht hier, woran es hängt.
 */
function PushZeile({ istEltern }: { istEltern: boolean }) {
  const [perm, setPerm] = useState(pushPermission());
  const [busy, setBusy] = useState(false);
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

  const symbol = <Sym icon="info" farbe="bg-[#FF3B30]" />;
  // Noch nicht an: der Knopf steht direkt in der Zeile (wer Mitteilungen nicht
  // an hat, soll ihn sofort sehen – die Prüfung sagte dann ohnehin nur
  // „anschalten“). Sonst klappt die Zeile den Zustand und die Prüfung auf.
  // Kurze Wörter: am 320-px-Handy passen Bezeichnung und Zustand nebeneinander.
  if (pushConfigured() && perm !== "granted" && perm !== "denied")
    return (
      <Zeile label="Dieses Gerät" symbol={symbol}>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await enablePush();
            setBusy(false);
            setPerm(pushPermission());
            if (!r.ok && r.error) meldeFehler("Hat nicht geklappt: " + r.error);
          }}
          className="btn-klein !px-3.5 !text-[13px]"
        >
          {busy ? "…" : "Anschalten"}
        </button>
      </Zeile>
    );

  const zustand = !pushConfigured() ? "Nicht bereit" : perm === "granted" ? "An" : "Blockiert";
  return (
    <>
      <AufZeile symbol={symbol} label="Dieses Gerät" wert={zustand} auf={offen} onClick={() => setOffen((o) => !o)} />
      {offen && (
        <div className="animate-fadeIn space-y-1.5 px-4 pb-3 pt-2 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
          {perm === "denied" && <p>{istEltern ? "Ihr" : "Dein"} Browser blockiert Mitteilungen – in den Browser-Einstellungen wieder erlauben.</p>}
          {!istEltern && <p>Wichtiges – Angepinntes, Team und Events – kommt immer, auch wenn Chats aus sind.</p>}
          <p>{text}</p>
        </div>
      )}
    </>
  );
}
