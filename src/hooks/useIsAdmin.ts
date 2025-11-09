import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLE = "admin";

const hasRole = (roles: unknown, role: string) => {
  if (!roles) return false;
  if (Array.isArray(roles)) {
    return roles.includes(role);
  }
  return false;
};

const normalize = (value: unknown): string | undefined => {
  if (!value) return undefined;
  return String(value).trim() || undefined;
};

function metadataIndicatesAdmin(user: ReturnType<typeof useAuth>["user"]): boolean {
  if (!user) return false;

  const directRole = normalize((user as any)?.role);
  const appRole = normalize((user.app_metadata as any)?.role);
  const userRole = normalize((user.user_metadata as any)?.role);

  const appRoles = (user.app_metadata as any)?.roles;
  const userRoles = (user.user_metadata as any)?.roles;

  if (
    directRole === ADMIN_ROLE ||
    appRole === ADMIN_ROLE ||
    userRole === ADMIN_ROLE ||
    hasRole(appRoles, ADMIN_ROLE) ||
    hasRole(userRoles, ADMIN_ROLE)
  ) {
    return true;
  }

  if (appRoles && typeof appRoles === "object" && !Array.isArray(appRoles)) {
    return Object.values(appRoles).some((value) => normalize(value) === ADMIN_ROLE);
  }

  if (userRoles && typeof userRoles === "object" && !Array.isArray(userRoles)) {
    return Object.values(userRoles).some((value) => normalize(value) === ADMIN_ROLE);
  }

  return false;
}

export function useIsAdmin() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const metadataAdmin = useMemo(() => metadataIndicatesAdmin(user), [user]);

  // Use user ID instead of user object to prevent unnecessary re-checks
  // when the user object reference changes but the data is the same
  const userId = user?.id;

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    if (metadataAdmin) {
      setIsAdmin(true);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const fetchRole = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        if (error) {
          console.error("Failed to load profile role", error);
          setIsAdmin(false);
        } else {
          setIsAdmin(normalize(data?.role) === ADMIN_ROLE);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error checking admin role", error);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    fetchRole();

    return () => {
      cancelled = true;
    };
  }, [userId, metadataAdmin, user?.id]); // Use userId instead of user to prevent re-checks on object reference changes

  return { isAdmin: metadataAdmin || isAdmin, checking };
}
