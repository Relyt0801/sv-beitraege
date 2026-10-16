import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useEltern, type ElternInfo, type ElternTicket, type Elternkonto } from "../eltern-store";
import { useRole } from "../auth/RoleProvider";
import { useProfiles } from "../profiles-store";
import { useStore } from "../store";
import { normalize } from "../lib/logic";
import { datumLang } from "./BeitragsListe";

import { frage } from "../lib/melder";
import { ChatEbene, ChatEingabe, ChatKopf, GespraechKnoepfe, GespraechMehrBlatt, useChatEndeIn } from "./ChatBlasen";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { Schalter } from "./Schalter";
import { Sheet, SheetKopf } from "./Sheet";
import { Gruppe, Wert, Zeile, ZeileMitSchalter } from "./Liste";
import { FussLeiste } from "./FussLeiste";

/**
 * Was das Stufenteam mit den Eltern zu tun hat – zwei Ebenen aus dem
 * Chats-Reiter: „Infos für Eltern“ (anheften, für alle Eltern) und
 * „Gespräche mit Eltern“ (Fragen beantworten, ein Elternhaus anschreiben).
 *
 * Seit Okt. 2026 wie die übrigen Unterseiten (TicketListe): „+“ oben rechts
 * im Kopf öffnet ein Blatt mit Fußknopf, die Einträge sind iOS-Zeilen, ein
 * Gespräch geht als eigener Chat auf. Vorher: Kapsel-Knopf in einer weißen
 * Karte, Formular klappte gestrichelt in der Seite auf, seitenbreiter
 * „Veröffentlichen“-Knopf, Mülleimer in jeder Zeile.
 */

/** Wer fragt da? „Familie Müller“ allein reicht nicht – es kann zwei geben. Deshalb steht das Kind dahinter. */
function useAbsender() {
  const { zuordnung } = useEltern();
  const { profile } = useProfiles();
  const { students } = useStore();
  return (userId: string) => {
    const name = profile[userId]?.anzeigename || "Elternzugang";
    const kinder = (zuordnung[userId] || [])
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => `${s!.vorname} ${s!.nachname}`);
    return kinder.length ? `${name} · ${kinder.join(" und ")}` : name;
  };
}

/** Hat in diesem Gespräch jemand geschrieben, seit das Team zuletzt geschaut hat? */
function useIstNeu() {
  const { nachrichten } = useEltern();
  const { uid } = useRole();
  return (t: ElternTicket) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    return !t.gelesen_team || fremd[fremd.length - 1].created_at > t.gelesen_team;
  };
}

/**
 * Zahlen für die Kacheln im Chats-Reiter: offene Gespräche mit Eltern, davon
 * mit neuer Nachricht, und veröffentlichte Infos.
 */
export function useElternZahlen(aktiv: boolean) {
  const { infos, tickets, nachrichten } = useEltern();
  const { uid } = useRole();
  if (!aktiv) return { offen: 0, neu: 0, infos: 0 };
  const offene = tickets.filter((t) => !t.erledigt);
  const neu = offene.filter((t) => {
    const fremd = nachrichten.filter((n) => n.ticket_id === t.id && n.user_id !== uid);
    if (!fremd.length) return false;
    return !t.gelesen_team || fremd[fremd.length - 1].created_at > t.gelesen_team;
  }).length;
  return { offen: offene.length, neu, infos: infos.length };
}

/** Leerer Zustand einer Unterseite: Liniensymbol, ein Satz, was als Nächstes passiert (wie in ChatsTab). */
function Leer({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand dark:bg-brand/20">
        <Icon name={icon} size={26} />
      </span>
      <p className="auf-bild mx-auto mt-3 max-w-xs text-[14px] leading-snug text-tinte-leise">{text}</p>
    </div>
  );
}

/** Rundes „+“ rechts im Kopf einer Ebene (wie bei „Schüler“) */
function PlusKnopf({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="iconbtn" onClick={onClick} aria-label={label} title={label}>
      <Icon name="plus" size={19} strich={2.4} />
    </button>
  );
}

const kurzDatum = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

/* ====================================================================== */
/* Infos für Eltern                                                        */
/* ====================================================================== */

