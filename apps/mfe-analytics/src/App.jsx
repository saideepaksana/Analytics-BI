import { Navigate, Route, Routes } from "react-router-dom";
import ChartsPage from "./modules/charts/ChartsPage.jsx";
import DashboardPage from "./modules/dashboard/DashboardPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/charts" element={<ChartsPage />} />
      <Route path="/dashboards" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/charts" replace />} />
    </Routes>
  );
}
