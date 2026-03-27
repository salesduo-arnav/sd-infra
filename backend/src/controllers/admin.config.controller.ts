import { Request, Response } from 'express';
import { SystemConfig } from '../models/system_config';
import { stripeService } from '../services/stripe.service';
import { configService } from '../services/config.service';
import Logger from '../utils/logger';

export const getConfigs = async (req: Request, res: Response) => {
  try {
    const configs = await SystemConfig.findAll();
    res.json({ configs });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching configurations', error });
  }
};

/**
 * Validate a config value based on its key.
 * Returns an error message string if invalid, or null if valid.
 */
const validateConfigValue = (key: string, value: string): string | null => {
  // --- Positive integer validators ---
  const positiveIntKeys: Record<string, { min?: number; max?: number }> = {
    payment_grace_period_days: { min: 0 },
    session_ttl_seconds: { min: 300, max: 604800 },
    invitation_expiry_days: { min: 1, max: 90 },
    feature_reset_monthly_days: { min: 1 },
    feature_reset_yearly_days: { min: 1 },
    org_max_capacity: { min: 1 },
    user_org_limit: { min: 1 },
  };

  if (key in positiveIntKeys) {
    const num = parseInt(value, 10);
    const bounds = positiveIntKeys[key];
    if (isNaN(num)) return `${key} must be a valid integer`;
    if (bounds.min !== undefined && num < bounds.min) return `${key} must be at least ${bounds.min}`;
    if (bounds.max !== undefined && num > bounds.max) return `${key} must be at most ${bounds.max}`;
    return null;
  }

  // --- JSON validators ---
  const jsonKeys = ['marketplace_region_map', 'sc_region_urls', 'vc_region_urls'];
  if (jsonKeys.includes(key)) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return `${key} must be a valid JSON object`;
      }
    } catch {
      return `${key} must be valid JSON`;
    }
    return null;
  }

  // --- Cron expression validators ---
  const cronKeys = ['cron_cancel_past_due', 'cron_reset_entitlements'];
  if (cronKeys.includes(key)) {
    // Basic cron validation: 5 space-separated fields
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) {
      return `${key} must be a valid cron expression with 5 fields (minute hour day month weekday)`;
    }
    return null;
  }

  // --- Hex color validator ---
  if (key === 'brand_color') {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      return 'brand_color must be a valid hex color (e.g., #ff9900)';
    }
    return null;
  }

  // --- Regex validator ---
  if (key === 'password_regex') {
    try {
      new RegExp(value);
    } catch {
      return 'password_regex must be a valid regular expression';
    }
    return null;
  }

  return null;
};

export const updateConfig = async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, description, category } = req.body;

    // Validate the config value
    const validationError = validateConfigValue(key, value);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const [config] = await SystemConfig.upsert({
      key,
      value,
      description,
      category,
    });

    // Refresh the in-memory config cache and notify other instances/services
    await configService.refresh();
    await configService.publishInvalidation();

    // Side effect: Update Stripe if grace period changes
    if (key === 'payment_grace_period_days') {
      const days = parseInt(value, 10);
      if (!isNaN(days)) {
        try {
          Logger.info(`[AdminConfig] Updating Stripe grace period to ${days} days`);
          await stripeService.updateGracePeriod(days);
        } catch (stripeError) {
          Logger.error('Failed to update Stripe grace period', stripeError);
        }
      }
    }

    res.json({ config, message: 'Configuration updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating configuration', error });
  }
};
