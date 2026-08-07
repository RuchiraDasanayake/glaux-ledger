import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { useAdminAuth } from "@/lib/admin-auth-context";
import { delay } from "@/lib/motion";

export function AdminLogin() {
  const { status, signIn } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-mute" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/admin/payments" replace />;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate("/admin/payments", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <header style={delay(60)} className="rise mb-8">
          <p className="eyebrow eyebrow-dot">Staff</p>
          <h1 className="font-display mt-2 text-3xl tracking-tight">
            Admin sign in
          </h1>
          <p className="mt-2 text-mute">
            Review bank-slip payments. This is separate from shop accounts.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          style={delay(140)}
          className="rise flex flex-col gap-4"
        >
          <div>
            <label
              htmlFor="admin-email"
              className="mb-1.5 block text-xs font-medium text-mute"
            >
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 w-full rounded-sm border border-line bg-card px-3
                focus:border-accent"
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-xs font-medium text-mute"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-11 w-full rounded-sm border border-line bg-card px-3
                focus:border-accent"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="bg-expense-wash rounded-sm px-3 py-2 text-sm text-expense"
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-mute">
          Looking for your shop?{" "}
          <Link to="/login" className="text-accent underline underline-offset-2">
            Shop sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
