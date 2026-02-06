import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Pencil, Trash2, Package, Bolt, Eye } from "lucide-react";
import * as AdminService from "@/services/admin.service";
import { Tool, Feature } from "@/services/admin.service";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { toast } from "sonner";

export default function AdminApps() {
  const [apps, setApps] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFeatureDialogOpen, setIsFeatureDialogOpen] = useState(false);
  
  // DataTable State
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowCount, setRowCount] = useState(0);
  const [search, setSearch] = useState("");

  // Tool State
  const [editingApp, setEditingApp] = useState<Tool | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    tool_link: "",
    is_active: true,
  });

  // Feature State
  const [selectedToolForFeatures, setSelectedToolForFeatures] = useState<Tool | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [featureFormData, setFeatureFormData] = useState({
    name: "",
    slug: "",

    description: "",
  });

  // View Details State
  const [viewingTool, setViewingTool] = useState<Tool | null>(null);
  const [viewingFeatures, setViewingFeatures] = useState<Feature[]>([]);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getTools({ 
          page: pagination.pageIndex + 1, 
          limit: pagination.pageSize, 
          search,
          sort_by: sorting.length ? sorting[0].id : undefined,
          sort_dir: sorting.length ? (sorting[0].desc ? 'desc' : 'asc') : undefined
      });
      if (data && data.tools) {
        setApps(data.tools);
        setRowCount(data.meta.totalItems);
      }
    } catch (error) {
      console.error("Failed to fetch tools", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.pageIndex, pagination.pageSize, sorting, search]);

  // ==============================
  // Tool Handlers
  // ==============================

  const handleOpenDialog = (app?: Tool) => {
    if (app) {
      setEditingApp(app);
      setFormData({
        name: app.name,
        slug: app.slug,
        description: app.description || "",
        tool_link: app.tool_link || "",
        is_active: app.is_active,
      });
    } else {
      setEditingApp(null);
      setFormData({ name: "", slug: "", description: "", tool_link: "", is_active: true });
    }
    setIsDialogOpen(true);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  };

  const handleNameChange = (name: string) => {
      if (!editingApp) {
          setFormData(prev => ({ ...prev, name, slug: generateSlug(name) }));
      } else {
          setFormData(prev => ({ ...prev, name }));
      }
  };

  const handleSave = async () => {
    try {
      if (editingApp) {
        await AdminService.updateTool(editingApp.id, formData);
      } else {
        await AdminService.createTool(formData);
      }
      setIsDialogOpen(false);
      fetchData();
      toast.success(editingApp ? "App updated" : "App created");
    } catch (error) {
      console.error("Failed to save tool", error);
      toast.error("Failed to save tool.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await AdminService.deleteTool(id);
      fetchData();
      toast.success("App deleted successfully");
    } catch (error) {
      console.error("Failed to delete tool", error);
      toast.error("Failed to delete tool. It may have active dependencies.");
    }
  };

  // ==============================
  // Feature Handlers
  // ==============================

  const handleManageFeatures = async (tool: Tool) => {
      setSelectedToolForFeatures(tool);
      setIsFeatureDialogOpen(true);
      refreshFeatures(tool.id);
      setEditingFeature(null);
      setFeatureFormData({ name: "", slug: "", description: "" });
  };

  const refreshFeatures = async (toolId: string) => {
      try {
          const data = await AdminService.getFeatures(toolId);
          setFeatures(data.features || []);
      } catch (error) {
          console.error("Failed to fetch features", error);
      }
  };

  const handleFeatureSave = async () => {
    if (!selectedToolForFeatures) return;
    try {
        if (editingFeature) {
            await AdminService.updateFeature(editingFeature.id, featureFormData);
        } else {
            await AdminService.createFeature({
                ...featureFormData,
                tool_id: selectedToolForFeatures.id
            });
        }
        setEditingFeature(null);
        setFeatureFormData({ name: "", slug: "", description: "" });
        refreshFeatures(selectedToolForFeatures.id);
        toast.success(editingFeature ? "Feature updated" : "Feature added");
    } catch (error) {
        console.error("Failed to save feature", error);
        toast.error("Failed to save feature.");
    }
  };

  const handleEditFeature = (feature: Feature) => {
      setEditingFeature(feature);
      setFeatureFormData({
          name: feature.name,
          slug: feature.slug,

          description: feature.description || ""
      });
  };

  const handleDeleteFeature = async (featureId: string) => {
      if (!selectedToolForFeatures) return;
      try {
          await AdminService.deleteFeature(featureId);
          refreshFeatures(selectedToolForFeatures.id);
          toast.success("Feature deleted");
      } catch (error) {
          console.error("Failed to delete feature", error);
          toast.error("Failed to delete feature.");
      }
  };

  const handleViewDetails = async (tool: Tool) => {
      setViewingTool(tool);
      setIsViewSheetOpen(true);
      try {
          const data = await AdminService.getFeatures(tool.id);
          setViewingFeatures(data.features || []);
      } catch (error) {
          console.error("Failed to fetch features for view", error);
          setViewingFeatures([]);
      }
  };

  // ==============================
  // Columns Definition
  // ==============================
  const columns: ColumnDef<Tool>[] = useMemo(() => [
      {
          accessorKey: "name",
          header: ({ column }) => <DataTableColumnHeader column={column} title="App Name" />,
          cell: ({ row }) => (
              <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex flex-col">
                      <span className="font-medium">{row.getValue("name")}</span>
                      <span className="text-xs text-muted-foreground">{row.original.slug}</span>
                  </div>
              </div>
          )
      },
      {
          accessorKey: "is_active",
          header: "Status",
          cell: ({ row }) => (
              <Badge variant={row.getValue("is_active") ? "default" : "secondary"}>
                  {row.getValue("is_active") ? "Active" : "Inactive"}
              </Badge>
          )
      },
      {
        accessorKey: "tool_link",
        header: "Link",
        cell: ({ row }) => {
            const link = row.getValue("tool_link") as string;
            return link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-4 truncate max-w-[150px] block" title={link}>
                    Link
                </a>
            ) : <span className="text-muted-foreground text-xs">-</span>;
        }
      },
      {
          accessorKey: "created_at",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
          cell: ({ row }) => new Date(row.getValue("created_at")).toLocaleDateString()
      },
      {
          id: "actions",
          cell: ({ row }) => {
              const tool = row.original;
              return (
                  <div className="flex justify-end gap-2">
                       <Button variant="ghost" size="sm" onClick={() => handleManageFeatures(tool)} title="Manage Features">
                           <Bolt className="h-4 w-4" />
                       </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(tool)} title="View Details">
                            <Eye className="h-4 w-4" />
                        </Button>
                       <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(tool)}>
                           <Pencil className="h-4 w-4" />
                       </Button>
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the app <strong>{tool.name}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(tool.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                       </AlertDialog>
                  </div>
              )
          }
      }
  ], [apps, pagination]);


  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4 justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage Apps</h1>
            <p className="text-muted-foreground mt-1">
              Create, update, and manage platform applications
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add App
          </Button>
        </div>

        <Card>
            <CardContent className="p-0">
                <DataTable 
                    columns={columns} 
                    data={apps} 
                    pageCount={Math.ceil(rowCount / pagination.pageSize)}
                    pagination={pagination}
                    onPaginationChange={setPagination}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    searchQuery={search}
                    onSearchChange={setSearch}
                    placeholder="Search apps..."
                    isLoading={isLoading}
                />
            </CardContent>
        </Card>

        {/* Create/Edit App Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingApp ? "Edit App" : "Create New App"}</DialogTitle>
                    <DialogDescription>
                    {editingApp ? "Update the app details" : "Add a new application to the platform"}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                    <Label htmlFor="name">App Name</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="Enter app name"
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        placeholder="app-slug"
                    />
                    <p className="text-xs text-muted-foreground">Unique identifier for URLs and DB lookups.</p>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="tool_link">Tool Link</Label>
                    <Input
                        id="tool_link"
                        value={formData.tool_link}
                        onChange={(e) => setFormData({ ...formData, tool_link: e.target.value })}
                        placeholder="https://example.com"
                    />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter app description"
                    />
                    </div>
                    <div className="flex items-center space-x-2">
                    <Switch
                        id="is_active"
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label htmlFor="is_active">Active</Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                    </Button>
                    <Button onClick={handleSave}>
                    {editingApp ? "Save Changes" : "Create App"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Feature Management Dialog */}
        <Dialog open={isFeatureDialogOpen} onOpenChange={setIsFeatureDialogOpen}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Manage Features for {selectedToolForFeatures?.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                    {/* List Features - Features table could be paginated too but keeping simple for now inside dialog */}
                    <div className="border rounded-md">
                            <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>

                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {features.map(f => (
                                    <TableRow key={f.id}>
                                        <TableCell className="font-medium">{f.name}</TableCell>
                                        <TableCell className="text-xs font-mono">{f.slug}</TableCell>

                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleEditFeature(f)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-destructive">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                      <AlertDialogDescription>
                                                        This will delete feature <strong>{f.name}</strong>.
                                                      </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                      <AlertDialogAction onClick={() => handleDeleteFeature(f.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                  </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {features.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No features found</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Add/Edit Feature Form */}
                    <div className="bg-muted/30 p-4 rounded-md border space-y-4">
                        <h3 className="font-semibold text-sm">{editingFeature ? "Edit Feature" : "Add New Feature"}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input 
                                    value={featureFormData.name} 
                                    onChange={e => {
                                        const name = e.target.value;
                                            if (!editingFeature) {
                                            setFeatureFormData(prev => ({ ...prev, name, slug: generateSlug(name) }));
                                        } else {
                                            setFeatureFormData(prev => ({ ...prev, name }));
                                        }
                                    }}
                                    placeholder="Feature Name" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Slug</Label>
                                <Input value={featureFormData.slug} onChange={e => setFeatureFormData({...featureFormData, slug: e.target.value})} placeholder="feature_slug" />
                            </div>

                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input value={featureFormData.description} onChange={e => setFeatureFormData({...featureFormData, description: e.target.value})} placeholder="Internal description" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            {editingFeature && <Button variant="ghost" onClick={() => {
                                setEditingFeature(null);
                                setFeatureFormData({ name: "", slug: "", description: "" });
                            }}>Cancel Edit</Button>}
                            <Button size="sm" onClick={handleFeatureSave}>{editingFeature ? "Update Feature" : "Add Feature"}</Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* View Details Sheet */}
        <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Tool Details</SheetTitle>
                    <SheetDescription>Detailed information about {viewingTool?.name}</SheetDescription>
                </SheetHeader>
                
                {viewingTool && (
                    <div className="space-y-6 py-6">
                        <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Package className="h-5 w-5" />
                                Basic Info
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground block">Name</span>
                                    <span className="font-medium">{viewingTool.name}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Slug</span>
                                    <span className="font-mono bg-muted px-2 py-0.5 rounded">{viewingTool.slug}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-muted-foreground block">Description</span>
                                    <span>{viewingTool.description || "No description provided."}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-muted-foreground block">Tool Link</span>
                                    {viewingTool.tool_link ? (
                                        <a href={viewingTool.tool_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4">
                                            {viewingTool.tool_link}
                                        </a>
                                    ) : (
                                        <span className="text-muted-foreground italic">No link provided</span>
                                    )}
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Status</span>
                                    <Badge variant={viewingTool.is_active ? "default" : "secondary"}>
                                        {viewingTool.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block">Created At</span>
                                    <span>{new Date(viewingTool.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                        </section>

                        <div className="h-px bg-border" />

                        <section className="space-y-3">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <Bolt className="h-5 w-5" />
                                Features
                            </h3>
                            {viewingFeatures.length > 0 ? (
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>

                                                <TableHead>Slug</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {viewingFeatures.map(f => (
                                                <TableRow key={f.id}>
                                                    <TableCell className="font-medium">{f.name}</TableCell>

                                                    <TableCell className="text-xs font-mono">{f.slug}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
                                    No features configured for this tool.
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </SheetContent>
        </Sheet>
      </div>
    </Layout>
  );
}
