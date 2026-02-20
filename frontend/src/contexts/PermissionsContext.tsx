import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface PermissionsContextType {
  permissions: Set<string>;
  hasPermission: (permissionId: string) => boolean;
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { activeOrganization, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!isAuthenticated || !activeOrganization) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }

    try {
      const res = await api.get("/organizations/my-permissions", {
        headers: { "x-organization-id": activeOrganization.id },
      });
      setPermissions(new Set(res.data.permissions));
    } catch {
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeOrganization]);

  useEffect(() => {
    setLoading(true);
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (permissionId: string) => permissions.has(permissionId),
    [permissions]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, hasPermission, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
}
