import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AppTier, BundleTier } from "./types";

interface TierItemProps {
  tier: AppTier | BundleTier;
  isInCart: boolean;
  isCurrent: boolean;
  isUpcoming: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
  onSelect?: () => void;
}

export function TierItem({
  tier,
  isInCart,
  isCurrent,
  isUpcoming,
  isUpgrade,
  isDowngrade,
  onSelect,
}: TierItemProps) {
  const isTrialTier = (t: AppTier | BundleTier): t is AppTier => {
    return 'isTrial' in t && !!t.isTrial && !!t.trialDays;
  };

  const showTrialBadge = isTrialTier(tier);

  const formatPrice = (price: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
      }).format(price);
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-lg border p-3 transition-all duration-200",
        (isCurrent || isUpcoming) ? "cursor-default" : "cursor-pointer",
        isInCart
          ? "border-primary bg-primary/10 shadow-sm"
          : !(isCurrent || isUpcoming) && "hover:bg-muted/50 hover:border-primary/50",
        isCurrent && "border-blue-500 bg-blue-50/10"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{tier.name}</p>
          {showTrialBadge && (
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400 whitespace-nowrap">
              {tier.trialDays} day free trial available
            </span>
          )}
          {isCurrent && <Badge className="h-5 text-[10px] px-1.5">Current</Badge>}
          {isUpcoming && <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-orange-500 text-orange-500">Scheduled</Badge>}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{tier.limits}</p>
      </div>
      <div className="text-right whitespace-nowrap flex items-center gap-3">
        <p className="font-semibold text-foreground">
          {formatPrice(tier.price, tier.currency)}
          <span className="text-xs text-muted-foreground">{tier.period}</span>
        </p>

        {/* Upgrade/Downgrade label for non-current tiers */}
        {isUpgrade && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-green-500 text-green-500">Upgrade</Badge>
        )}
        {isDowngrade && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 border-orange-500 text-orange-500">Downgrade</Badge>
        )}
      </div>
    </div>
  );
}
