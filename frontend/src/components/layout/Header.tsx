import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { UserMenu } from "./UserMenu";
import { Package } from "lucide-react";

export function Header() {
  const { isAuthenticated } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold">SalesDuo</span>
        </Link>

        {isAuthenticated && (
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              to="/organisation"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Organisation
            </Link>
            <Link
              to="/plans"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Plans
            </Link>
            <Link
              to="/billing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Billing
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <UserMenu />
          ) : (
            <Link
              to="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
