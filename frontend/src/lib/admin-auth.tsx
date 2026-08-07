import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  adminLogin,
  adminTokenStore,
  setAdminUnauthorisedHandler,
} from "@/lib/admin-api";
import {
  AdminAuthContext,
  type AdminAuthState,
} from "@/lib/admin-auth-context";
import type { AdminUser } from "@/lib/types";

const ADMIN_USER_KEY = "glaux.admin.user";

function readStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AdminUser | null) {
  if (!user) {
    localStorage.removeItem(ADMIN_USER_KEY);
    return;
  }
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AdminAuthState["status"]>("loading");

  const signOut = useCallback(() => {
    adminTokenStore.clear();
    writeStoredUser(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => setAdminUnauthorisedHandler(signOut), [signOut]);

  useEffect(() => {
    const token = adminTokenStore.get();
    const stored = readStoredUser();
    if (!token || !stored) {
      adminTokenStore.clear();
      writeStoredUser(null);
      setStatus("anonymous");
      return;
    }
    setUser(stored);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AdminAuthState>(
    () => ({
      user,
      status,
      signIn: async (email, password) => {
        adminTokenStore.clear();
        const response = await adminLogin(email, password);
        const user: AdminUser = {
          id: response.user_id,
          email: response.email,
          role: response.role,
        };
        adminTokenStore.set(response.access_token);
        writeStoredUser(user);
        setUser(user);
        setStatus("authenticated");
      },
      signOut,
    }),
    [user, status, signOut],
  );

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}
