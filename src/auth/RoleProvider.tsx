import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";

export type Role = "schueler" | "stufenteam" | "kassenwart" | "admin";

export interface Profile {
  user_id: string;
  username: string | null;
  role: Role;
  student_id: string | null;
  has_logged_in: boolean;
}

interface RoleCtx {
  role: Role;
  ready: boolean;
  isAdmin: boolean;
  isStaff: boolean; // sieht alle Daten (stufenteam/kassenwart/admin)
  canEditData: boolean; // Namen/Beteiligungen/Personen (stufenteam+)
  canEditBeitrag: boolean; // bezahlt/offen/erlassen (nur kassenwart/admin)
  canManageRoles: boolean; // admin
  profiles: Profile[];
  loginByStudent: Record<string, boolean>;
  setRole: (userId: string, role: Role) => Promise<void>;
  refreshProfiles: () => void;
}

const Ctx = createContext<RoleCtx | null>(null);
export const useRole = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRole outside provider");
  return v;
};

const STAFF: Role[] = ["stufenteam", "kassenwart", "admin"];

export function RoleProvider({ children }: { children: ReactNode }) {
  // Lokaler Modus (ohne Supabase): voller Zugriff zum Entwickeln/Testen.
  const [role, setRoleState] = useState<Role>(hasSupabase ? "schueler" : "admin");
  const [ready, setReady] = useState(!hasSupabase);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const loadProfiles = useCallback(async (asStaff: boolean) => {
    if (!hasSupabase || !asStaff) return;
    const { data } = await supabase!.from("profiles").select("*");
    setProfiles((data as Profile[]) || []);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    const load = async () => {
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) {
        if (alive) setReady(true);
        return;
      }
      const { data: me } = await supabase!.from("profiles").select("role").eq("user_id", uid).maybeSingle();
      const r = (me?.role as Role) || "schueler";
      if (!alive) return;
      setRoleState(r);
      setReady(true);
      // eigenen Login-Status markieren
      void supabase!.from("profiles").update({ has_logged_in: true }).eq("user_id", uid);
      void loadProfiles(STAFF.includes(r));
    };
    void load();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setReady(false);
        setProfiles([]);
        void load();
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfiles]);

  const setRole = useCallback(
    async (userId: string, r: Role) => {
      if (!hasSupabase) return;
      const { error } = await supabase!.from("profiles").update({ role: r }).eq("user_id", userId);
      if (error) {
        alert("Rolle ändern fehlgeschlagen: " + error.message);
        return;
      }
      setProfiles((prev) => prev.map((p) => (p.user_id === userId ? { ...p, role: r } : p)));
    },
    [],
  );

  const isStaff = STAFF.includes(role);
  const loginByStudent: Record<string, boolean> = {};
  for (const p of profiles) if (p.student_id) loginByStudent[p.student_id] = p.has_logged_in;

  const value: RoleCtx = {
    role,
    ready,
    isAdmin: role === "admin",
    isStaff,
    canEditData: isStaff,
    canEditBeitrag: role === "kassenwart" || role === "admin",
    canManageRoles: role === "admin",
    profiles,
    loginByStudent,
    setRole,
    refreshProfiles: () => loadProfiles(isStaff),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
