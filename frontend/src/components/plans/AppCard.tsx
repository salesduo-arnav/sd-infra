import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Check, Sparkles } from "lucide-react";
import { App, CartItem } from "./types";

interface AppCardProps {
  app: App;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
  currentSubscription?: any;
  onStartTrial?: (toolId: string) => void;
  isStartingTrial?: boolean;
}

export function AppCard({ app, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart, currentSubscription, onStartTrial, isStartingTrial }: AppCardProps) {
  const isComingSoon = app.status === "coming-soon";
  const hasTierSelected = hasAnyTierInCart(app.id);

  const currentPrice = currentSubscription?.plan?.price ?? 0;

  return (
    <Card
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200",
        isComingSoon && "opacity-70",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]"
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
           {/* Current Plan Badge on Card Header if collapsed */}
           {!isExpanded && currentSubscription && (currentSubscription.status === 'active' || currentSubscription.status === 'trialing') && (
              <Badge variant="outline" className="ml-auto border-blue-500 text-blue-500">Active</Badge>
           )}
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

        {/* Free Trial Banner */}
        {!isComingSoon && app.trialDays && app.trialDays > 0 && !currentSubscription && (
          <div className={cn("transition-opacity duration-300", isExpanded ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
            {app.trialEligible ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex-1">
                  {app.trialDays}-day free trial available
                </span>
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">Trial Used</Badge>
            )}
          </div>
        )}

        {/* Pricing Tiers with Smooth Animation */}
        {!isComingSoon && (
            <Collapsible open={isExpanded}>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="pt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Select a Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
                        </p>
                        {app.tiers.length > 0 ? (
                            app.tiers.map((tier) => {
                            const inCart = isInCart(app.id, tier.name);
                            const isCurrent = currentSubscription?.plan?.id === tier.id;
                            const isUpcoming = currentSubscription?.upcoming_plan?.id === tier.id;
                            const isUpgrade = currentSubscription && tier.price > currentPrice;
                            const isDowngrade = currentSubscription && tier.price < currentPrice;

                            return (
                                <div
                                key={tier.name}
                                onClick={(isCurrent || isUpcoming) ? undefined : () =>
                                    onToggleCartItem({
                                    id: app.id,
                                    planId: tier.id,
                                    type: "app",
                                    name: app.name,
                                    tierName: tier.name,
                                    price: tier.price,
                                    period: tier.period,
                                    limits: tier.limits,
                                    features: tier.features,
                                    ...(currentSubscription ? {
                                        isUpgrade: !!isUpgrade,
                                        isDowngrade: !!isDowngrade,
                                        currentPrice,
                                        subscriptionId: currentSubscription.id,
                                    } : {})
                                    })
                                }
                                className={cn(
                                    "group flex items-center justify-between gap-4 rounded-lg border p-3 transition-all duration-200",
                                    (isCurrent || isUpcoming) ? "cursor-default" : "cursor-pointer",
                                    inCart
                                    ? "border-primary bg-primary/10 shadow-sm"
                                    : !(isCurrent || isUpcoming) && "hover:bg-muted/50 hover:border-primary/50",
                                    isCurrent && "border-blue-500 bg-blue-50/10"
                                )}
                                >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium truncate">{tier.name}</p>
                                        {isCurrent && <Badge className="h-5 text-[10px] px-1.5">Current</Badge>}
                                        {isUpcoming && <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-orange-500 text-orange-500">Scheduled</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-1">{tier.limits}</p>
                                </div>
                                <div className="text-right whitespace-nowrap flex items-center gap-3">
                                    <p className="font-semibold text-foreground">
                                        ${tier.price}
                                        <span className="text-xs text-muted-foreground">{tier.period}</span>
                                    </p>
                                    
                                    {/* Upgrade/Downgrade label for non-current tiers */}
                                    {currentSubscription && !isCurrent && !isUpcoming && isUpgrade && (
                                        <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-green-500 text-green-500">Upgrade</Badge>
                                    )}
                                    {currentSubscription && !isCurrent && !isUpcoming && isDowngrade && (
                                        <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-orange-500 text-orange-500">Downgrade</Badge>
                                    )}
                                </div>
                                </div>
                            );
                            })
                        ) : (
                            <div className="text-sm text-muted-foreground">No plans available for this app yet.</div>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        )}

        {/* Start Trial Button (inside expanded view) */}
        {isExpanded && !isComingSoon && app.trialDays && app.trialDays > 0 && !currentSubscription && app.trialEligible && (
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
          </div>
        )}

        {/* Price Range Preview */}
        <div className={cn("transition-opacity duration-300", isExpanded ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
            {!isExpanded && !isComingSoon && app.tiers.length > 0 && (
            <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Starting from</p>
                <p className="text-lg font-bold">
                ${app.tiers[0].price}
                <span className="text-sm font-normal text-muted-foreground">{app.tiers[0].period}</span>
                </p>
            </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
