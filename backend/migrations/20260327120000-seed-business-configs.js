'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    await queryInterface.bulkInsert('system_configs', [
      // --- Branding ---
      {
        key: 'brand_name',
        value: 'SalesDuo',
        description: 'Application display name used in emails and UI',
        category: 'branding',
        created_at: now,
        updated_at: now
      },
      {
        key: 'brand_color',
        value: '#ff9900',
        description: 'Primary brand hex color used in emails and UI',
        category: 'branding',
        created_at: now,
        updated_at: now
      },
      {
        key: 'support_email',
        value: 'support@salesduo.com',
        description: 'Support contact email address',
        category: 'branding',
        created_at: now,
        updated_at: now
      },

      // --- Email Subjects ---
      {
        key: 'email_subject_password_reset',
        value: 'Reset Your Password - {brand_name}',
        description: 'Password reset email subject. Supports {brand_name} placeholder.',
        category: 'email',
        created_at: now,
        updated_at: now
      },
      {
        key: 'email_subject_login_otp',
        value: 'Your Login OTP',
        description: 'Login OTP email subject',
        category: 'email',
        created_at: now,
        updated_at: now
      },
      {
        key: 'email_subject_signup_otp',
        value: 'Verify Your Email - {brand_name}',
        description: 'Signup verification email subject. Supports {brand_name} placeholder.',
        category: 'email',
        created_at: now,
        updated_at: now
      },
      {
        key: 'email_subject_invitation',
        value: "You've Been Invited to Join {org_name} on {brand_name}",
        description: 'Org invitation email subject. Supports {brand_name} and {org_name} placeholders.',
        category: 'email',
        created_at: now,
        updated_at: now
      },

      // --- Auth ---
      {
        key: 'invitation_expiry_days',
        value: '7',
        description: 'Number of days until an invitation link expires',
        category: 'auth',
        created_at: now,
        updated_at: now
      },
      {
        key: 'password_regex',
        value: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$',
        description: 'Password strength validation regex pattern',
        category: 'auth',
        created_at: now,
        updated_at: now
      },
      {
        key: 'password_regex_message',
        value: 'Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, and a number.',
        description: 'Human-readable password requirement message shown to users on validation failure',
        category: 'auth',
        created_at: now,
        updated_at: now
      },

      // --- Cron & Entitlements ---
      {
        key: 'cron_cancel_past_due',
        value: '00 00 * * *',
        description: 'Cron schedule for past-due subscription cancellation check (requires restart)',
        category: 'cron',
        created_at: now,
        updated_at: now
      },
      {
        key: 'cron_reset_entitlements',
        value: '00 01 * * *',
        description: 'Cron schedule for entitlement usage reset (requires restart)',
        category: 'cron',
        created_at: now,
        updated_at: now
      },
      {
        key: 'feature_reset_monthly_days',
        value: '30',
        description: 'Number of days for monthly feature usage reset period',
        category: 'entitlement',
        created_at: now,
        updated_at: now
      },
      {
        key: 'feature_reset_yearly_days',
        value: '365',
        description: 'Number of days for yearly feature usage reset period',
        category: 'entitlement',
        created_at: now,
        updated_at: now
      },

      // --- Amazon Integration ---
      {
        key: 'marketplace_region_map',
        value: JSON.stringify({
          us: 'NA', ca: 'NA', mx: 'NA', br: 'NA',
          uk: 'EU', de: 'EU', fr: 'EU', it: 'EU', es: 'EU', nl: 'EU', se: 'EU', tr: 'EU', pl: 'EU', be: 'EU',
          jp: 'FE', au: 'FE', sg: 'FE'
        }),
        description: 'JSON mapping of country codes to Amazon region codes (NA, EU, FE)',
        category: 'integration',
        created_at: now,
        updated_at: now
      },
      {
        key: 'sc_region_urls',
        value: JSON.stringify({
          NA: 'https://sellercentral.amazon.com',
          EU: 'https://sellercentral.amazon.co.uk',
          FE: 'https://sellercentral.amazon.co.jp'
        }),
        description: 'JSON mapping of Amazon region codes to Seller Central base URLs',
        category: 'integration',
        created_at: now,
        updated_at: now
      },
      {
        key: 'vc_region_urls',
        value: JSON.stringify({
          NA: 'https://vendorcentral.amazon.com',
          EU: 'https://vendorcentral.amazon.co.uk',
          FE: 'https://vendorcentral.amazon.co.jp'
        }),
        description: 'JSON mapping of Amazon region codes to Vendor Central base URLs',
        category: 'integration',
        created_at: now,
        updated_at: now
      },
      {
        key: 'amazon_token_url',
        value: 'https://api.amazon.com/auth/o2/token',
        description: 'Amazon OAuth token exchange endpoint URL',
        category: 'integration',
        created_at: now,
        updated_at: now
      },
      {
        key: 'amazon_ads_auth_url',
        value: 'https://www.amazon.com/ap/oa',
        description: 'Amazon Ads OAuth authorization URL',
        category: 'integration',
        created_at: now,
        updated_at: now
      },
      {
        key: 'amazon_ads_scope',
        value: 'advertising::campaign_management',
        description: 'Amazon Ads OAuth scope string',
        category: 'integration',
        created_at: now,
        updated_at: now
      }
    ], {
      ignoreDuplicates: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('system_configs', {
      key: [
        'brand_name', 'brand_color', 'support_email',
        'email_subject_password_reset', 'email_subject_login_otp',
        'email_subject_signup_otp', 'email_subject_invitation',
        'invitation_expiry_days', 'password_regex', 'password_regex_message',
        'cron_cancel_past_due', 'cron_reset_entitlements',
        'feature_reset_monthly_days', 'feature_reset_yearly_days',
        'marketplace_region_map', 'sc_region_urls', 'vc_region_urls',
        'amazon_token_url', 'amazon_ads_auth_url', 'amazon_ads_scope'
      ]
    });
  }
};
