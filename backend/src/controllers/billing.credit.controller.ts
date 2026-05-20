import { Request, Response } from 'express';
import { CreditPack } from '../models/credit_pack';
import { Tool } from '../models/tool';
import { ToolCreditConfig } from '../models/tool_credit_config';
import { stripeService } from '../services/stripe.service';
import { creditService, CreditServiceError } from '../services/credit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

/**
 * User-facing credit/billing endpoints. Mounted under `/billing/credits`.
 * Authenticated via the standard auth + organization middlewares.
 */

class BillingCreditController {
  // GET /billing/credits — combined view for the Plans page (wallets + feature_access)
  async getMyCredits(req: Request, res: Response) {
    try {
      const org = req.organization;
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const wallets = await creditService.getWallets(org.id);
      res.json({
        organization_id: org.id,
        wallets: wallets.map((w) => ({
          wallet_id: w.id,
          organization_id: w.organization_id,
          tool_id: w.tool_id,
          tool_slug: w.tool?.slug,
          tool_name: w.tool?.name,
          plan_balance: w.plan_balance,
          purchased_balance: w.purchased_balance,
          plan_held: 0,
          purchased_held: 0,
          plan_available: w.plan_balance,
          purchased_available: w.purchased_balance,
          total_available: w.plan_balance + w.purchased_balance,
          plan_period_end: w.next_reset_at,
        })),
        feature_access: [],
      });
    } catch (error) {
      handleError(res, error, 'Billing: Get My Credits Error');
    }
  }

  // GET /billing/credit-packs[?tool_slug=…] — all active packs across all tools
  async listAllPacks(req: Request, res: Response) {
    try {
      const { tool_slug } = req.query as { tool_slug?: string };
      const where: Record<string, unknown> = { active: true };
      if (tool_slug) {
        const tool = await Tool.findOne({ where: { slug: tool_slug } });
        if (!tool) return res.json({ creditPacks: [] });
        where.tool_id = tool.id;
      }
      const packs = await CreditPack.findAll({
        where,
        include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
        order: [['credits', 'ASC']],
      });
      res.json({
        creditPacks: packs.map((p) => ({
          id: p.id,
          tool_id: p.tool_id,
          name: p.name,
          slug: p.name, // public slug = name for now
          credit_amount: p.credits,
          price: p.price,
          currency: p.currency,
          description: null,
          tool: p.tool
            ? { id: p.tool.id, name: p.tool.name, slug: p.tool.slug }
            : undefined,
        })),
      });
    } catch (error) {
      handleError(res, error, 'Billing: List All Credit Packs Error');
    }
  }

  // GET /billing/credits/price-per-credit?tool_slug=…
  async getPricePerCredit(req: Request, res: Response) {
    try {
      const { tool_slug } = req.query as { tool_slug?: string };
      if (!tool_slug) return res.status(400).json({ message: 'tool_slug is required' });
      const tool = await Tool.findOne({ where: { slug: tool_slug } });
      if (!tool) return res.status(404).json({ message: 'Tool not found' });
      const config = await ToolCreditConfig.findByPk(tool.id);
      const enabled = !!config?.alacarte_enabled;
      res.json({
        tool_id: tool.id,
        tool_slug: tool.slug,
        tool_name: tool.name,
        price_per_credit_cents: enabled ? config?.price_per_credit ?? null : null,
        min: config?.min_credits ?? 1,
        max: config?.max_credits ?? 10000,
        currency: config?.currency ?? 'usd',
      });
    } catch (error) {
      handleError(res, error, 'Billing: Get Price Per Credit Error');
    }
  }

  // GET /billing/credits/wallets — list all credit wallets for the current org
  async getWallets(req: Request, res: Response) {
    try {
      const org = req.organization;
      if (!org) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      const wallets = await creditService.getWallets(org.id);
      res.json(
        wallets.map((w) => ({
          wallet_id: w.id,
          tool_id: w.tool_id,
          tool_slug: w.tool?.slug,
          tool_name: w.tool?.name,
          plan_balance: w.plan_balance,
          purchased_balance: w.purchased_balance,
          reserved_amount: w.reserved_amount,
          plan_available: w.plan_balance,
          purchased_available: w.purchased_balance,
          plan_held: 0,
          purchased_held: 0,
          total_available: w.plan_balance + w.purchased_balance,
          plan_period_end: w.next_reset_at,
        })),
      );
    } catch (error) {
      handleError(res, error, 'Billing: Get Credit Wallets Error');
    }
  }

