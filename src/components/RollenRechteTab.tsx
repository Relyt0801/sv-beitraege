import { useState } from "react";
import { useRole } from "../auth/RoleProvider";
import { RolesTab } from "./RolesTab";
import { PermissionsTab } from "./PermissionsTab";

/**
 * Rollen und Rechte in einem Reiter. Oben ein Umschalter wie in iOS:
 *  - Rollen: alle Personen – Rolle, Komitees, Sperre; Person antippen öffnet
 *    ihre einzelnen Rechte (Ausnahmen)
 *  - Rechte: was jede Rolle darf, nach Bereichen zugeklappt
 * Vorher gab es die Personenliste zweimal (in Rollen und in Rechte).
 */
export function RollenRechteTab() {
  const { canManageRoles, can } = useRole();
  const darfRechte = can("perms.manage");
  const [ansicht, setAnsicht] = useState<"rollen" | "rechte">(canManageRoles ? "rollen" : "rechte");
  const beide = canManageRoles && darfRechte;
  const zeige = beide ? ansicht : canManageRoles ? "rollen" : "rechte";

  return (
    <div>
      {beide && (
        <div className="mb-3 grid grid-cols-2 gap-0.5 rounded-xl bg-[rgb(118_118_128/0.12)] p-0.5 dark:bg-[rgb(118_118_128/0.24)]" role="tablist">
          {(["rollen", "rechte"] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={zeige === a}
              onClick={() => setAnsicht(a)}
              className={`rounded-[10px] py-2 text-[14px] font-semibold transition ${
                zeige === a ? "bg-white text-tinte shadow-sm dark:bg-slate-600 dark:text-white" : "text-tinte-matt dark:text-slate-300"
              }`}
            >
              {a === "rollen" ? "Rollen" : "Rechte"}
            </button>
          ))}
        </div>
      )}
      {zeige === "rollen" ? <RolesTab /> : <PermissionsTab />}
    </div>
  );
}
