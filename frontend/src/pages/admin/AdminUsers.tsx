import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { MoreHorizontal, Mail, Trash2, Users } from "lucide-react";
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { API_URL } from "@/lib/api";
import { getInitials } from "@/lib/utils";

interface User {
  id: string;
  full_name: string;
  email: string;
  is_superuser: boolean;
  created_at: string;
  organizations?: { name: string }[];
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState<User[]>([]);
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
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [conflictOrgs, setConflictOrgs] = useState<{ id: string; name: string }[] | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!deleteDialogOpen) {
      setConflictOrgs(null);
      setIsDeleting(false);
    }
  }, [deleteDialogOpen]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchUsers = useCallback(async () => {
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

      const response = await fetch(`${API_URL}/admin/users?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const result = await response.json();
      setData(result.users);
      setPageCount(result.meta.totalPages);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (force: boolean = false) => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      const url = `${API_URL}/admin/users/${userToDelete.id}${force ? '?force=true' : ''}`;
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        fetchUsers();
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        setConflictOrgs(null);
      } else if (response.status === 409) {
        const result = await response.json();
        if (result.organizations) {
          setConflictOrgs(result.organizations);
        } else {
          console.error("409 response missing organizations", result);
        }
      }
    } catch (error) {
      console.error("Error deleting user", error);
    } finally {
      setIsDeleting(false);
    }
  };


  const handleSendEmail = (user: User) => {
    window.open(`mailto:${user.email}`);
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-muted">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-xs font-medium">
              {getInitials(row.original.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">{row.original.full_name || "N/A"}</p>
            <p className="text-sm text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "organizations",
      header: () => <DataTableStaticHeader title="Organization" />,
      cell: ({ row }) => {
        const orgs = row.original.organizations || [];
        return (
          <span className="text-muted-foreground">
            {orgs.length > 0 ? orgs.map(o => o.name).join(", ") : "—"}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "is_superuser",
      header: () => <DataTableStaticHeader title="Role" />,
      cell: ({ row }) => (
        row.original.is_superuser
          ? <Badge variant="secondary">Super Admin</Badge>
          : <Badge variant="outline">User</Badge>
      )
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
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
        const user = row.original;
        const isCurrentUser = currentUser?.id === user.id;
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-muted">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleSendEmail(user)} className="cursor-pointer">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => !isCurrentUser && handleDeleteClick(user)}
                  disabled={isCurrentUser}
                  className={isCurrentUser
                    ? "opacity-50 cursor-not-allowed"
                    : "text-destructive focus:text-destructive cursor-pointer"
                  }
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isCurrentUser ? "Delete (You)" : "Delete User"}
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
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Manage Users</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all user accounts across the platform
          </p>
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
            placeholder="Search users by name or email..."
            isLoading={loading}
          />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conflictOrgs ? "Warning: Organization Ownership" : "Delete User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {conflictOrgs ? (
                <div className="space-y-2">
                  <p className="text-destructive font-semibold">
                    This user is the sole owner of the following organizations:
                  </p>
                  <ul className="list-disc pl-5 text-sm text-foreground">
                    {conflictOrgs.map(org => (
                      <li key={org.id}>{org.name}</li>
                    ))}
                  </ul>
                  <p>
                    Deleting this user will also <span className="font-bold text-destructive">permanently delete these organizations</span> and all their data.
                  </p>
                  <p>Are you absolutely sure you want to proceed?</p>
                </div>
              ) : (
                <span>
                  Are you sure you want to delete <span className="font-medium text-foreground">{userToDelete?.full_name || userToDelete?.email}</span>?
                  This action cannot be undone and will permanently remove the user and all their data.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm(!!conflictOrgs);
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : (conflictOrgs ? "Confirm & Delete Everything" : "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
