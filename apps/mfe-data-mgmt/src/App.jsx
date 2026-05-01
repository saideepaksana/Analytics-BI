import { Navigate, Route, Routes } from "react-router-dom";
import IngestionPage from "./modules/ingestion/IngestionPage.jsx";
import DatasetsPage from "./modules/datasets/DatasetsPage.jsx";
import DataReviewPage from "./modules/data-review/DataReviewPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/ingestion" element={<IngestionPage />} />
      <Route path="/datasets" element={<DatasetsPage />} />
      <Route path="/review" element={<DataReviewPage />} />
      <Route path="*" element={<Navigate to="/ingestion" replace />} />
    </Routes>
  );
}
