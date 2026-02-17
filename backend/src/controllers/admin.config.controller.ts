import { Request, Response } from 'express';
import { SystemConfig } from '../models/system_config';
import { stripeService } from '../services/stripe.service';

export const getConfigs = async (req: Request, res: Response) => {
  try {
    const configs = await SystemConfig.findAll();
    res.json({ configs });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching configurations', error });
  }
};

export const updateConfig = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, description, category } = req.body;

    const [config, created] = await SystemConfig.upsert({
      key,
      value,
      description,
      category,
    });

    // Side effect: Update Stripe if grace period changes
    if (key === 'payment_grace_period_days') {
        const days = parseInt(value, 10);
        if (!isNaN(days)) {
            // Best effort update to Stripe
            try {
                // In a real scenario, this might update a specific Stripe configuration
                console.log(`[AdminConfig] Updating Stripe grace period to ${days} days`);
                await stripeService.updateGracePeriod(days);
            } catch (stripeError) {
                console.error('Failed to update Stripe grace period', stripeError);
                // We don't fail the request, just log the warning
            }
        }
    }

    res.json({ config, message: 'Configuration updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating configuration', error });
  }
};
