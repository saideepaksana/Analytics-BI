/**
 * Dummy Authentication Utilities
 *
 * Temporary mock auth layer – stores user state in localStorage.
 * Designed to be easily replaceable with real JWT / OAuth implementation.
 *
 * Roles: admin | editor | viewer
 */

const AUTH_STORAGE_KEY = "analytics-bi-auth";

const VALID_ROLES = ["admin", "editor", "viewer"];

/**
 * Get the currently logged-in user from localStorage.
 * @returns {{ email: string, role: string } | null}
 */
export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.isAuthenticated && data?.email) {
      return { email: data.email, role: data.role || "viewer" };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Check whether a user is currently authenticated.
 * @returns {boolean}
 */
export const isAuthenticated = () => {
  return getCurrentUser() !== null;
};

/**
 * Get the role of the current user.
 * @returns {'admin' | 'editor' | 'viewer' | null}
 */
export const getUserRole = () => {
  const user = getCurrentUser();
  return user?.role || null;
};

/**
 * Persist a mock login in localStorage.
 * @param {string} email
 * @param {string} [role='viewer']
 * @returns {{ email: string, role: string }}
 */
export const login = (email, role = "viewer") => {
  const safeRole = VALID_ROLES.includes(role) ? role : "viewer";
  const payload = {
    email,
    role: safeRole,
    isAuthenticated: true,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  return { email, role: safeRole };
};

/**
 * Clear auth state and log the user out.
 */
export const logout = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};
