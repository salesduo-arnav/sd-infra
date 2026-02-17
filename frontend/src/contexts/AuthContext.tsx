import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import api from "@/lib/api";
import { AxiosError } from "axios";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Role {
  id: number;
  name: string;
  slug: string; // Assuming role has a slug or name
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
  has_password?: boolean;
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

interface SignupData {
  full_name: string;
  email: string;
  password: string;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  activeOrganization: Organization | null;
  switchOrganization: (orgId: string, org?: Organization) => void;
  login: (email: string, password: string, token?: string) => Promise<void>;
  loginWithGoogle: (code: string, token?: string) => Promise<User | void>;
  signup: (name: string, email: string, password: string, token?: string) => Promise<User | void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  checkPendingInvites: () => Promise<Invitation[]>;
  acceptInvite: (token: string) => Promise<void>;
  declineInvite: (token: string) => Promise<void>;
  // OTP methods
  sendLoginOtp: (email: string) => Promise<void>;
  verifyLoginOtp: (email: string, otp: string) => Promise<void>;
  sendSignupOtp: (data: SignupData) => Promise<void>;
  verifySignupOtp: (email: string, otp: string) => Promise<User | void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const resolveActiveOrg = (user: User | null) => {
  if (user && user.memberships && user.memberships.length > 0) {
    const savedOrgId = localStorage.getItem("activeOrganizationId");
    if (savedOrgId) {
      const savedOrg = user.memberships.find(m => m.organization.id === savedOrgId)?.organization;
      if (savedOrg) {
        return savedOrg;
      }
    }
    return null;
  }
  return null;
};

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

  const switchOrganization = (orgId: string, org?: Organization) => {
    if (org) {
      setActiveOrganization(org);
      localStorage.setItem("activeOrganizationId", org.id);
      return;
    }

    if (!user || !user.memberships) return;
    const member = user.memberships.find(m => m.organization.id === orgId);
    if (member) {
      setActiveOrganization(member.organization);
      localStorage.setItem("activeOrganizationId", member.organization.id);
    }
  };

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      const currentUser = res.data;

      // Resolve org BEFORE setting user to avoid flickering/race conditions in effects
      const org = resolveActiveOrg(currentUser);

      // Batch updates
      setActiveOrganization(org);
      setUser(currentUser);
    } catch (error) {
      console.error("Auth check failed", error);
      setUser(null);
      setActiveOrganization(null);
    }
  }, []);

  // Check for session on mount
  useEffect(() => {
    const initAuth = async () => {
      await refreshUser();
      setIsLoading(false);
    };
    initAuth();
  }, [refreshUser]);

  const isAdmin = user?.is_superuser || false;

  const login = async (email: string, password: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password, token });
      const currentUser = res.data.user;

      setActiveOrganization(null);
      localStorage.removeItem("activeOrganizationId");

      setUser(currentUser);
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (name: string, email: string, password: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', { full_name: name, email, password, token });
      setUser(res.data.user);
      setActiveOrganization(null);
      return res.data.user;
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (code: string, token?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/google', { code, token });
      const currentUser = res.data.user;
      setActiveOrganization(null);
      localStorage.removeItem("activeOrganizationId");
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Google login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const checkPendingInvites = async () => {
    try {
      const res = await api.get('/invitations/my-pending');
      return res.data;
    } catch (error) {
      console.error("Check pending invites failed", error);
      return [];
    }
  };

  const acceptInvite = async (token: string) => {
    try {
      await api.post('/invitations/accept', { token });
      await refreshUser(); // Refresh user to get new membership
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Failed to accept invite");
    }
  };

  const declineInvite = async (token: string) => {
    try {
      await api.post('/invitations/decline', { token });
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Failed to decline invite");
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    setActiveOrganization(null);
    localStorage.removeItem("activeOrganizationId");
  };

  // ===== OTP METHODS =====

  const sendLoginOtp = async (email: string) => {
    setIsLoading(true);
    try {
      await api.post('/auth/send-login-otp', { email });
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Failed to send OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyLoginOtp = async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-login-otp', { email, otp });
      const currentUser = res.data.user;
      setActiveOrganization(null);
      localStorage.removeItem("activeOrganizationId");
      setUser(currentUser);
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Invalid OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const sendSignupOtp = async (data: SignupData) => {
    setIsLoading(true);
    try {
      await api.post('/auth/send-signup-otp', {
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        token: data.token,
      });
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Failed to send verification OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const verifySignupOtp = async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-signup-otp', { email, otp });
      const currentUser = res.data.user;
      setActiveOrganization(null);
      localStorage.removeItem("activeOrganizationId");
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      const err = error as AxiosError<{ message: string }>;
      throw new Error(err.response?.data?.message || "Failed to verify OTP");
    } finally {
      setIsLoading(false);
    }
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
        // OTP methods
        sendLoginOtp,
        verifyLoginOtp,
        sendSignupOtp,
        verifySignupOtp,
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
