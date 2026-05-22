import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { Plan } from '../models/plan';
import { Organization } from '../models/organization';
import { ToolCreditConfig } from '../models/tool_credit_config';
import { CreditPack } from '../models/credit_pack';
import { PlanCreditGrant } from '../models/plan_credit_grant';
import { CreditWallet } from '../models/credit_wallet';
import { CreditLedgerEntry } from '../models/credit_ledger';
import { CreditBucket, CreditEntryType, CreditOnCancel, CreditResetInterval } from '../models/enums';
import { creditService, CreditServiceError, InsufficientCreditsError } from '../services/credit.service';
import { stripeService } from '../services/stripe.service';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

// ==========================
// Feature credit cost
// ==========================

export const updateFeatureCreditCost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const updates: {
      credit_cost?: number;
      requires_subscription?: boolean;
      use_credit_system?: boolean;
    } = {};

    if ('credit_cost' in body) {
      const cost = Number(body.credit_cost);
      if (!Number.isInteger(cost) || cost < 0) {
        return res.status(400).json({ message: 'credit_cost must be a non-negative integer' });
      }
      updates.credit_cost = cost;
    }
    if ('requires_subscription' in body) {
      if (typeof body.requires_subscription !== 'boolean') {
        return res.status(400).json({ message: 'requires_subscription must be a boolean' });
      }
      updates.requires_subscription = body.requires_subscription;
    }
    if ('use_credit_system' in body) {
      if (typeof body.use_credit_system !== 'boolean') {
        return res.status(400).json({ message: 'use_credit_system must be a boolean' });
      }
      updates.use_credit_system = body.use_credit_system;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    const feature = await Feature.findByPk(id);
    if (!feature) return res.status(404).json({ message: 'Feature not found' });

    await feature.update(updates);
    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.feature_cost.update',
      entityType: 'feature',
      entityId: feature.id,
      details: { ...updates, slug: feature.slug },
    });
    res.json(feature);
  } catch (error) {
    handleError(res, error, 'Admin: Update Feature Credit Cost');
  }
};

// ==========================
// Tool credit config (a-la-carte)
// ==========================

export const getToolCreditConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const config = await ToolCreditConfig.findByPk(id);
    if (!config) {
      return res.json({
        tool_id: id,
        alacarte_enabled: false,
        price_per_credit: null,
        currency: 'usd',
        min_credits: 1,
        max_credits: null,
        alacarte_stripe_product_id: null,
        alacarte_stripe_price_id: null,
      });
    }
    res.json(config);
  } catch (error) {
    handleError(res, error, 'Admin: Get Tool Credit Config');
  }
};

export const upsertToolCreditConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      alacarte_enabled,
      price_per_credit,
      currency,
      min_credits,
      max_credits,
    } = req.body ?? {};

    const tool = await Tool.findByPk(id);
    if (!tool) return res.status(404).json({ message: 'Tool not found' });

    if (alacarte_enabled === true) {
      if (!Number.isInteger(price_per_credit) || price_per_credit <= 0) {
        return res
          .status(400)
          .json({ message: 'price_per_credit must be a positive integer (cents) when enabling a-la-carte' });
      }
    }

    const [config] = await ToolCreditConfig.findOrCreate({
      where: { tool_id: id },
      defaults: {
        tool_id: id,
        alacarte_enabled: false,
        currency: 'usd',
        min_credits: 1,
      },
    });

    // If price changed, provision/refresh Stripe product+price (archive old)
    let stripeProductId = config.alacarte_stripe_product_id;
    let stripePriceId = config.alacarte_stripe_price_id;

    const priceChanged =
      Number.isInteger(price_per_credit) && price_per_credit !== config.price_per_credit;
    const currencyChanged = currency && currency !== config.currency;

    if (alacarte_enabled && (priceChanged || currencyChanged || !stripePriceId)) {
      try {
        if (!stripeProductId) {
          const product = await stripeService.createProduct(
            `${tool.name} - A-la-carte credits`,
            `Per-credit purchase for ${tool.name}`,
          );
          stripeProductId = product.id;
        }
        if (stripePriceId) {
          try {
            await stripeService.archivePrice(stripePriceId);
          } catch (e) {
            Logger.warn(`[Admin] Failed to archive old a-la-carte price ${stripePriceId}`, e);
          }
        }
        const newPrice = await stripeService.createOneTimePrice(
          stripeProductId,
          price_per_credit,
          currency || config.currency,
        );
        stripePriceId = newPrice.id;
      } catch (stripeErr) {
        Logger.error('[Admin] Stripe a-la-carte provision error', stripeErr);
        return res.status(502).json({ message: 'Stripe provisioning failed' });
      }
    }

    await config.update({
      alacarte_enabled: !!alacarte_enabled,
      price_per_credit: Number.isInteger(price_per_credit) ? price_per_credit : config.price_per_credit,
      currency: currency || config.currency,
      min_credits: Number.isInteger(min_credits) ? min_credits : config.min_credits,
      max_credits: max_credits === null ? null : (Number.isInteger(max_credits) ? max_credits : config.max_credits),
      alacarte_stripe_product_id: stripeProductId,
      alacarte_stripe_price_id: stripePriceId,
    });

    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.tool_config.update',
      entityType: 'tool',
      entityId: tool.id,
      details: { ...req.body, alacarte_stripe_price_id: stripePriceId },
    });

    res.json(config);
  } catch (error) {
    handleError(res, error, 'Admin: Upsert Tool Credit Config');
  }
};

