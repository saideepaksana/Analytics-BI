import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Upload,
  BarChart3,
  AlertTriangle,
  Zap,
  FolderOpen,
  LayoutDashboard,
  Code2,
  MessageSquare,
  Layers,
  ArrowRight,
  PieChart,
} from "lucide-react";
import { listDatasets } from "../../services/datasets.service";
import { formatDateTime } from "../../core/utils/formatters";
import "./home.css";

function HomePage({ onNavigate }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDatasets();
      setDatasets(Array.isArray(data) ? data : []);
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totalDatasets = datasets.length;
  const totalRows = datasets.reduce((sum, d) => sum + (d.rowCount ?? 0), 0);
  const totalQuarantined = datasets.reduce((sum, d) => sum + (d.quarantinedCount ?? 0), 0);
  const totalUploads = datasets.length; // each dataset = at least one upload

  const recentDatasets = [...datasets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <div className="home-page">
      {/* ── Hero Section ── */}
      <section className="home-hero">
        <div className="home-hero-badge">
          <span className="pulse-dot" />
          Platform Active
        </div>
        <h1>
          Welcome to <span className="gradient-text">Analytics BI</span>
        </h1>
        <p>
          Upload, transform, and explore your datasets with a powerful data
          ingestion pipeline. Review schemas, manage quarantined records, and
          build insights — all in one place.
        </p>
      </section>

      {/* ── Stats Grid ── */}
      <section className="home-stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">
            <Database size={20} />
          </div>
          <div className="stat-card-value">{loading ? "—" : totalDatasets}</div>
          <div className="stat-card-label">Datasets</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">
            <Upload size={20} />
          </div>
          <div className="stat-card-value">{loading ? "—" : totalUploads}</div>
          <div className="stat-card-label">Uploads</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">
            <BarChart3 size={20} />
          </div>
          <div className="stat-card-value">
            {loading ? "—" : totalRows.toLocaleString()}
          </div>
          <div className="stat-card-label">Clean Records</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">
            <AlertTriangle size={20} />
          </div>
          <div className="stat-card-value">{loading ? "—" : totalQuarantined}</div>
          <div className="stat-card-label">Quarantined</div>
        </div>
      </section>

      {/* ── Quick Actions ── */}
      <section>
        <h2 className="home-section-title">
          <Zap size={18} className="section-icon" />
          Quick Actions
        </h2>
        <div className="home-actions-grid">
          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate?.("ingestion")}
          >
            <div className="action-card-icon blue">
              <Upload size={22} />
            </div>
            <div className="action-card-text">
              <h3>Upload New Dataset</h3>
              <p>Ingest a CSV or Excel file through the upload wizard</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </button>
          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate?.("datasets")}
          >
            <div className="action-card-icon green">
              <FolderOpen size={22} />
            </div>
            <div className="action-card-text">
              <h3>Browse Datasets</h3>
              <p>View, review, and manage all your ingested datasets</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </button>
          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate?.("charts")}
          >
            <div className="action-card-icon purple">
              <PieChart size={22} />
            </div>
            <div className="action-card-text">
              <h3>Create Charts</h3>
              <p>Visualize your ingested data seamlessly</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </button>
          <button
            type="button"
            className="action-card"
            onClick={() => onNavigate?.("dashboards")}
          >
            <div className="action-card-icon cyan">
              <LayoutDashboard size={22} />
            </div>
            <div className="action-card-text">
              <h3>Build Dashboards</h3>
              <p>Organize charts into interactive dashboards</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </button>
        </div>
      </section>

      {/* ── Coming Soon Features ── */}
      <section>
        <h2 className="home-section-title">
          <Layers size={18} className="section-icon" />
          Platform Capabilities
        </h2>
        <div className="home-features-grid">

          <div className="feature-card">
            <div className="feature-card-icon cyan">
              <BarChart3 size={22} />
            </div>
            <h4>Query Builder</h4>
            <p>Create complex queries with a visual no-code interface</p>
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon orange">
              <Code2 size={22} />
            </div>
            <h4>SQL Editor</h4>
            <p>Write and execute SQL queries with AI-powered suggestions</p>
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon pink">
              <MessageSquare size={22} />
            </div>
            <h4>AI Chatbot</h4>
            <p>Ask questions about your data in natural language</p>
            <span className="coming-soon-badge">Coming Soon</span>
          </div>
        </div>
      </section>

      {/* ── Recent Activity ── */}
      <section className="home-activity">
        <h2 className="home-section-title">Recent Activity</h2>
        {recentDatasets.length > 0 ? (
          <ul className="activity-list">
            {recentDatasets.map((d) => (
              <li key={d.datasetId} className="activity-item">
                <span className="activity-dot" />
                <div className="activity-content">
                  <strong>{d.fileName || d.datasetId}</strong>{" "}
                  <span>
                    — {d.rowCount ?? 0} rows ingested
                    {(d.quarantinedCount ?? 0) > 0
                      ? `, ${d.quarantinedCount} quarantined`
                      : ""}
                  </span>
                </div>
                <span className="activity-time">
                  {formatDateTime(d.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="activity-empty">
            {loading
              ? "Loading recent activity..."
              : "No datasets yet. Upload your first file to get started!"}
          </p>
        )}
      </section>
    </div>
  );
}

export default HomePage;
