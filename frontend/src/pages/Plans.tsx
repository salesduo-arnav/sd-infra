import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, ShoppingCart, Trash2, ChevronRight, Loader2, Coins, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as PublicService from "@/services/public.service";
import { toast } from "sonner";
import { BundleCard } from "@/components/plans/BundleCard";
import { BundleCardSkeleton } from "@/components/plans/BundleCardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { AppCard } from "@/components/plans/AppCard";
import { Bundle, App, CartItem } from "@/components/plans/types";
import { CartSidebarItem } from "@/components/plans/CartSidebarItem";
import { useNavigate } from "react-router-dom";
import * as BillingService from "@/services/billing.service";
import { transformBundles, transformPlansToApps, enrichAppsWithEligibility } from "@/components/plans/utils";
import { Subscription } from '@/types/subscription';

import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';

export default function Plans() {
  const { activeOrganization } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState("bundles");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentSubscriptions, setCurrentSubscriptions] = useState<Subscription[]>([]);
  const [changingSubId, setChangingSubId] = useState<string | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<Record<string, { eligible: boolean; trialDays: number }>>({});
  const [startingTrialToolId, setStartingTrialToolId] = useState<string | null>(null);

  const [enableTransition, setEnableTransition] = useState(false);

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscriptions = async () => {
    try {
      const data = await BillingService.getSubscriptions();
      setCurrentSubscriptions(data.subscriptions || []);
    } catch (error) {
      console.error("Failed to fetch subscriptions", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [publicBundles, publicPlans, planCreditGrants, packs, creditsData] = await Promise.all([
          PublicService.getPublicBundles(),
          PublicService.getPublicPlans(),
          PublicService.getPlanCreditGrants().catch(() => []),
          BillingService.listCreditPacks().catch(() => []),
          BillingService.getMyCredits().catch(() => ({ wallets: [], feature_access: [] as never[] })),
        ]);

        await fetchSubscriptions();

        const uniqueToolSlugs = Array.from(new Set(publicPlans.map((p) => p.tool?.slug).filter(Boolean) as string[]));
        const pricingResults = await Promise.all(
          uniqueToolSlugs.map((slug) =>
            BillingService.getPricePerCredit(slug).catch(() => null),
          ),
        );
        const pricingByToolId = new Map<string, BillingService.PricePerCredit>();
        for (const p of pricingResults) {
          if (p) pricingByToolId.set(p.tool_id, p);
        }

        const walletByToolId = new Map<string, BillingService.CreditWalletSnapshot>();
        for (const w of creditsData.wallets || []) {
          walletByToolId.set(w.tool_id, w);
        }

        const transformedBundles = transformBundles(publicBundles, planCreditGrants);
        setBundles(transformedBundles);

        const initialApps = transformPlansToApps(
          publicPlans,
          planCreditGrants,
          packs,
          pricingByToolId,
          walletByToolId,
        );
        setApps(initialApps);

        const toolIds = initialApps.map(app => app.id);
        const eligibilityResults: Record<string, { eligible: boolean; trialDays: number }> = {};
        await Promise.all(
          toolIds.map(async (toolId) => {
            try {
              const result = await BillingService.checkTrialEligibility(toolId);
              eligibilityResults[toolId] = { eligible: result.eligible, trialDays: result.trialDays };
            } catch {
              eligibilityResults[toolId] = { eligible: false, trialDays: 0 };
            }
          })
        );
        setTrialEligibility(eligibilityResults);

      } catch (error) {
        console.error("Failed to fetch plans data", error);
        toast.error("Failed to load plans");
      } finally {
        setIsLoading(false);
        setTimeout(() => setEnableTransition(true), 100);
      }
    };

    fetchData();
  }, [activeOrganization, t]);

  const allBundles = bundles;

  const enrichedApps = enrichAppsWithEligibility(apps, trialEligibility);

  const handleStartTrial = async (toolId: string) => {
    const app = enrichedApps.find(a => a.id === toolId);
    if (!app) return;

    if (app.trialCardRequired && app.trialPlanId) {
      if (isInCart(app.id, 'Trial')) {
        setIsCartOpen(true);
        return;
      }

      const trialItem: CartItem = {
        id: app.id,
        planId: app.trialPlanId,
        type: 'app',
        name: app.name,
        tierName: 'Free Trial',
        price: 0,
        currency: app.trialPlanCurrency || 'USD',
        period: app.trialPlanInterval ? `/${app.trialPlanInterval}` : `${app.trialDays} days`,
        features: [],
        limits: 'Free Trial',
        isUpgrade: false,
        isDowngrade: false,
        trialDays: app.trialDays,
        trialCredits: app.trialCredits,
        trialCreditsPeriodUnit: app.trialCreditsPeriodUnit,
      };
      toggleCartItem(trialItem);
      setIsCartOpen(true);
      return;
    }

    setStartingTrialToolId(toolId);
    try {
      await BillingService.startTrial(toolId);
      toast.success("Trial started");
      await fetchSubscriptions();
      setTrialEligibility(prev => ({
        ...prev,
        [toolId]: { ...prev[toolId], eligible: false }
      }));
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error((error as any)?.response?.data?.message || 'Failed to start trial');
    } finally {
      setStartingTrialToolId(null);
    }
  };

  const hasSubscriptionChanges = cart.some(item => item.isUpgrade || item.isDowngrade);
  const hasNewItems = cart.some(item => !item.isUpgrade && !item.isDowngrade);

  const toggleCartItem = (item: CartItem) => {
    const exactMatch = cart.find(
      (cartItem) => cartItem.id === item.id && cartItem.tierName === item.tierName
    );

    if (exactMatch) {
      setCart((prev) => prev.filter((cartItem) => !(cartItem.id === item.id && cartItem.tierName === item.tierName)));
    } else {
      setCart((prev) => {
        const filtered = prev.filter((cartItem) => cartItem.id !== item.id);
        return [...filtered, item];
      });
      setIsCartOpen(true);
    }
  };

  const removeFromCart = (id: string, tierName: string) => {
    setCart((prev) => prev.filter((item) => !(item.id === id && item.tierName === tierName)));
  };

  const isInCart = (id: string, tierName: string) => {
    return cart.some((item) => item.id === id && item.tierName === tierName);
  };

  const hasAnyTierInCart = (id: string) => {
    return cart.some((item) => item.id === id);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);
  const cartCurrency = cart.length > 0 ? cart[0].currency || 'USD' : 'USD';
  const cartItemCount = cart.length;

  const formatPrice = (price: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(price);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Reject mixing subscriptions with one-time credit purchases — Stripe Checkout
    // can't combine subscription mode and payment mode in the same session.
    const hasSubscription = cart.some((item) => item.type === 'app' || item.type === 'bundle');
    const hasOneTime = cart.some((item) => item.type === 'credit_pack' || item.type === 'custom_credits');
    if (hasSubscription && hasOneTime) {
      toast.error("Cannot mix subscriptions and one-time credit purchases in one checkout. Please check out separately.");
      return;
    }

    const trialVariations = new Set(cart.map(item => item.trialDays || 0));
    if (trialVariations.size > 1) {
      toast.error("Cannot mix trial and non-trial plans in one checkout.");
      return;
    }

    const itemsToCheckout = cart.map(item => {
      if (item.type === 'credit_pack') {
        return {
          id: item.planId,
          type: 'credit_pack' as const,
          interval: 'one_time' as const,
          period: 'one_time' as const,
          price: item.price,
          name: item.name,
          tier: item.tierName,
          currency: item.currency,
        };
      }
      if (item.type === 'custom_credits') {
        return {
          type: 'custom_credits' as const,
          tool_id: item.toolId,
          credit_amount: item.creditAmount,
          interval: 'one_time' as const,
          period: 'one_time' as const,
          price: item.price,
          name: item.name,
          tier: item.tierName,
          currency: item.currency,
        };
      }
      const mappedInterval = item.period.includes('year') ? 'yearly' : (item.period.includes('one_time') ? 'one_time' : 'monthly');
      return {
        id: item.planId,
        type: item.type === 'app' ? 'plan' : item.type,
        interval: mappedInterval,
        period: mappedInterval,
        price: item.price,
        name: item.name,
        tier: item.tierName,
        tierName: item.tierName,
        features: item.features,
        limits: item.limits,
        currency: item.currency,
        creditsPerPeriod: item.creditsPerPeriod,
        creditsPeriodUnit: item.creditsPeriodUnit,
        trialDays: item.trialDays,
        trialCredits: item.trialCredits,
        trialCreditsPeriodUnit: item.trialCreditsPeriodUnit,
      };
    });

    const firstInterval = itemsToCheckout[0].interval;
    if (itemsToCheckout.some(i => i.interval !== firstInterval)) {
      toast.error("Cannot mix billing intervals in one checkout.");
      return;
    }

    const firstCurrency = cart[0].currency || 'USD';
    if (cart.some(item => (item.currency || 'USD') !== firstCurrency)) {
      toast.error("Cannot mix currencies in one checkout.");
      return;
    }

    navigate('/checkout', { state: { items: itemsToCheckout } });
  };

  const handleSubscriptionChange = async () => {
    const changeItems = cart.filter(item => item.subscriptionId);
    if (changeItems.length === 0) return;

    setChangingSubId('processing');
    try {
      for (const item of changeItems) {
        const mappedInterval = item.period.includes('year') ? 'yearly' : (item.period.includes('one_time') ? 'one_time' : 'monthly');
        await BillingService.updateSubscription(item.subscriptionId!, [{
          id: item.planId,
          type: (item.type === 'app' ? 'plan' : item.type) as 'plan' | 'bundle',
          interval: mappedInterval as 'monthly' | 'yearly' | 'one_time'
        }]);
      }

      const hasUpgrade = changeItems.some(i => i.isUpgrade);
      const hasDowngrade = changeItems.some(i => i.isDowngrade);

      if (hasUpgrade) {
        toast.success("Upgrade applied");
      } else if (hasDowngrade) {
        toast.success("Downgrade scheduled for end of cycle");
      }

      setCart([]);
      await fetchSubscriptions();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update subscription");
    } finally {
      setChangingSubId(null);
    }
  };

  const handleBundleClick = (bundleId: string) => {
    setExpandedBundle(expandedBundle === bundleId ? null : bundleId);
  };

  const handleAppClick = (appId: string) => {
    setExpandedApp(expandedApp === appId ? null : appId);
  };

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInsideCard = target.closest('[data-card]');
    const isInsideCart = target.closest('[data-cart]');

    if (!isInsideCard && !isInsideCart) {
      setExpandedBundle(null);
      setExpandedApp(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [handleOutsideClick]);

  if (isLoading) {
    return (
      <div className="flex-1 container py-8">
        <div className="mb-8 text-center space-y-2 flex flex-col items-center">
          <Skeleton className="h-10 w-[250px]" />
          <Skeleton className="h-5 w-[400px]" />
        </div>
        <div className="w-full max-w-md mx-auto mb-8 h-10 bg-muted/50 rounded-lg" />
        <div className="grid gap-6 items-start md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <BundleCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className={cn("flex-1 container py-8", enableTransition && "transition-[padding] duration-300", isCartOpen ? "pr-[340px]" : "pr-4")}>
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold">{t('pages.plans.title')}</h1>
            <p className="mt-2 text-muted-foreground">
              {t('pages.plans.subtitle')}
            </p>
          </div>

          <WalletStrip apps={enrichedApps} onJumpToApp={(appId) => {
            setActiveTab('apps');
            setExpandedApp(appId);
            requestAnimationFrame(() => {
              const el = document.getElementById(`app-card-${appId}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto mb-8 grid-cols-2">
              <TabsTrigger value="bundles">{t('pages.plans.bundles')}</TabsTrigger>
              <TabsTrigger value="apps">{t('pages.plans.individualApps')}</TabsTrigger>
            </TabsList>

            <TabsContent value="bundles" className="space-y-12">
              <section>
                <div className="mb-6 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">{t('pages.plans.availableBundles')}</h2>
                </div>
                <div className={cn("grid gap-6 items-start", isCartOpen ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
                  {allBundles.map((bundle) => {
                    const activeSub = currentSubscriptions.find(s =>
                      ['active', 'trialing', 'past_due'].includes(s.status) &&
                      (s.bundle?.group?.id === bundle.id || s.upcoming_bundle?.group?.id === bundle.id)
                    );
                    return (
                      <BundleCard
                        key={bundle.id}
                        bundle={bundle}
                        isExpanded={expandedBundle === bundle.id}
                        onToggle={() => handleBundleClick(bundle.id)}
                        onToggleCartItem={toggleCartItem}
                        isInCart={isInCart}
                        hasAnyTierInCart={hasAnyTierInCart}
                        currentSubscription={activeSub}
                        compact
                      />
                    );
                  })}
                  {allBundles.length === 0 && (
                    <div className="col-span-full text-center text-muted-foreground py-8">
                      No bundles available right now.
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="apps" className="space-y-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">{t('pages.plans.individualAppsTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('pages.plans.individualAppsDesc')}
                </p>
              </div>
              <div className={cn("grid gap-6 items-start", isCartOpen ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
                {enrichedApps.map((app) => {
                  const activeSub = currentSubscriptions.find(s =>
                    ['active', 'trialing', 'past_due'].includes(s.status) &&
                    (s.plan?.tool?.id === app.id || s.upcoming_plan?.tool?.id === app.id)
                  );
                  return (
                    <AppCard
                      key={app.id}
                      app={app}
                      isExpanded={expandedApp === app.id}
                      onToggle={() => handleAppClick(app.id)}
                      onToggleCartItem={toggleCartItem}
                      isInCart={isInCart}
                      hasAnyTierInCart={hasAnyTierInCart}
                      currentSubscription={activeSub}
                      onStartTrial={handleStartTrial}
                      isStartingTrial={startingTrialToolId === app.id}
                    />
                  );
                })}
                {apps.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    No apps available right now.
                  </div>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </div>
      </div>

      <button
        onClick={() => setIsCartOpen(!isCartOpen)}
        className={cn(
          "fixed z-50 flex items-center gap-2 rounded-full shadow-lg",
          enableTransition && "transition-all duration-300",
          isCartOpen
            ? "right-[336px] top-4 bg-muted/80 backdrop-blur-sm px-3 py-2 text-muted-foreground hover:bg-muted"
            : "right-4 bottom-4 bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isCartOpen ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <>
            <ShoppingCart className="h-5 w-5" />
            {cartItemCount > 0 && (
              <Badge variant="secondary" className="bg-background text-foreground">
                {cartItemCount}
              </Badge>
            )}
            <span className="font-medium">{formatPrice(cartTotal, cartCurrency)}</span>
          </>
        )}
      </button>

      <div
        data-cart
        className={cn(
          "fixed right-0 bottom-0 h-screen border-l bg-background/95 backdrop-blur-sm shadow-xl flex flex-col z-40 ease-in-out",
          enableTransition && "transition-all duration-300",
          isCartOpen ? "w-80 translate-x-0" : "w-80 translate-x-full"
        )}
      >
        <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Selected plans</h2>
              <p className="text-xs text-muted-foreground">
                {cartItemCount === 0
                  ? "No items selected"
                  : `${cartItemCount} item${cartItemCount === 1 ? '' : 's'} selected`}
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {cart.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <div className="rounded-full bg-muted/50 p-4 w-fit mx-auto mb-4">
                  <ShoppingCart className="h-8 w-8 opacity-40" />
                </div>
                <p className="text-sm font-medium">No plans selected</p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                  Click a plan, bundle, or credit pack to add it.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <CartSidebarItem
                    key={`${item.id}-${item.tierName}`}
                    item={item}
                    onRemove={removeFromCart}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {cart.length > 0 && (
          <div className="p-4 border-t bg-gradient-to-t from-muted/30 to-transparent space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {hasSubscriptionChanges ? "New price" : "Total"}
              </span>
              <span className="text-2xl font-bold tracking-tight">
                {formatPrice(cartTotal, cartCurrency)}
              </span>
            </div>

            {hasSubscriptionChanges && (
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubscriptionChange}
                disabled={changingSubId === 'processing'}
              >
                {changingSubId === 'processing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {cart.some(i => i.isUpgrade) ? "Confirm upgrade" : "Confirm downgrade"}
              </Button>
            )}

            {hasNewItems && (
              <Button className="w-full" size="lg" onClick={handleCheckout}>
                Proceed to checkout
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setCart([])}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove all
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function WalletStrip({ apps, onJumpToApp }: { apps: App[]; onJumpToApp: (appId: string) => void }) {
  const formatPeriodEnd = (iso?: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  const eligible = apps.filter(
    (a) => a.wallet || (a.creditPacks && a.creditPacks.length > 0) || a.customCredits,
  );
  if (eligible.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl border bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Coins className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Your Credits</p>
        <span className="text-xs text-muted-foreground">across enabled tools</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {eligible.map((app) => {
          const owned = !!app.wallet;
          const balance = app.wallet?.total_available ?? 0;
          const periodEnd = formatPeriodEnd(app.wallet?.plan_period_end);
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onJumpToApp(app.id)}
              className={cn(
                'group flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                owned
                  ? 'bg-background hover:border-primary/60 hover:shadow-sm'
                  : 'bg-muted/20 border-dashed opacity-80 hover:opacity-100 hover:border-primary/40',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                  owned ? 'bg-primary/10 border border-primary/20' : 'bg-muted',
                )}
              >
                <Coins className={cn('h-4 w-4', owned ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight truncate">{app.name}</p>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className={cn('text-base font-semibold tabular-nums', !owned && 'text-muted-foreground')}>
                    {balance}
                  </span>
                  <span className="text-xs text-muted-foreground">credits</span>
                </div>
                {owned && periodEnd ? (
                  <p className="text-[10px] text-muted-foreground mt-0.5">resets {periodEnd}</p>
                ) : !owned ? (
                  <p className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-0.5">
                    <Plus className="h-2.5 w-2.5" /> buy below
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
