import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AppCard } from "@/components/dashboard/AppCard";
import { QuickStats } from "@/components/dashboard/QuickStats";
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
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {user?.full_name || "Seller"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Access your tools and manage your Amazon business
          </p>
        </div>

        <QuickStats />

        <div>
          <h2 className="text-xl font-semibold">Your Apps</h2>
          <p className="text-sm text-muted-foreground">
            Launch any of your available tools below
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
    </Layout>
  );
}
