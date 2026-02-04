import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Building2,
  TrendingUp,
  Activity,
  UserCheck,
  DollarSign,
} from "lucide-react";

const stats = [
  {
    title: "Total Users",
    value: "2,847",
    change: "+12.5%",
    changeType: "positive" as const,
    icon: Users,
  },
  {
    title: "Active Users",
    value: "1,234",
    change: "+8.2%",
    changeType: "positive" as const,
    icon: UserCheck,
  },
  {
    title: "Organizations",
    value: "456",
    change: "+5.1%",
    changeType: "positive" as const,
    icon: Building2,
  },
  {
    title: "Monthly Revenue",
    value: "$48,250",
    change: "+18.7%",
    changeType: "positive" as const,
    icon: DollarSign,
  },
];



const recentActivity = [
  { action: "New user registered", user: "john@example.com", time: "2 minutes ago" },
  { action: "Plan upgraded", user: "jane@company.com", time: "15 minutes ago" },
  { action: "New organization created", user: "mike@startup.io", time: "1 hour ago" },
  { action: "Integration connected", user: "sarah@sellers.com", time: "2 hours ago" },
  { action: "Support ticket opened", user: "tom@amazon-seller.com", time: "3 hours ago" },
];

export default function AdminDashboard() {
  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Platform overview and management
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-green-500">{stat.change}</span>
                  from last month
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest platform events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.user}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
