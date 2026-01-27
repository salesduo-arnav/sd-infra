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
    <Card className={`relative transition-shadow hover:shadow-md ${!isAccessible ? "opacity-75" : ""}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <CardTitle className="mt-4">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          variant={isAccessible ? "default" : "secondary"}
          disabled={!isAccessible}
          onClick={onLaunch}
        >
          {status === "coming-soon"
            ? "Notify Me"
            : status === "locked"
              ? "Upgrade to Access"
              : "Launch App"}
        </Button>
      </CardContent>
    </Card>
  );
}
