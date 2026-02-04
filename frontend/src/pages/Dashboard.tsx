import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AppCard } from "@/components/dashboard/AppCard";
import { FileText, ImageIcon, BarChart, Package } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const apps = [
    {
      title: "Listing Content Generator",
      description:
        "Create optimized product listings with AI-powered title, bullet points, and description generation.",
      icon: FileText,
      status: "active" as const,
      route: "/tools/listing-generator",
    },
    {
      title: "Image Editor & Optimizer",
      description:
        "Edit, optimize, and enhance your product images for maximum conversion.",
      icon: ImageIcon,
      status: "active" as const,
      route: "/tools/image-editor",
    },
    {
      title: "Analytics Dashboard",
      description:
        "Track your sales, rankings, and performance across all your products.",
      icon: BarChart,
      status: "coming-soon" as const,
    },
    {
      title: "Inventory Manager",
      description:
        "Manage your FBA and FBM inventory levels with smart restocking alerts.",
      icon: Package,
      status: "coming-soon" as const,
    },
  ];

  const handleLaunch = (route: string) => {
    // navigate(route);
    window.open("https://test1.salesduo.com", "_blank", "noopener,noreferrer");
  };

  return (
    <Layout>
      <div className="space-y-10">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-background p-8 md:p-12 border border-primary/10">
          <div className="relative z-10 max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
              Welcome back, <span className="text-primary">{user?.full_name || "Seller"}</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Access your tools, manage your inventory, and grow your Amazon business with AI-powered insights.
            </p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary to-transparent" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Your Apps</h2>
              <p className="text-muted-foreground mt-1">
                Launch any of your available tools to start optimizing.
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {apps.map((app) => (
              <AppCard
                key={app.title}
                title={app.title}
                description={app.description}
                icon={app.icon}
                status={app.status}
                onLaunch={
                  app.route ? () => handleLaunch(app.route!) : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
