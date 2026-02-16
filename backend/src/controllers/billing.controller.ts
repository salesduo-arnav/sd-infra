import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe.service';
import Stripe from 'stripe';
import { Organization, OrganizationMember } from '../models/organization';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import sequelize from '../config/db';
import { Op } from 'sequelize';

class BillingController {
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
            const sessionConfig: Stripe.Checkout.SessionCreateParams = {
                customer: customerId,
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: lineItems,
                metadata: {
                    organizationId: organization.id,
                    items: JSON.stringify(metadataItems),
                    interval: firstInterval
                },
                subscription_data: { metadata: { organizationId: organization.id } }
            };

            if (trialPeriodDays > 0) {
                if (!sessionConfig.subscription_data) {
                    sessionConfig.subscription_data = {};
                }
                sessionConfig.subscription_data.trial_period_days = trialPeriodDays;

                // Only auto-cancel free trials
                if (!hasPaidComponent) {
                    sessionConfig.subscription_data.metadata = { ...sessionConfig.subscription_data.metadata, auto_cancel_trial: 'true' };
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
                    console.error("Failed to fetch Stripe details for enrichment", err);
                    // Continue without payment details if Stripe fails
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

            res.status(200).json({ subscriptions: enrichedSubscriptions });
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
        } catch (error) {
            next(error);
        }
    }

