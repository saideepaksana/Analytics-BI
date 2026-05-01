import React, { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getDefaultPreferences, signup } from "../../core/utils/auth";
import "./LoginPage.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "editor", "viewer"];

export default function SignUpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    fullName: "",
    company: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "viewer",
  });
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return (
      form.fullName.trim() &&
      form.company.trim() &&
      form.email.trim() &&
      form.password.trim() &&
      form.confirmPassword.trim()
    );
  }, [form]);

  const updateField = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
    if (error) {
      setError("");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const normalizedEmail = form.email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("Please provide a valid company email");
      return;
    }

    if (form.password.trim().length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    signup({
      email: normalizedEmail,
      role: form.role,
      fullName: form.fullName.trim(),
      company: form.company.trim(),
      preferences: getDefaultPreferences(),
    });

    const next = searchParams.get("next") || "/app/home";
    navigate(next, { replace: true });
  };

  return (
    <div className="login-page">
      <div className="login-bg-orb orb-1" />
      <div className="login-bg-orb orb-2" />
      <div className="login-bg-orb orb-3" />

      <div className="login-card">
        <div className="login-card-logo">
          <Sparkles size={24} />
        </div>

        <h1>Create Workspace Account</h1>
        <p className="login-subtitle">Set your role and start with a personalized BI workspace</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              type="text"
              placeholder="Alex Morgan"
              value={form.fullName}
              onChange={(event) => updateField("fullName", event.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="login-field">
            <label htmlFor="signup-company">Company</label>
            <input
              id="signup-company"
              type="text"
              placeholder="Acme Analytics"
              value={form.company}
              onChange={(event) => updateField("company", event.target.value)}
              autoComplete="organization"
            />
          </div>

          <div className="login-field">
            <label htmlFor="signup-email">Work email</label>
            <input
              id="signup-email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="login-field">
            <label htmlFor="signup-password-confirm">Confirm password</label>
            <input
              id="signup-password-confirm"
              type="password"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              autoComplete="new-password"
            />
            <div className="login-error">{error || ""}</div>
          </div>

          <div className="login-field">
            <label>Role</label>
            <div className="login-role-badges">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`login-role-badge ${form.role === role ? "selected" : ""}`}
                  onClick={() => updateField("role", role)}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={!canSubmit}>
            Create account
          </button>
        </form>

        <div className="login-auth-switch">
          <span>Already have an account?</span>
          <Link to="/auth/login">Sign in</Link>
        </div>

        <p className="login-footer">Mock signup with role-aware profile for enterprise testing</p>
      </div>
    </div>
  );
}
