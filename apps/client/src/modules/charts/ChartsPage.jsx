import React, { useState } from "react";
import { PlusCircle, BarChart3, Plus } from "lucide-react";
import ChartCard from "./ChartCard";
import "./styles/charts.css";

export default function ChartsPage() {
  const [charts, setCharts] = useState([]);

  const handleCreateChart = () => {
    // For now, randomly generate a mock chart to populate the UI.
    const newChart = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Sample Chart ${charts.length + 1}`,
      type: ["Bar Chart", "Line Chart", "Pie Chart"][Math.floor(Math.random() * 3)],
      updatedAt: "Just now",
    };
    setCharts([newChart, ...charts]);
  };

  if (charts.length === 0) {
    return (
      <div className="charts-page">
        <div className="empty-charts-container">
          <div className="empty-charts-icon">
            <BarChart3 size={64} opacity={0.8} />
          </div>
          <h2>No charts created yet</h2>

          <button className="create-chart-btn" onClick={handleCreateChart}>
            <PlusCircle size={20} />
            Create your first chart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="charts-page">
      <div className="charts-grid-header">
        <h3>Saved Charts ({charts.length})</h3>
        <button className="create-chart-btn" onClick={handleCreateChart} style={{ padding: "8px 16px" }}>
          <Plus size={18} />
          New Chart
        </button>
      </div>

      <div className="charts-grid">
        {charts.map((chart) => (
          <ChartCard key={chart.id} chart={chart} />
        ))}
      </div>
    </div>
  );
}
