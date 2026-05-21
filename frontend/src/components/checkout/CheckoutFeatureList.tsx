import { Check, Coins, ShieldCheck } from "lucide-react";

interface Feature {
  name: string;
  toolName?: string;
  isEnabled: boolean;
  limit?: string;
  resetPeriod?: string;
  creditCost?: number;
  useCreditSystem?: boolean;
}

interface CheckoutFeatureListProps {
  features?: Feature[];
  limits?: string;
  creditsPerPeriod?: number;
  creditsPeriodUnit?: 'monthly' | 'yearly';
  trialDays?: number;
  trialCredits?: number;
  trialCreditsPeriodUnit?: 'monthly' | 'yearly';
}

function FeatureValue({ feature }: { feature: Feature }) {
    if (!feature.isEnabled) {
        return <span className="text-red-500 h-3.5 w-3.5 mt-0.5 shrink-0">✕</span>;
    }
    if (feature.useCreditSystem) {
        return <Coins className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />;
    }
    return <Check className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />;
}

function FeatureDetail({ feature }: { feature: Feature }) {
    if (!feature.isEnabled) return null;

    if (feature.useCreditSystem) {
        const cost = feature.creditCost ?? 0;
        return (
            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                {cost === 0 ? 'Free' : `${cost} credit${cost === 1 ? '' : 's'} per use`}
            </span>
        );
    }

    if (feature.limit && feature.limit !== "0") {
        return (
            <span className="text-[10px] text-muted-foreground font-medium">
                Limit: {feature.limit}
                {feature.resetPeriod && feature.resetPeriod !== 'never' && ` (resets ${feature.resetPeriod})`}
            </span>
        );
    }
    return null;
}

export function CheckoutFeatureList({
    features = [],
    limits,
    creditsPerPeriod,
    creditsPeriodUnit,
    trialDays,
    trialCredits,
    trialCreditsPeriodUnit,
}: CheckoutFeatureListProps) {
    const hasFeatures = features && features.length > 0;
    const hasCredits = !!creditsPerPeriod;
    const hasTrial = !!trialDays;

    if (!hasFeatures && !limits && !hasCredits && !hasTrial) return null;

    // Group features by tool name.
    const groupedFeatures: Record<string, Feature[]> = {};
    for (const feature of features) {
        const tool = feature.toolName || 'General Features';
        if (!groupedFeatures[tool]) groupedFeatures[tool] = [];
        groupedFeatures[tool].push(feature);
    }

    return (
        <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-2">
            {hasCredits && (
                <div className="flex items-center gap-2 text-primary font-medium">
                    <Coins className="h-4 w-4" />
                    <span>{creditsPerPeriod} credits / {creditsPeriodUnit === 'yearly' ? 'year' : 'month'} included</span>
                </div>
            )}
            {hasTrial && (
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    <span>
                        {trialDays}-day free trial
                        {trialCredits ? ` · ${trialCredits} credits included` : ''}
                    </span>
                </div>
            )}
            {limits && (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>{limits}</span>
                </div>
            )}
            {Object.keys(groupedFeatures).length > 0 && (
                <div className="mt-2 space-y-3">
                    {Object.entries(groupedFeatures).map(([toolName, toolFeatures], groupIdx) => (
                        <div key={groupIdx} className="space-y-1.5">
                            {toolName !== 'General Features' && (
                                <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-wider pl-1">{toolName}</h4>
                            )}
                            <ul className="grid grid-cols-1 gap-1.5">
                                {toolFeatures.map((feature, i) => (
                                    <li key={i} className="flex items-start gap-2 text-muted-foreground/90 pl-1">
                                        <FeatureValue feature={feature} />
                                        <div className="flex-1">
                                            <span className="text-xs leading-tight block">{feature.name}</span>
                                            <FeatureDetail feature={feature} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
