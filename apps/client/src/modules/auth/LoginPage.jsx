import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../../core/utils/auth";
import "./LoginPage.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "editor", "viewer"];

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    if (password.trim().length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setError("");
    const user = login(trimmedEmail, role, {
      fullName: trimmedEmail.split("@")[0],
    });

    onLogin?.(user);

    const next = searchParams.get("next") || "/app/home";
    navigate(next, { replace: true });
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
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              autoComplete="current-password"
            />
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
            disabled={!email.trim() || !password.trim()}
          >
            Sign in
          </button>
        </form>

        <div className="login-auth-switch">
          <span>New here?</span>
          <Link to="/auth/signup">Create account</Link>
        </div>

        <p className="login-footer">Mock authentication &bull; No real credentials required</p>
      </div>
    </div>
  );
}