/** Eigene Ebene „Infos für Eltern“ (aus der Kachel im Chats-Reiter) */
export function ElternInfosEbene({ onBack }: { onBack: () => void }) {
  const { infos } = useEltern();
  const [neu, setNeu] = useState(false);
  const [zeigId, setZeigId] = useState<string | null>(null);
  const zeig = zeigId ? infos.find((i) => i.id === zeigId) ?? null : null;
  return (
    <ChatEbene
      label="Infos für Eltern"
      start="oben"
      onSchliessen={onBack}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Icon name="info" size={17} strich={2.2} />}
          titel="Infos für Eltern"
          unter={infos.length ? `${infos.length} veröffentlicht` : "Noch nichts veröffentlicht"}
          rechts={<PlusKnopf label="Neue Info" onClick={() => setNeu(true)} />}
        />
      }
    >
      <div className="py-4">
        {infos.length === 0 ? (
          <Leer icon="info" text="Noch nichts veröffentlicht. Mit „+“ oben rechts schreibst du die erste Info für alle Eltern." />
        ) : (
          <Gruppe
            className=""
            titel="Veröffentlicht"
            fuss="Was hier steht, sehen alle Eltern in ihrem Reiter Infos. Wer Mitteilungen erlaubt hat, bekommt es zusätzlich aufs Handy."
          >
            {infos.map((i) => (
              <Zeile
                key={i.id}
                label={
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {i.angeheftet && (
                      <span className="shrink-0 text-brand-dark dark:text-brand" title="Ganz oben angeheftet">
                        <Icon name="pin" size={14} />
                      </span>
                    )}
                    <span className="line-clamp-1 [overflow-wrap:anywhere]">{i.titel}</span>
                  </span>
                }
                unter={<span className="line-clamp-2 [overflow-wrap:anywhere]">{i.text}</span>}
                onClick={() => setZeigId(i.id)}
              >
                <Wert>{kurzDatum(i.created_at)}</Wert>
              </Zeile>
            ))}
          </Gruppe>
        )}
      </div>
      <InfoNeuBlatt open={neu} onClose={() => setNeu(false)} />
      <InfoBlatt info={zeig} onClose={() => setZeigId(null)} />
    </ChatEbene>
  );
}

