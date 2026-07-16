import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";

export type Role = "schueler" | "stufenteam" | "kassenwart" | "admin";

export interface Profile {
  user_id: string;
  username: string | null;
  role: Role;
  student_id: string | null;
  has_logged_in: boolean;
  chat_banned_until: string | null;
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
  banned: boolean;
  bannedUntil: string | null;
  setRole: (userId: string, role: Role) => Promise<void>;
  setBan: (userId: string, until: string | null) => Promise<void>;
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
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);

  const loadProfiles = useCallback(async (asStaff: boolean) => {
    if (!hasSupabase || !asStaff) return;
    const { data } = await supabase!.from("profiles").select("*");
    setProfiles((data as Profile[]) || []);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let uid: string | undefined;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    const subscribe = () => {
      if (channel) return;
      // Live-Erkennung: Rollen-/Profiländerungen sofort übernehmen (kein Reload nötig).
      channel = supabase!
        .channel("sv-profiles")
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
          if (p.eventType === "DELETE") {
            const old = p.old as Partial<Profile>;
            setProfiles((prev) => prev.filter((x) => x.user_id !== old.user_id));
            return;
          }
          const row = p.new as Profile;
          if (row.user_id === uid) {
            setRoleState(row.role); // eigene Rolle live
            setBannedUntil(row.chat_banned_until ?? null); // Sperre live
            if (STAFF.includes(row.role)) void loadProfiles(true);
          }
          setProfiles((prev) => {
            const i = prev.findIndex((x) => x.user_id === row.user_id);
            if (i === -1) return [...prev, row];
            const next = [...prev];
            next[i] = row;
            return next;
          });
        })
        .subscribe();
    };

    const load = async () => {
      const { data: s } = await supabase!.auth.getSession();
      uid = s.session?.user.id;
      if (!uid) {
        if (alive) setReady(true);
        return;
      }
      const { data: me } = await supabase!.from("profiles").select("role, chat_banned_until").eq("user_id", uid).maybeSingle();
      const r = (me?.role as Role) || "schueler";
      if (!alive) return;
      setRoleState(r);
      setBannedUntil((me?.chat_banned_until as string | null) ?? null);
      setReady(true);
      void supabase!.from("profiles").update({ has_logged_in: true }).eq("user_id", uid);
      void loadProfiles(STAFF.includes(r));
      subscribe();
    };
    void load();
    const { data: sub } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setReady(false);
        setProfiles([]);
        if (channel) {
          supabase!.removeChannel(channel);
          channel = null;
        }
        void load();
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      if (channel) supabase!.removeChannel(channel);
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

  const setBan = useCallback(async (userId: string, until: string | null) => {
    if (!hasSupabase) return;
    const { error } = await supabase!.from("profiles").update({ chat_banned_until: until }).eq("user_id", userId);
    if (error) {
      alert("Sperre setzen fehlgeschlagen: " + error.message);
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.user_id === userId ? { ...p, chat_banned_until: until } : p)));
  }, []);

  const isStaff = STAFF.includes(role);
  const banned = bannedUntil != null && new Date(bannedUntil) > new Date();
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
    banned,
    bannedUntil,
    setRole,
    setBan,
    refreshProfiles: () => loadProfiles(isStaff),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
