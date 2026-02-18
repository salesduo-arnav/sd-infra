import cron from 'node-cron';
import { Op } from 'sequelize';
import { Subscription } from '../models/subscription';
import { SystemConfig } from '../models/system_config';
import { SubStatus } from '../models/enums';
import { stripeService } from './stripe.service';
import { AuditService } from './audit.service';
import Logger from '../utils/logger';

export class CronService {
    // Start Cron Jobs
    public startJobs() {
        Logger.info('Initializing Cron Jobs...');

        // Run every day at 00:00
        cron.schedule('0 0 * * *', async () => {
            Logger.info('[Cron] Starting check for past_due subscriptions...');
            await this.checkAndCancelPastDueSubscriptions();
        });

        Logger.info('Cron Jobs scheduled.');
    }

    public async checkAndCancelPastDueSubscriptions() {
        try {
            // 1. Get Grace Period from Config (Default to 3 days if not set)
            const config = (await SystemConfig.findByPk('payment_grace_period_days')) as SystemConfig | null;
            const gracePeriodDays = config ? parseInt(config.value, 10) : 3;

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
}

export const cronService = new CronService();
