import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Unified-accounts model (see CLAUDE.md): `role` only distinguishes admin from
 * regular accounts; provider is a capability, true iff a provider_profiles row
 * exists. Admin accounts get no admin surface on mobile and cannot book.
 */
type SessionState = {
  session: Session | null;
  /** null until the profile row has loaded */
  role: "admin" | "customer" | null;
  isProvider: boolean;
  /** true until the initial session restore has settled */
  loading: boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  role: null,
  isProvider: false,
  loading: true,
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"admin" | "customer" | null>(null);
  const [isProvider, setIsProvider] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setRole(null);
      setIsProvider(false);
      return;
    }
    (async () => {
      const [profile, provider] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", session.user.id).single(),
        supabase
          .from("provider_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", session.user.id),
      ]);
      if (cancelled) return;
      const dbRole = profile.data?.role;
      // The dead `provider` enum value is never assigned; normalize defensively.
      setRole(dbRole === "admin" ? "admin" : "customer");
      setIsProvider((provider.count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <SessionContext.Provider
      value={{
        session,
        role,
        isProvider,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
