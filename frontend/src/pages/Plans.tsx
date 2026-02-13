import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp, ShoppingCart, X, Trash2, ChevronRight, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as PublicService from "@/services/public.service";
import { toast } from "sonner";
import { BundleCard } from "@/components/plans/BundleCard";
import { AppCard } from "@/components/plans/AppCard";
import { Bundle, App, CartItem } from "@/components/plans/types";
import { PublicBundleGroup, PublicBundlePlan } from "@/services/public.service";
import { useNavigate } from "react-router-dom";
import * as BillingService from "@/services/billing.service";

// Icons mapping helper
const getIconForSlug = (slug: string) => {
    if (slug.includes('generator') || slug.includes('content')) return <FileText className="h-5 w-5" />;
    if (slug.includes('image')) return <ImageIcon className="h-5 w-5" />;
    if (slug.includes('analytics') || slug.includes('tracker')) return <BarChart className="h-5 w-5" />;
    if (slug.includes('inventory')) return <Package className="h-5 w-5" />;
    if (slug.includes('competitor')) return <TrendingUp className="h-5 w-5" />;
    // Bundles
    if (slug.includes('creator')) return <Sparkles className="h-5 w-5" />;
    if (slug.includes('automation')) return <Zap className="h-5 w-5" />;
    if (slug.includes('full')) return <Crown className="h-5 w-5" />;
    return <Star className="h-5 w-5" />;
};

import { useAuth } from "@/contexts/AuthContext";

