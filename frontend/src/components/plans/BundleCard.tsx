import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Check, Star } from "lucide-react";
import { Bundle, CartItem } from "./types";
import { TierItem } from "./TierItem";
import { Subscription } from "@/types/subscription";

interface BundleCardProps {
  bundle: Bundle;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
  compact?: boolean;
  currentSubscription?: Subscription | null;
}

export function BundleCard({ bundle, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart, compact, currentSubscription }: BundleCardProps) {
  const hasTierSelected = hasAnyTierInCart(bundle.id);

  const currentPrice = currentSubscription?.bundle?.price ?? 0;

  return (
    <Card
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]"
          : "hover:border-primary/50 hover:shadow-md",
        bundle.popular && !isExpanded && "border-primary/30",
        (hasTierSelected || currentSubscription) && !isExpanded && "border-primary/50 bg-primary/5"
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
              "rounded-lg p-2 transition-colors",
              isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            {bundle.icon}
          </span>
          <span className={compact ? "text-base" : ""}>{bundle.name}</span>
          {/* Current Plan Badge */}
           {!isExpanded && currentSubscription && (
              <Badge variant="outline" className="ml-auto border-purple-500 text-purple-500">Active</Badge>
           )}
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

        {/* Pricing Tiers with Smooth Collapsible Animation */}
        <Collapsible open={isExpanded}>
            <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className="pt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Select a Tier {hasTierSelected && <span className="text-primary">(1 selected)</span>}
                    </p>
                    {bundle.tiers.map((tier) => {
                    const inCart = isInCart(bundle.id, tier.name);
                    const isCurrent = currentSubscription?.bundle?.id === tier.id;
                    const isUpcoming = currentSubscription?.upcoming_bundle?.id === tier.id;
                    const isUpgrade = currentSubscription && tier.price > currentPrice && !isCurrent && !isUpcoming;
                    const isDowngrade = currentSubscription && tier.price < currentPrice && !isCurrent && !isUpcoming;

                    return (
                        <TierItem
                            key={tier.name}
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
                                        id: bundle.id,
                                        planId: tier.id,
                                        type: "bundle",
                                        name: bundle.name,
                                        tierName: tier.name,
                                        price: tier.price,
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
                                        })
                            }
                        />
                    );
                    })}
                </div>
            </CollapsibleContent>
        </Collapsible>

        {/* Price Range Preview (Fade out when expanded) */}
        <div className={cn("transition-opacity duration-300", isExpanded ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
            {!isExpanded && bundle.tiers.length > 0 && (
            <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Price</p>
                <p className="text-lg font-bold">
                ${bundle.tiers[0].price}
                <span className="text-sm font-normal text-muted-foreground">{bundle.tiers[0].period}</span>
                </p>
            </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
