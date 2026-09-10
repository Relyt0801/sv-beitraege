import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { initialen as initialenVon, lesbarerName, type PublicProfile } from "./lib/profil";
import { useStore } from "./store";

interface ProfilesValue {
  /** user_id -> Anzeigedaten */
  profile: Record<string, PublicProfile>;
  uid: string;
  mein: PublicProfile | null;
  aktualisiere: (patch: Partial<Omit<PublicProfile, "user_id">>) => void;
  neuLaden: () => void;
}

const Ctx = createContext<ProfilesValue | null>(null);
export const useProfiles = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfiles outside provider");
  return v;
};

/** Anzeige-Profile aller Personen: Name, Initialen, Farbe, Bild. */
export function ProfilesProvider({ children }: { children: ReactNode }) {
  const { students } = useStore();
  const [profile, setProfile] = useState<Record<string, PublicProfile>>({});
  const [uid, setUid] = useState("local-user");
  const angelegt = useRef(false);

  // Lokaler Testmodus: Profil im Browser halten, damit Farben/Bild trotzdem funktionieren.
  useEffect(() => {
    if (hasSupabase) return;
    try {
      const roh = localStorage.getItem("sv-beitraege:mein-profil");
      const p: PublicProfile = roh
        ? JSON.parse(roh)
        : { user_id: "local-user", anzeigename: "Test Nutzer", initialen: "TN", farbe: "indigo" };
      setProfile({ "local-user": p });
    } catch { /* ignore */ }
  }, []);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("public_profiles").select("*");
    const m: Record<string, PublicProfile> = {};
    for (const p of (data as PublicProfile[]) || []) m[p.user_id] = p;
    setProfile(m);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    void (async () => {
      const { data: s } = await supabase!.auth.getSession();
      const id = s.session?.user.id;
      if (!id) return;
      setUid(id);
      await laden();
      channel = supabase!
        .channel("sv-pprofiles")
        .on("postgres_changes", { event: "*", schema: "public", table: "public_profiles" }, () => void laden())
        .subscribe();
    })();
    return () => {
      if (channel) supabase!.removeChannel(channel);
    };
  }, [laden]);

  // Eigenes Profil einmalig anlegen, sobald der eigene Name bekannt ist.
  useEffect(() => {
    if (!hasSupabase || angelegt.current || uid === "local-user") return;
    const vorhanden = profile[uid];
    if (vorhanden?.anzeigename) return;
    void (async () => {
      const { data: prof } = await supabase!
        .from("profiles")
        .select("student_id, username, is_op")
        .eq("user_id", uid)
        .maybeSingle();
      // Nutzernamen wie "adams.tyler" umdrehen, sonst stünde dort "AT" statt "TA"
      let name = lesbarerName((prof?.username as string) || "");
      const sid = prof?.student_id as string | undefined;
      const st = sid ? students.find((x) => x.id === sid) : null;
      if (st) name = `${st.vorname} ${st.nachname}`.trim();
      if (!name) return;
      angelegt.current = true;
      const istOp = Boolean((prof as { is_op?: boolean } | null)?.is_op);
      await supabase!.from("public_profiles").upsert(
        {
          user_id: uid,
          anzeigename: name,
          initialen: initialenVon(name),
          farbe: vorhanden?.farbe || (istOp ? "magenta" : "indigo"),
        },
        { onConflict: "user_id" },
      );
      void laden();
    })();
  }, [uid, profile, students, laden]);

  const aktualisiere = useCallback(
    (patch: Partial<Omit<PublicProfile, "user_id">>) => {
      if (!hasSupabase) {
        setProfile((p) => {
          const neu = { ...(p["local-user"] as PublicProfile), ...patch };
          localStorage.setItem("sv-beitraege:mein-profil", JSON.stringify(neu));
          return { "local-user": neu };
        });
        return;
      }
      setProfile((p) => {
        const basis: PublicProfile = p[uid] ?? { user_id: uid, anzeigename: "", initialen: "", farbe: "indigo" };
        return { ...p, [uid]: { ...basis, ...patch } };
      });
    },
    [uid],
  );

  return (
    <Ctx.Provider value={{ profile, uid, mein: profile[uid] ?? null, aktualisiere, neuLaden: () => void laden() }}>
      {children}
    </Ctx.Provider>
  );
}
