import React, { useState, useEffect } from "react";
import { X, History, Loader2, Download, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { getDashboardExportHistory } from "../../../services/export.service";

export default function ExportHistoryModal({ dashboardId, onClose, onRestoreState }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [dashboardId]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await getDashboardExportHistory(dashboardId);
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch export history", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="dashboard-library-drawer-overlay" style={{ zIndex: 2000 }}>
      <div className="dashboard-library-drawer" style={{ width: "450px" }}>
        <div className="dashboard-library-drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <History size={18} style={{ color: "var(--accent, #3b82f6)" }} />
            <h4 style={{ margin: 0 }}>Export History</h4>
          </div>
          <button type="button" className="dashboard-widget-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="dashboard-library-list" style={{ padding: "20px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
              <Loader2 size={24} className="spinner" />
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--fg-3, #666)", fontSize: "13px" }}>
              No past exports found for this dashboard.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {logs.map((log) => (
                <div key={log._id || log.jobId} style={{ 
                  padding: "16px", 
                  background: "var(--bg-2, #161920)", 
                  borderRadius: "8px", 
                  border: "1px solid var(--border, #333)",
                  display: "flex", 
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--fg-1, #e0e0e0)", display: "flex", alignItems: "center", gap: "6px" }}>
                        {log.format.toUpperCase()} Export
                        {log.status === "completed" ? (
                          <CheckCircle size={14} style={{ color: "#10b981" }} />
                        ) : log.status === "failed" ? (
                          <AlertCircle size={14} style={{ color: "#ef4444" }} />
                        ) : (
                          <Loader2 size={14} className="spinner" style={{ color: "#3b82f6" }} />
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--fg-3, #666)", marginTop: "4px" }}>
                        {formatDate(log.exportedAt)} • By {log.exportedBy}
                      </div>
                    </div>
                    {log.status === "completed" && log.downloadUrl && (
                      <a 
                        href={log.downloadUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="dashboard-primary-btn"
                        style={{ padding: "6px 12px", fontSize: "12px", gap: "6px", textDecoration: "none" }}
                        title="Download File"
                      >
                        <Download size={14} /> Download
                      </a>
                    )}
                  </div>
                  
                  {log.status === "failed" && log.failureReason && (
                    <div style={{ fontSize: "12px", color: "#ef4444", background: "rgba(239, 68, 68, 0.1)", padding: "8px", borderRadius: "4px" }}>
                      Error: {log.failureReason}
                    </div>
                  )}

                  {log.exportState && onRestoreState && (
                    <div style={{ marginTop: "4px", borderTop: "1px solid var(--border, #333)", paddingTop: "10px" }}>
                      <button 
                        onClick={() => {
                          if (window.confirm("This will replace your current dashboard filters with the ones from this export. Continue?")) {
                            onRestoreState(log.exportState);
                            onClose();
                          }
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent, #3b82f6)",
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: 0
                        }}
                        onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"}
                        onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}
                      >
                        <RefreshCw size={12} />
                        Restore Dashboard State
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
