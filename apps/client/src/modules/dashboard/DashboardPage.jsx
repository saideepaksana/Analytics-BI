import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Plus, ArrowLeft, Save, Trash2, Edit3, LayoutDashboard, Check, Loader,
} from 'lucide-react';
import { loadCharts } from '../charts/chartStorage';
import { loadDashboards, getDashboard, saveDashboard, deleteDashboard } from './dashboardStorage';
import DashboardGrid from './DashboardGrid';
import DashboardSidebar from './DashboardSidebar';
import GlobalFilterBar from './GlobalFilterBar';
import './dashboard.css';

function DashboardPage() {
  const [dashboards, setDashboards] = useState([]);
  const [savedCharts, setSavedCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDashId, setActiveDashId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Active dashboard state
  const [dashName, setDashName] = useState('');
  const [dashChartIds, setDashChartIds] = useState([]);
  const [dashLayout, setDashLayout] = useState([]);
  const [dashAnnotations, setDashAnnotations] = useState({});
  const [dashFilters, setDashFilters] = useState({
    dateColumn: '', startDate: '', endDate: '', categoryColumn: '', categoryValue: '',
  });
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);

  // Resolve chart objects from IDs using savedCharts
  const dashCharts = useMemo(() => {
    return dashChartIds.map(id => savedCharts.find(c => c.id === id)).filter(Boolean);
  }, [dashChartIds, savedCharts]);

  // Collect all unique columns from dashboard charts for global filters
  const allColumns = useMemo(() => {
    const cols = new Set();
    dashCharts.forEach(c => (c.columns || []).forEach(col => cols.add(col)));
    return [...cols];
  }, [dashCharts]);

  const refreshDashboards = useCallback(async () => {
    setLoading(true);
    try {
      const pendingData = await Promise.all([loadDashboards(), loadCharts()]);
      setDashboards(pendingData[0]);
      setSavedCharts(pendingData[1]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboards();
  }, [refreshDashboards]);

  const openDashboard = async (id) => {
    const dash = await getDashboard(id);
    if (!dash) return;
    setActiveDashId(dash.id);
    setDashName(dash.name || '');
    setDashChartIds(dash.chartIds || []);
    setDashLayout(dash.layout || []);
    setDashAnnotations(dash.annotations || {});
    setDashFilters(dash.filters || { dateColumn: '', startDate: '', endDate: '', categoryColumn: '', categoryValue: '' });
    setIsEditing(true);
  };

  const createNew = () => {
    setActiveDashId(null);
    setDashName('Untitled Dashboard');
    setDashChartIds([]);
    setDashLayout([]);
    setDashAnnotations({});
    setDashFilters({ dateColumn: '', startDate: '', endDate: '', categoryColumn: '', categoryValue: '' });
    setIsEditing(true);
  };

  const goBack = () => {
    setActiveDashId(null);
    setIsEditing(false);
    refreshDashboards();
  };

  const handleAddChart = (chart) => {
    const idx = dashChartIds.length;
    const key = 'tile_' + idx + '_' + Date.now();
    setDashChartIds(prev => [...prev, chart.id]);
    setDashLayout(prev => [...prev, {
      i: key,
      x: (idx % 3) * 4,
      y: Math.floor(idx / 3) * 4,
      w: 4,
      h: 4,
    }]);
  };

  const handleRemoveChart = (index) => {
    setDashChartIds(prev => prev.filter((_, i) => i !== index));
    setDashLayout(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnnotationChange = (key, text) => {
    setDashAnnotations(prev => ({ ...prev, [key]: text }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDashboard({
        ...(activeDashId ? { id: activeDashId } : {}),
        name: dashName,
        chartIds: dashChartIds,
        layout: dashLayout,
        annotations: dashAnnotations,
        filters: dashFilters,
      });
      await refreshDashboards();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteDashboard(id);
    await refreshDashboards();
    setConfirmDelete(null);
    if (activeDashId === id) goBack();
  };

  // ── Dashboard Editor View ──
  if (isEditing) {
    return (
      <div className="dashboard-editor">
        {/* Top bar */}
        <div className="dash-editor-topbar">
          <div className="dash-editor-left">
            <button type="button" className="ghost-btn" onClick={goBack}>
              <ArrowLeft size={14} /> Back
            </button>
            <div className="dash-editor-name-group">
              {editingName ? (
                <input
                  type="text"
                  className="dash-name-input"
                  value={dashName}
                  onChange={e => setDashName(e.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
                  autoFocus
                />
              ) : (
                <h2 className="dash-editor-title" onClick={() => setEditingName(true)}>
                  {dashName || 'Untitled Dashboard'}
                  <Edit3 size={14} className="dash-edit-name-icon" />
                </h2>
              )}
              <span className="dash-editor-count">{dashCharts.length} chart{dashCharts.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button
            type="button"
            className="primary-btn dash-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <><Loader size={14} className="cw-spin" /> Saving…</> : <><Save size={14} /> Save Dashboard</>}
          </button>
        </div>

        {/* Global Filters */}
        <GlobalFilterBar
          filters={dashFilters}
          onChange={setDashFilters}
          columns={allColumns}
        />

        {/* Main Content */}
        <div className="dash-editor-body">
          <div className="dash-editor-grid-area">
            <DashboardGrid
              charts={dashCharts}
              layout={dashLayout}
              annotations={dashAnnotations}
              globalFilters={dashFilters}
              onLayoutChange={setDashLayout}
              onAnnotationChange={handleAnnotationChange}
              onRemoveChart={handleRemoveChart}
            />
          </div>
          <DashboardSidebar
            savedCharts={savedCharts}
            onAddChart={handleAddChart}
          />
        </div>
      </div>
    );
  }

  // ── Dashboard List View ──
  return (
    <div className="dashboard-list-page">
      <div className="charts-page-header">
        <div>
          <h2>Dashboards</h2>
          <p className="muted">Combine multiple visualizations into interactive workspaces.</p>
        </div>
        <button type="button" className="primary-btn charts-create-btn" onClick={createNew}>
          <Plus size={16} /> New Dashboard
        </button>
      </div>

      {loading ? (
        <div className="charts-empty-state">
          <Loader size={32} className="cw-spin" style={{ color: 'var(--brand)', marginBottom: 16 }} />
          <h3>Loading Dashboards...</h3>
        </div>
      ) : dashboards.length === 0 ? (
        <div className="charts-empty-state">
          <div className="charts-empty-icon">
            <LayoutDashboard size={48} />
          </div>
          <h3>No Dashboards Yet</h3>
          <p>Create your first dashboard to combine charts into a single interactive view.</p>
          <button type="button" className="primary-btn" onClick={createNew}>
            <Plus size={16} /> Create Your First Dashboard
          </button>
        </div>
      ) : (
        <div className="dash-list-grid">
          {dashboards.map(dash => (
            <div key={dash.id} className="dash-list-card" onClick={() => openDashboard(dash.id)}>
              <div className="dash-list-card-icon">
                <LayoutDashboard size={28} />
              </div>
              <div className="dash-list-card-info">
                <h3>{dash.name || 'Untitled'}</h3>
                <p>{(dash.chartIds || []).length} chart{(dash.chartIds || []).length !== 1 ? 's' : ''} • Updated {new Date(dash.updatedAt || dash.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="dash-list-card-actions" onClick={e => e.stopPropagation()}>
                <button type="button" className="chart-action-btn chart-action-delete" title="Delete" onClick={() => setConfirmDelete(dash.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-content">
              <h3>Delete Dashboard?</h3>
              <p>This dashboard and its layout will be permanently removed. Your saved charts will not be affected.</p>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button type="button" className="danger-btn" onClick={() => handleDelete(confirmDelete)}>Delete Dashboard</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
