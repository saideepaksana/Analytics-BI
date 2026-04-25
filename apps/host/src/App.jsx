import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PublicLandingPage from "../../client/src/modules/home/PublicLandingPage.jsx";
import useAuthSnapshot from "./core/auth/useAuthSnapshot.js";
import Layout from "./components/Layout.jsx";
import MFELoader from "./components/MFELoader.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import HomePage from "./pages/HomePage.jsx";

const lazyWithDevFallback = (remoteImport, localImport) => {
  return lazy(async () => {
    try {
      return await remoteImport();
    } catch (error) {
      if (import.meta.env.DEV && localImport) {
        console.warn("Remote module unavailable, using local fallback", error);
        return localImport();
      }
      throw error;
    }
  });
};

const LoginPage = lazyWithDevFallback(
  () => import("auth/LoginPage"),
  () => import("../../client/src/modules/auth/LoginPage.jsx")
);
const SignUpPage = lazyWithDevFallback(
  () => import("auth/SignUpPage"),
  () => import("../../client/src/modules/auth/SignUpPage.jsx")
);
const ChartsPage = lazyWithDevFallback(
  () => import("analytics/ChartsPage"),
  () => import("../../client/src/modules/charts/ChartsPage.jsx")
);
const DashboardPage = lazyWithDevFallback(
  () => import("analytics/DashboardPage"),
  () => import("../../client/src/modules/dashboard/DashboardPage.jsx")
);
const IngestionPage = lazyWithDevFallback(
  () => import("dataMgmt/IngestionPage"),
  () => import("../../client/src/modules/ingestion/index.js").then((m) => ({ default: m.IngestionWizard }))
);
const DatasetsPage = lazyWithDevFallback(
  () => import("dataMgmt/DatasetsPage"),
  () => import("../../client/src/modules/datasets/DatasetsPage.jsx")
);
const DataReviewPage = lazyWithDevFallback(
  () => import("dataMgmt/DataReviewPage"),
  () => import("../../client/src/modules/data-review/DataReviewPage.jsx")
);
const SettingsPage = lazyWithDevFallback(
  () => import("tools/SettingsPage"),
  () => import("../../client/src/modules/settings/SettingsPage.jsx")
);

export default function App() {
  const user = useAuthSnapshot();

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app/home" replace /> : <PublicLandingPage />} />

      <Route
        path="/auth/login"
        element={
          <MFELoader>
            <LoginPage />
          </MFELoader>
        }
      />
      <Route
        path="/auth/signup"
        element={
          <MFELoader>
            <SignUpPage />
          </MFELoader>
        }
      />

      <Route element={<ProtectedRoute user={user} />}>
        <Route path="/app" element={<Layout />}>
          <Route path="home" element={<HomePage />} />
          <Route
            path="analytics/charts"
            element={
              <MFELoader>
                <ChartsPage />
              </MFELoader>
            }
          />
          <Route
            path="analytics/dashboards"
            element={
              <MFELoader>
                <DashboardPage />
              </MFELoader>
            }
          />
          <Route
            path="data/ingestion"
            element={
              <MFELoader>
                <IngestionPage />
              </MFELoader>
            }
          />
          <Route
            path="data/datasets"
            element={
              <MFELoader>
                <DatasetsPage />
              </MFELoader>
            }
          />
          <Route
            path="data/review"
            element={
              <MFELoader>
                <DataReviewPage />
              </MFELoader>
            }
          />
          <Route
            path="tools/settings"
            element={
              <MFELoader>
                <SettingsPage />
              </MFELoader>
            }
          />
          <Route path="*" element={<Navigate to="/app/home" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? "/app/home" : "/"} replace />} />
    </Routes>
  );
}
