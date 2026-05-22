import { Op, Transaction } from 'sequelize';
import sequelize from '../config/db';
import {
  CreditBucket,
  CreditEntryType,
  CreditOnCancel,
  CreditReservationStatus,
  CreditResetInterval,
  SubStatus,
} from '../models/enums';
import { CreditLedgerEntry } from '../models/credit_ledger';
import { CreditReservation } from '../models/credit_reservation';
import { CreditWallet } from '../models/credit_wallet';
import { Tool } from '../models/tool';
import { Subscription } from '../models/subscription';
import { PlanCreditGrant } from '../models/plan_credit_grant';
import { BundlePlan } from '../models/bundle_plan';
import Logger from '../utils/logger';

const ACTIVE_SUB_STATUSES: SubStatus[] = [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE];

// =====================
// Typed errors
// =====================

export class CreditServiceError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = 'CreditServiceError';
  }
}

export class InsufficientCreditsError extends CreditServiceError {
  constructor(public readonly needed: number, public readonly available: number) {
    super(
      `Insufficient credits: need ${needed}, have ${available}`,
      'insufficient_credits',
      402,
    );
    this.name = 'InsufficientCreditsError';
  }
}

export class ReservationNotFoundError extends CreditServiceError {
  constructor(reservationId: string) {
    super(`Reservation ${reservationId} not found`, 'reservation_not_found', 404);
    this.name = 'ReservationNotFoundError';
  }
}

export class ReservationConflictError extends CreditServiceError {
  constructor(reservationId: string, status: string) {
    super(
      `Reservation ${reservationId} already ${status}`,
      'reservation_conflict',
      409,
    );
    this.name = 'ReservationConflictError';
  }
}

// =====================
// Types
// =====================

export interface Balances {
  plan_balance: number;
  purchased_balance: number;
  reserved_amount: number;
}

export interface ReserveResult {
  reservation_id: string;
  expires_at: Date;
  balances: Balances;
}

export interface SettleResult {
  balances: Balances;
  ledger_entry_ids: number[];
}

export interface ReleaseResult {
  balances: Balances;
  ledger_entry_ids: number[];
}

export interface ConsumeResult {
  balances: Balances;
  ledger_entry_ids: number[];
}

export interface GrantResult {
  balances: Balances;
  ledger_entry_ids: number[];
  already_applied: boolean;
}

// =====================
// Helpers
// =====================

/**
 * Computes the wallet's next_reset_at from the grant's own cadence — NOT from
 * the Stripe billing cycle. A YEARLY grant on a monthly-billed plan must show a
 * year-from-now boundary, not the next monthly invoice.
 *  - NEVER   → null (no boundary)
 *  - MONTHLY → anchor + 1 calendar month (UTC)
 *  - YEARLY  → anchor + 1 calendar year (UTC)
 */
