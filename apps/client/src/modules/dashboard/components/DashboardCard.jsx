import React from "react";
import { Edit2, Eye, Trash2, LayoutDashboard } from "lucide-react";

const formatUpdatedAt = (value) => {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved yet";
  return date.toLocaleDateString();
};

export default function DashboardCard({ dashboard, onView, onEdit, onDelete }) {
  const widgetCount = Array.isArray(dashboard.widgets) ? dashboard.widgets.length : 0;

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <div>
          <h4 className="dashboard-card-title">{dashboard.name}</h4>
          <div className="dashboard-card-meta">
            <span>{widgetCount} widgets</span>
            <span>Updated {formatUpdatedAt(dashboard.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card-body">
        <div className="dashboard-card-preview">
          <div className="preview-pill" />
          <div className="preview-grid">
            {Array.from({ length: Math.min(6, Math.max(widgetCount, 2)) }).map((_, index) => (
              <div key={`${dashboard.id}-preview-${index}`} className="preview-tile" />
            ))}
          </div>
          {widgetCount === 0 ? (
            <div className="preview-empty-state">
              <LayoutDashboard size={18} />
              <span>No charts added yet</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dashboard-card-actions">
        <button className="chart-action-btn" title="View Dashboard" onClick={onView}>
          <Eye size={16} />
        </button>
        <button className="chart-action-btn" title="Edit Dashboard" onClick={onEdit}>
          <Edit2 size={16} />
        </button>
        <button className="chart-action-btn danger" title="Delete Dashboard" onClick={onDelete}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
