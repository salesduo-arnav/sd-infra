import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AppCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  status: "active" | "locked" | "coming-soon";
  onLaunch?: () => void;
}

export function AppCard({
  title,
  description,
  icon: Icon,
  status,
  onLaunch,
}: AppCardProps) {
  const isAccessible = status === "active";

  const statusConfig = {
    active: { label: "Active", variant: "default" as const },
    locked: { label: "Upgrade Required", variant: "outline" as const },
    "coming-soon": { label: "Coming Soon", variant: "outline" as const },
  };

  const { label, variant } = statusConfig[status];

  return (
    <Card className={`relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group border-border/50 bg-card/50 backdrop-blur-sm ${!isAccessible ? "opacity-75 bg-muted/50" : "hover:border-primary/50"}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20 ${!isAccessible && "grayscale"}`}>
            <Icon className="h-6 w-6 text-primary transition-transform group-hover:scale-110" />
          </div>
          <Badge variant={variant} className="rounded-md px-2 py-0.5 font-medium">{label}</Badge>
        </div>
        <CardTitle className="mt-4 text-lg group-hover:text-primary transition-colors">{title}</CardTitle>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full relative overflow-hidden group/btn font-medium"
          variant={isAccessible ? "default" : "secondary"}
          disabled={!isAccessible}
          onClick={onLaunch}
        >
          <span className="relative z-10 flex items-center gap-2">
            {status === "coming-soon"
              ? "Notify Me"
              : status === "locked"
                ? "Upgrade to Access"
                : "Launch App"
            }
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
