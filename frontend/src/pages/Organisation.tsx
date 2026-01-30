import { useState, useEffect } from "react";
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
import { Building2, Users, Mail, UserPlus, Trash2, Shield, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";

interface Member {
  id: string; // This is OrganizationMember ID, not User ID
  user_id: string;
  role: { id: number; name: string };
  user: { full_name: string; email: string };
  is_active: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: { id: number; name: string };
  status: string;
}

export default function Organisation() {
  const { user } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("2"); // Default to Member role ID (assuming 2)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState("");

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Data
  const fetchData = async () => {
    try {
      const [membersRes, invitesRes, orgRes] = await Promise.all([
        fetch(`${API_URL}/organizations/members`, { credentials: 'include' }),
        fetch(`${API_URL}/invitations`, { credentials: 'include' }),
        fetch(`${API_URL}/organizations/me`, { credentials: 'include' })
      ]);

      if (membersRes.ok) setMembers(await membersRes.json());
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveOrgDetails = async () => {
    try {
        const res = await fetch(`${API_URL}/organizations`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: orgName, website: orgWebsite })
        });
        
        if (res.ok) {
            toast.success("Organization details updated");
        } else {
            throw new Error();
        }
    } catch (e) {
        toast.error("Failed to update details");
    }
  };

  const handleInviteMember = async () => {
    try {
        const res = await fetch(`${API_URL}/invitations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        fetchData(); // Refresh list
    } catch (e: any) {
        toast.error(e.message);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
        const res = await fetch(`${API_URL}/invitations/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (res.ok) {
            toast.success("Invitation revoked");
            fetchData();
        }
    } catch (e) {
        toast.error("Failed to revoke invitation");
    }
  };

  const canEditOrg = currentUserRole === "Owner";
  const canInvite = currentUserRole === "Owner" || currentUserRole === "Admin";

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
              Update your organization's profile information
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

        {/* Team Members */}
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
                          {/* Note: Role IDs hardcoded for now, ideally fetch Roles API */}
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
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Active Members */}
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
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
                          <p className="font-medium">{member.user.full_name}</p>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={member.role.name === "Owner" ? "default" : "secondary"}
                        className="gap-1"
                      >
                        {member.role.name === "Owner" && <Shield className="h-3 w-3" />}
                        {member.role.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="default"
                        className="bg-green-500/10 text-green-600 border-green-500/20"
                      >
                        Active
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                       {/* Actions like remove member could go here */}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Pending Invitations */}
                {invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                            <Clock className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Pending Invitation</p>
                          <p className="text-sm text-muted-foreground">{invite.email}</p>
                        </div>
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

                {members.length === 0 && invitations.length === 0 && !loading && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No members found
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
