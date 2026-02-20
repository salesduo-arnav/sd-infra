import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  getRBACRoles,
  getRBACPermissions,
  updateRolePermissions,
  RBACRole,
  RBACPermission,
} from "@/services/admin.service";

export default function AdminRBAC() {
  const [roles, setRoles] = useState<RBACRole[]>([]);
  const [permissions, setPermissions] = useState<RBACPermission[]>([]);
  const [grouped, setGrouped] = useState<Record<string, RBACPermission[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  // Track permission changes per role: roleId -> Set of permissionIds
  const [rolePermMap, setRolePermMap] = useState<Record<number, Set<string>>>({});
  // Track which roles have pending changes
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([getRBACRoles(), getRBACPermissions()]);
      setRoles(rolesRes.roles);
      setPermissions(permsRes.permissions);
      setGrouped(permsRes.grouped);

      // Initialize the permission map from current role data
      const map: Record<number, Set<string>> = {};
      rolesRes.roles.forEach((role: RBACRole) => {
        map[role.id] = new Set(role.permissions.map((p: RBACPermission) => p.id));
      });
      setRolePermMap(map);
      setDirty(new Set());
    } catch {
      toast.error("Failed to load RBAC data");
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (roleId: number, permId: string) => {
    setRolePermMap((prev) => {
      const newMap = { ...prev };
      const newSet = new Set(newMap[roleId]);
      if (newSet.has(permId)) {
        newSet.delete(permId);
      } else {
        newSet.add(permId);
      }
      newMap[roleId] = newSet;
      return newMap;
    });
    setDirty((prev) => new Set(prev).add(roleId));
  };

  const handleSave = async (roleId: number) => {
    setSaving(roleId);
    try {
      const permIds = Array.from(rolePermMap[roleId] || []);
      await updateRolePermissions(roleId, permIds);
      toast.success("Role permissions updated successfully");
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(roleId);
        return next;
      });
      // Refresh to get latest data
      await fetchData();
    } catch {
      toast.error("Failed to update role permissions");
    } finally {
      setSaving(null);
    }
  };



  if (loading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold">Role Permissions</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          Configure which permissions each role has.
        </p>

        <div className="space-y-6">
          {roles.map((role) => (
            <Card key={role.id} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-xl">{role.name}</CardTitle>
                  </div>
                  <Button
                    onClick={() => handleSave(role.id)}
                      disabled={saving === role.id || !dirty.has(role.id)}
                      size="sm"
                      className="gap-2"
                    >
                      {saving === role.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Changes
                  </Button>
                </div>
                {role.description && (
                  <CardDescription>{role.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-6">
                  {Object.entries(grouped).map(([category, perms]) => (
                    <div key={category}>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        {category}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {perms.map((perm) => {
                          const checked = rolePermMap[role.id]?.has(perm.id) || false;

                          return (
                            <label
                              key={perm.id}
                              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                checked
                                  ? "border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10"
                                  : "cursor-pointer hover:bg-accent"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  togglePermission(role.id, perm.id)
                                }
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-none mb-1">
                                  {perm.id}
                                </p>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {perm.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
