import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { AppCard } from "@/components/dashboard/AppCard";
import { FileText, ImageIcon, BarChart, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { getTools, Tool } from "@/services/tool.service";

export default function Apps() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTools = async () => {
      try {
        const data = await getTools();
        setTools(data);
      } catch (error) {
        console.error("Failed to fetch tools", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTools();
  }, []);

  const icons = [FileText, ImageIcon, BarChart, Package];

  const handleLaunch = (tool: Tool) => {
    if (tool.tool_link) {
      if (tool.tool_link.startsWith("http")) {
        window.open(tool.tool_link, "_blank", "noopener,noreferrer");
      } else {
        navigate(tool.tool_link);
      }
    }
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
            {loading ? (
              <div className="col-span-full text-center text-muted-foreground">Loading tools...</div>
            ) : (
              tools.map((tool, index) => {
                const Icon = icons[index % icons.length];
                return (
                  <AppCard
                    key={tool.id}
                    title={tool.name}
                    description={tool.description || ""}
                    icon={Icon}
                    status={tool.is_active ? "active" : "coming-soon"}
                    onLaunch={() => handleLaunch(tool)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
