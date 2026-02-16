import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, Minus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FeatureTier {
  id: string;
  name: string;
  price: number;
  period: string;
  currency?: string;
  limits: string;
  features?: {
    name: string;
    limit?: string;
    isEnabled: boolean;
    toolName?: string;
    resetPeriod?: string;
  }[];
}

interface FeatureComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  apps?: { name: string; description?: string; features: string[] }[];
  tiers: FeatureTier[];
}

export function FeatureComparisonModal({
  isOpen,
  onClose,
  title,
  description,
  apps,
  tiers
}: FeatureComparisonModalProps) {
  
  // Format price helper
  const formatPrice = (price: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(price);
  };

  // 1. Identify all unique features and group them
  // If apps are provided (Bundle), group by App.
  // If no apps (Single App), use a single group "General" or just list them.
  
  interface FeatureGroup {
    name: string;
    description?: string;
    features: string[];
  }

  let featureGroups: FeatureGroup[] = [];

  if (apps && apps.length > 0) {
    featureGroups = apps.map(app => ({
      name: app.name,
      description: app.description,
      features: app.features
    }));
  } else {
    // Single App case: Collect all unique feature names from all tiers
    const allFeatures = Array.from(new Set(
      tiers.flatMap(tier => tier.features?.map(f => f.name) || [])
    ));
    featureGroups = [{
      name: "Features", 
      description: description, 
      features: allFeatures
    }];
  }

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
        
        <ScrollArea className="flex-1">
            <div className="p-6 pt-2">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow className="hover:bg-transparent border-b-2">
                            <TableHead className="w-[300px] min-w-[200px]">Feature \ Plans</TableHead>
                            {tiers.map(tier => (
                                <TableHead key={tier.id} className="text-center min-w-[140px] align-top py-4">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="font-bold text-base text-foreground">{tier.name}</span>
                                        <div className="text-sm">
                                            <span className="font-semibold">{formatPrice(tier.price, tier.currency)}</span>
                                            <span className="text-muted-foreground font-normal text-xs">{tier.period}</span>
                                        </div>
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {featureGroups.map((group, groupIdx) => (
                            <>
                                {/* Group Header (App Name + Description) */}
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

                                {/* Features Rows */}
                                {group.features.map((featureName, featIdx) => (
                                    <TableRow key={`${group.name}-${featureName}-${featIdx}`} className="hover:bg-muted/5">
                                        <TableCell className="font-medium text-sm py-4">
                                            {featureName}
                                        </TableCell>
                                        {tiers.map(tier => {
                                            const tierFeature = tier.features?.find(
                                                f => f.name === featureName && 
                                                (!f.toolName || f.toolName === group.name || !apps)
                                            );
                                            
                                            // Determine what to show
                                            let content = <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;

                                            if (tierFeature) {
                                                if (tierFeature.isEnabled) {
                                                    if (tierFeature.limit && tierFeature.limit !== "0") {
                                                        content = (
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
                                                    } else {
                                                        content = <Check className="h-5 w-5 text-emerald-500 mx-auto font-bold" />;
                                                    }
                                                } else {
                                                     // Explicitly disabled
                                                     content = <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
                                                }
                                            } else {
                                                // Feature not listed implies disabled
                                                 content = <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />;
                                            }

                                            return (
                                                <TableCell key={`${tier.id}-${featureName}`} className="text-center py-4">
                                                    {content}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
