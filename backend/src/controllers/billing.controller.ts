import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/stripe.service';
import { Organization } from '../models/organization';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import { User } from '../models/user';
import sequelize from '../config/db';
import { Op } from 'sequelize';

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

      let trialPeriodDays = 0;
      let hasPaidComponent = false;

      for (const item of items) {
          let priceId: string | undefined;

          if (item.type === 'plan') {
            const plan = await Plan.findByPk(item.id, { include: [{ model: Tool, as: 'tool' }] });
            if (!plan) continue;
            priceId = item.interval === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
            if (plan.price > 0) hasPaidComponent = true;

            if (plan.tool?.trial_days && plan.tool.trial_days > 0 && trialPeriodDays === 0) {
                 trialPeriodDays = plan.tool.trial_days;
            }
          } else if (item.type === 'bundle') {
            const bundle = await Bundle.findByPk(item.id);
            if (!bundle) continue;
            priceId = item.interval === 'yearly' ? bundle.stripe_price_id_yearly : bundle.stripe_price_id_monthly;
            if (bundle.price > 0) hasPaidComponent = true;
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

      if (trialPeriodDays > 0) {
          sessionConfig.subscription_data.trial_period_days = trialPeriodDays;
          
          // Only auto-cancel if it's a free trial (no paid component)
          // Paid plans with trial should continue to active status after trial
          if (!hasPaidComponent) {
            sessionConfig.subscription_data.metadata = {
                ...sessionConfig.subscription_data.metadata,
                auto_cancel_trial: 'true'
            };
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
        let stripePaymentMethodsMap: Record<string, any> = {};
        let defaultPaymentMethod: any = null;

        if (organization.stripe_customer_id) {
            try {
                const [customer, stripeSubs] = await Promise.all([
                    stripeService.getCustomer(organization.stripe_customer_id),
                    stripeService.getCustomerSubscriptions(organization.stripe_customer_id)
                ]);

                // Get Default Customer PM
                if ((customer as any).invoice_settings?.default_payment_method) {
                    const pmId = (customer as any).invoice_settings.default_payment_method;
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
            let paymentMethod = null;

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
                paymentMethodDetails: paymentMethod ? {
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
          // Check for auto-cancel metadata
          const sub = event.data.object as any;
          if (sub.metadata?.auto_cancel_trial === 'true' && !sub.cancel_at_period_end && sub.status === 'trialing') {
              console.log(`[BillingController] Auto-cancelling trial subscription ${sub.id} at period end.`);
              await stripeService.cancelSubscriptionAtPeriodEnd(sub.id);
          }
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

  // Sync Subscription Status manually
  async syncSubscription(req: Request, res: Response, next: NextFunction) {
      try {
          const organization = req.organization;
          if (!organization || !organization.stripe_customer_id) {
             res.status(400).json({ message: 'Organization is not linked to Stripe' });
             return;
          }

          console.log(`[BillingController] Manual Sync for Org ${organization.id}`);

          // Fetch all subscriptions from Stripe
          const stripeSubs = await stripeService.getCustomerSubscriptions(organization.stripe_customer_id);
          
          // Map helper
           const toDateNullable = (ts: any): Date | null => {
              return ts ? new Date(ts * 1000) : null;
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

          let updatedCount = 0;

          // Loop through stripe subscriptions and update local ones
          for (const stripeSub of stripeSubs.data as any[]) {
               const localSub = await Subscription.findOne({
                   where: { 
                       stripe_subscription_id: stripeSub.id,
                       organization_id: organization.id
                   }
               });

               if (localSub) {
                   const status = mapStripeStatus(stripeSub.status);
                   const isPaymentFailed = status === SubStatus.PAST_DUE || status === SubStatus.UNPAID;

                   // Date Fallback Logic (Same as Webhook)
                   let currentPeriodStart = stripeSub.current_period_start;
                   let currentPeriodEnd = stripeSub.current_period_end;
                   
                   if (!currentPeriodStart && stripeSub.items?.data?.[0]?.current_period_start) {
                        currentPeriodStart = stripeSub.items.data[0].current_period_start;
                        currentPeriodEnd = stripeSub.items.data[0].current_period_end;
                   }

                   await localSub.update({
                       status: status,
                       current_period_start: toDateNullable(currentPeriodStart),
                       current_period_end: toDateNullable(currentPeriodEnd),
                       cancel_at_period_end: stripeSub.cancel_at_period_end,
                       // Clear failure date if active or canceled (resolved)
                       last_payment_failure_at: isPaymentFailed ? localSub.last_payment_failure_at : null
                   });
                   updatedCount++;
               }
          }

          res.status(200).json({ message: 'Sync complete', updated: updatedCount });

      } catch (error) {
          next(error);
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
                 // Find existing subscription by stripe_subscription_id only
                 // This ensures upgrades/downgrades update the existing record, not create duplicates
                 const subscription = await Subscription.findOne({ 
                     where: { 
                         stripe_subscription_id: stripeSub.id,
                         organization_id: orgId
                     }
                 });
                 
                 const subscriptionData = {
                    stripe_subscription_id: stripeSub.id,
                    plan_id: finalPlanId,
                    bundle_id: finalBundleId,
                    status: status,
                    current_period_start: toDateNullable(currentPeriodStart ?? item.current_period_start),
                    current_period_end: toDateNullable(currentPeriodEnd ?? item.current_period_end),
                    trial_start: toDateNullable(stripeSub.trial_start),
                    trial_end: toDateNullable(stripeSub.trial_end),
                    cancel_at_period_end: stripeSub.cancel_at_period_end,
                    // Clear upcoming fields since the webhook reflects the actual current state
                    upcoming_plan_id: null,
                    upcoming_bundle_id: null,
                };

                 if (subscription) {
                     console.log(`[BillingController] Updating existing subscription: ${subscription.id}`);
                     await subscription.update(subscriptionData);
                 } else {
                     console.log(`[BillingController] Creating new subscription for Org ${orgId}`);
                     await Subscription.create({
                         organization_id: orgId,
                         ...subscriptionData,
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

      if (!organization) {
        res.status(404).json({ message: 'Organization not found' });
        return;
      }

      if (!tool_id) {
        res.status(400).json({ message: 'tool_id is required' });
        return;
      }

      // 1. Find the trial plan for this tool
      const trialPlan = await Plan.findOne({
        where: { tool_id, is_trial_plan: true, active: true },
        include: [{ model: Tool, as: 'tool' }]
      });

      if (!trialPlan || !trialPlan.tool || trialPlan.tool.trial_days <= 0) {
        res.status(400).json({ message: 'No free trial available for this tool' });
        return;
      }

      const tool = trialPlan.tool;

      // 2. Check eligibility — has org ever subscribed to any plan for this tool?
      const existingSub = await Subscription.findOne({
        where: {
          organization_id: organization.id,
        },
        include: [{
          model: Plan,
          as: 'plan',
          where: { tool_id },
          required: true
        }]
      });

      if (existingSub) {
        res.status(400).json({ message: 'Your organization has already used or has an active subscription for this tool. Free trial is not available.' });
        return;
      }

      // const tool = trialPlan.tool!; // Removed duplicate declaration
      const trialDays = tool.trial_days;
      const now = new Date();
      const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

      // 3. Card required? → Create Stripe trial subscription
      if (tool?.trial_card_required) {
        // Ensure customer exists
        let customerId = organization.stripe_customer_id;
        if (!customerId) {
          const customer = await stripeService.createCustomer(
            organization.billing_email || req.user?.email || '',
            organization.name,
            { orgId: organization.id }
          );
          customerId = customer.id;
          await organization.update({ stripe_customer_id: customerId });
        }

        const priceId = trialPlan.stripe_price_id_monthly || trialPlan.stripe_price_id_yearly;
        if (!priceId) {
          res.status(500).json({ message: 'Trial plan has no Stripe price configured' });
          return;
        }

        const stripeSub = await stripeService.createTrialSubscription(
          customerId,
          priceId,
          trialDays,
          { org_id: organization.id, plan_id: trialPlan.id, tool_id }
        );

        // Create local subscription record
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
      } else {
        // 4. No card required → Local-only trial
        const subscription = await Subscription.create({
          organization_id: organization.id,
          plan_id: trialPlan.id,
          stripe_subscription_id: null,
          status: SubStatus.TRIALING,
          trial_start: now,
          trial_end: trialEnd,
          current_period_start: now,
          current_period_end: trialEnd,
          cancel_at_period_end: false,
        });

        res.status(201).json(subscription);
      }
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

      if (!organization) {
        res.status(404).json({ message: 'Organization not found' });
        return;
      }

      if (!tool_id) {
        res.status(400).json({ message: 'tool_id query param is required' });
        return;
      }

      // Check if tool has a trial plan
      const trialPlan = await Plan.findOne({
        where: { tool_id: tool_id as string, is_trial_plan: true, active: true },
        include: [{ model: Tool, as: 'tool' }]
      });

      if (!trialPlan || !trialPlan.tool || trialPlan.tool.trial_days <= 0) {
        res.status(200).json({ eligible: false, reason: 'No free trial available for this tool', trialDays: 0 });
        return;
      }

      console.log(`[TrialCheck] Checking for Org: ${organization.id}, Tool: ${tool_id}`);
      
      // 1. Get all plan IDs for this tool (including deleted ones)
      const allToolPlans = await Plan.findAll({
          where: { tool_id: tool_id as string },
          attributes: ['id'],
          paranoid: false
      });
      
      const planIds = allToolPlans.map(p => p.id);
      console.log(`[TrialCheck] Found ${planIds.length} plans for tool:`, planIds);

      // 2. Check if org has any subscription matching these plan IDs
      const existingSub = await Subscription.findOne({
        where: {
          organization_id: organization.id,
          plan_id: { [Op.in]: planIds }
        },
        paranoid: false
      });

      console.log(`[TrialCheck] Existing Sub found: ${existingSub ? existingSub.id : 'None'}`);

      if (existingSub) {
        res.status(200).json({ eligible: false, reason: 'Trial already used for this tool', trialDays: trialPlan.tool!.trial_days });
        return;
      }

      res.status(200).json({ eligible: true, trialDays: trialPlan.tool!.trial_days });
    } catch (error) {
      next(error);
    }
  }
}

export const billingController = new BillingController();

