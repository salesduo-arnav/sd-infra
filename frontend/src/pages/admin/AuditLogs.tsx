import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Eye, Calendar as CalendarIcon } from "lucide-react";
import { AuditLog, getAuditLogs } from "@/services/admin.service";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

export default function AuditLogs() {
    const [data, setData] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageCount, setPageCount] = useState(1);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });
    const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);

    // Filters
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [actorSearch, setActorSearch] = useState("");

    // Details Dialog
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

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

            if (actionFilter && actionFilter !== "all") {
                params.action = actionFilter;
            }

            if (dateRange?.from) {
                params.start_date = dateRange.from.toISOString();
            }

            if (dateRange?.to) {
                params.end_date = dateRange.to.toISOString();
            }

            const result = await getAuditLogs(params);
            setData(result.audit_logs);
            setPageCount(result.meta.totalPages);
        } catch (error) {
            console.error("Error fetching audit logs:", error);
        } finally {
            setLoading(false);
        }
    }, [pagination, sorting, actionFilter, dateRange]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Reset page when filters change
    useEffect(() => {
        setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, [actionFilter, dateRange]);


    const columns: ColumnDef<AuditLog>[] = [
        {
            accessorKey: "created_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
            cell: ({ row }) => (
                <span className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.original.created_at), "MMM d, yyyy HH:mm:ss")}
                </span>
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
                    <span className="text-muted-foreground italic">System / Unknown</span>
                );
            },
            enableSorting: false,
        },
        {
            accessorKey: "action",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
            cell: ({ row }) => (
                <Badge variant="outline" className="font-mono text-xs">
                    {row.original.action}
                </Badge>
            ),
        },
        {
            accessorKey: "entity_type",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Entity" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium text-xs uppercase text-muted-foreground">{row.original.entity_type}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[100px]" title={row.original.entity_id}>
                        {row.original.entity_id.substring(0, 8)}...
                    </span>
                </div>
            ),
        },
        {
            accessorKey: "ip_address",
            header: () => <DataTableStaticHeader title="IP Address" />,
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
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
                        <p className="text-muted-foreground mt-1">
                            View system events and user actions
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
                    <div className="w-full sm:w-auto">
                        <Select value={actionFilter} onValueChange={setActionFilter}>
                            <SelectTrigger className="w-full sm:w-[220px]">
                                <SelectValue placeholder="Filter by Action" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                                <SelectItem value="all">All Actions</SelectItem>
                                {/* Auth Actions */}
                                <SelectItem value="USER_REGISTER">User Register</SelectItem>
                                <SelectItem value="USER_LOGIN">User Login</SelectItem>
                                <SelectItem value="USER_LOGOUT">User Logout</SelectItem>
                                <SelectItem value="USER_PASSWORD_RESET">Password Reset</SelectItem>
                                <SelectItem value="USER_GOOGLE_AUTH">Google Auth</SelectItem>
                                <SelectItem value="USER_LOGIN_OTP_VERIFIED">Login OTP Verified</SelectItem>
                                <SelectItem value="USER_SIGNUP_OTP_VERIFIED">Signup OTP Verified</SelectItem>
                                {/* User Actions */}
                                <SelectItem value="UPDATE_USER">Update User</SelectItem>
                                <SelectItem value="DELETE_USER">Delete User</SelectItem>
                                {/* Organization Actions */}
                                <SelectItem value="CREATE_ORGANIZATION">Create Organization</SelectItem>
                                <SelectItem value="UPDATE_ORGANIZATION">Update Organization</SelectItem>
                                <SelectItem value="DELETE_ORGANIZATION">Delete Organization</SelectItem>
                                <SelectItem value="REMOVE_MEMBER">Remove Member</SelectItem>
                                <SelectItem value="UPDATE_MEMBER_ROLE">Update Member Role</SelectItem>
                                <SelectItem value="TRANSFER_OWNERSHIP">Transfer Ownership</SelectItem>
                                {/* Invitation Actions */}
                                <SelectItem value="INVITE_MEMBER">Invite Member</SelectItem>
                                <SelectItem value="REVOKE_INVITATION">Revoke Invitation</SelectItem>
                                <SelectItem value="ACCEPT_INVITATION">Accept Invitation</SelectItem>
                                <SelectItem value="DECLINE_INVITATION">Decline Invitation</SelectItem>
                                {/* Plan Actions */}
                                <SelectItem value="CREATE_PLAN">Create Plan</SelectItem>
                                <SelectItem value="UPDATE_PLAN">Update Plan</SelectItem>
                                <SelectItem value="DELETE_PLAN">Delete Plan</SelectItem>
                                <SelectItem value="UPSERT_PLAN_LIMIT">Upsert Plan Limit</SelectItem>
                                <SelectItem value="DELETE_PLAN_LIMIT">Delete Plan Limit</SelectItem>
                                {/* Tool Actions */}
                                <SelectItem value="CREATE_TOOL">Create Tool</SelectItem>
                                <SelectItem value="UPDATE_TOOL">Update Tool</SelectItem>
                                <SelectItem value="DELETE_TOOL">Delete Tool</SelectItem>
                                {/* Feature Actions */}
                                <SelectItem value="CREATE_FEATURE">Create Feature</SelectItem>
                                <SelectItem value="UPDATE_FEATURE">Update Feature</SelectItem>
                                <SelectItem value="DELETE_FEATURE">Delete Feature</SelectItem>
                                {/* Bundle Actions */}
                                <SelectItem value="CREATE_BUNDLE_GROUP">Create Bundle Group</SelectItem>
                                <SelectItem value="UPDATE_BUNDLE_GROUP">Update Bundle Group</SelectItem>
                                <SelectItem value="DELETE_BUNDLE_GROUP">Delete Bundle Group</SelectItem>
                                <SelectItem value="CREATE_BUNDLE">Create Bundle</SelectItem>
                                <SelectItem value="UPDATE_BUNDLE">Update Bundle</SelectItem>
                                <SelectItem value="DELETE_BUNDLE">Delete Bundle</SelectItem>
                                <SelectItem value="ADD_PLAN_TO_BUNDLE">Add Plan to Bundle</SelectItem>
                                <SelectItem value="REMOVE_PLAN_FROM_BUNDLE">Remove Plan from Bundle</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-full sm:w-auto">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full sm:w-[240px] justify-start text-left font-normal",
                                        !dateRange && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Button
                        variant="ghost"
                        onClick={() => {
                            setActionFilter("all");
                            setDateRange(undefined);
                        }}
                        disabled={actionFilter === "all" && !dateRange}
                    >
                        Reset Filters
                    </Button>
                </div>

                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <DataTable
                        columns={columns}
                        data={data}
                        pageCount={pageCount}
                        pagination={pagination}
                        onPaginationChange={setPagination}
                        sorting={sorting}
                        onSortingChange={setSorting}
                        searchQuery={actorSearch}
                        onSearchChange={setActorSearch}
                        placeholder="Search by Actor..." // Optional: generic placeholder
                        isLoading={loading}
                    />
                </div>

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
