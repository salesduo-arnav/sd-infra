import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ShoppingCart,
    CheckCircle2,
    Loader2,
    Shield,
    Lock,
    Key,
    BarChart3,
    Globe,
    ExternalLink,
    Store,
    Building2,
    Package
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
    createIntegrationAccount,
    connectIntegrationAccount,
} from "@/services/integration.service";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const MARKETPLACES = [
    { id: "us", name: "United States", flag: "🇺🇸" },
    { id: "ca", name: "Canada", flag: "🇨🇦" },
    { id: "mx", name: "Mexico", flag: "🇲🇽" },
    { id: "uk", name: "United Kingdom", flag: "🇬🇧" },
    { id: "de", name: "Germany", flag: "🇩🇪" },
    { id: "fr", name: "France", flag: "🇫🇷" },
    { id: "it", name: "Italy", flag: "🇮🇹" },
    { id: "es", name: "Spain", flag: "🇪🇸" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntegrationOnboarding() {
    const [searchParams] = useSearchParams();
    const redirectUrl = searchParams.get("redirect");
    const appId = searchParams.get("app");
    const { activeOrganization } = useAuth();
    const orgId = activeOrganization?.id || "";

    // State
    const [accountName, setAccountName] = useState<string>("");
    const [marketplace, setMarketplace] = useState<string>("");
    const [isSellerConnected, setIsSellerConnected] = useState(false);
    const [isVendorConnected, setIsVendorConnected] = useState(false);
    const [isAdsConnected, setIsAdsConnected] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Track created account IDs for connecting later
    const [createdAccountIds, setCreatedAccountIds] = useState<Record<string, string>>({});

    // key of the item currently connecting (to show spinner)
    const [connecting, setConnecting] = useState<string | null>(null);

    // Define requirements based on App ID
    const isSpApiRequired = !appId || appId === "demo-app";
    const isAdsApiRequired = !appId || appId === "demo-app";

    // Check if requirements are met
    const isAccountNameFilled = !!accountName.trim();
    const isMarketplaceSelected = !!marketplace;
    const isSpApiMet = !isSpApiRequired || isSellerConnected || isVendorConnected;
    const isAdsApiMet = !isAdsApiRequired || isAdsConnected;

    const isComplete = isAccountNameFilled && isMarketplaceSelected && isSpApiMet && isAdsApiMet;

    useEffect(() => {
        console.log("IntegrationOnboarding Mounted:", { redirectUrl, appId });
    }, [redirectUrl, appId]);

    /* ------------- handlers ------------- */

    const handleConnect = async (type: "seller" | "vendor" | "ads") => {
        if (!accountName.trim() || !marketplace) {
            toast.error("Please fill in Account Name and select a Marketplace first.");
            return;
        }

        setConnecting(type);

        // Map type to integration_type enum
        const typeMap: Record<string, string> = {
            seller: "sp_api_sc",
            vendor: "sp_api_vc",
            ads: "ads_api",
        };
        const integrationTypeKey = typeMap[type];

        try {
            // Create account in backend if not already created for this type
            let accountId = createdAccountIds[integrationTypeKey];

            if (!accountId && orgId) {
                const account = await createIntegrationAccount(orgId, {
                    account_name: accountName.trim(),
                    marketplace: 'amazon',
                    region: marketplace,
                    integration_type: integrationTypeKey,
                });
                accountId = account.id;
                setCreatedAccountIds((prev) => ({ ...prev, [integrationTypeKey]: accountId }));
            }

            // Simulate OAuth Popup
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
                            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb; color: #111; }
                            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #ff9900; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px; }
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        </style>
                    </head>
                    <body>
                        <div class="loader"></div>
                        <h2>Connecting...</h2>
                        <p>Please wait while we verify your credentials.</p>
                    </body>
                    </html>
                `);

                // Simulate success after delay
                setTimeout(async () => {
                    if (!popup.closed) popup.close();

                    // Connect via API
                    if (accountId && orgId) {
                        try {
                            await connectIntegrationAccount(orgId, accountId, {
                                simulated: true,
                                connected_via: "oauth_popup_onboarding",
                            });
                        } catch {
                            console.error("Failed to mark account connected");
                        }
                    }

                    setConnecting(null);
                    if (type === "seller") setIsSellerConnected(true);
                    if (type === "vendor") setIsVendorConnected(true);
                    if (type === "ads") setIsAdsConnected(true);
                }, 2500);
            } else {
                toast.error("Please allow popups to connect integrations.");
                setConnecting(null);
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || "Failed to create integration account");
            setConnecting(null);
        }
    };

    const handleContinue = async () => {
        setIsSaving(true);
        try {
            if (redirectUrl) {
                const url = new URL(redirectUrl);
                url.searchParams.set("integration_success", "true");
                window.location.replace(url.toString());
            } else {
                window.location.replace("/");
            }
        } finally {
            setIsSaving(false);
        }
    };

    /* ------------- Helper Components ------------- */

    const renderConnectionButton = (
        type: "seller" | "vendor" | "ads",
        label: string,
        icon: React.ReactNode,
        isConnected: boolean
    ) => {
        if (isConnected) {
            return (
                <Badge className="h-9 px-3 bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Connected
                </Badge>
            );
        }

        const isLoading = connecting === type;

        return (
            <Button
                size="sm"
                variant="outline"
                onClick={() => handleConnect(type)}
                disabled={!!connecting || !marketplace || !accountName.trim()}
                className="h-9"
            >
                {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                    <span className="mr-1.5 text-muted-foreground">{icon}</span>
                )}
                {label}
            </Button>
        );
    };

    /* ------------------------------------------------------------------ */
    /*  Render                                                             */
    /* ------------------------------------------------------------------ */

    return (
        <div className="min-h-screen flex text-foreground bg-background">
            {/* Left Panel — Brand gradient */}
            <div className="hidden lg:flex lg:w-[50%] bg-gradient-to-br from-[#ff9900] via-[#e88800] to-[#cc7700] flex-col justify-between p-12 relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-sm" />
                    <div className="absolute top-1/2 -left-12 w-64 h-64 bg-white/5 rounded-full" />
                    <div className="absolute bottom-24 right-1/4 w-32 h-32 bg-white/10 rounded-full blur-sm" />
                    <div
                        className="absolute inset-0 opacity-5"
                        style={{
                            backgroundImage:
                                "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
                            backgroundSize: "20px 20px",
                        }}
                    />
                </div>

                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 h-20 w-20 relative z-10">
                    <img src="/salesduologo.svg" alt="SalesDuo" className="drop-shadow-lg" />
                </Link>

                {/* Content */}
                <div className="relative z-10 space-y-6">
                    <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/25 mb-4">
                        <Key className="h-3 w-3 mr-1" />
                        Secure Setup
                    </Badge>
                    <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-sm leading-tight">
                        Connect Your<br />Marketplace Account
                    </h1>
                    <p className="text-lg text-white/90 leading-relaxed">
                        Link your Seller Central or Vendor Central account to unlock powerful analytics and automation tools.
                    </p>

                    <div className="pt-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3 text-white/80">
                            <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                                <Globe className="h-4 w-4" />
                            </div>
                            <span>Select your primary marketplace</span>
                        </div>
                        {isSpApiRequired && (
                            <div className="flex items-center gap-3 text-white/80">
                                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <ShoppingCart className="h-4 w-4" />
                                </div>
                                <span>Connect SP-API (Seller or Vendor)</span>
                            </div>
                        )}
                        {isAdsApiRequired && (
                            <div className="flex items-center gap-3 text-white/80">
                                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <BarChart3 className="h-4 w-4" />
                                </div>
                                <span>Enable Advertising API</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Trust footer */}
                <div className="relative z-10">
                    <div className="flex items-center gap-6 pt-6 border-t border-white/15 text-white/60 text-xs">
                        <div className="flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" />
                            <span>Bank-grade Security</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" />
                            <span>ISO 27001 Certified</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel */}
            <div className="flex w-full lg:w-[50%] flex-col px-6 py-12 sm:px-12 lg:px-24 bg-background overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl flex-1 flex flex-col justify-center">
                    {/* Mobile Logo */}
                    <div className="lg:hidden mb-10">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-semibold">SalesDuo</span>
                        </Link>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-semibold tracking-tight">Integration Setup</h2>
                        <p className="text-muted-foreground mt-1">Configure your Amazon integration settings.</p>
                        {appId && <Badge variant="outline" className="mt-2">Connecting to: {appId}</Badge>}
                    </div>

                    <div className="space-y-8">

                        {/* 1. Account Name */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                1. Account Name
                            </label>
                            <Input
                                placeholder='e.g. "US Main Account"'
                                value={accountName}
                                onChange={(e) => setAccountName(e.target.value)}
                                className="h-11"
                            />
                        </div>

                        {/* 2. Marketplace Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                2. Select Region
                            </label>
                            <Select value={marketplace} onValueChange={setMarketplace}>
                                <SelectTrigger className="w-full h-11">
                                    <SelectValue placeholder="Choose a region..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {MARKETPLACES.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            <span className="mr-2 text-lg">{m.flag}</span>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 3. Connect Services */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                3. Connect Services
                            </label>

                            <div className="grid gap-4">
                                {/* SP-API Card */}
                                {isSpApiRequired && (
                                    <Card className={`transition-all ${isSellerConnected && isVendorConnected ? 'border-green-200 bg-green-50/30' : ''}`}>
                                        <CardContent className="p-5">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-lg shrink-0 ${isSellerConnected || isVendorConnected ? 'bg-green-100 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    <ShoppingCart className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-medium">Amazon Selling Partner API</h3>
                                                            <Badge variant="secondary" className="text-[10px]">Connect at least one</Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            Syncs orders, inventory, and catalog data.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                                                            <div className="flex items-center gap-2.5">
                                                                <Store className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm font-medium">Seller Central</span>
                                                            </div>
                                                            {renderConnectionButton(
                                                                "seller",
                                                                "Connect",
                                                                <ExternalLink className="h-3.5 w-3.5" />,
                                                                isSellerConnected
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                                                            <div className="flex items-center gap-2.5">
                                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium">Vendor Central</span>
                                                                </div>
                                                            </div>
                                                            {renderConnectionButton(
                                                                "vendor",
                                                                "Connect",
                                                                <ExternalLink className="h-3.5 w-3.5" />,
                                                                isVendorConnected
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Advertising API Card */}
                                {isAdsApiRequired && (
                                    <Card className={`transition-all ${isAdsConnected ? 'border-green-200 bg-green-50/30' : ''}`}>
                                        <CardContent className="p-5">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-lg shrink-0 ${isAdsConnected ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    <BarChart3 className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-medium">Amazon Advertising API</h3>
                                                            <Badge variant="secondary" className="text-[10px]">Required</Badge>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            Access PPC campaigns and advertising performance metrics.
                                                        </p>
                                                    </div>

                                                    <div>
                                                        {renderConnectionButton(
                                                            "ads",
                                                            "Connect Advertising",
                                                            <ExternalLink className="h-3.5 w-3.5" />,
                                                            isAdsConnected
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>

                        {/* Continue Button */}
                        <div className="pt-4">
                            <Button
                                className="w-full h-11"
                                size="lg"
                                onClick={handleContinue}
                                disabled={!isComplete || isSaving}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Continue to Dashboard"
                                )}
                            </Button>
                            {!isComplete && (
                                <p className="text-center text-xs text-muted-foreground mt-3">
                                    Please select a marketplace and connect all required services to continue.
                                </p>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
