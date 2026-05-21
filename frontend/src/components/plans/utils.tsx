import { Package, Star, Zap, Crown, Sparkles, FileText, ImageIcon, BarChart, TrendingUp } from "lucide-react";
import { PublicBundleGroup, PublicBundlePlan, PublicPlan, PublicBundle, PublicPlanCreditGrant } from "@/services/public.service";
import { CreditWalletSnapshot, PricePerCredit, PublicCreditPack } from "@/services/billing.service";
import { App, Bundle, FeatureItem } from "./types";

function mapPlanLimitsToFeatures(plan: PublicPlan): FeatureItem[] {
    if (!plan.limits || plan.limits.length === 0) return [];
    return plan.limits
        .filter((lim) => !!lim.feature)
        .map((lim) => ({
            name: lim.feature!.name,
            toolName: plan.tool?.name,
            isEnabled: lim.is_enabled,
            limit: lim.default_limit != null ? String(lim.default_limit) : undefined,
            resetPeriod: lim.reset_period,
            creditCost: lim.feature!.credit_cost,
            useCreditSystem: lim.feature!.use_credit_system,
        }));
}

export const getIconForSlug = (slug: string) => {
    if (slug.includes('generator') || slug.includes('content')) return <FileText className="h-5 w-5" />;
    if (slug.includes('image')) return <ImageIcon className="h-5 w-5" />;
    if (slug.includes('analytics') || slug.includes('tracker')) return <BarChart className="h-5 w-5" />;
    if (slug.includes('inventory')) return <Package className="h-5 w-5" />;
    if (slug.includes('competitor')) return <TrendingUp className="h-5 w-5" />;
    if (slug.includes('seo')) return <TrendingUp className="h-5 w-5" />;
    if (slug.includes('creator')) return <Sparkles className="h-5 w-5" />;
    if (slug.includes('automation')) return <Zap className="h-5 w-5" />;
    if (slug.includes('full')) return <Crown className="h-5 w-5" />;
    return <Star className="h-5 w-5" />;
};

function buildGrantIndex(grants: PublicPlanCreditGrant[] = []) {
    const byPlan = new Map<string, PublicPlanCreditGrant[]>();
    for (const g of grants) {
        const arr = byPlan.get(g.plan_id) || [];
        arr.push(g);
        byPlan.set(g.plan_id, arr);
    }
    return byPlan;
}

export const transformBundles = (
    publicBundles: PublicBundleGroup[],
    grants: PublicPlanCreditGrant[] = [],
): Bundle[] => {
    const grantsByPlan = buildGrantIndex(grants);

    return publicBundles.map((group: PublicBundleGroup) => {
        const firstBundle = group.bundles && group.bundles.length > 0 ? group.bundles[0] : null;

        const apps = firstBundle ? firstBundle.bundle_plans.map((bp: PublicBundlePlan) => ({
            name: bp.plan.tool?.name || "Unknown App",
            description: bp.plan.tool?.description,
            features: bp.plan.tool?.features?.map((f: { name: string }) => f.name) || []
        })) : [];

        return {
            id: group.id,
            name: group.name,
            description: group.description,
            apps: apps,
            tiers: group.bundles.map((b: PublicBundle) => {
                const collected = (b.bundle_plans || [])
                    .flatMap((bp: PublicBundlePlan) => grantsByPlan.get(bp.plan?.id) || [])
                    .filter((g) => !g.is_trial_grant)
                    .map((g) => ({
                        tool_id: g.tool_id,
                        tool_slug: g.tool_slug,
                        tool_name: g.tool_name,
                        credits_per_period: g.credits_per_period,
                        period_unit: g.period_unit,
                    }));
                const bundleFeatures = (b.bundle_plans || []).flatMap((bp: PublicBundlePlan) =>
                    bp.plan ? mapPlanLimitsToFeatures(bp.plan) : []
                );
                return {
                    id: b.id,
                    name: b.tier_label || b.name,
                    price: b.price,
                    currency: b.currency,
                    period: "/" + b.interval,
                    limits: b.description || "Full access",
                    creditGrants: collected.length ? collected : undefined,
                    features: bundleFeatures.length ? bundleFeatures : undefined,
                };
            }),
            popular: false,
            icon: getIconForSlug(group.slug)
        };
    });
};

