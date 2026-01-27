import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, CreditCard, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: "monthly" | "yearly";
  features: string[];
  subscribersCount: number;
  isActive: boolean;
}

const mockPlans: Plan[] = [
  {
    id: "1",
    name: "Starter Bundle",
    description: "Perfect for new sellers",
    price: 29,
    interval: "monthly",
    features: ["Listing Generator", "Basic Analytics"],
    subscribersCount: 456,
    isActive: true,
  },
  {
    id: "2",
    name: "Professional Bundle",
    description: "For growing businesses",
    price: 79,
    interval: "monthly",
    features: ["All Starter features", "Image Editor", "Advanced Analytics"],
    subscribersCount: 289,
    isActive: true,
  },
  {
    id: "3",
    name: "Enterprise Bundle",
    description: "For large operations",
    price: 199,
    interval: "monthly",
    features: ["All Pro features", "API Access", "Priority Support"],
    subscribersCount: 67,
    isActive: true,
  },
];

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>(mockPlans);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    interval: "monthly" as Plan["interval"],
    features: "",
  });

  const handleOpenDialog = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        description: plan.description,
        price: plan.price,
        interval: plan.interval,
        features: plan.features.join("\n"),
      });
    } else {
      setEditingPlan(null);
      setFormData({ name: "", description: "", price: 0, interval: "monthly", features: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    const features = formData.features.split("\n").filter((f) => f.trim());
    if (editingPlan) {
      setPlans(
        plans.map((plan) =>
          plan.id === editingPlan.id
            ? { ...plan, ...formData, features }
            : plan
        )
      );
    } else {
      setPlans([
        ...plans,
        {
          id: Date.now().toString(),
          ...formData,
          features,
          subscribersCount: 0,
          isActive: true,
        },
      ]);
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setPlans(plans.filter((plan) => plan.id !== id));
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
            <h1 className="text-3xl font-bold tracking-tight">Manage Plans</h1>
            <p className="text-muted-foreground mt-1">
              Configure pricing plans and bundles
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Edit Plan" : "Create New Plan"}</DialogTitle>
                <DialogDescription>
                  {editingPlan ? "Update the plan details" : "Add a new pricing plan"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Plan Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter plan name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter plan description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interval">Billing Interval</Label>
                    <select
                      id="interval"
                      value={formData.interval}
                      onChange={(e) => setFormData({ ...formData, interval: e.target.value as Plan["interval"] })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="features">Features (one per line)</Label>
                  <Textarea
                    id="features"
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    placeholder="Enter features, one per line"
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  {editingPlan ? "Save Changes" : "Create Plan"}
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
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{plan.name}</p>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">${plan.price}</span>
                      <span className="text-muted-foreground">/{plan.interval}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {plan.features.slice(0, 2).map((feature, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                        {plan.features.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{plan.features.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{plan.subscribersCount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={plan.isActive ? "bg-green-500/10 text-green-600" : ""}>
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(plan)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(plan.id)}
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
