import { useEffect, useState } from "react";
import {
  Brush,
  Lock,
  MoonStar,
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

export default function SettingsPage({
  user,
  preferences,
  onUpdatePreferences,
  onUpdateProfile,
}) {
  const [profileDraft, setProfileDraft] = useState({
    fullName: user?.fullName || "",
    company: user?.company || "",
    newPassword: "",
    confirmPassword: "",
  });
  const [preferencesDraft, setPreferencesDraft] = useState(preferences);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setProfileDraft({
      fullName: user?.fullName || "",
      company: user?.company || "",
      newPassword: "",
      confirmPassword: "",
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

        <div className="settings-grid two-col">
          <label className="settings-field">
            <span>
              <Lock size={14} />
              New Password
            </span>
            <input
              type="password"
              value={profileDraft.newPassword}
              onChange={(event) => {
                setProfileDraft((previous) => ({
                  ...previous,
                  newPassword: event.target.value,
                }));
                setStatus("");
              }}
              placeholder="Leave blank to keep current"
            />
          </label>

          <label className="settings-field">
            <span>
              <Lock size={14} />
              Confirm Password
            </span>
            <input
              type="password"
              value={profileDraft.confirmPassword}
              onChange={(event) => {
                setProfileDraft((previous) => ({
                  ...previous,
                  confirmPassword: event.target.value,
                }));
                setStatus("");
              }}
              placeholder="Confirm new password"
            />
          </label>
        </div>

        <p className="settings-meta">
          <ShieldCheck size={14} />
          Signed in as {user?.email || "unknown"}
        </p>

        <div className="settings-card-footer">
          <button type="button" className="settings-save-btn" onClick={saveProfile}>
            <Save size={14} />
            Save Profile
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <h3>
            <Brush size={18} />
            Personalization
          </h3>
        </div>

        <div className="settings-grid">
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
        </div>

        <div className="settings-card-footer">
          <button type="button" className="settings-save-btn" onClick={savePreferences}>
            <Save size={14} />
            Save Preferences
          </button>
        </div>
      </div>

      {status ? <p className="settings-status">{status}</p> : null}
    </section>
  );
}
