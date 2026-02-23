import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe.service';
import Stripe from 'stripe';
import { Organization, OrganizationMember } from '../models/organization';
import { Plan } from '../models/plan';
import { Bundle } from '../models/bundle';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import { WebhookEvent, WebhookEventStatus } from '../models/webhook_event';
import sequelize from '../config/db';
import { Op } from 'sequelize';
import Logger from '../utils/logger';

class WebhookController {
    // Handles Stripe Webhooks
    async handleWebhook(req: Request, res: Response, next: NextFunction) {
        const sig = req.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        Logger.info(`[Webhook] Received request. Sig exists: ${!!sig}, Secret exists: ${!!endpointSecret}`);

        if (!endpointSecret || !sig) {
            Logger.error('[Webhook] Missing secret or signature');
            res.status(400).send('Webhook Secret or Signature missing');
            return;
        }

        let event: Stripe.Event;

        try {
            // req.body must be raw buffer here
            event = stripeService.constructEvent(req.body, sig as string, endpointSecret);
        } catch (err) {
            const errorMessage = (err as Error).message;
            Logger.error(`Webhook Error: ${errorMessage}`);
            res.status(400).send(`Webhook Error: ${errorMessage}`);
            return;
        }

        Logger.info(`[Webhook] Processing event config: ${event.id} of type ${event.type}`);

        // 1. Idempotency / Replay Protection Check
        try {
            const [webhookEvent, created] = await WebhookEvent.findOrCreate({
                where: { stripe_event_id: event.id },
                defaults: {
                    stripe_event_id: event.id,
                    type: event.type,
                    status: WebhookEventStatus.PENDING
                }
            });

            if (!created) {
                if (webhookEvent.status === WebhookEventStatus.PROCESSED) {
                    Logger.info(`[Webhook] Event ${event.id} already processed. Skipping.`);
                    res.json({ received: true, status: 'already_processed' });
                    return;
                } else if (webhookEvent.status === WebhookEventStatus.PENDING) {
                    Logger.warn(`[Webhook] Event ${event.id} is currently processing in another request. Skipping.`);
                    res.json({ received: true, status: 'processing' });
                    return;
                }
                // If FAILED, we will retry processing
                Logger.info(`[Webhook] Retrying failed event ${event.id}.`);
            }

            // 2. Handle the event
            try {
                switch (event.type) {
                    case 'checkout.session.completed':
                        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
                        break;
                    case 'customer.subscription.updated':
                    case 'customer.subscription.created': {
                        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                        // Check for auto-cancel metadata
                        const sub = event.data.object as Stripe.Subscription;
                        if (sub.metadata?.auto_cancel_trial === 'true' && !sub.cancel_at_period_end && sub.status === 'trialing') {
                            Logger.info(`[WebhookController] Auto-cancelling trial subscription ${sub.id} at period end.`);
                            await stripeService.cancelSubscriptionAtPeriodEnd(sub.id);
                        }
                        break;
                    }
                    case 'customer.subscription.deleted':
                        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                        break;
                    case 'invoice.payment_failed':
                        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
                        break;
                    case 'invoice.payment_succeeded':
                        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
                        break;
                    default:
                        Logger.info(`[Webhook] Unhandled event type ${event.type}`);
                }

                // 3. Mark as processed
                await webhookEvent.update({ status: WebhookEventStatus.PROCESSED });
                res.json({ received: true });
            } catch (err) {
                Logger.error(`[Webhook] Error handling event ${event.id}:`, err);
                
                // 4. Dead-letter / Track Failure
                await webhookEvent.update({ 
                    status: WebhookEventStatus.FAILED,
                    error_message: (err as Error).message || 'Unknown error'
                });
                
                next(err);
            }
        } catch (dbErr) {
            Logger.error(`[Webhook] Database error while checking idempotency for event ${event.id}:`, dbErr);
            // We should still return 500 / throw to allow Stripe to retry
            next(dbErr);
        }
    }

    // --- Webhook Handlers ---

    private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
        Logger.info(`[WebhookController] Checkout completed for Org ${session.metadata?.organizationId}, Sub ${session.subscription}, PaymentIntent ${session.payment_intent}`);
        const orgId = session.metadata?.organizationId;
        
