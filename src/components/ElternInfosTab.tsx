import { useEffect, useRef, useState } from "react";
import { SkelettText } from "./Skelett";
import { useEltern, type ElternTicket } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { datumLang } from "./BeitragsListe";
import { Icon } from "./Icon";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Zeile, ZeileEingabe } from "./Liste";
import { FussLeiste } from "./FussLeiste";
import { useBreit } from "../lib/gescrollt";

/**
 * Entwurf der Frage ans Stufenteam. Vorher lag er im Blatt selbst – ✕, ein
 * Tipp daneben, Wischen oder zweimal Zurück/Esc warfen Betreff und Text ohne
 * Rückfrage weg (Prüfung Okt. 2026). Jetzt hält ihn der Reiter, und damit er
 * auch einen Reiterwechsel übersteht, zusätzlich sessionStorage (nur dieses
 * Fenster, weg nach dem Schließen). Geleert wird er erst nach dem Absenden.
 */
type Entwurf = { betreff: string; text: string };
const LEER: Entwurf = { betreff: "", text: "" };
const ENTWURF_MERKER = "sv:eltern:frage-entwurf";
function entwurfLesen(): Entwurf {
  try {
    const roh = JSON.parse(sessionStorage.getItem(ENTWURF_MERKER) || "null") as Partial<Entwurf> | null;
    if (roh && typeof roh.betreff === "string" && typeof roh.text === "string") return { betreff: roh.betreff, text: roh.text };
  } catch {
    /* privates Fenster, gesperrter Speicher */
  }
  return LEER;
}
/** Für die Zeile: höchstens ~50 Zeichen, eine Zeile */
const kurz = (t: string) => {
  const z = t.replace(/\s+/g, " ");
  return z.length > 50 ? `${z.slice(0, 49)}…` : z;
};

/**
 * Reiter "Infos": links das, was das Stufenteam für die Eltern angeheftet hat,
 * rechts (am Handy darunter) die eigenen Fragen ans Stufenteam.
 *
 * Vorher stand das Frageformular dauernd offen da – größer als die Infos und
 * mit einem breiten blauen Knopf mitten auf der Seite. Jetzt ist es wie in
 * iOS: eine Liste der Gespräche, als letzte Zeile „Neue Frage stellen“; die
 * Frage und jedes Gespräch öffnen sich in einem Blatt.
 *
 * Frage und Gespräch sind EIN Blatt in voller Höhe (wie „Neue Nachricht“ in
 * iMessage): Nach „Absenden“ wird aus dem Formular an derselben Stelle das
 * Gespräch. Vorher fuhr das Frage-Blatt zu, ein kleineres Gespräch-Blatt von
 * unten herein, und jede Fehlerzeile oder Antwort schob den Kopf am Handy ein
 * Stück weiter – dazu lag 3,5 s eine Meldung über der eigenen Nachricht.
 */
