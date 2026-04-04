import React, { useState } from "react";
import { PlusCircle, BarChart3, Plus } from "lucide-react";
import ChartCard from "./ChartCard";
import ChartWizard from "./components/ChartWizard";
import "./styles/charts.css";

export default function ChartsPage() {
  const [charts, setCharts] = useState([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const handleCreateChart = () => {
    setIsWizardOpen(true);
  };

  const handleWizardComplete = (chartData) => {
    const newChart = {
      id: Math.random().toString(36).substr(2, 9),
      title: chartData.title || `Sample Chart ${charts.length + 1}`,
      type: ["Bar Chart", "Line Chart", "Pie Chart"][Math.floor(Math.random() * 3)],
      datasetId: chartData.datasetId,
      updatedAt: "Just now",
    };
    setCharts([newChart, ...charts]);
    setIsWizardOpen(false);
  };

  if (charts.length === 0 && !isWizardOpen) {
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

      <ChartWizard 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
