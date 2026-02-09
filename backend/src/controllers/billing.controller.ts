import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe.service';
import { Organization } from '../models/organization';
import { Plan } from '../models/plan';
import { Bundle } from '../models/bundle';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import { User } from '../models/user';
import sequelize from '../config/db';

class BillingController {
  async createCheckoutSession(req: Request, res: Response, next: NextFunction) {
    try {
      // items: { id: string, type: 'plan' | 'bundle', interval: 'monthly' | 'yearly' }[]
      const { items } = req.body;
      const organization = req.organization;
      const user = req.user;

      if (!organization) {
         res.status(404).json({ message: 'Organization not found' });
         return;
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
          res.status(400).json({ message: 'No items provided' });
          return;
      }
      
      // Validate intervals (must be same for single subscription checkout)
      const firstInterval = items[0].interval;
      if (items.some((item: any) => item.interval !== firstInterval)) {
          res.status(400).json({ message: 'All items must have the same billing interval' });
          return;
      }

      // 1. Get or Create Stripe Customer
      let customerId = organization.stripe_customer_id;
      if (!customerId) {
        const customer = await stripeService.createCustomer(organization.billing_email || user?.email || '', organization.name, {
            orgId: organization.id
        });
        customerId = customer.id;
        await organization.update({ stripe_customer_id: customerId });
      }

      // 2. Resolve Price IDs
      const lineItems = [];
      const metadataItems: any[] = [];

      for (const item of items) {
          let priceId: string | undefined;
          let name: string = '';

          if (item.type === 'plan') {
            const plan = await Plan.findByPk(item.id);
            if (!plan) continue;
            priceId = item.interval === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
            name = plan.name;
          } else if (item.type === 'bundle') {
            const bundle = await Bundle.findByPk(item.id);
            if (!bundle) continue;
            priceId = item.interval === 'yearly' ? bundle.stripe_price_id_yearly : bundle.stripe_price_id_monthly;
            name = bundle.name;
          }

          if (priceId) {
             lineItems.push({
                 price: priceId,
                 quantity: 1
             });
             metadataItems.push({ id: item.id, type: item.type });
          }
      }

      if (lineItems.length === 0) {
         res.status(400).json({ message: 'No valid price IDs found for selected items' });
         return;
      }

      // 3. Create Session
      const session = await stripeService.createCheckoutSession({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: lineItems,
        success_url: `${process.env.FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/billing?canceled=true`,
        metadata: {
          organizationId: organization.id,
          items: JSON.stringify(metadataItems),
          interval: firstInterval
        },
        subscription_data: {
          metadata: {
             organizationId: organization.id
          }
        }
      });

      res.status(200).json({ url: session.url, sessionId: session.id });
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

        const subscription = await Subscription.findOne({
            where: { organization_id: organization.id },
            include: [
                { model: Plan, as: 'plan' },
                { model: Bundle, as: 'bundle' }
            ]
        });

        if (!subscription) {
            res.status(200).json({ subscription: null });
            return;
        }

        res.status(200).json({ subscription });
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
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
       res.status(400).send(`Webhook Error: ${err.message}`);
       return;
    }

    // Handle event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'customer.subscription.updated':
        case 'customer.subscription.created':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
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

  // --- Webhook Handlers ---

  private async handleCheckoutSessionCompleted(session: any) {
    const orgId = session.metadata?.organizationId;
    if (orgId && session.subscription) {
       console.log(`Checkout completed for Org ${orgId}, Sub ${session.subscription}`);
    }
  }

  private async handleSubscriptionUpdated(stripeSub: any) {
     const orgId = stripeSub.metadata?.organizationId;
     
     const toDateNullable = (ts: any): Date | null => {
         if (typeof ts === 'number') {
             return new Date(ts * 1000);
         }
         return null;
     }

     // Helper to map status
     const mapStripeStatus = (status: string): SubStatus => {
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
     
     if (orgId) {
        const status = mapStripeStatus(stripeSub.status);
        
        // Resolve Plan or Bundle from Price ID
        const priceId = stripeSub.items?.data?.[0]?.price?.id;
        let finalPlanId: string | null = null;
        let finalBundleId: string | null = null;
        let resolved = false;

        if (priceId) {
            // Find Plan
            const plan = await Plan.findOne({ 
                where: sequelize.or(
                    { stripe_price_id_monthly: priceId }, 
                    { stripe_price_id_yearly: priceId }
                )
            });
            if (plan) {
                finalPlanId = plan.id;
                finalBundleId = null;
                resolved = true;
            }

            // Find Bundle (if not plan)
            if (!resolved) {
                const bundle = await Bundle.findOne({
                    where: sequelize.or(
                        { stripe_price_id_monthly: priceId }, 
                        { stripe_price_id_yearly: priceId }
                    )
                });
                if (bundle) {
                    finalBundleId = bundle.id;
                    finalPlanId = null;
                    resolved = true;
                }
            }
        }

        // Find existing subscription or create
        const subscription = await Subscription.findOne({ where: { stripe_subscription_id: stripeSub.id }}) 
                             || await Subscription.findOne({ where: { organization_id: orgId }});

        const subscriptionData = {
            stripe_subscription_id: stripeSub.id,
            status: status,
            current_period_start: toDateNullable(stripeSub.current_period_start),
            current_period_end: toDateNullable(stripeSub.current_period_end),
            trial_start: toDateNullable(stripeSub.trial_start),
            trial_end: toDateNullable(stripeSub.trial_end),
            cancel_at_period_end: stripeSub.cancel_at_period_end,
        };

        if (subscription) {
            const updateData: any = { ...subscriptionData };
            
            // Only update IDs if we resolve a new price
            if (resolved) {
                updateData.plan_id = finalPlanId;
                updateData.bundle_id = finalBundleId;
            }

            await subscription.update(updateData);
        } else {
             // Create new
             await Subscription.create({
                 organization_id: orgId,
                 ...subscriptionData,
                 plan_id: finalPlanId,
                 bundle_id: finalBundleId
             });
        }
     }
  }

  private async handleSubscriptionDeleted(stripeSub: any) {
      const subscription = await Subscription.findOne({ where: { stripe_subscription_id: stripeSub.id }});
      if (subscription) {
          await subscription.update({ status: SubStatus.CANCELED });
      }
  }

  private async handleInvoicePaymentFailed(invoice: any) {
    // Notify user, update status to past_due usually happens in subscription.updated
     console.log('Invoice payment failed', invoice.id);
  }
}

export const billingController = new BillingController();
