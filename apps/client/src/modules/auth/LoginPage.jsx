import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { login } from "../../core/utils/auth";
import "./LoginPage.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "editor", "viewer"];

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setError("");
    login(trimmedEmail, role);
    onLogin?.();
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-bg-orb orb-1" />
      <div className="login-bg-orb orb-2" />
      <div className="login-bg-orb orb-3" />

      <div className="login-card">
        <div className="login-card-logo">
          <Sparkles size={24} />
        </div>

        <h1>Analytics BI</h1>
        <p className="login-subtitle">Sign in to your data intelligence platform</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              autoFocus
              autoComplete="email"
            />
            <div className="login-error">{error || ""}</div>
          </div>

          <div className="login-field">
            <label>Role</label>
            <div className="login-role-badges">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`login-role-badge ${role === r ? "selected" : ""}`}
                  onClick={() => setRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={!email.trim()}
          >
            Sign in
          </button>
        </form>

        <p className="login-footer">Mock authentication &bull; No real credentials required</p>
      </div>
    </div>
  );
}
