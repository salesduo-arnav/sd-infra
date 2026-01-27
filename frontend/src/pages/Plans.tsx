import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp, ShoppingCart, X, Trash2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
  apps: string[];
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

const bundles: Bundle[] = [
  {
    id: "content-creator",
    name: "Content Creator Bundle",
    description: "Everything you need to create compelling product content",
    apps: ["Listing Content Generator", "Image Editor & Optimizer", "A+ Content Builder"],
    icon: <Sparkles className="h-5 w-5" />,
    popular: true,
    tiers: [
      { name: "Basic", price: 49, period: "/month", limits: "50 listings/month" },
      { name: "Pro", price: 99, period: "/month", limits: "200 listings/month" },
      { name: "Unlimited", price: 179, period: "/month", limits: "Unlimited listings" },
    ],
  },
  {
    id: "analytics",
    name: "Analytics Bundle",
    description: "Deep insights into your Amazon business performance",
    apps: ["Sales Analytics", "Keyword Tracker", "Competitor Monitor", "Profit Calculator"],
    icon: <Zap className="h-5 w-5" />,
    tiers: [
      { name: "Basic", price: 59, period: "/month", limits: "5 products tracked" },
      { name: "Pro", price: 119, period: "/month", limits: "50 products tracked" },
      { name: "Unlimited", price: 199, period: "/month", limits: "Unlimited tracking" },
    ],
  },
  {
    id: "automation",
    name: "Automation Bundle",
    description: "Automate repetitive tasks and save hours every week",
    apps: ["Auto-Repricer", "Inventory Manager", "Review Requester", "Order Tracker"],
    icon: <Star className="h-5 w-5" />,
    tiers: [
      { name: "Basic", price: 69, period: "/month", limits: "100 SKUs" },
      { name: "Pro", price: 139, period: "/month", limits: "500 SKUs" },
      { name: "Unlimited", price: 229, period: "/month", limits: "Unlimited SKUs" },
    ],
  },
  {
    id: "full-suite",
    name: "Full Suite Bundle",
    description: "Complete access to all tools and features",
    apps: ["All Content Tools", "All Analytics Tools", "All Automation Tools", "Priority Support"],
    icon: <Crown className="h-5 w-5" />,
    popular: true,
    tiers: [
      { name: "Team", price: 299, period: "/month", limits: "Up to 5 users" },
      { name: "Business", price: 499, period: "/month", limits: "Up to 15 users" },
      { name: "Enterprise", price: 799, period: "/month", limits: "Unlimited users" },
    ],
  },
  {
    id: "starter",
    name: "Starter Bundle",
    description: "Perfect for new sellers just getting started",
    apps: ["Listing Content Generator", "Basic Analytics"],
    icon: <Package className="h-5 w-5" />,
    tiers: [
      { name: "Basic", price: 29, period: "/month", limits: "25 listings/month" },
      { name: "Pro", price: 49, period: "/month", limits: "75 listings/month" },
    ],
  },
];

