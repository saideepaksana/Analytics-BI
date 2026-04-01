import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Edit3, Eye, BarChart3, Loader } from 'lucide-react';
import ChartWizard from './ChartWizard';
import ChartPreview from './ChartPreview';
import { loadCharts, deleteChart } from './chartStorage';
import { buildChartOption } from './chartBuilder';
import './charts.css';

function ChartsPage() {
  const [savedCharts, setSavedCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editingChart, setEditingChart] = useState(null);
  const [previewChart, setPreviewChart] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshCharts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadCharts();
      setSavedCharts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCharts();
  }, [refreshCharts]);

  const handleSaved = () => {
    refreshCharts();
    setShowWizard(false);
    setEditingChart(null);
  };

  const handleDelete = async (id) => {
    await deleteChart(id);
    refreshCharts();
    setConfirmDelete(null);
  };

  const handleEdit = (chart) => {
    setEditingChart(chart);
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditingChart(null);
  };

  const CHART_TYPE_LABELS = {
    bar: 'Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter',
    area: 'Area', radar: 'Radar', gauge: 'Gauge', bar3d: '3D Bar',
  };

  return (
    <section className="charts-page">
      {showWizard ? (
        <div className="card wizard-card cw-card-container">
          <div className="wizard-head">
            <h2>{editingChart ? 'Edit Visualization' : 'Create Visualization'}</h2>
            <p>Wizard</p>
          </div>
          <ChartWizard
            onClose={handleCloseWizard}
            onSaved={handleSaved}
            editingChart={editingChart}
          />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="charts-page-header">
            <div>
              <h2>Saved Visualizations</h2>
              <p className="muted">Your charts are available here and in the Dashboard.</p>
            </div>
            <button
              type="button"
              className="primary-btn charts-create-btn"
              onClick={() => setShowWizard(true)}
            >
              <Plus size={16} /> New Visualization
            </button>
          </div>

          {/* Gallery */}
          {loading ? (
            <div className="charts-empty-state">
              <Loader size={32} className="cw-spin" style={{ color: 'var(--brand)', marginBottom: 16 }} />
              <h3>Loading Charts...</h3>
            </div>
          ) : savedCharts.length === 0 ? (
            <div className="charts-empty-state">
              <div className="charts-empty-icon">
                <BarChart3 size={48} />
              </div>
              <h3>No Charts Yet</h3>
              <p>Create your first visualization using the wizard to get started.</p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => setShowWizard(true)}
              >
                <Plus size={16} /> Create Your First Chart
              </button>
            </div>
          ) : (
            <div className="charts-gallery">
              {savedCharts.map(chart => {
                const option = buildChartOption({
                  chartType: chart.chartType,
                  dimensions: chart.dimensions,
                  measures: chart.measures,
                  data: chart.data || [],
                  customization: chart.customization || {},
                });

                return (
                  <div key={chart.id} className="chart-gallery-card">
                    <div className="chart-gallery-preview">
                      <ChartPreview option={option} style={{ height: '200px' }} />
                    </div>
                    <div className="chart-gallery-info">
                      <div className="chart-gallery-name">{chart.name || 'Untitled'}</div>
                      <div className="chart-gallery-meta">
                        <span className="chart-type-badge">{CHART_TYPE_LABELS[chart.chartType] || chart.chartType}</span>
                        <span className="chart-gallery-date">
                          {new Date(chart.updatedAt || chart.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="chart-gallery-actions">
                      <button type="button" className="chart-action-btn" title="Preview" onClick={() => setPreviewChart(chart)}>
                        <Eye size={14} />
                      </button>
                      <button type="button" className="chart-action-btn" title="Edit" onClick={() => handleEdit(chart)}>
                        <Edit3 size={14} />
                      </button>
                      <button type="button" className="chart-action-btn chart-action-delete" title="Delete" onClick={() => setConfirmDelete(chart.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-content">
              <h3>Delete Chart?</h3>
              <p>This chart will be permanently removed. It will also be removed from any dashboards using it.</p>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button type="button" className="danger-btn" onClick={() => handleDelete(confirmDelete)}>
                  Delete Chart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen preview modal */}
      {previewChart && (
        <div className="modal-overlay" onClick={() => setPreviewChart(null)}>
          <div className="chart-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="chart-preview-modal-header">
              <h3>{previewChart.name || 'Chart Preview'}</h3>
              <button type="button" className="ghost-btn" onClick={() => setPreviewChart(null)}>Close</button>
            </div>
            <div className="chart-preview-modal-body">
              <ChartPreview
                option={buildChartOption({
                  chartType: previewChart.chartType,
                  dimensions: previewChart.dimensions,
                  measures: previewChart.measures,
                  data: previewChart.data || [],
                  customization: previewChart.customization || {},
                })}
                style={{ height: '500px' }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default ChartsPage;