/** Neue Info für alle Eltern – Blatt mit Fußknopf (statt Formular in der Seite). */
function InfoNeuBlatt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { infoAnlegen } = useEltern();
  const [titel, setTitel] = useState("");
  const [text, setText] = useState("");
  const [anheften, setAnheften] = useState(false);
  const [sendet, setSendet] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitel("");
    setText("");
    setAnheften(false);
  }, [open]);

  async function veroeffentlichen() {
    // Doppeltipp: sonst entsteht die Info zweimal (und zwei Mitteilungen).
    if (sendet || !titel.trim() || !text.trim()) return;
    setSendet(true);
    try {
      await infoAnlegen(titel, text, anheften);
      onClose();
    } finally {
      setSendet(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Neue Info" unter="Für alle Eltern im Reiter Infos" onClose={onClose} />
      <Gruppe className="mt-0">
        <input
          className="block w-full bg-transparent px-4 py-3 text-[16px] font-semibold outline-none placeholder:font-normal placeholder:text-tinte-leise"
          placeholder="Überschrift, z. B. Termin Abiball"
          aria-label="Überschrift"
          value={titel}
          autoFocus
          onChange={(e) => setTitel(e.target.value)}
        />
        {/* in einer Hülle: ein Textfeld selbst kann keine Trennlinie (::before) tragen */}
        <div>
          <textarea
            className="block min-h-[7.5rem] w-full resize-y bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-tinte-leise"
            placeholder="Text …"
            aria-label="Text"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </Gruppe>
      <Gruppe fuss="Angeheftete Infos stehen bei den Eltern immer ganz oben.">
        <ZeileMitSchalter label="Ganz oben anheften">
          <Schalter an={anheften} onChange={setAnheften} label="Ganz oben anheften" />
        </ZeileMitSchalter>
      </Gruppe>
      <FussLeiste>
        <button className="btn-primary" disabled={!titel.trim() || !text.trim() || sendet} onClick={() => void veroeffentlichen()}>
          {sendet ? "Wird veröffentlicht …" : "Veröffentlichen"}
        </button>
      </FussLeiste>
    </Sheet>
  );
}

/** Eine veröffentlichte Info: ganzer Text, Löschen ganz unten (mit Rückfrage). */
function InfoBlatt({ info, onClose }: { info: ElternInfo | null; onClose: () => void }) {
  const { infoLoeschen } = useEltern();
  return (
    <Sheet open={Boolean(info)} onClose={onClose}>
      {info && (
        <>
          <SheetKopf
            titel={info.titel}
            unter={`Veröffentlicht am ${datumLang(info.created_at.slice(0, 10))}${info.angeheftet ? " · ganz oben angeheftet" : ""}`}
            onClose={onClose}
          />
          <Gruppe className="mt-0">
            <p className="whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed [overflow-wrap:anywhere]">{info.text}</p>
          </Gruppe>
          <Gruppe fuss="Die Info verschwindet auch bei allen Eltern.">
            <Zeile
              label="Info löschen"
              rot
              onClick={() =>
                void frage(`„${info.titel}" wirklich löschen?`, "Löschen", true).then((ok) => {
                  if (!ok) return;
                  void infoLoeschen(info.id);
                  onClose();
                })
              }
            />
          </Gruppe>
        </>
      )}
    </Sheet>
  );
}

/* ====================================================================== */
/* Gespräche mit Eltern                                                    */
/* ====================================================================== */

/** Eigene Ebene „Gespräche mit Eltern“ (aus der Kachel im Chats-Reiter) */
export function ElternGespraecheEbene({ onBack, glocke }: { onBack: () => void; glocke?: ReactNode }) {
  const { tickets, nachrichten } = useEltern();
  const absender = useAbsender();
  const istNeu = useIstNeu();
  const [neu, setNeu] = useState(false);
  const [offenId, setOffenId] = useState<string | null>(null);
  const offene = tickets.filter((t) => !t.erledigt);
  const erledigte = tickets.filter((t) => t.erledigt);
  const offen = offenId ? tickets.find((t) => t.id === offenId) ?? null : null;
  const zeile = (t: ElternTicket) => (
    <GespraechZeile
      key={t.id}
      ticket={t}
      wer={absender(t.user_id)}
      anzahl={nachrichten.filter((n) => n.ticket_id === t.id).length}
      neu={istNeu(t)}
      onOpen={() => setOffenId(t.id)}
    />
  );

  return (
    <ChatEbene
      label="Gespräche mit Eltern"
      start="oben"
      onSchliessen={onBack}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Icon name="rollen" size={17} strich={2.2} />}
          titel="Gespräche mit Eltern"
          unter={offene.length ? `${offene.length} offen` : "Nichts offen"}
          rechts={<PlusKnopf label="Eltern anschreiben" onClick={() => setNeu(true)} />}
        />
      }
    >
      <div className="py-4">
        {offene.length === 0 ? (
          <Leer
            icon="rollen"
            text={
              tickets.length
                ? "Gerade ist nichts offen. Mit „+“ oben rechts schreibst du ein Elternhaus an."
                : "Bisher hat niemand etwas gefragt. Mit „+“ oben rechts schreibst du ein Elternhaus an."
            }
          />
        ) : (
          <Gruppe className="" titel="Offen">
            {offene.map(zeile)}
          </Gruppe>
        )}

        {erledigte.length > 0 && (
          <details className="group mt-6">
            <summary className="auf-bild flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-tinte-leise [&::-webkit-details-marker]:hidden">
              Erledigt ({erledigte.length})
              <span className="transition group-open:rotate-90" aria-hidden>
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <div className="gruppe-zellen mt-1">{erledigte.map(zeile)}</div>
          </details>
        )}

        {glocke}
      </div>

      <AnElternBlatt open={neu} onClose={() => setNeu(false)} />
      {/* Ein geöffnetes Gespräch liegt als eigener Chat darüber – Zurück führt in die Liste */}
      {offen && <ElternGespraech key={offen.id} ticket={offen} wer={absender(offen.user_id)} onBack={() => setOffenId(null)} />}
    </ChatEbene>
  );
}

