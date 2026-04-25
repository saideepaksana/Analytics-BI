import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "@analytics-bi/shared-lib";

const navItems = [
  { to: "/app/home", label: "Home" },
  { to: "/app/analytics/charts", label: "Charts" },
  { to: "/app/analytics/dashboards", label: "Dashboards" },
  { to: "/app/data/ingestion", label: "Ingestion" },
  { to: "/app/data/datasets", label: "Datasets" },
  { to: "/app/data/review", label: "Data Review" },
  { to: "/app/tools/settings", label: "Settings" }
];

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div className="mfe-layout">
      <aside className="mfe-sidebar">
        <h2>Analytics BI</h2>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="mfe-nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="action-btn danger-btn"
          onClick={() => {
            logout();
            navigate("/", { replace: true });
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="mfe-content">
        <Outlet />
      </main>
    </div>
  );
}
