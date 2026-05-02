import React from "react";
import { Edit2, Eye, Trash2, LayoutDashboard, Send, FileEdit, FileText } from "lucide-react";
import { canDeleteDashboard, canEditDashboard, canPublishDashboard } from "../../../core/utils/permissions";

const formatUpdatedAt = (value) => {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved yet";
  return date.toLocaleDateString();
};

export default function DashboardCard({ dashboard, charts = [], onView, onEdit, onDelete, onPublish, onUnpublish }) {
  const previewWidgets = dashboard.tabs && dashboard.tabs.length > 0 
    ? dashboard.tabs[0].widgets 
    : (Array.isArray(dashboard.widgets) ? dashboard.widgets : (Array.isArray(dashboard.layout) ? dashboard.layout : []));
  const widgetCount = Array.isArray(previewWidgets) ? previewWidgets.length : 0;

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 className="dashboard-card-title">{dashboard.name}</h4>
            {dashboard.status === 'draft' ? (
              <span style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'rgba(245,158,11,0.18)',
                color: '#f59e0b',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>DRAFT</span>
            ) : (
              <span style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'rgba(16,185,129,0.14)',
                color: '#10b981',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid rgba(16,185,129,0.25)',
              }}>LIVE</span>
            )}
          </div>
          <div className="dashboard-card-meta">
            <span>{widgetCount} widgets</span>
            <span>Updated {formatUpdatedAt(dashboard.updatedAt)}</span>
            {dashboard.createdBy && dashboard.createdBy !== 'anonymous' && (
              <span title={`Owner: ${dashboard.createdBy}`}>by {dashboard.createdBy.split('@')[0]}</span>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-card-body">
        <div className="dashboard-card-preview" style={{ padding: 0, overflow: 'hidden' }}>
          {dashboard.thumbnail ? (
            <img 
              src={dashboard.thumbnail} 
              alt="Dashboard Preview" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            <div className="preview-empty-state">
              <LayoutDashboard size={18} />
              <span>No preview available</span>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-card-actions">
        <button className="chart-action-btn" title="View Dashboard" onClick={onView}>
          <Eye size={16} />
        </button>
        {canEditDashboard(dashboard) && (
          <button className="chart-action-btn" title="Edit Dashboard" onClick={onEdit}>
            <Edit2 size={16} />
          </button>
        )}
        {canPublishDashboard(dashboard) && dashboard.status === 'draft' && (
          <button className="chart-action-btn success" title="Publish Dashboard" onClick={onPublish}>
            <Send size={16} />
          </button>
        )}
        {canPublishDashboard(dashboard) && dashboard.status === 'published' && (
          <button className="chart-action-btn" title="Revert to Draft" onClick={onUnpublish}>
            <FileEdit size={16} />
          </button>
        )}
        {canDeleteDashboard(dashboard) && (
          <button className="chart-action-btn danger" title="Delete Dashboard" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
