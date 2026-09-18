import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hasSupabase, supabase } from "./lib/supabase";
import { abonniere } from "./lib/realtime";
import { elternNachname, familienKuerzel, initialen as initialenVon, lesbarerName, zufallsFarbe, type PublicProfile } from "./lib/profil";
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
  // erst nach dem ersten vollständigen Laden darf ein Profil angelegt werden –
  // sonst sieht der Anlege-Schritt eine noch leere Liste und überschreibt die Farbe
  const [geladen, setGeladen] = useState(false);
  const angelegt = useRef(false);

  // Lokaler Testmodus: Profil im Browser halten, damit Farben/Bild trotzdem funktionieren.
  useEffect(() => {
    if (hasSupabase) return;
    try {
      const roh = localStorage.getItem("sv-beitraege:mein-profil");
      const p: PublicProfile = roh
        ? JSON.parse(roh)
        : { user_id: "local-user", anzeigename: "Test Nutzer", initialen: "TN", farbe: zufallsFarbe() };
      setProfile({ "local-user": p });
    } catch { /* ignore */ }
  }, []);

  const laden = useCallback(async () => {
    if (!hasSupabase) return;
    const { data } = await supabase!.from("public_profiles").select("*");
    const m: Record<string, PublicProfile> = {};
    for (const p of (data as PublicProfile[]) || []) m[p.user_id] = p;
    setProfile(m);
    setGeladen(true);
  }, []);

  useEffect(() => {
    if (!hasSupabase) return;
    let alive = true;
    let abmelden: (() => void) | null = null;
    void (async () => {
      const { data: s } = await supabase!.auth.getSession();
      const id = s.session?.user.id;
      if (!id) return;
      setUid(id);
      await laden();
      if (!alive || abmelden) return;
      abmelden = abonniere({
        name: "sv-pprofiles",
        nachholen: () => void laden(),
        // Aendert eine Person ihre Farbe, kam hier bisher sofort ein komplettes
        // Neuladen aller Profile - bei 300 Personen auf 300 Geraeten
        // gleichzeitig. Jetzt wird nur die geaenderte Zeile eingepflegt.
        aufbauen: (kanal) =>
          kanal.on("postgres_changes", { event: "*", schema: "public", table: "public_profiles" }, (p) => {
            if (p.eventType === "DELETE") {
              const weg = (p.old as { user_id?: string })?.user_id;
              if (weg) setProfile((prev) => {
                const next = { ...prev };
                delete next[weg];
                return next;
              });
              return;
            }
            const row = p.new as PublicProfile;
            if (!row?.user_id) return;
            setProfile((prev) => ({ ...prev, [row.user_id]: row }));
          }),
      });
    })();
    return () => {
      alive = false;
      abmelden?.();
    };
  }, [laden]);

  // Eigenes Profil einmalig anlegen, sobald der eigene Name bekannt ist.
  // Wichtig: erst wenn die Liste geladen ist – sonst wird eine schon gewählte
  // Farbe mit dem Standardwert überschrieben (Farbe "springt" nach dem Neuladen).
  useEffect(() => {
    if (!hasSupabase || angelegt.current || uid === "local-user" || !geladen) return;
    if (profile[uid]?.anzeigename) return;
    angelegt.current = true;
    void (async () => {
      const { data: prof } = await supabase!
        .from("profiles")
        .select("student_id, username, is_op, role")
        .eq("user_id", uid)
        .maybeSingle();
      // Nutzernamen wie "adams.tyler" umdrehen, sonst stünde dort "AT" statt "TA"
      let name = lesbarerName((prof?.username as string) || "");
      const sid = prof?.student_id as string | undefined;
      const st = sid ? students.find((x) => x.id === sid) : null;
      if (st) name = `${st.vorname} ${st.nachname}`.trim();

      // Elternzugaenge heissen immer "Familie <Nachname>". Die Kuerzel sind die
      // ersten beiden Buchstaben des Nachnamens, also IC fuer Familie Icking.
      const istEltern = (prof as { role?: string } | null)?.role === "eltern";
      if (istEltern) {
        const nachname = elternNachname((prof?.username as string) || "");
        if (nachname) name = `Familie ${nachname}`;
      }
      const kuerzel = istEltern ? familienKuerzel(name) : initialenVon(name);
      if (!name) {
        angelegt.current = false;
        return;
      }
      // Sicherheitsnetz: direkt in der Datenbank nachsehen, ob es die Zeile gibt.
      const { data: schon } = await supabase!
        .from("public_profiles")
        .select("user_id, farbe")
        .eq("user_id", uid)
        .maybeSingle();
      if (schon) {
        // Zeile existiert – nur den Namen auffrischen, die Farbe bleibt unberührt.
        await supabase!
          .from("public_profiles")
          .update({ anzeigename: name, initialen: kuerzel })
          .eq("user_id", uid);
      } else {
        const istOp = Boolean((prof as { is_op?: boolean } | null)?.is_op);
        await supabase!.from("public_profiles").insert({
          user_id: uid,
          anzeigename: name,
          initialen: kuerzel,
          farbe: istOp ? "magenta" : zufallsFarbe(),
        });
      }
      void laden();
    })();
  }, [uid, profile, students, laden, geladen]);

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
