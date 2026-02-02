import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_URL } from "@/lib/api";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Role {
  id: number;
  name: string;
}

export interface OrganizationMember {
  organization: Organization;
  role: Role;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_superuser?: boolean;
  memberships?: OrganizationMember[];
}

export interface Invitation {
  id: string;
  email: string;
  role: { id: number; name: string };
  status: string;
  organization_id: string;
  invited_by: string;
  token: string;
  organization: { name: string };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  activeOrganization: Organization | null;
  switchOrganization: (orgId: string) => void;
  login: (email: string, password: string, token?: string) => Promise<void>;
  loginWithGoogle: (code: string, token?: string) => Promise<User | void>;
  signup: (name: string, email: string, password: string, token?: string) => Promise<User | void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  checkPendingInvites: () => Promise<Invitation[]>;
  acceptInvite: (token: string) => Promise<void>;
  declineInvite: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load active organization from localStorage on mount
  useEffect(() => {
    const savedOrgId = localStorage.getItem("activeOrganizationId");
    if (user && user.memberships && user.memberships.length > 0) {
        if (savedOrgId) {
            const savedOrg = user.memberships.find(m => m.organization.id === savedOrgId)?.organization;
            if (savedOrg) {
                setActiveOrganization(savedOrg);
                return;
            }
        }
        // Default to first organization if no saved one found or saved one is invalid
        setActiveOrganization(user.memberships[0].organization);
    } else {
        setActiveOrganization(null);
    }
  }, [user]);

  const switchOrganization = (orgId: string) => {
      if (!user || !user.memberships) return;
      const member = user.memberships.find(m => m.organization.id === orgId);
      if (member) {
          setActiveOrganization(member.organization);
          localStorage.setItem("activeOrganizationId", member.organization.id);
      }
  };

  const refreshUser = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (error) {
      console.error("Auth check failed", error);
    }
  };

  // Check for session on mount
  useEffect(() => {
    const initAuth = async () => {
      await refreshUser();
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const isAdmin = user?.is_superuser || false;

  const login = async (email: string, password: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include', // Important!
        body: JSON.stringify({ email, password, token }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }

      const data = await res.json();
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (name: string, email: string, password: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include', // Important!
        body: JSON.stringify({ full_name: name, email, password, token }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Signup failed");
      }

      const data = await res.json();
      setUser(data.user);
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (code: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ code, token }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Google login failed");
      }

      const data = await res.json();
      setUser(data.user);
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const checkPendingInvites = async () => {
    try {
      const res = await fetch(`${API_URL}/invitations/my-pending`, {
          credentials: 'include'
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (error) {
       console.error("Check pending invites failed", error);
       return [];
    }
  };

  const acceptInvite = async (token: string) => {
      const res = await fetch(`${API_URL}/invitations/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({ token }),
      });

      if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to accept invite");
      }
      
      // Refresh user to get new membership
      await refreshUser();
  };

  const declineInvite = async (token: string) => {
      const res = await fetch(`${API_URL}/invitations/decline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include',
          body: JSON.stringify({ token }),
      });

      if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to decline invite");
      }
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: 'include'
      });
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    setActiveOrganization(null);
    localStorage.removeItem("activeOrganizationId");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        activeOrganization,
        switchOrganization,
        login,
        loginWithGoogle,
        signup,
        logout,
        isLoading,
        refreshUser,
        checkPendingInvites,
        acceptInvite,
        declineInvite,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}