export const transformPlansToApps = (
    publicPlans: PublicPlan[],
    grants: PublicPlanCreditGrant[] = [],
    packs: PublicCreditPack[] = [],
    pricingByToolId: Map<string, PricePerCredit> = new Map(),
    walletByToolId: Map<string, CreditWalletSnapshot> = new Map(),
): App[] => {
    const grantsByPlan = buildGrantIndex(grants);
    const appsMap = new Map<string, App>();
    const packsByToolId = new Map<string, PublicCreditPack[]>();
    for (const p of packs) {
        if (!p.tool_id) continue;
        const arr = packsByToolId.get(p.tool_id) || [];
        arr.push(p);
        packsByToolId.set(p.tool_id, arr);
    }

    const annotateCredits = (app: App, toolId: string) => {
        const toolPacks = (packsByToolId.get(toolId) || []).sort((a, b) => a.credit_amount - b.credit_amount);
        if (toolPacks.length > 0) {
            app.creditPacks = toolPacks.map((p) => ({
                id: p.id,
                name: p.name,
                credit_amount: p.credit_amount,
                price: p.price,
                currency: p.currency,
                description: p.description ?? null,
            }));
        }
        const pricing = pricingByToolId.get(toolId);
        if (pricing && pricing.price_per_credit_cents) {
            app.customCredits = {
                price_per_credit_cents: pricing.price_per_credit_cents,
                min: pricing.min,
                max: pricing.max,
                currency: pricing.currency,
            };
        }
        const wallet = walletByToolId.get(toolId);
        if (wallet) {
            app.wallet = {
                total_available: wallet.total_available,
                plan_period_end: wallet.plan_period_end ?? null,
            };
        }
    };

    publicPlans.forEach(plan => {
        const tool = plan.tool;
        if (!tool) return;

        if (!appsMap.has(tool.id)) {
            const app: App = {
                id: tool.id,
                slug: tool.slug,
                name: tool.name,
                description: tool.description,
                icon: getIconForSlug(tool.slug),
                tiers: [],
                features: tool.features?.map(f => f.name) || [],
                status: tool.is_active ? "available" : "coming-soon",
                trialDays: tool.trial_days || 0,
                trialCardRequired: tool.trial_card_required
            };
            annotateCredits(app, tool.id);
            appsMap.set(tool.id, app);
        }

        const planGrants = grantsByPlan.get(plan.id) || [];
        const regularGrant = planGrants.find((g) => g.tool_id === tool.id && !g.is_trial_grant)
            || planGrants.find((g) => !g.is_trial_grant);
        const trialGrant = planGrants.find((g) => g.tool_id === tool.id && g.is_trial_grant)
            || planGrants.find((g) => g.is_trial_grant);
        const tierFeatures = mapPlanLimitsToFeatures(plan);

        if (plan.is_trial_plan) {
            if (plan.price === 0) {
                const app = appsMap.get(tool.id)!;
                app.trialPlanId = plan.id;
                app.trialPlanInterval = plan.interval;
                app.trialPlanDescription = plan.description;
                app.trialPlanCurrency = plan.currency;
                if (tool.trial_days) app.trialDays = tool.trial_days;
                if (trialGrant?.credits_per_period) {
                    app.trialCredits = trialGrant.credits_per_period;
                    app.trialCreditsPeriodUnit = trialGrant.period_unit;
                }
            } else {
                const app = appsMap.get(tool.id)!;
                app.tiers.push({
                    id: plan.id,
                    name: plan.name || (plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)),
                    price: plan.price,
                    currency: plan.currency,
                    period: "/" + plan.interval,
                    limits: plan.description || "See details",
                    isTrial: true,
                    trialDays: tool.trial_days,
                    creditsPerPeriod: regularGrant?.credits_per_period,
                    creditsPeriodUnit: regularGrant?.period_unit,
                    trialCredits: trialGrant?.credits_per_period,
                    trialCreditsPeriodUnit: trialGrant?.period_unit,
                    features: tierFeatures.length ? tierFeatures : undefined,
                });
                if (trialGrant?.credits_per_period && !app.trialCredits) {
                    app.trialCredits = trialGrant.credits_per_period;
                    app.trialCreditsPeriodUnit = trialGrant.period_unit;
                }
            }
        } else {
            const app = appsMap.get(tool.id)!;
            app.tiers.push({
                id: plan.id,
                name: plan.name || (plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1)),
                price: plan.price,
                currency: plan.currency,
                period: "/" + plan.interval,
                limits: plan.description || "See details",
                creditsPerPeriod: regularGrant?.credits_per_period,
                creditsPeriodUnit: regularGrant?.period_unit,
                trialDays: trialGrant && tool.trial_days ? tool.trial_days : undefined,
                trialCredits: trialGrant?.credits_per_period,
                trialCreditsPeriodUnit: trialGrant?.period_unit,
                features: tierFeatures.length ? tierFeatures : undefined,
            });
        }
    });

    return Array.from(appsMap.values());
};

export const enrichAppsWithEligibility = (apps: App[], trialEligibility: Record<string, { eligible: boolean; trialDays: number }>): App[] => {
    return apps.map(app => {
        const eligibility = trialEligibility[app.id];
        const isEligible = eligibility?.eligible || false;

        const processedTiers = app.tiers
            .filter(tier => {
                if (isEligible) return true;
                return tier.price > 0;
            })
            .map(tier => {
                // For ineligible users, demote any isTrial tier back to a plain
                // tier (so the "trial" badge doesn't show). The trialDays /
                // trialCredits fields stay on the tier — UI consumers gate
                // their use behind app.trialEligible.
                if (!isEligible && tier.isTrial) {
                    return { ...tier, isTrial: false };
                }
                return tier;
            });

        return {
            ...app,
            tiers: processedTiers,
            trialDays: isEligible ? (eligibility?.trialDays || app.trialDays || 0) : 0,
            trialEligible: isEligible,
            trialCardRequired: app.trialCardRequired,
            trialPlanId: isEligible ? app.trialPlanId : undefined,
        };
    });
};
