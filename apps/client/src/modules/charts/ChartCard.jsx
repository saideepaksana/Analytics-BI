import React from "react";
import { BarChart2, Edit2, Eye, Trash2 } from "lucide-react";

export default function ChartCard({ chart }) {
  // Placeholder handler for view/edit as per user instruction
  const handleView = () => {
    console.log("View chart: ", chart.id);
  };

  const handleEdit = () => {
    console.log("Edit chart: ", chart.id);
  };

  const handleDelete = () => {
    console.log("Delete chart: ", chart.id);
  };

  return (
    <div className="chart-card">
      <div className="chart-card-preview">
        <BarChart2 size={48} opacity={0.3} />
      </div>
      <div className="chart-card-details">
        <div>
          <h4 className="chart-card-title">{chart.title}</h4>
          <div className="chart-card-meta">
            <span>{chart.type}</span>
            <span>{chart.updatedAt}</span>
          </div>
        </div>
        <div className="chart-card-actions">
          <button className="chart-action-btn" onClick={handleView}>
            <Eye size={14} /> View
          </button>
          <button className="chart-action-btn" onClick={handleEdit}>
            <Edit2 size={14} /> Edit
          </button>
          <button 
            className="chart-action-btn" 
            onClick={handleDelete}
            style={{ color: "var(--danger-color, #ef4444)" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
