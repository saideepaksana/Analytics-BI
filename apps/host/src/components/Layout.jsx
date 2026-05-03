import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import {
  Database,
  Home,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings,
  Upload,
  UserCircle2,
} from "lucide-react";
import { logout } from "@analytics-bi/shared-lib";

/**
 * Icon lookup keyed by nav-item id so the Layout can render icons
 * that match the client's workspace topbar exactly.
 */
const ICON_MAP = {
  home: Home,
  ingestion: Upload,
  datasets: Database,
  charts: PieChart,
  dashboards: LayoutDashboard,
  settings: Settings,
};

/**
 * WorkspaceShellLayout
 *
 * This is the MFE-host equivalent of the client's WorkspaceLayout.
 * It renders the topbar/sidebar chrome and passes all workspace context
 * through to its child routes via React Router's <Outlet context>.
 *
 * The parent <WorkspaceLayout> in App.jsx provides the workspace context
 * via its own <Outlet context>. This component consumes that context
 * and re-passes it to its children.
 */
export default function Layout() {
  const navigate = useNavigate();
  const ctx = useOutletContext();

  // If context is unavailable (shouldn't happen), render children directly
  if (!ctx) {
    return <Outlet />;
  }

  const {
    user,
    isExportMode,
    visibleNavItems = [],
    isImmersive = false,
    effectiveTheme,
  } = ctx;

  // In export mode, render content without any chrome
  if (isExportMode) {
    return (
      <main className="workspace-export-only" data-theme={effectiveTheme}>
        <Outlet context={ctx} />
      </main>
    );
  }

  return (
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
            <span>{user?.fullName || "Guest"}</span>
            <em>{user?.role || "viewer"}</em>
          </div>
        </div>

        <nav className="workspace-topnav" aria-label="Primary navigation">
          {visibleNavItems.map((item) => {
            const Icon = ICON_MAP[item.id] || Home;
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
        <Outlet context={ctx} />
      </main>
    </div>
  );
}
