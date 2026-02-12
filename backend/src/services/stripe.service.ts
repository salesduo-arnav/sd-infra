import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

export class StripeService {
  private stripe: Stripe;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('STRIPE_SECRET_KEY is not defined in environment variables.');
    }
    
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      typescript: true,
    });
  }

  // Customer Management
  async createCustomer(email: string, name: string, metadata?: Record<string, string>) {
    return this.stripe.customers.create({
      email,
      name,
      metadata,
    });
  }

  async getCustomer(customerId: string) {
    return this.stripe.customers.retrieve(customerId);
  }

  // Checkout Session
  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
    return this.stripe.checkout.sessions.create(params);
  }

  // Portal Session
  async createPortalSession(customerId: string, returnUrl: string) {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // Subscription Management
  async getSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async cancelSubscriptionImmediately(subscriptionId: string) {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  async cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async resumeSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
    });
  }

  async updateSubscription(subscriptionId: string, priceId: string) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const itemId = subscription.items.data[0].id;

      return this.stripe.subscriptions.update(subscriptionId, {
          proration_behavior: 'always_invoice',
          items: [{
              id: itemId,
              price: priceId,
          }],
      });
  }

  async scheduleDowngrade(subscriptionId: string, newPriceId: string) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as any;
      
      let scheduleId = subscription.schedule;

      // If no schedule exists, create one from the subscription
      if (!scheduleId || typeof scheduleId !== 'string') {
          const newSchedule = await this.stripe.subscriptionSchedules.create({
              from_subscription: subscriptionId,
          });
          scheduleId = newSchedule.id;
      }

      // Retrieve the schedule to get the auto-populated current phase
      const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId) as any;
      const currentPhase = schedule.phases[schedule.phases.length - 1];

      // Build phases: keep the current phase as-is, add the downgrade phase after it
      return this.stripe.subscriptionSchedules.update(scheduleId, {
          end_behavior: 'release',
          phases: [
              {
                  items: currentPhase.items.map((item: any) => ({
                      price: typeof item.price === 'string' ? item.price : item.price.id || item.price,
                      quantity: item.quantity,
                  })),
                  start_date: currentPhase.start_date,
                  end_date: currentPhase.end_date,
              },
              {
                  items: [{ price: newPriceId, quantity: 1 }],
                  start_date: currentPhase.end_date,
              }
          ],
      });
  }

  async cancelScheduledDowngrade(subscriptionId: string) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as any;
      const scheduleId = subscription.schedule;

      if (!scheduleId || typeof scheduleId !== 'string') {
          throw new Error('No subscription schedule found to cancel');
      }

      // Release the schedule — subscription continues with current plan
      return this.stripe.subscriptionSchedules.release(scheduleId);
  }

  async getCustomerSubscriptions(customerId: string) {
      return this.stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          expand: ['data.default_payment_method'],
      });
  }

  // Invoices
  async getInvoices(customerId: string, limit: number = 10) {
      return this.stripe.invoices.list({
          customer: customerId,
          limit: limit,
      });
  }

  // Payment Methods
  async getPaymentMethods(customerId: string) {
      return this.stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
      });
  }

  // Webhook Construction
  constructEvent(payload: string | Buffer, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  // Product & Price Management
  async createProduct(name: string, description?: string) {
    return this.stripe.products.create({
      name,
      description,
    });
  }

  async updateProduct(productId: string, name: string, description?: string) {
    return this.stripe.products.update(productId, {
      name,
      description,
    });
  }

  async createPrice(productId: string, amount: number, currency: string, interval: 'month' | 'year') {
    return this.stripe.prices.create({
      product: productId,
      unit_amount: amount, // Amount in cents
      currency,
      recurring: {
        interval,
      },
    });
  }

  // Trial Subscription
  async createTrialSubscription(customerId: string, priceId: string, trialDays: number, metadata?: Record<string, string>) {
    return this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: metadata || {},
    });
  }

  // Helper to get client (for rare cases)
  getClient() {
    return this.stripe;
  }
}

export const stripeService = new StripeService();