        if (orgId) {
            // Strict Synchronization: Ensure local DB matches the Customer ID that just paid
            if (session.customer) {
                const organization = await Organization.findByPk(orgId);
                if (organization && organization.stripe_customer_id !== session.customer) {
                    Logger.info(`[WebhookController] syncing Customer ID. Local: ${organization.stripe_customer_id} -> Remote: ${session.customer}`);
                    await organization.update({ stripe_customer_id: session.customer as string });
                }
            }
            
            if (session.mode === 'subscription' && session.subscription) {
                Logger.info(`Checkout completed for Org ${orgId}, Sub ${session.subscription}`);
            } else if (session.mode === 'payment' && session.payment_intent) {
                 Logger.info(`Payment Checkout completed for Org ${orgId}, Intent ${session.payment_intent}`);
                 
                 const itemsMeta = session.metadata?.items ? JSON.parse(session.metadata.items) : [];
                 let planId = null;
                 let bundleId = null;
                 
                 if (itemsMeta.length > 0) {
                     const item = itemsMeta[0];
                     if (item.type === 'plan') planId = item.id;
                     if (item.type === 'bundle') bundleId = item.id;
                 }

                 const { OneTimePurchase } = await import('../models/one_time_purchase');
                 
                 await OneTimePurchase.create({
                     organization_id: orgId,
                     plan_id: planId,
                     bundle_id: bundleId,
                     stripe_payment_intent_id: session.payment_intent as string,
                     amount_paid: session.amount_total || 0,
                     currency: session.currency || 'USD',
                     status: 'succeeded'
                 });
            }
        }
    }

    private async handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
        const orgId = stripeSub.metadata?.organizationId;
        if (!orgId) return;

        Logger.info(`[WebhookController] Sub Update Org ${orgId}. Status: ${stripeSub.status}`);

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

        const subData: any = {
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
        };

        if (fingerprint) {
            subData.card_fingerprint = fingerprint;
        }

        if (subscription) {
            await subscription.update(subData);
        } else {
            subscription = await Subscription.create({ organization_id: orgId, ...subData });
        }

        if (fingerprint && (status === SubStatus.TRIALING || status === SubStatus.ACTIVE)) {
            await this.checkAndEnforceTrialAbuse(subscription, stripeSub, finalPlanId || subscription.plan_id, fingerprint, stripeSub.metadata?.userId);
        }
    }

    private async checkAndEnforceTrialAbuse(subscription: Subscription, stripeSub: Stripe.Subscription, planId: string | null | undefined, fingerprint: string | null, actorId?: string) {
        if (fingerprint && (subscription.status === SubStatus.TRIALING || subscription.status === SubStatus.ACTIVE)) {
            try {
                // Check for duplicates
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
                    const toolPlans = await Plan.findAll({ where: { tool_id: toolId }, attributes: ['id'] });
                    const toolPlanIds = toolPlans.map(p => p.id);

                    // Check for OTHER subscriptions with same card for this tool (ANY STATUS)
                    const duplicateSub = await Subscription.findOne({
                        where: {
                            card_fingerprint: fingerprint,
                            plan_id: { [Op.in]: toolPlanIds },
                            id: { [Op.ne]: subscription?.id } // Exclude current
                        }
                    });

                    if (duplicateSub) {
                        Logger.warn(`[AbuseDetection] Duplicate card use detected! Fingerprint: ${fingerprint}. Existing Sub: ${duplicateSub.id}. Cancelling new Sub: ${subscription?.id}`);

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
                Logger.error(`[AbuseDetection] Error checking duplicate card:`, err);
            }
        }
    }

    private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
        Logger.info(`[WebhookController] Subscription deleted: ${stripeSub.id}`);
        const subscriptions = await Subscription.findAll({ where: { stripe_subscription_id: stripeSub.id } });
        if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
                await sub.update({ status: SubStatus.CANCELED });
            }
        }
    }

    private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
        Logger.info(`[WebhookController] Invoice payment failed: ${invoice.id}`);

        // Resolve subscription ID (handle different invoice structures)
        const inv = invoice as any;
        const subscriptionId = typeof inv.subscription === 'string'
            ? inv.subscription
            : inv.parent?.subscription_details?.subscription;

        if (subscriptionId) {
            const subscription = await Subscription.findOne({
                where: { stripe_subscription_id: subscriptionId }
            });

            if (subscription) {
                Logger.info(`[WebhookController] Marking subscription ${subscription.id} as past_due due to payment failure.`);
                await subscription.update({
                    status: SubStatus.PAST_DUE,
                    last_payment_failure_at: new Date()
                });
            } else {
                Logger.warn(`[WebhookController] Subscription not found for failed invoice: ${invoice.id}, Sub ID: ${subscriptionId}`);
            }
        } else {
            Logger.warn(`[WebhookController] No subscription ID found in invoice: ${invoice.id}`);
        }
    }

    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
        Logger.info(`[WebhookController] Invoice payment succeeded: ${invoice.id}`);

        // Resolve subscription ID (handle different invoice structures)
        const inv = invoice as any;
        const subscriptionId = typeof inv.subscription === 'string'
            ? inv.subscription
            : inv.parent?.subscription_details?.subscription;

        if (subscriptionId) {
            const subscription = await Subscription.findOne({
                where: { stripe_subscription_id: subscriptionId }
            });

            if (subscription) {
                Logger.info(`[WebhookController] Validating subscription ${subscription.id} status after payment success.`);
                
                await subscription.update({
                    status: SubStatus.ACTIVE,
                    last_payment_failure_at: null
                });
            }
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
                const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : (stripeSub.customer as Stripe.Customer).id;
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
             Logger.warn('[WebhookController] Failed to fetch fingerprint', e);
        }
        return null;
    }
}

export const webhookController = new WebhookController();
