import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Plus, PlusCircle, Loader2 } from "lucide-react";
import DashboardCard from "./components/DashboardCard";
import DashboardEditor from "./components/DashboardEditor";
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  updateDashboard,
  publishDashboard,
  unpublishDashboard,
} from "../../services/dashboard.service";
import { fetchCharts } from "../../services/charts.service";
import { canCreateDashboard } from "../../core/utils/permissions";
import "./styles/dashboard.css";

const EMPTY_DRAFT = {
  name: "Untitled Dashboard",
  widgets: [],
};

export default function DashboardPage({ onEditorMode }) {
  const [dashboards, setDashboards] = useState([]);
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
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
      setLoadError(null);
    } catch (err) {
      setLoadError("Failed to load dashboards. Please refresh.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-open dashboard from URL if 'id' param exists (used by Puppeteer)
  useEffect(() => {
    if (!loading && dashboards.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (id) {
        const dashboard = dashboards.find(d => d.id === id);
        if (dashboard) {
          openViewDashboard(dashboard);
        }
      }
    }
  }, [loading, dashboards]);

  const isEditorOpen = editorState.mode !== null;

  useEffect(() => {
    onEditorMode?.(isEditorOpen);
    return () => onEditorMode?.(false);
  }, [isEditorOpen, onEditorMode]);

  const activeDashboard = useMemo(() => editorState.dashboard || EMPTY_DRAFT, [editorState.dashboard]);

  const openNewDashboard = () => {
    setSaveError(null);
    setEditorState({ mode: "edit", dashboard: { ...EMPTY_DRAFT } });
  };

  const openViewDashboard = (dashboard) => {
    const firstTabId =
      Array.isArray(dashboard?.tabs) && dashboard.tabs.length > 0
        ? dashboard.tabs[0].id
        : dashboard?.activeTabId;

    setSaveError(null);
    setEditorState({
      mode: "view",
      dashboard: {
        ...dashboard,
        activeTabId: firstTabId,
      },
    });
  };

  const openEditDashboard = (dashboard) => {
    const firstTabId =
      Array.isArray(dashboard?.tabs) && dashboard.tabs.length > 0
        ? dashboard.tabs[0].id
        : dashboard?.activeTabId;

    setSaveError(null);
    setEditorState({
      mode: "edit",
      dashboard: {
        ...dashboard,
        activeTabId: firstTabId,
      },
    });
  };

  const closeEditor = () => {
    setSaveError(null);
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

  const handlePublishDashboard = async (dashboardId) => {
    try {
      const published = await publishDashboard(dashboardId);
      setDashboards((previous) => previous.map((d) => (d.id === published.id ? published : d)));
    } catch (err) {
      console.error("Failed to publish dashboard", err);
    }
  };

  const handleUnpublishDashboard = async (dashboardId) => {
    try {
      const unpublished = await unpublishDashboard(dashboardId);
      setDashboards((previous) => previous.map((d) => (d.id === unpublished.id ? unpublished : d)));
    } catch (err) {
      console.error("Failed to unpublish dashboard", err);
    }
  };

  const handleAutoSave = async (payload) => {
    if (!payload.id) return;
    try {
      const savedDashboard = await updateDashboard(payload.id, payload);
      setDashboards((previous) => previous.map((d) => (d.id === savedDashboard.id ? savedDashboard : d)));
    } catch (err) {
      console.error("Auto-save failed", err);
    }
  };

  const handleSaveDashboard = async (payload) => {
    setSaving(true);
    try {
      let savedDashboard;
      if (payload.id) {
        savedDashboard = await updateDashboard(payload.id, payload);
        setDashboards((previous) => previous.map((dashboard) => (dashboard.id === savedDashboard.id ? savedDashboard : dashboard)));
      } else {
        savedDashboard = await createDashboard(payload);
        setDashboards((previous) => [savedDashboard, ...previous]);
      }
      setSaveError(null);
      setEditorState({ mode: "view", dashboard: savedDashboard });
    } catch (err) {
      console.error("Failed to save dashboard", err);
      setSaveError("Unable to save dashboard. Try again.");
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
        saveError={saveError}
        onClearSaveError={() => setSaveError(null)}
        onBack={closeEditor}
        onSave={handleSaveDashboard}
        onAutoSave={handleAutoSave}
        onDelete={handleDeleteDashboard}
        onPublish={(published) => {
          setDashboards((prev) => prev.map((d) => (d.id === published.id ? published : d)));
          setEditorState((prev) => ({ ...prev, dashboard: published }));
        }}
        onUnpublish={(unpublished) => {
          setDashboards((prev) => prev.map((d) => (d.id === unpublished.id ? unpublished : d)));
          setEditorState((prev) => ({ ...prev, dashboard: unpublished }));
        }}
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
          {canCreateDashboard() && (
            <button className="create-chart-btn" onClick={openNewDashboard}>
              <PlusCircle size={20} />
              Create your first dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboards-page">
      <div className="charts-grid-header">
        <h3>Saved Dashboards ({dashboards.length})</h3>
        {canCreateDashboard() && (
          <button className="create-chart-btn" onClick={openNewDashboard} style={{ padding: "8px 16px" }}>
            <Plus size={18} />
            New Dashboard
          </button>
        )}
      </div>

      {loadError ? <div className="page-error">{loadError}</div> : null}

      <div className="dashboards-grid charts-grid">
        {dashboards.map((dashboard) => (
          <DashboardCard
            key={dashboard.id}
            dashboard={dashboard}
            charts={charts}
            onView={() => openViewDashboard(dashboard)}
            onEdit={() => openEditDashboard(dashboard)}
            onDelete={() => handleDeleteDashboard(dashboard.id)}
            onPublish={() => handlePublishDashboard(dashboard.id)}
            onUnpublish={() => handleUnpublishDashboard(dashboard.id)}
          />
        ))}
      </div>
    </div>
  );
}
