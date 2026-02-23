import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MoreHorizontal, Trash2, Building2, Pencil, Eye, Users, Crown, User } from "lucide-react";
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { API_URL } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Organization {
  id: string;
  name: string;
  slug: string;
  website: string;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  memberCount: number;
}

interface OrgMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  joined_at: string;
}

interface OrganizationDetails {
  organization: {
    id: string;
    name: string;
    slug: string;
    website: string;
    status: string;
    created_at: string;
  };
  owner: {
    id: string;
    email: string;
    full_name: string;
  } | null;
  members: OrgMember[];
  memberCount: number;
  membersPagination: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    hasMore: boolean;
  };
}

export default function AdminOrganizations() {
  const [data, setData] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit Dialog State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [orgToEdit, setOrgToEdit] = useState<Organization | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    slug: "",
    website: "",
    status: "active" as "active" | "suspended" | "archived"
  });

  // Details Sheet State
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [orgDetails, setOrgDetails] = useState<OrganizationDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const page = pagination.pageIndex + 1;
      const limit = pagination.pageSize;
      const sortField = sorting.length > 0 ? sorting[0].id : "created_at";
      const sortOrder = sorting.length > 0 && sorting[0].desc ? "desc" : "asc";

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_by: sortField,
        sort_dir: sortOrder,
      });

      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }

      const response = await fetch(`${API_URL}/admin/organizations?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const result = await response.json();
      setData(result.organizations);
      setPageCount(result.meta.totalPages);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      toast.error("Failed to fetch organizations");
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, debouncedSearch]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleDeleteClick = (org: Organization) => {
    setOrgToDelete(org);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!orgToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/admin/organizations/${orgToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success("Organization deleted successfully");
        fetchOrganizations();
      } else {
        toast.error("Failed to delete organization");
      }
    } catch (error) {
      console.error("Error deleting organization", error);
      toast.error("An error occurred while deleting");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
    }
  };

  const handleEditClick = (org: Organization) => {
    setOrgToEdit(org);
    setEditFormData({
      name: org.name,
      slug: org.slug,
      website: org.website || "",
      status: org.status
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!orgToEdit) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/admin/organizations/${orgToEdit.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editFormData),
        credentials: 'include'
      });

      if (response.ok) {
        toast.success("Organization updated successfully");
        fetchOrganizations();
        setEditDialogOpen(false);
        setOrgToEdit(null);
      } else {
        // Handle error (e.g., slug conflict)
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update organization");
      }
    } catch (error) {
      console.error("Error updating organization", error);
      toast.error("An error occurred while updating");
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewDetails = async (org: Organization) => {
    setDetailsSheetOpen(true);
    setLoadingDetails(true);
    setOrgDetails(null);
    setSelectedOrgId(org.id);

    try {
      const response = await fetch(`${API_URL}/admin/organizations/${org.id}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setOrgDetails(data);
      } else {
        toast.error("Failed to fetch organization details");
        setDetailsSheetOpen(false);
      }
    } catch (error) {
      console.error("Error fetching organization details", error);
      toast.error("An error occurred while fetching details");
      setDetailsSheetOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadMoreMembers = async () => {
    if (!orgDetails || !selectedOrgId || loadingMoreMembers || !orgDetails.membersPagination.hasMore) return;

    setLoadingMoreMembers(true);
    try {
      const nextPage = orgDetails.membersPagination.currentPage + 1;
      const response = await fetch(
        `${API_URL}/admin/organizations/${selectedOrgId}?membersPage=${nextPage}`,
        {
          method: 'GET',
          credentials: 'include'
        }
      );

      if (response.ok) {
        const data: OrganizationDetails = await response.json();
        // Append new members to existing list
        setOrgDetails(prev => prev ? {
          ...prev,
          members: [...prev.members, ...data.members],
          membersPagination: data.membersPagination
        } : null);
      } else {
        toast.error("Failed to load more members");
      }
    } catch (error) {
      console.error("Error loading more members", error);
      toast.error("An error occurred while loading members");
    } finally {
      setLoadingMoreMembers(false);
    }
  };

  const columns: ColumnDef<Organization>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Organization" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/50">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.original.name}</p>
            <p className="text-sm text-muted-foreground">{row.original.slug}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "website",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Website" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.website ? (
            <a href={row.original.website.startsWith('http') ? row.original.website : `https://${row.original.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary">
              {row.original.website}
            </a>
          ) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: () => <DataTableStaticHeader title="Status" />,
      cell: ({ row }) => {
        const status = row.original.status;
        let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
        if (status === 'active') variant = "default"; // Or success-like if available, default is usually primary
        // Using outline for suspended for now, or maybe destructive for archived
        if (status === 'suspended') variant = "destructive";

        return <Badge variant={variant} className="capitalize">{status}</Badge>;
      }
    },
    {
      accessorKey: "memberCount",
      header: () => <DataTableStaticHeader title="Members" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{row.original.memberCount}</span>
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <DataTableStaticHeader title="Actions" srOnly />,
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleViewDetails(org)} className="cursor-pointer">
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEditClick(org)} className="cursor-pointer">
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDeleteClick(org)}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Org
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Manage Organizations</h1>
            <p className="text-muted-foreground text-sm">
              View and manage all customer organizations
            </p>
          </div>
        </div>

        {/* Data Table Card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
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
            placeholder="Search by name, slug, or website..."
            isLoading={loading}
          />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{orgToDelete?.name}</span>?
              This will permanently remove the organization and could affect all associated users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details. Slug must be unique.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slug" className="text-right">
                Slug
              </Label>
              <Input
                id="slug"
                value={editFormData.slug}
                onChange={(e) => setEditFormData({ ...editFormData, slug: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="website" className="text-right">
                Website
              </Label>
              <Input
                id="website"
                value={editFormData.website}
                onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select
                value={editFormData.status}
                onValueChange={(value: "active" | "suspended" | "archived") =>
                  setEditFormData({ ...editFormData, status: value })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Organization Details Sheet */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {loadingDetails ? "Loading..." : orgDetails?.organization.name || "Organization Details"}
            </SheetTitle>
            <SheetDescription>
              {orgDetails?.organization.slug || "View organization information and members"}
            </SheetDescription>
          </SheetHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : orgDetails ? (
            <div className="mt-6 space-y-6">
              {/* Organization Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Organization Info</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={orgDetails.organization.status === 'active' ? 'default' : 'destructive'} className="capitalize">
                      {orgDetails.organization.status}
                    </Badge>
                  </div>
                  {orgDetails.organization.website && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Website</span>
                      <a
                        href={orgDetails.organization.website.startsWith('http') ? orgDetails.organization.website : `https://${orgDetails.organization.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {orgDetails.organization.website}
                      </a>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{new Date(orgDetails.organization.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Owner Section */}
              {orgDetails.owner && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" />
                    Owner
                  </h4>
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{orgDetails.owner.full_name || "No name"}</p>
                      <p className="text-sm text-muted-foreground">{orgDetails.owner.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Members Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Members ({orgDetails.members.length} of {orgDetails.memberCount})
                </h4>
                <div className="space-y-2">
                  {orgDetails.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{member.full_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <Badge variant={member.role === 'Owner' ? 'default' : 'secondary'} className="text-xs">
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
                {orgDetails.membersPagination.hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={loadMoreMembers}
                    disabled={loadingMoreMembers}
                  >
                    {loadingMoreMembers ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                        Loading...
                      </>
                    ) : (
                      `Load More (${orgDetails.memberCount - orgDetails.members.length} remaining)`
                    )}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

    </>
  );
}
