import {
  Users,
  Building2,
  DollarSign,
  Activity,
  Zap
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOverviewStats, getRevenueChart, getUserGrowthChart, getToolUsageChart } from "@/services/admin.service";
import { StatsCard } from "@/components/admin/overview/StatsCard";
import { OverviewChart } from "@/components/admin/overview/OverviewChart";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'stats', 'overview'],
    queryFn: getOverviewStats
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['admin', 'stats', 'revenue'],
    queryFn: getRevenueChart
  });

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['admin', 'stats', 'users'],
    queryFn: getUserGrowthChart
  });

  const { data: toolData, isLoading: toolLoading } = useQuery({
    queryKey: ['admin', 'stats', 'tools'],
    queryFn: getToolUsageChart
  });

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Platform overview and activity
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : (
            <>
              <StatsCard
                title="Total Users"
                value={stats?.totalUsers?.toLocaleString() || 0}
                icon={Users}
                growth={stats?.userGrowth}
                growthAbsolute={stats?.userGrowthAbsolute}
              />
              <StatsCard
                title="Active Organizations"
                value={stats?.totalOrgs?.toLocaleString() || 0}
                icon={Building2}
                growth={stats?.orgGrowth}
                growthAbsolute={stats?.orgGrowthAbsolute}
              />
              <StatsCard
                title="Active Subscriptions"
                value={stats?.activeSubs?.toLocaleString() || 0}
                icon={Activity}
                growth={stats?.activeSubsGrowth}
                growthAbsolute={stats?.activeSubsGrowthAbsolute}
              />
              <StatsCard
                title="Monthly Recurring Revenue"
                value={`$${(stats?.mrr || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                description={undefined} // Remove old description to use growth
                growth={stats?.mrrGrowth}
                growthAbsolute={stats?.mrrGrowthAbsolute}
                icon={DollarSign}
              />
            </>
          )}
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4">
            {userLoading ? <Skeleton className="h-[350px] w-full" /> : (
              <OverviewChart
                title="User Growth"
                description="Active user registrations over time"
                data={userData || []}
                dataKey="count"
                xAxisKey="month"
                color="#2563eb"
              />
            )}
          </div>
          <div className="col-span-3">
            {toolLoading ? <Skeleton className="h-[350px] w-full" /> : (
              <OverviewChart
                title="Top Tool Usage"
                description="Most popular AI tools by usage count"
                data={toolData || []}
                dataKey="total_usage"
                xAxisKey="tool.name"
                type="bar"
                color="#16a34a"
              />
            )}
          </div>
        </div>

        {/* Revenue Chart - maybe simpler full width or another row */}
        <div className="grid gap-4 md:grid-cols-1">
          {revenueLoading ? <Skeleton className="h-[350px] w-full" /> : (
            <OverviewChart
              title="Revenue Trend (One-Time)"
              description="Monthly revenue from one-time purchases"
              data={revenueData || []}
              dataKey="revenue"
              xAxisKey="month"
              color="#d97706"
            />
          )}
        </div>
      </div>
    </>
  );
}