export function ElternInfosTab({
  startGespraech = null,
}: {
  /** Dieses Gespräch gleich öffnen (von „Antwort vom Stufenteam“ auf der Übersicht) */
  startGespraech?: string | null;
} = {}) {
  const { infos, tickets, nachrichten, neuesTicket, antworten, alsGelesen, bereit, infosGesehen } = useEltern();
  const { role, uid } = useRole();
  const istEltern = role === "eltern";
  const [neuOffen, setNeuOffen] = useState(false);
  const [offenesTicket, setOffenesTicket] = useState<string | null>(startGespraech);
  // Bis wann die Infos beim Öffnen des Reiters gesehen waren: Was jünger ist,
  // trägt die Marke „Neu“. Der Merker selbst springt sofort auf „jetzt“
  // (ElternApp), die Marke bleibt aber stehen, solange man hier ist.
  const [gesehenBis] = useState(() => Date.parse(infosGesehen) || 0);
  // Nach dem Absenden: im selben Blatt zum neuen Gespräch wechseln
  const [gesendet, setGesendet] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf>(entwurfLesen);
  const hatEntwurf = Boolean(entwurf.betreff.trim() || entwurf.text.trim());
  useEffect(() => {
    try {
      if (entwurf.betreff || entwurf.text) sessionStorage.setItem(ENTWURF_MERKER, JSON.stringify(entwurf));
      else sessionStorage.removeItem(ENTWURF_MERKER);
    } catch {
      /* egal – dann hält ihn nur der Reiter */
    }
  }, [entwurf]);

  const meine = istEltern ? tickets.filter((t) => t.user_id === uid) : tickets;

  /** Steht in diesem Gespräch etwas, das ich noch nicht gesehen habe? */
  const neu = (t: ElternTicket) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    const gesehen = istEltern ? t.gelesen_eltern : t.gelesen_team;
    return !gesehen || fremd[fremd.length - 1].created_at > gesehen;
  };

  const neuesteId = meine[0]?.id;
  useEffect(() => {
    if (!gesendet || !neuesteId) return;
    // In EINEM Schritt: Gespräch auf, Formular zu – das Blatt bleibt offen
    setOffenesTicket(neuesteId);
    setNeuOffen(false);
    setGesendet(false);
  }, [gesendet, neuesteId]);
  const blattZu = () => {
    setNeuOffen(false);
    setOffenesTicket(null);
  };

  const oeffnen = (id: string) => {
    setOffenesTicket(id);
    alsGelesen(id);
  };
  const offen = offenesTicket ? meine.find((t) => t.id === offenesTicket) ?? null : null;
  // Was im offenen Gespräch steht, hat man gesehen: beim Öffnen über
  // „Antwort vom Stufenteam“ (Startgespräch) und wenn eine Antwort kommt,
  // während es offen ist – sonst stünden danach roter Punkt und Zahl am Reiter
  const offenHatNeues = offen ? neu(offen) : false;
  useEffect(() => {
    if (offenesTicket && offenHatNeues) alsGelesen(offenesTicket);
  }, [offenesTicket, offenHatNeues, alsGelesen]);

  return (
    // Am Rechner nebeneinander und gleich hoch: links die Infos, rechts die Fragen
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* ------------------------------------------- angeheftete Infos */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">Vom Stufenteam</h2>
        {!bereit ? (
          <div className="mt-2">
            <SkelettText zeilen={3} />
          </div>
        ) : infos.length === 0 ? (
          <p className="mt-2 text-[13px] text-tinte-leise">Noch keine Neuigkeiten.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {infos.map((i) => {
              const istNeu = Date.parse(i.created_at) > gesehenBis;
              return (
                <li
                  key={i.id}
                  className={`rounded-2xl border p-3.5 ${
                    i.angeheftet ? "border-brand/40 bg-brand/5" : "border-papier-linie dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    {i.angeheftet && (
                      <span className="shrink-0 self-center text-brand-dark dark:text-brand" title="Angeheftet">
                        <Icon name="pin" size={14} />
                      </span>
                    )}
                    <h3 className="min-w-0 flex-1 text-[15px] font-bold">{i.titel}</h3>
                    {/* Neu seit dem letzten Besuch: „Neu“ in Blau vor dem Datum
                        (wie die Markierung ungelesener Mails) */}
                    <span className="shrink-0 text-[12px] text-tinte-leise">
                      {istNeu && <span className="font-semibold text-brand-dark dark:text-brand">Neu · </span>}
                      {new Date(i.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">{i.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------- eigene Fragen */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">Ihre Fragen ans Stufenteam</h2>
        <p className="mt-0.5 text-[13px] text-tinte-matt dark:text-slate-400">Die Antwort kommt hier in die App.</p>
        <div className="gruppe-zellen mt-3">
          {meine.map((t) => {
            const anzahl = nachrichten.filter((n) => n.ticket_id === t.id).length;
            const ungelesen = neu(t);
            return (
              <Zeile
                key={t.id}
                label={
                  <>
                    {ungelesen && (
                      <span
                        role="img"
                        aria-label="Neue Antwort"
                        className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle"
                      />
                    )}
                    <span className={ungelesen ? "font-semibold" : ""}>{t.betreff}</span>
                  </>
                }
                unter={`${anzahl} ${anzahl === 1 ? "Nachricht" : "Nachrichten"} · ${datumLang(t.created_at.slice(0, 10))}`}
                onClick={() => oeffnen(t.id)}
              >
                <StatusKapsel erledigt={t.erledigt} />
              </Zeile>
            );
          })}
          <Zeile
            label="Neue Frage stellen"
            blau
            // Wie in Mail: ein angefangener Entwurf bleibt und ist zu sehen
            unter={hatEntwurf ? `Entwurf: ${kurz(entwurf.betreff.trim() || entwurf.text.trim())}` : undefined}
            onClick={() => setNeuOffen(true)}
          />
        </div>
      </section>

      {/* Ein Blatt für Frage und Gespräch, am Handy in voller Höhe (hoch):
          Kopf oben fest, „Absenden“ bzw. die Antwortzeile unten. Die
          Bestätigung ist das Gespräch selbst – keine Meldung darüber. */}
      <Sheet open={neuOffen || offen !== null} onClose={blattZu} hoch>
        {offen ? (
          <GespraechInhalt
            key={offen.id}
            ticket={offen}
            verlauf={nachrichten.filter((n) => n.ticket_id === offen.id)}
            ich={uid}
            onAntworten={(txt) => void antworten(offen.id, txt)}
            onClose={blattZu}
          />
        ) : (
          <NeueFrageInhalt
            entwurf={entwurf}
            setEntwurf={setEntwurf}
            onClose={blattZu}
            onSenden={async (betreff, text) => {
              const problem = await neuesTicket(betreff, text);
              if (problem) return problem;
              setEntwurf(LEER);
              setGesendet(true);
              return null;
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function StatusKapsel({ erledigt }: { erledigt: boolean }) {
  return erledigt ? (
    <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[12px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      erledigt
    </span>
  ) : (
    <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-[12px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      offen
    </span>
  );
}

/** Inhalt „Frage ans Stufenteam“: Betreff, Frage, unten „Absenden“. */
function NeueFrageInhalt({
  entwurf,
  setEntwurf,
  onClose,
  onSenden,
}: {
  /** Betreff und Text liegen im Reiter – sie überstehen das Schließen des Blatts */
  entwurf: Entwurf;
  setEntwurf: React.Dispatch<React.SetStateAction<Entwurf>>;
  onClose: () => void;
  /** Gibt einen Fehlertext zurück oder null, wenn es geklappt hat. */
  onSenden: (betreff: string, text: string) => Promise<string | null>;
}) {
  const breit = useBreit();
  const { betreff, text } = entwurf;
  const setBetreff = (v: string) => setEntwurf((e) => ({ ...e, betreff: v }));
  const setText = (v: string) => setEntwurf((e) => ({ ...e, text: v }));
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  async function absenden() {
    if (!betreff.trim() || !text.trim()) {
      setFehler(!betreff.trim() && !text.trim() ? "Bitte Betreff und Frage ausfüllen." : !betreff.trim() ? "Bitte noch einen Betreff angeben." : "Bitte noch Ihre Frage eintragen.");
      return;
    }
    setBusy(true);
    const problem = await onSenden(betreff, text);
    setBusy(false);
    if (problem) {
      setFehler(problem);
      return;
    }
    // Den Entwurf leert der Reiter (onSenden), das Blatt wird zum Gespräch
    setFehler("");
  }

  return (
    <>
      <SheetKopf
        titel="Frage ans Stufenteam"
        unter={betreff || text ? "Entwurf bleibt erhalten, bis Sie absenden." : "Die Antwort kommt hier in die App."}
        onClose={onClose}
      />
      <Gruppe className="mt-2">
        {/* Am Handy nicht sofort die Tastatur aufklappen */}
        <ZeileEingabe label="Betreff" value={betreff} onChange={setBetreff} placeholder="z. B. Überweisung" autoFocus={breit} maxLength={120} />
      </Gruppe>
      <Gruppe titel="Ihre Frage" className="mt-5">
        <textarea
          aria-label="Ihre Frage"
          className="block min-h-[140px] w-full resize-y bg-transparent px-4 py-3 text-base text-tinte outline-none placeholder:text-tinte-leise dark:text-slate-100"
          placeholder="Worum geht es?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Gruppe>
      {fehler && (
        <p className="text-fehler mt-2 px-4 text-[13px] font-semibold" role="alert">
          {fehler}
        </p>
      )}
      <FussLeiste>
        <button disabled={busy} onClick={absenden} className="btn-primary">
          {busy ? "Wird gesendet …" : "Absenden"}
        </button>
      </FussLeiste>
    </>
  );
}

/** Ein Gespräch mit dem Stufenteam: Verlauf wie in iMessage, unten antworten. */
function GespraechInhalt({
  ticket,
  verlauf,
  ich,
  onAntworten,
  onClose,
}: {
  ticket: ElternTicket;
  verlauf: { id: string; user_id: string; text: string; created_at: string }[];
  ich: string | null;
  onAntworten: (text: string) => void;
  onClose: () => void;
}) {
  // Wie in iMessage: die neueste Nachricht ist zu sehen
  const ende = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "nearest" });
  }, [verlauf.length]);
  return (
    <>
      <SheetKopf
        titel={ticket.betreff}
        unter={`${ticket.erledigt ? "Erledigt" : "Offen"} · seit ${datumLang(ticket.created_at.slice(0, 10))}`}
        onClose={onClose}
      />
      <ul className="mt-2 grid gap-2">
        {verlauf.map((n) => {
          const meins = n.user_id === ich;
          return (
            <li key={n.id} className={`flex ${meins ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-[1.1rem] px-3.5 py-2 text-[15px] leading-snug ${
                  meins ? "bg-brand text-white" : "bg-[rgb(var(--zelle))] text-tinte dark:text-slate-100"
                }`}
              >
                {!meins && <div className="mb-0.5 text-[12px] font-semibold text-tinte-leise">Stufenteam</div>}
                <div className="whitespace-pre-wrap break-words">{n.text}</div>
                <div className={`mt-0.5 text-right text-[12px] ${meins ? "text-white/75" : "text-tinte-leise"}`}>
                  {new Date(n.created_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={ende} />
      <FussLeiste>
        <AntwortFeld onSenden={onAntworten} />
      </FussLeiste>
    </>
  );
}

function AntwortFeld({ onSenden }: { onSenden: (text: string) => void }) {
  const [text, setText] = useState("");
  const senden = () => {
    if (!text.trim()) return;
    onSenden(text);
    setText("");
  };
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Antwort"
        className="field min-w-0 flex-1"
        placeholder="Antworten …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") senden();
        }}
      />
      <button disabled={!text.trim()} onClick={senden} className="btn-klein min-h-[44px] shrink-0">
        Senden
      </button>
    </div>
  );
}
