import React, { useState, useEffect } from "react";
import { X, BarChart3, LineChart, ScatterChart, AreaChart, PieChart, Table2 } from "lucide-react";
import { fetchCharts } from "../../../services/charts.service";

const CHART_TYPES = {
  bar: { icon: BarChart3, label: "Bar" },
  line: { icon: LineChart, label: "Line" },
  scatter: { icon: ScatterChart, label: "Scatter" },
  area: { icon: AreaChart, label: "Area" },
  pie: { icon: PieChart, label: "Pie" },
  table: { icon: Table2, label: "Table" },
};

export default function ChartPickerModal({ isOpen, onClose, onSelect }) {
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const loadCharts = async () => {
      setLoading(true);
      try {
        const res = await fetchCharts();
        setCharts(res.charts || []);
      } catch (err) {
        console.error("Failed to load charts:", err);
      } finally {
        setLoading(false);
      }
    };
    loadCharts();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", width: "100%", maxWidth: "800px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc" }}>Select a Chart</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <p style={{ color: "#94a3b8", textAlign: "center" }}>Loading saved charts...</p>
          ) : charts.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center" }}>No charts found. Create one in the Explore tab first.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {charts.map((chart) => {
                const typeInfo = CHART_TYPES[chart.visualization?.type] || CHART_TYPES.bar;
                const Icon = typeInfo.icon;
                return (
                  <div
                    key={chart._id || chart.id}
                    onClick={() => {
                      onSelect(chart);
                      onClose();
                    }}
                    style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", padding: "16px", cursor: "pointer", transition: "border-color 0.2s" }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = "#6366f1"}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = "#334155"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <div style={{ backgroundColor: "rgba(99, 102, 241, 0.1)", color: "#818cf8", padding: "8px", borderRadius: "6px" }}>
                        <Icon size={20} />
                      </div>
                      <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{typeInfo.label}</span>
                    </div>
                    <h4 style={{ margin: 0, color: "#f8fafc", fontSize: "14px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {chart.name || "Untitled Chart"}
                    </h4>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
