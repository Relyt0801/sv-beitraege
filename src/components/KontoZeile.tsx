import { Avatar } from "./Avatar";
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
        <div className="truncate text-[15px] font-semibold leading-tight">
          {name ?? profil.username ?? "Unbekannt"}
        </div>
        <div className="truncate text-[12px] leading-tight text-tinte-leise">
          {name
            ? `${profil.username} · ${rolleName(profil.role)}`
            : `${rolleName(profil.role)} · ${hinweis ?? "keiner Person zugeordnet"}`}
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
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-papier-linie bg-white px-3.5 py-2.5 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:shadow-cardDark">
      <span className="text-tinte-leise">🔍</span>
      <input
        className="w-full bg-transparent text-base outline-none placeholder:text-tinte-leise"
        placeholder={platzhalter}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
