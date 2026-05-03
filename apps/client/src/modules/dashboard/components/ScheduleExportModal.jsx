import React, { useState, useEffect } from "react";
import { X, Clock, Loader2, Calendar, Mail, Trash2, CheckCircle } from "lucide-react";
import { createExportSchedule, listExportSchedules, deleteExportSchedule } from "../../../services/export.service";

export default function ScheduleExportModal({ dashboardId, dashboardName, tabs, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(`${dashboardName} Schedule`);
  const [frequency, setFrequency] = useState("daily");
  const [format, setFormat] = useState("pdf");
  const [selectedTabs, setSelectedTabs] = useState([]);
  const [recipients, setRecipients] = useState("");
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    fetchSchedules();
    // Default to all tabs selected
    if (tabs && tabs.length > 0) {
      setSelectedTabs(tabs.map(t => t.id || t._id));
    }
  }, [dashboardId, tabs]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await listExportSchedules(dashboardId);
      setSchedules(data.schedules || []);
    } catch (err) {
      console.error("Failed to fetch schedules", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const recipientList = recipients
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      await createExportSchedule({
        dashboardId,
        name,
        frequency,
        format,
        selectedTabs,
        recipients: recipientList,
      });

      setSuccessMsg("Schedule created successfully!");
      setRecipients("");
      fetchSchedules();
    } catch (err) {
      setError(err.message || "Failed to create schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this schedule?")) return;
    try {
      await deleteExportSchedule(id);
      fetchSchedules();
    } catch (err) {
      alert("Failed to delete schedule");
    }
  };

  return (
    <div className="dashboard-library-drawer-overlay" style={{ zIndex: 2000 }}>
      <div className="dashboard-library-drawer" style={{ width: "450px" }}>
        <div className="dashboard-library-drawer-head">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Clock size={18} style={{ color: "var(--accent, #3b82f6)" }} />
            <h4 style={{ margin: 0 }}>Scheduled Deliveries</h4>
          </div>
          <button type="button" className="dashboard-widget-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="dashboard-library-list" style={{ padding: "20px" }}>
          {/* New Schedule Form */}
          <form onSubmit={handleCreate} style={{ marginBottom: "30px", padding: "16px", background: "var(--bg-3, #1e2126)", borderRadius: "8px", border: "1px solid var(--border, #333)" }}>
            <h5 style={{ marginTop: 0, marginBottom: "16px", fontSize: "14px", color: "var(--fg-1, #e0e0e0)" }}>Create New Schedule</h5>
            
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>Schedule Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)" }}
                required
              />
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>Frequency</label>
                <select 
                  value={frequency} 
                  onChange={(e) => setFrequency(e.target.value)}
                  style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)" }}
                >
                  <option value="daily">Daily (6 AM)</option>
                  <option value="weekly">Weekly (Mon 6 AM)</option>
                  <option value="monthly">Monthly (1st 6 AM)</option>
                  <option value="test">Test (Every minute)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>Format</label>
                <select 
                  value={format} 
                  onChange={(e) => setFormat(e.target.value)}
                  style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)" }}
                >
                  <option value="pdf">PDF Document</option>
                  <option value="png">PNG Image</option>
                </select>
              </div>
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "8px", color: "var(--fg-2, #a0a0a0)" }}>Select Tabs to Export</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "120px", overflowY: "auto", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px" }}>
                {(tabs || []).map((tab) => (
                  <label key={tab.id || tab._id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--fg-1, #e0e0e0)", cursor: "pointer" }}>
                    <input 
                      type="checkbox" 
                      checked={selectedTabs.includes(tab.id || tab._id)}
                      onChange={(e) => {
                        const id = tab.id || tab._id;
                        if (e.target.checked) {
                          setSelectedTabs([...selectedTabs, id]);
                        } else {
                          setSelectedTabs(selectedTabs.filter(tid => tid !== id));
                        }
                      }}
                    />
                    {tab.title || "Untitled Tab"}
                  </label>
                ))}
                {(tabs || []).length === 0 && <span style={{ fontSize: "11px", color: "#666" }}>No tabs found.</span>}
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--fg-2, #a0a0a0)" }}>Recipients (comma-separated emails)</label>
              <textarea 
                value={recipients} 
                onChange={(e) => setRecipients(e.target.value)} 
                placeholder="email1@example.com, email2@example.com"
                style={{ width: "100%", padding: "8px", background: "var(--bg-1, #0b0f19)", border: "1px solid var(--border, #333)", borderRadius: "4px", color: "var(--fg-1, #e0e0e0)", minHeight: "60px", fontSize: "12px" }}
              />
            </div>

            {error && <div style={{ color: "#ef4444", fontSize: "12px", marginBottom: "12px" }}>{error}</div>}
            {successMsg && <div style={{ color: "#10b981", fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "4px" }}><CheckCircle size={14} /> {successMsg}</div>}

            <button 
              type="submit" 
              disabled={submitting}
              className="dashboard-primary-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {submitting ? <Loader2 size={16} className="spinner" /> : "Create Schedule"}
            </button>
          </form>

          {/* Existing Schedules List */}
          <h5 style={{ marginBottom: "12px", fontSize: "14px", color: "var(--fg-1, #e0e0e0)" }}>Active Schedules</h5>
          
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "20px" }}>
              <Loader2 size={24} className="spinner" />
            </div>
          ) : schedules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "var(--fg-3, #666)", fontSize: "13px" }}>
              No active schedules for this dashboard.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {schedules.map((s) => (
                <div key={s._id} style={{ padding: "12px", background: "var(--bg-2, #161920)", borderRadius: "6px", border: "1px solid var(--border, #333)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--fg-1, #e0e0e0)" }}>{s.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--fg-3, #666)", marginTop: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ textTransform: "capitalize" }}>{s.frequency} • {s.format.toUpperCase()}</span>
                      {s.recipients?.length > 0 && (
                        <span title={s.recipients.join(", ")} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <Mail size={10} /> {s.recipients.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => handleDelete(s._id)}
                    style={{ background: "none", border: "none", color: "var(--fg-3, #666)", cursor: "pointer", padding: "6px" }}
                    onMouseOver={(e) => e.currentTarget.style.color = "#ef4444"}
                    onMouseOut={(e) => e.currentTarget.style.color = "var(--fg-3, #666)"}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
