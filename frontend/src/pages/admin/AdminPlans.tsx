import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Pencil, Trash2, CreditCard, Settings, Package, Link as LinkIcon, X, Eye, Layers } from "lucide-react";
import * as AdminService from "@/services/admin.service";
import { Plan, Tool, PlanLimit, Bundle, BundleGroup, Feature } from "@/services/admin.service";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { toast } from "sonner";

export default function AdminPlans() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isLoadingBundles, setIsLoadingBundles] = useState(false);

  // Plans State
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansPagination, setPlansPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [plansSorting, setPlansSorting] = useState<SortingState>([]);
  const [plansRowCount, setPlansRowCount] = useState(0);
  const [plansSearch, setPlansSearch] = useState("");

  // Bundles State
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleGroups, setBundleGroups] = useState<BundleGroup[]>([]);
  const [isLoadingBundleGroups, setIsLoadingBundleGroups] = useState(false);
  const [bundlesPagination, setBundlesPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [bundlesSorting, setBundlesSorting] = useState<SortingState>([]);
  const [bundlesRowCount, setBundlesRowCount] = useState(0);
  const [bundlesSearch, setBundlesSearch] = useState("");

  // View State
  const [viewingPlan, setViewingPlan] = useState<Plan | null>(null);
  const [isPlanSheetOpen, setIsPlanSheetOpen] = useState(false);

  const [viewingBundle, setViewingBundle] = useState<Bundle | null>(null);
  const [isBundleSheetOpen, setIsBundleSheetOpen] = useState(false);

  // Dialogs
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isBundleDialogOpen, setIsBundleDialogOpen] = useState(false);
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
  const [isBundlePlansDialogOpen, setIsBundlePlansDialogOpen] = useState(false);

  // Forms
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planFormData, setPlanFormData] = useState({
    name: "",
    description: "",
    tool_id: "",
    tier: "basic" as Plan["tier"],
    price: 0,
    currency: "USD",
    interval: "monthly" as Plan["interval"],
    is_trial_plan: false,
    active: true,
  });

  // Bundle Groups
  const [isBundleGroupDialogOpen, setIsBundleGroupDialogOpen] = useState(false);
  const [editingBundleGroup, setEditingBundleGroup] = useState<BundleGroup | null>(null);
  const [bundleGroupFormData, setBundleGroupFormData] = useState({
      name: "",
      slug: "",
      description: "",
      active: true
  });

  const [viewingBundleGroupId, setViewingBundleGroupId] = useState<string | null>(null);
  const viewingBundleGroup = useMemo(() => bundleGroups.find(g => g.id === viewingBundleGroupId) || null, [bundleGroups, viewingBundleGroupId]);
  const [isBundleGroupSheetOpen, setIsBundleGroupSheetOpen] = useState(false);

  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [bundleFormData, setBundleFormData] = useState({
      name: "",
      slug: "",
      description: "",
      price: 0,
      currency: "USD",
      interval: "monthly" as Bundle["interval"],
      active: true,
      bundle_group_id: "" as string | undefined,
      tier_label: "" as string | undefined
  });

  // Limits & Associations
  const [selectedPlanForLimits, setSelectedPlanForLimits] = useState<Plan | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimit[]>([]);
  const [stagedLimits, setStagedLimits] = useState<Record<string, { limit: number | null, reset_period: string, enabled: boolean }>>({});
  const [isSavingLimits, setIsSavingLimits] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState<AdminService.Feature[]>([]);

  const [selectedBundleForPlans, setSelectedBundleForPlans] = useState<Bundle | null>(null);
  const [bundlePlans, setBundlePlans] = useState<Plan[]>([]); // Original plans in bundle (for reference/comparison)
  const [stagedBundlePlans, setStagedBundlePlans] = useState<Plan[]>([]); // Plans currently in modal (staged)
  const [isSavingBundlePlans, setIsSavingBundlePlans] = useState(false);
  const [allActivePlans, setAllActivePlans] = useState<Plan[]>([]); // For selection

  // --- Fetchers ---

  const fetchPlans = useCallback(async () => {
    setIsLoadingPlans(true);
    try {
      const data = await AdminService.getPlans(undefined, { 
          page: plansPagination.pageIndex + 1, 
          limit: plansPagination.pageSize, 
          search: plansSearch,
          sort_by: plansSorting.length ? plansSorting[0].id : undefined,
          sort_dir: plansSorting.length ? (plansSorting[0].desc ? 'desc' : 'asc') : undefined
        });
      if (data && data.plans) {
          setPlans(data.plans);
          setPlansRowCount(data.meta.totalItems);
      }
    } catch (error) {
      console.error("Failed to fetch plans", error);
    } finally {
        setIsLoadingPlans(false);
    }
  }, [plansPagination.pageIndex, plansPagination.pageSize, plansSorting, plansSearch]);

  const fetchBundleGroups = useCallback(async () => {
    setIsLoadingBundleGroups(true);
    try {
        const groups = await AdminService.getBundleGroups();
        setBundleGroups(groups);
    } catch (error) {
        console.error("Failed to fetch bundle groups", error);
    } finally {
        setIsLoadingBundleGroups(false);
    }
  }, []);

  const fetchBundles = useCallback(async () => {
      setIsLoadingBundles(true);
      try {
          const data = await AdminService.getBundles({ 
              page: bundlesPagination.pageIndex + 1, 
              limit: bundlesPagination.pageSize, 
              search: bundlesSearch,
              sort_by: bundlesSorting.length ? bundlesSorting[0].id : undefined,
              sort_dir: bundlesSorting.length ? (bundlesSorting[0].desc ? 'desc' : 'asc') : undefined
            });
          if (data && data.bundles) {
              setBundles(data.bundles);
              setBundlesRowCount(data.meta.totalItems);
          }
      } catch (error) {
          console.error("Failed to fetch bundles", error);
      } finally {
          setIsLoadingBundles(false);
      }
  }, [bundlesPagination.pageIndex, bundlesPagination.pageSize, bundlesSorting, bundlesSearch]);

  const fetchTools = useCallback(async () => {
      try {
        const toolsData = await AdminService.getTools({ activeOnly: true, limit: 100 });
        setTools(toolsData.tools || []);
      } catch (error) {
          console.error("Failed to fetch tools", error);
      }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    fetchBundles();
    fetchBundleGroups();
  }, [fetchBundles, fetchBundleGroups]);

  
  // --- Plan Handlers ---

  const handleOpenPlanDialog = useCallback((plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanFormData({
        name: plan.name,
        description: plan.description || "",
        tool_id: plan.tool_id,
        tier: plan.tier,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        is_trial_plan: plan.is_trial_plan,
        active: plan.active,
      });
    } else {
      setEditingPlan(null);
      setPlanFormData({ 
          name: "", 
          description: "", 
          tool_id: "", 
          tier: "basic", 
          price: 9, 
          currency: "USD",
          interval: "monthly",
          is_trial_plan: false,
          active: true
        });
    }
    setIsPlanDialogOpen(true);
  }, []);

  const handlePlanSave = useCallback(async () => {
    try {
      if (!planFormData.name.trim()) {
          toast.error("Plan name is required");
          return;
      }

      if (planFormData.is_trial_plan && planFormData.interval === 'one_time') {
          toast.error("One-time plans cannot be set as trial plans. Please use a recurring interval.");
          return;
      }

      if (editingPlan) {
        await AdminService.updatePlan(editingPlan.id, planFormData);
      } else {
        await AdminService.createPlan(planFormData);
      }
      setIsPlanDialogOpen(false);
      fetchPlans();
      fetchBundleGroups(); // Update bundles if plan name changed
    } catch (error: unknown) {
      console.error("Failed to save plan", error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = (error as any).response?.data?.message || "Failed to save plan.";
      toast.error(message);
    }
  }, [editingPlan, planFormData, fetchPlans, fetchBundleGroups]);

  const handleViewPlanDetails = useCallback((plan: Plan) => {
      setViewingPlan(plan);
      setIsPlanSheetOpen(true);
  }, []);

  const handlePlanDelete = useCallback(async (id: string) => {
    try {
      await AdminService.deletePlan(id);
      fetchPlans();
      toast.success("Plan deleted successfully");
    } catch (error) {
      console.error("Failed to delete plan", error);
      toast.error("Failed to delete plan. It may have active subscribers.");
    }
  }, [fetchPlans]);

  // --- Bundle Group Handlers ---

  const handleOpenBundleGroupDialog = (group?: BundleGroup) => {
      if (group) {
          setEditingBundleGroup(group);
          setBundleGroupFormData({
              name: group.name,
              slug: group.slug,
              description: group.description,
              active: group.active
          });
      } else {
          setEditingBundleGroup(null);
          setBundleGroupFormData({
              name: "",
              slug: "",
              description: "",
              active: true
          });
      }
      setIsBundleGroupDialogOpen(true);
  };

  const handleBundleGroupSave = async () => {
      try {
          if (editingBundleGroup) {
              await AdminService.updateBundleGroup(editingBundleGroup.id, bundleGroupFormData);
          } else {
              await AdminService.createBundleGroup(bundleGroupFormData);
          }
          setIsBundleGroupDialogOpen(false);
          fetchBundleGroups();
      } catch (error) {
          console.error("Failed to save bundle group", error);
          toast.error("Failed to save bundle group");
      }
  };

  const handleDeleteBundleGroup = async (id: string) => {
      try {
          await AdminService.deleteBundleGroup(id);
          fetchBundleGroups();
          toast.success("Bundle group deleted");
      } catch (error) {
          console.error("Failed to delete bundle group", error);
          toast.error("Failed to delete bundle group. Ensure it has no bundles.");
      }
  };

  const handleViewBundleGroupDetails = (group: BundleGroup) => {
      setViewingBundleGroupId(group.id);
      setIsBundleGroupSheetOpen(true);
  };


  // --- Bundle Handlers ---

  const handleOpenBundleDialog = useCallback((bundle?: Bundle, groupId?: string) => {
      if (bundle) {
          setEditingBundle(bundle);
          setBundleFormData({
              name: bundle.name,
              slug: bundle.slug,
              description: bundle.description || "",
              price: bundle.price,
              currency: bundle.currency,
              interval: bundle.interval,
              active: bundle.active,
              bundle_group_id: bundle.bundle_group_id,
              tier_label: bundle.tier_label
          });
      } else {
          setEditingBundle(null);
          setBundleFormData({
            name: "", // Will be set by tier_label
            slug: "", // Will be set by tier_label
            description: "",
            price: 19,
            currency: "USD",
            interval: "monthly",
            active: true,
            bundle_group_id: groupId, // Pre-fill group ID if creating within a group
            tier_label: "" // Clear default
          });
      }
      setIsBundleDialogOpen(true);
  }, []);

  const handleBundleSave = async () => {
      try {
          if (editingBundle) {
              await AdminService.updateBundle(editingBundle.id, bundleFormData);
          } else {
              await AdminService.createBundle(bundleFormData);
          }
          setIsBundleDialogOpen(false);
          fetchBundles(); // Still fetch all bundles if needed
          fetchBundleGroups(); // Refresh groups to show new bundle in tier list
      } catch (error) {
          console.error("Failed to save bundle", error);
          alert("Failed to save bundle.");
      }
  };

  const handleViewBundleDetails = useCallback((bundle: Bundle) => {
      setViewingBundle(bundle);
      setIsBundleSheetOpen(true);
  }, []);

  const handleBundleDelete = useCallback(async (id: string) => {
      try {
          await AdminService.deleteBundle(id);

          fetchBundles();
          fetchBundleGroups();
          toast.success("Bundle deleted successfully");
      } catch (error) {
          console.error("Failed to delete bundle", error);
          toast.error("Failed to delete bundle. It may have active subscribers.");
      }
  }, [fetchBundles, fetchBundleGroups]);

  // --- Plan Limit Handlers ---

  const handleManageLimits = useCallback(async (plan: Plan) => {
      setSelectedPlanForLimits(plan);
      setIsLimitDialogOpen(true);
      try {
          const features = await AdminService.getFeatures(plan.tool_id); // Fetch all features for tool
          setAvailableFeatures(features.features || []); 
          setPlanLimits(plan.limits || []);

          // Initialize staged limits
          const initialStaged: Record<string, { limit: number | null, reset_period: string, enabled: boolean }> = {};
          features.features?.forEach((f: AdminService.Feature) => {
              const existingLimit = plan.limits?.find(l => l.feature_id === f.id);
              if (existingLimit) {
                  initialStaged[f.id] = {
                      limit: existingLimit.default_limit,
                      reset_period: existingLimit.reset_period,
                      enabled: existingLimit.is_enabled
                  };
              } else {
                   initialStaged[f.id] = {
                      limit: null,
                      reset_period: 'monthly',
                      enabled: false
                  };
              }
          });
          setStagedLimits(initialStaged);

      } catch (error) {
          console.error("Failed to prep limits", error);
      }
  }, []);

  const handleStagedLimitUpdate = (featureId: string, updates: Partial<{ limit: number | null, reset_period: string, enabled: boolean }>) => {
      setStagedLimits(prev => ({
          ...prev,
          [featureId]: { ...prev[featureId], ...updates }
      }));
  };

  const handleSaveLimits = async () => {
      if (!selectedPlanForLimits) return;
      setIsSavingLimits(true);
      try {
          const promises: Promise<unknown>[] = [];

          // Upsert all limits with their enabled state
          const limitEntries = Object.entries(stagedLimits);
          for (const [featureId, data] of limitEntries) {
              promises.push(AdminService.upsertPlanLimit(selectedPlanForLimits.id, {
                  feature_id: featureId,
                  default_limit: data.limit,
                  reset_period: data.reset_period,
                  is_enabled: data.enabled
              }));
          }

          await Promise.all(promises);
          
          toast.success("Limits updated successfully");
          setIsLimitDialogOpen(false);
          fetchPlans(); // Refresh to get latest limits
          fetchBundleGroups(); // Refresh bundle views that might show limits


      } catch (error) {
          console.error("Failed to save limits", error);
          toast.error("Failed to save limits");
      } finally {
          setIsSavingLimits(false);
      }
  };

  // --- Bundle Plans Handlers ---

  const handleManageBundlePlans = useCallback(async (bundle: Bundle) => {
      setSelectedBundleForPlans(bundle);
      setBundlePlans(bundle.plans || []); 
      setStagedBundlePlans(bundle.plans || []);
      setIsBundlePlansDialogOpen(true);

      // Fetch all plans to offer as options
      try {
          const allPlans = await AdminService.getPlans(undefined, { limit: 100, activeOnly: true });
          setAllActivePlans(allPlans.plans || []);
          
          const freshBundle = await AdminService.getBundleById(bundle.id);
          setBundlePlans(freshBundle.plans || []);
          setStagedBundlePlans(freshBundle.plans || []);
      } catch (error) {
          console.error("Failed to prep bundle plans", error);
      }
  }, []);

  const handleAddPlanToBundle = (planId: string) => {
      const planToAdd = allActivePlans.find(p => p.id === planId);
      if (planToAdd && !stagedBundlePlans.find(p => p.id === planId)) {
          setStagedBundlePlans(prev => [...prev, planToAdd]);
      }
  };

  const handleRemovePlanFromBundle = (planId: string) => {
      setStagedBundlePlans(prev => prev.filter(p => p.id !== planId));
  };

  const handleSaveBundlePlans = async () => {
    if (!selectedBundleForPlans) return;
    setIsSavingBundlePlans(true);
    try {
        // Find added plans
        const addedPlans = stagedBundlePlans.filter(sp => !bundlePlans.find(bp => bp.id === sp.id));
        // Find removed plans
        const removedPlans = bundlePlans.filter(bp => !stagedBundlePlans.find(sp => sp.id === bp.id));

        const promises = [];
        
        // Add new plans
        for (const plan of addedPlans) {
            promises.push(AdminService.addPlanToBundle(selectedBundleForPlans.id, plan.id));
        }

        // Remove old plans
        for (const plan of removedPlans) {
            promises.push(AdminService.removePlanFromBundle(selectedBundleForPlans.id, plan.id));
        }

        await Promise.all(promises);

        toast.success("Bundle plans updated successfully");
        setIsBundlePlansDialogOpen(false);
        fetchBundles();
        fetchBundleGroups();
    } catch (error) {
        console.error("Failed to save bundle plans", error);
        toast.error("Failed to save bundle plans");
    } finally {
        setIsSavingBundlePlans(false);
    }
  };

  // --- Column Definitions ---

  const planColumns: ColumnDef<Plan>[] = useMemo(() => [
      {
          accessorKey: "name",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Plan Name" />,
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground"/>
                <div className="flex flex-col">
                    <span className="font-medium">{row.getValue("name")}</span>
                    <span className="text-xs text-muted-foreground capitalize">{row.original.tier}</span>
                </div>
            </div>
          )
      },
      {
          accessorKey: "tool.name",
          id: "tool_name",
          header: "Tool",
          cell: ({ row }) => row.original.tool?.name
      },
      {
          accessorKey: "price",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
          cell: ({ row }) => row.original.interval === 'one_time' ? `${row.original.currency} ${row.original.price} (one-time)` : `${row.original.currency} ${row.original.price}/${row.original.interval}`
      },
      {
          accessorKey: "active",
          header: "Status",
          cell: ({ row }) => (
              <Badge variant={row.original.active ? "default" : "secondary"}>
                  {row.original.active ? "Active" : "Inactive"}
              </Badge>
          )
      },
       {
          id: "actions",
          cell: ({ row }) => {
              const plan = row.original;
              return (
                <div className="flex justify-end gap-2">
                    <Button size="icon" variant="ghost" title="View Details" onClick={() => handleViewPlanDetails(plan)}><Eye className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" title="Limits" onClick={() => handleManageLimits(plan)}><Settings className="h-4 w-4"/></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleOpenPlanDialog(plan)}><Pencil className="h-4 w-4"/></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4"/></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the plan <strong>{plan.name}</strong>.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handlePlanDelete(plan.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
              )
          }
      }
  ], [handleViewPlanDetails, handleManageLimits, handleOpenPlanDialog, handlePlanDelete]);

  const bundleColumns: ColumnDef<Bundle>[] = useMemo(() => [
        {
            accessorKey: "name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Bundle Name" />,
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground"/>
                    <span className="font-medium">{row.getValue("name")}</span>
                </div>
            )
        },
        {
            accessorKey: "slug",
            header: "Slug",
            cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("slug")}</span>
        },
        {
            id: "plans",
            header: "Plans",
            cell: ({ row }) => {
                const plans = row.original.plans;
                if (!plans || plans.length === 0) return <span className="text-muted-foreground text-xs">No plans</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {plans.map(p => (
                            <Badge key={p.id} variant="outline" className="text-xs">
                                {p.name}
                            </Badge>
                        ))}
                    </div>
                );
            }
        },
        {
            accessorKey: "price",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
             cell: ({ row }) => row.original.interval === 'one_time' ? `${row.original.currency} ${row.original.price} (one-time)` : `${row.original.currency} ${row.original.price}/${row.original.interval}`
        },
        {
            accessorKey: "active",
            header: "Status",
            cell: ({ row }) => (
                <Badge variant={row.original.active ? "default" : "secondary"}>
                    {row.original.active ? "Active" : "Inactive"}
                </Badge>
            )
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const bundle = row.original;
                return (
                    <div className="flex justify-end gap-2">
                         <Button size="icon" variant="ghost" title="View Details" onClick={() => handleViewBundleDetails(bundle)}><Eye className="h-4 w-4"/></Button>
                        <Button size="icon" variant="ghost" title="Manage Plans" onClick={() => handleManageBundlePlans(bundle)}><LinkIcon className="h-4 w-4"/></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleOpenBundleDialog(bundle)}><Pencil className="h-4 w-4"/></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4"/></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the bundle <strong>{bundle.name}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleBundleDelete(bundle.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )
            }
        }
  ], [handleViewBundleDetails, handleManageBundlePlans, handleOpenBundleDialog, handleBundleDelete]);


  return (
    <>
      <div className="space-y-6">


        <div className="space-y-8">
            {/* Plans List */}
            <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <div>
                         <h2 className="text-3xl font-bold tracking-tight">Manage Plans</h2>
                         <p className="text-muted-foreground mt-1">Configure individual subscription plans for your tools.</p>
                    </div>
                    <Button onClick={() => handleOpenPlanDialog()}>
                        <Plus className="h-4 w-4 mr-2" /> Add Plan
                    </Button>
                </div>
                <Card>
                    <CardContent className="p-0">
                        <DataTable 
                            columns={planColumns}
                            data={plans}
                            pageCount={Math.ceil(plansRowCount / plansPagination.pageSize)}
                            pagination={plansPagination}
                            onPaginationChange={setPlansPagination}
                            sorting={plansSorting}
                            onSortingChange={setPlansSorting}
                            searchQuery={plansSearch}
                            onSearchChange={setPlansSearch}
                            placeholder="Search plans..."
                            isLoading={isLoadingPlans}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Bundles List */}
             <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Manage Bundles</h2>
                        <p className="text-muted-foreground mt-1">Create bundles and add tiered pricing (e.g., Basic, Premium).</p>
                    </div>
                     <Button onClick={() => handleOpenBundleGroupDialog()}>
                        <Plus className="h-4 w-4 mr-2" /> Create Bundle
                    </Button>
                </div>
                
                {isLoadingBundleGroups ? (
                    <div>Loading bundle groups...</div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {bundleGroups.map(group => (
                            <Card key={group.id}>
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                                <Layers className="h-5 w-5 text-primary" />
                                                {group.name}
                                                <Badge variant={group.active ? "default" : "secondary"} className="ml-2">
                                                    {group.active ? "Active" : "Inactive"}
                                                </Badge>
                                            </h3>
                                            <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                                        </div>
                                         <div className="flex gap-2">
                                            <Button variant="ghost" size="icon" title="View Details" onClick={() => handleViewBundleGroupDetails(group)}>
                                                <Eye className="h-4 w-4"/>
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => handleOpenBundleDialog(undefined, group.id)}>
                                                <Plus className="h-4 w-4 mr-2"/> Add Tier
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenBundleGroupDialog(group)}>
                                                <Pencil className="h-4 w-4"/>
                                            </Button>
                                             <AlertDialog>
                                              <AlertDialogTrigger asChild>
                                                <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4"/></Button>
                                              </AlertDialogTrigger>
                                              <AlertDialogContent>
                                                <AlertDialogHeader>
                                                  <AlertDialogTitle>Delete Group?</AlertDialogTitle>
                                                  <AlertDialogDescription>
                                                    Delete <strong>{group.name}</strong>? This will fail if it has active bundles.
                                                  </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                  <AlertDialogAction onClick={() => handleDeleteBundleGroup(group.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                              </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>

                                    {/* Tiers List */}
                                    <div className="rounded-md border">
                                        <Table>
                                             <TableHeader>
                                                <TableRow>
                                                    <TableHead>Tier Name</TableHead>
                                                    <TableHead>Price</TableHead>
                                                    <TableHead>Plans</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {group.bundles && group.bundles.length > 0 ? (
                                                    group.bundles.map(bundle => (
                                                        <TableRow key={bundle.id}>
                                                            <TableCell className="font-medium">
                                                                <div>{bundle.name}</div>
                                                                {/* Only show badge if label distinct from name (legacy data) */}
                                                                {bundle.tier_label && bundle.tier_label !== bundle.name && <Badge variant="outline" className="text-[10px]">{bundle.tier_label}</Badge>}
                                                            </TableCell>
                                                            <TableCell>{bundle.currency} {bundle.price}/{bundle.interval}</TableCell>
                                                             <TableCell>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {bundle.plans?.map(p => (
                                                                        <Badge key={p.id} variant="secondary" className="text-[10px]">{p.name}</Badge>
                                                                    ))}
                                                                    {(!bundle.plans || bundle.plans.length === 0) && <span className="text-muted-foreground text-xs italic">No plans</span>}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={bundle.active ? "default" : "secondary"}>
                                                                    {bundle.active ? "Active" : "Inactive"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                 <div className="flex justify-end gap-1">
                                                                     <Button size="icon" variant="ghost" className="h-8 w-8" title="Link Plans" onClick={() => handleManageBundlePlans(bundle)}><LinkIcon className="h-4 w-4"/></Button>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleOpenBundleDialog(bundle)}><Pencil className="h-4 w-4"/></Button>
                                                                     <AlertDialog>
                                                                      <AlertDialogTrigger asChild>
                                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4"/></Button>
                                                                      </AlertDialogTrigger>
                                                                      <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                          <AlertDialogTitle>Delete Tier?</AlertDialogTitle>
                                                                          <AlertDialogDescription>
                                                                            Delete <strong>{bundle.name}</strong>?
                                                                          </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                          <AlertDialogAction onClick={() => handleBundleDelete(bundle.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                      </AlertDialogContent>
                                                                    </AlertDialog>
                                                                 </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">No pricing tiers added yet.</TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </Card>
                        ))}
                         {bundleGroups.length === 0 && (
                            <div className="text-center p-8 border rounded-lg bg-muted/50">
                                <h3 className="font-semibold text-lg">No Bundle Groups</h3>
                                <p className="text-muted-foreground">Create a group (e.g. "Creative Cloud") to start adding tiers.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* --- Dialogs --- */}

        {/* Plan Create/Edit Dialog */}
        <Dialog open={isPlanDialogOpen} onOpenChange={setIsPlanDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Edit Plan" : "New Plan"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="col-span-2 space-y-2">
                      <Label>Name</Label>
                      <Input value={planFormData.name} onChange={e => setPlanFormData({...planFormData, name: e.target.value})} />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Tool</Label>
                    <Select value={planFormData.tool_id} onValueChange={v => setPlanFormData({...planFormData, tool_id: v})} disabled={!!editingPlan}>
                        <SelectTrigger><SelectValue placeholder="Select Tool" /></SelectTrigger>
                        <SelectContent>{tools.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                      <Label>Description</Label>
                      <Input value={planFormData.description} onChange={e => setPlanFormData({...planFormData, description: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                      <Label>Price</Label>
                      <Input type="number" value={planFormData.price} onChange={e => setPlanFormData({...planFormData, price: Number(e.target.value)})} />
                  </div>
                   <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={planFormData.currency} onValueChange={v => setPlanFormData({...planFormData, currency: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="INR">INR</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <Label>Interval</Label>
                      <Select value={planFormData.interval} onValueChange={(v: Plan["interval"]) => {
                          setPlanFormData(prev => ({
                              ...prev, 
                              interval: v,
                              is_trial_plan: v === 'one_time' ? false : prev.is_trial_plan
                          }));
                      }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select interval" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                              <SelectItem value="one_time">One-time</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                   <div className="space-y-2">
                      <Label>Tier</Label>
                      <Select value={planFormData.tier} onValueChange={(v: Plan["tier"]) => setPlanFormData({...planFormData, tier: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="platinum">Platinum</SelectItem>
                              <SelectItem value="diamond">Diamond</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>

                   <div className="col-span-2 flex gap-6 pt-2 items-start">
                      <div className="flex items-center gap-2"><Switch checked={planFormData.active} onCheckedChange={c => setPlanFormData({...planFormData, active: c})} /><Label>Active</Label></div>
                      <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                              <Switch 
                                  checked={planFormData.is_trial_plan && planFormData.interval !== 'one_time'} 
                                  disabled={planFormData.interval === 'one_time'}
                                  onCheckedChange={c => setPlanFormData({...planFormData, is_trial_plan: c})} 
                              />
                              <Label className={planFormData.interval === 'one_time' ? 'text-muted-foreground' : ''}>Trial Plan</Label>
                          </div>
                          <span className="text-[10px] text-muted-foreground max-w-[200px] leading-tight">
                              For trials use monthly interval and set price to 0 for a free trial that cancels automatically.
                          </span>
                      </div>
                   </div>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsPlanDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handlePlanSave}>Save</Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Bundle Create/Edit Dialog */}
        <Dialog open={isBundleDialogOpen} onOpenChange={setIsBundleDialogOpen}>
            <DialogContent className="max-w-xl">
                 <DialogHeader>
                    <DialogTitle>{editingBundle ? "Edit Bundle" : "New Bundle"}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                     <div className="col-span-2 space-y-2">
                        <Label>Tier Label</Label>
                        <Input value={bundleFormData.tier_label || ''} onChange={e => {
                            const label = e.target.value;
                             setBundleFormData({
                                 ...bundleFormData, 
                                 tier_label: label,
                                 name: label,
                                 // Auto-generate slug with random suffix
                                 slug: label ? `${label.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '')}-${Math.random().toString(36).substring(2, 7)}` : ''
                             })
                        }} placeholder="e.g. Basic, Premium" />
                     </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Description</Label>
                        <Input value={bundleFormData.description} onChange={e => setBundleFormData({...bundleFormData, description: e.target.value})} />
                     </div>
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input type="number" value={bundleFormData.price} onChange={e => setBundleFormData({...bundleFormData, price: Number(e.target.value)})} />
                     </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select value={bundleFormData.currency} onValueChange={v => setBundleFormData({...bundleFormData, currency: v})}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="INR">INR</SelectItem>
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Interval</Label>
                         <Select value={bundleFormData.interval} onValueChange={(v: Bundle["interval"]) => setBundleFormData({...bundleFormData, interval: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                              <SelectItem value="one_time">Lifetime</SelectItem>
                          </SelectContent>
                      </Select>
                     </div>
                      <div className="col-span-2 flex items-center gap-2 pt-2">
                        <Switch checked={bundleFormData.active} onCheckedChange={c => setBundleFormData({...bundleFormData, active: c})} />
                        <Label>Active</Label>
                     </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBundleDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleBundleSave}>Save</Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

         {/* Bundle Group Create/Edit Dialog */}
        <Dialog open={isBundleGroupDialogOpen} onOpenChange={setIsBundleGroupDialogOpen}>
            <DialogContent className="max-w-md">
                 <DialogHeader>
                    <DialogTitle>{editingBundleGroup ? "Edit Bundle Group" : "New Bundle Group"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                     <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={bundleGroupFormData.name} onChange={e => setBundleGroupFormData({...bundleGroupFormData, name: e.target.value})} placeholder="e.g. Creative Cloud" />
                     </div>
                      <div className="space-y-2">
                        <Label>Slug</Label>
                        <Input value={bundleGroupFormData.slug} onChange={e => setBundleGroupFormData({...bundleGroupFormData, slug: e.target.value})} placeholder="e.g. creative-cloud" />
                     </div>
                     <div className="space-y-2">
                        <Label>Description</Label>
                        <Input value={bundleGroupFormData.description} onChange={e => setBundleGroupFormData({...bundleGroupFormData, description: e.target.value})} />
                     </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Switch checked={bundleGroupFormData.active} onCheckedChange={c => setBundleGroupFormData({...bundleGroupFormData, active: c})} />
                        <Label>Active</Label>
                     </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsBundleGroupDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleBundleGroupSave}>Save</Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

         {/* Plan Limits Dialog */}
        <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Limits: {selectedPlanForLimits?.name}</DialogTitle>
                    <DialogDescription>Note: Ensure "Metered" features have a number reset period.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Feature</TableHead>
                                <TableHead>Limit</TableHead>
                                <TableHead>Reset</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {availableFeatures.map(f => {
                                const limit = selectedPlanForLimits?.limits?.find(l => l.feature_id === f.id);
                                return (
                                    <TableRow key={f.id}>
                                        <TableCell>
                                            <div className="font-medium">{f.name}</div>
                                            <div className="text-xs text-muted-foreground">{f.slug}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Switch 
                                                    checked={stagedLimits[f.id]?.enabled ?? false}
                                                    onCheckedChange={(c) => handleStagedLimitUpdate(f.id, { enabled: c })}
                                                />
                                                <span className="text-sm text-muted-foreground w-14">{stagedLimits[f.id]?.enabled ? "Enabled" : "Disabled"}</span>
                                                {stagedLimits[f.id]?.enabled && (
                                                    <Input 
                                                        className="w-24 h-8" type="number" placeholder="∞" 
                                                        value={stagedLimits[f.id]?.limit === null ? "" : stagedLimits[f.id]?.limit}
                                                        onChange={(e) => handleStagedLimitUpdate(f.id, { limit: e.target.value ? Number(e.target.value) : null })}
                                                    />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                             {stagedLimits[f.id]?.enabled && (
                                                  <Select value={stagedLimits[f.id]?.reset_period || 'monthly'} onValueChange={v => handleStagedLimitUpdate(f.id, { reset_period: v })}>
                                                    <SelectTrigger className="w-24 h-8"><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="monthly">Monthly</SelectItem>
                                                        <SelectItem value="yearly">Yearly</SelectItem>
                                                        <SelectItem value="never">Never</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                             )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter className="mt-4 border-t pt-4">
                     <Button variant="outline" onClick={() => setIsLimitDialogOpen(false)}>Cancel</Button>
                     <Button onClick={handleSaveLimits} disabled={isSavingLimits}>
                        {isSavingLimits ? "Saving..." : "Save Changes"}
                     </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Bundle Plans Association Dialog */}
        <Dialog open={isBundlePlansDialogOpen} onOpenChange={setIsBundlePlansDialogOpen}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>Manage Tier Content</DialogTitle>
                    <DialogDescription>{selectedBundleForPlans?.name}</DialogDescription>
                </DialogHeader>
                 
                 <div className="space-y-4">
                     <div className="flex items-center gap-2">
                         <Select onValueChange={(v) => handleAddPlanToBundle(v)}>
                             <SelectTrigger><SelectValue placeholder="Add Plan to Tier..." /></SelectTrigger>
                             <SelectContent>
                                 {allActivePlans
                                    .filter(p => !stagedBundlePlans.find(bp => bp.id === p.id))
                                    .map(p => (
                                     <SelectItem key={p.id} value={p.id}>{p.name} ({p.tool?.name})</SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                     </div>

                     <div className="border rounded-md">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead>Plan</TableHead>
                                     <TableHead></TableHead>
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                 {stagedBundlePlans.map(p => (
                                     <TableRow key={p.id}>
                                         <TableCell>
                                             <div className="font-medium">{p.name}</div>
                                             {/* Show changed status if newly added */}
                                             {!bundlePlans.find(bp => bp.id === p.id) && <Badge variant="outline" className="text-[10px] mt-1 text-green-600 border-green-200 bg-green-50">New</Badge>}
                                         </TableCell>
                                         <TableCell className="text-right">
                                             <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => handleRemovePlanFromBundle(p.id)}>
                                                 <X className="h-4 w-4" />
                                             </Button>
                                         </TableCell>
                                     </TableRow>
                                 ))}
                                 {stagedBundlePlans.length === 0 && <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground">No plans in bundle</TableCell></TableRow>}
                             </TableBody>
                         </Table>
                     </div>
                 </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => setIsBundlePlansDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveBundlePlans} disabled={isSavingBundlePlans}>
                        {isSavingBundlePlans ? "Saving..." : "Save"}
                    </Button>
                 </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Plan Details Sheet */}
        <Sheet open={isPlanSheetOpen} onOpenChange={setIsPlanSheetOpen}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Plan Details</SheetTitle>
                    <SheetDescription>{viewingPlan?.name}</SheetDescription>
                </SheetHeader>
                {viewingPlan && (
                    <div className="space-y-6 py-6">
                         <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Plan Info
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground block">Name</span>
                                    <span className="font-medium">{viewingPlan.name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Tier</span>
                                    <Badge variant="outline" className="capitalize">{viewingPlan.tier}</Badge>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Price</span>
                                    <span className="font-medium text-lg">${viewingPlan.price} / {viewingPlan.interval}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Tool</span>
                                    <span className="font-medium">{viewingPlan.tool?.name}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-muted-foreground block">Description</span>
                                    <span>{viewingPlan.description || "No description"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Status</span>
                                    <Badge variant={viewingPlan.active ? "default" : "secondary"}>
                                        {viewingPlan.active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>

                            </div>
                        </section>
                        
                        <div className="h-px bg-border" />

                         <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Settings className="h-5 w-5" />
                                Limits & Features
                            </h3>
                            {viewingPlan.limits && viewingPlan.limits.length > 0 ? (
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Feature</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Limit</TableHead>
                                                <TableHead>Reset</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {viewingPlan.limits.map(l => (
                                                <TableRow key={l.id}>
                                                     <TableCell className="font-medium">{(l as PlanLimit & { feature?: Feature }).feature?.name || 'Feature'}</TableCell> 
                                                     <TableCell>
                                                         <Badge variant={(l as PlanLimit).is_enabled ? "default" : "secondary"}>
                                                             {(l as PlanLimit).is_enabled ? "Enabled" : "Disabled"}
                                                         </Badge>
                                                     </TableCell>
                                                     <TableCell>
                                                        {(l as PlanLimit).is_enabled ? (l.default_limit === null ? "Unlimited" : l.default_limit) : "-"}
                                                     </TableCell>
                                                     <TableCell className="capitalize">
                                                        {(l as PlanLimit).is_enabled ? l.reset_period : "-"}
                                                     </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg">
                                    No specific limits configured.
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </SheetContent>
        </Sheet>

        {/* Bundle Details Sheet */}
        <Sheet open={isBundleSheetOpen} onOpenChange={setIsBundleSheetOpen}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Bundle Details</SheetTitle>
                    <SheetDescription>{viewingBundle?.name}</SheetDescription>
                </SheetHeader>
                {viewingBundle && (
                    <div className="space-y-6 py-6">
                         <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                Bundle Info
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground block">Name</span>
                                    <span className="font-medium">{viewingBundle.name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Slug</span>
                                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{viewingBundle.slug}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Price</span>
                                    <span className="font-medium text-lg">{viewingBundle.currency} {viewingBundle.price} / {viewingBundle.interval}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Status</span>
                                    <Badge variant={viewingBundle.active ? "default" : "secondary"}>
                                        {viewingBundle.active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-muted-foreground block">Description</span>
                                    <span>{viewingBundle.description || "No description"}</span>
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-border" />

                         <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Layers className="h-5 w-5" />
                                Included Plans
                            </h3>
                            {viewingBundle.plans && viewingBundle.plans.length > 0 ? (
                                <div className="space-y-2">
                                    {viewingBundle.plans.map(p => (
                                        <Card key={p.id} className="overflow-hidden">
                                            <CardContent className="p-3 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-primary/10 p-2 rounded-md">
                                                        <CreditCard className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{p.name}</div>
                                                        <div className="text-xs text-muted-foreground">{p.tool?.name}</div>
                                                    </div>
                                                </div>
                                                <Badge variant="outline">{p.tier}</Badge>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg">
                                    No plans included in this bundle.
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </SheetContent>
        </Sheet>

        {/* Bundle Group Details Sheet */}
        <Sheet open={isBundleGroupSheetOpen} onOpenChange={setIsBundleGroupSheetOpen}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Bundle Group Details</SheetTitle>
                    <SheetDescription>{viewingBundleGroup?.name}</SheetDescription>
                </SheetHeader>
                {viewingBundleGroup && (
                     <div className="space-y-6 py-6">
                        <section className="space-y-3">
                             <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Layers className="h-5 w-5" />
                                Group Info
                            </h3>
                             <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground block">Name</span>
                                    <span className="font-medium">{viewingBundleGroup.name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Slug</span>
                                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{viewingBundleGroup.slug}</span>
                                </div>
                                 <div className="col-span-2">
                                    <span className="text-muted-foreground block">Description</span>
                                    <span>{viewingBundleGroup.description || "No description"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Status</span>
                                    <Badge variant={viewingBundleGroup.active ? "default" : "secondary"}>
                                        {viewingBundleGroup.active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-border" />

                         <section className="space-y-4">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                Tiers & Plans
                            </h3>
                            {viewingBundleGroup.bundles && viewingBundleGroup.bundles.length > 0 ? (
                                <div className="space-y-6">
                                    {viewingBundleGroup.bundles.map(bundle => (
                                        <div key={bundle.id} className="border rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium flex items-center gap-2">
                                                    {bundle.name}
                                                    <Badge variant="outline" className="text-xs">{bundle.currency} {bundle.price}/{bundle.interval}</Badge>
                                                </div>
                                            </div>

                                            {/* Plans */}
                                             <div className="space-y-2">
                                                {bundle.plans && bundle.plans.length > 0 ? (
                                                    bundle.plans.map(plan => (
                                                        <div key={plan.id} className="bg-muted/30 p-3 rounded-md">
                                                            <div 
                                                                className="flex items-center justify-between cursor-pointer hover:text-primary transition-colors"
                                                                onClick={() => handleViewPlanDetails(plan)}
                                                                title="View Plan Details & Limits"
                                                            >
                                                                <div className="font-medium text-sm flex items-center gap-2">
                                                                     {plan.name}
                                                                     <span className="text-xs text-muted-foreground font-normal">({plan.tool?.name || 'Tool'})</span>
                                                                </div>
                                                                <Eye className="h-3 w-3 opacity-50" />
                                                            </div>
                                                            {/* Limit Preview */}
                                                            <div className="mt-2 text-xs text-muted-foreground">
                                                                {plan.limits && plan.limits.length > 0 ? (
                                                                     <div className="flex flex-wrap gap-1">
                                                                        {plan.limits.filter(l => l.is_enabled).slice(0, 3).map(l => (
                                                                            <span key={l.id} className="bg-background border px-1.5 py-0.5 rounded">
                                                                                {l.feature?.name}: {l.default_limit === null ? "∞" : l.default_limit}
                                                                            </span>
                                                                        ))}
                                                                        {plan.limits.filter(l => l.is_enabled).length > 3 && <span>+{plan.limits.filter(l => l.is_enabled).length - 3} more</span>}
                                                                     </div>
                                                                ) : (
                                                                    <span>No limits configured</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-xs text-muted-foreground italic">No plans in this tier.</div>
                                                )}
                                             </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted-foreground">No tiers configured.</div>
                            )}
                        </section>
                     </div>
                )}
            </SheetContent>
        </Sheet>
      </div>
    </>
  );
}