// ==========================
// Credit Packs CRUD
// ==========================

export const listCreditPacks = async (req: Request, res: Response) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.tool_id) where.tool_id = req.query.tool_id;
    const packs = await CreditPack.findAll({
      where,
      include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
      order: [['created_at', 'DESC']],
    });
    res.json(packs);
  } catch (error) {
    handleError(res, error, 'Admin: List Credit Packs');
  }
};

export const createCreditPack = async (req: Request, res: Response) => {
  try {
    const { tool_id, name, credits, price, currency = 'usd', active = true } = req.body ?? {};
    if (!tool_id || !name || !Number.isInteger(credits) || credits <= 0 || !Number.isInteger(price) || price < 0) {
      return res.status(400).json({ message: 'tool_id, name, credits>0, price>=0 required' });
    }
    const tool = await Tool.findByPk(tool_id);
    if (!tool) return res.status(404).json({ message: 'Tool not found' });

    // Provision Stripe Product + one-time Price
    let stripeProductId: string | null = null;
    let stripePriceId: string | null = null;
    try {
      const product = await stripeService.createProduct(
        `${tool.name} - ${name}`,
        `${credits} credits for ${tool.name}`,
      );
      stripeProductId = product.id;
      const stripePrice = await stripeService.createOneTimePrice(product.id, price, currency);
      stripePriceId = stripePrice.id;
    } catch (stripeErr) {
      Logger.error('[Admin] Failed to create Stripe assets for credit pack', stripeErr);
      return res.status(502).json({ message: 'Stripe provisioning failed' });
    }

    const pack = await CreditPack.create({
      tool_id,
      name,
      credits,
      price,
      currency,
      active,
      stripe_product_id: stripeProductId,
      stripe_price_id: stripePriceId,
    });

    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.pack.create',
      entityType: 'credit_pack',
      entityId: pack.id,
      details: { tool_id, name, credits, price, currency },
    });

    res.status(201).json(pack);
  } catch (error) {
    handleError(res, error, 'Admin: Create Credit Pack');
  }
};

export const updateCreditPack = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pack = await CreditPack.findByPk(id);
    if (!pack) return res.status(404).json({ message: 'Credit pack not found' });

    const { name, credits, price, currency, active } = req.body ?? {};
    const priceChanged = Number.isInteger(price) && price !== pack.price;
    const currencyChanged = currency && currency !== pack.currency;
    const creditsChanged = Number.isInteger(credits) && credits !== pack.credits;

    let stripePriceId = pack.stripe_price_id;

    // If pricing-relevant attributes changed, archive old Stripe price and create a new one
    if ((priceChanged || currencyChanged || creditsChanged) && pack.stripe_product_id) {
      try {
        if (stripePriceId) {
          try {
            await stripeService.archivePrice(stripePriceId);
          } catch (e) {
            Logger.warn(`[Admin] Failed to archive old credit pack price ${stripePriceId}`, e);
          }
        }
        const newPrice = await stripeService.createOneTimePrice(
          pack.stripe_product_id,
          Number.isInteger(price) ? price : pack.price,
          currency || pack.currency,
        );
        stripePriceId = newPrice.id;
        if (name || creditsChanged) {
          await stripeService.updateProduct(pack.stripe_product_id, name || pack.name);
        }
      } catch (stripeErr) {
        Logger.error('[Admin] Failed to refresh Stripe price for credit pack', stripeErr);
        return res.status(502).json({ message: 'Stripe provisioning failed' });
      }
    }

    await pack.update({
      name: name ?? pack.name,
      credits: Number.isInteger(credits) ? credits : pack.credits,
      price: Number.isInteger(price) ? price : pack.price,
      currency: currency || pack.currency,
      active: typeof active === 'boolean' ? active : pack.active,
      stripe_price_id: stripePriceId,
    });

    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.pack.update',
      entityType: 'credit_pack',
      entityId: pack.id,
      details: req.body,
    });

    res.json(pack);
  } catch (error) {
    handleError(res, error, 'Admin: Update Credit Pack');
  }
};

