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

  async resumeSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
    });
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

  // Helper to get client (for rare cases)
  getClient() {
    return this.stripe;
  }
}

export const stripeService = new StripeService();
