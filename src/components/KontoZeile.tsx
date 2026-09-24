import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { rolleName } from "../lib/permissions";
import type { Profile } from "../auth/RoleProvider";
import type { Student } from "../lib/types";

/**
 * Wie eine Person in den Verwaltungslisten steht – im Rollen-Reiter genauso
 * wie im Rechte-Reiter.
 *
 * Immer dieselben drei Dinge: Namenskreis, "Nachname, Vorname" und darunter
 * der Nutzername mit der Rolle. Wer noch keiner Person zugeordnet ist, steht
 * mit dem Nutzernamen oben und einem Hinweis darunter.
 */
export function KontoZeile({
  profil,
  student,
  punkt,
  rechts,
  hinweis,
  hinweisWarnt,
}: {
  profil: Profile;
  /** Die zugeordnete Person, falls es eine gibt. */
  student?: Student | null;
  /** Grüner Punkt: eigenes Passwort gesetzt. Ohne Angabe kein Punkt. */
  punkt?: boolean;
  /** Was rechts steht, zum Beispiel eine Anzahl oder ein Pfeil. */
  rechts?: React.ReactNode;
  /**
   * Ersetzt das "keiner Person zugeordnet" in der zweiten Zeile. Fuer
   * Elternzugaenge, die ueber parent_children an ihrem Kind haengen und
   * nicht ueber student_id.
   */
  hinweis?: string;
  /** Hinweis in Orange – etwa bei einem Elternzugang ohne Kind. */
  hinweisWarnt?: boolean;
}) {
  const name = student ? `${student.nachname}, ${student.vorname}` : null;

  return (
    <div className="flex items-center gap-3">
      {punkt !== undefined && (
        <span
          title={punkt ? "hat ein eigenes Passwort gesetzt" : "nutzt noch das Startpasswort"}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            punkt ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
          }`}
        />
      )}
      <Avatar userId={profil.user_id} name={name ?? profil.username ?? ""} size={38} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em]">
          {name ?? profil.username ?? "Unbekannt"}
        </div>
        <div className="mt-0.5 truncate text-[13px] leading-tight text-tinte-leise">
          {name ? (
            `${profil.username} · ${rolleName(profil.role)}`
          ) : (
            <>
              {rolleName(profil.role)} ·{" "}
              <span className={hinweisWarnt ? "font-medium text-offen" : ""}>{hinweis ?? "keiner Person zugeordnet"}</span>
            </>
          )}
        </div>
      </div>
      {rechts}
    </div>
  );
}

/** Das Suchfeld über den Listen – überall gleich. */
export function Suchfeld({
  wert,
  onChange,
  platzhalter = "Person oder Konto suchen …",
}: {
  wert: string;
  onChange: (v: string) => void;
  platzhalter?: string;
}) {
  return (
    <div className="mb-3 flex h-11 items-center gap-2 rounded-xl bg-[rgb(118_118_128/0.12)] px-3 dark:bg-[rgb(118_118_128/0.24)]">
      <span className="text-tinte-leise">
        <Icon name="lupe" size={17} />
      </span>
      <input
        className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-tinte-leise"
        placeholder={platzhalter}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
      />
      {wert && (
        <button onClick={() => onChange("")} aria-label="Suche leeren" className="px-1 text-tinte-leise">
          ✕
        </button>
      )}
    </div>
  );
}