    // Handles Stripe Webhooks
    async handleWebhook(req: Request, res: Response, next: NextFunction) {
        const sig = req.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        console.log(`[Webhook] Received request. Sig exists: ${!!sig}, Secret exists: ${!!endpointSecret}`);

        if (!endpointSecret || !sig) {
            console.error('[Webhook] Missing secret or signature');
            res.status(400).send('Webhook Secret or Signature missing');
            return;
        }

        let event;

        try {
            // req.body must be raw buffer here
            event = stripeService.constructEvent(req.body, sig as string, endpointSecret);
        } catch (err) {
            const errorMessage = (err as Error).message;
            console.error(`Webhook Error: ${errorMessage}`);
            res.status(400).send(`Webhook Error: ${errorMessage}`);
            return;
        }

        // Handle event
        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await this.handleCheckoutSessionCompleted(event.data.object);
                    break;
                case 'customer.subscription.updated':
                case 'customer.subscription.created': {
                    await this.handleSubscriptionUpdated(event.data.object);
                    // Check for auto-cancel metadata
                    const sub = event.data.object as Stripe.Subscription;
                    if (sub.metadata?.auto_cancel_trial === 'true' && !sub.cancel_at_period_end && sub.status === 'trialing') {
                        console.log(`[BillingController] Auto-cancelling trial subscription ${sub.id} at period end.`);
                        await stripeService.cancelSubscriptionAtPeriodEnd(sub.id);
                    }
                    break;
                }
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await this.handleInvoicePaymentFailed(event.data.object);
                    break;
                case 'invoice.payment_succeeded':
                    await this.handleInvoicePaymentSucceeded(event.data.object);
                    break;
                default:
                    console.log(`Unhandled event type ${event.type}`);
            }
            res.json({ received: true });
        } catch (err) {
            console.error('Error handling webhook event:', err);
            next(err);
        }
    }

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

                    // Sync Fingerprint if missing and active/trialing
                    let fingerprint = localSub.card_fingerprint;
                    if (!fingerprint && (status === SubStatus.TRIALING || status === SubStatus.ACTIVE)) {
                        fingerprint = await this.getCardFingerprint(stripeSub);
                        if (fingerprint) await localSub.update({ card_fingerprint: fingerprint });
                    }

                    if (fingerprint) {
                        await this.checkAndEnforceTrialAbuse(localSub, stripeSub, localSub.plan_id, fingerprint);
                    }
                    updatedCount++;
                }
            }

            res.status(200).json({ message: 'Sync complete', updated: updatedCount });

        } catch (error) {
            next(error);
        }
    }

    // --- Webhook Handlers ---

    private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
        console.log(`[BillingController] Checkout completed for Org ${session.metadata?.organizationId}, Sub ${session.subscription}`);
        const orgId = session.metadata?.organizationId;
        if (orgId && session.subscription) {
            console.log(`Checkout completed for Org ${orgId}, Sub ${session.subscription}`);

            // Strict Synchronization: Ensure local DB matches the Customer ID that just paid
            if (session.customer) {
                const organization = await Organization.findByPk(orgId);
                if (organization && organization.stripe_customer_id !== session.customer) {
                    console.log(`[BillingController] syncing Customer ID. Local: ${organization.stripe_customer_id} -> Remote: ${session.customer}`);
                    await organization.update({ stripe_customer_id: session.customer as string });
                }
            }
        }
    }

    private async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
        const orgId = stripeSub.metadata?.organizationId;
        if (!orgId) return;

        console.log(`[Billing] Sub Update Org ${orgId}. Status: ${stripeSub.status}`);

        const status = this.mapStripeStatus(stripeSub.status);
        const item = stripeSub.items?.data?.[0];
        const start = (stripeSub as unknown as { current_period_start?: number }).current_period_start || item?.current_period_start;
        const end = (stripeSub as unknown as { current_period_end?: number }).current_period_end || item?.current_period_end;

        // Resolve Plan/Bundle
        let finalPlanId: string | null = null;
        let finalBundleId: string | null = null;

        for (const it of stripeSub.items?.data || []) {
            const { planId, bundleId } = await this.resolvePlanOrBundle(it.price.id);
            if (planId || bundleId) {
                finalPlanId = planId;
                finalBundleId = bundleId;
                break;
            }
        }

        // Find existing sub by Stripe ID
        let subscription = await Subscription.findOne({
            where: { stripe_subscription_id: stripeSub.id, organization_id: orgId }
        });

        // Fingerprint & Abuse Check
        let fingerprint: string | null = null;
        if (status === SubStatus.TRIALING || status === SubStatus.ACTIVE) {
            // Check if plan is trial plan
            let isTrialPlan = false;
            if (finalPlanId) {
                const plan = await Plan.findByPk(finalPlanId);
                if (plan?.is_trial_plan) isTrialPlan = true;
            }

            if (isTrialPlan) {
                fingerprint = await this.getCardFingerprint(stripeSub);
            }
        }

        const subData = {
            stripe_subscription_id: stripeSub.id,
            plan_id: finalPlanId,
            bundle_id: finalBundleId,
            status,
            current_period_start: this.toDateNullable(start),
            current_period_end: this.toDateNullable(end),
            trial_start: this.toDateNullable(stripeSub.trial_start),
            trial_end: this.toDateNullable(stripeSub.trial_end),
            cancel_at_period_end: stripeSub.cancel_at_period_end,
            upcoming_plan_id: null,
            upcoming_bundle_id: null,
            card_fingerprint: fingerprint,
        };

        if (subscription) {
            await subscription.update(subData);
        } else {
            subscription = await Subscription.create({ organization_id: orgId, ...subData });
        }

        if (fingerprint && (status === SubStatus.TRIALING || status === SubStatus.ACTIVE)) {
            await this.checkAndEnforceTrialAbuse(subscription, stripeSub, finalPlanId || subscription.plan_id, fingerprint);
        }
    }

    private async checkAndEnforceTrialAbuse(subscription: Subscription, stripeSub: Stripe.Subscription, planId: string | null | undefined, fingerprint: string | null) {
        if (fingerprint && (subscription.status === SubStatus.TRIALING || subscription.status === SubStatus.ACTIVE)) {
            try {
                // Check for duplicates
                const toolId = planId ? (await Plan.findByPk(planId))?.tool_id : null;

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
                    }
                }
            } catch (err) {
                console.error(`[AbuseDetection] Error checking duplicate card:`, err);
            }
        }
    }


    private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
        console.log('Subscription deleted', stripeSub.id);
        const subscriptions = await Subscription.findAll({ where: { stripe_subscription_id: stripeSub.id } });
        if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
                await sub.update({ status: SubStatus.CANCELED });
            }
        }
    }

    private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
        console.log('Invoice payment failed', invoice.id);

        // Resolve subscription ID (handle different invoice structures)
        // Resolve subscription ID (handle different invoice structures)
        const inv = invoice as unknown as { subscription?: string | null; parent?: { subscription_details?: { subscription?: string } } };
        const subscriptionId = typeof inv.subscription === 'string'
            ? inv.subscription
            : inv.parent?.subscription_details?.subscription;

        // Find the subscription associated with this invoice
        if (subscriptionId) {
            const subscription = await Subscription.findOne({
                where: { stripe_subscription_id: subscriptionId }
            });

            if (subscription) {
                console.log(`[BillingController] Marking subscription ${subscription.id} as past_due due to payment failure.`);
                await subscription.update({
                    status: SubStatus.PAST_DUE,
                    last_payment_failure_at: new Date()
                });
            } else {
                console.warn(`[BillingController] Subscription not found for failed invoice: ${invoice.id}, Sub ID: ${subscriptionId}`);
            }
        } else {
            console.warn(`[BillingController] No subscription ID found in invoice: ${invoice.id}`);
        }
    }

    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
        console.log('Invoice payment succeeded', invoice.id);

        // Resolve subscription ID (handle different invoice structures)
        // Resolve subscription ID (handle different invoice structures)
        const inv = invoice as unknown as { subscription?: string | null; parent?: { subscription_details?: { subscription?: string } } };
        const subscriptionId = typeof inv.subscription === 'string'
            ? inv.subscription
            : inv.parent?.subscription_details?.subscription;

        if (subscriptionId) {
            const subscription = await Subscription.findOne({
                where: { stripe_subscription_id: subscriptionId }
            });

            if (subscription) {
                console.log(`[BillingController] Validating subscription ${subscription.id} status after payment success.`);
                await subscription.update({
                    status: SubStatus.ACTIVE,
                    last_payment_failure_at: null
                });
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

            } else {
                // UPGRADE (or same price switch) -> Immediate
                console.log(`[BillingController] Upgrading subscription ${stripeSubId} to ${targetItem.type} ${targetItem.id}`);
                await stripeService.updateSubscription(stripeSubId, targetPriceId);

                // Immediately update local DB with new plan/bundle
                await subscription.update({
                    plan_id: targetPlanId || subscription.plan_id,
                    bundle_id: targetBundleId || subscription.bundle_id,
                    upcoming_plan_id: null,
                    upcoming_bundle_id: null
                });

                res.status(200).json({ message: 'Subscription updated successfully' });
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

