import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plug,
  Plus,
  Check,
  AlertCircle,
  Store,
  Building2,
  BarChart3,
  Trash2,
  Link2Off,
  Loader2,
  MessageSquare,
  Globe,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  getIntegrationAccounts,
  createIntegrationAccount,
  deleteIntegrationAccount,
  connectIntegrationAccount,
  disconnectIntegrationAccount,
  getGlobalIntegrations,
  connectGlobalIntegration,
  disconnectGlobalIntegration,
  type IntegrationAccount,
  type GlobalIntegration,
} from "@/services/integration.service";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REGIONS = [
  { id: "us", name: "United States", flag: "🇺🇸" },
  { id: "ca", name: "Canada", flag: "🇨🇦" },
  { id: "mx", name: "Mexico", flag: "🇲🇽" },
  { id: "uk", name: "United Kingdom", flag: "🇬🇧" },
  { id: "de", name: "Germany", flag: "🇩🇪" },
  { id: "fr", name: "France", flag: "🇫🇷" },
  { id: "it", name: "Italy", flag: "🇮🇹" },
  { id: "es", name: "Spain", flag: "🇪🇸" },
];

const INTEGRATION_TYPES = [
  {
    value: "sp_api_sc",
    label: "Seller Central",
    description: "SP-API Seller Central",
    icon: Store,
    color: "text-orange-600 bg-orange-50",
  },
  {
    value: "sp_api_vc",
    label: "Vendor Central",
    description: "SP-API Vendor Central",
    icon: Building2,
    color: "text-orange-600 bg-orange-50",
  },
  {
    value: "ads_api",
    label: "Advertising API",
    description: "Advertising / PPC",
    icon: BarChart3,
    color: "text-orange-600 bg-orange-50",
  },
];

const GLOBAL_SERVICES = [
  {
    key: "slack",
    name: "Slack",
    description: "Get notifications and alerts directly in your Slack workspace.",
    icon: MessageSquare,
    color: "text-green-600 bg-green-50",
  },
];

