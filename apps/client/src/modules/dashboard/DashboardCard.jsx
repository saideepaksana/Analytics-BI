import React, { useState, useRef, useEffect } from "react";
import { LayoutDashboard, Edit2, Eye, Trash2 } from "lucide-react";
import { patchDashboardMetadata } from "../../services/dashboard.service";

export default function DashboardCard({ dashboard, onUpdate, onDelete, onClick }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [title, setTitle] = useState(dashboard.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleTitleSubmit = async () => {
    setIsEditing(false);
    if (!title.trim() || title === dashboard.title) {
      setTitle(dashboard.title);
      return;
    }
    
    // Optimistic update
    const updatedDashboard = { ...dashboard, title };
    onUpdate(updatedDashboard);

    try {
      const serverVersion = await patchDashboardMetadata(dashboard.id, { title });
      if (serverVersion && serverVersion.updatedAt) {
        onUpdate({ ...updatedDashboard, updatedAt: serverVersion.updatedAt });
      }
    } catch (err) {
      // 404 is ignored since no backend records exist for frontend-generated UUIDs yet.
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleTitleSubmit();
    if (e.key === "Escape") {
      setTitle(dashboard.title);
      setIsEditing(false);
    }
  };

  return (
    <div className="dashboard-card" style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column", transition: "transform 0.2s, box-shadow 0.2s", cursor: "pointer" }} onClick={onClick} onMouseOver={e => e.currentTarget.style.borderColor = "#6366f1"} onMouseOut={e => e.currentTarget.style.borderColor = "#334155"}>
      <div className="dashboard-card-preview" style={{ height: "140px", backgroundColor: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #334155" }}>
        <LayoutDashboard size={48} opacity={0.3} color="#94a3b8" />
      </div>
      <div className="dashboard-card-details" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {isEditing ? (
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: "16px", fontWeight: "600", color: "#f8fafc", background: "#0f172a", border: "1px solid #6366f1", borderRadius: "4px", padding: "4px 8px", outline: "none", width: "100%" }}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              style={{ fontSize: "16px", fontWeight: "600", color: "#f8fafc", cursor: "text", minHeight: "24px" }}
              title="Double click to edit title"
            >
              {dashboard.title}
            </span>
          )}
          {dashboard.description && (
            <span style={{ fontSize: "13px", color: "#94a3b8" }}>{dashboard.description}</span>
          )}
          <div className="dashboard-card-meta" style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            <span>{(dashboard.layout || []).length} charts</span>
            <span>Last updated: {new Date(dashboard.updatedAt || new Date()).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="dashboard-card-actions" style={{ display: "flex", gap: "8px", borderTop: "1px solid rgba(51, 65, 85, 0.5)", paddingTop: "16px", marginTop: "auto" }}>
          <button className="dashboard-action-btn" onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "rgba(99, 102, 241, 0.1)", color: "#a5b4fc", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}>
            <Eye size={14} /> View
          </button>
          <button className="dashboard-action-btn" onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "transparent", color: "#94a3b8", border: "1px solid #334155", padding: "8px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}>
            <Edit2 size={14} /> Edit
          </button>
          {showConfirmDelete ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(239, 68, 68, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
              <span style={{ fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>Are you sure?</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowConfirmDelete(false); }} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "12px", cursor: "pointer" }}>Yes</button>
              <button onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(false); }} style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: "4px", padding: "2px 8px", fontSize: "12px", cursor: "pointer" }}>No</button>
            </div>
          ) : (
            <button 
              className="dashboard-action-btn" 
              onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(true); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "#ef4444", border: "1px solid #334155", padding: "8px", borderRadius: "6px", cursor: "pointer" }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
