import { useMemo, useState } from "react";
import { getDefaultPreferences } from "@analytics-bi/shared-lib";
import LegacySettingsPage from "../../../../client/src/modules/settings/SettingsPage.jsx";

const FALLBACK_USER = {
  email: "guest@analytics.local",
  role: "viewer",
  fullName: "Guest User",
  company: "Analytics BI",
  preferences: getDefaultPreferences()
};

export default function SettingsPage() {
  const [user, setUser] = useState(FALLBACK_USER);
  const [preferences, setPreferences] = useState(() => getDefaultPreferences());

  const effectiveUser = useMemo(() => {
    return {
      ...user,
      preferences
    };
  }, [preferences, user]);

  const handlePreferences = (next) => {
    setPreferences((prev) => ({ ...prev, ...next }));
  };

  const handleProfile = (next) => {
    setUser((prev) => ({ ...prev, ...next }));
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
