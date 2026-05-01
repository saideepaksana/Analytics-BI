import { Link } from "react-router-dom";

const links = [
  { to: "/app/analytics/charts", label: "Charts" },
  { to: "/app/analytics/dashboards", label: "Dashboards" },
  { to: "/app/data/ingestion", label: "Ingestion" },
  { to: "/app/data/datasets", label: "Datasets" },
  { to: "/app/tools/settings", label: "Settings" }
];

export default function HomePage() {
  return (
    <section className="mfe-home card">
      <h2>Microfrontend Host</h2>
      <p className="muted">
        Your original client remains untouched. Use these routes to validate remote loading.
      </p>
      <div className="mfe-home-links">
        {links.map((item) => (
          <Link key={item.to} className="action-btn" to={item.to}>
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
