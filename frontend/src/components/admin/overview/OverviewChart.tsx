
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartProps {
    data: Record<string, unknown>[];
    title: string;
    description?: string;
    dataKey: string;
    xAxisKey: string;
    type?: 'line' | 'bar';
    color?: string;
    className?: string;
}

export function OverviewChart({ data, title, description, dataKey, xAxisKey, type = 'line', color = "#8884d8", className }: ChartProps) {
    return (
        <Card className={cn(
            "col-span-4 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200",
            "bg-white dark:bg-slate-950/50",
            className
        )}>
            <CardHeader>
                <CardTitle className="text-base font-medium">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="pl-2">
                <ResponsiveContainer width="100%" height={350}>
                    {type === 'line' ? (
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" opacity={0.2} />
                            <XAxis dataKey={xAxisKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 6, style: { fill: color, opacity: 0.8 } }} />
                        </LineChart>
                    ) : (
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" opacity={0.2} />
                            <XAxis dataKey={xAxisKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </CardContent>
        </Card >
    );
}
