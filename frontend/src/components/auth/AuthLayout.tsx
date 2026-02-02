import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding with Gradient */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large circle */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-sm" />
          {/* Medium circle */}
          <div className="absolute top-1/2 -left-12 w-64 h-64 bg-white/5 rounded-full" />
          {/* Small circle */}
          <div className="absolute bottom-24 right-1/4 w-32 h-32 bg-white/10 rounded-full blur-sm" />
          {/* Diagonal line pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)',
              backgroundSize: '20px 20px'
            }} />
          </div>
        </div>

        <Link to="/" className="flex items-center gap-2 h-20 w-20 relative z-10">
          <img src="salesduologo.svg" alt="SalesDuo" className="drop-shadow-lg" />
        </Link>

        <div className="relative z-10">
          <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-sm">
            Supercharge Your Amazon Business
          </h1>
          <p className="text-lg text-white/90">
            All-in-one platform for listing optimization, image editing, and
            more tools to grow your Amazon seller business.
          </p>
        </div>

        <p className="text-sm text-white/70 relative z-10">
          © 2024 SalesDuo. All rights reserved.
        </p>
      </div>

      {/* Right side - Form */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold">SalesDuo</span>
            </Link>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
