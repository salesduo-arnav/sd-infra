import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Building2,
  TrendingUp,
  Activity,
  UserCheck,
  DollarSign,
  Eye,
  X,
  Filter,
} from "lucide-react";
import { AuditLog, getAuditLogs } from "@/services/admin.service";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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

// Action categories for grouped dropdown
const actionCategories = {
  "Auth": [
    "USER_REGISTER", "USER_LOGIN", "USER_LOGOUT", "USER_PASSWORD_RESET",
    "USER_GOOGLE_AUTH", "USER_LOGIN_OTP_VERIFIED", "USER_SIGNUP_OTP_VERIFIED"
  ],
  "User": ["UPDATE_USER", "DELETE_USER"],
  "Organization": [
    "CREATE_ORGANIZATION", "UPDATE_ORGANIZATION", "DELETE_ORGANIZATION",
    "REMOVE_MEMBER", "UPDATE_MEMBER_ROLE", "TRANSFER_OWNERSHIP"
  ],
  "Invitation": ["INVITE_MEMBER", "REVOKE_INVITATION", "ACCEPT_INVITATION", "DECLINE_INVITATION"],
  "Plan": ["CREATE_PLAN", "UPDATE_PLAN", "DELETE_PLAN", "UPSERT_PLAN_LIMIT", "DELETE_PLAN_LIMIT"],
  "Tool": ["CREATE_TOOL", "UPDATE_TOOL", "DELETE_TOOL"],
  "Feature": ["CREATE_FEATURE", "UPDATE_FEATURE", "DELETE_FEATURE"],
  "Bundle": [
    "CREATE_BUNDLE_GROUP", "UPDATE_BUNDLE_GROUP", "DELETE_BUNDLE_GROUP",
    "CREATE_BUNDLE", "UPDATE_BUNDLE", "DELETE_BUNDLE",
    "ADD_PLAN_TO_BUNDLE", "REMOVE_PLAN_FROM_BUNDLE"
  ],
};

const entityTypes = [
  "User", "Organization", "OrganizationMember", "Invitation",
  "Plan", "PlanLimit", "Tool", "Feature", "Bundle", "BundleGroup"
];

