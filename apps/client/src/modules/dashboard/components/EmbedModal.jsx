import React, { useState } from "react";
import { X, Code, Loader2, Copy, CheckCircle, Globe } from "lucide-react";
import { generateEmbedToken } from "../../../services/export.service";

export default function EmbedModal({ dashboardId, dashboardName, onClose }) {
  const [loading, setLoading] = useState(false);
  const [expirationHours, setExpirationHours] = useState(24);
  const [allowedOrigins, setAllowedOrigins] = useState(
    window.location.origin
  );
  const [embedData, setEmbedData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const origins = allowedOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

      const data = await generateEmbedToken({
        dashboardId,
        expirationHours,
        allowedOrigins: origins,
      });

      setEmbedData(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to generate embed token");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dashboard-library-drawer-overlay" style={{ zIndex: 2000 }}>
      <div className="dashboard-library-drawer" style={{ width: "500px" }}>
        <div className="dashboard-library-drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Code size={18} style={{ color: "var(--accent, #3b82f6)" }} />
            <h4 style={{ margin: 0 }}>Embed Dashboard</h4>
          </div>
          <button type="button" className="dashboard-widget-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="dashboard-library-list" style={{ padding: "20px" }}>
          <p style={{ fontSize: "13px", color: "var(--fg-2, #a0a0a0)", marginBottom: "20px" }}>
            Generate a secure token to embed the <strong>{dashboardName}</strong> dashboard in your own application using an iframe.
          </p>

          <form onSubmit={handleGenerate} style={{ marginBottom: "24px" }}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>
                Expiration (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="720"
                value={expirationHours}
                onChange={(e) => setExpirationHours(parseInt(e.target.value))}
                style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>
                Allowed Origins (comma-separated URLs)
              </label>
              <input
                type="text"
                value={allowedOrigins}
                onChange={(e) => setAllowedOrigins(e.target.value)}
                placeholder="https://your-app.com"
                style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)" }}
              />
              <span style={{ fontSize: "10px", color: "var(--fg-3, #666)", marginTop: "4px", display: "block" }}>
                For security, embedding will only work on these domains.
              </span>
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="dashboard-primary-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? <Loader2 size={16} className="spinner" /> : "Generate Embed Link"}
            </button>
          </form>

          {embedData && (
            <div style={{ marginTop: "24px" }}>
              <h5 style={{ fontSize: "14px", marginBottom: "12px", color: "var(--fg-1, #e0e0e0)" }}>Iframe Snippet</h5>
              <div style={{ position: "relative", background: "var(--bg-1, #0b0f19)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border, #333)" }}>
                <pre style={{ margin: 0, fontSize: "11px", color: "var(--accent, #3b82f6)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {embedData.iframeSnippet}
                </pre>
                <button
                  onClick={() => copyToClipboard(embedData.iframeSnippet)}
                  style={{ position: "absolute", top: "8px", right: "8px", background: "var(--bg-3, #1e2126)", border: "1px solid var(--border, #333)", borderRadius: "4px", padding: "4px", cursor: "pointer", color: "var(--fg-2, #a0a0a0)" }}
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
              </div>

              <div style={{ marginTop: "16px", padding: "12px", background: "rgba(59, 130, 246, 0.1)", borderRadius: "6px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Globe size={14} style={{ color: "var(--accent, #3b82f6)" }} />
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--fg-1, #e0e0e0)" }}>Embed URL</span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--fg-2, #a0a0a0)", margin: 0, wordBreak: "break-all" }}>
                  {embedData.embedUrl}
                </p>
              </div>

              <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--fg-3, #666)" }}>
                Token expires on: {new Date(embedData.expiresAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
