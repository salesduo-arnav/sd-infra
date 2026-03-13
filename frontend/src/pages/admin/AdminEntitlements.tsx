import { useState, useEffect, useCallback } from "react";
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Filter,
    X,
    Pencil,
    Gauge,
    AlertTriangle,
    Plus,
} from "lucide-react";
import {
    OrganizationEntitlement,
    getEntitlements,
    updateEntitlement,
    createEntitlements,
    getTools,
    Tool,
} from "@/services/admin.service";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

interface OrgOption {
    id: string;
    name: string;
    slug: string;
}

interface FeatureOption {
    id: string;
    name: string;
    slug: string;
    tool_id: string;
}

export default function AdminEntitlements() {
    const { toast } = useToast();

    // Data state
    const [data, setData] = useState<OrganizationEntitlement[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageCount, setPageCount] = useState(1);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });
    const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);

    // Search
    const [searchQuery, setSearchQuery] = useState("");

    // Filters
    const [orgFilter, setOrgFilter] = useState<string>("all");
    const [toolFilter, setToolFilter] = useState<string>("all");
    const [featureFilter, setFeatureFilter] = useState<string>("all");

    // Filter options
    const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
    const [toolOptions, setToolOptions] = useState<Tool[]>([]);
    const [featureOptions, setFeatureOptions] = useState<FeatureOption[]>([]);

    // Edit Dialog
    const [editOpen, setEditOpen] = useState(false);
    const [editingEntitlement, setEditingEntitlement] = useState<OrganizationEntitlement | null>(null);
    const [editLimitAmount, setEditLimitAmount] = useState<string>("");
    const [editUsageAmount, setEditUsageAmount] = useState<string>("");
    const [editResetPeriod, setEditResetPeriod] = useState<string>("never");
    const [saving, setSaving] = useState(false);

    // Create Dialog
    const [createOpen, setCreateOpen] = useState(false);
    const [createOrgId, setCreateOrgId] = useState<string>("");
    const [createToolId, setCreateToolId] = useState<string>("");
    const [createSelectedFeatures, setCreateSelectedFeatures] = useState<string[]>([]);
    const [createLimitAmount, setCreateLimitAmount] = useState<string>("");
    const [createResetPeriod, setCreateResetPeriod] = useState<string>("never");
    const [creating, setCreating] = useState(false);

    // Load filter options
    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [orgsRes, toolsRes, featuresRes] = await Promise.all([
                    api.get("/admin/organizations", { params: { limit: 100 } }),
                    getTools({ limit: 100 }),
                    api.get("/admin/features", { params: { limit: 100 } }),
                ]);
                setOrgOptions(orgsRes.data.organizations || []);
                setToolOptions(toolsRes.tools || []);
                setFeatureOptions(featuresRes.data.features || []);
            } catch (error) {
                console.error("Failed to load filter options:", error);
            }
        };
        loadOptions();
    }, []);

    // Reset page when search or filters change
    useEffect(() => {
        setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, [searchQuery, orgFilter, toolFilter, featureFilter]);

    // Fetch entitlements
    const fetchEntitlements = useCallback(async () => {
        setLoading(true);
        try {
            const page = pagination.pageIndex + 1;
            const limit = pagination.pageSize;
            const sortField = sorting.length > 0 ? sorting[0].id : "updated_at";
            const sortOrder = sorting.length > 0 && sorting[0].desc ? "desc" : "asc";

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const params: any = {
                page,
                limit,
                sort_by: sortField,
                sort_dir: sortOrder,
            };

            if (searchQuery.trim()) {
                params.search = searchQuery.trim();
            }
            if (orgFilter && orgFilter !== "all") {
                params.organization_id = orgFilter;
            }
            if (toolFilter && toolFilter !== "all") {
                params.tool_id = toolFilter;
            }
            if (featureFilter && featureFilter !== "all") {
                params.feature_id = featureFilter;
            }

            const result = await getEntitlements(params);
            setData(result.entitlements);
            setPageCount(result.meta.totalPages);
        } catch (error) {
            console.error("Error fetching entitlements:", error);
            toast({
                title: "Error",
                description: "Failed to load entitlements",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [pagination, sorting, searchQuery, orgFilter, toolFilter, featureFilter, toast]);

    useEffect(() => {
        fetchEntitlements();
    }, [fetchEntitlements]);

    // Count active filters
    const activeFilterCount = [
        orgFilter !== "all",
        toolFilter !== "all",
        featureFilter !== "all",
    ].filter(Boolean).length;

    const clearAllFilters = () => {
        setOrgFilter("all");
        setToolFilter("all");
        setFeatureFilter("all");
        setSearchQuery("");
    };

    // Open edit dialog
    const openEditDialog = (entitlement: OrganizationEntitlement) => {
        setEditingEntitlement(entitlement);
        setEditLimitAmount(entitlement.limit_amount !== null ? String(entitlement.limit_amount) : "");
        setEditUsageAmount(String(entitlement.usage_amount));
        setEditResetPeriod(entitlement.reset_period || "never");
        setEditOpen(true);
    };

    // Save entitlement
    const handleSaveEntitlement = async () => {
        if (!editingEntitlement) return;
        setSaving(true);
        try {
            const updateData: { limit_amount?: number | null; usage_amount?: number; reset_period?: string } = {};

            if (editLimitAmount === "" || editLimitAmount === "unlimited") {
                updateData.limit_amount = null;
            } else {
                const parsed = parseInt(editLimitAmount);
                if (!isNaN(parsed) && parsed >= 0) {
                    updateData.limit_amount = parsed;
                }
            }

            const parsedUsage = parseInt(editUsageAmount);
            if (!isNaN(parsedUsage) && parsedUsage >= 0) {
                updateData.usage_amount = parsedUsage;
            }

            updateData.reset_period = editResetPeriod;

            await updateEntitlement(editingEntitlement.id, updateData);

            toast({
                title: "Entitlement Updated",
                description: `Successfully updated entitlement for ${editingEntitlement.organization?.name}`,
            });

            setEditOpen(false);
            fetchEntitlements();
        } catch (error) {
            console.error("Failed to update entitlement:", error);
            toast({
                title: "Update Failed",
                description: "Failed to update entitlement. Please try again.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    // Create entitlements
    const availableFeaturesForTool = featureOptions.filter(f => f.tool_id === createToolId);

    const handleSelectAllFeatures = () => {
        if (createSelectedFeatures.length === availableFeaturesForTool.length && availableFeaturesForTool.length > 0) {
            setCreateSelectedFeatures([]);
        } else {
            setCreateSelectedFeatures(availableFeaturesForTool.map(f => f.id));
        }
    };

    const handleFeatureToggle = (featureId: string) => {
        setCreateSelectedFeatures(prev => 
            prev.includes(featureId) ? prev.filter(id => id !== featureId) : [...prev, featureId]
        );
    };

    const handleCreateEntitlement = async () => {
        if (!createOrgId || !createToolId || createSelectedFeatures.length === 0) {
            toast({
                title: "Missing fields",
                description: "Please select an organization, a tool, and at least one feature.",
                variant: "destructive"
            });
            return;
        }
        setCreating(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: any = {
                organization_id: createOrgId,
                tool_id: createToolId,
                feature_ids: createSelectedFeatures,
                reset_period: createResetPeriod
            };
            
            if (createLimitAmount === "" || createLimitAmount === "unlimited") {
                 payload.limit_amount = null;
            } else {
                 const parsed = parseInt(createLimitAmount);
                 if (!isNaN(parsed) && parsed >= 0) {
                     payload.limit_amount = parsed;
                 }
            }
            
            const res = await createEntitlements(payload);
            toast({
                title: "Entitlements Created",
                description: `Successfully created ${res.count} entitlements.`,
            });
            setCreateOpen(false);
            
            // Reset form
            setCreateOrgId("");
            setCreateToolId("");
            setCreateSelectedFeatures([]);
            setCreateLimitAmount("");
            setCreateResetPeriod("never");
            
            fetchEntitlements();
        } catch (error) {
             console.error("Failed to create entitlement:", error);
             toast({
                 title: "Creation Failed",
                 description: "Failed to create entitlements. Please try again.",
                 variant: "destructive",
             });
        } finally {
             setCreating(false);
        }
    };

    // Helper: get usage percentage
    const getUsagePercent = (usage: number, limit: number | null) => {
        if (limit === null || limit === 0) return null;
        return Math.min(Math.round((usage / limit) * 100), 100);
    };

    // Helper: get usage status color
    const getUsageStatus = (percent: number | null) => {
        if (percent === null) return "default";
        if (percent >= 90) return "destructive";
        if (percent >= 70) return "warning";
        return "default";
    };

    const columns: ColumnDef<OrganizationEntitlement>[] = [
        {
            accessorKey: "organization",
            header: () => <DataTableStaticHeader title="Organization" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{row.original.organization?.name || "—"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.original.organization?.slug || ""}</span>
                </div>
            ),
            enableSorting: false,
        },
        {
            accessorKey: "tool",
            header: () => <DataTableStaticHeader title="Tool" />,
            cell: ({ row }) => (
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                    {row.original.tool?.name || "—"}
                </Badge>
            ),
            enableSorting: false,
        },
        {
            accessorKey: "feature",
            header: () => <DataTableStaticHeader title="Feature" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">{row.original.feature?.name || "—"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{row.original.feature?.slug || ""}</span>
                </div>
            ),
            enableSorting: false,
        },
        {
            accessorKey: "limit_amount",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Limit" />,
            cell: ({ row }) => (
                <span className="text-sm font-semibold tabular-nums">
                    {row.original.limit_amount !== null ? row.original.limit_amount.toLocaleString() : (
                        <span className="text-muted-foreground italic font-normal">Unlimited</span>
                    )}
                </span>
            ),
        },
        {
            accessorKey: "usage_amount",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Usage" />,
            cell: ({ row }) => {
                const usage = row.original.usage_amount;
                const limit = row.original.limit_amount;
                const percent = getUsagePercent(usage, limit);
                const status = getUsageStatus(percent);

                return (
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold tabular-nums">{usage.toLocaleString()}</span>
                            {limit !== null && (
                                <span className="text-xs text-muted-foreground">/ {limit.toLocaleString()}</span>
                            )}
                            {percent !== null && percent >= 90 && (
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            )}
                        </div>
                        {percent !== null && (
                            <Progress
                                value={percent}
                                className={`h-1.5 ${status === "destructive" ? "[&>div]:bg-destructive" : status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
                            />
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: "reset_period",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Reset Period" />,
            cell: ({ row }) => {
                const period = row.original.reset_period;
                if (!period || period === "never") {
                    return <span className="text-xs text-muted-foreground">Never</span>;
                }
                return (
                    <Badge variant="secondary" className="text-xs capitalize">
                        {period}
                    </Badge>
                );
            },
        },
        {
            accessorKey: "last_reset_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Last Reset" />,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">
                    {row.original.last_reset_at
                        ? format(new Date(row.original.last_reset_at), "MMM d, yyyy")
                        : "—"}
                </span>
            ),
        },
        {
            accessorKey: "updated_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                        {format(new Date(row.original.updated_at), "MMM d, yyyy")}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                        {format(new Date(row.original.updated_at), "h:mm a")}
                    </span>
                </div>
            ),
        },
        {
            id: "actions",
            header: () => <DataTableStaticHeader title="Actions" srOnly />,
            cell: ({ row }) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(row.original)}
                    className="h-8 w-8 p-0"
                >
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
            ),
        },
    ];

    return (
        <>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 border border-primary/20">
                            <Gauge className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Manage Entitlements</h1>
                            <p className="text-muted-foreground mt-1">
                                View and manage feature entitlements across all organizations
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => setCreateOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create Entitlement
                    </Button>
                </div>

                {/* Filters Row */}
                <div className="p-4 bg-muted/30 rounded-lg border space-y-3 shadow-sm hover:shadow-md transition-shadow duration-200">
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
                        {/* Organization Filter */}
                        <div className="w-full sm:w-auto">
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Organization</Label>
                            <Select value={orgFilter} onValueChange={setOrgFilter}>
                                <SelectTrigger className="w-full sm:w-[200px] h-9 bg-background">
                                    <SelectValue placeholder="All Organizations" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <SelectItem value="all">All Organizations</SelectItem>
                                    {orgOptions.map((org) => (
                                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Tool Filter */}
                        <div className="w-full sm:w-auto">
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Tool</Label>
                            <Select value={toolFilter} onValueChange={setToolFilter}>
                                <SelectTrigger className="w-full sm:w-[180px] h-9 bg-background">
                                    <SelectValue placeholder="All Tools" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Tools</SelectItem>
                                    {toolOptions.map((tool) => (
                                        <SelectItem key={tool.id} value={tool.id}>{tool.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Feature Filter */}
                        <div className="w-full sm:w-auto">
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Feature</Label>
                            <Select value={featureFilter} onValueChange={setFeatureFilter}>
                                <SelectTrigger className="w-full sm:w-[200px] h-9 bg-background">
                                    <SelectValue placeholder="All Features" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    <SelectItem value="all">All Features</SelectItem>
                                    {featureOptions.map((feature) => (
                                        <SelectItem key={feature.id} value={feature.id}>
                                            {feature.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <div className="rounded-lg border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
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
                        placeholder="Search by organization, tool, or feature..."
                        isLoading={loading}
                    />
                </div>

                {/* Edit Dialog */}
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Edit Entitlement</DialogTitle>
                            <DialogDescription>
                                Update the entitlement limits and usage for this organization's feature.
                            </DialogDescription>
                        </DialogHeader>

                        {editingEntitlement && (
                            <div className="space-y-6 pt-2">
                                {/* Context Info */}
                                <div className="grid grid-cols-1 gap-3 p-4 bg-muted/50 rounded-lg border border-border/50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization</span>
                                        <span className="text-sm font-medium">{editingEntitlement.organization?.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tool</span>
                                        <Badge variant="outline" className="text-xs">{editingEntitlement.tool?.name}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature</span>
                                        <span className="text-sm font-medium">{editingEntitlement.feature?.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Feature Slug</span>
                                        <span className="text-xs font-mono text-muted-foreground">{editingEntitlement.feature?.slug}</span>
                                    </div>
                                </div>

                                {/* Editable Fields */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="limit_amount" className="text-sm font-medium">
                                            Limit Amount
                                        </Label>
                                        <Input
                                            id="limit_amount"
                                            type="number"
                                            min="0"
                                            value={editLimitAmount}
                                            onChange={(e) => setEditLimitAmount(e.target.value)}
                                            placeholder="Leave empty for unlimited"
                                            className="h-9"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Maximum allowed. Leave empty for unlimited access.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="usage_amount" className="text-sm font-medium">
                                            Current Usage
                                        </Label>
                                        <Input
                                            id="usage_amount"
                                            type="number"
                                            min="0"
                                            value={editUsageAmount}
                                            onChange={(e) => setEditUsageAmount(e.target.value)}
                                            placeholder="0"
                                            className="h-9"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Current usage count. Set to 0 to reset usage.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="reset_period" className="text-sm font-medium">
                                            Reset Period
                                        </Label>
                                        <Select value={editResetPeriod} onValueChange={setEditResetPeriod}>
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Select reset period" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="never">Never</SelectItem>
                                                <SelectItem value="monthly">Monthly</SelectItem>
                                                <SelectItem value="yearly">Yearly</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            How often the usage count resets automatically.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="gap-2 pt-4">
                            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSaveEntitlement} disabled={saving}>
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Create Dialog */}
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Create Entitlements</DialogTitle>
                            <DialogDescription>
                                Manually grant feature entitlements to an organization.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Organization</Label>
                                <Select value={createOrgId} onValueChange={setCreateOrgId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Organization" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {orgOptions.map((org) => (
                                            <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Tool</Label>
                                <Select value={createToolId} onValueChange={(val) => {
                                    setCreateToolId(val);
                                    setCreateSelectedFeatures([]); // Reset features when tool changes
                                }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Tool" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {toolOptions.map((tool) => (
                                            <SelectItem key={tool.id} value={tool.id}>{tool.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {createToolId && (
                                <div className="space-y-3 p-4 bg-muted/40 rounded-lg border border-border">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">Features</Label>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={handleSelectAllFeatures}
                                            className="h-7 text-xs"
                                        >
                                            {createSelectedFeatures.length === availableFeaturesForTool.length && availableFeaturesForTool.length > 0
                                                ? "Deselect All"
                                                : "Select All"}
                                        </Button>
                                    </div>
                                    <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2">
                                        {availableFeaturesForTool.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No features found for this tool.</p>
                                        ) : (
                                            availableFeaturesForTool.map(feature => (
                                                <div key={feature.id} className="flex items-center space-x-2">
                                                    <Checkbox 
                                                        id={`feature-${feature.id}`}
                                                        checked={createSelectedFeatures.includes(feature.id)}
                                                        onCheckedChange={() => handleFeatureToggle(feature.id)}
                                                    />
                                                    <Label 
                                                        htmlFor={`feature-${feature.id}`} 
                                                        className="text-sm font-normal cursor-pointer flex-1"
                                                    >
                                                        {feature.name}
                                                    </Label>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Limit Amount</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={createLimitAmount}
                                        onChange={(e) => setCreateLimitAmount(e.target.value)}
                                        placeholder="Leave empty for unlimited"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Reset Period</Label>
                                    <Select value={createResetPeriod} onValueChange={setCreateResetPeriod}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Reset period" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="never">Never</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="yearly">Yearly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 pt-4">
                            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateEntitlement} disabled={creating || !createOrgId || !createToolId || createSelectedFeatures.length === 0}>
                                {creating ? "Creating..." : "Create"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
