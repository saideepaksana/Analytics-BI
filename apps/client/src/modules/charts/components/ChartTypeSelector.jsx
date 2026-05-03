import React from "react";
import { BarChart3, LineChart, PieChart, AreaChart, ScatterChart, Box, Hash, Table as TableIcon } from "lucide-react";

const CHART_TYPES = [
  { id: "kpi", label: "KPI Summary Card", icon: Hash, description: "Display a single key performance indicator." },
  { id: "table", label: "Data Table", icon: TableIcon, description: "Show raw or aggregated data in a tabular grid." },
  { id: "bar", label: "Bar Chart", icon: BarChart3, description: "Compare categorical data using rectangular bars." },
  { id: "line", label: "Line Chart", icon: LineChart, description: "Display trends over time or continuous categories." },
  { id: "pie", label: "Pie Chart", icon: PieChart, description: "Show proportions of a whole across categories." },
  { id: "area", label: "Area Chart", icon: AreaChart, description: "Similar to line charts but with filled areas." },
  { id: "scatter", label: "Scatter Plot", icon: ScatterChart, description: "Identify relationships between two numeric variables." },
  { id: "boxplot", label: "Box Plot", icon: Box, description: "Visualize data distribution through quartiles." },
  { id: "histogram", label: "Histogram", icon: BarChart3, description: "Show frequency distribution of a numeric variable." },
];

export default function ChartTypeSelector({ selectedType, onSelect }) {
  return (
    <div className="chart-type-grid">
      {CHART_TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = selectedType === type.id;
        return (
          <button
            key={type.id}
            type="button"
            className={`chart-type-card ${isSelected ? "selected" : ""}`}
            onClick={() => onSelect(type.id)}
          >
            <div className="chart-type-icon">
              <Icon size={32} />
            </div>
            <div className="chart-type-info">
              <h4>{type.label}</h4>
              <p>{type.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