export function computeNextResetAt(
  resetInterval: CreditResetInterval | undefined | null,
  anchor: Date | null | undefined,
): Date | null {
  if (!resetInterval || resetInterval === CreditResetInterval.NEVER) return null;
  if (!anchor) return null;
  const d = new Date(anchor.getTime());
  if (resetInterval === CreditResetInterval.MONTHLY) {
    d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (resetInterval === CreditResetInterval.YEARLY) {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d;
}

function asBalances(wallet: CreditWallet): Balances {
  return {
    plan_balance: wallet.plan_balance,
    purchased_balance: wallet.purchased_balance,
    reserved_amount: wallet.reserved_amount,
  };
}

// =====================
// CreditService
// =====================

export class CreditService {
  /**
   * Resolves the tool id from a slug or id.
   */
  public async resolveToolId(toolSlugOrId: string, transaction?: Transaction): Promise<string> {
    // UUIDs contain dashes; the tools.slug never does. Use this as a cheap branch.
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      toolSlugOrId,
    );
    if (looksLikeUuid) {
      const tool = await Tool.findByPk(toolSlugOrId, { attributes: ['id'], transaction });
      if (!tool) throw new CreditServiceError(`Tool ${toolSlugOrId} not found`, 'tool_not_found', 404);
      return tool.id;
    }
    const tool = await Tool.findOne({ where: { slug: toolSlugOrId }, attributes: ['id'], transaction });
    if (!tool) throw new CreditServiceError(`Tool slug ${toolSlugOrId} not found`, 'tool_not_found', 404);
    return tool.id;
  }

  /**
   * Locks (or lazily creates) the wallet row FOR UPDATE.
   */
  private async lockWallet(
    organizationId: string,
    toolId: string,
    transaction: Transaction,
  ): Promise<CreditWallet> {
    let wallet = await CreditWallet.findOne({
      where: { organization_id: organizationId, tool_id: toolId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!wallet) {
      // Create empty wallet (idempotent via unique index)
      try {
        wallet = await CreditWallet.create(
          {
            organization_id: organizationId,
            tool_id: toolId,
            plan_balance: 0,
            purchased_balance: 0,
            reserved_amount: 0,
            metadata: {},
          },
          { transaction },
        );
        // Re-select FOR UPDATE so we hold the row lock for the rest of the tx
        wallet = await CreditWallet.findOne({
          where: { id: wallet.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      } catch {
        // Lost race with concurrent insert; just re-select with lock
        wallet = await CreditWallet.findOne({
          where: { organization_id: organizationId, tool_id: toolId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
      }
    }
    if (!wallet) {
      throw new CreditServiceError('Could not lock wallet', 'wallet_lock_failed', 500);
    }
    return wallet;
  }

  /**
   * If idempotency_key was already used on this (org, tool), return the prior ledger entries.
   * Returns null if no prior entry exists.
   */
  private async findIdempotentLedger(
    organizationId: string,
    toolId: string,
    idempotencyKey: string,
    transaction: Transaction,
  ): Promise<CreditLedgerEntry[] | null> {
    const entries = await CreditLedgerEntry.findAll({
      where: {
        organization_id: organizationId,
        tool_id: toolId,
        idempotency_key: idempotencyKey,
      },
      order: [['id', 'ASC']],
      transaction,
    });
    return entries.length ? entries : null;
  }

  // =====================
  // RESERVE
  // =====================

  public async reserveCredits(params: {
    orgId: string;
    toolSlugOrId: string;
    amount: number;
    idempotencyKey: string;
    ttlSeconds?: number;
    operationSlug?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ReserveResult> {
    const { orgId, toolSlugOrId, amount, idempotencyKey, operationSlug } = params;
    const ttlSeconds = params.ttlSeconds ?? 1800;
    const metadata = params.metadata ?? {};

    if (amount <= 0) {
      throw new CreditServiceError('amount must be > 0', 'invalid_amount', 400);
    }

    return sequelize.transaction(async (transaction) => {
      const toolId = await this.resolveToolId(toolSlugOrId, transaction);

      // Idempotency by reservation row (unique on org+tool+key)
      const existingReservation = await CreditReservation.findOne({
        where: {
          organization_id: orgId,
          tool_id: toolId,
          idempotency_key: idempotencyKey,
        },
        transaction,
      });
      if (existingReservation) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return {
          reservation_id: existingReservation.id,
          expires_at: existingReservation.expires_at,
          balances: asBalances(wallet),
        };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);
      const available = wallet.plan_balance + wallet.purchased_balance;
      if (available < amount) {
        throw new InsufficientCreditsError(amount, available);
      }

      // Drain plan first
      const planPortion = Math.min(wallet.plan_balance, amount);
      const purchasedPortion = amount - planPortion;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const reservation = await CreditReservation.create(
        {
          organization_id: orgId,
          tool_id: toolId,
          amount,
          plan_portion: planPortion,
          purchased_portion: purchasedPortion,
          status: CreditReservationStatus.HELD,
          idempotency_key: idempotencyKey,
          expires_at: expiresAt,
          metadata,
        },
        { transaction },
      );

      wallet.plan_balance -= planPortion;
      wallet.purchased_balance -= purchasedPortion;
      wallet.reserved_amount += amount;
      await wallet.save({ transaction });

      // One ledger entry per non-zero bucket
      const ledgerEntries: CreditLedgerEntry[] = [];
      if (planPortion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.RESERVE,
              bucket: CreditBucket.PLAN,
              amount: -planPortion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: 'reservation',
              operation_slug: operationSlug ?? null,
              metadata: { idempotency_key: idempotencyKey, ...metadata },
            },
            { transaction },
          ),
        );
      }
      if (purchasedPortion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.RESERVE,
              bucket: CreditBucket.PURCHASED,
              amount: -purchasedPortion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: 'reservation',
              operation_slug: operationSlug ?? null,
              metadata: { idempotency_key: idempotencyKey, ...metadata },
            },
            { transaction },
          ),
        );
      }

      Logger.info(
        `[CreditService] Reserved ${amount} credits for org=${orgId} tool=${toolId} (plan=${planPortion}, purchased=${purchasedPortion}) reservation=${reservation.id}`,
      );

      return {
        reservation_id: reservation.id,
        expires_at: expiresAt,
        balances: asBalances(wallet),
      };
    });
  }

  // =====================
  // SETTLE
  // =====================

  public async settleReservation(params: {
    reservationId: string;
    idempotencyKey?: string;
    operationSlug?: string;
  }): Promise<SettleResult> {
    const { reservationId, operationSlug } = params;

    return sequelize.transaction(async (transaction) => {
      const reservation = await CreditReservation.findOne({
        where: { id: reservationId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!reservation) throw new ReservationNotFoundError(reservationId);

      const wallet = await this.lockWallet(
        reservation.organization_id,
        reservation.tool_id,
        transaction,
      );

      if (reservation.status === CreditReservationStatus.SETTLED) {
        // Idempotent: return prior settle ledger entries
        const prior = await CreditLedgerEntry.findAll({
          where: { reservation_id: reservationId, entry_type: CreditEntryType.SETTLE },
          order: [['id', 'ASC']],
          transaction,
        });
        return { balances: asBalances(wallet), ledger_entry_ids: prior.map((e) => e.id) };
      }
      if (reservation.status !== CreditReservationStatus.HELD) {
        throw new ReservationConflictError(reservationId, reservation.status);
      }

      reservation.status = CreditReservationStatus.SETTLED;
      reservation.settled_at = new Date();
      await reservation.save({ transaction });

      wallet.reserved_amount -= reservation.amount;
      await wallet.save({ transaction });

      // Settle ledger entries are pure audit — balances were already debited at reserve time.
      const ledgerEntries: CreditLedgerEntry[] = [];
      if (reservation.plan_portion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: reservation.organization_id,
              tool_id: reservation.tool_id,
              entry_type: CreditEntryType.SETTLE,
              bucket: CreditBucket.PLAN,
              amount: -reservation.plan_portion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: 'consume',
              operation_slug: operationSlug ?? null,
              metadata: { reservation_id: reservation.id },
            },
            { transaction },
          ),
        );
      }
      if (reservation.purchased_portion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: reservation.organization_id,
              tool_id: reservation.tool_id,
              entry_type: CreditEntryType.SETTLE,
              bucket: CreditBucket.PURCHASED,
              amount: -reservation.purchased_portion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: 'consume',
              operation_slug: operationSlug ?? null,
              metadata: { reservation_id: reservation.id },
            },
            { transaction },
          ),
        );
      }

      Logger.info(
        `[CreditService] Settled reservation ${reservation.id} (${reservation.amount} credits) for org=${reservation.organization_id}`,
      );

      return { balances: asBalances(wallet), ledger_entry_ids: ledgerEntries.map((e) => e.id) };
    });
  }

  // =====================
  // RELEASE
  // =====================

  public async releaseReservation(params: {
    reservationId: string;
    cause?: 'client' | 'sweeper';
  }): Promise<ReleaseResult> {
    const { reservationId } = params;
    const cause = params.cause ?? 'client';

    return sequelize.transaction(async (transaction) => {
      const reservation = await CreditReservation.findOne({
        where: { id: reservationId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!reservation) throw new ReservationNotFoundError(reservationId);

      const wallet = await this.lockWallet(
        reservation.organization_id,
        reservation.tool_id,
        transaction,
      );

      if (
        reservation.status === CreditReservationStatus.RELEASED ||
        reservation.status === CreditReservationStatus.EXPIRED
      ) {
        const prior = await CreditLedgerEntry.findAll({
          where: { reservation_id: reservationId, entry_type: CreditEntryType.RELEASE },
          order: [['id', 'ASC']],
          transaction,
        });
        return { balances: asBalances(wallet), ledger_entry_ids: prior.map((e) => e.id) };
      }
      if (reservation.status !== CreditReservationStatus.HELD) {
        throw new ReservationConflictError(reservationId, reservation.status);
      }

      reservation.status =
        cause === 'sweeper' ? CreditReservationStatus.EXPIRED : CreditReservationStatus.RELEASED;
      reservation.released_at = new Date();
      await reservation.save({ transaction });

      wallet.plan_balance += reservation.plan_portion;
      wallet.purchased_balance += reservation.purchased_portion;
      wallet.reserved_amount -= reservation.amount;
      await wallet.save({ transaction });

      const ledgerEntries: CreditLedgerEntry[] = [];
      if (reservation.plan_portion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: reservation.organization_id,
              tool_id: reservation.tool_id,
              entry_type: CreditEntryType.RELEASE,
              bucket: CreditBucket.PLAN,
              amount: reservation.plan_portion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: cause === 'sweeper' ? 'sweeper' : 'reservation',
              metadata: { cause },
            },
            { transaction },
          ),
        );
      }
      if (reservation.purchased_portion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: reservation.organization_id,
              tool_id: reservation.tool_id,
              entry_type: CreditEntryType.RELEASE,
              bucket: CreditBucket.PURCHASED,
              amount: reservation.purchased_portion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              reservation_id: reservation.id,
              source: cause === 'sweeper' ? 'sweeper' : 'reservation',
              metadata: { cause },
            },
            { transaction },
          ),
        );
      }

      Logger.info(
        `[CreditService] Released reservation ${reservation.id} (cause=${cause}) for org=${reservation.organization_id}`,
      );

      return { balances: asBalances(wallet), ledger_entry_ids: ledgerEntries.map((e) => e.id) };
    });
  }

  // =====================
  // EXTEND
  // =====================

  public async extendReservation(params: {
    reservationId: string;
    ttlSeconds: number;
  }): Promise<{ expires_at: Date }> {
    return sequelize.transaction(async (transaction) => {
      const reservation = await CreditReservation.findOne({
        where: { id: params.reservationId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!reservation) throw new ReservationNotFoundError(params.reservationId);
      if (reservation.status !== CreditReservationStatus.HELD) {
        throw new ReservationConflictError(params.reservationId, reservation.status);
      }
      reservation.expires_at = new Date(Date.now() + params.ttlSeconds * 1000);
      await reservation.save({ transaction });
      return { expires_at: reservation.expires_at };
    });
  }

  // =====================
  // CONSUME (no-reserve fast path)
  // =====================

  public async consumeCredits(params: {
    orgId: string;
    toolSlugOrId: string;
    amount: number;
    idempotencyKey: string;
    source: string;
    operationSlug?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConsumeResult> {
    const { orgId, toolSlugOrId, amount, idempotencyKey, source, operationSlug } = params;
    const metadata = params.metadata ?? {};

    if (amount <= 0) {
      throw new CreditServiceError('amount must be > 0', 'invalid_amount', 400);
    }

    return sequelize.transaction(async (transaction) => {
      const toolId = await this.resolveToolId(toolSlugOrId, transaction);

      // Idempotency
      const prior = await this.findIdempotentLedger(orgId, toolId, idempotencyKey, transaction);
      if (prior) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return { balances: asBalances(wallet), ledger_entry_ids: prior.map((e) => e.id) };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);
      const available = wallet.plan_balance + wallet.purchased_balance;
      if (available < amount) {
        throw new InsufficientCreditsError(amount, available);
      }

      const planPortion = Math.min(wallet.plan_balance, amount);
      const purchasedPortion = amount - planPortion;

      wallet.plan_balance -= planPortion;
      wallet.purchased_balance -= purchasedPortion;
      await wallet.save({ transaction });

      const ledgerEntries: CreditLedgerEntry[] = [];
      if (planPortion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.CONSUME,
              bucket: CreditBucket.PLAN,
              amount: -planPortion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              idempotency_key: idempotencyKey,
              source,
              operation_slug: operationSlug ?? null,
              metadata,
            },
            { transaction },
          ),
        );
      }
      if (purchasedPortion > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.CONSUME,
              bucket: CreditBucket.PURCHASED,
              amount: -purchasedPortion,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              // Idempotency key only on first entry to satisfy partial unique idx
              idempotency_key: planPortion === 0 ? idempotencyKey : null,
              source,
              operation_slug: operationSlug ?? null,
              metadata,
            },
            { transaction },
          ),
        );
      }

      Logger.info(
        `[CreditService] Consumed ${amount} credits for org=${orgId} tool=${toolId} source=${source}`,
      );
      return { balances: asBalances(wallet), ledger_entry_ids: ledgerEntries.map((e) => e.id) };
    });
  }

  // =====================
  // GRANT PLAN CREDITS (subscription renewal)
  // =====================

  public async grantPlanCredits(params: {
    orgId: string;
    toolId: string;
    planId: string;
    subscriptionId: string;
    periodStart: Date;
    creditsPerCycle: number;
    carryOver: boolean;
    resetInterval?: CreditResetInterval;
    nextResetAt?: Date | null;
    source?: string;
    // When true, bypass the wallet's period-anchor short-circuit and the
    // reset_interval cadence gate. Used by callers that know this invocation
    // represents a real new grant rather than a cycle replay — e.g., plan
    // switches (Stripe keeps current_period_start the same on in-place updates)
    // and brand-new subscriptions reusing a wallet from a previously canceled
    // sub. Per-key ledger idempotency still applies, so Stripe webhook replays
    // remain safe.
    force?: boolean;
  }): Promise<GrantResult> {
    const {
      orgId,
      toolId,
      planId,
      subscriptionId,
      periodStart,
      creditsPerCycle,
      carryOver,
      resetInterval,
      force,
    } = params;
    const source = params.source ?? 'subscription_renewal';
    const idempotencyKey = `plan_grant:${subscriptionId}:${planId}:${periodStart.toISOString()}`;

    return sequelize.transaction(async (transaction) => {
      const prior = await this.findIdempotentLedger(orgId, toolId, idempotencyKey, transaction);
      if (prior) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return {
          balances: asBalances(wallet),
          ledger_entry_ids: prior.map((e) => e.id),
          already_applied: true,
        };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);

      // Wallet-level idempotency short-circuit (exact same period replay).
      // Bypassed on `force` because plan switches reuse the same period anchor.
      if (
        !force &&
        wallet.last_granted_period_start &&
        wallet.last_granted_period_start.getTime() === periodStart.getTime()
      ) {
        return {
          balances: asBalances(wallet),
          ledger_entry_ids: [],
          already_applied: true,
        };
      }

      // reset_interval gate: skip the grant if the interval boundary hasn't
      // crossed since last_granted_period_start.
      //  - 'never'  → grant once on the very first subscribe, never again.
      //  - 'monthly'→ only refresh if last grant was in a different calendar month.
      //  - 'yearly' → only refresh if last grant was in a different calendar year.
      // Stripe may emit invoice cycles on its own cadence (monthly Stripe plan
      // with reset_interval='yearly' → 11 of 12 cycles are skipped here).
      // Bypassed on `force` (plan switch / new subscription).
      if (!force && resetInterval && wallet.last_granted_period_start) {
        const last = wallet.last_granted_period_start;
        let skipGrant = false;
        if (resetInterval === CreditResetInterval.NEVER) {
          skipGrant = true;
        } else if (resetInterval === CreditResetInterval.MONTHLY) {
          skipGrant =
            last.getUTCFullYear() === periodStart.getUTCFullYear() &&
            last.getUTCMonth() === periodStart.getUTCMonth();
        } else if (resetInterval === CreditResetInterval.YEARLY) {
          skipGrant = last.getUTCFullYear() === periodStart.getUTCFullYear();
        }
        if (skipGrant) {
          Logger.info(
            `[CreditService] grantPlanCredits skipped — reset_interval=${resetInterval}, last_grant=${last.toISOString()}, period_start=${periodStart.toISOString()}`,
          );
          return {
            balances: asBalances(wallet),
            ledger_entry_ids: [],
            already_applied: true,
          };
        }
      }

      const ledgerEntries: CreditLedgerEntry[] = [];

      // If carry_over=false, expire remaining plan balance first
      if (!carryOver && wallet.plan_balance > 0) {
        const expired = wallet.plan_balance;
        wallet.plan_balance = 0;
        await wallet.save({ transaction });
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.EXPIRE,
              bucket: CreditBucket.PLAN,
              amount: -expired,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              source: 'cycle_no_carry_over',
              related_subscription_id: subscriptionId,
              related_plan_id: planId,
              metadata: { expired_credits: expired },
            },
            { transaction },
          ),
        );
      }

      if (creditsPerCycle > 0) {
        wallet.plan_balance += creditsPerCycle;
      }
      wallet.last_granted_period_start = periodStart;
      // next_reset_at is driven by the GRANT'S cadence, not the Stripe billing
      // cycle. A YEARLY grant on a monthly Stripe plan must show year-from-now.
      // Caller may override via params.nextResetAt only when resetInterval is
      // not provided (back-compat).
      if (resetInterval) {
        wallet.next_reset_at = computeNextResetAt(resetInterval, periodStart);
      } else if (params.nextResetAt !== undefined) {
        wallet.next_reset_at = params.nextResetAt;
      }
      await wallet.save({ transaction });

      if (creditsPerCycle > 0) {
        ledgerEntries.push(
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.GRANT,
              bucket: CreditBucket.PLAN,
              amount: creditsPerCycle,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              idempotency_key: idempotencyKey,
              source,
              related_subscription_id: subscriptionId,
              related_plan_id: planId,
              metadata: { period_start: periodStart.toISOString() },
            },
            { transaction },
          ),
        );
      }

      Logger.info(
        `[CreditService] Granted ${creditsPerCycle} plan credits to org=${orgId} tool=${toolId} for subscription=${subscriptionId}`,
      );
      return {
        balances: asBalances(wallet),
        ledger_entry_ids: ledgerEntries.map((e) => e.id),
        already_applied: false,
      };
    });
  }

  // =====================
  // GRANT TRIAL CREDITS
  // =====================

  public async grantTrialCredits(params: {
    orgId: string;
    toolId: string;
    planId: string;
    subscriptionId: string;
    trialCredits: number;
    trialEnd?: Date | null;
  }): Promise<GrantResult> {
    const { orgId, toolId, planId, subscriptionId, trialCredits, trialEnd } = params;
    if (trialCredits <= 0) {
      const wallet = await CreditWallet.findOne({
        where: { organization_id: orgId, tool_id: toolId },
      });
      return {
        balances: wallet
          ? asBalances(wallet)
          : { plan_balance: 0, purchased_balance: 0, reserved_amount: 0 },
        ledger_entry_ids: [],
        already_applied: true,
      };
    }
    const idempotencyKey = `trial_grant:${subscriptionId}`;

    return sequelize.transaction(async (transaction) => {
      const prior = await this.findIdempotentLedger(orgId, toolId, idempotencyKey, transaction);
      if (prior) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return {
          balances: asBalances(wallet),
          ledger_entry_ids: prior.map((e) => e.id),
          already_applied: true,
        };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);
      wallet.plan_balance += trialCredits;
      // Anchor the wallet's expiry to trial_end so the UI shows when credits
      // will expire. The real cycle reset cadence kicks in once the trial
      // converts and grantPlanCredits runs (which overwrites next_reset_at
      // from grant.reset_interval).
      if (trialEnd) {
        wallet.next_reset_at = trialEnd;
      }
      // Track trial provenance in metadata so the sweeper can expire unspent trial credits
      const meta = (wallet.metadata ?? {}) as Record<string, unknown>;
      meta.trial = {
        subscription_id: subscriptionId,
        trial_end: trialEnd ? trialEnd.toISOString() : null,
        granted: trialCredits,
      };
      wallet.metadata = meta;
      await wallet.save({ transaction });

      const entry = await CreditLedgerEntry.create(
        {
          organization_id: orgId,
          tool_id: toolId,
          entry_type: CreditEntryType.GRANT,
          bucket: CreditBucket.TRIAL,
          amount: trialCredits,
          balance_after_plan: wallet.plan_balance,
          balance_after_purchased: wallet.purchased_balance,
          idempotency_key: idempotencyKey,
          source: 'trial_grant',
          related_subscription_id: subscriptionId,
          related_plan_id: planId,
          metadata: { trial_end: trialEnd ? trialEnd.toISOString() : null },
        },
        { transaction },
      );

      Logger.info(
        `[CreditService] Granted ${trialCredits} trial credits to org=${orgId} tool=${toolId} subscription=${subscriptionId}`,
      );
      return {
        balances: asBalances(wallet),
        ledger_entry_ids: [entry.id],
        already_applied: false,
      };
    });
  }

  // =====================
  // GRANT PURCHASED CREDITS
  // =====================

  public async grantPurchaseCredits(params: {
    orgId: string;
    toolSlugOrId: string;
    credits: number;
    idempotencyKey: string;
    source: string;
    relatedPurchaseId?: string;
    relatedCreditPackId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<GrantResult> {
    const {
      orgId,
      toolSlugOrId,
      credits,
      idempotencyKey,
      source,
      relatedPurchaseId,
      relatedCreditPackId,
    } = params;
    const metadata = params.metadata ?? {};

    if (credits <= 0) {
      throw new CreditServiceError('credits must be > 0', 'invalid_amount', 400);
    }

    return sequelize.transaction(async (transaction) => {
      const toolId = await this.resolveToolId(toolSlugOrId, transaction);
      const prior = await this.findIdempotentLedger(orgId, toolId, idempotencyKey, transaction);
      if (prior) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return {
          balances: asBalances(wallet),
          ledger_entry_ids: prior.map((e) => e.id),
          already_applied: true,
        };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);
      wallet.purchased_balance += credits;
      await wallet.save({ transaction });

      const entry = await CreditLedgerEntry.create(
        {
          organization_id: orgId,
          tool_id: toolId,
          entry_type: CreditEntryType.GRANT,
          bucket: CreditBucket.PURCHASED,
          amount: credits,
          balance_after_plan: wallet.plan_balance,
          balance_after_purchased: wallet.purchased_balance,
          idempotency_key: idempotencyKey,
          source,
          related_purchase_id: relatedPurchaseId ?? null,
          related_credit_pack_id: relatedCreditPackId ?? null,
          metadata,
        },
        { transaction },
      );

      Logger.info(
        `[CreditService] Granted ${credits} purchased credits to org=${orgId} tool=${toolId} source=${source}`,
      );
      return {
        balances: asBalances(wallet),
        ledger_entry_ids: [entry.id],
        already_applied: false,
      };
    });
  }

  // =====================
  // ADMIN ADJUST
  // =====================

  public async adminAdjust(params: {
    orgId: string;
    toolSlugOrId: string;
    bucket: CreditBucket;
    delta: number;
    reason: string;
    adminUserId: string;
    idempotencyKey?: string;
  }): Promise<GrantResult> {
    const { orgId, toolSlugOrId, bucket, delta, reason, adminUserId } = params;
    const idempotencyKey = params.idempotencyKey ?? `admin_adjust:${adminUserId}:${Date.now()}`;

    if (delta === 0) {
      throw new CreditServiceError('delta cannot be zero', 'invalid_amount', 400);
    }
    if (!reason || !reason.trim()) {
      throw new CreditServiceError('reason is required', 'missing_reason', 400);
    }
    if (bucket !== CreditBucket.PLAN && bucket !== CreditBucket.PURCHASED) {
      throw new CreditServiceError('bucket must be plan or purchased', 'invalid_bucket', 400);
    }

    return sequelize.transaction(async (transaction) => {
      const toolId = await this.resolveToolId(toolSlugOrId, transaction);
      const prior = await this.findIdempotentLedger(orgId, toolId, idempotencyKey, transaction);
      if (prior) {
        const wallet = await this.lockWallet(orgId, toolId, transaction);
        return {
          balances: asBalances(wallet),
          ledger_entry_ids: prior.map((e) => e.id),
          already_applied: true,
        };
      }

      const wallet = await this.lockWallet(orgId, toolId, transaction);

      if (bucket === CreditBucket.PLAN) {
        const newBal = wallet.plan_balance + delta;
        if (newBal < 0) {
          throw new InsufficientCreditsError(-delta, wallet.plan_balance);
        }
        wallet.plan_balance = newBal;
      } else {
        const newBal = wallet.purchased_balance + delta;
        if (newBal < 0) {
          throw new InsufficientCreditsError(-delta, wallet.purchased_balance);
        }
        wallet.purchased_balance = newBal;
      }
      await wallet.save({ transaction });

      const entry = await CreditLedgerEntry.create(
        {
          organization_id: orgId,
          tool_id: toolId,
          entry_type: CreditEntryType.ADJUSTMENT,
          bucket,
          amount: delta,
          balance_after_plan: wallet.plan_balance,
          balance_after_purchased: wallet.purchased_balance,
          idempotency_key: idempotencyKey,
          source: 'admin_adjust',
          admin_user_id: adminUserId,
          reason,
          metadata: {},
        },
        { transaction },
      );

      Logger.info(
        `[CreditService] Admin ${adminUserId} adjusted ${bucket} by ${delta} for org=${orgId} tool=${toolId} reason="${reason}"`,
      );

      return {
        balances: asBalances(wallet),
        ledger_entry_ids: [entry.id],
        already_applied: false,
      };
    });
  }

  // =====================
  // CANCELLATION POLICY
  // =====================

  public async applyCancellationPolicy(params: {
    orgId: string;
    toolId: string;
    planId: string;
    subscriptionId: string;
    policy: CreditOnCancel;
  }): Promise<{ applied: CreditOnCancel; balances: Balances }> {
    const { orgId, toolId, planId, subscriptionId, policy } = params;

    return sequelize.transaction(async (transaction) => {
      const wallet = await this.lockWallet(orgId, toolId, transaction);

      if (policy === CreditOnCancel.KEEP_TILL_GRANT_PERIOD_END) {
        // No-op now; the cron sweeper expires plan_balance once the wallet's
        // own next_reset_at (driven by grant.reset_interval) elapses.
        return { applied: policy, balances: asBalances(wallet) };
      }

      if (policy === CreditOnCancel.FORFEIT_IMMEDIATE) {
        if (wallet.plan_balance > 0) {
          const expired = wallet.plan_balance;
          wallet.plan_balance = 0;
          wallet.next_reset_at = null;
          wallet.last_granted_period_start = null;
          await wallet.save({ transaction });
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.EXPIRE,
              bucket: CreditBucket.PLAN,
              amount: -expired,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              source: 'cancel_forfeit_immediate',
              related_subscription_id: subscriptionId,
              related_plan_id: planId,
              metadata: { expired_credits: expired },
            },
            { transaction },
          );
        }
        return { applied: policy, balances: asBalances(wallet) };
      }

      if (policy === CreditOnCancel.KEEP_FOREVER) {
        if (wallet.plan_balance > 0) {
          const moved = wallet.plan_balance;
          wallet.plan_balance = 0;
          wallet.purchased_balance += moved;
          wallet.next_reset_at = null;
          wallet.last_granted_period_start = null;
          await wallet.save({ transaction });
          // Two ledger entries: expire from plan, grant to purchased
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.EXPIRE,
              bucket: CreditBucket.PLAN,
              amount: -moved,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              source: 'cancel_keep_forever',
              related_subscription_id: subscriptionId,
              related_plan_id: planId,
              metadata: { moved_to_purchased: moved },
            },
            { transaction },
          );
          await CreditLedgerEntry.create(
            {
              organization_id: orgId,
              tool_id: toolId,
              entry_type: CreditEntryType.GRANT,
              bucket: CreditBucket.PURCHASED,
              amount: moved,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              source: 'cancel_keep_forever',
              related_subscription_id: subscriptionId,
              related_plan_id: planId,
              metadata: { moved_from_plan: moved },
            },
            { transaction },
          );
        }
        return { applied: policy, balances: asBalances(wallet) };
      }

      return { applied: policy, balances: asBalances(wallet) };
    });
  }

  // =====================
  // applySubscriptionGrants — orchestrator called from webhooks
  // =====================

  /**
   * Iterates the credit grants for this subscription (direct plan + bundle-composed plans)
   * and applies grantPlanCredits + optional grantTrialCredits per (plan, tool) pair.
   */
  public async applySubscriptionGrants(
    subscription: Subscription,
    opts?: { granted_trial?: boolean; force?: boolean },
  ): Promise<void> {
    if (!subscription.current_period_start) {
      Logger.warn(`[CreditService] Subscription ${subscription.id} has no current_period_start; skipping credit grants`);
      return;
    }

    const planIds = new Set<string>();
    if (subscription.plan_id) planIds.add(subscription.plan_id);
    if (subscription.bundle_id) {
      const bundlePlans = await BundlePlan.findAll({
        where: { bundle_id: subscription.bundle_id },
        attributes: ['plan_id'],
      });
      for (const bp of bundlePlans) planIds.add(bp.plan_id);
    }
    if (planIds.size === 0) return;

    const grants = await PlanCreditGrant.findAll({
      where: { plan_id: { [Op.in]: Array.from(planIds) } },
    });
    if (grants.length === 0) return;

    const isTrialing = subscription.status === 'trialing';

    for (const grant of grants) {
      // During a trial, only grant trial_credits — the per-cycle plan credits
      // are reserved for the first paid cycle (granted when status transitions
      // to ACTIVE via customer.subscription.updated or invoice.payment_succeeded
      // with billing_reason=subscription_create). Granting both during the
      // trial would stack them in plan_balance (e.g., 25 trial + 50 cycle = 75).
      if (isTrialing) {
        if (grant.trial_credits > 0 && !opts?.granted_trial) {
          await this.grantTrialCredits({
            orgId: subscription.organization_id,
            toolId: grant.tool_id,
            planId: grant.plan_id,
            subscriptionId: subscription.id,
            trialCredits: grant.trial_credits,
            trialEnd: subscription.trial_end ?? null,
          });
        }
        continue;
      }

      await this.grantPlanCredits({
        orgId: subscription.organization_id,
        toolId: grant.tool_id,
        planId: grant.plan_id,
        subscriptionId: subscription.id,
        periodStart: subscription.current_period_start,
        creditsPerCycle: grant.credits_per_cycle,
        carryOver: grant.carry_over,
        resetInterval: grant.reset_interval,
        force: opts?.force,
        // next_reset_at is derived from grant.reset_interval inside
        // grantPlanCredits — do not pass the Stripe period_end here, it is the
        // billing cadence, not the credit reset cadence.
      });
    }
  }

  /**
   * Applies cancellation-style teardown to all credit grants attached to the
   * given (planId | bundleId) — used on a plan switch to clear out the OLD
   * plan's credits before granting the NEW plan's. The user did not cancel
   * (they upgraded/downgraded/switched), so KEEP_TILL_GRANT_PERIOD_END is
   * reduced to FORFEIT_IMMEDIATE: the OLD grant's cadence is no longer
   * meaningful once the subscription has been moved onto a new plan, and the
   * cron tail sweeper would never trigger because the subscription stays
   * ACTIVE. FORFEIT_IMMEDIATE and KEEP_FOREVER behave normally.
   */
  public async applyPlanSwitchTeardown(params: {
    orgId: string;
    subscriptionId: string;
    oldPlanId?: string | null;
    oldBundleId?: string | null;
  }): Promise<void> {
    const { orgId, subscriptionId, oldPlanId, oldBundleId } = params;
    const planIds = new Set<string>();
    if (oldPlanId) planIds.add(oldPlanId);
    if (oldBundleId) {
      const bps = await BundlePlan.findAll({
        where: { bundle_id: oldBundleId },
        attributes: ['plan_id'],
      });
      for (const bp of bps) planIds.add(bp.plan_id);
    }
    if (planIds.size === 0) return;

    const grants = await PlanCreditGrant.findAll({
      where: { plan_id: { [Op.in]: Array.from(planIds) } },
    });
    for (const grant of grants) {
      const policy =
        grant.on_cancel === CreditOnCancel.KEEP_TILL_GRANT_PERIOD_END
          ? CreditOnCancel.FORFEIT_IMMEDIATE
          : grant.on_cancel;
      await this.applyCancellationPolicy({
        orgId,
        toolId: grant.tool_id,
        planId: grant.plan_id,
        subscriptionId,
        policy,
      });
    }
  }

  /**
   * Iterates credit grants for a canceled subscription and applies the per-grant
   * on_cancel policy.
   */
  public async applySubscriptionCancellation(subscription: Subscription): Promise<void> {
    const planIds = new Set<string>();
    if (subscription.plan_id) planIds.add(subscription.plan_id);
    if (subscription.bundle_id) {
      const bundlePlans = await BundlePlan.findAll({
        where: { bundle_id: subscription.bundle_id },
        attributes: ['plan_id'],
      });
      for (const bp of bundlePlans) planIds.add(bp.plan_id);
    }
    if (planIds.size === 0) return;

    const grants = await PlanCreditGrant.findAll({
      where: { plan_id: { [Op.in]: Array.from(planIds) } },
    });
    for (const grant of grants) {
      await this.applyCancellationPolicy({
        orgId: subscription.organization_id,
        toolId: grant.tool_id,
        planId: grant.plan_id,
        subscriptionId: subscription.id,
        policy: grant.on_cancel,
      });
    }
  }

  // =====================
  // PLAN GRANT CHANGE PROPAGATION
  // =====================

  /**
   * Finds active subscriptions that include `planId` — either directly via plan_id
   * or indirectly via a bundle that contains this plan.
   */
  private async findActiveSubscriptionsForPlan(planId: string): Promise<Subscription[]> {
    const direct = await Subscription.findAll({
      where: { plan_id: planId, status: { [Op.in]: ACTIVE_SUB_STATUSES } },
    });

    const bundleRows = await BundlePlan.findAll({
      where: { plan_id: planId },
      attributes: ['bundle_id'],
    });
    const bundleIds = bundleRows.map((b) => b.bundle_id);
    const viaBundle = bundleIds.length
      ? await Subscription.findAll({
          where: { bundle_id: { [Op.in]: bundleIds }, status: { [Op.in]: ACTIVE_SUB_STATUSES } },
        })
      : [];

    const byId = new Map<string, Subscription>();
    for (const s of [...direct, ...viaBundle]) byId.set(s.id, s);
    return Array.from(byId.values());
  }

  /**
   * Propagates an admin edit to a (plan, tool) credit grant to all existing active
   * subscribers on that plan (or on bundles that include the plan).
   *
   * - Only positive deltas are applied instantly:
   *     - delta = newCreditsPerCycle - oldCreditsPerCycle (if > 0) is added to each
   *       subscriber's plan_balance for the given tool.
   *     - delta_trial = newTrialCredits - oldTrialCredits (if > 0) is added only to
   *       subscribers currently in `trialing` status.
   *   Reductions (delta < 0) deliberately take effect on the next renewal cycle —
   *   existing users keep what they already have for the current period and the
   *   lower amount is granted naturally on the next billing cycle.
   * - The reset_interval / carry_over / on_cancel fields are NOT backfilled: those
   *   take effect on the next renewal or cancellation event.
   */
  public async applyPlanGrantUpdateToSubscribers(params: {
    planId: string;
    toolId: string;
    oldCreditsPerCycle: number;
    newCreditsPerCycle: number;
    oldTrialCredits: number;
    newTrialCredits: number;
    oldResetInterval?: CreditResetInterval;
    newResetInterval?: CreditResetInterval;
    adminUserId: string;
    reason?: string;
  }): Promise<{ affected: number; skipped: number }> {
    const {
      planId,
      toolId,
      oldCreditsPerCycle,
      newCreditsPerCycle,
      oldTrialCredits,
      newTrialCredits,
      oldResetInterval,
      newResetInterval,
      adminUserId,
    } = params;
    const reason = params.reason ?? 'Admin updated plan credit grant';

    // Only positive deltas propagate instantly. Reductions wait for next renewal —
    // the new lower credits_per_cycle/trial_credits will be granted then automatically.
    const rawCycleDelta = newCreditsPerCycle - oldCreditsPerCycle;
    const rawTrialDelta = newTrialCredits - oldTrialCredits;
    const cycleDelta = rawCycleDelta > 0 ? rawCycleDelta : 0;
    const trialDelta = rawTrialDelta > 0 ? rawTrialDelta : 0;
    // reset_interval changes ALSO need to propagate, even with zero credit
    // deltas — otherwise switching MONTHLY→YEARLY leaves existing wallets
    // showing the old monthly boundary until next renewal.
    const resetIntervalChanged =
      !!newResetInterval && newResetInterval !== oldResetInterval;
    if (cycleDelta === 0 && trialDelta === 0 && !resetIntervalChanged) {
      Logger.info(
        `[CreditService] Plan grant update for plan=${planId} tool=${toolId}: no positive deltas and no cadence change (cycleDelta=${rawCycleDelta}, trialDelta=${rawTrialDelta}); reductions defer to next cycle.`,
      );
      return { affected: 0, skipped: 0 };
    }

    const subscriptions = await this.findActiveSubscriptionsForPlan(planId);
    if (subscriptions.length === 0) return { affected: 0, skipped: 0 };

    const changeTs = Date.now();
    let affected = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
      try {
        await sequelize.transaction(async (transaction) => {
          const wallet = await this.lockWallet(sub.organization_id, toolId, transaction);

          const applied =
            cycleDelta + (sub.status === SubStatus.TRIALING ? trialDelta : 0);

          // Recompute next_reset_at from the NEW cadence, anchored to the
          // wallet's existing last_granted_period_start (or the subscription's
          // current_period_start as a fallback).
          if (resetIntervalChanged && newResetInterval) {
            const anchor =
              wallet.last_granted_period_start ?? sub.current_period_start ?? null;
            wallet.next_reset_at = computeNextResetAt(newResetInterval, anchor);
          }

          if (applied <= 0) {
            if (resetIntervalChanged) {
              await wallet.save({ transaction });
              affected += 1;
            } else {
              skipped += 1;
            }
            return;
          }

          wallet.plan_balance += applied;

          // Keep trial-bucket provenance consistent so the cron sweeper
          // (expireUnconvertedTrialCredits) can expire the right amount if the
          // trial ends unconverted. Without this, an admin-added trial delta is
          // invisible to the sweeper.
          if (sub.status === SubStatus.TRIALING && trialDelta > 0) {
            const meta = (wallet.metadata ?? {}) as Record<string, unknown>;
            const existingTrial = (meta.trial ?? {}) as {
              subscription_id?: string;
              trial_end?: string | null;
              granted?: number;
              expired?: boolean;
            };
            meta.trial = {
              subscription_id: existingTrial.subscription_id ?? sub.id,
              trial_end:
                existingTrial.trial_end ??
                (sub.trial_end ? sub.trial_end.toISOString() : null),
              granted: (existingTrial.granted ?? 0) + trialDelta,
              expired: existingTrial.expired ?? false,
            };
            wallet.metadata = meta;
          }

          // Backfill cycle anchors. The wallet may have been created lazily
          // (pre-credit-system subs, or first time this tool gets a grant) with
          // NULL next_reset_at / last_granted_period_start — without these the
          // UI shows "no expiry" and the renewal webhook idempotency gate
          // can't function. last_granted_period_start anchors to the
          // subscription's current_period_start; next_reset_at is derived from
          // the grant cadence (NEW cadence if it just changed, otherwise OLD).
          if (!wallet.last_granted_period_start && sub.current_period_start) {
            wallet.last_granted_period_start = sub.current_period_start;
          }
          if (!wallet.next_reset_at) {
            const cadence = newResetInterval ?? oldResetInterval;
            const anchor =
              wallet.last_granted_period_start ?? sub.current_period_start ?? null;
            wallet.next_reset_at = computeNextResetAt(cadence, anchor);
          }
          await wallet.save({ transaction });

          await CreditLedgerEntry.create(
            {
              organization_id: sub.organization_id,
              tool_id: toolId,
              entry_type: CreditEntryType.ADJUSTMENT,
              bucket: CreditBucket.PLAN,
              amount: applied,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              idempotency_key: `plan_grant_update:${planId}:${toolId}:${changeTs}:${sub.id}`,
              source: 'plan_grant_update',
              related_subscription_id: sub.id,
              related_plan_id: planId,
              admin_user_id: adminUserId,
              reason,
              metadata: {
                raw_cycle_delta: rawCycleDelta,
                raw_trial_delta: rawTrialDelta,
                applied_cycle_delta: cycleDelta,
                applied_trial_delta: sub.status === SubStatus.TRIALING ? trialDelta : 0,
                old_credits_per_cycle: oldCreditsPerCycle,
                new_credits_per_cycle: newCreditsPerCycle,
                old_trial_credits: oldTrialCredits,
                new_trial_credits: newTrialCredits,
                sub_status: sub.status,
                note: 'reductions deferred to next cycle',
              },
            },
            { transaction },
          );

          affected += 1;
        });
      } catch (e) {
        Logger.error(
          `[CreditService] applyPlanGrantUpdateToSubscribers failed for sub=${sub.id}`,
          e,
        );
        skipped += 1;
      }
    }

    Logger.info(
      `[CreditService] Plan grant update propagated for plan=${planId} tool=${toolId}: affected=${affected} skipped=${skipped} cycleDelta=${cycleDelta} trialDelta=${trialDelta}`,
    );
    return { affected, skipped };
  }

  /**
   * Propagates the removal of a (plan, tool) credit grant to active subscribers.
   *
   * - action = 'forfeit' (default): expire remaining plan_balance for this tool on
   *   each active subscriber (since no future grants will arrive for this tool from
   *   this plan).
   * - action = 'keep': leave existing balances untouched; the only effect is that
   *   no further grants will be issued (handled implicitly by the grant row being gone).
   *
   * Note: plan_balance is per (org, tool). If another active plan grants credits to
   * the same tool, this still expires the full balance — there is no per-grant
   * provenance on plan_balance. That is intentional: keeping it would be confusing
   * to admins. In practice an org has one subscription, so this matches expectations.
   */
  public async applyPlanGrantDeletionToSubscribers(params: {
    planId: string;
    toolId: string;
    action: 'forfeit' | 'keep';
    adminUserId: string;
    reason?: string;
  }): Promise<{ affected: number; skipped: number }> {
    const { planId, toolId, action, adminUserId } = params;
    const reason = params.reason ?? 'Admin deleted plan credit grant';

    if (action === 'keep') return { affected: 0, skipped: 0 };

    const subscriptions = await this.findActiveSubscriptionsForPlan(planId);
    if (subscriptions.length === 0) return { affected: 0, skipped: 0 };

    const changeTs = Date.now();
    let affected = 0;
    let skipped = 0;

    for (const sub of subscriptions) {
      try {
        await sequelize.transaction(async (transaction) => {
          const wallet = await this.lockWallet(sub.organization_id, toolId, transaction);
          if (wallet.plan_balance <= 0) {
            skipped += 1;
            return;
          }
          const expired = wallet.plan_balance;
          wallet.plan_balance = 0;
          await wallet.save({ transaction });

          await CreditLedgerEntry.create(
            {
              organization_id: sub.organization_id,
              tool_id: toolId,
              entry_type: CreditEntryType.EXPIRE,
              bucket: CreditBucket.PLAN,
              amount: -expired,
              balance_after_plan: wallet.plan_balance,
              balance_after_purchased: wallet.purchased_balance,
              idempotency_key: `plan_grant_delete:${planId}:${toolId}:${changeTs}:${sub.id}`,
              source: 'plan_grant_delete',
              related_subscription_id: sub.id,
              related_plan_id: planId,
              admin_user_id: adminUserId,
              reason,
              metadata: { expired_credits: expired },
            },
            { transaction },
          );

          affected += 1;
        });
      } catch (e) {
        Logger.error(
          `[CreditService] applyPlanGrantDeletionToSubscribers failed for sub=${sub.id}`,
          e,
        );
        skipped += 1;
      }
    }

    Logger.info(
      `[CreditService] Plan grant deletion propagated for plan=${planId} tool=${toolId}: affected=${affected} skipped=${skipped}`,
    );
    return { affected, skipped };
  }

  // =====================
  // Reads
  // =====================

  public async getWallet(orgId: string, toolSlugOrId: string): Promise<CreditWallet | null> {
    const toolId = await this.resolveToolId(toolSlugOrId);
    return CreditWallet.findOne({
      where: { organization_id: orgId, tool_id: toolId },
      include: [{ model: Tool, as: 'tool' }],
    });
  }

  public async getWallets(orgId: string): Promise<CreditWallet[]> {
    return CreditWallet.findAll({
      where: { organization_id: orgId },
      include: [{ model: Tool, as: 'tool' }],
      order: [[{ model: Tool, as: 'tool' }, 'name', 'ASC']],
    });
  }

  public async getLedger(params: {
    orgId: string;
    toolSlugOrId: string;
    cursor?: number | null;
    limit?: number;
  }): Promise<{ entries: CreditLedgerEntry[]; next_cursor: number | null }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const toolId = await this.resolveToolId(params.toolSlugOrId);
    const where: Record<string, unknown> = {
      organization_id: params.orgId,
      tool_id: toolId,
    };
    if (params.cursor) {
      where.id = { [Op.lt]: params.cursor };
    }
    const entries = await CreditLedgerEntry.findAll({
      where,
      order: [['id', 'DESC']],
      limit: limit + 1,
    });
    const hasMore = entries.length > limit;
    const slice = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;
    return { entries: slice, next_cursor: nextCursor };
  }
}

export const creditService = new CreditService();
