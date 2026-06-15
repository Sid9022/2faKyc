import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/kycApi";
import { roleHome } from "../authRoutes";

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

  // Not signed in → go to login, remembering where they wanted to go.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Signed in but wrong role for THIS page → send them to their own
  // dashboard instead of a dead-end. roleHome targets are always
  // accessible to that role, so there is no redirect loop.
  if (!roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return children;
}
