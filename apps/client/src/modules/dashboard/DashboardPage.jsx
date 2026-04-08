import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Plus, PlusCircle, Loader2 } from "lucide-react";
import DashboardCard from "./components/DashboardCard";
import DashboardEditor from "./components/DashboardEditor";
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  updateDashboard,
} from "../../services/dashboard.service";
import { fetchCharts } from "../../services/charts.service";
import "./styles/dashboard.css";

const EMPTY_DRAFT = {
  name: "Untitled Dashboard",
  widgets: [],
};

export default function DashboardPage({ onEditorMode }) {
  const [dashboards, setDashboards] = useState([]);
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editorState, setEditorState] = useState({ mode: null, dashboard: null });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedDashboards, loadedCharts] = await Promise.all([
        listDashboards(),
        fetchCharts().then((response) => response.charts || []),
      ]);
      setDashboards(loadedDashboards);
      setCharts(loadedCharts);
      setError(null);
    } catch (err) {
      setError("Failed to load dashboards. Please refresh.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isEditorOpen = editorState.mode !== null;

  useEffect(() => {
    onEditorMode?.(isEditorOpen);
    return () => onEditorMode?.(false);
  }, [isEditorOpen, onEditorMode]);

  const activeDashboard = useMemo(() => editorState.dashboard || EMPTY_DRAFT, [editorState.dashboard]);

  const openNewDashboard = () => {
    setEditorState({ mode: "edit", dashboard: { ...EMPTY_DRAFT } });
  };

  const openEditDashboard = (dashboard) => {
    setEditorState({ mode: "edit", dashboard });
  };

  const openViewDashboard = (dashboard) => {
    setEditorState({ mode: "view", dashboard });
  };

  const closeEditor = () => {
    setEditorState({ mode: null, dashboard: null });
  };

  const handleDeleteDashboard = async (dashboardId) => {
    try {
      await deleteDashboard(dashboardId);
      setDashboards((previous) => previous.filter((dashboard) => dashboard.id !== dashboardId));
      if (editorState.dashboard?.id === dashboardId) {
        closeEditor();
      }
    } catch (err) {
      console.error("Failed to delete dashboard", err);
    }
  };

  const handleSaveDashboard = async (payload) => {
    setSaving(true);
    try {
      if (payload.id) {
        const updated = await updateDashboard(payload.id, payload);
        setDashboards((previous) => previous.map((dashboard) => (dashboard.id === updated.id ? updated : dashboard)));
      } else {
        const created = await createDashboard(payload);
        setDashboards((previous) => [created, ...previous]);
      }
      closeEditor();
    } catch (err) {
      console.error("Failed to save dashboard", err);
      setError("Unable to save dashboard. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (isEditorOpen) {
    return (
      <DashboardEditor
        key={`${editorState.mode}-${activeDashboard.id || "new"}`}
        mode={editorState.mode}
        dashboard={activeDashboard}
        charts={charts}
        saving={saving}
        onBack={closeEditor}
        onSave={handleSaveDashboard}
        onDelete={handleDeleteDashboard}
      />
    );
  }

  if (loading) {
    return (
      <div className="dashboards-page loading-center">
        <Loader2 className="spinner" size={48} />
        <p>Loading dashboards...</p>
      </div>
    );
  }

  if (dashboards.length === 0) {
    return (
      <div className="dashboards-page">
        <div className="empty-charts-container">
          <div className="empty-charts-icon">
            <LayoutDashboard size={64} opacity={0.8} />
          </div>
          <h2>No dashboards created yet</h2>
          <p>Create dashboard galleries from your saved charts and resize each panel to fit your analysis.</p>
          <button className="create-chart-btn" onClick={openNewDashboard}>
            <PlusCircle size={20} />
            Create your first dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboards-page">
      <div className="charts-grid-header">
        <h3>Saved Dashboards ({dashboards.length})</h3>
        <button className="create-chart-btn" onClick={openNewDashboard} style={{ padding: "8px 16px" }}>
          <Plus size={18} />
          New Dashboard
        </button>
      </div>

      {error ? <div className="page-error">{error}</div> : null}

      <div className="dashboards-grid">
        {dashboards.map((dashboard) => (
          <DashboardCard
            key={dashboard.id}
            dashboard={dashboard}
            onView={() => openViewDashboard(dashboard)}
            onEdit={() => openEditDashboard(dashboard)}
            onDelete={() => handleDeleteDashboard(dashboard.id)}
          />
        ))}
      </div>
    </div>
  );
}
