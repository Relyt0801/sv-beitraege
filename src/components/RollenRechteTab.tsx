import { useState } from "react";
import { useRole } from "../auth/RoleProvider";
import { RolesTab } from "./RolesTab";
import { PermissionsTab } from "./PermissionsTab";
import { InKopf } from "./InKopf";

/**
 * Rollen und Rechte in einem Reiter. Oben ein Umschalter wie in iOS:
 *  - Rollen: alle Personen – Rolle, Komitees, Sperre; Person antippen öffnet
 *    ihre einzelnen Rechte (Ausnahmen)
 *  - Rechte: was jede Rolle darf, nach Bereichen zugeklappt
 * Vorher gab es die Personenliste zweimal (in Rollen und in Rechte).
 */
type Ansicht = "rollen" | "rechte";

/*
 * Die Wahl bleibt beim Reiterwechsel stehen (wie in iOS: nur erneutes
 * Antippen des Reiters führt zur Wurzel). Der Reiter wird beim Wechsel
 * ausgehängt (<main key={tab}>), darum merken wir sie in sessionStorage –
 * gilt bis zum Schließen des Tabs. Ohne Speicher (privates Fenster): einfach
 * der Anfang.
 */
const MERKER = "sv:rollen-ansicht";
function gemerkt(): Ansicht | null {
  try {
    const w = sessionStorage.getItem(MERKER);
    return w === "rollen" || w === "rechte" ? w : null;
  } catch {
    return null;
  }
}
function merken(a: Ansicht) {
  try {
    sessionStorage.setItem(MERKER, a);
  } catch {
    /* ohne Speicher: nur für diesen Besuch des Reiters */
  }
}

export function RollenRechteTab() {
  const { canManageRoles, can } = useRole();
  const darfRechte = can("perms.manage");
  const [ansicht, setAnsicht] = useState<Ansicht>(() => gemerkt() ?? (canManageRoles ? "rollen" : "rechte"));
  const beide = canManageRoles && darfRechte;
  const zeige = beide ? ansicht : canManageRoles ? "rollen" : "rechte";

  return (
    <div>
      {beide && (
        // Segment wie in iOS (.seg) – gleiche Optik wie überall in der App.
        // Am Rechner rechts in der Kopfzeile (InKopf), am Handy hier oben.
        <InKopf className="mb-4" kopfClassName="w-[19rem]">
        <div className="seg w-full" role="tablist" aria-label="Rollen und Rechte">
          {(["rollen", "rechte"] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={zeige === a}
              data-ansicht={a}
              onClick={() => {
                merken(a);
                setAnsicht(a);
              }}
              className={`seg-item whitespace-nowrap !py-[7px] !text-[14px] lg:!py-1.5 lg:!text-[13px] ${zeige === a ? "seg-aktiv" : ""}`}
            >
              {a === "rollen" ? "Personen" : "Rechte je Rolle"}
            </button>
          ))}
        </div>
        </InKopf>
      )}
      <div key={zeige} className="animate-fadeIn">
        {zeige === "rollen" ? <RolesTab /> : <PermissionsTab />}
      </div>
    </div>
  );
}
