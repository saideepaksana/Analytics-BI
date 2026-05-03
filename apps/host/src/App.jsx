import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router-dom";
import {
  Database,
  Home,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings,
  ShieldAlert,
  Upload,
  UserCircle2,
} from "lucide-react";
import {
  AUTH_EVENTS,
  getCurrentUser,
  getDefaultPreferences,
  getEffectiveTheme,
  logout,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
  API_BASE_URL,
  SOCKET_URL,
} from "@analytics-bi/shared-lib";

// ── Host-local components ────────────────────────────────────────────────────
import MFELoader from "./components/MFELoader.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

// ── Direct imports from client (re-used, never modified) ────────────────────
import PublicLandingPage from "../../client/src/modules/home/PublicLandingPage.jsx";
import HomePage from "../../client/src/modules/home/HomePage.jsx";
import DataReviewModal from "../../client/src/modules/data-review/DataReviewModal.jsx";
import SimplePopup from "../../client/src/components/SimplePopup.jsx";
import EmbedDashboard from "../../client/src/modules/dashboard/EmbedDashboard.jsx";

// ── Lazy-loaded MFE pages with dev-fallbacks ────────────────────────────────
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
  () =>
    import("../../client/src/modules/ingestion/index.js").then((m) => ({
      default: m.IngestionWizard,
    }))
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

// ── Constants ────────────────────────────────────────────────────────────────

const ROLE_POLICIES = {
  home: ["admin", "editor", "viewer"],
  ingestion: ["admin", "editor"],
  review: ["admin", "editor", "viewer"],
  datasets: ["admin", "editor", "viewer"],
  charts: ["admin", "editor", "viewer"],
  dashboards: ["admin", "editor", "viewer"],
  settings: ["admin", "editor", "viewer"],
};

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home, to: "/app/home", roles: ROLE_POLICIES.home },
  { id: "ingestion", label: "Ingestion", icon: Upload, to: "/app/ingestion", roles: ROLE_POLICIES.ingestion },
  { id: "datasets", label: "Datasets", icon: Database, to: "/app/datasets", roles: ROLE_POLICIES.datasets },
  { id: "charts", label: "Charts", icon: PieChart, to: "/app/charts", roles: ROLE_POLICIES.charts },
  { id: "dashboards", label: "Dashboards", icon: LayoutDashboard, to: "/app/dashboards", roles: ROLE_POLICIES.dashboards },
  { id: "settings", label: "Settings", icon: Settings, to: "/app/settings", roles: ROLE_POLICIES.settings },
];

const LEGACY_VIEW_TO_ROUTE = {
  home: "home",
  ingestion: "ingestion",
  review: "review",
  datasets: "datasets",
  charts: "charts",
  dashboards: "dashboards",
};

const EXPORT_USER = {
  fullName: "Automation Session",
  email: "export@analytics.local",
  role: "admin",
  company: "",
  preferences: {
    theme: "light",
    density: "comfortable",
    accent: "teal",
  },
};

// ── Auth snapshot hook ───────────────────────────────────────────────────────

