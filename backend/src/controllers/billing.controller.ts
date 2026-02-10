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
      const { items, ui_mode = 'hosted' } = req.body;
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

      // 3. Create Session based on UI Mode
      const sessionConfig: any = {
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: lineItems,
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
      };

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

        const subscriptions = await Subscription.findAll({
            where: { organization_id: organization.id },
            include: [
                { model: Plan, as: 'plan' },
                { model: Bundle, as: 'bundle' }
            ]
        });

        res.status(200).json({ subscriptions });
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

  // --- Webhook Handlers ---

  private async handleCheckoutSessionCompleted(session: any) {
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

  private async handleSubscriptionUpdated(stripeSub: any) {
     const orgId = stripeSub.metadata?.organizationId;
     
     const toDateNullable = (ts: any): Date | null => {
         if (typeof ts === 'number') {
             return new Date(ts * 1000);
         }
         if (ts) {
            console.warn(`[BillingController] Invalid timestamp received: ${ts} (${typeof ts})`);
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
        console.log(`[BillingController] Processing subscription update for Org ${orgId}. Status: ${stripeSub.status}`);
        
        let currentPeriodStart = stripeSub.current_period_start;
        let currentPeriodEnd = stripeSub.current_period_end;
        
        if (!currentPeriodStart && stripeSub.items?.data?.[0]?.current_period_start) {
             currentPeriodStart = stripeSub.items.data[0].current_period_start;
             currentPeriodEnd = stripeSub.items.data[0].current_period_end;
             console.log(`[BillingController] Using period from first subscription item: ${currentPeriodStart} - ${currentPeriodEnd}`);
        } else {
             console.log(`[BillingController] Period (Root): ${currentPeriodStart} - ${currentPeriodEnd}`);
        }

        const status = mapStripeStatus(stripeSub.status);
        
        // Resolve Plan or Bundle from Price ID
         // Iterate through all items in the subscription
         const items = stripeSub.items?.data || [];

         for (const item of items) {
             const priceId = item.price.id;
             let finalPlanId: string | null = null;
             let finalBundleId: string | null = null;
             let resolved = false;

             if (priceId) {
                 console.log(`[BillingController] Resolving item with Price ID: ${priceId}`);
                 // Find Plan
                 const plan = await Plan.findOne({ 
                     where: sequelize.or(
                         { stripe_price_id_monthly: priceId }, 
                         { stripe_price_id_yearly: priceId }
                     )
                 });
                 if (plan) {
                     console.log(`[BillingController] Found Plan: ${plan.name} (${plan.id})`);
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
                         console.log(`[BillingController] Found Bundle: ${bundle.name} (${bundle.id})`);
                         finalBundleId = bundle.id;
                         finalPlanId = null;
                         resolved = true;
                     }
                 }
                 
                 if (!resolved) {
                     console.log(`[BillingController] Could not resolve Plan or Bundle for Price ID: ${priceId}`);
                 }
             }

             if (resolved) {
                 // Find existing subscription for this specific item (plan/bundle)
                 // constraint: org + stripe_sub + plan/bundle
                 // eslint-disable-next-line @typescript-eslint/no-explicit-any
                 const whereClause: any = { 
                     stripe_subscription_id: stripeSub.id,
                     organization_id: orgId
                 };

                 if (finalPlanId) whereClause.plan_id = finalPlanId;
                 if (finalBundleId) whereClause.bundle_id = finalBundleId;

                 const subscription = await Subscription.findOne({ where: whereClause });
                 
                 const subscriptionData = {
                    stripe_subscription_id: stripeSub.id,
                    status: status,
                    current_period_start: toDateNullable(currentPeriodStart ?? item.current_period_start),
                    current_period_end: toDateNullable(currentPeriodEnd ?? item.current_period_end),
                    trial_start: toDateNullable(stripeSub.trial_start),
                    trial_end: toDateNullable(stripeSub.trial_end),
                    cancel_at_period_end: stripeSub.cancel_at_period_end,
                };

                 if (subscription) {
                     console.log(`[BillingController] Updating existing subscription: ${subscription.id}`);
                     await subscription.update(subscriptionData);
                 } else {
                     console.log(`[BillingController] Creating new subscription for Org ${orgId}`);
                     await Subscription.create({
                         organization_id: orgId,
                         ...subscriptionData,
                         plan_id: finalPlanId,
                         bundle_id: finalBundleId
                     });
                 }
             }
         }
     }
  }

  private async handleSubscriptionDeleted(stripeSub: any) {
    console.log('Subscription deleted', stripeSub.id);
      const subscriptions = await Subscription.findAll({ where: { stripe_subscription_id: stripeSub.id }});
      if (subscriptions && subscriptions.length > 0) {
          for (const sub of subscriptions) {
              await sub.update({ status: SubStatus.CANCELED });
          }
      }
  }

  private async handleInvoicePaymentFailed(invoice: any) {
     console.log('Invoice payment failed', invoice.id);
     
     // Resolve subscription ID (handle different invoice structures)
     const subscriptionId = typeof invoice.subscription === 'string' 
        ? invoice.subscription 
        : invoice.parent?.subscription_details?.subscription;

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

  private async handleInvoicePaymentSucceeded(invoice: any) {
    console.log('Invoice payment succeeded', invoice.id);
    
    // Resolve subscription ID (handle different invoice structures)
    const subscriptionId = typeof invoice.subscription === 'string' 
       ? invoice.subscription 
       : invoice.parent?.subscription_details?.subscription;

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
}

export const billingController = new BillingController();
