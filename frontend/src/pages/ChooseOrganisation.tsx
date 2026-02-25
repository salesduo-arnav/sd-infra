import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getIntegrationAccounts } from "@/services/integration.service";
import { getToolBySlug } from "@/services/tool.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Building2, Plus, ArrowRight, UserPlus, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SplitScreenLayout } from "@/components/layout/SplitScreenLayout";
import { hasRedirectContext, captureRedirectContext, getAppSlug, finalizeRedirect } from "@/lib/redirectContext";
import { useTranslation } from 'react-i18next';

export default function ChooseOrganisation() {
    const { user, switchOrganization, activeOrganization, isLoading: authLoading, checkPendingInvites } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();

    // Capture any incoming redirect instructions (e.g. from a micro-tool's IntegrationGuard)
    captureRedirectContext(searchParams);

    const [isLoading, setIsLoading] = useState(false);
    const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
    const [pendingInvites, setPendingInvites] = useState<unknown[]>([]);

    const memberships = user?.memberships ?? [];

    // Fetch pending invites on mount
    useEffect(() => {
        const fetchInvites = async () => {
            const invites = await checkPendingInvites();
            setPendingInvites(invites);
        };
        fetchInvites();
    }, [checkPendingInvites]);

    // Navigate once org switch is confirmed
    useEffect(() => {
        if (!targetOrgId || activeOrganization?.id !== targetOrgId) return;

        const handleRedirect = async () => {
            try {
                if (hasRedirectContext()) {
                    const appId = getAppSlug();

                    if (appId) {
                        try {
                            const [tool, accounts] = await Promise.all([
                                getToolBySlug(appId),
                                getIntegrationAccounts(targetOrgId)
                            ]);

                            const requiredIntegrations = tool.required_integrations || [];

                            // If no requirements, or they are all met, we can skip onboarding
                            if (requiredIntegrations.length === 0) {
                                if (!finalizeRedirect()) {
                                    navigate("/apps");
                                }
                                return;
                            }

                            const connectedTypes = new Set(
                                accounts.filter(a => a.status === 'connected').map(a => a.integration_type as string)
                            );

                            const hasSpApi = connectedTypes.has('sp_api_sc') || connectedTypes.has('sp_api_vc');
                            const allMet = requiredIntegrations.every(req => {
                                if (req === 'sp_api') return hasSpApi;
                                return connectedTypes.has(req);
                            });

                            if (allMet) {
                                if (!finalizeRedirect()) {
                                    navigate("/apps");
                                }
                                return;
                            }
                        } catch (error) {
                            console.error("Failed to check integrations during org switch", error);
                            // Fall through to onboarding on error
                        }
                    }

                    // Route through integration onboarding if requirements not met or error
                    navigate("/integration-onboarding", { replace: true });
                } else {
                    navigate("/apps");
                }
            } finally {
                // Always clear the loading state so the spinner doesn't get stuck
                setIsLoading(false);
                setTargetOrgId(null);
            }
        };

        handleRedirect();
    }, [activeOrganization, targetOrgId, navigate]);

    const handleSelectOrg = (orgId: string) => {
        setIsLoading(true);
        setTargetOrgId(orgId);
        switchOrganization(orgId);
    };

    const handleCreateNew = () => navigate("/create-organisation");
    const handleAcceptInvite = () => navigate("/pending-invites");

    // Loading state
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        navigate("/login");
        return null;
    }

    const leftContent = (
        <div className="relative z-10 w-full">
            <h1 className="text-4xl xl:text-5xl font-bold text-white mb-4 leading-tight">
                Welcome back,<br />{user.full_name}
            </h1>
            <p className="text-lg text-white/90 max-w-sm">
                {t('pages.chooseOrganisation.leftSubtitle')}
            </p>
        </div>
    );

    return (
        <SplitScreenLayout leftContent={leftContent}>
            <div className="space-y-6">
                {/* Mobile logo */}
                <div className="lg:hidden flex justify-center mb-2">
                    <img src="/salesduologo.svg" alt="SalesDuo" className="h-10 w-auto" />
                </div>

                {/* Heading */}
                <div className="text-center lg:text-left space-y-1">
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 justify-center lg:justify-start">
                        <Building2 className="h-6 w-6 text-primary hidden sm:inline-block" />
                        {t('pages.chooseOrganisation.title')}
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        You belong to <span className="font-semibold text-foreground">{memberships.length}</span>{" "}
                        organization{memberships.length !== 1 ? "s" : ""}.
                    </p>
                </div>

                {/* Pending invites banner */}
                {pendingInvites.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="shrink-0 bg-blue-100 dark:bg-blue-900 p-2.5 rounded-full">
                                <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">{t('pages.chooseOrganisation.pendingInvitations')}</p>
                                <p className="text-xs text-blue-700 dark:text-blue-300 truncate">
                                    You have {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 bg-white dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-800"
                            onClick={handleAcceptInvite}
                        >
                            {t('pages.chooseOrganisation.view')}
                        </Button>
                    </div>
                )}

                {/* Organization list */}
                <ScrollArea className="max-h-[56vh] sm:max-h-[400px] p-4 overflow-y-auto bg-muted/50 rounded-lg">
                    <div className="space-y-3">
                        {memberships.map((membership, idx) => {
                            const isSelected = isLoading && targetOrgId === membership.organization.id;

                            return (
                                <Card
                                    key={membership.organization.id}
                                    className={`shadow-sm cursor-pointer border transition-all duration-200 hover:border-primary/60 hover:shadow-md group ${isSelected ? "border-primary ring-2 ring-primary/20" : ""}`}
                                    onClick={() => !isLoading && handleSelectOrg(membership.organization.id)}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            if (!isLoading) handleSelectOrg(membership.organization.id);
                                        }
                                    }}
                                >
                                    <CardContent className="p-4 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="shrink-0 h-11 w-11 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm uppercase group-hover:scale-105 transition-transform">
                                                {membership.organization.name.substring(0, 2)}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                                                    {membership.organization.name}
                                                </h3>
                                                <Badge variant="secondary" className="mt-0.5 text-[10px] px-1.5 py-0 capitalize font-medium">
                                                    {membership.role.name}
                                                </Badge>
                                            </div>
                                        </div>

                                        {isSelected ? (
                                            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                                        ) : (
                                            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}

                        {/* Empty state */}
                        {memberships.length === 0 && (
                            <div className="text-center py-12 space-y-3">
                                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-muted">
                                    <Sparkles className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-muted-foreground text-sm">
                                    {t('pages.chooseOrganisation.notMember')}
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Create new */}
                <Button
                    variant="outline"
                    className="w-full h-auto py-4 border-dashed border-2 hover:border-primary hover:bg-primary/5 transition-colors group"
                    onClick={handleCreateNew}
                >
                    <Plus className="h-5 w-5 mr-2 group-hover:rotate-90 transition-transform" />
                    {t('pages.chooseOrganisation.createNew')}
                </Button>
            </div>
        </SplitScreenLayout>
    );
}