export default function AdminDashboard() {
  const [data, setData] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Filters
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [startDateTime, setStartDateTime] = useState<Date | undefined>();
  const [endDateTime, setEndDateTime] = useState<Date | undefined>();

  // Details Dialog
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const page = pagination.pageIndex + 1;
      const limit = pagination.pageSize;
      const sortField = sorting.length > 0 ? sorting[0].id : "created_at";
      const sortOrder = sorting.length > 0 && sorting[0].desc ? "desc" : "asc";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        page,
        limit,
        sort_by: sortField,
        sort_dir: sortOrder,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }

      if (actionFilter && actionFilter !== "all") {
        params.action = actionFilter;
      }

      if (entityTypeFilter && entityTypeFilter !== "all") {
        params.entity_type = entityTypeFilter;
      }

      if (startDateTime) {
        params.start_date = startDateTime.toISOString();
      }

      if (endDateTime) {
        params.end_date = endDateTime;
      }

      const result = await getAuditLogs(params);
      setData(result.audit_logs);
      setPageCount(result.meta.totalPages);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, debouncedSearch, actionFilter, entityTypeFilter, startDateTime, endDateTime]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [debouncedSearch, actionFilter, entityTypeFilter, startDateTime, endDateTime]);

  // Count active filters
  const activeFilterCount = [
    actionFilter !== "all",
    entityTypeFilter !== "all",
    !!startDateTime,
    !!endDateTime,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setActionFilter("all");
    setEntityTypeFilter("all");
    setStartDateTime(undefined);
    setEndDateTime(undefined);
    setSearchQuery("");
  };

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date/Time" />,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {format(new Date(row.original.created_at), "MMM d, yyyy")}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(row.original.created_at), "h:mm:ss a")}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "actor",
      header: () => <DataTableStaticHeader title="Actor" />,
      cell: ({ row }) => {
        const actor = row.original.actor;
        return actor ? (
          <div className="flex flex-col">
            <span className="font-medium text-sm">{actor.full_name}</span>
            <span className="text-xs text-muted-foreground">{actor.email}</span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">System</span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "action",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono text-xs whitespace-nowrap">
          {row.original.action}
        </Badge>
      ),
    },
    {
      accessorKey: "entity_type",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entity Type" />,
      cell: ({ row }) => (
        <span className="font-medium text-xs uppercase text-muted-foreground">
          {row.original.entity_type}
        </span>
      ),
    },
    {
      accessorKey: "entity_id",
      header: () => <DataTableStaticHeader title="Entity ID" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block" title={row.original.entity_id}>
          {row.original.entity_id.length > 12
            ? `${row.original.entity_id.substring(0, 12)}...`
            : row.original.entity_id}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "ip_address",
      header: () => <DataTableStaticHeader title="IP" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.ip_address || "—"}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <DataTableStaticHeader title="Details" srOnly />,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedLog(row.original);
            setDetailsOpen(true);
          }}
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Platform overview and activity
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

        {/* Audit Logs Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity & Audit Logs
            </CardTitle>
            <CardDescription>View all platform events and user actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters Row */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              {/* Filter Header Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <span>Filters</span>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                  </Button>
                )}
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Action Filter */}
                <div className="w-full sm:w-auto">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Action</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] h-9 bg-background">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">All Actions</SelectItem>
                      {Object.entries(actionCategories).map(([category, actions]) => (
                        <div key={category}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                            {category}
                          </div>
                          {actions.map((action) => (
                            <SelectItem key={action} value={action}>
                              {action.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Entity Type Filter */}
                <div className="w-full sm:w-auto">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Entity Type</Label>
                  <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[160px] h-9 bg-background">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {entityTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Separator */}
                <div className="hidden sm:block w-px h-9 bg-border" />

                {/* DateTime Pickers */}
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">From</Label>
                    <DateTimePicker
                      value={startDateTime}
                      onChange={setStartDateTime}
                      placeholder="Start date & time"
                    />
                  </div>
                  <span className="hidden sm:inline text-muted-foreground text-sm pb-2">→</span>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">To</Label>
                    <DateTimePicker
                      value={endDateTime}
                      onChange={setEndDateTime}
                      placeholder="End date & time"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-lg border bg-card overflow-hidden">
              <DataTable
                columns={columns}
                data={data}
                pageCount={pageCount}
                pagination={pagination}
                onPaginationChange={setPagination}
                sorting={sorting}
                onSortingChange={setSorting}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search by action, actor, entity..."
                isLoading={loading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit Log Details</DialogTitle>
              <DialogDescription>
                Event ID: <span className="font-mono text-xs">{selectedLog?.id}</span>
              </DialogDescription>
            </DialogHeader>

            {selectedLog && (
              <div className="space-y-6 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-1">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actor</span>
                    <div className="p-3 bg-muted/50 rounded-md border border-border/50">
                      <p className="font-medium">{selectedLog.actor?.full_name || "System"}</p>
                      <p className="text-muted-foreground text-xs">{selectedLog.actor?.email}</p>
                      <p className="text-muted-foreground text-xs font-mono mt-1">{selectedLog.actor_id}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Event Info</span>
                    <div className="p-3 bg-muted/50 rounded-md border border-border/50 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Action</span>
                        <Badge variant="outline">{selectedLog.action}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span>{format(new Date(selectedLog.created_at), "PPpp")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IP Address</span>
                        <span className="font-mono">{selectedLog.ip_address || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Target Entity</span>
                    <div className="p-3 bg-muted/50 rounded-md border border-border/50 flex items-center justify-between">
                      <div>
                        <span className="font-medium">{selectedLog.entity_type}</span>
                      </div>
                      <span className="font-mono text-xs bg-background px-2 py-1 rounded border">{selectedLog.entity_id}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Change Payload</span>
                  <div className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto border border-border shadow-inner">
                    <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
