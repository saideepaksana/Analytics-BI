import { useEffect, useMemo, useState } from "react";
import {
  AUTH_EVENTS,
  getCurrentUser,
  getDefaultPreferences,
  updateCurrentUserPreferences,
  updateCurrentUserProfile
} from "@analytics-bi/shared-lib";
import LegacySettingsPage from "../../../../client/src/modules/settings/SettingsPage.jsx";

const FALLBACK_USER = {
  email: "guest@analytics.local",
  role: "viewer",
  fullName: "Guest User",
  company: "Analytics BI",
  preferences: getDefaultPreferences()
};

export default function SettingsPage() {
  const [user, setUser] = useState(() => getCurrentUser() || FALLBACK_USER);
  const [preferences, setPreferences] = useState(
    () => (getCurrentUser() || FALLBACK_USER).preferences || getDefaultPreferences()
  );

  useEffect(() => {
    const refresh = () => {
      const current = getCurrentUser() || FALLBACK_USER;
      setUser(current);
      setPreferences(current.preferences || getDefaultPreferences());
    };

    window.addEventListener(AUTH_EVENTS.CHANGED, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(AUTH_EVENTS.CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const effectiveUser = useMemo(() => {
    return {
      ...user,
      preferences
    };
  }, [preferences, user]);

  const handlePreferences = (next) => {
    setPreferences((prev) => {
      const merged = { ...prev, ...next };
      if (effectiveUser?.email && effectiveUser.email !== FALLBACK_USER.email) {
        updateCurrentUserPreferences(next);
      }
      return merged;
    });
  };

  const handleProfile = (next) => {
    setUser((prev) => {
      const merged = { ...prev, ...next };
      if (merged?.email && merged.email !== FALLBACK_USER.email) {
        updateCurrentUserProfile(next);
      }
      return merged;
    });
  };

  return (
    <LegacySettingsPage
      user={effectiveUser}
      preferences={preferences}
      onUpdatePreferences={handlePreferences}
      onUpdateProfile={handleProfile}
    />
  );
}
