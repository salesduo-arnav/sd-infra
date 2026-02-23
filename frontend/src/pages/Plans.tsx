import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp, ShoppingCart, X, Trash2, ChevronRight, Loader2, ArrowUp, ArrowDown } from "lucide-react";
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
import { PublicBundleGroup, PublicBundlePlan } from "@/services/public.service";
import { useNavigate } from "react-router-dom";
import * as BillingService from "@/services/billing.service";
import { transformBundles, transformPlansToApps, enrichAppsWithEligibility } from "@/components/plans/utils";
import { Subscription } from '@/types/subscription';

import { useAuth } from "@/contexts/AuthContext";

export default function Plans() {
  const { activeOrganization } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState("bundles");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentSubscriptions, setCurrentSubscriptions] = useState<Subscription[]>([]);
  const [changingSubId, setChangingSubId] = useState<string | null>(null);
  const [trialEligibility, setTrialEligibility] = useState<Record<string, { eligible: boolean; trialDays: number }>>({}); 
  const [startingTrialToolId, setStartingTrialToolId] = useState<string | null>(null);

  // Transition state
  const [enableTransition, setEnableTransition] = useState(false);

  // Data State
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

            // Transform Bundles
            const transformedBundles = transformBundles(publicBundles);
            setBundles(transformedBundles);

            // Transform Apps
            const initialApps = transformPlansToApps(publicPlans);
            setApps(initialApps);

            // Check eligibility
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
            toast.error("Failed to load plans.");
        } finally {
            setIsLoading(false);
            // Enable transitions
            setTimeout(() => setEnableTransition(true), 100);
        }
    };

    fetchData();
  }, [activeOrganization]);

  const allBundles = bundles;

  // Enrich apps
  const enrichedApps = enrichAppsWithEligibility(apps, trialEligibility);

  const handleStartTrial = async (toolId: string) => {
    const app = enrichedApps.find(a => a.id === toolId);
    if (!app) return;

    // Card required: add to cart
    if (app.trialCardRequired && app.trialPlanId) {
        if (isInCart(app.id, 'Trial')) {
            // Open cart
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
            trialDays: app.trialDays
        };
        toggleCartItem(trialItem);
        setIsCartOpen(true);
        return;
    }

    // No card required: start immediately
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
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error((error as any)?.response?.data?.message || 'Failed to start trial');
    } finally {
      setStartingTrialToolId(null);
    }
  };

  // Cart helpers
  const hasSubscriptionChanges = cart.some(item => item.isUpgrade || item.isDowngrade);
  const hasNewItems = cart.some(item => !item.isUpgrade && !item.isDowngrade);

  // Toggle cart item
  const toggleCartItem = (item: CartItem) => {
    // Exact match check
    const exactMatch = cart.find(
      (cartItem) => cartItem.id === item.id && cartItem.tierName === item.tierName
    );

    if (exactMatch) {
      // Toggle off
      setCart((prev) => prev.filter((cartItem) => !(cartItem.id === item.id && cartItem.tierName === item.tierName)));
    } else {
      // Replace existing tier
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

    // Validate mixed trials
    const trialVariations = new Set(cart.map(item => item.trialDays || 0));
    if (trialVariations.size > 1) {
        toast.error("Please checkout plans with different trial periods separately.");
        return;
    }

    const itemsToCheckout = cart.map(item => {
        const mappedInterval = item.period.includes('year') ? 'yearly' : (item.period.includes('one_time') ? 'one_time' : 'monthly');
        return {
            id: item.planId,
            type: item.type === 'app' ? 'plan' : item.type,
            interval: mappedInterval,
            period: mappedInterval,
            price: item.price,
            name: item.name,
            tier: item.tierName,
            features: item.features,
            limits: item.limits,
            currency: item.currency
        };
    });
    
    // Check mixed intervals
    const firstInterval = itemsToCheckout[0].interval;
    if (itemsToCheckout.some(i => i.interval !== firstInterval)) {
        toast.error("Please checkout monthly and yearly plans separately.");
        return;
    }

    // Check mixed currencies
    const firstCurrency = cart[0].currency || 'USD';
    if (cart.some(item => (item.currency || 'USD') !== firstCurrency)) {
        toast.error("Please checkout plans with the same currency together.");
        return;
    }

    navigate('/checkout', { state: { items: itemsToCheckout } });
  };

  // Handle subscription change
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

  // Outside click handler
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    // Check if click is inside card or cart
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
        {/* Content */}
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

            {/* Bundles */}
            <TabsContent value="bundles" className="space-y-12">
              {/* All Bundles */}
              <section>
                <div className="mb-6 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Available Bundles</h2>
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
                          No bundles available at the moment.
                      </div>
                  )}
                </div>
              </section>
            </TabsContent>

            {/* Apps */}
            <TabsContent value="apps" className="space-y-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Individual Apps</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Purchase individual tools with flexible tier options
                </p>
              </div>
              <div className={cn("grid gap-6 items-start", isCartOpen ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
                {enrichedApps.map((app) => {
                    // Check active subscription
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
                          No apps available at the moment.
                      </div>
                  )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

        {/* Mobile Cart Button */}
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

        {/* Cart Sidebar */}
        <div
          data-cart
          className={cn(
            "fixed right-0 bottom-0 h-screen border-l bg-background/95 backdrop-blur-sm shadow-xl flex flex-col z-40 ease-in-out",
            enableTransition && "transition-all duration-300",
            isCartOpen ? "w-80 translate-x-0" : "w-80 translate-x-full"
          )}
        >
          {/* Header */}
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

          {/* Content */}
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

          {/* Footer */}
          {cart.length > 0 && (
            <div className="p-4 border-t bg-gradient-to-t from-muted/30 to-transparent space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {hasSubscriptionChanges ? "New Price" : "Monthly Total"}
                </span>
                <span className="text-2xl font-bold tracking-tight">
                  {formatPrice(cartTotal, cartCurrency)}
                </span>
              </div>

              {/* Subscription actions */}
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

              {/* Checkout */}
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
    </>
  );
}
