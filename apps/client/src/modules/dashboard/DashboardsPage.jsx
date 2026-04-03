import React, { useState } from "react";
import { PlusCircle, LayoutDashboard, Plus } from "lucide-react";
import DashboardCard from "./DashboardCard";
import "./styles/dashboards.css";

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState([]);

  const handleCreateDashboard = () => {
    // Randomly generate a mock dashboard for frontend demonstration
    const newDashboard = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Sample Dashboard ${dashboards.length + 1}`,
      widgetCount: Math.floor(Math.random() * 8) + 2, // e.g. "4 widgets"
      updatedAt: "Just now",
    };
    setDashboards([newDashboard, ...dashboards]);
  };

  if (dashboards.length === 0) {
    return (
      <div className="dashboards-page">
        <div className="empty-dashboards-container">
          <div className="empty-dashboards-icon">
            <LayoutDashboard size={64} opacity={0.8} />
          </div>
          <h2>No dashboards created yet</h2>

          <button className="create-dashboard-btn" onClick={handleCreateDashboard}>
            <PlusCircle size={20} />
            Create your dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboards-page">
      <div className="dashboards-grid-header">
        <h3>Saved Dashboards ({dashboards.length})</h3>
        <button className="create-dashboard-btn" onClick={handleCreateDashboard} style={{ padding: "8px 16px" }}>
          <Plus size={18} />
          New Dashboard
        </button>
      </div>

      <div className="dashboards-grid">
        {dashboards.map((dashboard) => (
          <DashboardCard key={dashboard.id} dashboard={dashboard} />
        ))}
      </div>
    </div>
  );
}
