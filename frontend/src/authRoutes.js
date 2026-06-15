/**
 * Single source of truth for role-based routing.
 * Backend roles are strictly "admin" | "reviewer".
 */

export function roleHome(role) {
  if (role === "admin") return "/admin";
  if (role === "reviewer") return "/reviewer/cases";
  return "/login";
}

/**
 * Which roles may view a given path family.
 */
export function canRoleAccess(role, pathname = "") {
  if (pathname.startsWith("/admin")) return role === "admin";
  if (pathname.startsWith("/reviewer")) {
    return role === "admin" || role === "reviewer";
  }
  return true;
}

/**
 * Where to send a user right after login.
 *
 * Honor the page they were originally trying to reach (`from`) ONLY if their
 * role can actually access it — otherwise fall back to their own home.
 *
 * This is what prevents a reviewer from being bounced to a stale `/admin`
 * `from` value (left over from an admin's logout redirect), which is what
 * produced the "Access denied" dead-end.
 */
export function postLoginTarget(role, from) {
  if (from && canRoleAccess(role, from)) return from;
  return roleHome(role);
}
