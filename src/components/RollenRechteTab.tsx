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
        // Segment wie in iOS (.seg) – gleiche Optik wie überall in der App
        <div className="seg mb-4" role="tablist">
          {(["rollen", "rechte"] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={zeige === a}
              data-ansicht={a}
              onClick={() => setAnsicht(a)}
              className={`seg-item !py-[7px] !text-[14px] ${zeige === a ? "seg-aktiv" : ""}`}
            >
              {a === "rollen" ? "Personen" : "Rechte je Rolle"}
            </button>
          ))}
        </div>
      )}
      <div key={zeige} className="animate-fadeIn">
        {zeige === "rollen" ? <RolesTab /> : <PermissionsTab />}
      </div>
    </div>
  );
}
