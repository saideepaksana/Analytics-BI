import React, { useState, useEffect, useCallback } from "react";
import { PlusCircle, BarChart3, Plus, Loader2 } from "lucide-react";
import ChartCard from "./ChartCard";
import ChartExplore from "./components/ChartExplore";
import { fetchCharts, deleteChartData } from "../../services/charts.service";
import "./styles/charts.css";

export default function ChartsPage({ onExploreMode }) {
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exploreChartId, setExploreChartId] = useState(null); // null = grid, "new" = new chart, <id> = edit

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
      console.error("Delete failed", err);
    }
  };

  const handleBackFromExplore = () => {
    setExploreChartId(null);
    loadCharts(); // Refresh list after editing
  };

  // ── Explore View ──
  if (exploreChartId !== null) {
    return (
      <ChartExplore
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
          <button className="create-chart-btn" onClick={() => setExploreChartId("new")}>
            <PlusCircle size={20} />
            Create your first chart
          </button>
        </div>
      </div>
    );
  }

  // ── Grid View ──
  return (
    <div className="charts-page">
      <div className="charts-grid-header">
        <h3>Saved Charts ({charts.length})</h3>
        <button className="create-chart-btn" onClick={() => setExploreChartId("new")} style={{ padding: "8px 16px" }}>
          <Plus size={18} />
          New Chart
        </button>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="charts-grid">
        {charts.map((chart) => (
          <ChartCard 
            key={chart.chartId || chart._id} 
            chart={chart} 
            onDelete={() => handleDeleteChart(chart.chartId || chart._id)}
            onEdit={() => setExploreChartId(chart.chartId || chart._id)}
          />
        ))}
      </div>
    </div>
  );
}
