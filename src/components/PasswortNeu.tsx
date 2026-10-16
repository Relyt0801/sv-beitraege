import { useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { Icon } from "./Icon";
import { Gruppe, Zeile } from "./Liste";
import { useRole } from "../auth/RoleProvider";
import { hasSupabase, supabase } from "../lib/supabase";
import { frage, melde, meldeFehler } from "../lib/melder";

/**
 * Admin: neues Startpasswort für ein Konto erzeugen.
 *
 * Läuft über die Edge Function person-anlegen (passwort_neu_fuer): nur der
 * Admin darf das, das geschützte Konto nie. Das neue Passwort wird genau
 * einmal angezeigt und nirgends gespeichert; beim nächsten Anmelden muss die
 * Person es ändern. Im Protokoll steht, wer es wann zurückgesetzt hat.
 */
export function usePasswortNeu() {
  const { isAdmin, isOp, opUserId } = useRole();
  const darf = (isAdmin || isOp) && hasSupabase;
  const [ergebnis, setErgebnis] = useState<null | { name: string; username: string; passwort: string }>(null);
  const [busy, setBusy] = useState(false);

  async function zuruecksetzen(userId: string, name: string) {
    if (!darf || userId === opUserId) return;
    const ok = await frage(
      `Neues Passwort für ${name} erzeugen?\n\nDas alte Passwort gilt danach nicht mehr. ${name} muss das neue beim nächsten Anmelden ändern.`,
      "Erzeugen",
      true,
    );
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase!.functions.invoke("person-anlegen", { body: { passwort_neu_fuer: userId } });
    setBusy(false);
    const d = data as { ok?: boolean; username?: string; passwort?: string; error?: string } | null;
    if (error || !d?.ok || !d.passwort) {
      let text = d?.error || error?.message || "unbekannter Fehler";
      // Fehlertext aus der Antwort der Function holen
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          text = ((await ctx.json()) as { error?: string }).error || text;
        } catch {
          /* kein JSON */
        }
      }
      return meldeFehler("Ging nicht: " + text);
    }
    setErgebnis({ name, username: d.username || "", passwort: d.passwort });
  }

  const anzeige = (
    <Sheet open={ergebnis !== null} onClose={() => setErgebnis(null)}>
      {ergebnis && (
        <>
          <SheetKopf titel="Neues Passwort" unter={`Für ${ergebnis.name}. Wird nur jetzt angezeigt – danach nirgends mehr.`} onClose={() => setErgebnis(null)} />
          <Gruppe className="">
            <Zeile label="Nutzername">
              <span className="select-all font-mono text-[15px]">{ergebnis.username}</span>
            </Zeile>
            <Zeile label="Passwort">
              <span className="select-all font-mono text-[16px] font-semibold">{ergebnis.passwort}</span>
            </Zeile>
          </Gruppe>
          <button
            className="btn-grau mt-4"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${ergebnis.username}\n${ergebnis.passwort}`);
                melde("Kopiert", "erfolg");
              } catch {
                meldeFehler("Kopieren ging nicht – bitte abschreiben.");
              }
            }}
          >
            Kopieren
          </button>
          <p className="mt-3 px-1 text-[13px] leading-snug text-tinte-leise">
            Gib es der Person persönlich weiter. Sie muss es beim nächsten Anmelden durch ein eigenes ersetzen.
          </p>
          <button className="btn-primary mt-4" onClick={() => setErgebnis(null)}>
            Fertig
          </button>
        </>
      )}
    </Sheet>
  );

  return { darf, busy, zuruecksetzen, anzeige };
}

/** Knopf „Neues Passwort generieren“ – erscheint nur beim Admin */
export function PasswortNeuKnopf({ userId, name, className = "" }: { userId: string | null | undefined; name: string; className?: string }) {
  const { darf, busy, zuruecksetzen, anzeige } = usePasswortNeu();
  const { opUserId, uid } = useRole();
  if (!darf || !userId || userId === opUserId || userId === uid) return null;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void zuruecksetzen(userId, name)}
        className={`btn-grau gap-2 ${className}`}
      >
        <Icon name="schluessel" size={17} />
        {busy ? "Wird erzeugt …" : "Neues Passwort generieren"}
      </button>
      {anzeige}
    </>
  );
}
