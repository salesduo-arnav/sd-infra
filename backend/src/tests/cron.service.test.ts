import sequelize from '../config/db';
import { cronService } from '../services/cron.service';
import { stripeService } from '../services/stripe.service';
import { AuditService } from '../services/audit.service';
import { Subscription } from '../models/subscription';
import { Organization } from '../models/organization';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { SystemConfig } from '../models/system_config';
import { SubStatus, TierType, PriceInterval } from '../models/enums';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../config/redis';

// Mock Stripe Service
jest.mock('../services/stripe.service', () => ({
    stripeService: {
        cancelSubscription: jest.fn().mockResolvedValue({}),
        cancelSubscriptionImmediately: jest.fn().mockResolvedValue({}),
    },
}));

// Mock Audit Service
jest.mock('../services/audit.service', () => ({
    AuditService: {
        log: jest.fn().mockResolvedValue({}),
    },
}));

describe('CronService', () => {
    let org: Organization;
    let tool: Tool;
    let plan: Plan;

    beforeAll(async () => {
        // Ensure DB connection
        try {
            await sequelize.authenticate();
        } catch (_e) {
            // Already connected or error
            console.log('DB already connected or error:', _e);
        }
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    beforeEach(async () => {
        // Clear DB tables relevant to tests
        await Subscription.destroy({ where: {}, force: true });
        await Plan.destroy({ where: {}, force: true });
        await Tool.destroy({ where: {}, force: true });
        await Organization.destroy({ where: {}, force: true });
        await SystemConfig.destroy({ where: {}, force: true });
        jest.clearAllMocks();

        // Setup Base Data
        org = await Organization.create({
            id: uuidv4(),
            name: 'Test Org',
            slug: `test-org-${Date.now()}`,
            // owner_id not strictly required by model definition unless constraints say so
        });

        tool = await Tool.create({
            id: uuidv4(),
            name: 'Test Tool',
            slug: `test-tool-${Date.now()}`,
            description: 'Desc',
            is_active: true,
            trial_card_required: false,
            trial_days: 14,
            required_integrations: []
        });

        plan = await Plan.create({
            id: uuidv4(),
            name: 'Test Plan',
            tool_id: tool.id,
            tier: TierType.BASIC,
            price: 1000,
            currency: 'usd',
            interval: PriceInterval.MONTHLY,
            active: true
        });
    });

    it('should cancel subscriptions that are past_due and older than grace period', async () => {
        // 1. Set Grace Period Config
        await SystemConfig.create({
            key: 'payment_grace_period_days',
            value: '3',
            category: 'payment'
        });

        // 2. Create Overdue Subscription (10 days ago > 3 days)
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 10);

        const sub = await Subscription.create({
            id: uuidv4(),
            organization_id: org.id,
            plan_id: plan.id,
            status: SubStatus.PAST_DUE,
            stripe_subscription_id: 'sub_overdue_123',
            last_payment_failure_at: pastDate,
            current_period_start: pastDate,
            current_period_end: new Date()
        });

        // 3. Run Cron
        await cronService.checkAndCancelPastDueSubscriptions();

        // 4. Assertions
        const updatedSub = await Subscription.findByPk(sub.id);
        expect(updatedSub?.status).toBe(SubStatus.CANCELED);
        expect(updatedSub?.cancellation_reason).toBe('auto_cancel_past_due');
        expect(stripeService.cancelSubscriptionImmediately).toHaveBeenCalledWith('sub_overdue_123');
        expect(AuditService.log).toHaveBeenCalledWith(expect.objectContaining({
            action: 'AUTO_CANCEL_SUBSCRIPTION',
            entityType: 'Subscription',
            entityId: sub.id,
            details: expect.objectContaining({
                actor: 'system_cron'
            })
        }));
    });

    it('should NOT cancel subscriptions that are past_due but WITHIN grace period', async () => {
        // 1. Set Grace Period Config
        await SystemConfig.create({
            key: 'payment_grace_period_days',
            value: '5',
            category: 'payment'
        });

        // 2. Create Recent Overdue Subscription (2 days ago < 5 days)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 2);

        const sub = await Subscription.create({
            id: uuidv4(),
            organization_id: org.id,
            plan_id: plan.id,
            status: SubStatus.PAST_DUE,
            stripe_subscription_id: 'sub_recent_123',
            last_payment_failure_at: recentDate,
            current_period_start: recentDate,
            current_period_end: new Date()
        });

        // 3. Run Cron
        await cronService.checkAndCancelPastDueSubscriptions();

        // 4. Assertions
        const updatedSub = await Subscription.findByPk(sub.id);
        expect(updatedSub?.status).toBe(SubStatus.PAST_DUE);
        expect(stripeService.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    });

    it('should NOT cancel active subscriptions', async () => {
         // 1. Set Grace Period Config
         await SystemConfig.create({
            key: 'payment_grace_period_days',
            value: '3',
            category: 'payment'
        });

        // 2. Create Active Subscription 
        const sub = await Subscription.create({
            id: uuidv4(),
            organization_id: org.id,
            plan_id: plan.id,
            status: SubStatus.ACTIVE,
            stripe_subscription_id: 'sub_active_123',
            last_payment_failure_at: null, // No failure
            current_period_start: new Date(),
            current_period_end: new Date()
        });

        // 3. Run Cron
        await cronService.checkAndCancelPastDueSubscriptions();

        // 4. Assertions
        const updatedSub = await Subscription.findByPk(sub.id);
        expect(updatedSub?.status).toBe(SubStatus.ACTIVE);
        expect(stripeService.cancelSubscriptionImmediately).not.toHaveBeenCalled();
    });
});
