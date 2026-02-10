import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    growth?: number; // percentage
    growthAbsolute?: number; // absolute number
    className?: string;
    iconClassName?: string;
    trend?: "up" | "down" | "neutral"; // optional manual override, otherwise derived from growth
}

export function StatsCard({ title, value, icon: Icon, description, growth, growthAbsolute, className, iconClassName }: StatsCardProps) {
    const isPositive = growth !== undefined ? growth >= 0 : true;
    const trendColor = isPositive ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30" : "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30";
    const iconColor = isPositive ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"; // Default icon color, can be overridden

    return (
        <Card className={cn(
            "overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200",
            "bg-white dark:bg-slate-950/50", // Base background
            className
        )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                <div className={cn("p-2 rounded-full bg-primary/10", iconClassName)}>
                    <Icon className={cn("h-4 w-4 text-primary")} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tracking-tight">{value}</div>
                {growth !== undefined ? (
                    <div className="flex items-center gap-2 mt-1">
                        <div className={cn("text-xs font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1", trendColor)}>
                            {growth > 0 ? "+" : ""}{growth.toFixed(1)}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {growthAbsolute !== undefined ? (
                                <span>{growthAbsolute > 0 ? "+" : ""}{growthAbsolute} this month</span>
                            ) : (
                                "from last month"
                            )}
                        </p>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                        {description || "Total count"}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
