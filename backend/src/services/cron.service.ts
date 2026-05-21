import cron from 'node-cron';
import { Op } from 'sequelize';
import { Subscription } from '../models/subscription';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { CreditReservation } from '../models/credit_reservation';
import { CreditWallet } from '../models/credit_wallet';
import { CreditLedgerEntry } from '../models/credit_ledger';
import { PlanCreditGrant } from '../models/plan_credit_grant';
import { Plan } from '../models/plan';
import { BundlePlan } from '../models/bundle_plan';
import {
  SubStatus,
  FeatureResetPeriod,
  CreditReservationStatus,
  CreditOnCancel,
  CreditBucket,
  CreditEntryType,
} from '../models/enums';
import { stripeService } from './stripe.service';
import { entitlementService } from './entitlement.service';
import { creditService } from './credit.service';
import { AuditService } from './audit.service';
import sequelize from '../config/db';
import Logger from '../utils/logger';
import redisClient from '../config/redis';
import { configService } from './config.service';

export class CronService {
    // Start Cron Jobs
    public startJobs() {
        Logger.info('Initializing Cron Jobs...');

        const cancelSchedule = configService.get('cron_cancel_past_due', '00 00 * * *')!;
        const resetSchedule = configService.get('cron_reset_entitlements', '00 01 * * *')!;
        const sweepReservationsSchedule = configService.get('cron_sweep_credit_reservations', '*/5 * * * *')!;
        const creditCancellationSchedule = configService.get('cron_credit_cancellation_tail', '0 * * * *')!;
        const creditTrialExpirySchedule = configService.get('cron_credit_trial_expiry', '30 02 * * *')!;

        cron.schedule(cancelSchedule, async () => {
            Logger.info('[Cron] Starting check for past_due subscriptions...');
            await this.checkAndCancelPastDueSubscriptions();
        });

        cron.schedule(resetSchedule, async () => {
            Logger.info('[Cron] Starting entitlement usage reset check...');
            await this.resetEntitlementUsage();
        });

        cron.schedule(sweepReservationsSchedule, async () => {
            await this.sweepExpiredCreditReservations();
        });

        cron.schedule(creditCancellationSchedule, async () => {
            await this.processCreditCancellationTail();
        });

        cron.schedule(creditTrialExpirySchedule, async () => {
            await this.expireUnconvertedTrialCredits();
        });

        Logger.info(
            `Cron Jobs scheduled. Cancel past-due: "${cancelSchedule}", Reset entitlements: "${resetSchedule}", ` +
            `Credit sweep: "${sweepReservationsSchedule}", Credit cancel tail: "${creditCancellationSchedule}", Trial credit expiry: "${creditTrialExpirySchedule}"`,
        );
    }

    /**
     * Releases reservations whose TTL has passed. Marks them `expired` (not `released`)
     * so we can distinguish in the ledger.
     */
    public async sweepExpiredCreditReservations() {
        try {
            const lockKey = 'cron:lock:sweepExpiredCreditReservations';
            const acquired = await redisClient.set(lockKey, 'locked', { NX: true, EX: 240 });
            if (!acquired) {
                Logger.debug('[Cron] sweepExpiredCreditReservations skipped (locked)');
                return;
            }

            const now = new Date();
            const stale = await CreditReservation.findAll({
                where: {
                    status: CreditReservationStatus.HELD,
                    expires_at: { [Op.lt]: now },
                },
                limit: 200,
                order: [['expires_at', 'ASC']],
            });

            if (stale.length === 0) return;

            Logger.info(`[Cron] Releasing ${stale.length} expired credit reservations`);
            let releasedCount = 0;
            for (const reservation of stale) {
                try {
                    await creditService.releaseReservation({
                        reservationId: reservation.id,
                        cause: 'sweeper',
                    });
                    releasedCount++;
                } catch (err) {
                    Logger.error(`[Cron] Failed to release reservation ${reservation.id}`, err);
                }
            }
            if (releasedCount > 0) {
                await AuditService.log({
                    action: 'CREDIT_RESERVATIONS_EXPIRED',
                    entityType: 'System',
                    entityId: 'cron',
                    details: { actor: 'system_cron', count: releasedCount },
                });
            }
        } catch (error) {
            Logger.error('[Cron] sweepExpiredCreditReservations error', error);
        }
    }

