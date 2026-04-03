import { useState, useEffect } from "react";
import { Home, Upload, Database, Sparkles, Sun, Moon, PieChart, LayoutDashboard } from "lucide-react";
import HomePage from "./modules/home/HomePage";
import { IngestionWizard } from "./modules/ingestion";
import { DataReviewPage } from "./modules/data-review";
import DataReviewModal from "./modules/data-review/DataReviewModal";
import { DatasetsPage } from "./modules/datasets";
import ChartsPage from "./modules/charts/ChartsPage";
import DashboardsPage from "./modules/dashboard/DashboardsPage";
import "./modules/data-review/styles/data-review.css";
import "./App.css";

function App() {
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [activeView, setActiveView] = useState("home"); // home | ingestion | review | datasets
  const [reviewModalDatasetId, setReviewModalDatasetId] = useState(null);
  
  // defaulting to dark mode for Midnight Aurora aesthetic, persisting in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("analytics-theme") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("analytics-theme", theme);
  }, [theme]);

  const headerConfig = {
    ingestion: {
      title: "Upload & Ingest",
      subtitle: "Upload a CSV/Excel file and track ingestion progress."
    },
    review: {
      title: "Review Dataset",
      subtitle: "Preview rows, adjust schema, and manage quarantined records."
    },
    datasets: {
      title: "Datasets",
      subtitle: "Browse all inserted datasets and open them in Data Review."
    },
    charts: {
      title: "Saved Charts",
      subtitle: "View and manage all your visualized data charts."
    },
    dashboards: {
      title: "Saved Dashboards",
      subtitle: "View and organize your analytics dashboards."
    }
  };

  const activeHeader = headerConfig[activeView] || null;

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "ingestion", label: "Ingestion", icon: Upload },
    { id: "datasets", label: "Datasets", icon: Database },
    { id: "charts", label: "Charts", icon: PieChart },
    { id: "dashboards", label: "Dashboards", icon: LayoutDashboard },
  ];

  return (
    <div className="app-frame" data-theme={theme} style={{ position: "relative" }}>
      <button 
        className="theme-toggle" 
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
        title="Toggle Light/Dark Mode"
      >
        {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="sidebar-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="sidebar-title">Analytics BI</div>
            <div className="sidebar-subtitle">Data Intelligence Platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => setActiveView(item.id)}
              >
                <Icon size={17} className="nav-item-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-badge">v2.0 • Sprint 2</div>
        </div>
      </aside>

      <main className="app-shell">
        {activeHeader && (
          <header className="app-header">
            <h1>{activeHeader.title}</h1>
            <p>{activeHeader.subtitle}</p>
          </header>
        )}

        {activeView === "home" ? (
          <HomePage onNavigate={setActiveView} />
        ) : null}

        {activeView === "ingestion" ? (
          <>
            <IngestionWizard
              onCompleted={(result) => {
                setActiveDatasetId(result.datasetId);
                setReviewModalDatasetId(result.datasetId);
              }}
            />
          </>
        ) : null}

        {activeView === "review" ? <DataReviewPage datasetId={activeDatasetId} /> : null}
        {activeView === "datasets" ? (
          <DatasetsPage
            activeDatasetId={activeDatasetId}
            onOpenDataset={(datasetId) => {
              setActiveDatasetId(datasetId);
              setReviewModalDatasetId(datasetId);
            }}
          />
        ) : null}

        {activeView === "charts" ? <ChartsPage /> : null}

        {activeView === "dashboards" ? <DashboardsPage /> : null}
      </main>

      {/* Data Review Modal - appears as full-screen popup */}
      {reviewModalDatasetId && (
        <DataReviewModal
          datasetId={reviewModalDatasetId}
          onClose={() => setReviewModalDatasetId(null)}
        />
      )}
    </div>
  );
}

export default App;
