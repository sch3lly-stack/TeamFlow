import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { PageLoader } from "./components/ui";
import { useAuth } from "./providers/AuthProvider";
import { useWorkspace } from "./providers/WorkspaceProvider";
import { AnalyticsPage } from "./pages/Analytics";
import { CalendarPage } from "./pages/Calendar";
import { DashboardPage } from "./pages/Dashboard";
import { InvitePage } from "./pages/Invite";
import { LoginPage } from "./pages/Login";
import { MyWorkPage } from "./pages/MyWork";
import { NotificationsPage } from "./pages/Notifications";
import { OnboardingPage } from "./pages/Onboarding";
import { ProjectDetailPage } from "./pages/ProjectDetail";
import { ProjectsPage } from "./pages/Projects";
import { RegisterPage } from "./pages/Register";
import { SettingsPage } from "./pages/Settings";
import { WorkloadPage } from "./pages/Workload";

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The page you are looking for has moved or never existed.
      </p>
      <a href="/" className="mt-5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
        Back to dashboard
      </a>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { organizations } = useWorkspace();
  const location = useLocation();
  const isNewOrg = new URLSearchParams(location.search).get("new") === "1";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-ink-950">
        <PageLoader label="Starting TeamFlow" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  // Authenticated users go to their workspace instead of the auth screens.
  if (location.pathname === "/login" || location.pathname === "/register") {
    return <Navigate to="/" replace />;
  }

  if (
    organizations.length === 0 &&
    location.pathname !== "/onboarding" &&
    !location.pathname.startsWith("/invite/")
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  if (organizations.length > 0 && location.pathname === "/onboarding" && !isNewOrg) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/my-work" element={<MyWorkPage />} />
        <Route path="/workload" element={<WorkloadPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
