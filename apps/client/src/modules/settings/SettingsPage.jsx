import { useEffect, useState } from "react";
import {
  Brush,
  LayoutTemplate,
  MoonStar,
  Palette,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import "./SettingsPage.css";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const ACCENT_OPTIONS = [
  { value: "teal", label: "Teal" },
  { value: "amber", label: "Amber" },
  { value: "rose", label: "Rose" },
  { value: "indigo", label: "Indigo" },
];

export default function SettingsPage({
  user,
  preferences,
  onUpdatePreferences,
  onUpdateProfile,
}) {
  const [profileDraft, setProfileDraft] = useState({
    fullName: user?.fullName || "",
    company: user?.company || "",
  });
  const [preferencesDraft, setPreferencesDraft] = useState(preferences);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setProfileDraft({
      fullName: user?.fullName || "",
      company: user?.company || "",
    });
  }, [user?.fullName, user?.company]);

  useEffect(() => {
    setPreferencesDraft(preferences);
  }, [preferences]);

  const updatePreference = (field, value) => {
    setPreferencesDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
    setStatus("");
  };

  const saveProfile = () => {
    onUpdateProfile?.(profileDraft);
    setStatus("Profile updated");
  };

  const savePreferences = () => {
    onUpdatePreferences?.(preferencesDraft);
    setStatus("Preferences saved");
  };

  return (
    <section className="settings-page">
      <div className="settings-card">
        <div className="settings-card-head">
          <h3>
            <UserRound size={18} />
            Account
          </h3>
          <span className="settings-role-pill">{user?.role || "viewer"}</span>
        </div>

        <div className="settings-grid two-col">
          <label className="settings-field">
            <span>Display name</span>
            <input
              type="text"
              value={profileDraft.fullName}
              onChange={(event) => {
                setProfileDraft((previous) => ({
                  ...previous,
                  fullName: event.target.value,
                }));
                setStatus("");
              }}
              placeholder="Your full name"
            />
          </label>

          <label className="settings-field">
            <span>Company</span>
            <input
              type="text"
              value={profileDraft.company}
              onChange={(event) => {
                setProfileDraft((previous) => ({
                  ...previous,
                  company: event.target.value,
                }));
                setStatus("");
              }}
              placeholder="Organization name"
            />
          </label>
        </div>

        <p className="settings-meta">
          <ShieldCheck size={14} />
          Signed in as {user?.email || "unknown"}
        </p>

        <button type="button" className="settings-save-btn" onClick={saveProfile}>
          <Save size={14} />
          Save Profile
        </button>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>
            <Brush size={18} />
            Personalization
          </h3>
        </div>

        <div className="settings-grid two-col">
          <label className="settings-field">
            <span>
              <MoonStar size={14} />
              Theme mode
            </span>
            <select
              value={preferencesDraft.theme}
              onChange={(event) => updatePreference("theme", event.target.value)}
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>
              <LayoutTemplate size={14} />
              Density
            </span>
            <select
              value={preferencesDraft.density}
              onChange={(event) => updatePreference("density", event.target.value)}
            >
              {DENSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>
              <Palette size={14} />
              Accent color
            </span>
            <select
              value={preferencesDraft.accent}
              onChange={(event) => updatePreference("accent", event.target.value)}
            >
              {ACCENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={Boolean(preferencesDraft.reduceMotion)}
              onChange={(event) => updatePreference("reduceMotion", event.target.checked)}
            />
            <div>
              <strong>Reduce motion</strong>
              <p>Use fewer transitions and animated effects</p>
            </div>
          </label>
        </div>

        <button type="button" className="settings-save-btn" onClick={savePreferences}>
          <Save size={14} />
          Save Preferences
        </button>
      </div>

      {status ? <p className="settings-status">{status}</p> : null}
    </section>
  );
}
