import { createContext, useContext } from "react";
import type { AdminUser } from "@/lib/types";

export interface AdminAuthState {
  user: AdminUser | null;
  status: "loading" | "authenticated" | "anonymous";
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function useAdminAuth(): AdminAuthState {
  const context = useContext(AdminAuthContext);
  if (!context)
    throw new Error("useAdminAuth must be used inside an AdminAuthProvider");
  return context;
}
