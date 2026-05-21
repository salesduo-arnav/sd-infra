import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Coins, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FeatureCell {
  name: string;
  limit?: string;
  isEnabled: boolean;
  toolName?: string;
  resetPeriod?: string;
  creditCost?: number;
  useCreditSystem?: boolean;
}

interface FeatureTier {
  id: string;
  name: string;
  price: number;
  period: string;
  currency?: string;
  limits: string;
  features?: FeatureCell[];
  creditsPerPeriod?: number;
  creditsPeriodUnit?: 'monthly' | 'yearly';
  creditGrants?: Array<{
    tool_id: string;
    tool_slug?: string;
    tool_name?: string;
    credits_per_period: number;
    period_unit: 'monthly' | 'yearly';
  }>;
}

interface FeatureComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  apps?: { name: string; description?: string; features: string[] }[];
  tiers: FeatureTier[];
}

interface FeatureGroup {
  name: string;
  description?: string;
  features: string[];
}

const buildGroups = (apps: FeatureComparisonModalProps['apps'], tiers: FeatureTier[], description?: string): FeatureGroup[] => {
  // Collect all unique features across tiers, keyed by (toolName + name).
  const tierFeatureNamesByTool = new Map<string, Set<string>>();
  for (const tier of tiers) {
    for (const f of tier.features || []) {
      const key = f.toolName || '__general__';
      const set = tierFeatureNamesByTool.get(key) || new Set<string>();
      set.add(f.name);
      tierFeatureNamesByTool.set(key, set);
    }
  }

  if (apps && apps.length > 0) {
    // Build a group per app. Use union of app.features (advertised) AND any
    // feature names from tier limits matching that tool, so the rows reflect
    // the actual plan limits even if app.features list is incomplete.
    return apps.map((app) => {
      const tierFeatureNames = tierFeatureNamesByTool.get(app.name) || new Set<string>();
      const merged = Array.from(new Set([...(app.features || []), ...Array.from(tierFeatureNames)]));
      return {
        name: app.name,
        description: app.description,
        features: merged,
      };
    });
  }

  const allFeatures = Array.from(new Set(
    tiers.flatMap((tier) => (tier.features || []).map((f) => f.name))
  ));
  return [{ name: "Features", description, features: allFeatures }];
};

export function FeatureComparisonModal({
  isOpen,
  onClose,
  title,
  description,
  apps,
  tiers,
}: FeatureComparisonModalProps) {

  const formatPrice = (price: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(price);
  };

  const featureGroups = buildGroups(apps, tiers, description);

  const renderCell = (tier: FeatureTier, featureName: string, groupName: string) => {
    const tierFeature = tier.features?.find(
      (f) =>
        f.name === featureName &&
        (!apps || !f.toolName || f.toolName === groupName)
    );

    // Feature not configured on this plan at all → not included.
    if (!tierFeature) {
      return <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
    }

    if (!tierFeature.isEnabled) {
      return <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
    }

    // Credit-metered feature: show credits-per-use rather than a hard limit.
    if (tierFeature.useCreditSystem) {
      const cost = tierFeature.creditCost ?? 0;
      return (
        <div className="flex flex-col items-center">
          <Badge variant="outline" className="font-normal border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 gap-1">
            <Coins className="h-3 w-3" />
            {cost === 0 ? 'Free' : `${cost} credit${cost === 1 ? '' : 's'} / use`}
          </Badge>
        </div>
      );
    }

    // Hard-limit feature.
    if (tierFeature.limit && tierFeature.limit !== "0") {
      return (
        <div className="flex flex-col items-center">
          <Badge variant="outline" className="font-normal border-primary/20 bg-primary/5 text-primary">
            {tierFeature.limit}
          </Badge>
          {tierFeature.resetPeriod && tierFeature.resetPeriod !== 'never' && (
            <span className="text-[10px] text-muted-foreground mt-0.5">
              resets {tierFeature.resetPeriod}
            </span>
          )}
        </div>
      );
    }

    // Boolean enabled feature.
    return <Check className="h-5 w-5 text-emerald-500 mx-auto font-bold" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-start justify-between">
                <div>
                    <DialogTitle className="text-2xl font-bold">{title}</DialogTitle>
                    {description && !apps && <DialogDescription className="mt-1">{description}</DialogDescription>}
                </div>
            </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-6 pt-2">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="hover:bg-transparent border-b-2">
                            <TableHead className="w-[300px] min-w-[200px]">Feature \ Plans</TableHead>
                            {tiers.map(tier => (
                                <TableHead key={tier.id} className="text-center min-w-[160px] align-top py-4">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="font-bold text-base text-foreground">{tier.name}</span>
                                        <div className="text-sm">
                                            <span className="font-semibold">{formatPrice(tier.price, tier.currency)}</span>
                                            <span className="text-muted-foreground font-normal text-xs">{tier.period}</span>
                                        </div>
                                        {tier.creditsPerPeriod ? (
                                            <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                                                <Coins className="h-3 w-3" />
                                                {tier.creditsPerPeriod} credits / {tier.creditsPeriodUnit === 'yearly' ? 'yr' : 'mo'}
                                            </span>
                                        ) : null}
                                        {tier.creditGrants && tier.creditGrants.length > 0 ? (
                                            <div className="text-[11px] text-primary font-medium space-y-0.5">
                                                {tier.creditGrants.map((g, i) => (
                                                    <div key={i} className="flex items-center justify-center gap-1">
                                                        <Coins className="h-3 w-3" />
                                                        <span>{g.credits_per_period} {g.tool_name ?? 'tool'} / {g.period_unit === 'yearly' ? 'yr' : 'mo'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {featureGroups.map((group, groupIdx) => (
                            <>
                                {apps && apps.length > 0 && (
                                    <TableRow key={`group-${groupIdx}`} className="bg-muted/30 hover:bg-muted/40">
                                        <TableCell colSpan={tiers.length + 1} className="py-3">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-primary flex items-center gap-2">
                                                    {group.name}
                                                </span>
                                                {group.description && (
                                                    <span className="text-xs text-muted-foreground font-normal mt-0.5 max-w-2xl">
                                                        {group.description}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {group.features.length === 0 && (
                                    <TableRow key={`empty-${groupIdx}`}>
                                        <TableCell colSpan={tiers.length + 1} className="py-4 text-center text-xs text-muted-foreground italic">
                                            No features configured.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {group.features.map((featureName, featIdx) => (
                                    <TableRow key={`${group.name}-${featureName}-${featIdx}`} className="hover:bg-muted/5">
                                        <TableCell className="font-medium text-sm py-4">
                                            {featureName}
                                        </TableCell>
                                        {tiers.map(tier => (
                                            <TableCell key={`${tier.id}-${featureName}`} className="text-center py-4">
                                                {renderCell(tier, featureName, group.name)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
