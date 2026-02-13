import { Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp } from "lucide-react";
import { PublicBundleGroup, PublicBundlePlan, PublicPlan } from "@/services/public.service";
import { App, Bundle } from "./types";

// Icons mapping helper
export const getIconForSlug = (slug: string) => {
    if (slug.includes('generator') || slug.includes('content')) return <FileText className="h-5 w-5" />;
    if (slug.includes('image')) return <ImageIcon className="h-5 w-5" />;
    if (slug.includes('analytics') || slug.includes('tracker')) return <BarChart className="h-5 w-5" />;
    if (slug.includes('inventory')) return <Package className="h-5 w-5" />;
    if (slug.includes('competitor')) return <TrendingUp className="h-5 w-5" />;
    // Bundles
    if (slug.includes('creator')) return <Sparkles className="h-5 w-5" />;
    if (slug.includes('automation')) return <Zap className="h-5 w-5" />;
    if (slug.includes('full')) return <Crown className="h-5 w-5" />;
    return <Star className="h-5 w-5" />;
};

export const transformBundles = (publicBundles: PublicBundleGroup[]): Bundle[] => {
    return publicBundles.map((group: PublicBundleGroup) => {
        const firstBundle = group.bundles && group.bundles.length > 0 ? group.bundles[0] : null;

        const apps = firstBundle ? firstBundle.bundle_plans.map((bp: PublicBundlePlan) => ({
            name: bp.plan.tool?.name || "Unknown App",
            features: bp.plan.tool?.features?.map((f: { name: string }) => f.name) || []
        })) : [];

        return {
            id: group.id,
            name: group.name,
            description: group.description,
            apps: apps,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tiers: group.bundles.map((b: any) => ({
                id: b.id,
                name: b.tier_label || b.name, // Use label vs name fallback
                price: b.price,
                period: "/" + b.interval,
                limits: b.description || "Full access",
                features: b.bundle_plans?.flatMap((bp: any) =>
                    bp.plan?.limits?.map((limit: any) => ({
                        name: limit.feature?.name || "Unknown Feature",
                        limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                        isEnabled: limit.is_enabled,
                        toolName: bp.plan?.tool?.name || "Unknown Tool"
                    })) || []
                ) || []
            })),
            popular: false, 
            icon: getIconForSlug(group.slug)
        };
    });
};

export const transformPlansToApps = (publicPlans: PublicPlan[]): App[] => {
    const appsMap = new Map<string, App>();

    publicPlans.forEach(plan => {
        const tool = plan.tool;
        if (!tool) return;

        if (!appsMap.has(tool.id)) {
            appsMap.set(tool.id, {
                id: tool.id,
                name: tool.name,
                description: tool.description,
                icon: getIconForSlug(tool.slug),
                tiers: [],
                features: tool.features?.map(f => f.name) || [],
                status: tool.is_active ? "available" : "coming-soon",
                trialDays: tool.trial_days || 0,
                trialCardRequired: tool.trial_card_required
            });
        }

        if (plan.is_trial_plan) {
            // It's a trial plan
            if (plan.price === 0) {
                // Free trial plan - don't show in tiers, but store ID for trial logic
                const app = appsMap.get(tool.id)!;
                app.trialPlanId = plan.id;
                app.trialPlanInterval = plan.interval;
                app.trialPlanDescription = plan.description; // Store description for button
                // Ensure trial days are consistent if available here
                if (tool.trial_days) app.trialDays = tool.trial_days;
            } else {
                // Paid trial plan - show in tiers with special badge
                const app = appsMap.get(tool.id)!;
                app.tiers.push({
                    id: plan.id,
                    name: plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1), // Capitalize
                    price: plan.price,
                    period: "/" + plan.interval,
                    limits: plan.description || "See details",
                    features: plan.limits?.map((limit: any) => ({
                        name: limit.feature?.name || "Unknown Feature",
                        limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                        isEnabled: limit.is_enabled,
                        toolName: tool.name
                    })) || [],
                    isTrial: true,
                    trialDays: tool.trial_days
                });
            }
        } else {
            const app = appsMap.get(tool.id)!;
            app.tiers.push({
                id: plan.id,
                name: plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1), // Capitalize
                price: plan.price,
                period: "/" + plan.interval,
                limits: plan.description || "See details",
                features: plan.limits?.map((limit: any) => ({
                    name: limit.feature?.name || "Unknown Feature",
                    limit: limit.default_limit !== null ? String(limit.default_limit) : undefined,
                    isEnabled: limit.is_enabled,
                    toolName: tool.name
                })) || []
            });
        }
    });

    return Array.from(appsMap.values());
};

export const enrichAppsWithEligibility = (apps: App[], trialEligibility: Record<string, { eligible: boolean; trialDays: number }>): App[] => {
    return apps.map(app => {
        const eligibility = trialEligibility[app.id];
        const isEligible = eligibility?.eligible || false;
        
        // Filter and modify tiers based on eligibility
        const processedTiers = app.tiers
            .filter(tier => {
                // If eligible, keep everything.
                if (isEligible) return true;
                // If not eligible, remove free trial plans (price 0)
                return tier.price > 0;
            })
            .map(tier => {
                 // If not eligible, convert paid trials to normal plans
                 if (!isEligible && tier.isTrial) {
                     return { ...tier, isTrial: false, trialDays: 0 };
                 }
                 return tier;
            });

        return {
            ...app,
            tiers: processedTiers,
            trialDays: isEligible ? (eligibility?.trialDays || app.trialDays || 0) : 0,
            trialEligible: isEligible,
            trialCardRequired: app.trialCardRequired, 
            // Ensure trialPlanId is nulled if not eligible to prevent any trial logic
            trialPlanId: isEligible ? app.trialPlanId : undefined 
        };
      });
};