export default function Plans() {
  const { activeOrganization } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState("bundles");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentSubscriptions, setCurrentSubscriptions] = useState<any[]>([]);
  const [changingSubId, setChangingSubId] = useState<string | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<Record<string, { eligible: boolean; trialDays: number }>>({}); 
  const [startingTrialToolId, setStartingTrialToolId] = useState<string | null>(null);

  // State to control transitions - prevents initial load animation glitch
  const [enableTransition, setEnableTransition] = useState(false);

  // Dynamic Data State
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
            const [publicBundles, publicPlans] = await Promise.all([
                PublicService.getPublicBundles(),
                PublicService.getPublicPlans()
            ]);
            
            await fetchSubscriptions();

            // Transform Bundle Groups into Bundle UI Model
            const transformedBundles: Bundle[] = publicBundles.map((group: PublicBundleGroup) => {
                const firstBundle = group.bundles && group.bundles.length > 0 ? group.bundles[0] : null;

                const apps = firstBundle ? firstBundle.bundle_plans.map((bp: PublicBundlePlan) => ({
                    name: bp.plan.tool?.name || "Unknown App",
                    features: bp.plan.tool?.features?.map((f: { name: string }) => f.name) || []
                })) : [];

                return {
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    apps: apps,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tiers: group.bundles.map((b: any) => ({
                        id: b.id,
                        name: b.tier_label || b.name, // Use label vs name fallback
                        price: b.price,
                        period: "/" + b.interval,
                        limits: b.description || "Full access",
                        features: b.bundle_plans?.flatMap((bp: any) =>
                            bp.plan?.limits?.map((limit: any) => ({
                                name: limit.feature?.name || "Unknown Feature",
                                limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                                isEnabled: limit.is_enabled,
                                toolName: bp.plan?.tool?.name || "Unknown Tool"
                            })) || []
                        ) || []
                    })),
                    popular: false, 
                    icon: getIconForSlug(group.slug)
                };
            });
            setBundles(transformedBundles);

            // Transform Plans into Apps (grouped by Tool)
            const appsMap = new Map<string, App>();

            publicPlans.forEach(plan => {
                const tool = plan.tool;
                if (!tool) return;

                if (!appsMap.has(tool.id)) {
                    appsMap.set(tool.id, {
                        id: tool.id,
                        name: tool.name,
                        description: tool.description,
                        icon: getIconForSlug(tool.slug),
                        tiers: [],
                        features: tool.features?.map(f => f.name) || [],
                        status: tool.is_active ? "available" : "coming-soon",
                        trialDays: tool.trial_days || 0,
                        trialCardRequired: tool.trial_card_required
                    });
                }

                if (plan.is_trial_plan) {
                    // It's a trial plan
                    if (plan.price === 0) {
                        // Free trial plan - don't show in tiers, but store ID for trial logic
                        const app = appsMap.get(tool.id)!;
                        app.trialPlanId = plan.id;
                        app.trialPlanInterval = plan.interval;
                        app.trialPlanDescription = plan.description; // Store description for button
                        // Ensure trial days are consistent if available here
                        if (tool.trial_days) app.trialDays = tool.trial_days;
                    } else {
                        // Paid trial plan - show in tiers with special badge
                        const app = appsMap.get(tool.id)!;
                        app.tiers.push({
                            id: plan.id,
                            name: plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1), // Capitalize
                            price: plan.price,
                            period: "/" + plan.interval,
                            limits: plan.description || "See details",
                            features: plan.limits?.map((limit: any) => ({
                                name: limit.feature?.name || "Unknown Feature",
                                limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                                isEnabled: limit.is_enabled,
                                toolName: tool.name
                            })) || [],
                            isTrial: true,
                            trialDays: tool.trial_days
                        });
                    }
                } else {
                    const app = appsMap.get(tool.id)!;
                    app.tiers.push({
                        id: plan.id,
                        name: plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1), // Capitalize
                        price: plan.price,
                        period: "/" + plan.interval,
                        limits: plan.description || "See details",
                        features: plan.limits?.map((limit: any) => ({
                            name: limit.feature?.name || "Unknown Feature",
                            limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                            isEnabled: limit.is_enabled,
                            toolName: tool.name
                        })) || []
                    });
                }
            });

            setApps(Array.from(appsMap.values()));

            // Fetch trial eligibility for each tool
            const toolIds = Array.from(appsMap.keys());
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
            toast.error("Failed to load plans.");
        } finally {
            setIsLoading(false);
            // Enable transitions after a short delay to prevent initial layout shift animation
            setTimeout(() => setEnableTransition(true), 100);
        }
    };

    fetchData();
  }, [activeOrganization]);

  const allBundles = bundles;

  // Enrich apps with trial eligibility
  const enrichedApps = apps.map(app => {
    const eligibility = trialEligibility[app.id];
    const isEligible = eligibility?.eligible || false;
    
    // Filter and modify tiers based on eligibility
    const processedTiers = app.tiers
        .filter(tier => {
            // If eligible, keep everything.
            if (isEligible) return true;
            // If not eligible, remove free trial plans (price 0)
            return tier.price > 0;
        })
        .map(tier => {
             // If not eligible, convert paid trials to normal plans
             if (!isEligible && tier.isTrial) {
                 return { ...tier, isTrial: false, trialDays: 0 };
             }
             return tier;
        });

    return {
        ...app,
        tiers: processedTiers,
        trialDays: isEligible ? (eligibility?.trialDays || app.trialDays || 0) : 0,
        trialEligible: isEligible,
        trialCardRequired: app.trialCardRequired, 
        // Ensure trialPlanId is nulled if not eligible to prevent any trial logic
        trialPlanId: isEligible ? app.trialPlanId : undefined 
    };
  });

  const handleStartTrial = async (toolId: string) => {
    const app = enrichedApps.find(a => a.id === toolId);
    if (!app) return;

    // If card required, add to cart for checkout
    if (app.trialCardRequired && app.trialPlanId) {
        if (isInCart(app.id, 'Trial')) {
            // Already in cart, just open it
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
            period: app.trialPlanInterval ? `/${app.trialPlanInterval}` : `${app.trialDays} days`,
            features: [], // detailed features not strictly needed for cart logic currently
            limits: 'Free Trial',
            isUpgrade: false,
            isDowngrade: false,
            trialDays: app.trialDays
        };
        toggleCartItem(trialItem);
        setIsCartOpen(true);
        return;
    }

    // Direct start for no-card trials
    setStartingTrialToolId(toolId);
    try {
      await BillingService.startTrial(toolId);
      toast.success('Free trial started successfully!');
      await fetchSubscriptions();
      // Refresh eligibility
      setTrialEligibility(prev => ({
        ...prev,
        [toolId]: { ...prev[toolId], eligible: false }
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to start trial');
    } finally {
      setStartingTrialToolId(null);
    }
  };

  // Check if cart has any upgrade/downgrade items
  const hasSubscriptionChanges = cart.some(item => item.isUpgrade || item.isDowngrade);
  const hasNewItems = cart.some(item => !item.isUpgrade && !item.isDowngrade);

  /**
   * Toggle a tier in the cart.
   * - If the same tier is already in cart, remove it (toggle off)
   * - If a different tier from the same bundle/app is in cart, replace it
   * - Otherwise, add the new tier
   */
  const toggleCartItem = (item: CartItem) => {
    // Check if this exact tier is already in cart
    const exactMatch = cart.find(
      (cartItem) => cartItem.id === item.id && cartItem.tierName === item.tierName
    );

    if (exactMatch) {
      // Toggle off - remove from cart
      setCart((prev) => prev.filter((cartItem) => !(cartItem.id === item.id && cartItem.tierName === item.tierName)));
    } else {
      // Remove any existing tier from the same bundle/app, then add the new one
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
  const cartItemCount = cart.length;

  const handleCheckout = () => {
    if (cart.length === 0) return;

    // Validate mixed trial periods
    const trialVariations = new Set(cart.map(item => item.trialDays || 0));
    if (trialVariations.size > 1) {
        toast.error("Please checkout plans with different trial periods separately.");
        return;
    }

    const itemsToCheckout = cart.map(item => ({
        id: item.planId, // Use the specific Plan/Bundle Variant ID
        type: item.type === 'app' ? 'plan' : item.type, // Map 'app' to 'plan'
        interval: item.period.includes('year') ? 'yearly' : 'monthly',
        price: item.price,
        name: item.name,
        tier: item.tierName,
        features: item.features,
        limits: item.limits
    }));
    
    // Check mixed intervals
    const firstInterval = itemsToCheckout[0].interval;
    if (itemsToCheckout.some(i => i.interval !== firstInterval)) {
        toast.error("Please checkout monthly and yearly plans separately.");
        return;
    }

    navigate('/checkout', { state: { items: itemsToCheckout } });
  };

  /** Handle upgrade/downgrade via updateSubscription API */
  const handleSubscriptionChange = async () => {
    const changeItems = cart.filter(item => item.subscriptionId);
    if (changeItems.length === 0) return;

    setChangingSubId('processing');
    try {
        for (const item of changeItems) {
            const interval = item.period.includes('year') ? 'yearly' : 'monthly';
            await BillingService.updateSubscription(item.subscriptionId!, [{
                id: item.planId,
                type: (item.type === 'app' ? 'plan' : item.type) as 'plan' | 'bundle',
                interval: interval as 'monthly' | 'yearly'
            }]);
        }
        
        const hasUpgrade = changeItems.some(i => i.isUpgrade);
        const hasDowngrade = changeItems.some(i => i.isDowngrade);
        
        if (hasUpgrade) {
            toast.success("Subscription upgraded successfully!");
        } else if (hasDowngrade) {
            toast.success("Downgrade scheduled for next billing cycle.");
        }
        
        setCart([]);
        await fetchSubscriptions();
    } catch (error) {
        console.error(error);
        toast.error("Failed to update subscription.");
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

  // Close expanded cards when clicking outside
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Check if click is inside a card
    const isInsideCard = target.closest('[data-card]');
    // Check if click is inside the cart sidebar
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
          <Layout>
              <div className="flex h-[50vh] items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
          </Layout>
      )
  }

  return (
    <Layout animationClass="">
      <div className="flex animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Main Content */}
        <div className={cn("flex-1 container py-8", enableTransition && "transition-[padding] duration-300", isCartOpen ? "pr-[340px]" : "pr-4")}>
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold">Choose Your Plan</h1>
            <p className="mt-2 text-muted-foreground">
              Select bundles for best value or individual apps for flexibility
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto mb-8 grid-cols-2">
              <TabsTrigger value="bundles">Bundles</TabsTrigger>
              <TabsTrigger value="apps">Individual Apps</TabsTrigger>
            </TabsList>

            {/* Bundles Tab */}
            <TabsContent value="bundles" className="space-y-12">
              {/* All Bundles */}
              <section>
                <div className="mb-6 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Available Bundles</h2>
                </div>
                <div className={cn("grid gap-6", isCartOpen ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
                  {allBundles.map((bundle) => {
                      // Only consider active, trialing, or past_due subscriptions as "active" for the UI
                      const activeSub = currentSubscriptions.find(s => 
                        ['active', 'trialing', 'past_due'].includes(s.status) &&
                        (s.bundle?.bundle_group_id === bundle.id || s.upcoming_bundle?.bundle_group_id === bundle.id)
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
                          No bundles available at the moment.
                      </div>
                  )}
                </div>
              </section>
            </TabsContent>

            {/* All Apps Tab */}
            <TabsContent value="apps" className="space-y-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Individual Apps</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Purchase individual tools with flexible tier options
                </p>
              </div>
              <div className={cn("grid gap-6", isCartOpen ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
                {enrichedApps.map((app) => {
                    // Only consider active, trialing, or past_due subscriptions as "active" for the UI
                    const activeSub = currentSubscriptions.find(s => 
                        ['active', 'trialing', 'past_due'].includes(s.status) &&
                        (s.plan?.tool_id === app.id || s.upcoming_plan?.tool_id === app.id)
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
                          No apps available at the moment.
                      </div>
                  )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

        {/* Minimized Cart Floating Button */}
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
              <span className="font-medium">${cartTotal.toFixed(2)}</span>
            </>
          )}
        </button>

        {/* Sticky Cart Sidebar */}
        <div
          data-cart
          className={cn(
            "fixed right-0 bottom-0 h-screen border-l bg-background/95 backdrop-blur-sm shadow-xl flex flex-col z-40 ease-in-out",
            enableTransition && "transition-all duration-300",
            isCartOpen ? "w-80 translate-x-0" : "w-80 translate-x-full"
          )}
        >
          {/* Cart Header */}
          <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Selected Plans</h2>
                <p className="text-xs text-muted-foreground">
                  {cartItemCount === 0
                    ? "No items selected"
                    : `${cartItemCount} item${cartItemCount > 1 ? "s" : ""} selected`}
                </p>
              </div>
            </div>
          </div>

          {/* Cart Content */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {cart.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <div className="rounded-full bg-muted/50 p-4 w-fit mx-auto mb-4">
                    <ShoppingCart className="h-8 w-8 opacity-40" />
                  </div>
                  <p className="text-sm font-medium">No Plans Selected</p>
                  <p className="text-xs mt-1 text-muted-foreground/70">
                    Click on a tier to add it to selected plans
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div
                      key={`${item.id}-${item.tierName}`}
                      className="group flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 transition-all duration-200 hover:border-primary/20"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0"
                            >
                              {item.tierName}
                            </Badge>
                            {item.isUpgrade && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-600 border-0">
                                <ArrowUp className="h-2.5 w-2.5 mr-0.5" />
                                Upgrade
                              </Badge>
                            )}
                            {item.isDowngrade && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-orange-500/10 text-orange-600 border-0">
                                <ArrowDown className="h-2.5 w-2.5 mr-0.5" />
                                Downgrade
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm whitespace-nowrap">
                            ${item.price.toFixed(2)}
                            <span className="text-[10px] text-muted-foreground font-normal">{item.period}</span>
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeFromCart(item.id, item.tierName)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {/* Upgrade/Downgrade messaging */}
                      {item.isUpgrade && (
                        <p className="text-[11px] text-green-600 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1">
                          Pro-rated charge of ~${(item.price - (item.currentPrice ?? 0)).toFixed(2)} applies immediately
                        </p>
                      )}
                      {item.isDowngrade && (
                        <p className="text-[11px] text-orange-600 bg-orange-50 dark:bg-orange-950/30 rounded px-2 py-1">
                          You'll be charged ${item.price.toFixed(2)}{item.period} from next billing cycle
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Cart Footer */}
          {cart.length > 0 && (
            <div className="p-4 border-t bg-gradient-to-t from-muted/30 to-transparent space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {hasSubscriptionChanges ? "New Price" : "Monthly Total"}
                </span>
                <span className="text-2xl font-bold tracking-tight">
                  ${cartTotal.toFixed(2)}
                </span>
              </div>

              {/* Subscription change button */}
              {hasSubscriptionChanges && (
                <Button 
                  className="w-full" 
                  size="lg" 
                  onClick={handleSubscriptionChange}
                  disabled={changingSubId === 'processing'}
                >
                  {changingSubId === 'processing' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {cart.some(i => i.isUpgrade) ? 'Confirm Upgrade' : 'Confirm Downgrade'}
                </Button>
              )}

              {/* New subscription checkout button */}
              {hasNewItems && (
                <Button className="w-full" size="lg" onClick={handleCheckout}>
                  Proceed to Checkout
                </Button>
              )}

              <Button
                variant="outline"
                className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => setCart([])}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove all Plans
              </Button>
            </div>
          )}
        </div>
    </Layout>
  );
}
