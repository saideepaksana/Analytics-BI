/**
 * Dummy Authentication Utilities
 *
 * Temporary mock auth layer – stores user state in localStorage.
 * Designed to be easily replaceable with real JWT / OAuth implementation.
 *
 * Roles: admin | editor | viewer
 */
import { clearCsrfToken } from './csrf';

const AUTH_STORAGE_KEY = "analytics-bi-auth";
const AUTH_CHANGED_EVENT = "analytics-auth-changed";

const VALID_ROLES = ["admin", "editor", "viewer"];
const VALID_THEMES = ["system", "light", "dark"];
const VALID_DENSITY = ["comfortable", "compact"];
const VALID_ACCENTS = ["teal", "amber", "rose", "indigo"];

const DEFAULT_PREFERENCES = Object.freeze({
  theme: "dark",
  density: "comfortable",
  accent: "teal",
  reduceMotion: false,
});

const readStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const emitAuthChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
};

const getSafeRole = (role) => {
  return VALID_ROLES.includes(role) ? role : "viewer";
};

const getDefaultDisplayName = (email = "") => {
  const [localPart] = String(email).split("@");
  if (!localPart) return "Analytics User";

  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  if (!normalized) return "Analytics User";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const normalizePreferences = (preferences = {}) => {
  const merged = { ...DEFAULT_PREFERENCES, ...preferences };
  const safeTheme = VALID_THEMES.includes(merged.theme) ? merged.theme : DEFAULT_PREFERENCES.theme;
  const safeDensity = VALID_DENSITY.includes(merged.density) ? merged.density : DEFAULT_PREFERENCES.density;
  const safeAccent = VALID_ACCENTS.includes(merged.accent) ? merged.accent : DEFAULT_PREFERENCES.accent;

  return {
    theme: safeTheme,
    density: safeDensity,
    accent: safeAccent,
    reduceMotion: Boolean(merged.reduceMotion),
  };
};

const normalizeUser = (data = {}) => {
  const email = String(data.email || "").trim().toLowerCase();
  const role = getSafeRole(data.role);

  return {
    email,
    role,
    fullName: String(data.fullName || "").trim() || getDefaultDisplayName(email),
    company: String(data.company || "").trim(),
    preferences: normalizePreferences(data.preferences),
  };
};

const persistUser = (payload = {}) => {
  const normalized = normalizeUser(payload);
  const finalPayload = {
    ...payload,
    ...normalized,
    isAuthenticated: true,
    lastLoginAt: payload.lastLoginAt || new Date().toISOString(),
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(finalPayload));
  emitAuthChanged();
  return normalizeUser(finalPayload);
};

const resolveLoginArgs = (roleOrOptions, maybeOptions) => {
  if (typeof roleOrOptions === "object" && roleOrOptions !== null) {
    return {
      role: roleOrOptions.role,
      options: roleOrOptions,
    };
  }

  return {
    role: roleOrOptions,
    options: maybeOptions || {},
  };
};

export const AUTH_EVENTS = {
  CHANGED: AUTH_CHANGED_EVENT,
};

export const getDefaultPreferences = () => ({ ...DEFAULT_PREFERENCES });

export const getEffectiveTheme = (themePreference) => {
  if (themePreference === "system") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  }

  return themePreference === "light" ? "light" : "dark";
};

/**
 * Get the currently logged-in user from localStorage.
 * @returns {{ email: string, role: string } | null}
 */
export const getCurrentUser = () => {
  const data = readStoredAuth();
  if (!data?.isAuthenticated || !data?.email) {
    return null;
  }

  return normalizeUser(data);
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
 * @param {string|object} [roleOrOptions='viewer']
 * @param {object} [maybeOptions]
 * @returns {{ email: string, role: string }}
 */
export const login = (email, roleOrOptions = "viewer", maybeOptions = {}) => {
  const trimmedEmail = String(email || "").trim().toLowerCase();
  const { role, options } = resolveLoginArgs(roleOrOptions, maybeOptions);
  const safeRole = getSafeRole(role);

  return persistUser({
    email: trimmedEmail,
    role: safeRole,
    fullName: options.fullName,
    company: options.company,
    preferences: options.preferences,
  });
};

/**
 * Persist a mock signup in localStorage and create a signed-in session.
 * @param {{email: string, role?: string, fullName?: string, company?: string, preferences?: object}} payload
 * @returns {{ email: string, role: string }}
 */
export const signup = (payload = {}) => {
  const email = String(payload.email || "").trim().toLowerCase();
  const safeRole = getSafeRole(payload.role);

  return persistUser({
    email,
    role: safeRole,
    fullName: payload.fullName,
    company: payload.company,
    preferences: payload.preferences,
  });
};

/**
 * Update current user profile fields.
 * @param {{fullName?: string, company?: string}} partial
 * @returns {{ email: string, role: string } | null}
 */
export const updateCurrentUserProfile = (partial = {}) => {
  const current = readStoredAuth();
  if (!current?.isAuthenticated || !current?.email) {
    return null;
  }

  return persistUser({
    ...current,
    fullName: partial.fullName ?? current.fullName,
    company: partial.company ?? current.company,
  });
};

/**
 * Update current user personalization preferences.
 * @param {object} partialPreferences
 * @returns {{ email: string, role: string } | null}
 */
export const updateCurrentUserPreferences = (partialPreferences = {}) => {
  const current = readStoredAuth();
  if (!current?.isAuthenticated || !current?.email) {
    return null;
  }

  const mergedPreferences = normalizePreferences({
    ...current.preferences,
    ...partialPreferences,
  });

  return persistUser({
    ...current,
    preferences: mergedPreferences,
  });
};

/**
 * Clear auth state and log the user out.
 */
export const logout = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  clearCsrfToken(); // Invalidate any cached CSRF token
  emitAuthChanged();
};
