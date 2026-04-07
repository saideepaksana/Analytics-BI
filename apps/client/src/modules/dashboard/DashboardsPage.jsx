import React, { useState, useEffect } from "react";
import { Plus, LayoutDashboard } from "lucide-react";
import DashboardCard from "./DashboardCard";
import DashboardBuilder from "./components/DashboardBuilder";
import { loadDashboardsFromStorage, saveDashboardsToStorage } from "../../services/dashboard.service";
import "./styles/dashboards.css";

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState([]);
  const [activeDashboardId, setActiveDashboardId] = useState(null);

  useEffect(() => {
    setDashboards(loadDashboardsFromStorage());
  }, []);

  const handleCreateDashboard = () => {
    const newDashboard = {
      id: crypto.randomUUID(),
      title: "New Dashboard",
      description: "",
      layout: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const next = [newDashboard, ...dashboards];
    setDashboards(next);
    saveDashboardsToStorage(next);
  };

  const handleUpdateDashboard = (updatedDashboard) => {
    const next = dashboards.map((d) => d.id === updatedDashboard.id ? updatedDashboard : d);
    setDashboards(next);
    saveDashboardsToStorage(next);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this dashboard?")) {
      const next = dashboards.filter((d) => d.id !== id);
      setDashboards(next);
      saveDashboardsToStorage(next);
      if (activeDashboardId === id) setActiveDashboardId(null);
    }
  };

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId);

  if (activeDashboard) {
    return (
      <DashboardBuilder
        dashboard={activeDashboard}
        onBack={() => setActiveDashboardId(null)}
        onSave={(updated) => {
          updated.updatedAt = new Date().toISOString();
          handleUpdateDashboard(updated);
          setActiveDashboardId(null);
        }}
      />
    );
  }

  return (
    <div className="dashboards-page" style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div className="dashboards-grid-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <h3 style={{ fontSize: "24px", color: "#f8fafc", margin: 0 }}>Saved Dashboards ({dashboards.length})</h3>
        <button
          className="create-dashboard-btn"
          onClick={handleCreateDashboard}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "8px", backgroundColor: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 500, transition: "background-color 0.2s" }}
        >
          <Plus size={18} />
          New Dashboard
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", color: "#94a3b8" }}>
          <LayoutDashboard size={48} opacity={0.5} style={{ marginBottom: "16px" }} />
          <p>No dashboards created yet.</p>
        </div>
      ) : (
        <div className="dashboards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "24px" }}>
          {dashboards.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              onUpdate={handleUpdateDashboard}
              onDelete={() => handleDelete(dashboard.id)}
              onClick={() => setActiveDashboardId(dashboard.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