export const deleteCreditPack = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pack = await CreditPack.findByPk(id);
    if (!pack) return res.status(404).json({ message: 'Credit pack not found' });
    if (pack.stripe_price_id) {
      try {
        await stripeService.archivePrice(pack.stripe_price_id);
      } catch (e) {
        Logger.warn(`[Admin] Failed to archive Stripe price on pack delete ${pack.stripe_price_id}`, e);
      }
    }
    await pack.destroy();
    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.pack.delete',
      entityType: 'credit_pack',
      entityId: pack.id,
      details: { name: pack.name },
    });
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, 'Admin: Delete Credit Pack');
  }
};

// ==========================
// Per-plan credit grants
// ==========================

export const listPlanCreditGrants = async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const grants = await PlanCreditGrant.findAll({
      where: { plan_id: planId },
      include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
    });
    res.json(grants);
  } catch (error) {
    handleError(res, error, 'Admin: List Plan Credit Grants');
  }
};

export const upsertPlanCreditGrant = async (req: Request, res: Response) => {
  try {
    const { planId, toolId } = req.params;
    const {
      credits_per_cycle,
      trial_credits,
      reset_interval,
      carry_over,
      on_cancel,
      apply_to_existing,
    } = req.body ?? {};

    const plan = await Plan.findByPk(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    const tool = await Tool.findByPk(toolId);
    if (!tool) return res.status(404).json({ message: 'Tool not found' });

    const [grant, wasCreated] = await PlanCreditGrant.findOrCreate({
      where: { plan_id: planId, tool_id: toolId },
      defaults: {
        plan_id: planId,
        tool_id: toolId,
        credits_per_cycle: 0,
        trial_credits: 0,
        reset_interval: CreditResetInterval.MONTHLY,
        carry_over: true,
        on_cancel: CreditOnCancel.FORFEIT_IMMEDIATE,
      },
    });

    // Snapshot pre-update values so we can compute deltas after the update.
    const oldCreditsPerCycle = wasCreated ? 0 : grant.credits_per_cycle;
    const oldTrialCredits = wasCreated ? 0 : grant.trial_credits;
    const oldResetInterval = grant.reset_interval;

    // Compute effective values so we can validate the combination before persisting.
    const effectiveResetInterval = Object.values(CreditResetInterval).includes(reset_interval)
      ? reset_interval
      : grant.reset_interval;
    const effectiveOnCancel = Object.values(CreditOnCancel).includes(on_cancel)
      ? on_cancel
      : grant.on_cancel;

    if (
      effectiveOnCancel === CreditOnCancel.KEEP_TILL_GRANT_PERIOD_END &&
      effectiveResetInterval === CreditResetInterval.NEVER
    ) {
      return res.status(400).json({
        message:
          '"Keep till grant period end" requires a reset interval (monthly or yearly). With "never", credits have no cadence to expire on — choose "Forfeit immediately" or "Keep forever" instead.',
      });
    }

    await grant.update({
      credits_per_cycle: Number.isInteger(credits_per_cycle) ? credits_per_cycle : grant.credits_per_cycle,
      trial_credits: Number.isInteger(trial_credits) ? trial_credits : grant.trial_credits,
      reset_interval: effectiveResetInterval,
      carry_over: typeof carry_over === 'boolean' ? carry_over : grant.carry_over,
      on_cancel: effectiveOnCancel,
    });

    const shouldPropagate = apply_to_existing !== false;
    let propagation: { affected: number; skipped: number } | null = null;
    if (shouldPropagate && req.user?.id) {
      propagation = await creditService.applyPlanGrantUpdateToSubscribers({
        planId,
        toolId,
        oldCreditsPerCycle,
        newCreditsPerCycle: grant.credits_per_cycle,
        oldTrialCredits,
        newTrialCredits: grant.trial_credits,
        oldResetInterval,
        newResetInterval: grant.reset_interval,
        adminUserId: req.user.id,
        reason: wasCreated
          ? 'Admin added plan credit grant'
          : 'Admin updated plan credit grant',
      });
    }

    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.plan_grant.update',
      entityType: 'plan',
      entityId: planId,
      details: {
        tool_id: toolId,
        was_created: wasCreated,
        old_credits_per_cycle: oldCreditsPerCycle,
        old_trial_credits: oldTrialCredits,
        apply_to_existing: shouldPropagate,
        propagation,
        ...req.body,
      },
    });

    res.json({ grant, propagation });
  } catch (error) {
    handleError(res, error, 'Admin: Upsert Plan Credit Grant');
  }
};