/** Eine Zeile in der Liste der Gespräche: Kreis, Betreff, wer · wie viele Nachrichten, roter Punkt bei Neuem. */
function GespraechZeile({
  ticket, wer, anzahl, neu, onOpen,
}: { ticket: ElternTicket; wer: string; anzahl: number; neu: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[60px] w-full min-w-0 items-center gap-3 px-4 py-2 text-left transition active:bg-black/[0.04] dark:active:bg-white/[0.06]"
    >
      <Avatar userId={ticket.user_id} name={wer.split(" · ")[0]} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-semibold">{ticket.betreff}</span>
        <span className="block truncate text-[12.5px] text-tinte-leise">
          {wer} · {anzahl} {anzahl === 1 ? "Nachricht" : "Nachrichten"}
        </span>
      </span>
      {neu && (
        <span className="flex h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[12px] font-bold text-white">neu</span>
      )}
      {ticket.erledigt && (
        <span className="text-[#248A3D] dark:text-[#30D158]">
          <Icon name="haken" size={16} strich={2.6} />
        </span>
      )}
      <span aria-hidden className="shrink-0 text-[17px] leading-none text-tinte-leise">›</span>
    </button>
  );
}

/**
 * Ein Gespräch mit einem Elternhaus als Chat (wie die Gespräche mit Schülern):
 * oben Betreff und Familie, rechts „Erledigt“ und „…“ (Löschen im Blatt),
 * unten die Eingabe.
 */
