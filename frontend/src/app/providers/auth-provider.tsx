import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore, authApi } from "@/features/auth";

export function AuthProvider() {
  const { isAuthenticated, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      authApi
        .me()
        .then(({ data }) => setUser(data))
        .catch(() => {
          useAuthStore.getState().logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, setUser]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