export const deletePlanCreditGrant = async (req: Request, res: Response) => {
  try {
    const { planId, toolId } = req.params;
    const { existing_action } = req.body ?? {};
    // Default 'keep' to match the "reductions defer to next cycle" policy used on
    // upserts. Future grants stop automatically (the grant row is gone), but the
    // existing plan_balance is left intact for the current period. Admin can pass
    // existing_action='forfeit' to expire balances immediately.
    const action: 'forfeit' | 'keep' = existing_action === 'forfeit' ? 'forfeit' : 'keep';

    const grant = await PlanCreditGrant.findOne({ where: { plan_id: planId, tool_id: toolId } });
    if (!grant) return res.status(404).json({ message: 'Grant not found' });

    let propagation: { affected: number; skipped: number } | null = null;
    if (req.user?.id) {
      propagation = await creditService.applyPlanGrantDeletionToSubscribers({
        planId,
        toolId,
        action,
        adminUserId: req.user.id,
      });
    }

    await grant.destroy();
    await AuditService.log({
      actorId: req.user?.id,
      action: 'credit.plan_grant.delete',
      entityType: 'plan',
      entityId: planId,
      details: { tool_id: toolId, existing_action: action, propagation },
    });
    res.json({ ok: true, propagation });
  } catch (error) {
    handleError(res, error, 'Admin: Delete Plan Credit Grant');
  }
};

// ==========================
// Org wallets
// ==========================

export const listAllPlanCreditGrants = async (req: Request, res: Response) => {
  try {
    const grants = await PlanCreditGrant.findAll({
      include: [
        { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] },
        { model: Plan, as: 'plan', attributes: ['id', 'name', 'tier'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json(grants);
  } catch (error) {
    handleError(res, error, 'Admin: List All Plan Credit Grants');
  }
};

export const listFeatureCreditCosts = async (req: Request, res: Response) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.tool_id) where.tool_id = req.query.tool_id;
    const features = await Feature.findAll({
      where,
      include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
      order: [['created_at', 'DESC']],
    });
    res.json(features);
  } catch (error) {
    handleError(res, error, 'Admin: List Feature Credit Costs');
  }
};

export const listOrgsWithWallets = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string)?.trim();
    const orgWhere: Record<string, unknown> = {};
    if (search) {
      orgWhere[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const orgs = await Organization.findAll({
      where: orgWhere,
      include: [
        {
          model: CreditWallet,
          as: 'credit_wallets',
          required: false,
          include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
        },
      ],
      order: [['name', 'ASC']],
      limit: 200,
    });
    res.json(
      orgs.map((o) => {
        const wallets = (o as Organization & { credit_wallets?: CreditWallet[] }).credit_wallets ?? [];
        const plan = wallets.reduce((s, w) => s + w.plan_balance, 0);
        const purchased = wallets.reduce((s, w) => s + w.purchased_balance, 0);
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          total_credits: plan + purchased,
          plan_total: plan,
          purchased_total: purchased,
          wallet_count: wallets.length,
        };
      }),
    );
  } catch (error) {
    handleError(res, error, 'Admin: List Orgs with Wallets');
  }
};

