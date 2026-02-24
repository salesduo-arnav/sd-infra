import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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
    getIntegrationAccounts,
    IntegrationAccount,
} from "@/services/integration.service";
import { getToolBySlug } from "@/services/tool.service";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";
import { getRedirectContext, clearRedirectContext, finalizeRedirect } from "@/lib/redirectContext";

// ------------------------------------------------------------------
// Data                                                               
// ------------------------------------------------------------------ 

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

// Default: require everything when no tool is specified
const ALL_INTEGRATIONS = ["sp_api", "ads_api"];

// ------------------------------------------------------------------
// Component                                                          
// ------------------------------------------------------------------ 

export default function IntegrationOnboarding() {
    // Read redirect context from sessionStorage (sole source of truth)
    const ctx = getRedirectContext();
    const redirectUrl = ctx?.redirect || null;
    const appId = ctx?.app || null;
    const { activeOrganization } = useAuth();
    const orgId = activeOrganization?.id || "";
    const { openOAuthPopup } = useOAuthPopup();

    // State
    const [accountName, setAccountName] = useState<string>("");
    const [marketplace, setMarketplace] = useState<string>("");
    const [isSellerConnected, setIsSellerConnected] = useState(false);
    const [isVendorConnected, setIsVendorConnected] = useState(false);
    const [isAdsConnected, setIsAdsConnected] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Required integrations from backend
    const [requiredIntegrations, setRequiredIntegrations] = useState<string[]>(ALL_INTEGRATIONS);
    const [isLoadingRequirements, setIsLoadingRequirements] = useState(!!appId);

    // Track created account IDs for connecting later
    const [createdAccountIds, setCreatedAccountIds] = useState<Record<string, string>>({});

    // key of the item currently connecting (to show spinner)
    const [connecting, setConnecting] = useState<string | null>(null);

    const [resumeAccount, setResumeAccount] = useState<IntegrationAccount | null>(null);
    const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);

    // Fetch required integrations from backend based on app slug
    const fetchRequirements = useCallback(async () => {
        if (!appId) {
            setRequiredIntegrations(ALL_INTEGRATIONS);
            setIsLoadingRequirements(false);
            return;
        }

        try {
            const tool = await getToolBySlug(appId);
            if (tool.required_integrations && tool.required_integrations.length > 0) {
                setRequiredIntegrations(tool.required_integrations);
            } else {
                // Tool exists but has no required integrations — nothing to connect
                setRequiredIntegrations([]);
            }
        } catch {
            console.warn(`Could not fetch tool "${appId}", falling back to all integrations`);
            setRequiredIntegrations(ALL_INTEGRATIONS);
        } finally {
            setIsLoadingRequirements(false);
        }
    }, [appId]);

    const refreshIntegrations = useCallback(async () => {
        if (!orgId) return;
        try {
            const fetchedAccounts = await getIntegrationAccounts(orgId);
            setAccounts(fetchedAccounts);

            // 1. Update Connection Status from Session IDs
            const sellerId = createdAccountIds['sp_api_sc'];
            const vendorId = createdAccountIds['sp_api_vc'];
            const adsId = createdAccountIds['ads_api'];

            // Helper to find if an account type is connected
            const isConnected = (type: string) => {
                if (createdAccountIds[type]) {
                    return fetchedAccounts.find((a: IntegrationAccount) => a.id === createdAccountIds[type])?.status === 'connected';
                }
                return false;
            };

            if (isConnected('sp_api_sc')) setIsSellerConnected(true);
            if (isConnected('sp_api_vc')) setIsVendorConnected(true);
            if (isConnected('ads_api')) setIsAdsConnected(true);

        } catch (error) {
            console.error("Failed to refresh integrations", error);
        }
    }, [orgId, createdAccountIds]);

    useEffect(() => {
        fetchRequirements();
        refreshIntegrations();
    }, [fetchRequirements, refreshIntegrations]);

    // Auto-redirect when there's nothing to connect:
    // - No required integrations for this app
    // - OR all required integrations are already connected
    const [autoRedirected, setAutoRedirected] = useState(false);
    useEffect(() => {
        if (isLoadingRequirements || autoRedirected) return;

        const hasAny = requiredIntegrations.length > 0;
        if (!hasAny) {
            // No integrations needed — skip straight to external app or /apps
            setAutoRedirected(true);
            if (!finalizeRedirect()) {
                window.location.replace("/apps");
            }
        }
    }, [isLoadingRequirements, requiredIntegrations, autoRedirected]);

    // Check for existing account when user types Name + Region
    useEffect(() => {
        if (accountName && marketplace && accounts.length > 0) {
            // Check if we already have this in our current session (don't prompt to resume what we just made)
            const alreadyInSession = Object.values(createdAccountIds).some(id =>
                accounts.find(a => a.id === id && a.account_name === accountName && a.region === marketplace)
            );

            if (alreadyInSession) {
                setResumeAccount(null);
                return;
            }

            // Find a match in the backend list
            const match = accounts.find(a =>
                a.account_name.toLowerCase() === accountName.trim().toLowerCase() &&
                a.region === marketplace
            );

            if (match) {
                setResumeAccount(match);
            } else {
                setResumeAccount(null);
            }
        } else {
            setResumeAccount(null);
        }
    }, [accountName, marketplace, accounts, createdAccountIds]);

    const handleResume = () => {
        if (!resumeAccount) return;

        // Populate local session state with the IDs from the found account group
        const group = accounts.filter(a =>
            a.account_name === resumeAccount.account_name &&
            a.region === resumeAccount.region
        );

        const newIds: Record<string, string> = {};
        let resumedAny = false;

        group.forEach(a => {
            newIds[a.integration_type] = a.id;
            if (a.status === 'connected') {
                if (a.integration_type === 'sp_api_sc') setIsSellerConnected(true);
                if (a.integration_type === 'sp_api_vc') setIsVendorConnected(true);
                if (a.integration_type === 'ads_api') setIsAdsConnected(true);
            }
            resumedAny = true;
        });

        if (resumedAny) {
            setCreatedAccountIds(prev => ({ ...prev, ...newIds }));
            toast.success(`Resumed setup for "${resumeAccount.account_name}"`);
            setResumeAccount(null); // Dismiss after resuming
        }
    };

    // Global Message Listener for OAuth Popups
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const type = event.data?.type;
            if (typeof type !== 'string') return;

            // Handle any auth success (ADS_AUTH_SUCCESS, SP_API_AUTH_SUCCESS, etc.)
            if (type.endsWith('_AUTH_SUCCESS')) {
                console.log("[Frontend] Auth Success detected:", type);
                toast.success("Integration connected successfully!");
                refreshIntegrations();
                setConnecting(null);
            }

            // Handle any auth error
            if (type.endsWith('_AUTH_ERROR')) {
                console.error("[Frontend] Auth Error detected:", event.data.message);
                toast.error(event.data.message || "Failed to connect integration");
                setConnecting(null);
            }
        };

        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [refreshIntegrations]);

    // Derive UI visibility flags from requirements
    const isSpApiRequired = requiredIntegrations.some(r => ["sp_api", "sp_api_sc", "sp_api_vc"].includes(r));
    const isAdsApiRequired = requiredIntegrations.includes("ads_api");

    // Lock form if we have already created/connected an account in this session or found one on server
    const hasCreatedAccounts = Object.keys(createdAccountIds).length > 0;
    const isFormLocked = !!connecting || hasCreatedAccounts;

    // UI Helpers
    const isSellerCentralRequired = requiredIntegrations.includes("sp_api_sc");
    const isVendorCentralRequired = requiredIntegrations.includes("sp_api_vc");

    // Visibility flags for rows
    const showSellerRow = requiredIntegrations.includes('sp_api') || isSellerCentralRequired;
    const showVendorRow = requiredIntegrations.includes('sp_api') || isVendorCentralRequired;

    // Satisfaction map: each slug → whether it's fulfilled
    const satisfiedMap: Record<string, boolean> = {
        sp_api: isSellerConnected || isVendorConnected,
        sp_api_sc: isSellerConnected,
        sp_api_vc: isVendorConnected,
        ads_api: isAdsConnected,
    };

    // Check if SP-API requirements are met (for the badge)
    const isSpApiMet = requiredIntegrations
        .filter(r => ["sp_api", "sp_api_sc", "sp_api_vc"].includes(r))
        .every(r => satisfiedMap[r]);

    const isAccountNameFilled = !!accountName.trim();
    const isMarketplaceSelected = !!marketplace;
    const allRequirementsMet = requiredIntegrations.every(req => satisfiedMap[req] ?? true);
    const hasAnyRequirement = requiredIntegrations.length > 0;

    const isComplete = hasAnyRequirement
        ? isAccountNameFilled && isMarketplaceSelected && allRequirementsMet
        : true;

    // Handlers
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

            if (type === "ads" && accountId && orgId) {
                // --- Real OAuth Flow for Ads ---
                const { getAdsAuthUrl } = await import("@/services/integration.service");
                const url = await getAdsAuthUrl(orgId, accountId);

                const success = await openOAuthPopup({
                    orgId,
                    accountId,
                    url,
                    title: "Connect Amazon Ads",
                    width: 600,
                    height: 700,
                    successType: "ADS_AUTH_SUCCESS",
                    errorType: "ADS_AUTH_ERROR"
                });

                if (success) {
                    toast.success("Integration connected successfully!");
                    setIsAdsConnected(true);
                } else {
                    toast.error("Failed to connect integration");
                }
                setConnecting(null);

            } else {
                // --- Real OAuth Flow for SP-API (SC & VC) ---
                const { getSpAuthUrl } = await import("@/services/integration.service");
                const url = await getSpAuthUrl(orgId, accountId);

                const success = await openOAuthPopup({
                    orgId,
                    accountId,
                    url,
                    title: "Connect Amazon SP-API",
                    width: window.screen.width,
                    height: window.screen.height,
                    successType: "SP_AUTH_SUCCESS",
                    errorType: "SP_AUTH_ERROR"
                });

                if (success) {
                    toast.success("Integration connected successfully!");
                    if (type === 'seller') setIsSellerConnected(true);
                    if (type === 'vendor') setIsVendorConnected(true);
                } else {
                    toast.error("Failed to connect integration");
                }
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
            if (!finalizeRedirect()) {
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

    // ------------------------------------------------------------------------
    // Sub Components
    // ------------------------------------------------------------------------
    const RequirementBadge = ({ sellerRequired, sellerSatisfied, vendorRequired, vendorSatisfied }: { sellerRequired: boolean, sellerSatisfied: boolean, vendorRequired: boolean, vendorSatisfied: boolean }) => {
        if (sellerRequired && !sellerSatisfied && vendorRequired && !vendorSatisfied) {
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">Both Required</Badge>;
        }
        if (sellerRequired && !sellerSatisfied) {
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">Required</Badge>;
        }
        if (vendorRequired && !vendorSatisfied) {
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">Required</Badge>;
        }
        return <Badge variant="secondary" className="text-[10px]">Connect at least one</Badge>;
    };

    // ------------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------------

    const leftContent = (
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

            {/* Trust footer */}
            <div className="relative z-10 pt-4">
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
    );

    return (
        <SplitScreenLayout
            leftContent={leftContent}
            showBrandOnMobile={false}
            contentMaxWidth="max-w-2xl"
        >
            <div className="space-y-6">
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

                {isLoadingRequirements ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                        <p className="text-sm text-muted-foreground">Loading integration requirements...</p>
                    </div>
                ) : (
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
                                disabled={isFormLocked}
                            />
                        </div>

                        {/* 2. Marketplace Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                2. Select Region
                            </label>
                            <Select
                                value={marketplace}
                                onValueChange={setMarketplace}
                                disabled={isFormLocked}
                            >
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
                        {resumeAccount && (
                            <Card className="mb-6 bg-blue-50/50 border-blue-200">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex gap-3">
                                        <div className="p-2 bg-blue-100 rounded-full h-8 w-8 flex items-center justify-center text-blue-600">
                                            <Package className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-sm text-blue-900">Existing Account Found</h4>
                                            <p className="text-xs text-blue-700">
                                                An account matching <strong>"{resumeAccount.account_name}"</strong> in this region already exists.
                                            </p>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={handleResume} className="bg-blue-600 hover:bg-blue-700 text-white border-none whitespace-nowrap ml-4">
                                        Sync Status
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                3. Connect Services
                            </label>

                            <div className="grid gap-4">
                                {/* SP-API Card */}
                                {isSpApiRequired && (
                                    <Card className={`transition-all ${isSpApiMet ? 'border-green-200 bg-green-50/30' : ''}`}>
                                        <CardContent className="p-5">
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2 rounded-lg shrink-0 ${isSpApiMet ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                                                    <ShoppingCart className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-medium">Amazon Selling Partner API</h3>
                                                            {isSpApiMet ? (
                                                                <Badge className="bg-green-100 text-green-600 text-[10px]">Connected</Badge>
                                                            ) : (
                                                                <RequirementBadge
                                                                    sellerRequired={isSellerCentralRequired}
                                                                    sellerSatisfied={!!satisfiedMap['sp_api_sc']}
                                                                    vendorRequired={isVendorCentralRequired}
                                                                    vendorSatisfied={!!satisfiedMap['sp_api_vc']}
                                                                />
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            Syncs orders, inventory, and catalog data.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {showSellerRow && (
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
                                                        )}

                                                        {showVendorRow && (
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
                                                        )}
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
                                                <div className={`p-2 rounded-lg shrink-0 ${isAdsConnected ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                                                    <BarChart3 className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1 space-y-4">
                                                    <div>
                                                        <div className="flex items-center justify-between">
                                                            <h3 className="font-medium">Amazon Advertising API</h3>
                                                            <Badge variant="secondary" className={`text-[10px] ${isAdsConnected ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>{isAdsConnected ? 'Connected' : 'Required'}</Badge>
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
                )}
            </div>
        </SplitScreenLayout>
    );
}


