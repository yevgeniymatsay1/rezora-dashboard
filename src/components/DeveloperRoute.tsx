import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { isDeveloperEmail } from "@/lib/developerAccess";

interface DeveloperRouteProps {
  children: ReactNode;
}

export function DeveloperRoute({ children }: DeveloperRouteProps) {
  const { user, loading } = useAuth();
  const { isAdmin, checking } = useIsAdmin();
  const location = useLocation();

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircleNotch className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const isDeveloper = isDeveloperEmail(user?.email);

  if (!user || !isDeveloper || !isAdmin) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

