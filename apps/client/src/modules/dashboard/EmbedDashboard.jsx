import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import apiClient, { getRequestErrorMessage } from "../../core/http/apiClient";
import DashboardEditor from "./components/DashboardEditor";
import "./styles/dashboard.css";
import "./styles/embed-dashboard.css";

const defaultTab = (widgets = []) => ({
  id: `tab-${Date.now()}-${Math.round(Math.random() * 10000)}`,
  name: "Main",
  widgets: Array.isArray(widgets) ? widgets : [],
});

const normalizeTabs = (dashboard) => {
  if (Array.isArray(dashboard?.tabs) && dashboard.tabs.length > 0) {
    return dashboard.tabs.map((tab) => ({
      id: tab.id || `tab-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      name: tab.name || "Untitled Tab",
      widgets: Array.isArray(tab.widgets) ? tab.widgets : [],
    }));
  }

  return [defaultTab(dashboard?.widgets || dashboard?.layout || [])];
};

const normalizeDashboard = (dashboard, filters) => {
  const normalized = { ...dashboard };

  if (normalized.title && !normalized.name) {
    normalized.name = normalized.title;
  }

  const tabs = normalizeTabs(normalized);
  const activeTabId =
    tabs.some((tab) => tab.id === normalized.activeTabId)
      ? normalized.activeTabId
      : tabs[0]?.id;

  return {
    ...normalized,
    id: normalized._id || normalized.id,
    name: normalized.name || "Untitled Dashboard",
    tabs,
    activeTabId,
    widgets: tabs.flatMap((tab) => tab.widgets || []),
    filters: filters || normalized.filters || {},
  };
};

const normalizeCharts = (charts) => {
  if (Array.isArray(charts)) {
    return charts;
  }

  if (charts && typeof charts === "object") {
    return Object.values(charts);
  }

  return [];
};

export default function EmbedDashboard() {
  const { dashboardId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, setState] = useState({
    loading: true,
    error: "",
    dashboard: null,
    charts: [],
  });

  useEffect(() => {
    let cancelled = false;

    const loadEmbed = async () => {
      if (!dashboardId) {
        setState({ loading: false, error: "Missing dashboard id.", dashboard: null, charts: [] });
        return;
      }

      if (!token) {
        setState({ loading: false, error: "Missing embed token.", dashboard: null, charts: [] });
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: "" }));

      try {
        const response = await apiClient.get(`/export/embed/${dashboardId}`, {
          params: { token },
        });
        const payload = response?.data || {};

        if (!payload.dashboard) {
          throw new Error("Embed payload missing dashboard data.");
        }

        const dashboard = normalizeDashboard(payload.dashboard, payload.filters);
        const charts = normalizeCharts(payload.charts);

        if (!cancelled) {
          setState({ loading: false, error: "", dashboard, charts });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: getRequestErrorMessage(error, "Unable to load embedded dashboard."),
            dashboard: null,
            charts: [],
          });
        }
      }
    };

    loadEmbed();

    return () => {
      cancelled = true;
    };
  }, [dashboardId, token]);

  const content = useMemo(() => {
    if (state.loading) {
      return (
        <div className="embed-dashboard-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading dashboard...</p>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="embed-dashboard-state error">
          <h2>Unable to load embed</h2>
          <p>{state.error}</p>
        </div>
      );
    }

    if (!state.dashboard) {
      return (
        <div className="embed-dashboard-state error">
          <h2>Dashboard unavailable</h2>
          <p>No dashboard data was returned.</p>
        </div>
      );
    }

    return (
      <DashboardEditor
        mode="view"
        dashboard={state.dashboard}
        charts={state.charts}
        saving={false}
        saveError={null}
        onClearSaveError={() => {}}
        onBack={() => {}}
        onSave={() => {}}
        onAutoSave={() => {}}
        onPublish={() => {}}
        onUnpublish={() => {}}
        isEmbed
      />
    );
  }, [state]);

  return (
    <div className="embed-dashboard-page" data-embed="true">
      {content}
    </div>
  );
}
