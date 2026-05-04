const fs = require('fs');
const file = 'apps/host/src/App.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/AUTH_EVENTS,\n  getCurrentUser,\n  getDefaultPreferences,\n  getEffectiveTheme,\n  logout,\n  updateCurrentUserPreferences,\n  updateCurrentUserProfile,\n  API_BASE_URL,\n  SOCKET_URL,/, 
  'getDefaultPreferences,\n  getEffectiveTheme,\n  updateCurrentUserPreferences,\n  updateCurrentUserProfile,\n  API_BASE_URL,\n  SOCKET_URL,');

content = content.replace(/import ProtectedRoute from ".\/components\/ProtectedRoute.jsx";\n/, '');

content = content.replace(/\/\/ ── Auth snapshot hook ──[\s\S]*?\/\/ ── Workspace context consumer ──/, '// ── Workspace context consumer ──');

content = content.replace(/function RootEntry\(\{ user \}\) \{[\s\S]*?if \(user\) \{[\s\S]*?return <Navigate to="\/app\/home" replace \/>;\n  \}[\s\S]*?return <PublicLandingPage \/>;\n\}/, `function RootEntry() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasLegacyView = searchParams.has("view");
  const isExportMode = searchParams.get("export") === "true";

  if (hasLegacyView || isExportMode) {
    const legacyView = searchParams.get("view") || "home";
    const mappedRoute = LEGACY_VIEW_TO_ROUTE[legacyView] || "home";

    searchParams.delete("view");
    const query = searchParams.toString();

    return <Navigate to={\`/app/\${mappedRoute}\${query ? \`?\${query}\` : ""}\`} replace />;
  }

  return <Navigate to="/app/home" replace />;
}`);

content = content.replace(/function AccessDenied[\s\S]*?function RoleRoute[\s\S]*?return children;\n\}\n/m, '');

content = content.replace(/function WorkspaceLayout\(\{[\s\S]*?user,\n  isExportMode,\n  preferences,\n  onPreferencesChange,\n  onProfileChange,\n\}\) \{/, `function WorkspaceLayout({
  isExportMode,
  preferences,
  onPreferencesChange,
  onProfileChange,
}) {`);

content = content.replace(/const effectiveUser = useMemo\(\n    \(\) =>\n      user \|\|\s*\{\n        \.\.\.EXPORT_USER,\n        preferences,\n      \},\n    \[preferences, user\]\n  \);/, `const effectiveUser = useMemo(
    () => ({
      ...EXPORT_USER,
      preferences,
    }),
    [preferences]
  );`);

content = content.replace(/const visibleNavItems = useMemo\(\(\) => \{[\s\S]*?\}, \[effectiveUser\.role, isExportMode\]\);/, 'const visibleNavItems = NAV_ITEMS;');

content = content.replace(/<button\s*type="button"\s*className="workspace-logout-btn topbar"\s*onClick=\{\(\) => \{\s*logout\(\);\s*navigate\("\/", \{ replace: true \}\);\s*\}\}\s*>\s*<LogOut size=\{15\} \/>\s*<span>Sign out<\/span>\s*<\/button>/, '');

content = content.replace(/export default function App\(\) \{[\s\S]*?const user = useAuthSnapshot\(\);\n\n  const \[guestPreferences, setGuestPreferences\] = useState\(\(\) => getDefaultPreferences\(\)\);\n  const preferences = user\?\.preferences \|\| guestPreferences;/, `export default function App() {
  const location = useLocation();

  const [guestPreferences, setGuestPreferences] = useState(() => getDefaultPreferences());
  const preferences = guestPreferences;`);

content = content.replace(/const handlePreferencesChange = useCallback\(\n    \(nextPreferences\) => \{[\s\S]*?\}, \[user\]\n  \);/, `const handlePreferencesChange = useCallback(
    (nextPreferences) => {
      updateCurrentUserPreferences(nextPreferences);
      setGuestPreferences((previous) => ({
        ...previous,
        ...nextPreferences,
      }));
    },
    []
  );`);

content = content.replace(/const handleProfileChange = useCallback\(\n    \(profile\) => \{[\s\S]*?\}, \[user\]\n  \);/, `const handleProfileChange = useCallback(
    (profile) => {
      updateCurrentUserProfile(profile);
    },
    []
  );`);

let newRoutes = `<Routes>
      <Route path="/" element={<RootEntry />} />

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

      <Route path="/embed/:dashboardId" element={<EmbedDashboard />} />

      <Route
        path="/app"
        element={
          <WorkspaceLayout
            isExportMode={isExportMode}
            preferences={preferences}
            onPreferencesChange={handlePreferencesChange}
            onProfileChange={handleProfileChange}
          />
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<WorkspaceHomeRoute />} />
        <Route path="ingestion" element={<WorkspaceIngestionRoute />} />
        <Route path="review" element={<WorkspaceReviewRoute />} />
        <Route path="datasets" element={<WorkspaceDatasetsRoute />} />
        <Route path="charts" element={<WorkspaceChartsRoute />} />
        <Route path="dashboards" element={<WorkspaceDashboardsRoute />} />
        <Route path="settings" element={<WorkspaceSettingsRoute />} />
        <Route path="*" element={<Navigate to="/app/home" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/app/home" replace />} />
    </Routes>`;

content = content.replace(/<Routes>[\s\S]*<\/Routes>/, newRoutes);

// Remove unused LogOut icon if it's there
content = content.replace(/LogOut,\n  /, '');

fs.writeFileSync('apps/host/src/App.jsx.new', content);