function useAuthSnapshot() {
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const refresh = () => {
      setUser(getCurrentUser());
    };

    window.addEventListener(AUTH_EVENTS.CHANGED, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(AUTH_EVENTS.CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return user;
}

// ── Workspace context consumer ──────────────────────────────────────────────

function useWorkspace() {
  return useOutletContext();
}

// ── Route guards ────────────────────────────────────────────────────────────

function RootEntry({ user }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasLegacyView = searchParams.has("view");
  const isExportMode = searchParams.get("export") === "true";

  if (hasLegacyView || isExportMode) {
    const legacyView = searchParams.get("view") || "home";
    const mappedRoute = LEGACY_VIEW_TO_ROUTE[legacyView] || "home";

    searchParams.delete("view");
    const query = searchParams.toString();

    return <Navigate to={`/app/${mappedRoute}${query ? `?${query}` : ""}`} replace />;
  }

  if (user) {
    return <Navigate to="/app/home" replace />;
  }

  return <PublicLandingPage />;
}

function AccessDenied({ allowedRoles }) {
  return (
    <section className="workspace-access-denied card">
      <div className="workspace-access-icon">
        <ShieldAlert size={22} />
      </div>
      <h3>Access Restricted</h3>
      <p>
        Your current role does not have access to this page. Allowed roles: {allowedRoles.join(", ")}.
      </p>
    </section>
  );
}

function RoleRoute({ allowedRoles, children }) {
  const { user, isExportMode } = useWorkspace();

  if (isExportMode) {
    return children;
  }

  if (!allowedRoles.includes(user.role)) {
    return <AccessDenied allowedRoles={allowedRoles} />;
  }

  return children;
}

// ── Workspace Layout (full orchestration shell) ─────────────────────────────

function WorkspaceLayout({
  user,
  isExportMode,
  preferences,
  onPreferencesChange,
  onProfileChange,
}) {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [reviewModalDatasetId, setReviewModalDatasetId] = useState(null);
  const [chartsExploreMode, setChartsExploreMode] = useState(false);
  const [dashboardEditorMode, setDashboardEditorMode] = useState(false);
  const [activeTasks, setActiveTasks] = useState([]);
  const [completionPopup, setCompletionPopup] = useState(null);

  const effectiveUser = useMemo(
    () =>
      user || {
        ...EXPORT_USER,
        preferences,
      },
    [preferences, user]
  );

  const effectiveTheme = getEffectiveTheme(preferences.theme);
  const isImmersive = chartsExploreMode || dashboardEditorMode;

  const visibleNavItems = useMemo(() => {
    if (isExportMode) {
      return NAV_ITEMS;
    }

    return NAV_ITEMS.filter((item) => item.roles.includes(effectiveUser.role));
  }, [effectiveUser.role, isExportMode]);

  const datasetIdFromQuery = searchParams.get("datasetId") || "";
  const resolvedDatasetId = datasetIdFromQuery || activeDatasetId;

  // ── Socket.io background task tracking ──
  useEffect(() => {
    if (isExportMode) {
      return undefined;
    }

    const socket = io(SOCKET_URL);

    axios
      .get(`${API_BASE_URL}/upload/active-jobs`)
      .then((response) => {
        setActiveTasks(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error("Failed to fetch active jobs", error);
      });

    socket.on("background-tasks:update", (event) => {
      setActiveTasks((previous) => {
        const isFinished = event.stage === "complete" || event.stage === "failed";

        if (isFinished) {
          return previous.filter((task) => task.uploadId !== event.uploadId);
        }

        const existing = previous.find((task) => task.uploadId === event.uploadId);

        if (existing) {
          return previous.map((task) =>
            task.uploadId === event.uploadId ? { ...task, ...event } : task
          );
        }

        return [...previous, event];
      });
    });

    socket.on("background-tasks:completed", (event) => {
      setCompletionPopup({
        message: `Dataset "${event.fileName}" (ID: ${event.datasetId}) has finished background processing.`,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [isExportMode]);

  const navigateToSection = useCallback(
    (sectionId) => {
      const item = NAV_ITEMS.find((entry) => entry.id === sectionId);
      navigate(item?.to || "/app/home");
    },
    [navigate]
  );

  const openDatasetForReview = useCallback(
    (datasetId, options = {}) => {
      if (!datasetId) {
        return;
      }

      setActiveDatasetId(datasetId);
      navigate(`/app/review?datasetId=${encodeURIComponent(datasetId)}`);

      if (options.openModal) {
        setReviewModalDatasetId(datasetId);
      }
    },
    [navigate]
  );

  const contextValue = useMemo(
    () => ({
      user: effectiveUser,
      isExportMode,
      preferences,
      onPreferencesChange,
      onProfileChange,
      activeDatasetId,
      resolvedDatasetId,
      activeTasks,
      navigateToSection,
      openDatasetForReview,
      setChartsExploreMode,
      setDashboardEditorMode,
      visibleNavItems,
      isImmersive,
      effectiveTheme,
    }),
    [
      activeDatasetId,
      activeTasks,
      effectiveTheme,
      effectiveUser,
      isExportMode,
      isImmersive,
      navigateToSection,
      onPreferencesChange,
      onProfileChange,
      openDatasetForReview,
      preferences,
      resolvedDatasetId,
      visibleNavItems,
    ]
  );

  if (isExportMode) {
    return (
      <main className="workspace-export-only" data-theme={effectiveTheme}>
        <Outlet context={contextValue} />

        {reviewModalDatasetId ? (
          <DataReviewModal
            datasetId={reviewModalDatasetId}
            onClose={() => setReviewModalDatasetId(null)}
          />
        ) : null}

        {completionPopup ? (
          <SimplePopup
            message={completionPopup.message}
            onClose={() => setCompletionPopup(null)}
          />
        ) : null}
      </main>
    );
  }

  return (
    <div
      className={`workspace-shell ${isImmersive ? "workspace-immersive" : ""}`}
      data-theme={effectiveTheme}
    >
      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-brand">
            <span className="workspace-brand-mark" aria-hidden="true">
              <img src="/analytics-bi.svg" alt="" />
            </span>
            <div>
              <strong>Analytics BI</strong>
            </div>
          </div>

          <div className="workspace-topbar-left">
            <div className="workspace-user-chip">
              <UserCircle2 size={16} />
              <span>{effectiveUser.fullName}</span>
              <em>{effectiveUser.role}</em>
            </div>
          </div>

          <nav className="workspace-topnav" aria-label="Primary navigation">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={({ isActive }) =>
                    `workspace-topnav-link ${isActive ? "active" : ""}`
                  }
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <button
            type="button"
            className="workspace-logout-btn topbar"
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </header>

        <main className={`workspace-content ${isImmersive ? "immersive" : ""}`}>
          <Outlet context={contextValue} />
        </main>
      </div>

      {reviewModalDatasetId ? (
        <DataReviewModal
          datasetId={reviewModalDatasetId}
          onClose={() => setReviewModalDatasetId(null)}
        />
      ) : null}

      {completionPopup ? (
        <SimplePopup
          message={completionPopup.message}
          onClose={() => setCompletionPopup(null)}
        />
      ) : null}
    </div>
  );
}

// ── Per-route wrappers (wire workspace context into page props) ──────────────

function WorkspaceHomeRoute() {
  const { navigateToSection } = useWorkspace();
  return <HomePage onNavigate={navigateToSection} />;
}

function WorkspaceIngestionRoute() {
  const { activeTasks, openDatasetForReview } = useWorkspace();
  return (
    <MFELoader>
      <IngestionPage
        activeBackgroundTasks={activeTasks}
        onCompleted={(result) => {
          openDatasetForReview(result?.datasetId, { openModal: true });
        }}
      />
    </MFELoader>
  );
}

function WorkspaceReviewRoute() {
  const { resolvedDatasetId } = useWorkspace();
  return (
    <MFELoader>
      <DataReviewPage datasetId={resolvedDatasetId} />
    </MFELoader>
  );
}

function WorkspaceDatasetsRoute() {
  const { resolvedDatasetId, openDatasetForReview } = useWorkspace();
  return (
    <MFELoader>
      <DatasetsPage
        activeDatasetId={resolvedDatasetId}
        onOpenDataset={(datasetId) => {
          openDatasetForReview(datasetId, { openModal: false });
        }}
      />
    </MFELoader>
  );
}

function WorkspaceChartsRoute() {
  const { setChartsExploreMode } = useWorkspace();

  useEffect(() => {
    return () => {
      setChartsExploreMode(false);
    };
  }, [setChartsExploreMode]);

  return (
    <MFELoader>
      <ChartsPage onExploreMode={setChartsExploreMode} />
    </MFELoader>
  );
}

function WorkspaceDashboardsRoute() {
  const { setDashboardEditorMode } = useWorkspace();

  useEffect(() => {
    return () => {
      setDashboardEditorMode(false);
    };
  }, [setDashboardEditorMode]);

  return (
    <MFELoader>
      <DashboardPage onEditorMode={setDashboardEditorMode} />
    </MFELoader>
  );
}

function WorkspaceSettingsRoute() {
  const { user, preferences, onPreferencesChange, onProfileChange } = useWorkspace();
  return (
    <MFELoader>
      <SettingsPage
        user={user}
        preferences={preferences}
        onUpdatePreferences={onPreferencesChange}
        onUpdateProfile={onProfileChange}
      />
    </MFELoader>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const location = useLocation();
  const user = useAuthSnapshot();

  const [guestPreferences, setGuestPreferences] = useState(() => getDefaultPreferences());
  const preferences = user?.preferences || guestPreferences;

  const isExportMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("export") === "true";
  }, [location.search]);

  const effectiveTheme = useMemo(
    () => (isExportMode ? "light" : getEffectiveTheme(preferences.theme)),
    [isExportMode, preferences.theme]
  );

  // Apply theme, density, accent to documentElement
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.documentElement.setAttribute("data-density", preferences.density || "comfortable");
    document.documentElement.setAttribute("data-accent", preferences.accent || "teal");
    document.body.classList.toggle("reduce-motion", Boolean(preferences.reduceMotion));
    localStorage.setItem("analytics-theme", effectiveTheme);
  }, [
    effectiveTheme,
    preferences.accent,
    preferences.density,
    preferences.reduceMotion,
  ]);

  // Set export mode global
  useEffect(() => {
    window.IS_EXPORT_MODE = isExportMode;
    document.body.classList.toggle("export-mode", isExportMode);

    return () => {
      window.IS_EXPORT_MODE = false;
      document.body.classList.remove("export-mode");
    };
  }, [isExportMode]);

  const handlePreferencesChange = useCallback(
    (nextPreferences) => {
      if (user) {
        updateCurrentUserPreferences(nextPreferences);
        return;
      }

      setGuestPreferences((previous) => ({
        ...previous,
        ...nextPreferences,
      }));
    },
    [user]
  );

  const handleProfileChange = useCallback(
    (profile) => {
      if (!user) {
        return;
      }

      updateCurrentUserProfile(profile);
    },
    [user]
  );

  return (
    <Routes>
      <Route path="/" element={<RootEntry user={user} />} />

      <Route
        path="/auth/login"
        element={
          user && !isExportMode ? (
            <Navigate to="/app/home" replace />
          ) : (
            <MFELoader>
              <LoginPage />
            </MFELoader>
          )
        }
      />
      <Route
        path="/auth/signup"
        element={
          user && !isExportMode ? (
            <Navigate to="/app/home" replace />
          ) : (
            <MFELoader>
              <SignUpPage />
            </MFELoader>
          )
        }
      />

      <Route path="/embed/:dashboardId" element={<EmbedDashboard />} />

      <Route element={<ProtectedRoute user={user} isExportMode={isExportMode} />}>
        <Route
          path="/app"
          element={
            <WorkspaceLayout
              user={user}
              isExportMode={isExportMode}
              preferences={preferences}
              onPreferencesChange={handlePreferencesChange}
              onProfileChange={handleProfileChange}
            />
          }
        >
          <Route index element={<Navigate to="home" replace />} />

          <Route
            path="home"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.home}>
                <WorkspaceHomeRoute />
              </RoleRoute>
            }
          />

          <Route
            path="ingestion"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.ingestion}>
                <WorkspaceIngestionRoute />
              </RoleRoute>
            }
          />

          <Route
            path="review"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.review}>
                <WorkspaceReviewRoute />
              </RoleRoute>
            }
          />

          <Route
            path="datasets"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.datasets}>
                <WorkspaceDatasetsRoute />
              </RoleRoute>
            }
          />

          <Route
            path="charts"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.charts}>
                <WorkspaceChartsRoute />
              </RoleRoute>
            }
          />

          <Route
            path="dashboards"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.dashboards}>
                <WorkspaceDashboardsRoute />
              </RoleRoute>
            }
          />

          <Route
            path="settings"
            element={
              <RoleRoute allowedRoles={ROLE_POLICIES.settings}>
                <WorkspaceSettingsRoute />
              </RoleRoute>
            }
          />

          <Route path="*" element={<Navigate to="/app/home" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? "/app/home" : "/"} replace />} />
    </Routes>
  );
}
