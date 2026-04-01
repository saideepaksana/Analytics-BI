import { Plus, BarChart3 } from 'lucide-react';

function DashboardSidebar({ savedCharts, onAddChart }) {
  const CHART_TYPE_LABELS = {
    bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter',
    area: 'Area', radar: 'Radar', gauge: 'Gauge', bar3d: '3D Bar',
  };

  return (
    <div className="dash-sidebar">
      <div className="dash-sidebar-header">
        <h4>Chart Library</h4>
        <span className="fm-count">{savedCharts.length}</span>
      </div>

      <div className="dash-sidebar-list">
        {savedCharts.length === 0 ? (
          <div className="dash-sidebar-empty">
            <BarChart3 size={24} style={{ color: 'var(--muted)', marginBottom: 8 }} />
            <p>No saved charts yet. Create charts in the Charts section first.</p>
          </div>
        ) : (
          savedCharts.map(chart => (
            <button
              key={chart.id}
              type="button"
              className="dash-sidebar-chart"
              onClick={() => onAddChart(chart)}
            >
              <div className="dash-sidebar-chart-info">
                <span className="dash-sidebar-chart-name">{chart.name || 'Untitled'}</span>
                <span className="chart-type-badge">{CHART_TYPE_LABELS[chart.chartType] || chart.chartType}</span>
              </div>
              <Plus size={14} className="dash-sidebar-add-icon" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default DashboardSidebar;
