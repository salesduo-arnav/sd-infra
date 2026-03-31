'use strict';

const SLACK_CONFIGS = [
  {
    key: 'slack_bot_scopes',
    value: 'chat:write,users:read,users:read.email,channels:read,groups:read,files:write,channels:manage,im:write,channels:join',
    description: 'Comma-separated bot token scopes requested during Slack OAuth. Changes take effect on next workspace connect.',
    category: 'slack',
  },
  {
    key: 'slack_redirect_uri',
    value: 'http://api.lvh.me/integrations/slack/callback',
    description: 'Slack OAuth redirect URI. Must match the URL configured in your Slack App settings.',
    category: 'slack',
  },
  {
    key: 'slack_authorize_url',
    value: 'https://slack.com/oauth/v2/authorize',
    description: 'Slack OAuth authorization endpoint URL.',
    category: 'slack',
  },
  {
    key: 'slack_token_url',
    value: 'https://slack.com/api/oauth.v2.access',
    description: 'Slack OAuth token exchange endpoint URL.',
    category: 'slack',
  },
  {
    key: 'slack_default_channel_name',
    value: 'salesduo-notifications',
    description: 'Name of the channel auto-created when a workspace connects Slack. Must be lowercase, no spaces.',
    category: 'slack',
  },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const rows = SLACK_CONFIGS.map((c) => ({
      ...c,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('system_configs', rows, {
      ignoreDuplicates: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('system_configs', {
      key: SLACK_CONFIGS.map((c) => c.key),
    });
  },
};
