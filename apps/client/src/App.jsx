import { useCallback, useEffect, useMemo, useState } from "react";
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
  Menu,
  Moon,
  PieChart,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import HomePage from "./modules/home/HomePage";
import PublicLandingPage from "./modules/home/PublicLandingPage";
import LoginPage from "./modules/auth/LoginPage";
import SignUpPage from "./modules/auth/SignUpPage";
import { IngestionWizard } from "./modules/ingestion";
import { DataReviewPage } from "./modules/data-review";
import DataReviewModal from "./modules/data-review/DataReviewModal";
import { DatasetsPage } from "./modules/datasets";
import ChartsPage from "./modules/charts/ChartsPage";
import { DashboardPage } from "./modules/dashboard";
import SettingsPage from "./modules/settings/SettingsPage";
import { SOCKET_URL, API_BASE_URL } from "./core/config/env";
import {
  AUTH_EVENTS,
  getCurrentUser,
  getDefaultPreferences,
  getEffectiveTheme,
  logout,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
} from "./core/utils/auth";
import SimplePopup from "./components/SimplePopup";
import "./App.css";

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

const HEADER_CONFIG = {
  home: {
    title: "Personal Workspace",
    subtitle: "Track your datasets, charts, and dashboards from a single operational cockpit.",
  },
  ingestion: {
    title: "Upload and Ingest",
    subtitle: "Push files into the pipeline and monitor processing in real time.",
  },
  review: {
    title: "Data Review",
    subtitle: "Inspect metadata, schema quality, and quarantined records by dataset.",
  },
  datasets: {
    title: "Datasets",
    subtitle: "Search, export, and manage your ingested collections.",
  },
  charts: {
    title: "Chart Studio",
    subtitle: "Build, preview, and refine visual analytics from your datasets.",
  },
  dashboards: {
    title: "Dashboard Center",
    subtitle: "Assemble executive dashboards and share insight-ready views.",
  },
  settings: {
    title: "Settings",
    subtitle: "Personalize your workspace experience and profile details.",
  },
};

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
};

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

function useWorkspace() {
  return useOutletContext();
}

