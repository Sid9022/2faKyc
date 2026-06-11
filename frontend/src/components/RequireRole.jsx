import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/kycApi";

/**
 * Route guard: requires a logged-in user with one of the given roles.
 * Re-renders when auth changes (login/logout/refresh-failure).
 */
export default function RequireRole({ roles, children }) {
  const location = useLocation();
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const onChange = () => setUser(getCurrentUser());
    window.addEventListener("kyc-auth-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("kyc-auth-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-bold text-red-700">Access denied</p>
          <p className="mt-2 text-sm text-gray-500">
            Your account ({user.role}) does not have permission for this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
