import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { CreditWallet } from '../models/credit_wallet';
import {
  CreditServiceError,
  InsufficientCreditsError,
  ReservationConflictError,
  ReservationNotFoundError,
  creditService,
} from '../services/credit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

/**
 * Internal credit controller. Called by micro tools via service-key auth.
 *
 * Error contract:
 *  - 400 invalid params
 *  - 402 insufficient credits (`{ code: "insufficient_credits", needed, available }`)
 *  - 404 reservation/tool not found
 *  - 409 reservation already settled / released / expired
 */

function respondCreditError(res: Response, err: unknown): boolean {
  if (err instanceof InsufficientCreditsError) {
    res.status(402).json({
      code: err.code,
      message: err.message,
      needed: err.needed,
      available: err.available,
    });
    return true;
  }
  if (err instanceof ReservationNotFoundError) {
    res.status(404).json({ code: err.code, message: err.message });
    return true;
  }
  if (err instanceof ReservationConflictError) {
    res.status(409).json({ code: err.code, message: err.message });
    return true;
  }
  if (err instanceof CreditServiceError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return true;
  }
  return false;
}

export const reserveCredits = async (req: Request, res: Response) => {
  try {
    const orgId = req.params.id;
    const { tool_slug, amount, idempotency_key, ttl_seconds, operation_slug, metadata } = req.body ?? {};
    if (!tool_slug || typeof amount !== 'number' || !idempotency_key) {
      return res.status(400).json({ message: 'tool_slug, amount, idempotency_key are required' });
    }
    const result = await creditService.reserveCredits({
      orgId,
      toolSlugOrId: tool_slug,
      amount,
      idempotencyKey: idempotency_key,
      ttlSeconds: ttl_seconds,
      operationSlug: operation_slug,
      metadata,
    });
    res.json(result);
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Reserve Credits Error');
  }
};

export const settleReservation = async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const { idempotency_key, operation_slug } = req.body ?? {};
    const result = await creditService.settleReservation({
      reservationId,
      idempotencyKey: idempotency_key,
      operationSlug: operation_slug,
    });
    res.json(result);
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Settle Reservation Error');
  }
};

export const releaseReservation = async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const result = await creditService.releaseReservation({ reservationId });
    res.json(result);
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Release Reservation Error');
  }
};

export const extendReservation = async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const { ttl_seconds } = req.body ?? {};
    if (typeof ttl_seconds !== 'number' || ttl_seconds <= 0) {
      return res.status(400).json({ message: 'ttl_seconds must be a positive number' });
    }
    const result = await creditService.extendReservation({ reservationId, ttlSeconds: ttl_seconds });
    res.json(result);
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Extend Reservation Error');
  }
};

export const consumeCredits = async (req: Request, res: Response) => {
  try {
    const orgId = req.params.id;
    const { tool_slug, amount, idempotency_key, source, operation_slug, metadata } = req.body ?? {};
    if (!tool_slug || typeof amount !== 'number' || !idempotency_key || !source) {
      return res.status(400).json({ message: 'tool_slug, amount, idempotency_key, source are required' });
    }
    const result = await creditService.consumeCredits({
      orgId,
      toolSlugOrId: tool_slug,
      amount,
      idempotencyKey: idempotency_key,
      source,
      operationSlug: operation_slug,
      metadata,
    });
    res.json(result);
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Consume Credits Error');
  }
};

export const getCreditWallets = async (req: Request, res: Response) => {
  try {
    const orgId = req.params.id;
    const wallets = await creditService.getWallets(orgId);
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
        total_available: w.plan_balance + w.purchased_balance,
        plan_period_end: w.next_reset_at,
        metadata: w.metadata,
      })),
    );
  } catch (error) {
    handleError(res, error, 'Internal: Get Credit Wallets Error');
  }
};

export const getCreditWalletByTool = async (req: Request, res: Response) => {
  try {
    const orgId = req.params.id;
    const { toolSlug } = req.params;
    const wallet = await creditService.getWallet(orgId, toolSlug);
    if (!wallet) {
      return res.json({
        wallet_id: null,
        tool_slug: toolSlug,
        plan_balance: 0,
        purchased_balance: 0,
        reserved_amount: 0,
        plan_available: 0,
        purchased_available: 0,
        total_available: 0,
        plan_period_end: null,
        metadata: {},
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
      metadata: wallet.metadata,
    });
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Get Credit Wallet Error');
  }
};

export const getCreditLedger = async (req: Request, res: Response) => {
  try {
    const orgId = req.params.id;
    const { toolSlug } = req.params;
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await creditService.getLedger({
      orgId,
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
        reservation_id: e.reservation_id,
        created_at: e.created_at,
      })),
      next_cursor: result.next_cursor ? result.next_cursor.toString() : null,
    });
  } catch (error) {
    if (respondCreditError(res, error)) return;
    handleError(res, error, 'Internal: Get Credit Ledger Error');
  }
};

/**
 * Returns the per-operation credit cost map for a given tool, keyed by feature
 * slug. Each entry includes ``cost`` and ``requires_subscription``.
 *
 * The legacy ``costs`` map (slug → integer) is also returned for backwards
 * compatibility with older clients; new clients should use ``features``.
 */
export const getToolFeatureCosts = async (req: Request, res: Response) => {
  try {
    const { toolSlug } = req.params;
    const tool = await Tool.findOne({ where: { slug: toolSlug } });
    if (!tool) {
      return res.status(404).json({ message: `Tool ${toolSlug} not found` });
    }
    const features = await Feature.findAll({
      where: { tool_id: tool.id },
      attributes: ['slug', 'credit_cost', 'requires_subscription', 'use_credit_system'],
    });
    const costs: Record<string, number> = {};
    const featuresMeta: Record<
      string,
      { cost: number; requires_subscription: boolean; use_credit_system: boolean }
    > = {};
    for (const f of features) {
      costs[f.slug] = f.credit_cost;
      featuresMeta[f.slug] = {
        cost: f.credit_cost,
        requires_subscription: f.requires_subscription,
        use_credit_system: f.use_credit_system,
      };
    }
    res.json({ tool_slug: toolSlug, costs, features: featuresMeta });
  } catch (error) {
    handleError(res, error, 'Internal: Get Tool Feature Costs Error');
  }
};
