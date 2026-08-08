import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { AdminAuthProvider } from "@/lib/admin-auth";
import { useAuth } from "@/lib/auth-context";
import { AdminLogin } from "@/pages/admin/AdminLogin";
import { AdminOverview } from "@/pages/admin/AdminOverview";
import { AdminPayments } from "@/pages/admin/AdminPayments";
import { AdminShell } from "@/pages/admin/AdminShell";
import { AdminShops } from "@/pages/admin/AdminShops";
import { Dashboard } from "@/pages/Dashboard";
import { Export } from "@/pages/Export";
import { History } from "@/pages/History";
import { Landing } from "@/pages/Landing";
import { Privacy, Terms } from "@/pages/Legal";
import { Login } from "@/pages/Login";
import { QuickEntry } from "@/pages/QuickEntry";
import { Settings } from "@/pages/Settings";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin tree is independent of shop auth so staff are not blocked by a shop
            token restore, and shop owners never see these routes in the shell. */}
        <Route path="/admin" element={<AdminAuthLayout />}>
          <Route path="login" element={<AdminLogin />} />
          <Route element={<AdminShell />}>
            <Route index element={<AdminOverview />} />
            <Route path="shops" element={<AdminShops />} />
            <Route path="payments" element={<AdminPayments />} />
          </Route>
        </Route>
        <Route path="*" element={<ShopTree />} />
      </Routes>
    </BrowserRouter>
  );
}

function AdminAuthLayout() {
  return (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  );
}

function ShopTree() {
  const { status } = useAuth();

  // Restoring a stored token is a network round trip. Rendering the login screen
  // during it would flash a sign-in form at an already-signed-in user.
  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-mute" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // Two route tables rather than one with guards. A signed-in shop has no use for the
  // marketing page and a stranger has no use for the ledger, so neither tree ever needs
  // to render a redirect for the other's paths.
  if (status === "anonymous") {
    return (
      <Routes>
        <Route index element={<Landing />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Login initialMode="register" />} />
        {/* In both trees. Someone who has signed up should not have to sign out to
            reread what they agreed to. */}
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<QuickEntry />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="history" element={<History />} />
        <Route path="export" element={<Export />} />
        <Route path="settings" element={<Settings />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