    /**
     * Expires plan credits for canceled subscriptions whose grant uses
     * `keep_till_grant_period_end`, once each wallet's own next_reset_at
     * (driven by grant.reset_interval, NOT the Stripe billing cycle) has
     * elapsed. Wallets whose grant has reset_interval='never' (next_reset_at
     * is null) are skipped — that combination is rejected at the admin layer
     * and behaves as keep_forever for any legacy rows.
     */
    public async processCreditCancellationTail() {
        try {
            const lockKey = 'cron:lock:processCreditCancellationTail';
            const acquired = await redisClient.set(lockKey, 'locked', { NX: true, EX: 240 });
            if (!acquired) return;

            const now = new Date();
            const canceledSubs = await Subscription.findAll({
                where: {
                    status: SubStatus.CANCELED,
                },
                limit: 200,
            });

            for (const sub of canceledSubs) {
                try {
                    // Resolve plans (direct + bundle)
                    const planIds = new Set<string>();
                    if (sub.plan_id) planIds.add(sub.plan_id);
                    if (sub.bundle_id) {
                        const bundlePlans = await BundlePlan.findAll({
                            where: { bundle_id: sub.bundle_id },
                            attributes: ['plan_id'],
                        });
                        for (const bp of bundlePlans) planIds.add(bp.plan_id);
                    }
                    if (planIds.size === 0) continue;

                    const grants = await PlanCreditGrant.findAll({
                        where: {
                            plan_id: { [Op.in]: Array.from(planIds) },
                            on_cancel: CreditOnCancel.KEEP_TILL_GRANT_PERIOD_END,
                        },
                    });

                    for (const grant of grants) {
                        const wallet = await CreditWallet.findOne({
                            where: { organization_id: sub.organization_id, tool_id: grant.tool_id },
                        });
                        if (!wallet || wallet.plan_balance === 0) continue;

                        // Sweep only after the grant's own cadence boundary has
                        // elapsed. Null next_reset_at means there is no cadence
                        // (reset_interval='never') — leave the credits alone.
                        if (!wallet.next_reset_at || wallet.next_reset_at > now) continue;

                        const meta = (wallet.metadata ?? {}) as Record<string, unknown>;
                        const cancelMark = `cancel_tail:${sub.id}`;
                        if (meta[cancelMark]) continue; // Already processed

                        await sequelize.transaction(async (transaction) => {
                            const w = await CreditWallet.findOne({
                                where: { id: wallet.id },
                                transaction,
                                lock: transaction.LOCK.UPDATE,
                            });
                            if (!w || w.plan_balance === 0) return;
                            if (!w.next_reset_at || w.next_reset_at > now) return;
                            const expired = w.plan_balance;
                            w.plan_balance = 0;
                            w.next_reset_at = null;
                            w.last_granted_period_start = null;
                            const wMeta = (w.metadata ?? {}) as Record<string, unknown>;
                            wMeta[cancelMark] = new Date().toISOString();
                            w.metadata = wMeta;
                            await w.save({ transaction });
                            await CreditLedgerEntry.create(
                                {
                                    organization_id: w.organization_id,
                                    tool_id: w.tool_id,
                                    entry_type: CreditEntryType.EXPIRE,
                                    bucket: CreditBucket.PLAN,
                                    amount: -expired,
                                    balance_after_plan: w.plan_balance,
                                    balance_after_purchased: w.purchased_balance,
                                    source: 'sweeper',
                                    related_subscription_id: sub.id,
                                    related_plan_id: grant.plan_id,
                                    metadata: { reason: 'cancel_keep_till_grant_period_end' },
                                },
                                { transaction },
                            );
                        });
                        Logger.info(
                            `[Cron] Forfeited plan credits for org=${sub.organization_id} tool=${grant.tool_id} on grant-period-end cancel-tail`,
                        );
                    }
                } catch (err) {
                    Logger.error(`[Cron] processCreditCancellationTail sub ${sub.id}`, err);
                }
            }
        } catch (error) {
            Logger.error('[Cron] processCreditCancellationTail error', error);
        }
    }

