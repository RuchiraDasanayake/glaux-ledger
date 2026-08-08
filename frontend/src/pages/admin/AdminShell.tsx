import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/lib/admin-auth-context";
import { CONTENT_SHELL } from "@/lib/layout";

const NAV = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/shops", label: "Shops", end: false },
  { to: "/admin/payments", label: "Payments", end: false },
] as const;

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
          className={`${CONTENT_SHELL} flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between`}
        >
          <div>
            <p className="font-display text-lg tracking-tight">Glaux Ledger</p>
            <p className="text-xs text-mute">Staff · {user?.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            <nav
              aria-label="Admin"
              className="flex flex-wrap gap-1 rounded-sm border border-line bg-sunk p-1"
            >
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `min-h-10 rounded-sm px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-card text-ink shadow-sm"
                        : "text-mute hover:text-ink"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={signOut}
              className="min-h-10 px-3 text-sm font-medium text-mute transition-colors
                hover:text-expense"
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
