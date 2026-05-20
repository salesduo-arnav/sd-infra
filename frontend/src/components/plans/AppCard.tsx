import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Coins, Sparkles } from "lucide-react";
import { App, AppCreditPack, AppCustomCreditPricing, CartItem } from "./types";
import { TierItem } from "./TierItem";
import { Subscription } from "@/types/subscription";
import { FeatureComparisonModal } from "./FeatureComparisonModal";
import { useMemo, useState } from "react";

interface AppCardProps {
  app: App;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
  currentSubscription?: Subscription | null;
  onStartTrial?: (toolId: string) => void;
  isStartingTrial?: boolean;
}

export function AppCard({ app, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart, currentSubscription, onStartTrial, isStartingTrial }: AppCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isComingSoon = app.status === "coming-soon";
  const hasTierSelected = hasAnyTierInCart(app.id);

  const currentPrice = currentSubscription?.plan?.price ?? 0;

  const formatPrice = (price: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
      }).format(price);
  };

  const hasCreditOffers = !!(app.creditPacks && app.creditPacks.length > 0) || !!app.customCredits;

  return (
    <Card
      id={`app-card-${app.id}`}
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200 scroll-mt-4",
        isComingSoon && "opacity-70",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg"
          : !isComingSoon && "hover:border-primary/50 hover:shadow-md",
        (hasTierSelected || currentSubscription) && !isExpanded && !isComingSoon && "border-primary/50 bg-primary/5"
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
              "rounded-lg p-2 transition-colors",
              isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {app.icon}
          </span>
          <span className="text-base">{app.name}</span>
           {!isExpanded && currentSubscription && (currentSubscription.status === 'active' || currentSubscription.status === 'trialing') && (
              <Badge variant="outline" className="ml-auto border-blue-500 text-blue-500">Active</Badge>
           )}
           {!isExpanded && !currentSubscription && app.wallet && (
              <Badge variant="outline" className="ml-auto gap-1">
                <Coins className="h-3 w-3 text-primary" />
                {app.wallet.total_available} credits
              </Badge>
           )}
        </CardTitle>
        <CardDescription className="text-xs">{app.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {!isComingSoon && (app.trialDays || 0) > 0 && !currentSubscription && app.trialEligible && (
          <div className={cn("transition-opacity duration-300", isExpanded ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex-1">
                  {app.trialDays}-day free trial available
                </span>
              </div>
          </div>
        )}

        {!isComingSoon && (
            <Collapsible open={isExpanded}>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="pt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Select a Subscription Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
                        </p>
            {app.tiers.length > 0 ? (
              app.tiers.map((tier) => {
                const inCart = isInCart(app.id, tier.name);
                const isOneTime = tier.period === '/one_time';
                const isCurrent = currentSubscription?.plan?.id === tier.id;
                const isUpcoming = currentSubscription?.upcoming_plan?.id === tier.id;
                const isUpgrade = !isOneTime && currentSubscription && tier.price > currentPrice && !isCurrent && !isUpcoming;
                const isDowngrade = !isOneTime && currentSubscription && tier.price < currentPrice && !isCurrent && !isUpcoming;

                return (
                  <TierItem
                    key={tier.id}
                    tier={tier}
                    isInCart={inCart}
                    isCurrent={isCurrent}
                    isUpcoming={isUpcoming}
                    isUpgrade={!!isUpgrade}
                    isDowngrade={!!isDowngrade}
                    onSelect={
                      (isCurrent || isUpcoming)
                        ? undefined
                        : () =>
                            onToggleCartItem({
                              id: app.id,
                              planId: tier.id,
                              type: "app",
                              name: app.name,
                              tierName: tier.name,
                              price: tier.price,
                              currency: tier.currency || 'USD',
                              period: tier.period,
                              limits: tier.limits,
                              features: tier.features,
                              ...(currentSubscription
                                ? {
                                    isUpgrade: !!isUpgrade,
                                    isDowngrade: !!isDowngrade,
                                    currentPrice,
                                    subscriptionId: currentSubscription.id,
                                  }
                                : {}),
                              trialDays: tier.trialDays,
                            })
                    }
                  />
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground">No plans available for this app yet.</div>
            )}

            {hasCreditOffers && (
              <div className="pt-4 mt-2 border-t space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Buy credits (One-time purchase)
                    </p>
                  </div>
                  {app.wallet ? (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {app.wallet.total_available} available
                    </span>
                  ) : null}
                </div>

                {app.creditPacks && app.creditPacks.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {app.creditPacks.map((pack) => (
                      <CreditPackTile
                        key={pack.id}
                        pack={pack}
                        toolName={app.name}
                        isInCart={isInCart}
                        onToggleCartItem={onToggleCartItem}
                      />
                    ))}
                  </div>
                )}

                {app.customCredits && (
                  <CustomCreditTile
                    pricing={app.customCredits}
                    toolId={app.id}
                    toolName={app.name}
                    onToggleCartItem={onToggleCartItem}
                    isInCart={isInCart}
                  />
                )}
              </div>
            )}
          </div>
                </CollapsibleContent>
            </Collapsible>
        )}

        {isExpanded && !isComingSoon && app.trialPlanId && !currentSubscription && app.trialEligible && (
          <div className="pt-2" onClick={(e) => e.stopPropagation()}>
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              size="sm"
              disabled={isStartingTrial}
              onClick={() => onStartTrial?.(app.id)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isStartingTrial ? 'Starting...' : `Start your ${app.trialDays}-day free trial`}
            </Button>
            {app.trialCardRequired && (
              <p className="text-[10px] text-muted-foreground mt-1 text-center">Credit card required</p>
            )}
            {app.trialPlanDescription && (
                <p className="text-[10px] text-muted-foreground mt-1 text-center italic px-1">
                    {app.trialPlanDescription}
                </p>
            )}
          </div>
        )}

        <div className={cn("transition-opacity duration-300", isExpanded ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
            {!isExpanded && !isComingSoon && app.tiers.length > 0 && (
            <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Starting from</p>
                <p className="text-lg font-bold">
                {formatPrice(app.tiers[0].price, app.tiers[0].currency)}
                <span className="text-sm font-normal text-muted-foreground">{app.tiers[0].period}</span>
                </p>
            </div>
            )}
        </div>

        {!isComingSoon && (
            <div className="flex justify-center">
                <Button
                    variant="link"
                    size="sm"
                    className="text-muted-foreground h-auto p-0 text-xs hover:text-primary"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowDetails(true);
                    }}
                >
                    View details & compare features
                </Button>
            </div>
        )}
      </CardContent>

      <FeatureComparisonModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title={app.name}
        description={app.description}
        tiers={app.tiers}
        apps={[{ name: app.name, description: app.description, features: app.features }]}
      />
    </Card>
  );
}

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

interface CreditPackTileProps {
  pack: AppCreditPack;
  toolName: string;
  isInCart: (id: string, tierName: string) => boolean;
  onToggleCartItem: (item: CartItem) => void;
}

function CreditPackTile({ pack, toolName, isInCart, onToggleCartItem }: CreditPackTileProps) {
  const tierName = `${pack.credit_amount} credits`;
  const inCart = isInCart(pack.id, tierName);
  const pricePerCredit = pack.price / pack.credit_amount;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCartItem({
      id: pack.id,
      planId: pack.id,
      type: 'credit_pack',
      name: `${toolName} · ${pack.credit_amount} credits`,
      tierName,
      price: pack.price / 100,
      period: '',
      currency: pack.currency,
    });
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group rounded-lg border p-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-200',
        inCart
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'bg-background hover:bg-muted/50 hover:border-primary/50',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {inCart && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold tabular-nums">{pack.credit_amount.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatCents(pricePerCredit, pack.currency)}/credit
          </p>
        </div>
      </div>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
        {formatCents(pack.price, pack.currency)}
      </span>
    </div>
  );
}

interface CustomCreditTileProps {
  pricing: AppCustomCreditPricing;
  toolId: string;
  toolName: string;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
}

function CustomCreditTile({ pricing, toolId, toolName, onToggleCartItem, isInCart }: CustomCreditTileProps) {
  const [amount, setAmount] = useState<number>(pricing.min);
  const clamped = useMemo(() => {
    if (!Number.isFinite(amount)) return pricing.min;
    return Math.max(pricing.min, Math.min(pricing.max, Math.floor(amount)));
  }, [amount, pricing.min, pricing.max]);
  const totalCents = clamped * pricing.price_per_credit_cents;
  const tierName = `${clamped} custom credits`;
  const cartId = `custom-${toolId}`;
  const inCart = isInCart(cartId, tierName);

  const handleAdd = () =>
    onToggleCartItem({
      id: cartId,
      planId: toolId,
      type: 'custom_credits',
      name: `${toolName} · ${clamped} credits`,
      tierName,
      price: totalCents / 100,
      period: '',
      currency: pricing.currency,
      toolId,
      creditAmount: clamped,
    });

  return (
    <div
      className={cn(
        'rounded-lg border border-dashed bg-muted/20 p-3 space-y-2 transition-colors',
        inCart && 'border-primary bg-primary/5',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Custom · {formatCents(pricing.price_per_credit_cents, pricing.currency)}/credit
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-0.5 min-w-0">
          <label className="text-[10px] text-muted-foreground">
            Credits ({pricing.min}–{pricing.max})
          </label>
          <Input
            type="number"
            min={pricing.min}
            max={pricing.max}
            value={amount}
            onChange={(e) => setAmount(parseInt(e.target.value || '0', 10))}
            className="h-8 text-sm"
          />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Total</p>
          <span className="text-sm font-semibold tabular-nums">{formatCents(totalCents, pricing.currency)}</span>
        </div>
        <Button
          size="sm"
          variant={inCart ? 'outline' : 'ghost'}
          onClick={handleAdd}
          className={cn(
            'h-8 px-2.5 text-xs',
            !inCart && 'text-primary hover:text-primary hover:bg-primary/10 border border-primary/30',
          )}
        >
          {inCart ? (
            <>
              <Check className="h-3 w-3 mr-1" /> In cart
            </>
          ) : (
            'Add'
          )}
        </Button>
      </div>
    </div>
  );
}
