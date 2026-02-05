import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DataTable, DataTableColumnHeader, DataTableStaticHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { Building2, Users, Mail, UserPlus, Trash2, Shield, Clock, MoreHorizontal, Eye, UserCog, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Member {
  id: string; // This is OrganizationMember ID, not User ID
  user_id: string;
  role: { id: number; name: string };
  user: { full_name: string; email: string };
  is_active: boolean;
  joined_at?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: { id: number; name: string };
  status: string;
}

export default function Organisation() {
  const { user, activeOrganization, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("2"); // Default to Member role ID (assuming 2)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("");

  // Members DataTable state
  const [members, setMembers] = useState<Member[]>([]);
  const [pageCount, setPageCount] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [membersLoading, setMembersLoading] = useState(true);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Member details sheet state
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Remove member alert dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Change role dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [memberToChangeRole, setMemberToChangeRole] = useState<Member | null>(null);
  const [newRoleId, setNewRoleId] = useState("");
  const [isChangingRole, setIsChangingRole] = useState(false);

  // Transfer ownership dialog state
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  // Delete organization alert dialog state
  const [deleteOrgDialogOpen, setDeleteOrgDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch org details and invitations
  const fetchOrgData = useCallback(async () => {
    if (!activeOrganization) return;
    setLoading(true);
    try {
      const headers = { 'x-organization-id': activeOrganization.id };
      const [invitesRes, orgRes] = await Promise.all([
        fetch(`${API_URL}/invitations`, { credentials: 'include', headers }),
        fetch(`${API_URL}/organizations/me`, { credentials: 'include', headers })
      ]);

      if (invitesRes.ok) setInvitations(await invitesRes.json());
      if (orgRes.ok) {
        const data = await orgRes.json();
        if (data.organization) {
          setOrgName(data.organization.name);
          setOrgWebsite(data.organization.website || "");
        }
        if (data.role) {
          setCurrentUserRole(data.role.name);
        }
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
      toast.error("Failed to load organization data");
    } finally {
      setLoading(false);
    }
  }, [activeOrganization]);

  // Fetch members with pagination/search/sorting
  const fetchMembers = useCallback(async () => {
    if (!activeOrganization) return;
    setMembersLoading(true);
    try {
      const page = pagination.pageIndex + 1;
      const limit = pagination.pageSize;
      const sortField = sorting.length > 0 ? sorting[0].id : "joined_at";
      const sortOrder = sorting.length > 0 && sorting[0].desc ? "desc" : "asc";

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy: sortField,
        sortOrder: sortOrder,
      });

      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }

      const res = await fetch(`${API_URL}/organizations/members?${params.toString()}`, {
        credentials: 'include',
        headers: { 'x-organization-id': activeOrganization.id }
      });

      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
        setPageCount(data.meta.totalPages);
      }
    } catch (error) {
      console.error("Failed to fetch members", error);
      toast.error("Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [activeOrganization, pagination, sorting, debouncedSearch]);

  useEffect(() => {
    fetchOrgData();
  }, [fetchOrgData]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSaveOrgDetails = async () => {
    if (!activeOrganization) return;
    try {
      const res = await fetch(`${API_URL}/organizations`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': activeOrganization.id
        },
        credentials: 'include',
        body: JSON.stringify({ name: orgName, website: orgWebsite })
      });

      if (res.ok) {
        toast.success("Organization details updated");
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Failed to update details");
    }
  };

  const handleInviteMember = async () => {
    if (!activeOrganization) return;
    try {
      const res = await fetch(`${API_URL}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': activeOrganization.id
        },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, role_id: parseInt(inviteRole) })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to invite");
      }

      toast.success("Invitation sent");
      setInviteEmail("");
      setInviteRole("2");
      setIsInviteDialogOpen(false);
      fetchOrgData();
    } catch (e) {
      if (e instanceof Error) {
        toast.error(e.message);
      } else {
        toast.error("Failed to invite member");
      }
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    if (!activeOrganization) return;
    try {
      const res = await fetch(`${API_URL}/invitations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-organization-id': activeOrganization.id }
      });
      if (res.ok) {
        toast.success("Invitation revoked");
        fetchOrgData();
      }
    } catch {
      toast.error("Failed to revoke invitation");
    }
  };

  // View member details
  const handleViewDetails = (member: Member) => {
    setSelectedMember(member);
    setDetailsSheetOpen(true);
  };

  // Remove member
  const handleRemoveClick = (member: Member) => {
    setMemberToRemove(member);
    setRemoveDialogOpen(true);
  };

  const handleRemoveConfirm = async () => {
    if (!activeOrganization || !memberToRemove) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`${API_URL}/organizations/members/${memberToRemove.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-organization-id': activeOrganization.id }
      });
      if (res.ok) {
        toast.success("Member removed successfully");
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setIsRemoving(false);
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
    }
  };

  // Change role
  const handleChangeRoleClick = (member: Member) => {
    setMemberToChangeRole(member);
    setNewRoleId(member.role.id.toString());
    setRoleDialogOpen(true);
  };

  const handleChangeRoleConfirm = async () => {
    if (!activeOrganization || !memberToChangeRole) return;
    setIsChangingRole(true);
    try {
      const res = await fetch(`${API_URL}/organizations/members/${memberToChangeRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': activeOrganization.id
        },
        credentials: 'include',
        body: JSON.stringify({ role_id: parseInt(newRoleId) })
      });
      if (res.ok) {
        toast.success("Member role updated");
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    } finally {
      setIsChangingRole(false);
      setRoleDialogOpen(false);
      setMemberToChangeRole(null);
    }
  };

  // Transfer ownership
  const handleTransferOwnership = async () => {
    if (!activeOrganization || !newOwnerId) return;
    setIsTransferring(true);
    try {
      const res = await fetch(`${API_URL}/organizations/transfer-ownership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': activeOrganization.id
        },
        credentials: 'include',
        body: JSON.stringify({ new_owner_id: newOwnerId })
      });
      if (res.ok) {
        toast.success("Ownership transferred successfully");
        await refreshUser();
        fetchOrgData();
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to transfer ownership");
      }
    } catch {
      toast.error("Failed to transfer ownership");
    } finally {
      setIsTransferring(false);
      setTransferDialogOpen(false);
      setNewOwnerId("");
    }
  };

  // Delete organization
  const handleDeleteOrganization = async () => {
    if (!activeOrganization) return;
    if (deleteConfirmText !== orgName) {
      toast.error("Please type the organization name to confirm");
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/organizations`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-organization-id': activeOrganization.id }
      });
      if (res.ok) {
        toast.success("Organization deleted successfully");
        await refreshUser();
        navigate('/apps');
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to delete organization");
      }
    } catch {
      toast.error("Failed to delete organization");
    } finally {
      setIsDeleting(false);
      setDeleteOrgDialogOpen(false);
      setDeleteConfirmText("");
    }
  };

  const canEditOrg = currentUserRole === "Owner";
  const canInvite = currentUserRole === "Owner" || currentUserRole === "Admin";
  const canManageMembers = currentUserRole === "Owner" || currentUserRole === "Admin";
  const isOwner = currentUserRole === "Owner";

  // Get non-owner members for transfer ownership select
  const nonOwnerMembers = members.filter(m => m.role.name !== "Owner" && m.user_id !== user?.id);

  // DataTable columns for members
  const memberColumns: ColumnDef<Member>[] = [
    {
      accessorKey: "user.full_name",
      id: "full_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
      cell: ({ row }) => {
        const member = row.original;
        const isCurrentUser = member.user_id === user?.id;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {member.user.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">
                {member.user.full_name}
                {isCurrentUser && <span className="text-muted-foreground text-xs ml-1">(you)</span>}
              </p>
              <p className="text-sm text-muted-foreground">{member.user.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "role.name",
      id: "role",
      header: () => <DataTableStaticHeader title="Role" />,
      cell: ({ row }) => {
        const member = row.original;
        return (
          <Badge
            variant={member.role.name === "Owner" ? "default" : "secondary"}
            className="gap-1"
          >
            {member.role.name === "Owner" && <Shield className="h-3 w-3" />}
            {member.role.name}
          </Badge>
        );
      },
    },
    {
      accessorKey: "is_active",
      header: () => <DataTableStaticHeader title="Status" />,
      cell: () => (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          Active
        </Badge>
      ),
    },
    {
      accessorKey: "joined_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => {
        const member = row.original;
        return member.joined_at ? (
          <span className="text-muted-foreground">
            {new Date(member.joined_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        ) : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      id: "actions",
      header: () => <DataTableStaticHeader title="Actions" srOnly />,
      cell: ({ row }) => {
        const member = row.original;
        const isCurrentUser = member.user_id === user?.id;
        const isMemberOwner = member.role.name === "Owner";
        const canRemove = canManageMembers && !isCurrentUser && !isMemberOwner;
        const canChangeRole = isOwner && !isMemberOwner;

        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleViewDetails(member)}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {canChangeRole && (
                  <DropdownMenuItem onClick={() => handleChangeRoleClick(member)}>
                    <UserCog className="h-4 w-4 mr-2" />
                    Change Role
                  </DropdownMenuItem>
                )}
                {canRemove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleRemoveClick(member)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organisation</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization settings and team members
          </p>
        </div>

        {/* Organization Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organisation Details
            </CardTitle>
            <CardDescription>
              {canEditOrg
                ? "Update your organization's profile information"
                : "View your organization's profile information"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organisation Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Enter organisation name"
                  disabled={!canEditOrg}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgWebsite">Website</Label>
                <Input
                  id="orgWebsite"
                  value={orgWebsite}
                  onChange={(e) => setOrgWebsite(e.target.value)}
                  placeholder="https://example.com"
                  disabled={!canEditOrg}
                />
              </div>
            </div>
            {canEditOrg && (
              <div className="flex justify-end">
                <Button onClick={handleSaveOrgDetails}>Save Changes</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Members with DataTable */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members
                </CardTitle>
                <CardDescription>
                  Manage who has access to your organization
                </CardDescription>
              </div>
              {canInvite && (
                <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Send an invitation to join your organization
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="inviteEmail">Email Address</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="colleague@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteRole">Role</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">Admin</SelectItem>
                            <SelectItem value="2">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleInviteMember}>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Invite
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* DataTable for Members */}
            <DataTable
              columns={memberColumns}
              data={members}
              pageCount={pageCount}
              pagination={pagination}
              onPaginationChange={setPagination}
              sorting={sorting}
              onSortingChange={setSorting}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              placeholder="Search members by name or email..."
              isLoading={membersLoading}
            />

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="border-t p-6">
                <h4 className="text-sm font-medium mb-3">Pending Invitations</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-orange-600" />
                            </div>
                            <span className="text-muted-foreground">{invite.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {invite.role?.name || 'Member'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                            {invite.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canInvite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeInvitation(invite.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone - Only visible to Owner */}
        {isOwner && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Transfer Ownership */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Transfer Ownership</h4>
                  <p className="text-sm text-muted-foreground">
                    Transfer this organization to another member
                  </p>
                </div>
                <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Transfer Ownership</DialogTitle>
                      <DialogDescription>
                        Select a member to transfer ownership to. You will become an Admin.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Label>New Owner</Label>
                      <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select a member" />
                        </SelectTrigger>
                        <SelectContent>
                          {nonOwnerMembers.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.user.full_name} ({m.user.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {nonOwnerMembers.length === 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          No other members available. Invite someone first.
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleTransferOwnership}
                        disabled={!newOwnerId || isTransferring}
                      >
                        {isTransferring ? "Transferring..." : "Transfer Ownership"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Delete Organization */}
              <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                <div>
                  <h4 className="font-medium text-destructive">Delete Organization</h4>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this organization and all its data
                  </p>
                </div>
                <AlertDialog open={deleteOrgDialogOpen} onOpenChange={setDeleteOrgDialogOpen}>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteOrgDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            This action <span className="font-bold text-destructive">cannot be undone</span>.
                            This will permanently delete the organization <span className="font-semibold">{orgName}</span> and all associated data including members and invitations.
                          </p>
                          <div className="space-y-2">
                            <Label>Type <span className="font-mono font-bold">{orgName}</span> to confirm:</Label>
                            <Input
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder={orgName}
                            />
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteOrganization();
                        }}
                        disabled={isDeleting || deleteConfirmText !== orgName}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Deleting..." : "Delete Organization"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Member Details Sheet */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Member Details</SheetTitle>
            <SheetDescription>
              View member information
            </SheetDescription>
          </SheetHeader>
          {selectedMember && (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {selectedMember.user.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{selectedMember.user.full_name}</h3>
                  <p className="text-muted-foreground">{selectedMember.user.email}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Role</span>
                  <Badge variant={selectedMember.role.name === "Owner" ? "default" : "secondary"}>
                    {selectedMember.role.name}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    Active
                  </Badge>
                </div>
                {selectedMember.joined_at && (
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Joined</span>
                    <span>
                      {new Date(selectedMember.joined_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Remove Member Alert Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">{memberToRemove?.user.full_name}</span> from the organization?
              They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemoveConfirm();
              }}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Update the role for {memberToChangeRole?.user.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Role</Label>
            <Select value={newRoleId} onValueChange={setNewRoleId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Admin</SelectItem>
                <SelectItem value="2">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangeRoleConfirm} disabled={isChangingRole}>
              {isChangingRole ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
