import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./modules/auth/LoginPage.jsx";
import SignUpPage from "./modules/auth/SignUpPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
