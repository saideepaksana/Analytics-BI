import React from "react";
import { LayoutDashboard, Edit2, Eye, Trash2 } from "lucide-react";

export default function DashboardCard({ dashboard }) {
  const handleView = () => {
    console.log("View dashboard: ", dashboard.id);
  };

  const handleEdit = () => {
    console.log("Edit dashboard: ", dashboard.id);
  };

  const handleDelete = () => {
    console.log("Delete dashboard: ", dashboard.id);
  };

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-preview">
        <LayoutDashboard size={48} opacity={0.3} />
      </div>
      <div className="dashboard-card-details">
        <div>
          <h4 className="dashboard-card-title">{dashboard.title}</h4>
          <div className="dashboard-card-meta">
            <span>{dashboard.widgetCount} widgets</span>
            <span>{dashboard.updatedAt}</span>
          </div>
        </div>
        <div className="dashboard-card-actions">
          <button className="dashboard-action-btn" onClick={handleView}>
            <Eye size={14} /> View
          </button>
          <button className="dashboard-action-btn" onClick={handleEdit}>
            <Edit2 size={14} /> Edit
          </button>
          <button 
            className="dashboard-action-btn" 
            onClick={handleDelete}
            style={{ color: "var(--danger-color, #ef4444)" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
