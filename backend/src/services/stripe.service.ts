import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

export class StripeService {
  private stripe: Stripe;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables. Stripe service cannot start.');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      typescript: true,
      maxNetworkRetries: 3,
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

  async updateSubscription(subscriptionId: string, priceId: string, metadata?: Record<string, string>, endTrialNow?: boolean) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

    if (!subscription.items.data || subscription.items.data.length === 0) {
      throw new Error(`Subscription ${subscriptionId} has no items. Cannot update.`);
    }

    const itemId = subscription.items.data[0].id;

    const updateConfig: Stripe.SubscriptionUpdateParams = {
      proration_behavior: 'always_invoice',
      items: [{
        id: itemId,
        price: priceId,
      }],
      metadata: metadata || undefined,
    };

    if (endTrialNow) {
      updateConfig.trial_end = 'now';
    }

    return this.stripe.subscriptions.update(subscriptionId, updateConfig);
  }

  async scheduleDowngrade(subscriptionId: string, newPriceId: string) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;

    // If a schedule already exists (e.g. previous downgrade), release it so we
    // start from a clean slate. `release` detaches the schedule without cancelling
    // the subscription.
    const existingScheduleId = subscription.schedule;
    if (existingScheduleId && typeof existingScheduleId === 'string') {
      try {
        await this.stripe.subscriptionSchedules.release(existingScheduleId);
      } catch (err) {
        // If it's already released/cancelled, ignore.
      }
    }

    // Create a fresh schedule anchored to the live subscription. The returned
    // schedule has exactly one phase: the current in-progress one, with the
    // canonical `start_date` Stripe will accept back verbatim.
    const schedule = await this.stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    const currentPhase = schedule.phases[0];

    // Append the downgrade phase. The future phase intentionally omits
    // `start_date` — Stripe defaults it to the previous phase's `end_date`, which
    // is exactly what we want and avoids any timestamp drift.
    return this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items: currentPhase.items.map((item) => ({
            price: typeof item.price === 'string' ? item.price : item.price.id,
            quantity: item.quantity,
          })),
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    });
  }

  async cancelScheduledDowngrade(subscriptionId: string) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
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

  async archivePrice(priceId: string) {
    return this.stripe.prices.update(priceId, {
      active: false,
    });
  }

  // One-time price (for credit packs and a-la-carte credits)
  async createOneTimePrice(productId: string, unitAmount: number, currency: string) {
    return this.stripe.prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency,
      // No `recurring` block = one-time price
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

  // Grace Period Configuration
  async updateGracePeriod(days: number) {
    // Note: Stripe's API does not support updating "Smart Retries" or specific "Retry Rules" (grace period) 
    // for standard accounts programmatically via the SDK easily. 
    // This is often a Dashboard setting. created here for future extensibility or if using custom subscription schedules.
    console.log(`[StripeService] Requested update for grace period to ${days} days.`);

    // Potentially we could update a metadata field on the account to track this sync
    // return this.stripe.accounts.update(process.env.STRIPE_ACCOUNT_ID, { metadata: { grace_period_days: days.toString() } });
    return Promise.resolve(true);
  }

  // Helper to get client (for rare cases)
  getClient() {
    return this.stripe;
  }
}

export const stripeService = new StripeService();
