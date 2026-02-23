import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe.service';
import Stripe from 'stripe';
import { OrganizationMember } from '../models/organization';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import sequelize from '../config/db';
import { Op } from 'sequelize';
import { AuditService } from '../services/audit.service';
import { SystemConfig } from '../models/system_config';
import Logger from '../utils/logger';

class BillingController {
    // Get public/user-accessible config
    async getConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const config = await SystemConfig.findByPk('payment_grace_period_days');
            const gracePeriodDays = config ? parseInt(config.value, 10) : 3; // Default to 3
            res.status(200).json({ gracePeriodDays });
        } catch (error) {
            next(error);
        }
    }

    async createCheckoutSession(req: Request, res: Response, next: NextFunction) {
        try {
            const { items, ui_mode = 'hosted' } = req.body;
            const organization = req.organization;
            const user = req.user;

            if (!organization) { res.status(404).json({ message: 'Organization not found' }); return; }
            if (!items?.length) { res.status(400).json({ message: 'No items provided' }); return; }

            // Validate intervals
            const firstInterval = items[0].interval;
            if (items.some((item: { interval: string }) => item.interval !== firstInterval)) {
                res.status(400).json({ message: 'All items must have the same billing interval' });
                return;
            }

            // 1. Get or Create Stripe Customer
            let customerId = organization.stripe_customer_id;
            if (!customerId) {
                const customer = await stripeService.createCustomer(organization.billing_email || user?.email || '', organization.name, { orgId: organization.id });
                customerId = customer.id;
                await organization.update({ stripe_customer_id: customerId });
            }

            // 2. Resolve Price IDs
            const lineItems = [];
            const metadataItems: { id: string; type: string }[] = [];
            let trialPeriodDays = 0;
            let hasPaidComponent = false;

            for (const item of items) {
                let priceId: string | undefined;

                if (item.type === 'plan') {
                    const plan = await Plan.findByPk(item.id, { include: [{ model: Tool, as: 'tool' }] });
                    if (!plan) continue;
                    
                    priceId = item.interval === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
                    if (plan.price > 0) hasPaidComponent = true;
                    
                    // Trial Logic
                    if (plan.is_trial_plan && plan.tool?.trial_days && plan.tool.trial_days > 0 && trialPeriodDays === 0) {
                        trialPeriodDays = plan.tool.trial_days;
                        // Strict Trial Check
                        if (user) {
                            const eligible = await this.isTrialEligible(user.id, plan.tool_id, organization.id);
                            if (!eligible) {
                                console.log(`[Billing] User ${user.id} ineligible for trial on tool ${plan.tool_id}`);
                                trialPeriodDays = 0;
                            }
                        }
                    }
                } else if (item.type === 'bundle') {
                    const bundle = await Bundle.findByPk(item.id);
                    if (!bundle) continue;
                    priceId = item.interval === 'yearly' ? bundle.stripe_price_id_yearly : bundle.stripe_price_id_monthly;
                    if (bundle.price > 0) hasPaidComponent = true;
                }

                if (priceId) {
                    lineItems.push({ price: priceId, quantity: 1 });
                    metadataItems.push({ id: item.id, type: item.type });
                }
            }

            if (lineItems.length === 0) { res.status(400).json({ message: 'No valid price IDs found for selected items' }); return; }

            // 3. Create Session
            const isOneTime = firstInterval === 'one_time';
            const sessionMode = isOneTime ? 'payment' : 'subscription';

            const sessionConfig: Stripe.Checkout.SessionCreateParams = {
                customer: customerId,
                mode: sessionMode as Stripe.Checkout.SessionCreateParams.Mode,
                payment_method_types: ['card'],
                line_items: lineItems,
                metadata: {
                    organizationId: organization.id,
                    items: JSON.stringify(metadataItems),
                    interval: firstInterval,
                    userId: user?.id
                }
            };
            
            if (isOneTime) {
                sessionConfig.invoice_creation = { enabled: true };
            }
            
            if (!isOneTime) {
                sessionConfig.subscription_data = { metadata: { organizationId: organization.id, userId: user?.id } };
                if (trialPeriodDays > 0) {
                    sessionConfig.subscription_data.trial_period_days = trialPeriodDays;

                    // Only auto-cancel free trials
                    if (!hasPaidComponent) {
                        sessionConfig.subscription_data.metadata = { ...sessionConfig.subscription_data.metadata, auto_cancel_trial: 'true' };
                    }
                }
            }

            if (ui_mode === 'embedded') {
                sessionConfig.ui_mode = 'embedded';
                sessionConfig.return_url = `${process.env.FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
            } else {
                sessionConfig.success_url = `${process.env.FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
                sessionConfig.cancel_url = `${process.env.FRONTEND_URL}/billing?canceled=true`;
            }

            const session = await stripeService.createCheckoutSession(sessionConfig);

            if (ui_mode === 'embedded') {
                res.status(200).json({ clientSecret: session.client_secret });
            } else {
                res.status(200).json({ url: session.url, sessionId: session.id });
            }

            await AuditService.log({
                actorId: user?.id,
                action: 'INITIATE_CHECKOUT',
                entityType: 'Organization',
                entityId: organization.id,
                details: {
                    items: metadataItems,
                    interval: firstInterval,
                    ui_mode
                },
                req
            });

        } catch (error) {
            next(error);
        }
    }

    // Get current subscription
    async getSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const organization = req.organization;
            if (!organization) {
                res.status(404).json({ message: 'Organization not found' });
                return;
            }

            // 1. Fetch Local Subscriptions (Source of Truth for Status/Plan)
            const subscriptions = await Subscription.findAll({
                where: { organization_id: organization.id },
                include: [
                    {
                        model: Plan,
                        as: 'plan',
                        include: [{ model: Tool, as: 'tool' }]
                    },
                    {
                        model: Bundle,
                        as: 'bundle',
                        include: [{ model: BundleGroup, as: 'group' }]
                    },
                    { model: Plan, as: 'upcoming_plan', include: [{ model: Tool, as: 'tool' }] },
                    { model: Bundle, as: 'upcoming_bundle', include: [{ model: BundleGroup, as: 'group' }] }
                ],
                order: [['created_at', 'DESC']]
            });

            // Fetch One-Time Purchases
            const { OneTimePurchase } = await import('../models/one_time_purchase');
            const oneTimePurchases = await OneTimePurchase.findAll({
                where: { organization_id: organization.id },
                include: [
                    { model: Plan, as: 'plan', include: [{ model: Tool, as: 'tool' }] },
                    { model: Bundle, as: 'bundle', include: [{ model: BundleGroup, as: 'group' }] }
                ],
                order: [['created_at', 'DESC']]
            });

            // 2. Fetch Stripe Data for Payment Methods (if connected)
            const stripePaymentMethodsMap: Record<string, Stripe.PaymentMethod | string> = {};
            let defaultPaymentMethod: Stripe.PaymentMethod | string | null = null;
            
            if (organization.stripe_customer_id) {
                try {
                    const [customer, stripeSubs] = await Promise.all([
                        stripeService.getCustomer(organization.stripe_customer_id),
                        stripeService.getCustomerSubscriptions(organization.stripe_customer_id)
                    ]);

                    // Get Default Customer PM
                    if ((customer as Stripe.Customer).invoice_settings?.default_payment_method) {
                        const pmId = (customer as Stripe.Customer).invoice_settings.default_payment_method;
                        if (typeof pmId === 'string') {
                            const pm = await stripeService.getClient().paymentMethods.retrieve(pmId);
                            defaultPaymentMethod = pm;
                        } else {
                            defaultPaymentMethod = pmId;
                        }
                    }

                    // Map Subscription ID -> Payment Method
                    stripeSubs.data.forEach((sub) => {
                        if (sub.default_payment_method) {
                            stripePaymentMethodsMap[sub.id] = sub.default_payment_method;
                        }
                    });

                } catch (err) {
                    Logger.error("Failed to fetch Stripe details for enrichment", { error: err, organizationId: organization.id });
                    // Throw error or flag partial response
                    res.status(502).json({ message: 'Failed to retrieve payment details from Stripe', subscriptions: subscriptions });
                    return;
                }
            }

            // 3. Merge Data
            const enrichedSubscriptions = subscriptions.map((sub) => {
                const subJson = sub.toJSON();
                let paymentMethod: Stripe.PaymentMethod | string | null = null;

                if (sub.stripe_subscription_id) {
                    // Check for subscription-specific PM first
                    const specificPm = stripePaymentMethodsMap[sub.stripe_subscription_id];
                    if (specificPm) {
                        paymentMethod = specificPm;
                    } else {
                        // Fallback to customer default
                        paymentMethod = defaultPaymentMethod;
                    }
                }

                return {
                    ...subJson,
                    paymentMethodDetails: (paymentMethod && typeof paymentMethod !== 'string') ? {
                        brand: paymentMethod.card?.brand,
                        last4: paymentMethod.card?.last4,
                        exp_month: paymentMethod.card?.exp_month,
                        exp_year: paymentMethod.card?.exp_year
                    } : null
                };
            });

            res.status(200).json({ 
                subscriptions: enrichedSubscriptions,
                oneTimePurchases: oneTimePurchases 
            });
        } catch (error) {
            next(error);
        }
    }

    // Creates a Portal Session for managing billing
    async createPortalSession(req: Request, res: Response, next: NextFunction) {
        try {
            const organization = req.organization;
            if (!organization || !organization.stripe_customer_id) {
                res.status(400).json({ message: 'Organization is not linked to Stripe' });
                return;
            }

            const session = await stripeService.createPortalSession(
                organization.stripe_customer_id,
                `${process.env.FRONTEND_URL}/billing`
            );

            res.status(200).json({ url: session.url });
        } catch (error) {
            next(error);
        }
    }

    // Get Invoices
    async getInvoices(req: Request, res: Response, next: NextFunction) {
        try {
            const organization = req.organization;
            if (!organization || !organization.stripe_customer_id) {
                res.status(200).json({ invoices: [] });
                return;
            }

            const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
            const invoices = await stripeService.getInvoices(organization.stripe_customer_id, limit);
            res.status(200).json({ invoices: invoices.data });
        } catch (error) {
            next(error);
        }
    }

    // Get Payment Methods
    async getPaymentMethods(req: Request, res: Response, next: NextFunction) {
        try {
            const organization = req.organization;
            if (!organization || !organization.stripe_customer_id) {
                res.status(200).json({ paymentMethods: [] });
                return;
            }

            const paymentMethods = await stripeService.getPaymentMethods(organization.stripe_customer_id);
            res.status(200).json({ paymentMethods: paymentMethods.data });
        } catch (error) {
            next(error);
        }
    }

    // Cancel Subscription
    async cancelSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            // Verify this subscription belongs to the organization
            const subscription = await Subscription.findOne({
                where: {
                    stripe_subscription_id: id,
                    organization_id: req.organization?.id
                }
            });

            if (!subscription) {
                res.status(404).json({ message: 'Subscription not found' });
                return;
            }

            await stripeService.cancelSubscription(id);
            // Optimistically update local state or wait for webhook
            await subscription.update({ cancel_at_period_end: true });

            res.status(200).json({ message: 'Subscription cancelled successfully' });

            await AuditService.log({
                actorId: req.user?.id,
                action: 'CANCEL_SUBSCRIPTION',
                entityType: 'Subscription',
                entityId: subscription.id,
                details: { stripe_subscription_id: id },
                req
            });
        } catch (error) {
            next(error);
        }
    }

    // Resume Subscription
    async resumeSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const subscription = await Subscription.findOne({
                where: {
                    stripe_subscription_id: id,
                    organization_id: req.organization?.id
                }
            });

            if (!subscription) {
                res.status(404).json({ message: 'Subscription not found' });
                return;
            }

            await stripeService.resumeSubscription(id);
            await subscription.update({ cancel_at_period_end: false });

            res.status(200).json({ message: 'Subscription resumed successfully' });

            await AuditService.log({
                actorId: req.user?.id,
                action: 'RESUME_SUBSCRIPTION',
                entityType: 'Subscription',
                entityId: subscription.id,
                details: { stripe_subscription_id: id },
                req
            });
        } catch (error) {
            next(error);
        }
    }

    // Handle Stripe Webhooks logic moved to webhook.controller.ts

    // Sync Subscription Status manually
    async syncSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const organization = req.organization;
            if (!organization?.stripe_customer_id) {
                res.status(400).json({ message: 'Organization is not linked to Stripe' });
                return;
            }

            console.log(`[Billing] Manual Sync for Org ${organization.id}`);
            const stripeSubs = await stripeService.getCustomerSubscriptions(organization.stripe_customer_id);
            let updatedCount = 0;

            // Loop through stripe subscriptions and update local ones
            for (const stripeSub of stripeSubs.data) {
                const localSub = await Subscription.findOne({
                    where: { stripe_subscription_id: stripeSub.id, organization_id: organization.id }
                });

                if (localSub) {
                    const status = this.mapStripeStatus(stripeSub.status);
                    const isPaymentFailed = status === SubStatus.PAST_DUE || status === SubStatus.UNPAID;

                    const item = stripeSub.items?.data?.[0];
                    const start = (stripeSub as unknown as { current_period_start?: number }).current_period_start || item?.current_period_start;
                    const end = (stripeSub as unknown as { current_period_end?: number }).current_period_end || item?.current_period_end;

                    await localSub.update({
                        status: status,
                        current_period_start: this.toDateNullable(start),
                        current_period_end: this.toDateNullable(end),
                        cancel_at_period_end: stripeSub.cancel_at_period_end,
                        last_payment_failure_at: isPaymentFailed ? localSub.last_payment_failure_at : null
                    });

                    // Sync Fingerprint if missing
                    let fingerprint = localSub.card_fingerprint;
                    if (!fingerprint) {
                        fingerprint = await this.getCardFingerprint(stripeSub);
                        if (fingerprint) await localSub.update({ card_fingerprint: fingerprint });
                    }

                    if (fingerprint) {
                        await this.checkAndEnforceTrialAbuse(localSub, stripeSub, localSub.plan_id, fingerprint, req.user?.id);
                    }
                    updatedCount++;
                }
            }

            res.status(200).json({ message: 'Sync complete', updated: updatedCount });

        } catch (error) {
            next(error);
        }
    }

    private async checkAndEnforceTrialAbuse(subscription: Subscription, stripeSub: Stripe.Subscription, planId: string | null | undefined, fingerprint: string | null, actorId?: string) {
        if (fingerprint && (subscription.status === SubStatus.TRIALING || subscription.status === SubStatus.ACTIVE)) {
            try {
                // Check for duplicates
                // Check if we should bypass for paid active plans
                let toolId: string | undefined;

                if (planId) {
                    const plan = await Plan.findByPk(planId);
                    if (plan) {
                        // FIX: Allow Paid Active Subscriptions (Customer paid, so trial restrictions don't apply)
                        if (subscription.status === SubStatus.ACTIVE && plan.price > 0) {
                            return;
                        }
                        toolId = plan.tool_id;
                    }
                }

                if (toolId) {
                    // Find all plans for this tool to check against
                    const toolPlans = await Plan.findAll({ where: { tool_id: toolId }, attributes: ['id'] });
                    const toolPlanIds = toolPlans.map(p => p.id);

                    // Check for OTHER subscriptions with same card for this tool (ANY STATUS)
                    const duplicateSub = await Subscription.findOne({
                        where: {
                            card_fingerprint: fingerprint,
                            plan_id: { [Op.in]: toolPlanIds },
                            // REMOVED status check: we want to block if they have EVER used this card for this tool
                            id: { [Op.ne]: subscription?.id } // Exclude current
                        }
                    });

                    if (duplicateSub) {
                        console.warn(`[AbuseDetection] Duplicate card use detected! Fingerprint: ${fingerprint}. Existing Sub: ${duplicateSub.id}. Cancelling new Sub: ${subscription?.id}`);

                        // Cancel Stripe Sub Immediately
                        await stripeService.cancelSubscriptionImmediately(stripeSub.id);

                        // Update Local Sub
                        if (subscription) {
                            await subscription.update({
                                status: SubStatus.CANCELED,
                                cancellation_reason: 'duplicate_card'
                            });
                        }

                        await AuditService.log({
                            actorId,
                            action: 'TRIAL_ABUSE_DETECTED',
                            entityType: 'Subscription',
                            entityId: subscription?.id || 'unknown',
                            details: {
                                fingerprint,
                                duplicate_subscription_id: duplicateSub.id,
                                stripe_subscription_id: stripeSub.id
                            }
                        });
                    }
                }
            } catch (err) {
                console.error(`[AbuseDetection] Error checking duplicate card:`, err);
            }
        }
    }

    // Update Subscription (Upgrade/Downgrade)
    async updateSubscription(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { items } = req.body; // Expecting items array like checkout: [{ id: '...', type: 'plan'|'bundle', interval: '...' }]
            const organization = req.organization;

            if (!items || items.length === 0) {
                res.status(400).json({ message: 'No items provided for update' });
                return;
            }

            const targetItem = items[0]; // Assuming single item switch for now

            const subscription = await Subscription.findOne({
                where: {
                    id: id,
                    organization_id: organization?.id
                },
                include: [{ model: Plan, as: 'plan' }, { model: Bundle, as: 'bundle' }]
            });

            if (!subscription) {
                res.status(404).json({ message: 'Subscription not found' });
                return;
            }

            const stripeSubId = subscription.stripe_subscription_id;
            if (!stripeSubId) {
                res.status(400).json({ message: 'No Stripe subscription linked' });
                return;
            }

            // 1. Resolve Target Price & ID
            let targetPriceId: string | undefined;
            let targetPriceAmount = 0;
            let targetPlanId: string | null = null;
            let targetBundleId: string | null = null;

            if (targetItem.type === 'plan') {
                const plan = await Plan.findByPk(targetItem.id);
                if (!plan) { res.status(404).json({ message: 'Target plan not found' }); return; }
                targetPriceId = targetItem.interval === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
                targetPriceAmount = plan.price; // Simplified: considering base price for comparison
                targetPlanId = plan.id;
            } else if (targetItem.type === 'bundle') {
                const bundle = await Bundle.findByPk(targetItem.id);
                if (!bundle) { res.status(404).json({ message: 'Target bundle not found' }); return; }
                targetPriceId = targetItem.interval === 'yearly' ? bundle.stripe_price_id_yearly : bundle.stripe_price_id_monthly;
                targetPriceAmount = bundle.price;
                targetBundleId = bundle.id;
            }

            if (!targetPriceId) {
                res.status(400).json({ message: 'Target price not found' });
                return;
            }

            // 2. Resolve Current Price Amount
            let currentPriceAmount = 0;
            if (subscription.plan) {
                currentPriceAmount = subscription.plan.price;
            } else if (subscription.bundle) {
                currentPriceAmount = subscription.bundle.price;
            }

            // 3. Compare & Execute
            if (targetPriceAmount < currentPriceAmount) {
                // DOWNGRADE -> Schedule
                console.log(`[BillingController] Downgrading subscription ${stripeSubId} to ${targetItem.type} ${targetItem.id}`);
                await stripeService.scheduleDowngrade(stripeSubId, targetPriceId);

                // Updates local upcoming fields to reflect pending state
                await subscription.update({
                    upcoming_plan_id: targetPlanId,
                    upcoming_bundle_id: targetBundleId
                });

                res.status(200).json({ message: `Subscription scheduled to downgrade at the end of the billing cycle.` });

                await AuditService.log({
                    actorId: req.user?.id,
                    action: 'UPDATE_SUBSCRIPTION',
                    entityType: 'Subscription',
                    entityId: subscription.id,
                    details: {
                        type: 'DOWNGRADE',
                        target_price_id: targetPriceId,
                        target_plan_id: targetPlanId,
                        target_bundle_id: targetBundleId,
                        schedule: 'PERIOD_END'
                    },
                    req
                });

            } else {
                // UPGRADE (or same price switch) -> Immediate
                console.log(`[BillingController] Upgrading subscription ${stripeSubId} to ${targetItem.type} ${targetItem.id}`);
                
                // End trial immediately if current price was 0 (upgrading a free trial)
                const isCurrentlyFreeTrial = currentPriceAmount === 0;

                // Ensure userId is in metadata for future webhooks
                await stripeService.updateSubscription(
                    stripeSubId, 
                    targetPriceId, 
                    req.user ? { userId: req.user.id } : undefined,
                    isCurrentlyFreeTrial
                );

                // Immediately update local DB with new plan/bundle
                await subscription.update({
                    plan_id: targetPlanId || subscription.plan_id,
                    bundle_id: targetBundleId || subscription.bundle_id,
                    upcoming_plan_id: null,
                    upcoming_bundle_id: null
                });

                res.status(200).json({ message: 'Subscription updated successfully' });

                await AuditService.log({
                    actorId: req.user?.id,
                    action: 'UPDATE_SUBSCRIPTION',
                    entityType: 'Subscription',
                    entityId: subscription.id,
                    details: {
                        type: 'UPGRADE_OR_CHANGE',
                        target_price_id: targetPriceId,
                        target_plan_id: targetPlanId,
                        target_bundle_id: targetBundleId,
                        schedule: 'IMMEDIATE'
                    },
                    req
                });
            }

        } catch (error) {
            next(error);
        }
    }

    // Cancel Scheduled Downgrade
    async cancelDowngrade(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const organization = req.organization;

            const subscription = await Subscription.findOne({
                where: {
                    id: id,
                    organization_id: organization?.id
                }
            });

            if (!subscription) {
                res.status(404).json({ message: 'Subscription not found' });
                return;
            }

            if (!subscription.upcoming_plan_id && !subscription.upcoming_bundle_id) {
                res.status(400).json({ message: 'No pending downgrade to cancel' });
                return;
            }

            const stripeSubId = subscription.stripe_subscription_id;
            if (!stripeSubId) {
                res.status(400).json({ message: 'No Stripe subscription linked' });
                return;
            }

            // Release the Stripe subscription schedule
            await stripeService.cancelScheduledDowngrade(stripeSubId);

            // Clear upcoming fields in local DB
            await subscription.update({
                upcoming_plan_id: null,
                upcoming_bundle_id: null
            });

            res.status(200).json({ message: 'Scheduled downgrade cancelled successfully' });
        } catch (error) {
            next(error);
        }
    }

    // ==========================
    // Trial Management
    // ==========================

    async startTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { tool_id } = req.body;
            const organization = req.organization;
            if (!organization) { res.status(404).json({ message: 'Organization not found' }); return; }
            if (!tool_id) { res.status(400).json({ message: 'tool_id is required' }); return; }

            // 1. Find trial plan
            const trialPlan = await Plan.findOne({
                where: { tool_id, is_trial_plan: true, active: true },
                include: [{ model: Tool, as: 'tool' }]
            });

            if (!trialPlan || !trialPlan.tool || trialPlan.tool.trial_days <= 0) {
                res.status(400).json({ message: 'No free trial available for this tool' });
                return;
            }

            // 2. Check eligibility (Strict)
            const eligible = await this.isTrialEligible(req.user?.id, tool_id, organization.id);
            if (!eligible) {
                res.status(400).json({ message: 'Organization or User has already used trial/subscription for this tool.' });
                return;
            }

            const tool = trialPlan.tool;
            const trialDays = tool.trial_days;
            const now = new Date();
            const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

            // 3. Create Stripe Customer if needed
            let customerId = organization.stripe_customer_id;
            if (!customerId) {
                const customer = await stripeService.createCustomer(organization.billing_email || req.user?.email || '', organization.name, { orgId: organization.id });
                customerId = customer.id;
                await organization.update({ stripe_customer_id: customerId });
            }

            const priceId = trialPlan.stripe_price_id_monthly || trialPlan.stripe_price_id_yearly;
            if (!priceId) { res.status(500).json({ message: 'Trial plan has no price configured' }); return; }

            const metadata: Record<string, string> = { org_id: organization.id, plan_id: trialPlan.id, tool_id };
            if (trialPlan.price === 0) metadata.auto_cancel_trial = 'true';

            const stripeSub = await stripeService.createTrialSubscription(customerId, priceId, trialDays, metadata);

            const subscription = await Subscription.create({
                organization_id: organization.id,
                plan_id: trialPlan.id,
                stripe_subscription_id: stripeSub.id,
                status: SubStatus.TRIALING,
                trial_start: now,
                trial_end: trialEnd,
                current_period_start: now,
                current_period_end: trialEnd,
                cancel_at_period_end: false,
            });

            await AuditService.log({
                actorId: req.user?.id,
                action: 'TRIAL_STARTED',
                entityType: 'Subscription',
                entityId: subscription.id,
                details: {
                    toolId: tool_id,
                    trialDays: trialDays,
                    planId: trialPlan.id
                },
                req
            });

            res.status(201).json(subscription);
        } catch (error) {
            next(error);
        }
    }

    async cancelTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const organization = req.organization;

            const subscription = await Subscription.findOne({
                where: {
                    id,
                    organization_id: organization?.id,
                    status: SubStatus.TRIALING,
                }
            });

            if (!subscription) {
                res.status(404).json({ message: 'Active trial not found' });
                return;
            }

            // Cancel on Stripe if exists
            if (subscription.stripe_subscription_id) {
                try {
                    await stripeService.cancelSubscriptionImmediately(subscription.stripe_subscription_id);
                } catch (e) {
                    console.error('Failed to cancel Stripe trial subscription:', e);
                }
            }

            await subscription.update({
                status: SubStatus.CANCELED,
                cancel_at_period_end: false,
            });

            res.status(200).json({ message: 'Trial cancelled successfully' });
        } catch (error) {
            next(error);
        }
    }

    async checkTrialEligibility(req: Request, res: Response, next: NextFunction) {
        try {
            const { tool_id } = req.query;
            const organization = req.organization;
            if (!organization) { res.status(404).json({ message: 'Organization not found' }); return; }
            if (!tool_id) { res.status(400).json({ message: 'tool_id required' }); return; }

            const trialPlan = await Plan.findOne({
                where: { tool_id: tool_id as string, is_trial_plan: true, active: true },
                include: [{ model: Tool, as: 'tool' }]
            });

            if (!trialPlan?.tool || trialPlan.tool.trial_days <= 0) {
                res.status(200).json({ eligible: false, reason: 'No free trial available', trialDays: 0 });
                return;
            }

            const eligible = await this.isTrialEligible(req.user?.id, tool_id as string, organization.id);
            
            if (!eligible) {
                res.status(200).json({ eligible: false, reason: 'Trial already used', trialDays: trialPlan.tool.trial_days });
                return;
            }

            res.status(200).json({ eligible: true, trialDays: trialPlan.tool.trial_days });
        } catch (error) {
            next(error);
        }
    }
    // --- Helper Methods ---

    // Map Stripe status to local SubStatus
    private mapStripeStatus(status: string): SubStatus {
        const map: { [key: string]: SubStatus } = {
            'active': SubStatus.ACTIVE,
            'past_due': SubStatus.PAST_DUE,
            'canceled': SubStatus.CANCELED,
            'trialing': SubStatus.TRIALING,
            'incomplete': SubStatus.INCOMPLETE,
            'incomplete_expired': SubStatus.INCOMPLETE_EXPIRED,
            'unpaid': SubStatus.UNPAID,
            'paused': SubStatus.PAUSED
        };
        return map[status] || SubStatus.INCOMPLETE;
    }

    // Convert Stripe timestamp to Date
    private toDateNullable(ts: number | null | undefined): Date | null {
        return ts ? new Date(ts * 1000) : null;
    }

    // Resolve Plan or Bundle from Stripe Price ID
    private async resolvePlanOrBundle(priceId: string): Promise<{ planId: string | null, bundleId: string | null }> {
        // Check Plan
        const plan = await Plan.findOne({
            where: sequelize.or({ stripe_price_id_monthly: priceId }, { stripe_price_id_yearly: priceId })
        });
        if (plan) return { planId: plan.id, bundleId: null };

        // Check Bundle
        const bundle = await Bundle.findOne({
            where: sequelize.or({ stripe_price_id_monthly: priceId }, { stripe_price_id_yearly: priceId })
        });
        if (bundle) return { planId: null, bundleId: bundle.id };

        return { planId: null, bundleId: null };
    }

    // Fetch Card Fingerprint from Stripe Subscription
    private async getCardFingerprint(stripeSub: Stripe.Subscription): Promise<string | null> {
        try {
            let pmId: string | Stripe.PaymentMethod | null | undefined = stripeSub.default_payment_method;
            if (!pmId && stripeSub.customer) { 
                const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
                const customer = await stripeService.getCustomer(customerId) as Stripe.Customer;
                if (!customer.deleted) {
                     pmId = customer.invoice_settings?.default_payment_method;
                }
            }
            if (typeof pmId === 'object' && pmId !== null) pmId = pmId.id;
            
            if (pmId) {
                const pm = await stripeService.getClient().paymentMethods.retrieve(pmId);
                return pm.card?.fingerprint || null;
            }
        } catch (e) {
             console.warn('[Billing] Failed to fetch fingerprint', e);
        }
        return null;
    }

    // Check if user is eligible for trial (based on past usage in any org)
    private async isTrialEligible(userId: string | undefined, toolId: string, currentOrgId: string): Promise<boolean> {
        const orgIdsToCheck = [currentOrgId];
        
        if (userId) {
            const memberships = await OrganizationMember.findAll({ where: { user_id: userId } });
            memberships.forEach(m => { if (!orgIdsToCheck.includes(m.organization_id)) orgIdsToCheck.push(m.organization_id); });
        }

        const existingSubscription = await Subscription.findOne({
            where: { organization_id: { [Op.in]: orgIdsToCheck } },
            include: [{ model: Plan, as: 'plan', where: { tool_id: toolId }, required: true }],
            paranoid: false // Check even deleted subscriptions to prevent abuse
        });

        return !existingSubscription;
    }

}

export const billingController = new BillingController();

