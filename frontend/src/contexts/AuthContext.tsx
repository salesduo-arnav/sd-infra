import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_URL } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string;
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
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (code: string, token?: string) => Promise<void>;
  signup: (name: string, email: string, password: string, token?: string) => Promise<User | void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  // OTP methods
  sendLoginOtp: (email: string) => Promise<void>;
  verifyLoginOtp: (email: string, otp: string) => Promise<void>;
  sendSignupOtp: (data: SignupData) => Promise<void>;
  verifySignupOtp: (email: string, otp: string) => Promise<User | void>;
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
    } finally {
      setIsLoading(false);
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
  };

  // ===== OTP METHODS =====

  const sendLoginOtp = async (email: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/send-login-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send OTP");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyLoginOtp = async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/verify-login-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Invalid OTP");
      }

      const data = await res.json();
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const sendSignupOtp = async (data: SignupData) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/send-signup-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          token: data.token,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send verification OTP");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifySignupOtp = async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/verify-signup-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to verify OTP");
      }

      const data = await res.json();
      setUser(data.user);
      return data.user;
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
        login,
        loginWithGoogle,
        signup,
        logout,
        isLoading,
        refreshUser,
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
