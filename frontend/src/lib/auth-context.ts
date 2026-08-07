import { createContext, useContext } from "react";
import type { Business } from "@/lib/types";

/**
 * Currency and timezone are fixed at creation and never editable afterwards, because
 * both reinterpret every figure already recorded. That makes them part of registration
 * rather than something to default quietly and apologise for later.
 */
export interface NewShop {
  businessName: string;
  email: string;
  password: string;
  currency: string;
  timezone: string;
}

export interface AuthState {
  business: Business | null;
  email: string | null;
  status: "loading" | "authenticated" | "anonymous";
  signIn: (email: string, password: string) => Promise<void>;
  register: (shop: NewShop) => Promise<void>;
  signOut: () => void;
  /** Re-read /auth/me so a newly applied payment updates the banner without a reload. */
  refresh: () => Promise<void>;
}

// Kept apart from the provider component: a module that exports both a component and
// plain functions breaks React Fast Refresh.
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

/** Convenience for screens that only render when authenticated. */
export function useBusiness(): Business {
  const { business } = useAuth();
  if (!business)
    throw new Error("useBusiness used outside an authenticated route");
  return business;
}
