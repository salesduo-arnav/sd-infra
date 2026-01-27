import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Package, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface App {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "beta";
  category: string;
  usersCount: number;
  createdAt: string;
}

const mockApps: App[] = [
  {
    id: "1",
    name: "Listing Content Generator",
    description: "AI-powered product listing creation",
    status: "active",
    category: "Content",
    usersCount: 1234,
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    name: "Image Editor & Optimizer",
    description: "Edit and optimize product images",
    status: "active",
    category: "Media",
    usersCount: 987,
    createdAt: "2024-02-01",
  },
  {
    id: "3",
    name: "Analytics Dashboard",
    description: "Sales and performance analytics",
    status: "beta",
    category: "Analytics",
    usersCount: 456,
    createdAt: "2024-03-10",
  },
  {
    id: "4",
    name: "Inventory Manager",
    description: "FBA/FBM inventory management",
    status: "inactive",
    category: "Operations",
    usersCount: 0,
    createdAt: "2024-04-01",
  },
];

export default function AdminApps() {
  const [apps, setApps] = useState<App[]>(mockApps);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    status: "active" as App["status"],
  });

  const handleOpenDialog = (app?: App) => {
    if (app) {
      setEditingApp(app);
      setFormData({
        name: app.name,
        description: app.description,
        category: app.category,
        status: app.status,
      });
    } else {
      setEditingApp(null);
      setFormData({ name: "", description: "", category: "", status: "active" });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (editingApp) {
      setApps(
        apps.map((app) =>
          app.id === editingApp.id
            ? { ...app, ...formData }
            : app
        )
      );
    } else {
      setApps([
        ...apps,
        {
          id: Date.now().toString(),
          ...formData,
          usersCount: 0,
          createdAt: new Date().toISOString().split("T")[0],
        },
      ]);
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setApps(apps.filter((app) => app.id !== id));
  };

  const getStatusBadge = (status: App["status"]) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600">Active</Badge>;
      case "beta":
        return <Badge className="bg-blue-500/10 text-blue-600">Beta</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">Manage Apps</h1>
            <p className="text-muted-foreground mt-1">
              Create, update, and manage platform applications
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add App
              </Button>
            </DialogTrigger>
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
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter app name"
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
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Content">Content</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Analytics">Analytics</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as App["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="beta">Beta</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
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
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{app.name}</p>
                          <p className="text-sm text-muted-foreground">{app.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{app.category}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell>{app.usersCount.toLocaleString()}</TableCell>
                    <TableCell>{app.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(app)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(app.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
