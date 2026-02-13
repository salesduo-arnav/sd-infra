import { Check, ShieldCheck } from "lucide-react";

interface Feature {
  name: string;
  toolName?: string;
  isEnabled: boolean;
  limit?: string;
}

interface CheckoutFeatureListProps {
  features?: Feature[];
  limits?: string;
}

export function CheckoutFeatureList({ features = [], limits }: CheckoutFeatureListProps) {
    if ((!features || features.length === 0) && !limits) return null;

    // Group features by tool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupedFeatures = features.reduce((acc: any, feature: Feature) => {
        const tool = feature.toolName || 'General Features';
        if (!acc[tool]) acc[tool] = [];
        acc[tool].push(feature);
        return acc;
    }, {});

    return (
        <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-2">
            {limits && (
                <div className="flex items-center gap-2 text-muted-foreground">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span>{limits}</span>
                </div>
            )}
            {Object.keys(groupedFeatures).length > 0 && (
                <div className="mt-2 space-y-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {Object.entries(groupedFeatures).map(([toolName, toolFeatures]: [string, any], groupIdx: number) => (
                        <div key={groupIdx} className="space-y-1.5">
                            {toolName !== 'General Features' && (
                                <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-wider pl-1">{toolName}</h4>
                            )}
                            <ul className="grid grid-cols-1 gap-1.5">
                                {toolFeatures.map((feature: Feature, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-muted-foreground/90 pl-1">
                                        {feature.isEnabled ? (
                                            <Check className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />
                                        ) : (
                                            <span className="text-red-500 h-3.5 w-3.5 mt-0.5 shrink-0">✕</span>
                                        )}
                                        <div className="flex-1">
                                            <span className="text-xs leading-tight block">{feature.name}</span>
                                            {feature.limit && (
                                                <span className="text-[10px] text-muted-foreground font-medium">Limit: {feature.limit}</span>
                                            )}
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
