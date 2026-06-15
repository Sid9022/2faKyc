import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { getCurrentUser, login } from "../api/kycApi";
import { postLoginTarget } from "../authRoutes";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Already signed in? There is nothing to do here — go to the console
  // appropriate for this user's role.
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      navigate(postLoginTarget(user.role, location.state?.from), {
        replace: true
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        // Route by role. `from` is only honored when this role can access it,
        // so a reviewer never lands on a stale /admin target.
        navigate(postLoginTarget(result.user.role, location.state?.from), {
          replace: true
        });
      } else {
        setError(result.message || "Login failed.");
      }
    } catch (err) {
      setError(
        err.response?.data?.message || "Login failed. Check your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-[2rem] border border-gray-200/80 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-950 text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-950">KYC Console</h1>
              <p className="text-sm text-gray-500">
                Reviewer &amp; admin sign in
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-gray-400"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-gray-400"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-gray-800 disabled:opacity-60"
            >
              <Lock size={16} />
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-gray-400">
            Access is restricted to authorized reviewers and administrators.
            All actions are audit-logged.
          </p>
        </div>
      </div>
    </div>
  );
}
