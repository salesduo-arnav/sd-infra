import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
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
import { Plus, Pencil, Trash2, CreditCard, Settings, Package, Link as LinkIcon, X } from "lucide-react";
import * as AdminService from "@/services/admin.service";
import { Plan, Tool, PlanLimit, Bundle } from "@/services/admin.service";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { toast } from "sonner";

export default function AdminPlans() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [isLoadingBundles, setIsLoadingBundles] = useState(false);

  // Plans State (DataTable)
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansPagination, setPlansPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [plansSorting, setPlansSorting] = useState<SortingState>([]);
  const [plansRowCount, setPlansRowCount] = useState(0);
  const [plansSearch, setPlansSearch] = useState("");

  // Bundles State (DataTable)
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundlesPagination, setBundlesPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [bundlesSorting, setBundlesSorting] = useState<SortingState>([]);
  const [bundlesRowCount, setBundlesRowCount] = useState(0);
  const [bundlesSearch, setBundlesSearch] = useState("");

  // Dialog State
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isBundleDialogOpen, setIsBundleDialogOpen] = useState(false);
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);
  const [isBundlePlansDialogOpen, setIsBundlePlansDialogOpen] = useState(false);

  // Form Data State
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planFormData, setPlanFormData] = useState({
    name: "",
    description: "",
    tool_id: "",
    tier: "basic" as Plan["tier"],
    price: 0,
    currency: "USD",
    interval: "monthly" as Plan["interval"],
    trial_period_days: 0,
    is_public: true,
    active: true,
  });

  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [bundleFormData, setBundleFormData] = useState({
      name: "",
      slug: "",
      description: "",
      price: 0,
      currency: "USD",
      interval: "monthly" as Bundle["interval"],
      active: true
  });

  // Limit/Association State
  const [selectedPlanForLimits, setSelectedPlanForLimits] = useState<Plan | null>(null);
  const [planLimits, setPlanLimits] = useState<PlanLimit[]>([]);
  const [availableFeatures, setAvailableFeatures] = useState<AdminService.Feature[]>([]);

  const [selectedBundleForPlans, setSelectedBundleForPlans] = useState<Bundle | null>(null);
  const [bundlePlans, setBundlePlans] = useState<Plan[]>([]); // Plans currently in bundle
  const [allActivePlans, setAllActivePlans] = useState<Plan[]>([]); // For selection

  // ==========================
  // Fetchers
  // ==========================

  const fetchPlans = async () => {
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
  };

  const fetchBundles = async () => {
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
  };

  const fetchTools = async () => {
      try {
        const toolsData = await AdminService.getTools({ activeOnly: true, limit: 100 });
        setTools(toolsData.tools || []);
      } catch (error) {
          console.error("Failed to fetch tools", error);
      }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [plansPagination.pageIndex, plansPagination.pageSize, plansSorting, plansSearch]);

  useEffect(() => {
    fetchBundles();
  }, [bundlesPagination.pageIndex, bundlesPagination.pageSize, bundlesSorting, bundlesSearch]);

  
  // ==========================
  // Plan Handlers
  // ==========================

  const handleOpenPlanDialog = (plan?: Plan) => {
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
        trial_period_days: plan.trial_period_days,
        is_public: plan.is_public,
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
          trial_period_days: 0,
          is_public: true,
          active: true
        });
    }
    setIsPlanDialogOpen(true);
  };

  const handlePlanSave = async () => {
    try {
      if (editingPlan) {
        await AdminService.updatePlan(editingPlan.id, planFormData);
      } else {
        await AdminService.createPlan(planFormData);
      }
      setIsPlanDialogOpen(false);
      fetchPlans();
    } catch (error) {
      console.error("Failed to save plan", error);
      alert("Failed to save plan.");
    }
  };

  const handlePlanDelete = async (id: string) => {
    try {
      await AdminService.deletePlan(id);
      fetchPlans();
      toast.success("Plan deleted successfully");
    } catch (error) {
      console.error("Failed to delete plan", error);
      toast.error("Failed to delete plan. It may have active subscribers.");
    }
  };

  // ==========================
  // Bundle Handlers
  // ==========================

  const handleOpenBundleDialog = (bundle?: Bundle) => {
      if (bundle) {
          setEditingBundle(bundle);
          setBundleFormData({
              name: bundle.name,
              slug: bundle.slug,
              description: bundle.description || "",
              price: bundle.price,
              currency: bundle.currency,
              interval: bundle.interval,
              active: bundle.active
          });
      } else {
          setEditingBundle(null);
          setBundleFormData({
            name: "",
            slug: "",
            description: "",
            price: 19,
            currency: "USD",
            interval: "monthly",
            active: true
          });
      }
      setIsBundleDialogOpen(true);
  };

  const handleBundleSave = async () => {
      try {
          if (editingBundle) {
              await AdminService.updateBundle(editingBundle.id, bundleFormData);
          } else {
              await AdminService.createBundle(bundleFormData);
          }
          setIsBundleDialogOpen(false);
          fetchBundles();
      } catch (error) {
          console.error("Failed to save bundle", error);
          alert("Failed to save bundle.");
      }
  };

  const handleBundleDelete = async (id: string) => {
      try {
          await AdminService.deleteBundle(id);
          fetchBundles();
          toast.success("Bundle deleted successfully");
      } catch (error) {
          console.error("Failed to delete bundle", error);
          toast.error("Failed to delete bundle. It may have active subscribers.");
      }
  };

  // ==========================
  // Plan Limit Handlers
  // ==========================

  const handleManageLimits = async (plan: Plan) => {
      setSelectedPlanForLimits(plan);
      setIsLimitDialogOpen(true);
      try {
          const features = await AdminService.getFeatures(plan.tool_id); // Fetch all features for tool
          setAvailableFeatures(features.features || []); 
          setPlanLimits(plan.limits || []);
      } catch (error) {
          console.error("Failed to prep limits", error);
      }
  };

  const handleLimitUpdate = async (featureId: string, limit: number | null, resetPeriod: string) => {
      if (!selectedPlanForLimits) return;
      try {
          await AdminService.upsertPlanLimit(selectedPlanForLimits.id, {
              feature_id: featureId,
              default_limit: limit,
              reset_period: resetPeriod
          });
          fetchPlans();
      } catch (error) {
          console.error("Failed to update limit", error);
      }
  };

  // ==========================
  // Bundle Plans Handlers
  // ==========================

  const handleManageBundlePlans = async (bundle: Bundle) => {
      setSelectedBundleForPlans(bundle);
      setBundlePlans(bundle.plans || []); 
      setIsBundlePlansDialogOpen(true);

      // Fetch all plans to offer as options
      try {
          const allPlans = await AdminService.getPlans(undefined, { limit: 100, activeOnly: true });
          setAllActivePlans(allPlans.plans || []);
          
          const freshBundle = await AdminService.getBundleById(bundle.id);
          setBundlePlans(freshBundle.plans || []);
      } catch (error) {
          console.error("Failed to prep bundle plans", error);
      }
  };

  const handleAddPlanToBundle = async (planId: string) => {
      if (!selectedBundleForPlans) return;
      try {
          await AdminService.addPlanToBundle(selectedBundleForPlans.id, planId);
          // Refresh local list
          const freshBundle = await AdminService.getBundleById(selectedBundleForPlans.id);
          setBundlePlans(freshBundle.plans || []);
          fetchBundles();
      } catch (error) {
          console.error("Failed to add plan to bundle", error);
      }
  };

  const handleRemovePlanFromBundle = async (planId: string) => {
      if (!selectedBundleForPlans) return;
      try {
          await AdminService.removePlanFromBundle(selectedBundleForPlans.id, planId);
           // Refresh local list
          const freshBundle = await AdminService.getBundleById(selectedBundleForPlans.id);
          setBundlePlans(freshBundle.plans || []);
          fetchBundles();
      } catch (error) {
          console.error("Failed to remove plan", error);
      }
  };

  // ==========================
  // Column Definitions
  // ==========================

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
          accessorKey: "tool.name", // Access nested
          id: "tool_name", // ID required for sorting if accessorKey is nested or specialized?
          header: "Tool",
          cell: ({ row }) => row.original.tool?.name
      },
      {
          accessorKey: "price",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
          cell: ({ row }) => `$${row.original.price}/${row.original.interval}`
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
  ], [plans, plansPagination]); // Dependencies for actions

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
             cell: ({ row }) => `$${row.original.price}/${row.original.interval}`
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
  ], [bundles, bundlesPagination]);


  return (
    <Layout>
      <div className="space-y-6">
        {/* <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage Plans & Bundles</h1>
            <p className="text-muted-foreground mt-1">
              Configure pricing, tiers, and product bundles
            </p>
          </div>
        </div> */}

        <div className="space-y-8">
            {/* PLANS SECTION */}
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

            {/* BUNDLES SECTION */}
             <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Manage Bundles</h2>
                        <p className="text-muted-foreground mt-1">Group multiple plans into a single purchasable bundle.</p>
                    </div>
                     <Button onClick={() => handleOpenBundleDialog()}>
                        <Plus className="h-4 w-4 mr-2" /> Create Bundle
                    </Button>
                </div>
                <Card>
                    <CardContent className="p-0">
                         <DataTable 
                            columns={bundleColumns}
                            data={bundles}
                            pageCount={Math.ceil(bundlesRowCount / bundlesPagination.pageSize)}
                            pagination={bundlesPagination}
                            onPaginationChange={setBundlesPagination}
                            sorting={bundlesSorting}
                            onSortingChange={setBundlesSorting}
                            searchQuery={bundlesSearch}
                            onSearchChange={setBundlesSearch}
                            placeholder="Search bundles..."
                            isLoading={isLoadingBundles}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>

        {/* --- DIALOGS --- */}

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
                      <Select value={planFormData.interval} onValueChange={(v: any) => setPlanFormData({...planFormData, interval: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                              <SelectItem value="one_time">One Time</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                   <div className="space-y-2">
                      <Label>Tier</Label>
                      <Select value={planFormData.tier} onValueChange={(v: any) => setPlanFormData({...planFormData, tier: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="platinum">Platinum</SelectItem>
                              <SelectItem value="diamond">Diamond</SelectItem>
                          </SelectContent>
                      </Select>
                  </div>
                   <div className="space-y-2">
                      <Label>Trial Days</Label>
                      <Input type="number" value={planFormData.trial_period_days} onChange={e => setPlanFormData({...planFormData, trial_period_days: Number(e.target.value)})} />
                  </div>
                   <div className="col-span-2 flex gap-6 pt-2">
                      <div className="flex items-center gap-2"><Switch checked={planFormData.is_public} onCheckedChange={c => setPlanFormData({...planFormData, is_public: c})} /><Label>Public</Label></div>
                      <div className="flex items-center gap-2"><Switch checked={planFormData.active} onCheckedChange={c => setPlanFormData({...planFormData, active: c})} /><Label>Active</Label></div>
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
                        <Label>Name</Label>
                        <Input value={bundleFormData.name} onChange={e => setBundleFormData({...bundleFormData, name: e.target.value})} />
                     </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Slug</Label>
                        <Input value={bundleFormData.slug} onChange={e => setBundleFormData({...bundleFormData, slug: e.target.value})} />
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
                        <Label>Interval</Label>
                         <Select value={bundleFormData.interval} onValueChange={(v: any) => setBundleFormData({...bundleFormData, interval: v})}>
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
                                <TableHead>Type</TableHead>
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
                                        <TableCell><Badge variant="outline" className="text-xs">{f.type}</Badge></TableCell>
                                        <TableCell>
                                            {f.type === 'metered' ? (
                                                <Input 
                                                    className="w-24 h-8" type="number" placeholder="∞" 
                                                    defaultValue={limit?.default_limit ?? ""}
                                                    onBlur={(e) => handleLimitUpdate(f.id, e.target.value ? Number(e.target.value) : null, limit?.reset_period || 'monthly')}
                                                />
                                            ) : (
                                                <Switch 
                                                    checked={!!limit}
                                                    onCheckedChange={(c) => {
                                                        if(c) handleLimitUpdate(f.id, 1, 'never');
                                                        else AdminService.deletePlanLimit(selectedPlanForLimits!.id, f.id).then(() => fetchPlans());
                                                    }}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                             {f.type === 'metered' && (
                                                  <Select defaultValue={limit?.reset_period || 'monthly'} onValueChange={v => handleLimitUpdate(f.id, limit?.default_limit ?? null, v)}>
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
            </DialogContent>
        </Dialog>

        {/* Bundle Plans Association Dialog */}
        <Dialog open={isBundlePlansDialogOpen} onOpenChange={setIsBundlePlansDialogOpen}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>Manage Bundle Content</DialogTitle>
                    <DialogDescription>{selectedBundleForPlans?.name}</DialogDescription>
                </DialogHeader>
                 
                 <div className="space-y-4">
                     <div className="flex items-center gap-2">
                         <Select onValueChange={(v) => handleAddPlanToBundle(v)}>
                             <SelectTrigger><SelectValue placeholder="Add Plan to Bundle..." /></SelectTrigger>
                             <SelectContent>
                                 {allActivePlans
                                    .filter(p => !bundlePlans.find(bp => bp.id === p.id))
                                    .map(p => (
                                     <SelectItem key={p.id} value={p.id}>{p.name} ({p.tool?.name}) - ${p.price}</SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                     </div>

                     <div className="border rounded-md">
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead>Included Plan</TableHead>
                                     <TableHead>Tool</TableHead>
                                     <TableHead className="text-right">Action</TableHead>
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                 {bundlePlans.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No plans in this bundle</TableCell></TableRow>}
                                 {bundlePlans.map(p => (
                                     <TableRow key={p.id}>
                                         <TableCell>{p.name}</TableCell>
                                         <TableCell>{p.tool?.name || "Unknown"}</TableCell>
                                         <TableCell className="text-right">
                                             <Button variant="ghost" size="sm" onClick={() => handleRemovePlanFromBundle(p.id)}>
                                                 <X className="h-4 w-4"/>
                                             </Button>
                                         </TableCell>
                                     </TableRow>
                                 ))}
                             </TableBody>
                         </Table>
                     </div>
                 </div>
            </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