export const getOrgCreditWallets = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wallets = await creditService.getWallets(id);
    res.json(
      wallets.map((w) => ({
        wallet_id: w.id,
        tool_id: w.tool_id,
        tool_slug: w.tool?.slug,
        tool_name: w.tool?.name,
        plan_balance: w.plan_balance,
        purchased_balance: w.purchased_balance,
        reserved_amount: w.reserved_amount,
        total_available: w.plan_balance + w.purchased_balance,
        plan_period_end: w.next_reset_at,
      })),
    );
  } catch (error) {
    handleError(res, error, 'Admin: Get Org Credit Wallets');
  }
};

export const getOrgWalletLedger = async (req: Request, res: Response) => {
  try {
    const { id, toolId } = req.params;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await creditService.getLedger({
      orgId: id,
      toolSlugOrId: toolId,
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
        admin_user_id: e.admin_user_id,
        reservation_id: e.reservation_id,
        created_at: e.created_at,
      })),
      next_cursor: result.next_cursor ? result.next_cursor.toString() : null,
    });
  } catch (error) {
    handleError(res, error, 'Admin: Get Wallet Ledger');
  }
};

export const getOrgWalletUsage = async (req: Request, res: Response) => {
  try {
    const { id, toolId } = req.params;
    const days = Math.min(Number(req.query.days ?? 30), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tool = await (async () => {
      const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(toolId);
      if (looksLikeUuid) return Tool.findByPk(toolId);
      return Tool.findOne({ where: { slug: toolId } });
    })();
    if (!tool) return res.status(404).json({ message: 'Tool not found' });

    // Spending is recorded either as a direct CONSUME entry or as SETTLE entries
    // when the consume flow uses reserve→settle (one per bucket per reservation).
    // Both have negative amounts; count a "run" once per reservation for SETTLE so
    // a plan+purchased split doesn't double-count, and once per CONSUME entry.
    const entries = await CreditLedgerEntry.findAll({
      where: {
        organization_id: id,
        tool_id: tool.id,
        entry_type: { [Op.in]: [CreditEntryType.CONSUME, CreditEntryType.SETTLE] },
        created_at: { [Op.gte]: since },
      },
      attributes: ['entry_type', 'operation_slug', 'amount', 'reservation_id'],
    });

    const summary: Record<string, { spent: number; runs: number; _seenReservations: Set<string> }> = {};
    for (const e of entries) {
      const key = e.operation_slug || 'unknown';
      if (!summary[key]) summary[key] = { spent: 0, runs: 0, _seenReservations: new Set() };
      summary[key].spent += -e.amount;
      if (e.entry_type === CreditEntryType.SETTLE && e.reservation_id) {
        if (!summary[key]._seenReservations.has(e.reservation_id)) {
          summary[key]._seenReservations.add(e.reservation_id);
          summary[key].runs += 1;
        }
      } else {
        summary[key].runs += 1;
      }
    }
    res.json({
      days,
      since,
      operations: Object.entries(summary)
        .map(([slug, v]) => ({ operation_slug: slug, spent: v.spent, runs: v.runs }))
        .sort((a, b) => b.spent - a.spent),
    });
  } catch (error) {
    handleError(res, error, 'Admin: Get Wallet Usage');
  }
};

export const adjustOrgWallet = async (req: Request, res: Response) => {
  try {
    const { id, toolId } = req.params;
    const { bucket, delta, reason } = req.body ?? {};
    if (bucket !== CreditBucket.PLAN && bucket !== CreditBucket.PURCHASED) {
      return res.status(400).json({ message: 'bucket must be "plan" or "purchased"' });
    }
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ message: 'delta must be a non-zero integer' });
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ message: 'reason is required' });
    }
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }
    try {
      const result = await creditService.adminAdjust({
        orgId: id,
        toolSlugOrId: toolId,
        bucket,
        delta,
        reason,
        adminUserId: req.user.id,
      });
      await AuditService.log({
        actorId: req.user.id,
        action: 'credit.wallet.adjust',
        entityType: 'organization',
        entityId: id,
        details: { tool_id: toolId, bucket, delta, reason },
      });
      res.json(result);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        return res.status(400).json({ code: e.code, message: e.message, needed: e.needed, available: e.available });
      }
      if (e instanceof CreditServiceError) {
        return res.status(e.status).json({ code: e.code, message: e.message });
      }
      throw e;
    }
  } catch (error) {
    handleError(res, error, 'Admin: Adjust Org Wallet');
  }
};

