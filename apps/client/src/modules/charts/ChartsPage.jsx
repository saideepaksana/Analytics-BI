import React, { useState, useEffect, useCallback } from "react";
import { PlusCircle, BarChart3, Plus, Loader2 } from "lucide-react";
import ChartCard from "./ChartCard";
import ChartExplore from "./components/ChartExplore";
import ChartPreview from "./components/ChartPreview";
import { fetchCharts, deleteChartData, queryDataset } from "../../services/charts.service";
import { canCreateChart } from "../../core/utils/permissions";
import { getRequestErrorMessage } from "../../core/http/apiClient";
import "./styles/charts.css";

export default function ChartsPage({ onExploreMode }) {
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exploreChartId, setExploreChartId] = useState(null); // null = grid, "new" = new chart, <id> = edit
  const [viewChart, setViewChart] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState(null);

  const loadCharts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCharts();
      setCharts(data.charts || []);
      setError(null);
    } catch (err) {
      setError("Failed to load charts from server.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCharts();
  }, [loadCharts]);

  // Signal parent when we're in explore mode
  useEffect(() => {
    onExploreMode?.(exploreChartId !== null);
  }, [exploreChartId, onExploreMode]);

  const handleDeleteChart = async (id) => {
    try {
      await deleteChartData(id);
      setCharts(charts.filter(c => c.chartId !== id && c._id !== id));
    } catch (err) {
      const msg = getRequestErrorMessage(err, 'Failed to delete chart');
      setError(msg);
      console.error("Delete failed", err);
      setTimeout(() => setError(null), 6000);
    }
  };

  const handleBackFromExplore = () => {
    setExploreChartId(null);
    loadCharts(); // Refresh list after editing
  };

  useEffect(() => {
    const fetchViewData = async () => {
      if (!viewChart) return;
      setViewLoading(true);
      setViewError(null);
      try {
        const datasetId = viewChart.dataSource?.datasetId || viewChart.datasetId;
        if (!datasetId) {
          setViewError("No data source found");
          return;
        }

        const chartType = viewChart.visualization?.type || viewChart.type;
        const isScatter = chartType === "scatter";
        const isLineOrArea = chartType === "line" || chartType === "area";
        const hasRawMetric = (viewChart.query?.measures || []).some(
          (m) => (m.aggregation || "").toUpperCase() === "RAW"
        );

        let query = viewChart.query || {};
        if (isScatter || (isLineOrArea && hasRawMetric)) {
          query = {
            ...query,
            raw: true,
            dimensions: viewChart.query?.dimensions || [],
            measures: viewChart.query?.measures || [],
            groupBy: [],
            orderBy: [],
          };
        }

        const response = await queryDataset(datasetId, query);
        setViewData(response.results || []);
      } catch (err) {
        setViewError("Failed to load chart data");
        console.error(err);
      } finally {
        setViewLoading(false);
      }
    };

    fetchViewData();
  }, [viewChart]);

  // ── Explore View ──
  if (exploreChartId !== null) {
    return (
      <ChartExplore
        key={exploreChartId}
        chartId={exploreChartId}
        onBack={handleBackFromExplore}
      />
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="charts-page loading-center">
        <Loader2 className="spinner" size={48} />
        <p>Loading your visualizations...</p>
      </div>
    );
  }

  // ── Empty State ──
  if (charts.length === 0) {
    return (
      <div className="charts-page">
        <div className="empty-charts-container">
          <div className="empty-charts-icon">
            <BarChart3 size={64} opacity={0.8} />
          </div>
          <h2>No charts created yet</h2>
          <p>
            Create your first data visualization by selecting a dataset and
            configuring your chart settings.
          </p>
          {canCreateChart() && (
            <button className="create-chart-btn" onClick={() => setExploreChartId("new")}>
              <PlusCircle size={20} />
              Create your first chart
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Grid View ──
  return (
    <div className="charts-page">
      <div className="charts-grid-header">
        <h3>Saved Charts ({charts.length})</h3>
        {canCreateChart() && (
          <button className="create-chart-btn" onClick={() => setExploreChartId("new")} style={{ padding: "8px 16px" }}>
            <Plus size={18} />
            New Chart
          </button>
        )}
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="charts-grid">
        {charts.map((chart) => (
          <ChartCard
            key={chart.chartId || chart._id}
            chart={chart}
            onDelete={() => handleDeleteChart(chart.chartId || chart._id)}
            onView={() => setViewChart(chart)}
            onEdit={() => setExploreChartId(chart.chartId || chart._id)}
          />
        ))}
      </div>

      {viewChart && (
        <div className="chart-view-overlay" onClick={() => setViewChart(null)}>
          <div className="chart-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-view-header">
              <div>
                <h3>{viewChart.name}</h3>
                <p>{viewChart.visualization?.type || viewChart.type || "chart"}</p>
              </div>
              <button
                className="chart-view-close"
                onClick={() => setViewChart(null)}
                aria-label="Close popup"
                title="Close"
              >
                X
              </button>
            </div>

            <div className="chart-view-content">
              {viewLoading ? (
                <div className="chart-loading">
                  <Loader2 className="spinner" size={32} />
                </div>
              ) : viewError ? (
                <div className="chart-error">{viewError}</div>
              ) : (
                <ChartPreview
                  type={viewChart.visualization?.type || viewChart.type}
                  data={viewData}
                  dimensions={viewChart.query?.dimensions?.map((d) => d.field || d) || []}
                  measures={viewChart.query?.measures || []}
                  style={viewChart.style}
                  title={viewChart.name}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
