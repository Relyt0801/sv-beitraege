import { useEffect, useState } from "react";
import { useRole } from "../auth/RoleProvider";
import { ladeAnfragen, sperrText, stelleAnfrage } from "../lib/unban";

/** Sperr-Hinweis mit der Möglichkeit, die Sperre einmal anzufechten. */
export function BannHinweis() {
  const { bannedUntil, bannPermanent } = useRole();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [err, setErr] = useState("");
  const [schonGestellt, setSchonGestellt] = useState(false);

  useEffect(() => {
    void ladeAnfragen().then((rs) => setSchonGestellt(rs.length > 0));
  }, []);

  return (
    <div className="rounded-2xl border border-red-300 bg-red-500/10 p-4 dark:border-red-500/40">
      <div className="text-sm font-bold text-red-500">
        🚫 Du bist {sperrText(bannedUntil, bannPermanent)}
      </div>
      <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
        Solange kannst du nichts schreiben und nicht abstimmen. Mitlesen geht weiter.
      </p>

      {gesendet || schonGestellt ? (
        <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-semibold text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          Deine Anfrage liegt beim Stufenteam. Du bekommst Bescheid.
        </div>
      ) : offen ? (
        <div className="mt-3">
          <textarea
            rows={2}
            autoFocus
            maxLength={300}
            className="field mb-2 resize-none"
            placeholder="Kurz: Warum sollte die Sperre aufgehoben werden?"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {err && <div className="mb-2 text-xs font-semibold text-red-500">{err}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => setOffen(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-600"
            >
              Abbrechen
            </button>
            <button
              onClick={async () => {
                const r = await stelleAnfrage(text);
                if (r.ok) setGesendet(true);
                else setErr(r.error || "Das hat nicht geklappt.");
              }}
              disabled={!text.trim()}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Anfrage senden
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOffen(true)}
          className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-500"
        >
          Sperre anfechten
        </button>
      )}
    </div>
  );
}
