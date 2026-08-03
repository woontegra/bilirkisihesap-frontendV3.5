import { Navigate, Outlet } from "react-router-dom";
import { readIsAdmin } from "@/data/source";
import { isAuthenticated } from "@/auth/session";

/**
 * V3 AdminRoute ile aynı kural: role === admin veya tenant_id === 1
 */
export function AdminOnly() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!readIsAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
