import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Apps from "./pages/Apps";
import Plans from "./pages/Plans";
import Billing from "./pages/Billing";
import Profile from "./pages/Profile";
import Organisation from "./pages/Organisation";
import CreateOrganisation from "./pages/CreateOrganisation";
import ChooseOrganisation from "./pages/ChooseOrganisation";
import Integrations from "./pages/Integrations";
import IntegrationOnboarding from "./pages/IntegrationOnboarding";
import NotFound from "./pages/NotFound";
import ListingGenerator from "./pages/tools/ListingGenerator";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminApps from "./pages/admin/AdminApps";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminOrganizations from "./pages/admin/AdminOrganizations";
import AuditLogs from "./pages/admin/AuditLogs";
import InviteAccepted from "./pages/InviteAccepted";
import PendingInvitations from "./pages/PendingInvitations";
import DesignSystem from "./pages/DesignSystem";


const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading, activeOrganization } = useAuth();
  const location = useLocation();

  if (isLoading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return <Navigate to={`/login${location.search}`} replace />;
  }

  // If user has no organization and is not on the creation page, redirect them
  if ((!user?.memberships || user.memberships.length === 0) && location.pathname !== "/create-organisation" && location.pathname !== "/pending-invites") {
    return <Navigate to={`/create-organisation${location.search}`} replace />;
  }

  // If user has organizations but none is active, redirect to selection (unless already there or creating/handling invites)
  if (user?.memberships && user.memberships.length > 0 && !activeOrganization &&
    location.pathname !== "/choose-organisation" &&
    location.pathname !== "/create-organisation" &&
    location.pathname !== "/pending-invites") {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`/choose-organisation?redirect=${encodeURIComponent(currentPath)}`} replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/apps" replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    // If there's an external redirect param, honour it instead of going to /apps
    const params = new URLSearchParams(location.search);
    const redirectUrl = params.get("redirect");

    // NOTE: We now intercept all "already logged in" users to choose org first
    // We pass the redirectUrl along to the chooser

    // Construct target URL for chooser
    const target = `/choose-organisation${location.search}`;

    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignUp />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/choose-organisation"
        element={
          <ProtectedRoute>
            <ChooseOrganisation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/apps"
        element={
          <ProtectedRoute>
            <Apps />
          </ProtectedRoute>
        }
      />
      <Route
        path="/plans"
        element={
          <ProtectedRoute>
            <Plans />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <Billing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/integrations"
        element={
          <ProtectedRoute>
            <Integrations />
          </ProtectedRoute>
        }
      />
      <Route
        path="/integration-onboarding"
        element={
          <ProtectedRoute>
            <IntegrationOnboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools/listing-generator"
        element={
          <ProtectedRoute>
            <ListingGenerator />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/organisation"
        element={
          <ProtectedRoute>
            <Organisation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create-organisation"
        element={
          <ProtectedRoute>
            <CreateOrganisation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pending-invites"
        element={
          <ProtectedRoute>
            <PendingInvitations />
          </ProtectedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/apps"
        element={
          <AdminRoute>
            <AdminApps />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/plans"
        element={
          <AdminRoute>
            <AdminPlans />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsers />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <AdminRoute>
            <AuditLogs />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/organizations"
        element={
          <AdminRoute>
            <AdminOrganizations />
          </AdminRoute>
        }
      />
      <Route
        path="/accept-invite"
        element={
          <InviteAccepted />
        }
      />

      {/* Design System */}
      <Route
        path="/design"
        element={
          <DesignSystem />
        }
      />

      {/* Redirect root to dashboard or login */}
      <Route path="/" element={<Navigate to="/apps" replace />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
