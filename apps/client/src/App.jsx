import { useState } from "react";
import { IngestionWizard } from "./modules/ingestion";
import { DataReviewPage } from "./modules/data-review";
import "./modules/data-review/styles/data-review.css";

function App() {
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [uploadSummary, setUploadSummary] = useState(null);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Analytics BI</h1>
        {/* <p>Upload, clean, infer schema, and review your dataset.</p> */}
      </header>

      <IngestionWizard
        onCompleted={(result) => {
          setActiveDatasetId(result.datasetId);
          setUploadSummary(result);
        }}
      />

      {uploadSummary ? (
        <section className="card">
          <h2>Upload Summary</h2>
          <p><strong>Dataset ID:</strong> {uploadSummary.datasetId}</p>
          <p><strong>Rows Saved:</strong> {uploadSummary.rowCount}</p>
          <p><strong>Quarantined:</strong> {uploadSummary.quarantinedCount}</p>
        </section>
      ) : null}

      <DataReviewPage datasetId={activeDatasetId} />
    </main>
  );
}

export default App;
