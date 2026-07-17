import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "../lib/supabase";
import { ALL_PERMS, ROLE_DEFAULTS, type PermKey } from "../lib/permissions";

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
  can: (perm: PermKey) => boolean;
  canEditData: boolean; // Namen/Beteiligungen/Personen
  canEditBeitrag: boolean; // bezahlt/offen/erlassen
  canManageRoles: boolean; // Rollen-Reiter
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
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const roleRef = useRef<Role>(role);
  const uidRef = useRef<string | undefined>(undefined);
  roleRef.current = role;

  const loadProfiles = useCallback(async (asStaff: boolean) => {
    if (!hasSupabase || !asStaff) return;
    const { data } = await supabase!.from("profiles").select("*");
    setProfiles((data as Profile[]) || []);
  }, []);

  // Effektive Rechte des aktuellen Nutzers laden (Rollen-Default + persönlicher Override).
  const loadPerms = useCallback(async (r: Role, id: string | undefined) => {
    if (!hasSupabase) return;
    if (r === "admin") { setPerms(new Set(ALL_PERMS)); return; }
    const { data: rp, error } = await supabase!.from("role_permissions").select("perm, allowed").eq("role", r);
    const base: Record<string, boolean> = {};
    if (error || !rp) for (const p of ROLE_DEFAULTS[r] || []) base[p] = true; // Fallback vor Migration
    else for (const row of rp as { perm: string; allowed: boolean }[]) base[row.perm] = row.allowed;
    const over: Record<string, boolean> = {};
    if (id) {
      const { data: up } = await supabase!.from("user_permissions").select("perm, allowed").eq("user_id", id);
      if (up) for (const row of up as { perm: string; allowed: boolean }[]) over[row.perm] = row.allowed;
    }
    const set = new Set<string>();
    for (const p of ALL_PERMS) if (over[p] ?? base[p] ?? false) set.add(p);
    setPerms(set);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    const subscribe = () => {
      if (channel) return;
      channel = supabase!
        .channel("sv-profiles")
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (p) => {
          if (p.eventType === "DELETE") {
            const old = p.old as Partial<Profile>;
            setProfiles((prev) => prev.filter((x) => x.user_id !== old.user_id));
            return;
          }
          const row = p.new as Profile;
          if (row.user_id === uidRef.current) {
            setRoleState(row.role); // eigene Rolle live
            setBannedUntil(row.chat_banned_until ?? null); // Sperre live
            void loadPerms(row.role, uidRef.current);
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
        .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, () => void loadPerms(roleRef.current, uidRef.current))
        .on("postgres_changes", { event: "*", schema: "public", table: "user_permissions" }, () => void loadPerms(roleRef.current, uidRef.current))
        .subscribe();
    };

    const load = async () => {
      const { data: s } = await supabase!.auth.getSession();
      const uid = s.session?.user.id;
      uidRef.current = uid;
      if (!uid) {
        if (alive) setReady(true);
        return;
      }
      const { data: me } = await supabase!.from("profiles").select("role, chat_banned_until").eq("user_id", uid).maybeSingle();
      const r = (me?.role as Role) || "schueler";
      if (!alive) return;
      setRoleState(r);
      setBannedUntil((me?.chat_banned_until as string | null) ?? null);
      await loadPerms(r, uid);
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
        setPerms(new Set());
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
  }, [loadProfiles, loadPerms]);

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

  const isAdmin = role === "admin";
  const isStaff = STAFF.includes(role);
  const can = useCallback((perm: PermKey) => isAdmin || perms.has(perm), [isAdmin, perms]);
  const banned = bannedUntil != null && new Date(bannedUntil) > new Date();
  const loginByStudent: Record<string, boolean> = {};
  for (const p of profiles) if (p.student_id) loginByStudent[p.student_id] = p.has_logged_in;

  const value: RoleCtx = {
    role,
    ready,
    isAdmin,
    isStaff,
    can,
    canEditData: can("data.edit"),
    canEditBeitrag: can("kasse.edit"),
    canManageRoles: can("roles.manage"),
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
