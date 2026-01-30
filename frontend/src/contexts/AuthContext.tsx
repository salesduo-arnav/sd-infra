import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_URL } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  is_superuser?: boolean;
  membership?: {
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    role: {
      name: string;
    };
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (name: string, email: string, password: string, token?: string) => Promise<User | void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include', // Important!
        body: JSON.stringify({ email, password }),
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

  const loginWithGoogle = async () => {
    // Implementation pending
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsLoading(false);
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
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        login,
        loginWithGoogle,
        signup,
        logout,
        isLoading,
        refreshUser,
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