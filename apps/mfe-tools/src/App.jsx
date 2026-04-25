import { Navigate, Route, Routes } from "react-router-dom";
import SettingsPage from "./modules/settings/SettingsPage.jsx";
import SqlEditorPage from "./modules/sql-editor/SqlEditorPage.jsx";
import BuilderPage from "./modules/builder/BuilderPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/sql-editor" element={<SqlEditorPage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="*" element={<Navigate to="/settings" replace />} />
    </Routes>
  );
}