  // GET /billing/credits/wallets/:toolSlug — single wallet
  async getWalletByTool(req: Request, res: Response) {
    try {
      const org = req.organization;
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { toolSlug } = req.params;
      const wallet = await creditService.getWallet(org.id, toolSlug);
      if (!wallet) {
        return res.json({
          tool_slug: toolSlug,
          plan_balance: 0,
          purchased_balance: 0,
          reserved_amount: 0,
          plan_available: 0,
          purchased_available: 0,
          total_available: 0,
          plan_period_end: null,
        });
      }
      res.json({
        wallet_id: wallet.id,
        tool_id: wallet.tool_id,
        tool_slug: wallet.tool?.slug,
        tool_name: wallet.tool?.name,
        plan_balance: wallet.plan_balance,
        purchased_balance: wallet.purchased_balance,
        reserved_amount: wallet.reserved_amount,
        plan_available: wallet.plan_balance,
        purchased_available: wallet.purchased_balance,
        total_available: wallet.plan_balance + wallet.purchased_balance,
        plan_period_end: wallet.next_reset_at,
      });
    } catch (error) {
      if (error instanceof CreditServiceError && error.code === 'tool_not_found') {
        return res.status(404).json({ message: error.message });
      }
      handleError(res, error, 'Billing: Get Credit Wallet Error');
    }
  }

  // GET /billing/credits/tools/:toolSlug/packs — active credit packs for a tool
  async listPacks(req: Request, res: Response) {
    try {
      const { toolSlug } = req.params;
      const tool = await Tool.findOne({ where: { slug: toolSlug } });
      if (!tool) return res.status(404).json({ message: 'Tool not found' });

      const packs = await CreditPack.findAll({
        where: { tool_id: tool.id, active: true },
        order: [['credits', 'ASC']],
      });
      res.json(
        packs.map((p) => ({
          id: p.id,
          name: p.name,
          credits: p.credits,
          price: p.price,
          currency: p.currency,
          unit_price: p.credits > 0 ? p.price / p.credits : 0,
        })),
      );
    } catch (error) {
      handleError(res, error, 'Billing: List Credit Packs Error');
    }
  }

  // GET /billing/credits/tools/:toolSlug/alacarte — a-la-carte config
  async getAlacarteConfig(req: Request, res: Response) {
    try {
      const { toolSlug } = req.params;
      const tool = await Tool.findOne({ where: { slug: toolSlug } });
      if (!tool) return res.status(404).json({ message: 'Tool not found' });
      const config = await ToolCreditConfig.findByPk(tool.id);
      if (!config || !config.alacarte_enabled) {
        return res.json({ enabled: false });
      }
      res.json({
        enabled: true,
        price_per_credit: config.price_per_credit,
        currency: config.currency,
        min_credits: config.min_credits,
        max_credits: config.max_credits,
      });
    } catch (error) {
      handleError(res, error, 'Billing: Get A-la-carte Config Error');
    }
  }

  // POST /billing/credits/credit-packs/:packId/checkout
  async checkoutPack(req: Request, res: Response) {
    try {
      const org = req.organization;
      const user = req.user;
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { packId } = req.params;
      const { success_url, cancel_url } = req.body ?? {};

      const pack = await CreditPack.findByPk(packId);
      if (!pack || !pack.active) {
        return res.status(404).json({ message: 'Credit pack not found' });
      }
      if (!pack.stripe_price_id) {
        return res.status(409).json({ message: 'Credit pack is not provisioned in Stripe yet' });
      }

      // Get/Create Stripe customer
      let customerId = org.stripe_customer_id;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          org.billing_email || user?.email || '',
          org.name,
          { orgId: org.id },
        );
        customerId = customer.id;
        await org.update({ stripe_customer_id: customerId });
      }

