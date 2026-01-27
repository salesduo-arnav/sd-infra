import { createContext, useContext, useState, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock admin emails for demo purposes
// TODO: Replace with proper role checking from backend
const ADMIN_EMAILS = ["admin@example.com", "admin@SalesDuo.com"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = user ? ADMIN_EMAILS.includes(user.email) : false;

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    // TODO: Replace with your backend API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({
      id: "1",
      email,
      name: email.split("@")[0],
    });
    setIsLoading(false);
  };

  const loginWithGoogle = async () => {
    setIsLoading(true);
    // TODO: Replace with your Google OAuth flow
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({
      id: "1",
      email: "admin@example.com",
      name: "Demo Admin",
    });
    setIsLoading(false);
  };

  const signup = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    // TODO: Replace with your backend API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({
      id: "1",
      email,
      name,
    });
    setIsLoading(false);
  };

  const logout = () => {
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
