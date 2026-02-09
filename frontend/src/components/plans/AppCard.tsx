import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { App, CartItem } from "./types";

interface AppCardProps {
  app: App;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleCartItem: (item: CartItem) => void;
  isInCart: (id: string, tierName: string) => boolean;
  hasAnyTierInCart: (id: string) => boolean;
}

export function AppCard({ app, isExpanded, onToggle, onToggleCartItem, isInCart, hasAnyTierInCart }: AppCardProps) {
  const isComingSoon = app.status === "coming-soon";
  const hasTierSelected = hasAnyTierInCart(app.id);

  return (
    <Card
      data-card
      className={cn(
        "relative cursor-pointer transition-all duration-200",
        isComingSoon && "opacity-70",
        isExpanded
          ? "border-primary ring-2 ring-primary/20 shadow-lg scale-[1.02]"
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
              "rounded-lg p-2 transition-colors",
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
                                    "group flex items-center justify-between gap-4 rounded-lg border p-3 transition-all duration-200 cursor-pointer",
                                    inCart
                                    ? "border-primary bg-primary/10 shadow-sm"
                                    : "hover:bg-muted/50 hover:border-primary/50"
                                )}
                                >
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{tier.name}</p>
                                    <p className="text-xs text-muted-foreground line-clamp-1">{tier.limits}</p>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                    <p className="font-semibold text-foreground">
                                        ${tier.price}
                                        <span className="text-xs text-muted-foreground">{tier.period}</span>
                                    </p>
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