const apps: App[] = [
  {
    id: "listing-generator",
    name: "Listing Content Generator",
    description: "AI-powered product listing creation with optimized titles, bullets, and descriptions",
    icon: <FileText className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 19, period: "/month", limits: "25 listings/month" },
      { name: "Pro", price: 29, period: "/month", limits: "100 listings/month" },
      { name: "Unlimited", price: 49, period: "/month", limits: "Unlimited listings" },
    ],
    features: ["AI-powered content", "SEO optimization", "Multiple variations", "Export to Amazon"],
    status: "available",
  },
  {
    id: "image-editor",
    name: "Image Editor & Optimizer",
    description: "Professional image editing and optimization for your product photos",
    icon: <ImageIcon className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 14, period: "/month", limits: "50 images/month" },
      { name: "Pro", price: 19, period: "/month", limits: "200 images/month" },
      { name: "Unlimited", price: 34, period: "/month", limits: "Unlimited images" },
    ],
    features: ["Background removal", "Image enhancement", "Batch processing", "Format optimization"],
    status: "available",
  },
  {
    id: "keyword-tracker",
    name: "Keyword Tracker",
    description: "Track your product rankings for important keywords",
    icon: <TrendingUp className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 19, period: "/month", limits: "50 keywords" },
      { name: "Pro", price: 24, period: "/month", limits: "200 keywords" },
      { name: "Unlimited", price: 44, period: "/month", limits: "Unlimited keywords" },
    ],
    features: ["Real-time tracking", "Competitor analysis", "Historical data", "Ranking alerts"],
    status: "coming-soon",
  },
  {
    id: "sales-analytics",
    name: "Sales Analytics",
    description: "Comprehensive sales analytics and reporting dashboard",
    icon: <BarChart className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 24, period: "/month", limits: "Basic reports" },
      { name: "Pro", price: 34, period: "/month", limits: "Advanced reports" },
      { name: "Unlimited", price: 54, period: "/month", limits: "Custom dashboards" },
    ],
    features: ["Sales reports", "Profit tracking", "Trend analysis", "Custom dashboards"],
    status: "coming-soon",
  },
  {
    id: "inventory-manager",
    name: "Inventory Manager",
    description: "Smart inventory management with automated restock alerts",
    icon: <Package className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 29, period: "/month", limits: "100 SKUs" },
      { name: "Pro", price: 39, period: "/month", limits: "500 SKUs" },
      { name: "Unlimited", price: 59, period: "/month", limits: "Unlimited SKUs" },
    ],
    features: ["Stock tracking", "Restock alerts", "Multi-warehouse", "FBA integration"],
    status: "coming-soon",
  },
  {
    id: "competitor-monitor",
    name: "Competitor Monitor",
    description: "Monitor competitor prices, listings, and strategies",
    icon: <Sparkles className="h-5 w-5" />,
    tiers: [
      { name: "Starter", price: 34, period: "/month", limits: "10 competitors" },
      { name: "Pro", price: 44, period: "/month", limits: "50 competitors" },
      { name: "Unlimited", price: 64, period: "/month", limits: "Unlimited competitors" },
    ],
    features: ["Price tracking", "Listing changes", "Review monitoring", "Market insights"],
    status: "coming-soon",
  },
];

const popularBundleIds = ["content-creator", "full-suite"];

export default function Plans() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeTab, setActiveTab] = useState("bundles");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(true);

  const popularBundles = bundles.filter((b) => popularBundleIds.includes(b.id));
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
              {/* Popular Bundles */}
              <section>
                <div className="mb-6 flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  <h2 className="text-xl font-semibold">Popular Bundles</h2>
                </div>
                <div className={cn("grid gap-6", isCartOpen ? "md:grid-cols-1 lg:grid-cols-2" : "md:grid-cols-2")}>
                  {popularBundles.map((bundle) => (
                    <BundleCard
                      key={bundle.id}
                      bundle={bundle}
                      isExpanded={expandedBundle === bundle.id}
                      onToggle={() => handleBundleClick(bundle.id)}
                      onToggleCartItem={toggleCartItem}
                      isInCart={isInCart}
                      hasAnyTierInCart={hasAnyTierInCart}
                    />
                  ))}
                </div>
              </section>

              {/* All Bundles */}
              <section>
                <div className="mb-6 flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">All Bundles</h2>
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
                  <p className="text-sm font-medium">No Plns Selected</p>
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
            {bundle.apps.slice(0, compact ? 3 : bundle.apps.length).map((app) => (
              <li key={app} className="flex items-center gap-2 text-sm">
                <Check className="h-3 w-3 text-primary shrink-0" />
                <span className="truncate">{app}</span>
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
                      id: bundle.id,
                      type: "bundle",
                      name: bundle.name,
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
        {!isExpanded && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Starting from</p>
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
          </ul>
        </div>

        {/* Pricing Tiers */}
        {isExpanded && !isComingSoon && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Select a Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
            </p>
            {app.tiers.map((tier) => {
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
            })}
          </div>
        )}

        {/* Price Range Preview */}
        {!isExpanded && (
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
