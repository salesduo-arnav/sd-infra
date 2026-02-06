import { ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  animationClass?: string;
}

export function Layout({ children, animationClass }: LayoutProps) {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter((segment) => segment);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background transition-colors">
        <AppSidebar />
        <main className="flex-1 overflow-hidden flex flex-col h-screen">
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/50 px-4 backdrop-blur-sm transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink asChild>
                      <Link to="/apps">Home</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {pathSegments.map((segment, index) => {
                    const path = `/${pathSegments.slice(0, index + 1).join("/")}`;
                    const isLast = index === pathSegments.length - 1;
                    const title = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");

                    return (
                      <div key={path} className="flex items-center">
                        <BreadcrumbSeparator className="hidden md:block" />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage>{title}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink asChild>
                              <Link to={path}>{title}</Link>
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </div>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            {/* Optional: Add user menu or actions here if needed in top right */}
          </header>
          <div className="flex-1 overflow-auto p-6 md:p-8">
            <div className={cn("mx-auto max-w-6xl space-y-8", animationClass ?? "animate-in fade-in slide-in-from-bottom-4 duration-500")}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
