import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Database,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const FEATURE_ITEMS = [
  {
    icon: Database,
    title: "Reliable ingestion pipeline",
    description: "Streamline CSV and Excel ingestion with schema validation and quarantine handling.",
  },
  {
    icon: BarChart3,
    title: "Analytics-ready charting",
    description: "Transform raw datasets into editable visual stories with flexible chart exploration.",
  },
  {
    icon: LayoutDashboard,
    title: "Executive dashboards",
    description: "Compose reusable dashboards with role-aware collaboration and export workflows.",
  },
  {
    icon: Workflow,
    title: "Operational workflow",
    description: "From upload to review to reporting, keep BI operations centralized and trackable.",
  },
];

export default function PublicLandingPage() {
  return (
    <div className="public-page">
      <div className="public-bg-grid" aria-hidden="true" />

      <header className="public-topbar">
        <div className="public-brand">
          <span className="public-brand-mark">
            <Sparkles size={16} />
          </span>
          <div>
            <strong>Analytics BI</strong>
            <span>Enterprise Data Intelligence</span>
          </div>
        </div>

        <div className="public-actions">
          <Link to="/auth/login" className="public-btn ghost">
            Login
          </Link>
          <Link to="/auth/signup" className="public-btn solid">
            Sign up
          </Link>
        </div>
      </header>

      <main className="public-main">
        <section className="public-hero">
          <p className="public-kicker">
            <ShieldCheck size={14} />
            Role-aware workspace for enterprise teams
          </p>

          <h1>
            Build a production-grade analytics workflow,
            <span> from ingestion to decision.</span>
          </h1>

          <p className="public-subtitle">
            Launch a modern BI cockpit with secure role-based authentication, responsive navigation,
            and dedicated workspace pages for every data operation.
          </p>

          <div className="public-cta-row">
            <Link to="/auth/signup" className="public-btn xl solid">
              Start with Sign up
              <ArrowRight size={16} />
            </Link>
            <Link to="/auth/login" className="public-btn xl outline">
              Continue to Login
            </Link>
          </div>

          <div className="public-metrics">
            <article>
              <strong>8+</strong>
              <span>Dedicated workspace pages</span>
            </article>
            <article>
              <strong>100%</strong>
              <span>Responsive experience</span>
            </article>
            <article>
              <strong>Role-based</strong>
              <span>Admin, Editor, Viewer ready</span>
            </article>
          </div>
        </section>

        <section className="public-feature-grid" aria-label="Platform capabilities">
          {FEATURE_ITEMS.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="public-feature-card">
                <div className="public-feature-icon">
                  <Icon size={20} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
