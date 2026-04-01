import {
  BarChart3,
  LineChart,
  PieChart,
  ScatterChart,
  Activity,
  Hexagon,
  Gauge,
  Box,
} from 'lucide-react';

const CHART_TYPES = [
  { id: 'bar', label: 'Bar Chart', desc: 'Compare categories with vertical bars', Icon: BarChart3 },
  { id: 'line', label: 'Line Chart', desc: 'Show trends over time or sequence', Icon: LineChart },
  { id: 'pie', label: 'Pie Chart', desc: 'Show proportions of a whole', Icon: PieChart },
  { id: 'scatter', label: 'Scatter Plot', desc: 'Reveal correlations between measures', Icon: ScatterChart },
  { id: 'area', label: 'Area Chart', desc: 'Visualize volume under a trend line', Icon: Activity },
  { id: 'radar', label: 'Radar Chart', desc: 'Compare multiple measures across categories', Icon: Hexagon },
  { id: 'gauge', label: 'Gauge', desc: 'Display a single aggregated KPI value', Icon: Gauge },
  { id: 'bar3d', label: '3D Bar Chart', desc: 'Gradient-styled bar chart with depth', Icon: Box },
];

export { CHART_TYPES };

function ChartTypeSelector({ selected, onSelect }) {
  return (
    <div className="chart-type-grid">
      {CHART_TYPES.map(ct => {
        const Icon = ct.Icon;
        const isActive = selected === ct.id;
        return (
          <button
            key={ct.id}
            type="button"
            className={`chart-type-card ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(ct.id)}
          >
            <div className="chart-type-icon">
              <Icon size={24} />
            </div>
            <div className="chart-type-info">
              <strong>{ct.label}</strong>
              <span>{ct.desc}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default ChartTypeSelector;
