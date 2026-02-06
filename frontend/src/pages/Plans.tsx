import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp, ShoppingCart, X, Trash2, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as PublicService from "@/services/public.service";
import { Tool, Feature } from "@/services/admin.service";
import { toast } from "sonner";

interface BundleTier {
  name: string;
  price: number;
  period: string;
  limits: string;
}

interface Bundle {
  id: string;
  name: string;
  description: string;
  apps: { name: string; features: string[] }[];
  tiers: BundleTier[];
  popular?: boolean;
  icon: React.ReactNode;
}

interface AppTier {
  name: string;
  price: number;
  period: string;
  limits: string;
}

interface App {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  tiers: AppTier[];
  features: string[];
  status: "available" | "coming-soon";
}

interface CartItem {
  id: string;
  type: "bundle" | "app";
  name: string;
  tierName: string;
  price: number;
  period: string;
}

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

export default function Plans() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState("bundles");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(true);

  // Dynamic Data State
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [publicBundles, publicPlans] = await Promise.all([
                PublicService.getPublicBundles(),
                PublicService.getPublicPlans()
            ]);

            // Transform Bundle Groups into Bundle UI Model
            // @ts-ignore
            const transformedBundles: Bundle[] = publicBundles.map((group: any) => {
                // Use the first tier to get the "apps" list, assuming all tiers in a group have same apps (usually true for simple tiers)
                // If tiers can have different apps, we might need a union or just take the first one's apps.
                // Or better, we define specific apps at the group level contextually, but here we derive from the first bundle.
                const firstBundle = group.bundles && group.bundles.length > 0 ? group.bundles[0] : null;
                const apps = firstBundle ? firstBundle.bundle_plans.map((bp: any) => ({
                    name: bp.plan.tool?.name || "Unknown App",
                    features: bp.plan.tool?.features?.map((f: any) => f.name) || []
                })) : [];

                return {
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    apps: apps,
                    tiers: group.bundles.map((b: any) => ({
                        name: b.tier_label || b.name, // Use label vs name fallback
                        price: b.price,
                        period: "/" + b.interval,
                        limits: b.description || "Full access" // Use description as limits/details
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
                        status: tool.is_active ? "available" : "coming-soon"
                    });
                }

                const app = appsMap.get(tool.id)!;
                app.tiers.push({
                    name: plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1), // Capitalize
                    price: plan.price,
                    period: "/" + plan.interval,
                    limits: plan.description || "See details"
                });
            });

            setApps(Array.from(appsMap.values()));

        } catch (error) {
            console.error("Failed to fetch plans data", error);
            toast.error("Failed to load plans.");
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
  }, []);

  const popularBundles = bundles; // For now show all as popular or filter if needed
  const allBundles = bundles;

  /**
   * Toggle a tier in the cart.
   * - If the same tier is already in cart, remove it (toggle off)
   * - If a different tier from the same bundle/app is in cart, replace it
   * - Otherwise, add the new tier
   */
  const toggleCartItem = (item: CartItem) => {
    setCart((prev) => {
      // Check if this exact tier is already in cart
      const exactMatch = prev.find(
        (cartItem) => cartItem.id === item.id && cartItem.tierName === item.tierName
      );

      if (exactMatch) {
        // Toggle off - remove from cart
        return prev.filter((cartItem) => !(cartItem.id === item.id && cartItem.tierName === item.tierName));
      }

      // Remove any existing tier from the same bundle/app, then add the new one
      const filtered = prev.filter((cartItem) => cartItem.id !== item.id);
      return [...filtered, item];
    });
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
    <Layout>
      <div className="flex">
        {/* Main Content */}
        <div className={cn("flex-1 container py-8 transition-all duration-300", isCartOpen ? "pr-[340px]" : "pr-4")}>
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
                  {allBundles.map((bundle) => (
                    <BundleCard
                      key={bundle.id}
                      bundle={bundle}
                      isExpanded={expandedBundle === bundle.id}
                      onToggle={() => handleBundleClick(bundle.id)}
                      onToggleCartItem={toggleCartItem}
                      isInCart={isInCart}
                      hasAnyTierInCart={hasAnyTierInCart}
                      compact
                    />
                  ))}
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
                {apps.map((app) => (
                  <AppCard
                    key={app.id}
                    app={app}
                    isExpanded={expandedApp === app.id}
                    onToggle={() => handleAppClick(app.id)}
                    onToggleCartItem={toggleCartItem}
                    isInCart={isInCart}
                    hasAnyTierInCart={hasAnyTierInCart}
                  />
                ))}
                 {apps.length === 0 && (
                      <div className="col-span-full text-center text-muted-foreground py-8">
                          No apps available at the moment.
                      </div>
                  )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Minimized Cart Floating Button */}
        <button
          onClick={() => setIsCartOpen(!isCartOpen)}
          className={cn(
            "fixed z-50 flex items-center gap-2 rounded-full shadow-lg transition-all duration-300",
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
            "fixed right-0 top-0 h-screen border-l bg-background/95 backdrop-blur-sm shadow-xl flex flex-col z-40 transition-all duration-300 ease-in-out",
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
                      className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 transition-all duration-200 hover:border-primary/20"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0"
                          >
                            {item.tierName}
                          </Badge>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
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
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Cart Footer */}
          {cart.length > 0 && (
            <div className="p-4 border-t bg-gradient-to-t from-muted/30 to-transparent space-y-4">
              {/* <Separator /> */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monthly Total</span>
                <span className="text-2xl font-bold tracking-tight">
                  ${cartTotal.toFixed(2)}
                </span>
              </div>
              <Button className="w-full" size="lg">
                Proceed to Checkout
              </Button>
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
      </div>
    </Layout>
  );
}

interface BundleCardProps {
  bundle: Bundle;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
  compact?: boolean;
}

function BundleCard({ bundle, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart, compact }: BundleCardProps) {
  const hasTierSelected = hasAnyTierInCart(bundle.id);
  return (
    <Card
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg"
          : "hover:border-primary/50 hover:shadow-md",
        bundle.popular && !isExpanded && "border-primary/30",
        hasTierSelected && !isExpanded && "border-primary/50 bg-primary/5"
      )}
      onClick={onToggle}
    >
      {bundle.popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500">
          <Star className="mr-1 h-3 w-3 fill-white" />
          Best Value
        </Badge>
      )}
      <CardHeader className={compact ? "pb-3" : ""}>
        <CardTitle className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-lg p-2",
              isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {bundle.icon}
          </span>
          <span className={compact ? "text-base" : ""}>{bundle.name}</span>
        </CardTitle>
        <CardDescription className={compact ? "text-xs" : ""}>{bundle.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Included Apps */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Included Apps</p>
          <ul className={cn("space-y-1", compact && "text-sm")}>
            {bundle.apps.slice(0, compact ? 3 : bundle.apps.length).map((app, idx) => (
              <li key={idx} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate font-medium">{app.name}</span>
                </div>
                {/* Display key features if any */}
                {app.features.length > 0 && (
                    <div className="pl-5 text-xs text-muted-foreground truncate">
                        {app.features.slice(0, 2).join(", ")}
                        {app.features.length > 2 && "..."}
                    </div>
                )}
              </li>
            ))}
            {compact && bundle.apps.length > 3 && (
              <li className="text-xs text-muted-foreground">+{bundle.apps.length - 3} more</li>
            )}
          </ul>
        </div>

        {/* Pricing Tiers */}
        {isExpanded && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Select a Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
            </p>
            {bundle.tiers.map((tier) => {
              const inCart = isInCart(bundle.id, tier.name);
              return (
                <div
                  key={tier.name}
                  onClick={() =>
                    onToggleCartItem({
                      id: bundle.id, // Group ID
                      type: "bundle",
                      name: bundle.name, // Group Name
                      tierName: tier.name,
                      price: tier.price,
                      period: tier.period,
                    })
                  }
                  className={cn(
                    "group flex items-center justify-between rounded-lg border p-3 transition-all duration-200 cursor-pointer",
                    inCart
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "hover:bg-muted/50 hover:border-primary/50"
                  )}
                >
                  <div>
                    <p className="font-medium">{tier.name}</p>
                    <p className="text-xs text-muted-foreground">{tier.limits}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">
                        ${tier.price}
                        <span className="text-xs text-muted-foreground">{tier.period}</span>
                      </p>
                    </div>
                    <Badge
                      variant={inCart ? "default" : "outline"}
                      className={cn(
                        "transition-all duration-200",
                        inCart
                          ? "bg-primary hover:bg-primary/80"
                          : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {inCart ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Selected
                        </>
                      ) : (
                        "Select"
                      )}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Price Range Preview */}
        {!isExpanded && bundle.tiers.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-lg font-bold">
              ${bundle.tiers[0].price}
              <span className="text-sm font-normal text-muted-foreground">{bundle.tiers[0].period}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AppCardProps {
  app: App;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
}

function AppCard({ app, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart }: AppCardProps) {
  const isComingSoon = app.status === "coming-soon";
  const hasTierSelected = hasAnyTierInCart(app.id);

  return (
    <Card
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200",
        isComingSoon && "opacity-70",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg"
          : !isComingSoon && "hover:border-primary/50 hover:shadow-md",
        hasTierSelected && !isExpanded && !isComingSoon && "border-primary/50 bg-primary/5"
      )}
      onClick={!isComingSoon ? onToggle : undefined}
    >
      {isComingSoon && (
        <Badge className="absolute -top-3 right-4 bg-secondary">
          Coming Soon
        </Badge>
      )}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-lg p-2",
              isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {app.icon}
          </span>
          <span className="text-base">{app.name}</span>
        </CardTitle>
        <CardDescription className="text-xs">{app.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Features */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Key Features</p>
          <ul className="space-y-1">
            {app.features.slice(0, 3).map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm">
                <Check className="h-3 w-3 text-primary shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
            {app.features.length > 3 && (
              <li className="text-xs text-muted-foreground">+{app.features.length - 3} more</li>
            )}
            {app.features.length === 0 && (
                <li className="text-xs text-muted-foreground italic">No features listed</li>
            )}
          </ul>
        </div>

        {/* Pricing Tiers */}
        {isExpanded && !isComingSoon && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Select a Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
            </p>
            {app.tiers.length > 0 ? (
                app.tiers.map((tier) => {
                const inCart = isInCart(app.id, tier.name);
                return (
                    <div
                    key={tier.name}
                    onClick={() =>
                        onToggleCartItem({
                        id: app.id,
                        type: "app",
                        name: app.name,
                        tierName: tier.name,
                        price: tier.price,
                        period: tier.period,
                        })
                    }
                    className={cn(
                        "group flex items-center justify-between rounded-lg border p-3 transition-all duration-200 cursor-pointer",
                        inCart
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "hover:bg-muted/50 hover:border-primary/50"
                    )}
                    >
                    <div>
                        <p className="font-medium">{tier.name}</p>
                        <p className="text-xs text-muted-foreground">{tier.limits}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                        <p className="font-semibold">
                            ${tier.price}
                            <span className="text-xs text-muted-foreground">{tier.period}</span>
                        </p>
                        </div>
                        <Badge
                        variant={inCart ? "default" : "outline"}
                        className={cn(
                            "transition-all duration-200",
                            inCart
                            ? "bg-primary hover:bg-primary/80"
                            : "opacity-0 group-hover:opacity-100"
                        )}
                        >
                        {inCart ? (
                            <>
                            <Check className="h-3 w-3 mr-1" />
                            Selected
                            </>
                        ) : (
                            "Select"
                        )}
                        </Badge>
                    </div>
                    </div>
                );
                })
            ) : (
                <div className="text-sm text-muted-foreground">No plans available for this app yet.</div>
            )}
          </div>
        )}

        {/* Price Range Preview */}
        {!isExpanded && !isComingSoon && app.tiers.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Starting from</p>
            <p className="text-lg font-bold">
              ${app.tiers[0].price}
              <span className="text-sm font-normal text-muted-foreground">{app.tiers[0].period}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
