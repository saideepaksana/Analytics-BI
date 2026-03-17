import { useState } from "react";
import { IngestionWizard } from "./modules/ingestion";
import { DataReviewPage } from "./modules/data-review";
import "./modules/data-review/styles/data-review.css";
import "./App.css";

function App() {
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [uploadSummary, setUploadSummary] = useState(null);
  const [activeView, setActiveView] = useState("ingestion"); // ingestion | review

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <div className="sidebar-mark" aria-hidden="true">BI</div>
          <div>
            <div className="sidebar-title">Analytics BI</div>
            <div className="sidebar-subtitle">Sprint 1</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${activeView === "ingestion" ? "active" : ""}`}
            onClick={() => setActiveView("ingestion")}
          >
            Ingestion
          </button>
          <button
            type="button"
            className={`nav-item ${activeView === "review" ? "active" : ""}`}
            onClick={() => setActiveView("review")}
            disabled={!activeDatasetId}
            title={!activeDatasetId ? "Upload a file first" : undefined}
          >
            Data Review
          </button>
        </nav>

        {uploadSummary ? (
          <section className="sidebar-summary">
            <div className="sidebar-summary-title">Last Upload</div>
            <div className="sidebar-summary-row">
              <span className="muted">Dataset</span>
              <span className="mono">{uploadSummary.datasetId}</span>
            </div>
            <div className="sidebar-summary-row">
              <span className="muted">Rows</span>
              <span>{uploadSummary.rowCount}</span>
            </div>
            <div className="sidebar-summary-row">
              <span className="muted">Quarantine</span>
              <span>{uploadSummary.quarantinedCount}</span>
            </div>
          </section>
        ) : null}
      </aside>

      <main className="app-shell">
        <header className="app-header">
          <h1>{activeView === "ingestion" ? "Upload & Ingest" : "Review Dataset"}</h1>
          <p>
            {activeView === "ingestion"
              ? "Upload a CSV/Excel file and track ingestion progress."
              : "Preview rows, adjust schema, and manage quarantined records."}
          </p>
        </header>

        {activeView === "ingestion" ? (
          <>
            <IngestionWizard
              onCompleted={(result) => {
                setActiveDatasetId(result.datasetId);
                setUploadSummary(result);
                setActiveView("review");
              }}
            />

            {uploadSummary ? (
              <section className="card">
                <h2>Upload Summary</h2>
                <p><strong>Dataset ID:</strong> {uploadSummary.datasetId}</p>
                <p><strong>Rows Saved:</strong> {uploadSummary.rowCount}</p>
                <p><strong>Quarantined:</strong> {uploadSummary.quarantinedCount}</p>
                <div className="wizard-actions">
                  <button type="button" className="primary-btn" onClick={() => setActiveView("review")}>
                    Go to Data Review
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeView === "review" ? <DataReviewPage datasetId={activeDatasetId} /> : null}
      </main>
    </div>
  );
}

export default App;
