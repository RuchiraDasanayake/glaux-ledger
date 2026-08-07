import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  api,
  setPaymentRequiredHandler,
  setUnauthorisedHandler,
  tokenStore,
} from "@/lib/api";
import { AuthContext, type AuthState } from "@/lib/auth-context";
import type { Business, Me, TokenResponse } from "@/lib/types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  const signOut = useCallback(() => {
    tokenStore.clear();
    setBusiness(null);
    setEmail(null);
    setStatus("anonymous");
  }, []);

  const refresh = useCallback(async () => {
    const me = await api.get<Me>("/auth/me");
    setBusiness(me.business);
    setEmail(me.email);
    setStatus("authenticated");
  }, []);

  // Any 401 anywhere in the app drops the session, so an expired token cannot leave
  // the UI in a half-signed-in state.
  useEffect(() => setUnauthorisedHandler(signOut), [signOut]);

  // A 402 means the cached subscription state is out of date, not that the session is
  // bad. Re-reading it here is what raises the banner on the same interaction that was
  // refused, instead of leaving the refusal unexplained until a reload.
  useEffect(
    () => setPaymentRequiredHandler(() => void refresh().catch(() => {})),
    [refresh],
  );

  // Restore a stored token on load rather than forcing a login every visit. A shop
  // device is opened dozens of times a day.
  useEffect(() => {
    if (!tokenStore.get()) {
      setStatus("anonymous");
      return;
    }
    refresh().catch(() => signOut());
  }, [refresh, signOut]);

  const accept = useCallback((response: TokenResponse, userEmail: string) => {
    tokenStore.set(response.access_token);
    setBusiness(response.business);
    setEmail(userEmail);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      business,
      email,
      status,
      signIn: async (userEmail, password) => {
        const response = await api.post<TokenResponse>("/auth/login", {
          email: userEmail,
          password,
        });
        accept(response, userEmail);
      },
      register: async ({
        businessName,
        email: userEmail,
        password,
        currency,
        timezone,
      }) => {
        const response = await api.post<TokenResponse>("/auth/register", {
          business_name: businessName,
          email: userEmail,
          password,
          currency,
          timezone,
        });
        accept(response, userEmail);
      },
      signOut,
      refresh,
    }),
    [business, email, status, accept, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
