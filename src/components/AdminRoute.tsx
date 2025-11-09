import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { loading } = useAuth();
  const { isAdmin, checking } = useIsAdmin();
  const location = useLocation();

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircleNotch className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
