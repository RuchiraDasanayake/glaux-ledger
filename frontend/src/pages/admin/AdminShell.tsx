import { Link, Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/lib/admin-auth-context";
import { CONTENT_SHELL } from "@/lib/layout";

export function AdminShell() {
  const { status, user, signOut } = useAdminAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-mute" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/80 backdrop-blur-md">
        <div
          className={`${CONTENT_SHELL} flex items-center justify-between gap-4 py-4`}
        >
          <div>
            <p className="font-display text-lg tracking-tight">Glaux Ledger</p>
            <p className="text-xs text-mute">
              Payment review · {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/admin/payments"
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Payments
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="font-medium text-mute transition-colors hover:text-expense"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className={`${CONTENT_SHELL} py-8`}>
        <Outlet />
      </main>
    </div>
  );
}
