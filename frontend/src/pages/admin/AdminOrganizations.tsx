import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, ArrowLeft, Building2, Users, Ban, CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

interface Organization {
  id: string;
  name: string;
  owner: string;
  membersCount: number;
  plan: string;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
}

const mockOrganizations: Organization[] = [
  {
    id: "1",
    name: "Acme Sellers Inc.",
    owner: "john@example.com",
    membersCount: 12,
    plan: "Enterprise",
    status: "active",
    createdAt: "2024-01-15",
  },
  {
    id: "2",
    name: "Smith Co",
    owner: "jane@company.com",
    membersCount: 5,
    plan: "Professional",
    status: "active",
    createdAt: "2024-02-01",
  },
  {
    id: "3",
    name: "Startup Inc",
    owner: "mike@startup.io",
    membersCount: 3,
    plan: "Starter",
    status: "active",
    createdAt: "2024-03-10",
  },
  {
    id: "4",
    name: "Wilson Sellers",
    owner: "sarah@sellers.com",
    membersCount: 8,
    plan: "Professional",
    status: "suspended",
    createdAt: "2024-01-20",
  },
  {
    id: "5",
    name: "Brown LLC",
    owner: "tom@amazon-seller.com",
    membersCount: 2,
    plan: "Starter",
    status: "inactive",
    createdAt: "2024-04-01",
  },
];

export default function AdminOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>(mockOrganizations);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStatusChange = (orgId: string, newStatus: Organization["status"]) => {
    setOrganizations(
      organizations.map((org) =>
        org.id === orgId ? { ...org, status: newStatus } : org
      )
    );
  };

  const getStatusBadge = (status: Organization["status"]) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-600">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
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
            <h1 className="text-3xl font-bold tracking-tight">Manage Organizations</h1>
            <p className="text-muted-foreground mt-1">
              Oversee organization accounts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <p className="font-medium">{org.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.owner}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {org.membersCount}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{org.plan}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(org.status)}</TableCell>
                    <TableCell>{org.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Building2 className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {org.status !== "active" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(org.id, "active")}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          {org.status !== "suspended" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(org.id, "suspended")}
                              className="text-destructive focus:text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
