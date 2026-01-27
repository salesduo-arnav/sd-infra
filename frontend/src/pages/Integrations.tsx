import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plug,
  Check,
  AlertCircle,
  ShoppingCart,
  Key,
  Trash2,
} from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
  marketplace?: string;
}

const initialIntegrations: Integration[] = [
  {
    id: "sp-api",
    name: "Amazon SP-API",
    description: "Connect your Amazon Seller Central account via Selling Partner API",
    icon: <ShoppingCart className="h-6 w-6" />,
    status: "connected", // Providing one connected by default for demo
    lastSync: "2 hours ago",
    marketplace: "Amazon US",
  },
  {
    id: "mws",
    name: "Amazon MWS (Legacy)",
    description: "Legacy Marketplace Web Service integration",
    icon: <ShoppingCart className="h-6 w-6" />,
    status: "disconnected",
    marketplace: "Amazon",
  },
  {
    id: "advertising-api",
    name: "Amazon Advertising API",
    description: "Connect your Amazon Advertising account for PPC management",
    icon: <ShoppingCart className="h-6 w-6" />,
    status: "disconnected",
    marketplace: "Amazon",
  },
];

export default function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [credentials, setCredentials] = useState({
    sellerId: "",
    clientId: "",
    clientSecret: "",
    refreshToken: "",
  });

  const handleConnectClick = (integration: Integration) => {
    setSelectedIntegration(integration);
    setIsConnectDialogOpen(true);
  };

  const handleDisconnectClick = (id: string) => {
    setIntegrations(
      integrations.map((i) =>
        i.id === id ? { ...i, status: "disconnected", lastSync: undefined } : i
      )
    );
  };

  const handleConfirmConnect = () => {
    if (selectedIntegration) {
      setIntegrations(
        integrations.map((i) =>
          i.id === selectedIntegration.id
            ? { ...i, status: "connected", lastSync: "Just now" }
            : i
        )
      );
      setIsConnectDialogOpen(false);
      setSelectedIntegration(null);
      setCredentials({
        sellerId: "",
        clientId: "",
        clientSecret: "",
        refreshToken: "",
      });
    }
  };

  const getStatusBadge = (status: Integration["status"]) => {
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

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground mt-2">
            Manage your connected services and available integrations
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {integration.icon}
                  </div>
                  {getStatusBadge(integration.status)}
                </div>
                <CardTitle className="mt-4">{integration.name}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {integration.marketplace}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <p className="text-sm text-muted-foreground mb-6">
                  {integration.description}
                </p>

                {integration.status === "connected" ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => handleDisconnectClick(integration.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleConnectClick(integration)}
                  >
                    <Plug className="h-4 w-4 mr-2" />
                    Connect
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Connect Dialog */}
        <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Connect {selectedIntegration?.name}</DialogTitle>
              <DialogDescription>
                Enter your credentials to connect this integration
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sellerId">Seller ID</Label>
                <Input
                  id="sellerId"
                  value={credentials.sellerId}
                  onChange={(e) =>
                    setCredentials({ ...credentials, sellerId: e.target.value })
                  }
                  placeholder="Enter your Amazon Seller ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={credentials.clientId}
                  onChange={(e) =>
                    setCredentials({ ...credentials, clientId: e.target.value })
                  }
                  placeholder="LWA Client ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={credentials.clientSecret}
                  onChange={(e) =>
                    setCredentials({ ...credentials, clientSecret: e.target.value })
                  }
                  placeholder="LWA Client Secret"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refreshToken">Refresh Token</Label>
                <Input
                  id="refreshToken"
                  type="password"
                  value={credentials.refreshToken}
                  onChange={(e) =>
                    setCredentials({ ...credentials, refreshToken: e.target.value })
                  }
                  placeholder="OAuth Refresh Token"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsConnectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmConnect}
              >
                <Key className="h-4 w-4 mr-2" />
                Connect Integration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