function ElternGespraech({ ticket, wer, onBack }: { ticket: ElternTicket; wer: string; onBack: () => void }) {
  const { nachrichten, antworten, ticketSchliessen, ticketLoeschen, alsGelesen } = useEltern();
  const { uid } = useRole();
  const { profile } = useProfiles();
  const [text, setText] = useState("");
  const [mehr, setMehr] = useState(false);
  const verlauf = useMemo(
    () => nachrichten.filter((n) => n.ticket_id === ticket.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [nachrichten, ticket.id],
  );
  const letzte = verlauf[verlauf.length - 1];
  const ende = useChatEndeIn(verlauf.length, Boolean(letzte && letzte.user_id === uid));

  // Gelesen, sobald man es sieht – und bei jeder neuen Nachricht, solange es offen ist
  useEffect(() => {
    alsGelesen(ticket.id);
  }, [ticket.id, verlauf.length, alsGelesen]);

  const senden = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void antworten(ticket.id, t);
  };
  const name = (userId: string) => (userId === uid ? "Du" : profile[userId]?.anzeigename || "Eltern");
  const zeit = (iso: string) => {
    const d = new Date(iso);
    const heute = d.toDateString() === new Date().toDateString();
    return heute
      ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <ChatEbene
      label={ticket.betreff}
      onSchliessen={onBack}
      kopf={
        <ChatKopf
          onBack={onBack}
          symbol={<Avatar userId={ticket.user_id} name={wer.split(" · ")[0]} size={32} />}
          titel={ticket.betreff}
          unter={ticket.erledigt ? `Erledigt · ${wer}` : wer}
          rechts={
            <GespraechKnoepfe
              erledigt={ticket.erledigt}
              onErledigt={() => void ticketSchliessen(ticket.id, !ticket.erledigt)}
              onMehr={() => setMehr(true)}
            />
          }
        />
      }
      fuss={<ChatEingabe wert={text} setWert={setText} onSenden={senden} platzhalter="Antwort ans Elternhaus" />}
    >
      <div className="space-y-2 py-3">
        {verlauf.length === 0 && <p className="auf-bild py-8 text-center text-[14px] text-tinte-leise">Noch keine Nachricht.</p>}
        {verlauf.map((n) => {
          const meins = n.user_id === uid;
          return (
            <div key={n.id} className={`flex ${meins ? "justify-end" : "justify-start"}`}>
              <div
                className={`min-w-0 max-w-[78%] rounded-2xl px-3.5 py-2 sm:max-w-[65%] lg:max-w-[50%] ${
                  meins ? "bg-brand text-white" : "bg-white shadow-card dark:bg-slate-900 dark:shadow-cardDark"
                }`}
              >
                <div className={`mb-0.5 text-[12px] font-bold leading-tight ${meins ? "text-right text-white/90" : "text-tinte-leise"}`}>{name(n.user_id)}</div>
                <div className="whitespace-pre-wrap text-[15px] leading-snug [overflow-wrap:anywhere]">{n.text}</div>
                <div className={`mt-0.5 text-right text-[12px] ${meins ? "text-white/90" : "text-tinte-leise"}`}>{zeit(n.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={ende} />
      </div>
      <GespraechMehrBlatt
        open={mehr}
        onClose={() => setMehr(false)}
        titel={ticket.betreff}
        unter={ticket.erledigt ? `Erledigt · ${wer}` : wer}
        erledigt={ticket.erledigt}
        onErledigt={() => void ticketSchliessen(ticket.id, !ticket.erledigt)}
        loeschen={{
          frage: `Das Gespräch „${ticket.betreff}" endgültig löschen?\n\nAlle Nachrichten darin verschwinden – auch für die Eltern.`,
          fuss: "Alle Nachrichten darin verschwinden – auch für die Eltern.",
          onLoeschen: () => {
            void ticketLoeschen(ticket.id);
            onBack();
          },
        }}
      />
    </ChatEbene>
  );
}

/**
 * Ein bestimmtes Elternhaus anschreiben – im Blatt: erst die Familie suchen,
 * dann Betreff und Text, unten „Senden“. Die Eltern sehen das Gespräch danach
 * in ihrem Reiter Infos und bekommen eine Benachrichtigung.
 */
function AnElternBlatt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { konten, anEltern } = useEltern();
  const { students } = useStore();
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSuche("");
    setGewaehlt(null);
    setBetreff("");
    setText("");
    setFehler("");
  }, [open]);

  const kindNamen = (ids: string[]) =>
    ids
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => `${s!.vorname} ${s!.nachname}`)
      .join(" und ");

  const q = normalize(suche);
  const treffer: Elternkonto[] = konten
    .filter((k) => !q || normalize(`${k.anzeigename} ${k.username} ${kindNamen(k.kinder)}`).includes(q))
    .slice(0, 30);
  const ziel = konten.find((k) => k.user_id === gewaehlt);

  async function senden() {
    if (!ziel || busy || !betreff.trim() || !text.trim()) return;
    setBusy(true);
    const problem = await anEltern(ziel.user_id, betreff, text);
    setBusy(false);
    if (problem) return setFehler(problem);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Eltern anschreiben" unter="Kommt bei den Eltern im Reiter Infos an – mit Mitteilung." onClose={onClose} />
      {!ziel ? (
        <>
          <input className="field" placeholder="Familie oder Kind suchen …" value={suche} autoFocus onChange={(e) => setSuche(e.target.value)} />
          <div className="gruppe-zellen mt-3 max-h-[50vh] overflow-y-auto">
            {konten.length === 0 ? (
              <p className="px-4 py-3 text-[14px] text-tinte-leise">Es gibt noch keine Elternzugänge.</p>
            ) : treffer.length === 0 ? (
              <p className="px-4 py-3 text-[14px] text-tinte-leise">Niemand gefunden.</p>
            ) : (
              treffer.map((k) => (
                <Zeile
                  key={k.user_id}
                  label={k.anzeigename}
                  unter={kindNamen(k.kinder) || k.username}
                  symbol={<Avatar userId={k.user_id} name={k.anzeigename} size={28} />}
                  onClick={() => setGewaehlt(k.user_id)}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <Gruppe className="mt-0">
            <Zeile
              label={<span className="font-semibold">{ziel.anzeigename}</span>}
              unter={kindNamen(ziel.kinder) || undefined}
              symbol={<Avatar userId={ziel.user_id} name={ziel.anzeigename} size={28} />}
              onClick={() => setGewaehlt(null)}
              ohnePfeil
            >
              <span className="text-[15px] text-brand-dark dark:text-brand">Ändern</span>
            </Zeile>
          </Gruppe>
          <Gruppe
            fuss={fehler ? <span className="font-semibold text-amber-700 dark:text-amber-400">{fehler}</span> : undefined}
          >
            <input
              className="block w-full bg-transparent px-4 py-3 text-[16px] font-semibold outline-none placeholder:font-normal placeholder:text-tinte-leise"
              placeholder="Betreff"
              aria-label="Betreff"
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
            />
            <div>
              <textarea
                className="block min-h-[7.5rem] w-full resize-y bg-transparent px-4 py-3 text-[16px] outline-none placeholder:text-tinte-leise"
                placeholder="Ihre Nachricht …"
                aria-label="Nachricht"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </Gruppe>
          <FussLeiste>
            <button className="btn-primary" disabled={busy || !betreff.trim() || !text.trim()} onClick={() => void senden()}>
              {busy ? "Wird gesendet …" : "Senden"}
            </button>
          </FussLeiste>
        </>
      )}
    </Sheet>
  );
}
