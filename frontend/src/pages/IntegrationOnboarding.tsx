import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
    Package,
    ArrowLeft,
    LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
    createIntegrationAccount,
    connectIntegrationAccount,
    getIntegrationAccounts,
    listAdsAccounts,
    updateAdsAccount,
    getAdsAuthUrl,
    getSpAuthUrl,
    IntegrationAccount,
    AdsAccountProfile
} from "@/services/integration.service";
import { getToolBySlug } from "@/services/tool.service";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { FullPageLoader } from "@/components/layout/FullPageLoader";
import { useOAuthPopup } from "@/hooks/useOAuthPopup";
import { captureRedirectContext, getRedirectContext, clearRedirectContext, finalizeRedirect } from "@/lib/redirectContext";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

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
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    captureRedirectContext(searchParams);
    const navigate = useNavigate();

    // Embed mode: rendered inside a popup window opened by another micro-tool.
    // We hide page chrome (split layout, sign-out, switch-org) and replace the
    // continue action with a "Done" button that just closes the window.
    const isEmbed = searchParams.get("embed") === "1";

    // Read redirect context from sessionStorage (sole source of truth).
    // In embed mode there's no `redirect` param, so we also accept `app` from
    // the URL directly so required-integration lookups still work.
    const ctx = getRedirectContext();
    const redirectUrl = ctx?.redirect || null;
    const appId = ctx?.app || (isEmbed ? searchParams.get("app") : null);
    const { activeOrganization, switchOrganization, logout } = useAuth();
    const { openOAuthPopup } = useOAuthPopup();

    // Sync org from URL param
    useEffect(() => {
        const urlOrgId = searchParams.get("orgId");
        if (urlOrgId && urlOrgId !== activeOrganization?.id) {
            localStorage.setItem("activeOrganizationId", urlOrgId);
            switchOrganization(urlOrgId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Derive orgId reactively from auth context.
    // Fall back to localStorage because switchOrganization() writes there
    // synchronously, while the React state update may not have propagated
    // yet when navigating here immediately after an org switch.
    const orgId = activeOrganization?.id || searchParams.get("orgId") || localStorage.getItem("activeOrganizationId") || "";

    // Build URL for "switch org" back button
    const switchOrgUrl = (() => {
        const params = new URLSearchParams();
        if (redirectUrl) params.set("redirect", redirectUrl);
        if (appId) params.set("app", appId);
        const qs = params.toString();
        return `/choose-organisation${qs ? `?${qs}` : ""}`;
    })();

    // State
    const [accountName, setAccountName] = useState<string>("");
    const [marketplace, setMarketplace] = useState<string>("");
    const [isSaving, setIsSaving] = useState(false);

    // Required integrations from backend
    const [requiredIntegrations, setRequiredIntegrations] = useState<string[]>(ALL_INTEGRATIONS);
    const [isLoadingRequirements, setIsLoadingRequirements] = useState(!!appId);
    // Tracks the initial accounts fetch so we can keep a full-page loader visible
    // until we know whether to auto-redirect or render the onboarding form.
    // Re-set to false on every refresh, which is a no-op after the first one.
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

    // Track created account IDs for connecting later
    const [createdAccountIds, setCreatedAccountIds] = useState<Record<string, string>>({});

    const [isFetchingAdsProfiles, setIsFetchingAdsProfiles] = useState(false);

    // key of the item currently connecting (to show spinner)
    const [connecting, setConnecting] = useState<string | null>(null);
    const isProcessingAdsSuccess = useRef(false);

    // Ads account selection
    const [adsAccounts, setAdsAccounts] = useState<AdsAccountProfile[]>([]);
    const [isAdsSelectorOpen, setIsAdsSelectorOpen] = useState(false);
    const [pendingAdsIntId, setPendingAdsIntId] = useState<string | null>(null);
    const [isUpdatingAds, setIsUpdatingAds] = useState(false);

    const [resumeAccount, setResumeAccount] = useState<IntegrationAccount | null>(null);
    const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);

    // Fetch required integrations from backend based on app slug
    const fetchRequirements = useCallback(async () => {
        if (!appId) {
            setRequiredIntegrations([]);
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
        if (!orgId) {
            setIsLoadingAccounts(false);
            return;
        }
        try {
            const fetchedAccounts = await getIntegrationAccounts(orgId);
            setAccounts(fetchedAccounts);
        } catch (error) {
            console.error("Failed to refresh integrations", error);
        } finally {
            setIsLoadingAccounts(false);
        }
    }, [orgId]);

    useEffect(() => {
        fetchRequirements();
        refreshIntegrations();
    }, [fetchRequirements, refreshIntegrations]);

    // Auto-redirect when there's nothing to connect:
    // - No required integrations for this app
    // - OR all required integrations are already connected
    const [autoRedirected, setAutoRedirected] = useState(false);
    useEffect(() => {
        // DON'T redirect if we are currently showing the Ads account selector or fetching profiles.
        // Also skip in embed mode — popup users close the window when done.
        if (isEmbed || isLoadingRequirements || autoRedirected || accounts.length === 0 || isAdsSelectorOpen || isFetchingAdsProfiles) return;

        const hasAny = requiredIntegrations.length > 0;
        if (!hasAny) {
            // No integrations needed — skip straight to external app or /apps
            setAutoRedirected(true);
            if (!finalizeRedirect()) {
                window.location.replace("/apps");
            }
            return;
        }

        // Check if all required integrations are already connected
        const allSatisfied = requiredIntegrations.every(req => {
            if (req === 'sp_api') {
                return accounts.some(a => (a.integration_type === 'sp_api_sc' || a.integration_type === 'sp_api_vc') && a.status === 'connected');
            }
            if (req === 'ads_api') {
                // Ads needs both connected status AND metadata
                return accounts.some(a => 
                    a.integration_type === 'ads_api' && 
                    a.status === 'connected' && 
                    a.credentials?.ads_metadata?.ad_profile_id
                );
            }
            return accounts.some(a => a.integration_type === req && a.status === 'connected');
        });

        if (allSatisfied) {
            setAutoRedirected(true);
            if (!finalizeRedirect()) {
                window.location.replace("/apps");
            }
        }
    }, [isEmbed, isLoadingRequirements, requiredIntegrations, autoRedirected, accounts, isAdsSelectorOpen, isFetchingAdsProfiles]);

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
            resumedAny = true;
        });

        if (resumedAny) {
            setCreatedAccountIds(prev => ({ ...prev, ...newIds }));
            toast.success(t('pages.integrationOnboarding.resumedSetup', { name: resumeAccount.account_name }));
            setResumeAccount(null); // Dismiss after resuming
        }
    };

    // Global Message Listener for OAuth Popups
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const type = event.data?.type;
            if (typeof type !== 'string') return;

            // Handle any auth success EXCEPT Ads (which is handled directly in handleConnect)
            if (type.endsWith('_AUTH_SUCCESS') && type !== 'ADS_AUTH_SUCCESS') {
                console.log("[Frontend] Auth Success detected:", type);
                toast.success(t('pages.integrationOnboarding.integrationConnected'));
                refreshIntegrations();
                setConnecting(null);
            }

            // Handle any auth error
            if (type.endsWith('_AUTH_ERROR')) {
                console.error("[Frontend] Auth Error detected:", event.data.message);
                toast.error(event.data.message || t('pages.integrationOnboarding.failedToConnect'));
                setConnecting(null);
            }
        };

        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [refreshIntegrations, t, connecting]);

    const handleSelectAdsAccount = useCallback(async (profileId: string, forcedIntId?: string) => {
        const targetIntId = forcedIntId || pendingAdsIntId;
        if (!orgId || !targetIntId) return;
        setIsUpdatingAds(true);
        try {
            await updateAdsAccount(orgId, targetIntId, String(profileId));
            toast.success("Ads account selected successfully");
            setIsAdsSelectorOpen(false);
            refreshIntegrations();
        } catch (error) {
            toast.error("Failed to update Ads account");
        } finally {
            setIsUpdatingAds(false);
        }
    }, [pendingAdsIntId, orgId, refreshIntegrations]);

    const handleAdsAuthSuccess = useCallback(async (forcedId?: string) => {
        if (isProcessingAdsSuccess.current) return;
        isProcessingAdsSuccess.current = true;
        console.log("[Frontend] handleAdsAuthSuccess starting...", { forcedId, orgId });
        setIsFetchingAdsProfiles(true);

        // Find the ads account we just connected
        const id = forcedId || createdAccountIds['ads_api'];
        console.log("[Frontend] Target Ads Account ID identified:", id);

        if (id && orgId) {
            try {
                console.log("[Frontend] Calling listAdsAccounts for account:", id);
                const accountsList = await listAdsAccounts(orgId, id);
                console.log("[Frontend] listAdsAccounts response:", accountsList);

                if (accountsList && accountsList.length > 0) {
                    if (accountsList.length === 1) {
                        // Auto-select if only one profile
                        console.log("[Frontend] Single profile found, auto-selecting:", accountsList[0].profileId);
                        await handleSelectAdsAccount(accountsList[0].profileId, id);
                    } else {
                        setAdsAccounts(accountsList);
                        setPendingAdsIntId(id);
                        setIsAdsSelectorOpen(true);
                        console.log("[Frontend] Multiple profiles found, opening selector.");
                    }
                } else {
                    console.warn("[Frontend] listAdsAccounts returned empty or null.");
                    toast.success("Amazon Ads account authenticated. Please select a profile.");
                    refreshIntegrations();
                }
            } catch (error) {
                console.error("[Frontend] Error in listAdsAccounts call:", error);
                // The interceptor already showed a toast
            } finally {
                setIsFetchingAdsProfiles(false);
                isProcessingAdsSuccess.current = false;
            }
        } else {
            console.error("[Frontend] ABORTING: Could not find account ID.", { id, forcedId, createdAccountIds });
            setIsFetchingAdsProfiles(false);
            isProcessingAdsSuccess.current = false;
        }
        setConnecting(null);
    }, [createdAccountIds, orgId, refreshIntegrations, handleSelectAdsAccount]);

    // Polling fallback: detect when OAuth callback stored credentials but postMessage was not received
    useEffect(() => {
        if (connecting !== 'ads' || isAdsSelectorOpen || isFetchingAdsProfiles) return;

        const interval = setInterval(async () => {
            console.log("[Frontend] Polling for Ads account status...");
            if (!orgId) return;
            try {
                const fetched = await getIntegrationAccounts(orgId);
                const adsAccount = createdAccountIds['ads_api']
                    ? fetched.find(a => a.id === createdAccountIds['ads_api'])
                    : fetched.find(a => a.integration_type === 'ads_api');

                if (adsAccount && adsAccount.credentials) {
                    console.log("[Frontend] Polling detected Ads account has credentials. Triggering profiles fetch for ID:", adsAccount.id);
                    clearInterval(interval);
                    handleAdsAuthSuccess(adsAccount.id);
                }
            } catch (e) {
                console.error("[Frontend] Polling error:", e);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [connecting, isAdsSelectorOpen, orgId, createdAccountIds, isFetchingAdsProfiles, handleAdsAuthSuccess]);

    // Derive UI visibility flags from requirements
    const isSpApiRequired = requiredIntegrations.some(r => ["sp_api", "sp_api_sc", "sp_api_vc"].includes(r));
    const isAdsApiRequired = requiredIntegrations.includes("ads_api");

    // Lock form if we have already created/connected an account in this session or found one on server
    const hasCreatedAccounts = Object.keys(createdAccountIds).length > 0;
    const isFormLocked = !!connecting || hasCreatedAccounts;

    // UI Helpers
    const isSellerCentralRequired = requiredIntegrations.includes("sp_api_sc");
    const isVendorCentralRequired = requiredIntegrations.includes("sp_api_vc");

    // Derived connection states (Issue #12)
    const isConnected = (type: string) => {
        // Check session-created accounts first
        const id = createdAccountIds[type];
        let account: IntegrationAccount | undefined;
        if (id) {
            account = accounts.find(a => a.id === id);
        } else if (!isEmbed) {
            // Non-embed flows reflect any org-wide connection of this type so the
            // user sees prior progress. Embed mode is a "create a new group" flow
            // — ignore other groups so existing connections don't leak in.
            account = accounts.find(a => a.integration_type === type && a.status === 'connected');
        }

        if (!account) return false;

        // Special check for Ads: must have metadata
        if (type === 'ads_api') {
            return account.status === 'connected' && !!account.credentials?.ads_metadata?.ad_profile_id;
        }

        return account.status === 'connected';
    };

    const isSellerConnected = !!isConnected('sp_api_sc');
    const isVendorConnected = !!isConnected('sp_api_vc');
    const isAdsConnected = !!isConnected('ads_api');

    // Visibility flags for rows. Enforce mutual exclusivity: hide the other if one is connected.
    const showSellerRow = (requiredIntegrations.includes('sp_api') || isSellerCentralRequired) && !isVendorConnected;
    const showVendorRow = (requiredIntegrations.includes('sp_api') || isVendorCentralRequired) && !isSellerConnected;

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
        console.log(`Connecting ${type}...`, { accountName, marketplace, orgId, createdAccountIds });
        if (!accountName.trim() || !marketplace) {
            toast.error(t('pages.integrationOnboarding.fillAccountDetails'));
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
                const url = await getAdsAuthUrl(orgId, accountId);

                const success = await openOAuthPopup({
                    orgId,
                    accountId,
                    url,
                    title: "Connect Amazon Ads",
                    width: 600,
                    height: 700,
                    successType: "ADS_AUTH_SUCCESS",
                    errorType: "ADS_AUTH_ERROR",
                    verifyFn: async () => {
                        try {
                            const accounts = await getIntegrationAccounts(orgId);
                            const updatedAccount = accounts.find((a) => a.id === accountId);
                            // For Ads, we just need to know it has credentials now
                            return !!(updatedAccount && updatedAccount.credentials);
                        } catch (e) {
                            return false;
                        }
                    }
                });

                if (success) {
                    // Trigger the dropdown selection
                    await handleAdsAuthSuccess(accountId);
                } else {
                    toast.error("Failed to connect integration");
                    setConnecting(null);
                }

            } else if (accountId && orgId) {
                // --- Real OAuth Flow for SP-API (SC & VC) ---
                const url = await getSpAuthUrl(orgId, accountId);

                const success = await openOAuthPopup({
                    orgId,
                    accountId,
                    url,
                    title: "Connect Seller Central",
                    width: 1100,
                    height: 850,
                    successType: "SP_AUTH_SUCCESS",
                    errorType: "SP_AUTH_ERROR",
                });

                if (success) {
                    toast.success("Seller Central connected successfully!");
                    await refreshIntegrations();
                } else {
                    toast.error("Failed to connect Seller Central");
                }
                setConnecting(null);
            }

        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(err.response?.data?.message || t('pages.integrationOnboarding.failedToCreate'));
            setConnecting(null);
        }
    };

    const handleContinue = async () => {
        if (isEmbed) {
            window.close();
            return;
        }
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
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">{t('pages.integrationOnboarding.bothRequired')}</Badge>;
        }
        if (sellerRequired && !sellerSatisfied) {
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">{t('pages.integrationOnboarding.required')}</Badge>;
        }
        if (vendorRequired && !vendorSatisfied) {
            return <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20">{t('pages.integrationOnboarding.required')}</Badge>;
        }
        return <Badge variant="secondary" className="text-[10px]">{t('pages.integrationOnboarding.connectExactlyOne')}</Badge>;
    };

    // ------------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------------

    // Short-circuit the entire page (chrome included) while we're still doing
    // the initial requirements + accounts check, or while an auto-redirect to
    // the external app is in flight. Without this, users hit by `PublicRoute`
    // briefly see the onboarding form even when they have nothing to set up.
    if (isLoadingRequirements || isLoadingAccounts || autoRedirected) {
        return <FullPageLoader message={t('pages.integrationOnboarding.loadingRequirements')} />;
    }

    const leftContent = (
        <div className="relative z-10 w-full">
            <h1 className="text-4xl xl:text-5xl font-bold text-white mb-4 leading-tight">
                {t('pages.integrationOnboarding.leftTitle')}
            </h1>
            <p className="text-lg text-white/90 max-w-sm">
                {t('pages.integrationOnboarding.leftSubtitle')}
            </p>
        </div>
    );

    const body = (
            <div className="pb-6 w-full relative">
                {!isEmbed && (
                    <button
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                        className="group absolute top-0 right-0 flex items-center gap-2 text-sm text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                        <span className="font-medium tracking-tight">{t('auth.signOut')}</span>
                        <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    </button>
                )}

                {!isEmbed && (
                    <div className="lg:hidden mb-8 shrink-0">
                        <Link to="/" className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-[#ff9900] to-[#e88800]">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-semibold">SalesDuo</span>
                        </Link>
                    </div>
                )}

                <div className="mb-8">
                    {!isEmbed && (
                        <button
                            onClick={() => navigate(switchOrgUrl)}
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
                        >
                            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                            {t('pages.integrationOnboarding.switchOrganisation')}
                        </button>
                    )}
                    <h2 className="text-2xl font-semibold tracking-tight">{t('pages.integrationOnboarding.integrationSetup')}</h2>
                    <p className="text-muted-foreground mt-1">{t('pages.integrationOnboarding.configureSettings')}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {appId && <Badge variant="outline">{t('pages.integrationOnboarding.connectingTo', { app: appId })}</Badge>}
                        {activeOrganization?.name && (
                            <Badge variant="secondary" className="bg-primary/5 text-primary">
                                <Building2 className="mr-1 h-3 w-3" />
                                {activeOrganization.name}
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="space-y-8">

                    {/* 1. Account Name */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {t('pages.integrationOnboarding.accountName')}
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
                            {t('pages.integrationOnboarding.selectRegion')}
                        </label>
                        <Select
                            value={marketplace}
                            onValueChange={setMarketplace}
                            disabled={isFormLocked}
                        >
                            <SelectTrigger className="w-full h-11">
                                <SelectValue placeholder={t('pages.integrationOnboarding.chooseRegion')} />
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
                                        <h4 className="font-medium text-sm text-blue-900">{t('pages.integrationOnboarding.existingAccountFound')}</h4>
                                        <p className="text-xs text-blue-700">
                                            An account matching <strong>"{resumeAccount.account_name}"</strong> in this region already exists.
                                        </p>
                                    </div>
                                </div>
                                <Button size="sm" onClick={handleResume} className="bg-blue-600 hover:bg-blue-700 text-white border-none whitespace-nowrap ml-4">
                                    {t('pages.integrationOnboarding.syncStatus')}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    <div className="space-y-3">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            {t('pages.integrationOnboarding.connectServices')}
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
                                                        <h3 className="font-medium">{t('pages.integrationOnboarding.spApiTitle')}</h3>
                                                        {isSpApiMet ? (
                                                            <Badge className="bg-green-100 text-green-600 text-[10px]">{t('pages.integrationOnboarding.connected')}</Badge>
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
                                                        {t('pages.integrationOnboarding.spApiDescription')}
                                                    </p>
                                                </div>

                                                <div className="space-y-3">
                                                    {showSellerRow && (
                                                        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                                                            <div className="flex items-center gap-2.5">
                                                                <Store className="h-4 w-4 text-muted-foreground" />
                                                                <span className="text-sm font-medium">{t('pages.integrationOnboarding.sellerCentral')}</span>
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
                                                                    <span className="text-sm font-medium">{t('pages.integrationOnboarding.vendorCentral')}</span>
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
                                                        <h3 className="font-medium">{t('pages.integrationOnboarding.adsApiTitle')}</h3>
                                                        <Badge variant="secondary" className={`text-[10px] ${isAdsConnected ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>{isAdsConnected ? t('pages.integrationOnboarding.connected') : t('pages.integrationOnboarding.required')}</Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {t('pages.integrationOnboarding.adsApiDescription')}
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

                    {/* Continue / Done Button */}
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
                            ) : isEmbed ? (
                                "Done"
                            ) : (
                                t('pages.integrationOnboarding.continueToDashboard')
                            )}
                        </Button>
                        {!isComplete && (
                            <p className="text-center text-xs text-muted-foreground mt-3">
                                {t('pages.integrationOnboarding.completeAllRequired')}
                            </p>
                        )}
                    </div>

                </div>

                {/* Ads Account Selector Dialog */}
                <Dialog open={isAdsSelectorOpen || isFetchingAdsProfiles} onOpenChange={(open) => {
                    if (!open && !isFetchingAdsProfiles) setIsAdsSelectorOpen(false);
                }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Amazon Ads Account</DialogTitle>
                            <DialogDescription>
                                {isFetchingAdsProfiles
                                    ? "Fetching your Amazon Ads profiles. This may take a moment..."
                                    : "We found multiple ads accounts. Please select the one you want to use for this integration."}
                            </DialogDescription>
                        </DialogHeader>

                        {isFetchingAdsProfiles ? (
                            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground animate-pulse">Loading profiles, please wait...</p>
                            </div>
                        ) : (
                            <div className="space-y-4 py-4">
                                <Select onValueChange={(val) => handleSelectAdsAccount(val)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose an account..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {adsAccounts.map((item) => (
                                            <SelectItem key={item.profileId} value={item.profileId}>
                                                {item.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
    );

    if (isEmbed) {
        return (
            <div className="min-h-screen w-full bg-background overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl px-6 py-8">{body}</div>
            </div>
        );
    }

    return (
        <SplitScreenLayout
            leftContent={leftContent}
            showBrandOnMobile={false}
            contentMaxWidth="max-w-2xl"
        >
            {body}
        </SplitScreenLayout>
    );
}