    /**
     * Expires trial credits from wallets where the trial ended without converting.
     */
    public async expireUnconvertedTrialCredits() {
        try {
            const lockKey = 'cron:lock:expireUnconvertedTrialCredits';
            const acquired = await redisClient.set(lockKey, 'locked', { NX: true, EX: 240 });
            if (!acquired) return;

            // Find wallets with metadata.trial.subscription_id where that subscription is no longer trialing
            const wallets = await CreditWallet.findAll({
                where: { plan_balance: { [Op.gt]: 0 } },
                limit: 500,
            });
            for (const wallet of wallets) {
                try {
                    const meta = (wallet.metadata ?? {}) as Record<string, unknown>;
                    const trial = meta.trial as
                        | { subscription_id?: string; trial_end?: string | null; granted?: number; expired?: boolean }
                        | undefined;
                    if (!trial || trial.expired || !trial.subscription_id || !trial.granted) continue;

                    const trialEnd = trial.trial_end ? new Date(trial.trial_end) : null;
                    if (!trialEnd || trialEnd > new Date()) continue;

                    // Check subscription status — if it's still trialing or has converted to active, skip
                    const sub = await Subscription.findByPk(trial.subscription_id);
                    if (!sub) continue;
                    if (sub.status === SubStatus.TRIALING) continue;
                    if (sub.status === SubStatus.ACTIVE) {
                        // Trial converted; just mark expired so we don't keep checking
                        meta.trial = { ...trial, expired: true };
                        wallet.metadata = meta;
                        await wallet.save();
                        continue;
                    }

                    // Trial ended without conversion — expire remaining trial credits
                    await sequelize.transaction(async (transaction) => {
                        const w = await CreditWallet.findOne({
                            where: { id: wallet.id },
                            transaction,
                            lock: transaction.LOCK.UPDATE,
                        });
                        if (!w) return;
                        const remaining = Math.min(w.plan_balance, trial.granted ?? 0);
                        if (remaining <= 0) {
                            const m = (w.metadata ?? {}) as Record<string, unknown>;
                            m.trial = { ...(m.trial as object | undefined), expired: true };
                            w.metadata = m;
                            await w.save({ transaction });
                            return;
                        }
                        w.plan_balance -= remaining;
                        const m = (w.metadata ?? {}) as Record<string, unknown>;
                        m.trial = { ...(m.trial as object | undefined), expired: true };
                        w.metadata = m;
                        await w.save({ transaction });
                        await CreditLedgerEntry.create(
                            {
                                organization_id: w.organization_id,
                                tool_id: w.tool_id,
                                entry_type: CreditEntryType.EXPIRE,
                                bucket: CreditBucket.TRIAL,
                                amount: -remaining,
                                balance_after_plan: w.plan_balance,
                                balance_after_purchased: w.purchased_balance,
                                source: 'trial_expiry',
                                related_subscription_id: trial.subscription_id,
                                metadata: { reason: 'trial_unconverted' },
                            },
                            { transaction },
                        );
                    });
                    Logger.info(
                        `[Cron] Expired trial credits for org=${wallet.organization_id} tool=${wallet.tool_id}`,
                    );
                } catch (err) {
                    Logger.error(`[Cron] trial credit expiry failed for wallet ${wallet.id}`, err);
                }
            }
        } catch (error) {
            Logger.error('[Cron] expireUnconvertedTrialCredits error', error);
        }
    }