const getRegion = (id: string) => REGIONS.find((r) => r.id === id);
const getIntegrationType = (id: string) => INTEGRATION_TYPES.find((t) => t.value === id);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Integrations() {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id || "";

  // Account-level state
  const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

  // Global state
  const [globalIntegrations, setGlobalIntegrations] = useState<GlobalIntegration[]>([]);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);

  // Add Account Dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  /* ------------- Data fetching ------------- */

  const fetchAccounts = useCallback(async () => {
    if (!orgId) return;
    try {
      setIsLoadingAccounts(true);
      const data = await getIntegrationAccounts(orgId);
      setAccounts(data);
    } catch {
      toast.error("Failed to load integration accounts");
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [orgId]);

  const fetchGlobal = useCallback(async () => {
    if (!orgId) return;
    try {
      setIsLoadingGlobal(true);
      const data = await getGlobalIntegrations(orgId);
      setGlobalIntegrations(data);
    } catch {
      toast.error("Failed to load global integrations");
    } finally {
      setIsLoadingGlobal(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchAccounts();
    fetchGlobal();
  }, [fetchAccounts, fetchGlobal]);

  /* ------------- OAuth popup simulation ------------- */

  const simulateOAuth = (typeName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        "",
        "Connect Integration",
        `width=${width},height=${height},top=${top},left=${left}`
      );

      if (popup) {
        popup.document.write(`
          <html>
          <head>
            <title>Connecting...</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb; color: #111; margin: 0; }
              .loader { border: 4px solid #f3f3f3; border-top: 4px solid #ff9900; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="loader"></div>
            <h2>Connecting to ${typeName}...</h2>
            <p>Please wait while we verify your credentials.</p>
          </body>
          </html>
        `);

        setTimeout(() => {
          if (!popup.closed) popup.close();
          resolve(true);
        }, 2500);
      } else {
        toast.error("Please allow popups to connect integrations.");
        resolve(false);
      }
    });
  };

  /* ------------- Account-level handlers ------------- */

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      toast.error("Please enter an account name");
      return;
    }
    if (!newRegion) {
      toast.error("Please select a region");
      return;
    }
    if (selectedTypes.size === 0) {
      toast.error("Please select at least one integration type");
      return;
    }

    setIsCreating(true);

    try {
      // Create an account row for each selected type
      const createdAccounts: IntegrationAccount[] = [];

      for (const type of selectedTypes) {
        const account = await createIntegrationAccount(orgId, {
          account_name: newAccountName.trim(),
          marketplace: 'amazon',
          region: newRegion,
          integration_type: type,
        });
        createdAccounts.push(account);
      }

      // Now open OAuth popups sequentially for each type
      for (const account of createdAccounts) {
        const typeInfo = getIntegrationType(account.integration_type);
        const success = await simulateOAuth(typeInfo?.label || account.integration_type);

        if (success) {
          await connectIntegrationAccount(orgId, account.id, {
            simulated: true,
            connected_via: "oauth_popup",
          });
        }
      }

      toast.success("Integration account(s) created and connected!");
      resetDialog();
      fetchAccounts();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Failed to create integration account");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    setActionLoading(id);
    try {
      await deleteIntegrationAccount(orgId, id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Integration account removed");
    } catch {
      toast.error("Failed to delete integration account");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectAccount = async (id: string) => {
    setActionLoading(`disconnect-${id}`);
    try {
      const updated = await disconnectIntegrationAccount(orgId, id);
      setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      toast.success("Integration disconnected");
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconnectAccount = async (account: IntegrationAccount) => {
    setActionLoading(`reconnect-${account.id}`);
    try {
      const typeInfo = getIntegrationType(account.integration_type);
      const success = await simulateOAuth(typeInfo?.label || account.integration_type);

      if (success) {
        const updated = await connectIntegrationAccount(orgId, account.id, {
          simulated: true,
          connected_via: "oauth_popup",
        });
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? updated : a)));
        toast.success("Integration reconnected!");
      }
    } catch {
      toast.error("Failed to reconnect");
    } finally {
      setActionLoading(null);
    }
  };

  /* ------------- Global handlers ------------- */

  const handleConnectGlobal = async (serviceName: string) => {
    setActionLoading(`global-${serviceName}`);
    try {
      const success = await simulateOAuth(serviceName);
      if (success) {
        const integration = await connectGlobalIntegration(orgId, {
          service_name: serviceName,
          credentials: { simulated: true },
        });
        setGlobalIntegrations((prev) => {
          const existing = prev.find((g) => g.service_name === serviceName);
          if (existing) {
            return prev.map((g) => (g.service_name === serviceName ? integration : g));
          }
          return [...prev, integration];
        });
        toast.success(`${serviceName} connected!`);
      }
    } catch {
      toast.error(`Failed to connect ${serviceName}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnectGlobal = async (integration: GlobalIntegration) => {
    setActionLoading(`global-disconnect-${integration.id}`);
    try {
      await disconnectGlobalIntegration(orgId, integration.id);
      setGlobalIntegrations((prev) =>
        prev.map((g) => (g.id === integration.id ? { ...g, status: "disconnected" as const, connected_at: null } : g))
      );
      toast.success(`${integration.service_name} disconnected`);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setActionLoading(null);
    }
  };

  /* ------------- Dialog helpers ------------- */

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const resetDialog = () => {
    setIsAddDialogOpen(false);
    setNewAccountName("");
    setNewRegion("");
    setSelectedTypes(new Set());
  };

  /* ------------- Status badges ------------- */

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <Check className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">Disconnected</Badge>;
    }
  };

  /* ------------- Group accounts by name ------------- */

  const groupedAccounts = accounts.reduce<Record<string, IntegrationAccount[]>>((groups, acc) => {
    const key = `${acc.account_name}__${acc.region}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(acc);
    return groups;
  }, {});

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground mt-2">
            Manage your connected services and integration accounts
          </p>
        </div>

        <Tabs defaultValue="account-level" className="space-y-6">
          <TabsList>
            <TabsTrigger value="account-level">
              <Store className="h-4 w-4 mr-2" />
              Account Level Integrations
            </TabsTrigger>
            <TabsTrigger value="global">
              <Globe className="h-4 w-4 mr-2" />
              Global Integrations
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: Account Level ============ */}
          <TabsContent value="account-level" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Marketplace Integration Accounts</h2>
                <p className="text-sm text-muted-foreground">
                  Connect and manage your Seller Central, Vendor Central, and Advertising accounts.
                </p>
              </div>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </div>

            {isLoadingAccounts ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : Object.keys(groupedAccounts).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Plug className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">No integration accounts yet</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                    Add your first marketplace account to start syncing orders, inventory, and advertising data.
                  </p>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Integration Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(groupedAccounts).map(([, groupAccounts]) =>
                      groupAccounts.map((account, idx) => {
                        const region = getRegion(account.region);
                        const typeInfo = getIntegrationType(account.integration_type);

                        return (
                          <TableRow key={account.id}>
                            {idx === 0 && (
                              <>
                                <TableCell
                                  className="font-medium"
                                  rowSpan={groupAccounts.length}
                                >
                                  {account.account_name}
                                </TableCell>
                                <TableCell rowSpan={groupAccounts.length}>
                                  <Badge variant="outline" className="capitalize">
                                    {account.marketplace || 'amazon'}
                                  </Badge>
                                </TableCell>
                                <TableCell rowSpan={groupAccounts.length}>
                                  <span className="flex items-center gap-2">
                                    <span className="text-lg">{region?.flag || "🌍"}</span>
                                    <span>{region?.name || account.region}</span>
                                  </span>
                                </TableCell>
                              </>
                            )}
                            <TableCell>
                              {typeInfo && (
                                <Badge variant="outline" className="gap-1.5">
                                  <typeInfo.icon className="h-3 w-3" />
                                  {typeInfo.label}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(account.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {account.status === "connected" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDisconnectAccount(account.id)}
                                    disabled={actionLoading === `disconnect-${account.id}`}
                                  >
                                    {actionLoading === `disconnect-${account.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Link2Off className="h-4 w-4" />
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReconnectAccount(account)}
                                    disabled={actionLoading === `reconnect-${account.id}`}
                                  >
                                    {actionLoading === `reconnect-${account.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plug className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteAccount(account.id)}
                                  disabled={actionLoading === account.id}
                                >
                                  {actionLoading === account.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          {/* ============ TAB 2: Global Integrations ============ */}
          <TabsContent value="global" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Global Integrations</h2>
              <p className="text-sm text-muted-foreground">
                Connect third-party services that work across your organization.
              </p>
            </div>

            {isLoadingGlobal ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {GLOBAL_SERVICES.map((service) => {
                  const existing = globalIntegrations.find(
                    (g) => g.service_name === service.key
                  );
                  const isConnected = existing?.status === "connected";
                  const isLoading =
                    actionLoading === `global-${service.key}` ||
                    actionLoading === `global-disconnect-${existing?.id}`;

                  return (
                    <Card key={service.key} className="flex flex-col">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div
                            className={`flex h-12 w-12 items-center justify-center rounded-lg ${service.color}`}
                          >
                            <service.icon className="h-6 w-6" />
                          </div>
                          {isConnected ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Not Connected</Badge>
                          )}
                        </div>
                        <CardTitle className="mt-4">{service.name}</CardTitle>
                        <CardDescription>{service.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col justify-end">
                        {isConnected && existing ? (
                          <Button
                            variant="outline"
                            className="w-full text-destructive hover:text-destructive"
                            onClick={() => handleDisconnectGlobal(existing)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Link2Off className="h-4 w-4 mr-2" />
                            )}
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleConnectGlobal(service.key)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Plug className="h-4 w-4 mr-2" />
                            )}
                            Connect
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ============ Add Account Dialog ============ */}
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => !open && resetDialog()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Integration Account</DialogTitle>
              <DialogDescription>
                Connect a new marketplace account to your organization. You can select
                multiple integration types.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Account Name */}
              <div className="space-y-2">
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  placeholder='e.g. "US Main Account"'
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
              </div>

              {/* Region */}
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={newRegion} onValueChange={setNewRegion}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a region..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="mr-2 text-lg">{r.flag}</span>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Integration Type Cards */}
              <div className="space-y-2">
                <Label>Integration Types</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Select one or more integration types to connect.
                </p>
                <div className="grid gap-3">
                  {INTEGRATION_TYPES.map((type) => {
                    const isSelected = selectedTypes.has(type.value);
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => toggleType(type.value)}
                        className={`flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                          }`}
                      >
                        <div
                          className={`p-2.5 rounded-lg shrink-0 ${type.color}`}
                        >
                          <type.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{type.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {type.description}
                          </div>
                        </div>
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                            }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={resetDialog} disabled={isCreating}>
                Cancel
              </Button>
              <Button
                onClick={handleAddAccount}
                disabled={
                  isCreating ||
                  !newAccountName.trim() ||
                  !newRegion ||
                  selectedTypes.size === 0
                }
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plug className="h-4 w-4 mr-2" />
                    Connect Account
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
