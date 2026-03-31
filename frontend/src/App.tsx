import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { FullPageLoader } from "@/components/layout/FullPageLoader";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { captureRedirectContext, clearRedirectContext, hasRedirectContext } from "@/lib/redirectContext";
import { trackPageView } from "@/lib/mixpanel";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { PageTitle } from "@/components/PageTitle";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Apps from "./pages/Apps";
import Plans from "./pages/Plans";
import Billing from "./pages/Billing";
import CheckoutPage from "./pages/CheckoutPage";
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
import AdminConfigs from "./pages/admin/AdminConfigs";
import AdminRBAC from "./pages/admin/AdminRBAC";
import AuditLogs from "./pages/admin/AuditLogs";
import AdminEntitlements from "./pages/admin/AdminEntitlements";
import InviteAccepted from "./pages/InviteAccepted";
import PendingInvitations from "./pages/PendingInvitations";
import DesignSystem from "./pages/DesignSystem";


const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, activeOrganization } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/login${location.search}`} replace />;
  }

  // Normalize path to prevent redirect loops from trailing slashes or case differences
  const normalizedPath = location.pathname.toLowerCase().replace(/\/$/, "") || "/";

  // If user has no organization and is not on the creation page, redirect them
  if ((!user?.memberships || user.memberships.length === 0) && normalizedPath !== "/create-organisation" && normalizedPath !== "/pending-invites") {
    return <Navigate to={`/create-organisation${location.search}`} replace />;
  }

  // If user has organizations but none is active, redirect to selection (unless already there or creating/handling invites)
  if (user?.memberships && user.memberships.length > 0 && !activeOrganization &&
    normalizedPath !== "/choose-organisation" &&
    normalizedPath !== "/create-organisation" &&
    normalizedPath !== "/pending-invites" &&
    normalizedPath !== "/integration-onboarding") {
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

function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { isAuthenticated, activeOrganization } = useAuth();
  const { hasPermission, loading } = usePermissions();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!activeOrganization || loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return <Navigate to="/apps" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, activeOrganization } = useAuth();
  const location = useLocation();

  // Capture redirect/app params from URL into sessionStorage on every render.
  // This ensures that whichever entry point the user hits first (login, signup),
  // the context is persisted before any navigation happens.
  const params = new URLSearchParams(location.search);
  captureRedirectContext(params);

  if (isAuthenticated) {
    // Already have an active org?
    if (activeOrganization) {
      if (hasRedirectContext()) {
        // External app redirect pending — route through integration onboarding
        // (it auto-skips and redirects if no integrations are needed)
        return <Navigate to="/integration-onboarding" replace />;
      }
      // No external redirect — go to apps
      clearRedirectContext();
      return <Navigate to="/apps" replace />;
    }

    // No memberships at all — need to create an org first
    if (!user?.memberships || user.memberships.length === 0) {
      return <Navigate to="/create-organisation" replace />;
    }

    // Has memberships but no active org — go to org selection
    return <Navigate to="/choose-organisation" replace />;
  }
  return <>{children}</>;
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { isInitializing, isOrgResolving } = useAuth();

  if (isInitializing || isOrgResolving) {
    return <FullPageLoader message="Initializing workspace..." />;
  }

  return <>{children}</>;
}

function AppLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function PageViewTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

function AppRoutes() {
  return (
    <>
    <PageViewTracker />
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <PageTitle title="Login"><Login /></PageTitle>
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <PageTitle title="Sign Up"><SignUp /></PageTitle>
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <PageTitle title="Forgot Password"><ForgotPassword /></PageTitle>
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <PageTitle title="Reset Password"><ResetPassword /></PageTitle>
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/choose-organisation"
        element={
          <ProtectedRoute>
            <PageTitle title="Choose Organisation"><ChooseOrganisation /></PageTitle>
          </ProtectedRoute>
        }
      />

      <Route
        path="/create-organisation"
        element={
          <ProtectedRoute>
            <PageTitle title="Create Organisation"><CreateOrganisation /></PageTitle>
          </ProtectedRoute>
        }
      />

      <Route
        path="/pending-invites"
        element={
          <ProtectedRoute>
            <PageTitle title="Pending Invitations"><PendingInvitations /></PageTitle>
          </ProtectedRoute>
        }
      />
      <Route
        path="/integration-onboarding"
        element={
          <ProtectedRoute>
            <PageTitle title="Integration Setup"><IntegrationOnboarding /></PageTitle>
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkout"
        element={
          <ProtectedRoute>
            <PermissionRoute permission="billing.manage">
              <PageTitle title="Checkout"><CheckoutPage /></PageTitle>
            </PermissionRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools/listing-generator"
        element={
          <ProtectedRoute>
            <PageTitle title="Listing Generator"><ListingGenerator /></PageTitle>
          </ProtectedRoute>
        }
      />
      <Route element={<AppLayout />}>
        <Route
          path="/apps"
          element={
            <ProtectedRoute>
              <PageTitle title="Apps"><Apps /></PageTitle>
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="plans.view">
                <PageTitle title="Plans"><Plans /></PageTitle>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <PermissionRoute permission="billing.view">
                <PageTitle title="Billing"><Billing /></PageTitle>
              </PermissionRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/integrations"
          element={
            <ProtectedRoute>
              <PageTitle title="Integrations"><Integrations /></PageTitle>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <PageTitle title="Profile"><Profile /></PageTitle>
            </ProtectedRoute>
          }
        />
        <Route
          path="/organisation"
          element={
            <ProtectedRoute>
              <PageTitle title="Organisation"><Organisation /></PageTitle>
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <PageTitle title="Admin Dashboard"><AdminDashboard /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/apps"
          element={
            <AdminRoute>
              <PageTitle title="Admin - Apps"><AdminApps /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/plans"
          element={
            <AdminRoute>
              <PageTitle title="Admin - Plans"><AdminPlans /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <PageTitle title="Admin - Users"><AdminUsers /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <AdminRoute>
              <PageTitle title="Audit Logs"><AuditLogs /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/organizations"
          element={
            <AdminRoute>
              <PageTitle title="Admin - Organizations"><AdminOrganizations /></PageTitle>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/entitlements"
          element={
            <AdminRoute>
              <AdminEntitlements />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/configs"
          element={
            <AdminRoute>
              <AdminConfigs />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/rbac"
          element={
            <AdminRoute>
              <AdminRBAC />
            </AdminRoute>
          }
        />
      </Route>
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

      {/* Redirect root to login (PublicRoute will bounce authenticated users to /apps) */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PermissionsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppInitializer>
              <AppRoutes />
            </AppInitializer>
          </BrowserRouter>
        </TooltipProvider>
      </PermissionsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

