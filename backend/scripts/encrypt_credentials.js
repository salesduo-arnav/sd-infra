const { encrypt } = require('../dist/utils/encryption');
const { Client } = require('pg');

const REFRESH_TOKEN = process.argv[2];
const SELLING_PARTNER_ID = process.argv[3];
const ACCOUNT_NAME = process.argv[4] || 'Kyocera';

if (!REFRESH_TOKEN || !SELLING_PARTNER_ID) {
  console.error('Usage: node scripts/encrypt_credentials.js <refresh_token> <selling_partner_id> [account_name]');
  process.exit(1);
}

(async () => {
  const creds = JSON.stringify({
    refresh_token: REFRESH_TOKEN,
    selling_partner_id: SELLING_PARTNER_ID,
    marketplace_id: 'ATVPDKIKX0DER',
    token_type: 'bearer',
    obtained_at: new Date().toISOString()
  });
  const encrypted = encrypt(creds);
  const credentialsJson = JSON.stringify({ encrypted });

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'myuser',
    password: 'mypassword'
  });
  await client.connect();

  const res = await client.query(
    `UPDATE integration_accounts SET credentials = $1::jsonb WHERE account_name = $2`,
    [credentialsJson, ACCOUNT_NAME]
  );
  console.log(`${ACCOUNT_NAME} updated: ${res.rowCount} row(s)`);

  await client.end();
})();