    public async checkAndCancelPastDueSubscriptions() {
        try {
            const lockKey = 'cron:lock:checkAndCancelPastDueSubscriptions';

            // Acquire lock (NX = Set only if not exists, EX = expire in 300 seconds)
            const acquired = await redisClient.set(lockKey, 'locked', { NX: true, EX: 300 });

            if (!acquired) {
                Logger.info('[Cron] checkAndCancelPastDueSubscriptions job is already running or ran recently. Skipping...');
                return;
            }

            // 1. Get Grace Period from Config (Default to 3 days if not set)
            const gracePeriodDays = configService.getNumber('payment_grace_period_days', 3);

            // 2. Calculate Cutoff Date
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

            Logger.info(`[Cron] Checking for subscriptions past due before ${cutoffDate.toISOString()} (Grace period: ${gracePeriodDays} days)`);

            // 3. Find Subscriptions to Cancel
            const overdueSubscriptions = await Subscription.findAll({
                where: {
                    status: SubStatus.PAST_DUE,
                    last_payment_failure_at: {
                        [Op.lt]: cutoffDate, // Less than cutoff date (older)
                        [Op.ne]: null // Not null
                    }
                }
            });

            if (overdueSubscriptions.length === 0) {
                Logger.info('[Cron] No overdue subscriptions found.');
                return;
            }

            Logger.info(`[Cron] Found ${overdueSubscriptions.length} overdue subscriptions to cancel.`);

            // 4. Cancel Each Subscription
            for (const sub of overdueSubscriptions) {
                try {
                    Logger.info(`[Cron] Processing cancellation for Subscription ID: ${sub.id}, Stripe ID: ${sub.stripe_subscription_id}`);

                    if (sub.stripe_subscription_id) {
                        try {
                            // Cancel in Stripe
                            await stripeService.cancelSubscriptionImmediately(sub.stripe_subscription_id);
                            Logger.info(`[Cron] Stripe subscription ${sub.stripe_subscription_id} cancelled.`);
                        } catch (stripeError) {
                            Logger.error(`[Cron] Failed to cancel Stripe subscription ${sub.stripe_subscription_id}:`, stripeError);
                            // Continue to update local status even if Stripe fails (or if it's already cancelled in Stripe)
                            // We proceed to cancel locally so access is revoked.
                        }
                    }

                    // Update Local State
                    await sub.update({
                        status: SubStatus.CANCELED,
                        cancellation_reason: 'auto_cancel_past_due'
                    });

                    // Revoke entitlements scoped to this subscription's tool(s)
                    try {
                        await entitlementService.revokeEntitlements(sub.organization_id, sub.plan_id, sub.bundle_id);
                    } catch (provErr) {
                        Logger.error(`[Cron] Failed to revoke entitlements for org ${sub.organization_id}:`, provErr);
                    }

                    // Log Audit
                    await AuditService.log({
                        action: 'AUTO_CANCEL_SUBSCRIPTION',
                        entityType: 'Subscription',
                        entityId: sub.id,
                        details: {
                            actor: 'system_cron',
                            reason: 'Payment grace period exceeded',
                            gracePeriodDays,
                            last_payment_failure: sub.last_payment_failure_at,
                            stripe_subscription_id: sub.stripe_subscription_id
                        }
                    });

                    Logger.info(`[Cron] Successfully cancelled subscription ${sub.id}`);

                } catch (err) {
                    Logger.error(`[Cron] Error processing subscription ${sub.id}:`, err);
                }
            }

        } catch (error) {
            Logger.error('[Cron] Error in checkAndCancelPastDueSubscriptions:', error);
        }
    }

    public async resetEntitlementUsage() {
        try {
            const lockKey = 'cron:lock:resetEntitlementUsage';

            const acquired = await redisClient.set(lockKey, 'locked', { NX: true, EX: 300 });
            if (!acquired) {
                Logger.info('[Cron] resetEntitlementUsage job is already running or ran recently. Skipping...');
                return;
            }

            const now = new Date();

            // Calculate cutoff dates from admin-configurable reset periods
            const monthlyDays = configService.getNumber('feature_reset_monthly_days', 30);
            const yearlyDays = configService.getNumber('feature_reset_yearly_days', 365);
            const thirtyDaysAgo = new Date(now.getTime() - (monthlyDays * 24 * 60 * 60 * 1000));
            const oneYearAgo = new Date(now.getTime() - (yearlyDays * 24 * 60 * 60 * 1000));

            // Find all entitlements that need resetting
            // 1. Monthly resets older than 30 days that have usage > 0 
            // 2. Yearly resets older than 365 days that have usage > 0
            const entitlementsToReset = await OrganizationEntitlement.findAll({
                where: {
                    [Op.or]: [
                        {
                            reset_period: FeatureResetPeriod.MONTHLY,
                            last_reset_at: { [Op.lt]: thirtyDaysAgo },
                            usage_amount: { [Op.gt]: 0 }
                        },
                        {
                            reset_period: FeatureResetPeriod.YEARLY,
                            last_reset_at: { [Op.lt]: oneYearAgo },
                            usage_amount: { [Op.gt]: 0 }
                        }
                    ]
                }
            });

            if (entitlementsToReset.length === 0) {
                Logger.info('[Cron] No entitlements need resetting today.');
                return;
            }

            Logger.info(`[Cron] Found ${entitlementsToReset.length} entitlements to reset.`);

            let resetCount = 0;
            for (const entitlement of entitlementsToReset) {
                try {
                    await entitlement.update({
                        usage_amount: 0,
                        last_reset_at: now
                    });
                    resetCount++;
                } catch (err) {
                    Logger.error(`[Cron] Failed to reset entitlement ${entitlement.id}:`, err);
                }
            }

            if (resetCount > 0) {
                await AuditService.log({
                    action: 'ENTITLEMENTS_RESET',
                    entityType: 'System',
                    entityId: 'cron',
                    details: {
                        actor: 'system_cron',
                        count: resetCount
                    }
                });
                Logger.info(`[Cron] Successfully reset ${resetCount} entitlements.`);
            }

        } catch (error) {
            Logger.error('[Cron] Error in resetEntitlementUsage:', error);
        }
    }
}

export const cronService = new CronService();
