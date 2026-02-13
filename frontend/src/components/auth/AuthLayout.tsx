import { ReactNode } from "react";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const leftContent = (
    <div className="relative z-10 w-full">
      <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-sm">
        Supercharge Your Amazon Business
      </h1>
      <p className="text-lg text-white/90">
        All-in-one platform for listing optimization, image editing, and
        more tools to grow your Amazon seller business.
      </p>
    </div>
  );

  return (
    <SplitScreenLayout leftContent={leftContent}>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </SplitScreenLayout>
  );
}
