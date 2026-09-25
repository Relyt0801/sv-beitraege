import { useEffect, useState } from "react";
import { Sheet, SheetKopf } from "./Sheet";
import { aboLink, fremdLink, fremdLinkSetzen, fremdeNeuLaden, usePrivatTermine, type AboLink } from "../lib/kalender-sync";
import { melde, meldeFehler } from "../lib/melder";
import { tagLang, zeitText, type Termin } from "../lib/termine";

/**
 * "Mit deinem Kalender verbinden" – TESTPHASE, nur für die Testkonten.
 *
 * Oben: die Termine der Stufe als Abo im eigenen Kalender.
 * Unten: den eigenen Kalender (iCloud/Google/Outlook) grau in der App zeigen.
 */
export function KalenderSyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [link, setLink] = useState<AboLink | null>(null);
  const [linkFehler, setLinkFehler] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [eingabe, setEingabe] = useState(fremdLink());
  const [busy, setBusy] = useState(false);
  const privat = usePrivatTermine(open);

  useEffect(() => {
    if (!open) return;
    setKopiert(false);
    setEingabe(fremdLink());
    if (link) return;
    void aboLink().then(({ link: l, fehler }) => {
      if (l) setLink(l);
      else setLinkFehler(fehler || "Der Link ließ sich nicht holen.");
    });
  }, [open, link]);

  async function kopieren() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.https);
      setKopiert(true);
    } catch {
      melde(link.https);
    }
  }

  async function uebernehmen() {
    setBusy(true);
    const f = await fremdLinkSetzen(eingabe);
    setBusy(false);
    if (f) meldeFehler(f);
    else if (eingabe.trim()) melde("Dein Kalender ist verbunden.", "erfolg");
  }

  const gespeichert = fremdLink();

  return (
    <Sheet open={open} onClose={onClose}>
      <SheetKopf titel="Mit deinem Kalender verbinden" unter="Testphase – nur für dieses Konto sichtbar" onClose={onClose} />

      {/* ---------------------------------------------- App → Handy */}
      <section className="rounded-2xl bg-papier-matt p-4 dark:bg-slate-800/70">
        <h3 className="text-[15px] font-bold">Termine der Stufe in deinem Kalender</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
          Einmal abonnieren: Neue und geänderte Termine kommen danach von selbst in deinen Handy-Kalender. Du siehst
          dort genau die Termine, die du auch hier siehst.
        </p>
        {linkFehler ? (
          <p className="mt-3 text-[13px] font-semibold text-offen">{linkFehler}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <a
              href={link?.webcal || undefined}
              aria-disabled={!link}
              className={`btn-primary !text-[16px] ${link ? "" : "pointer-events-none opacity-40"}`}
            >
              Im iPhone-Kalender abonnieren
            </a>
            <button onClick={kopieren} disabled={!link} className="btn-grau !text-[16px]">
              {kopiert ? "✓ Link kopiert" : "Link kopieren (Google, Outlook)"}
            </button>
          </div>
        )}
        <details className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
          <summary className="cursor-pointer font-semibold">So geht&apos;s bei Google und Outlook</summary>
          <p className="mt-1.5">
            <b>Google Kalender</b> (am Computer): links bei „Weitere Kalender“ auf ＋ → „Per URL“ → Link einfügen.
            <br />
            <b>Outlook</b>: „Kalender hinzufügen“ → „Aus dem Internet abonnieren“ → Link einfügen.
            <br />
            Der Link gehört nur dir. Wer ihn hat, sieht deine Termine – also nicht weitergeben.
          </p>
        </details>
      </section>

      {/* ---------------------------------------------- Handy → App */}
      <section className="mt-3 rounded-2xl bg-papier-matt p-4 dark:bg-slate-800/70">
        <h3 className="text-[15px] font-bold">Deinen Kalender hier anzeigen</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-tinte-matt dark:text-slate-300">
          Deine eigenen Termine erscheinen grau im Kalender der App – so siehst du Zusammenstöße sofort. Nur du siehst
          sie, und nur auf diesem Gerät.
        </p>
        <label className="mt-3 block text-[12px] font-semibold text-tinte-leise" htmlFor="fremd-link">
          iCal-Link deines Kalenders
        </label>
        <input
          id="fremd-link"
          className="field mt-1"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="webcal://p…-caldav.icloud.com/published/…"
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={uebernehmen} disabled={busy || eingabe.trim() === gespeichert} className="btn-primary !min-h-[2.75rem] !text-[15px]">
            {busy ? "Lädt …" : "Übernehmen"}
          </button>
          <button
            onClick={async () => {
              if (!gespeichert) return;
              setBusy(true);
              const f = await fremdeNeuLaden();
              setBusy(false);
              if (f) meldeFehler(f);
            }}
            disabled={busy || !gespeichert}
            className="btn-grau !min-h-[2.75rem] !text-[15px]"
          >
            Neu laden
          </button>
        </div>
        {gespeichert && privat.zeit && (
          <p className="mt-2 text-[12px] text-tinte-leise">
            {privat.name ? `„${privat.name}“ · ` : ""}
            {privat.termine.length} Termine · zuletzt{" "}
            {new Date(privat.zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <button
              className="font-semibold text-offen underline"
              onClick={async () => {
                setEingabe("");
                await fremdLinkSetzen("");
                melde("Dein Kalender wird hier nicht mehr angezeigt.");
              }}
            >
              trennen
            </button>
          </p>
        )}
        <details className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
          <summary className="cursor-pointer font-semibold">Wo finde ich den Link?</summary>
          <p className="mt-1.5">
            <b>iPhone (iCloud)</b>: Kalender-App → unten „Kalender“ → ⓘ neben deinem Kalender → „Öffentlicher
            Kalender“ einschalten → „Link teilen …“ → Kopieren.
            <br />
            <b>Google</b>: Kalender-Einstellungen → deinen Kalender wählen → „Privatadresse im iCal-Format“.
            <br />
            <b>Outlook</b>: Einstellungen → Kalender → „Freigegebene Kalender“ → „Kalender veröffentlichen“ → ICS-Link.
            <br />
            Wer diesen Link hat, kann deinen Kalender lesen. Er bleibt nur auf deinem Handy gespeichert.
          </p>
        </details>
      </section>

      <p className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
        Ändern geht jeweils nur dort, wo ein Termin herkommt: Stufen-Termine hier in der App, eigene Termine in deinem
        Kalender. Das iPhone schaut etwa stündlich nach neuen Stufen-Terminen (Einstellungen → Kalender → Accounts →
        Datenabgleich).
      </p>

      <button className="btn-primary mt-4" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}

/** Ein Termin aus dem eigenen Kalender – nur ansehen, ändern geht nur dort. */
export function PrivatTerminSheet({ termin, onClose }: { termin: Termin | null; onClose: () => void }) {
  if (!termin) return null;
  const mehrtaegig = termin.bis_datum && termin.bis_datum !== termin.datum;
  return (
    <Sheet open onClose={onClose}>
      <SheetKopf titel={`📱 ${termin.titel}`} unter="Aus deinem eigenen Kalender" onClose={onClose} />
      <dl className="grid grid-cols-1 gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
          <dt className="w-20 shrink-0 text-[12px] font-semibold text-tinte-leise">Wann</dt>
          <dd className="min-w-0 flex-1 text-[14px] font-semibold">
            {tagLang(termin.datum)}
            {mehrtaegig ? ` bis ${tagLang(termin.bis_datum!)}` : ""}
          </dd>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
          <dt className="w-20 shrink-0 text-[12px] font-semibold text-tinte-leise">Uhrzeit</dt>
          <dd className="min-w-0 flex-1 text-[14px] font-semibold">{zeitText(termin)}</dd>
        </div>
        {termin.ort && (
          <div className="flex items-center gap-2 rounded-xl bg-papier-matt px-3 py-2.5 dark:bg-slate-800">
            <dt className="w-20 shrink-0 text-[12px] font-semibold text-tinte-leise">Ort</dt>
            <dd className="min-w-0 flex-1 text-[14px] font-semibold">{termin.ort}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-tinte-leise">
        Nur du siehst diesen Termin hier, und nur auf diesem Gerät. Ändern oder löschen kannst du ihn in deinem
        Kalender – beim nächsten Laden ist er hier auch geändert.
      </p>
      <button className="btn-primary mt-4" onClick={onClose}>
        Fertig
      </button>
    </Sheet>
  );
}
