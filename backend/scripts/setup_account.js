/**
 * Setup or update an SP-API integration account with encrypted credentials.
 *
 * Usage:
 *   node scripts/setup_account.js \
 *     --name "Account Name" \
 *     --type sc|vc \
 *     --refresh-token "Atzr|..." \
 *     --selling-partner-id "A1B2C3D4E5" \
 *     --vendor-codes "CODE1,CODE2"          # VC only, comma-separated
 *     --org-id "uuid"                       # optional, defaults to Kyocera org
 *     --region "US"                         # optional, defaults to US
 *
 * Examples:
 *   # SC account:
 *   node scripts/setup_account.js \
 *     --name "Kyocera" \
 *     --type sc \
 *     --refresh-token "Atzr|IwEBIPk..." \
 *     --selling-partner-id "A3NX6VTLG0STLM"
 *
 *   # VC account:
 *   node scripts/setup_account.js \
 *     --name "The Pencil Grip" \
 *     --type vc \
 *     --refresh-token "Atzr|IwEBIGd..." \
 *     --selling-partner-id "ATVPDKIKX0DER" \
 *     --vendor-codes "ABCDE,FGHIJ"
 */

const crypto = require('crypto');
const path = require('path');
const { Client } = require('pg');

// ── Load .env ────────────────────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ── Encryption (same as src/utils/encryption.ts) ─────────────────────
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_HEX) {
    console.error('ERROR: ENCRYPTION_KEY not set in .env');
    process.exit(1);
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');

function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// ── Parse args ───────────────────────────────────────────────────────
function getArg(flag, defaultValue) {
    const idx = process.argv.indexOf(flag);
    if (idx === -1 || !process.argv[idx + 1]) return defaultValue;
    return process.argv[idx + 1];
}

const name = getArg('--name');
const type = getArg('--type');                                          // sc or vc
const refreshToken = getArg('--refresh-token');
const sellingPartnerId = getArg('--selling-partner-id');
const vendorCodesRaw = getArg('--vendor-codes', '');                    // comma-separated
const orgId = getArg('--org-id', '50de7f1f-1e43-4320-a7f4-0b5ae119db33');
const region = getArg('--region', 'US');

// ── Validate ─────────────────────────────────────────────────────────
if (!name || !type || !refreshToken || !sellingPartnerId) {
    console.error(`
Usage: node scripts/setup_account.js \\
  --name "Account Name" \\
  --type sc|vc \\
  --refresh-token "Atzr|..." \\
  --selling-partner-id "A1B2C3D4E5" \\
  --vendor-codes "CODE1,CODE2"        # VC only
  --org-id "uuid"                     # optional
  --region "US"                       # optional
`);
    process.exit(1);
}

if (type === 'vc' && !vendorCodesRaw) {
    console.warn('WARNING: VC account without --vendor-codes. Auto-resolution will be attempted at sync time.');
}

const MARKETPLACE_IDS = {
    US: 'ATVPDKIKX0DER', CA: 'A2EUQ1WTGCTBG2', MX: 'A1AM78C64UM0Y8',
    UK: 'A1F83G8C2ARO7P', DE: 'A1PA6795UKMFR9', FR: 'A13V1IB3VIYZZH',
    IN: 'A21TJRUUN4KGV', JP: 'A1VC38T7YXB528', AU: 'A39IBJ37TRP1C6',
};

const integrationType = type === 'vc' ? 'sp_api_vc' : 'sp_api_sc';
const marketplaceId = MARKETPLACE_IDS[region] || MARKETPLACE_IDS.US;
const vendorCodes = vendorCodesRaw ? vendorCodesRaw.split(',').map(c => c.trim()) : null;

// ── Main ─────────────────────────────────────────────────────────────
(async () => {
    // Encrypt credentials
    const creds = JSON.stringify({
        refresh_token: refreshToken,
        selling_partner_id: sellingPartnerId,
        marketplace_id: marketplaceId,
        token_type: 'bearer',
        obtained_at: new Date().toISOString(),
    });
    const credentialsJson = JSON.stringify({ encrypted: encrypt(creds) });

    const client = new Client({
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE || 'mydb',
        user: process.env.PGUSER || 'myuser',
        password: process.env.PGPASSWORD || 'mypassword',
    });
    await client.connect();

    try {
        // Check if account exists
        const existing = await client.query(
            `SELECT id FROM integration_accounts
             WHERE organization_id = $1 AND account_name = $2 AND integration_type = $3 AND deleted_at IS NULL`,
            [orgId, name, integrationType]
        );

        if (existing.rows.length > 0) {
            const id = existing.rows[0].id;
            await client.query(
                `UPDATE integration_accounts
                 SET credentials = $1::jsonb,
                     seller_id = $2,
                     marketplace_id = $3,
                     vendor_codes = $4::jsonb,
                     status = 'connected',
                     connected_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $5`,
                [credentialsJson, sellingPartnerId, marketplaceId, vendorCodes ? JSON.stringify(vendorCodes) : null, id]
            );
            console.log(`\nUpdated existing account: ${id}`);
        } else {
            const id = crypto.randomUUID();
            await client.query(
                `INSERT INTO integration_accounts
                 (id, organization_id, account_name, marketplace, region, integration_type, status, credentials, seller_id, marketplace_id, vendor_codes, connected_at, created_at, updated_at)
                 VALUES ($1, $2, $3, 'amazon', $4, $5, 'connected', $6::jsonb, $7, $8, $9::jsonb, NOW(), NOW(), NOW())`,
                [id, orgId, name, region, integrationType, credentialsJson, sellingPartnerId, marketplaceId, vendorCodes ? JSON.stringify(vendorCodes) : null]
            );
            console.log(`\nCreated new account: ${id}`);
        }

        // Show all accounts for this org
        const accounts = await client.query(
            `SELECT id, account_name, integration_type, region, status, vendor_codes, seller_id, marketplace_id
             FROM integration_accounts WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
            [orgId]
        );
        console.log(`\nAccounts for org ${orgId}:\n`);
        console.table(accounts.rows.map(r => ({
            name: r.account_name,
            type: r.integration_type,
            region: r.region,
            status: r.status,
            seller_id: r.seller_id || '-',
            marketplace_id: r.marketplace_id || '-',
            vendor_codes: r.vendor_codes ? r.vendor_codes.join(', ') : '-',
        })));
    } finally {
        await client.end();
    }
})().catch(e => { console.error(e); process.exit(1); });