function RequireAuth({ user, isExportMode }) {
  const location = useLocation();

  if (!user && !isExportMode) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

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

function WorkspaceLayout({
  user,
  isExportMode,
  preferences,
  onPreferencesChange,
  onProfileChange,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] = useSearchParams();
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [reviewModalDatasetId, setReviewModalDatasetId] = useState(null);
  const [chartsExploreMode, setChartsExploreMode] = useState(false);
  const [dashboardEditorMode, setDashboardEditorMode] = useState(false);
  const [activeTasks, setActiveTasks] = useState([]);
  const [completionPopup, setCompletionPopup] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("analytics-sidebar-collapsed") === "true"
  );

  const effectiveUser = user || {
    ...EXPORT_USER,
    preferences,
  };

  const effectiveTheme = getEffectiveTheme(preferences.theme);
  const sectionKey = location.pathname.split("/")[2] || "home";
  const activeHeader = HEADER_CONFIG[sectionKey] || null;
  const isImmersive = chartsExploreMode || dashboardEditorMode;

  const visibleNavItems = useMemo(() => {
    if (isExportMode) {
      return NAV_ITEMS;
    }

    return NAV_ITEMS.filter((item) => item.roles.includes(effectiveUser.role));
  }, [effectiveUser.role, isExportMode]);

  useEffect(() => {
    localStorage.setItem("analytics-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const datasetIdFromQuery = searchParams.get("datasetId") || "";
  const resolvedDatasetId = datasetIdFromQuery || activeDatasetId;

  useEffect(() => {
    if (isExportMode) {
      return undefined;
    }

    const socket = io(SOCKET_URL, { transports: ["websocket"] });

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
      setSidebarOpen(false);
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
      setSidebarOpen(false);
      navigate(`/app/review?datasetId=${encodeURIComponent(datasetId)}`);

      if (options.openModal) {
        setReviewModalDatasetId(datasetId);
      }
    },
    [navigate]
  );

  const toggleSidebar = useCallback(() => {
    const isMobile = window.innerWidth <= 1024;

    if (isMobile) {
      setSidebarOpen((previous) => !previous);
      return;
    }

    setSidebarOpen(false);
    setSidebarCollapsed((previous) => !previous);
  }, []);

  const toggleTheme = useCallback(() => {
    onPreferencesChange({
      theme: effectiveTheme === "dark" ? "light" : "dark",
    });
  }, [effectiveTheme, onPreferencesChange]);

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
    }),
    [
      activeDatasetId,
      activeTasks,
      effectiveUser,
      isExportMode,
      navigateToSection,
      onPreferencesChange,
      onProfileChange,
      openDatasetForReview,
      preferences,
      resolvedDatasetId,
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
      className={`workspace-shell ${sidebarOpen ? "sidebar-open" : ""} ${
        sidebarCollapsed ? "sidebar-collapsed" : ""
      } ${isImmersive ? "workspace-immersive" : ""}`}
      data-theme={effectiveTheme}
    >
      <aside className="workspace-sidebar" aria-label="Primary navigation">
        <div className="workspace-brand">
          <span className="workspace-brand-mark">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>Analytics BI</strong>
            <span>Enterprise Data Intelligence</span>
          </div>
        </div>

        <nav className="workspace-nav">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) =>
                  `workspace-nav-link ${isActive ? "active" : ""}`
                }
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="workspace-sidebar-foot">
          <button
            type="button"
            className="workspace-logout-btn"
            title={sidebarCollapsed ? "Sign out" : undefined}
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <button type="button" className="workspace-icon-btn" onClick={toggleSidebar} aria-label="Toggle navigation menu">
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="workspace-user-chip">
              <UserCircle2 size={16} />
              <span>{effectiveUser.fullName}</span>
              <em>{effectiveUser.role}</em>
            </div>
          </div>

          <div className="workspace-topbar-right">
            <button type="button" className="workspace-icon-btn" onClick={toggleTheme} aria-label="Toggle light and dark theme">
              {effectiveTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <NavLink to="/app/settings" className="workspace-settings-link">
              <Settings size={15} />
              <span>Settings</span>
            </NavLink>
          </div>
        </header>

        <main className={`workspace-content ${isImmersive ? "immersive" : ""}`}>
          {activeHeader && !isImmersive ? (
            <header className="workspace-page-header">
              <h1>{activeHeader.title}</h1>
              <p>{activeHeader.subtitle}</p>
            </header>
          ) : null}

          <Outlet context={contextValue} />
        </main>
      </div>

      {sidebarOpen ? <button type="button" className="workspace-sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" /> : null}

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

function WorkspaceHomeRoute() {
  const { user, navigateToSection, activeTasks } = useWorkspace();
  const firstName = user.fullName?.trim().split(" ")[0] || "there";

  return (
    <>
      <section className="workspace-welcome-card">
        <div>
          <h2>Welcome back, {firstName}</h2>
          <p>
            Keep building insights. You currently have {activeTasks.length} active background
            {activeTasks.length === 1 ? " task" : " tasks"}.
          </p>
        </div>

        <div className="workspace-welcome-actions">
          <button type="button" className="workspace-quick-btn" onClick={() => navigateToSection("ingestion")}>
            New upload
          </button>
          <button type="button" className="workspace-quick-btn ghost" onClick={() => navigateToSection("dashboards")}>
            Open dashboards
          </button>
        </div>
      </section>

      <HomePage onNavigate={navigateToSection} />
    </>
  );
}

function WorkspaceIngestionRoute() {
  const { activeTasks, openDatasetForReview } = useWorkspace();

  return (
    <IngestionWizard
      activeBackgroundTasks={activeTasks}
      onCompleted={(result) => {
        openDatasetForReview(result?.datasetId, { openModal: true });
      }}
    />
  );
}

function WorkspaceReviewRoute() {
  const { resolvedDatasetId } = useWorkspace();

  return <DataReviewPage datasetId={resolvedDatasetId} />;
}

function WorkspaceDatasetsRoute() {
  const { resolvedDatasetId, openDatasetForReview } = useWorkspace();

  return (
    <DatasetsPage
      activeDatasetId={resolvedDatasetId}
      onOpenDataset={(datasetId) => {
        openDatasetForReview(datasetId, { openModal: false });
      }}
    />
  );
}

function WorkspaceChartsRoute() {
  const { setChartsExploreMode } = useWorkspace();

  useEffect(() => {
    return () => {
      setChartsExploreMode(false);
    };
  }, [setChartsExploreMode]);

  return <ChartsPage onExploreMode={setChartsExploreMode} />;
}

function WorkspaceDashboardsRoute() {
  const { setDashboardEditorMode } = useWorkspace();

  useEffect(() => {
    return () => {
      setDashboardEditorMode(false);
    };
  }, [setDashboardEditorMode]);

  return <DashboardPage onEditorMode={setDashboardEditorMode} />;
}

function WorkspaceSettingsRoute() {
  const { user, preferences, onPreferencesChange, onProfileChange } = useWorkspace();

  return (
    <SettingsPage
      user={user}
      preferences={preferences}
      onUpdatePreferences={onPreferencesChange}
      onUpdateProfile={onProfileChange}
    />
  );
}

function App() {
  const location = useLocation();
  const user = useAuthSnapshot();

  const [guestPreferences, setGuestPreferences] = useState(() => getDefaultPreferences());
  const preferences = user?.preferences || guestPreferences;

  const isExportMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("export") === "true";
  }, [location.search]);

  const effectiveTheme = useMemo(
    () => getEffectiveTheme(preferences.theme),
    [preferences.theme]
  );

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
        element={user && !isExportMode ? <Navigate to="/app/home" replace /> : <LoginPage />}
      />
      <Route
        path="/auth/signup"
        element={user && !isExportMode ? <Navigate to="/app/home" replace /> : <SignUpPage />}
      />

      <Route element={<RequireAuth user={user} isExportMode={isExportMode} />}>
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

export default App;