      const baseUrl = process.env.APP_URL || 'http://app.lvh.me';
      const session = await stripeService.createCheckoutSession({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
        success_url: success_url || `${baseUrl}/billing?credits=success`,
        cancel_url: cancel_url || `${baseUrl}/billing?credits=cancelled`,
        metadata: {
          purpose: 'credit_pack',
          credit_pack_id: pack.id,
          tool_id: pack.tool_id,
          org_id: org.id,
          credits: String(pack.credits),
          organizationId: org.id, // legacy meta key for parity
        },
      });

      Logger.info(`[Billing] Credit pack checkout created for org=${org.id} pack=${pack.id} session=${session.id}`);
      res.json({ url: session.url, session_id: session.id });
    } catch (error) {
      handleError(res, error, 'Billing: Checkout Credit Pack Error');
    }
  }

  // POST /billing/credits/tools/:toolSlug/alacarte/checkout
  async checkoutAlacarte(req: Request, res: Response) {
    try {
      const org = req.organization;
      const user = req.user;
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { toolSlug } = req.params;
      const credits = Number(req.body?.credits);
      const { success_url, cancel_url } = req.body ?? {};

      const tool = await Tool.findOne({ where: { slug: toolSlug } });
      if (!tool) return res.status(404).json({ message: 'Tool not found' });

      const config = await ToolCreditConfig.findByPk(tool.id);
      if (!config || !config.alacarte_enabled || !config.price_per_credit || !config.alacarte_stripe_price_id) {
        return res.status(409).json({ message: 'A-la-carte credits are not enabled for this tool' });
      }
      if (!Number.isInteger(credits) || credits <= 0) {
        return res.status(400).json({ message: 'credits must be a positive integer' });
      }
      if (credits < config.min_credits) {
        return res.status(400).json({ message: `Minimum purchase is ${config.min_credits} credits` });
      }
      if (config.max_credits && credits > config.max_credits) {
        return res.status(400).json({ message: `Maximum purchase is ${config.max_credits} credits` });
      }

      let customerId = org.stripe_customer_id;
      if (!customerId) {
        const customer = await stripeService.createCustomer(
          org.billing_email || user?.email || '',
          org.name,
          { orgId: org.id },
        );
        customerId = customer.id;
        await org.update({ stripe_customer_id: customerId });
      }

      const baseUrl = process.env.APP_URL || 'http://app.lvh.me';
      const session = await stripeService.createCheckoutSession({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: config.alacarte_stripe_price_id, quantity: credits }],
        success_url: success_url || `${baseUrl}/billing?credits=success`,
        cancel_url: cancel_url || `${baseUrl}/billing?credits=cancelled`,
        metadata: {
          purpose: 'alacarte_credits',
          tool_id: tool.id,
          org_id: org.id,
          credits: String(credits),
          organizationId: org.id,
        },
      });

      Logger.info(`[Billing] A-la-carte credit checkout created for org=${org.id} tool=${tool.slug} credits=${credits} session=${session.id}`);
      res.json({ url: session.url, session_id: session.id });
    } catch (error) {
      handleError(res, error, 'Billing: Checkout A-la-carte Error');
    }
  }

  // GET /billing/credits/tools/:toolSlug/ledger
  async getLedger(req: Request, res: Response) {
    try {
      const org = req.organization;
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { toolSlug } = req.params;
      const cursor = req.query.cursor ? Number(req.query.cursor) : null;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const result = await creditService.getLedger({
        orgId: org.id,
        toolSlugOrId: toolSlug,
        cursor,
        limit,
      });
      res.json({
        entries: result.entries.map((e) => ({
          id: e.id.toString(),
          entry_type: e.entry_type,
          bucket: e.bucket,
          amount: e.amount,
          balance_after_plan: e.balance_after_plan,
          balance_after_purchased: e.balance_after_purchased,
          source: e.source,
          operation_slug: e.operation_slug,
          reason: e.reason,
          created_at: e.created_at,
        })),
        next_cursor: result.next_cursor ? result.next_cursor.toString() : null,
      });
    } catch (error) {
      if (error instanceof CreditServiceError && error.code === 'tool_not_found') {
        return res.status(404).json({ message: error.message });
      }
      handleError(res, error, 'Billing: Get Credit Ledger Error');
    }
  }
}

export const billingCreditController = new BillingCreditController();
