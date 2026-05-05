/**
 * Seed SP-API credentials onto an existing integration_account, bypassing
 * the Amazon OAuth round-trip.
 *
 * Use this when you already have a refresh token (e.g. from another tool,
 * a teammate, or a sandbox app) and just need to inject it into a buybox /
 * core-platform integration_account that was created earlier (status =
 * 'disconnected'). The script writes the credentials in the SAME shape as
 * the real OAuth callback in `src/controllers/sp.controller.ts` so the
 * `/internal/integrations/accounts/:id/credentials` endpoint can decrypt
 * and serve them transparently.
 *
 * Usage (positional):
 *   npx ts-node scripts/seed-sp-api-credentials.ts <account_id> <refresh_token> [selling_partner_id]
 *
 * Usage (named flags, more convenient for long tokens):
 *   npx ts-node scripts/seed-sp-api-credentials.ts \
 *     --account-id=<uuid> \
 *     --refresh-token=Atzr|... \
 *     --selling-partner-id=A3EXAMPLE \
 *     --access-token=Atza|... \
 *     --expires-in=3600
 *
 * Run from the backend directory:
 *   cd sd-core-platform/backend
 *   npx ts-node scripts/seed-sp-api-credentials.ts <account_id> <refresh_token>
 *
 * Requires the same .env that the backend uses (specifically ENCRYPTION_KEY
 * and the PG* connection vars). The encryption key MUST match what the
 * running backend will later use to decrypt — otherwise the credentials
 * round-trip will silently fail.
 */
import path from 'path';
import dotenv from 'dotenv';

// Load .env BEFORE any module that reads process.env at import time
// (sequelize config, encryption util, etc.).
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import sequelize from '../src/config/db';
import { encrypt } from '../src/utils/encryption';
import { IntegrationAccount, IntegrationStatus } from '../src/models/integration_account';

interface ParsedArgs {
    accountId?: string;
    refreshToken?: string;
    sellingPartnerId?: string;
    accessToken?: string;
    expiresIn?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
    const out: ParsedArgs = {};
    const positional: string[] = [];

    for (const arg of argv) {
        if (arg.startsWith('--')) {
            const eq = arg.indexOf('=');
            const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
            const value = eq === -1 ? '' : arg.slice(eq + 1);
            switch (key) {
                case 'account-id':         out.accountId = value; break;
                case 'refresh-token':      out.refreshToken = value; break;
                case 'selling-partner-id': out.sellingPartnerId = value; break;
                case 'access-token':       out.accessToken = value; break;
                case 'expires-in':         out.expiresIn = Number(value); break;
                default:
                    console.warn(`Unknown flag: ${arg}`);
            }
        } else {
            positional.push(arg);
        }
    }

    // Positional fallback: <account_id> <refresh_token> [selling_partner_id]
    if (!out.accountId && positional[0])         out.accountId = positional[0];
    if (!out.refreshToken && positional[1])      out.refreshToken = positional[1];
    if (!out.sellingPartnerId && positional[2])  out.sellingPartnerId = positional[2];

    return out;
}

function usageAndExit(): never {
    console.error(
        [
            'Usage:',
            '  npx ts-node scripts/seed-sp-api-credentials.ts <account_id> <refresh_token> [selling_partner_id]',
            '',
            'Or with named flags:',
            '  npx ts-node scripts/seed-sp-api-credentials.ts \\',
            '    --account-id=<uuid> \\',
            '    --refresh-token=Atzr|... \\',
            '    --selling-partner-id=A3EXAMPLE \\',
            '    [--access-token=Atza|...] \\',
            '    [--expires-in=3600]',
        ].join('\n'),
    );
    process.exit(1);
}

async function listAccountsHelpfully(): Promise<void> {
    const accounts = await IntegrationAccount.findAll({
        attributes: ['id', 'organization_id', 'account_name', 'integration_type', 'status'],
        order: [['created_at', 'DESC']],
        limit: 25,
    });

    if (accounts.length === 0) {
        console.log('\nNo integration accounts exist yet. Create one via the UI or insert one directly.');
        return;
    }

    console.log('\nMost recent integration accounts:');
    for (const a of accounts) {
        console.log(
            `  ${a.id}  org=${a.organization_id}  type=${a.integration_type}  status=${a.status}  name="${a.account_name}"`,
        );
    }
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (!args.accountId || !args.refreshToken) {
        usageAndExit();
    }

    if (!process.env.ENCRYPTION_KEY) {
        console.error('ENCRYPTION_KEY is not set. Make sure backend/.env is loaded and matches the running backend.');
        process.exit(1);
    }

    await sequelize.authenticate();
    console.log('DB connected');

    const account = await IntegrationAccount.findOne({
        where: { id: args.accountId },
    });

    if (!account) {
        console.error(`\nIntegration account "${args.accountId}" not found.`);
        await listAccountsHelpfully();
        await sequelize.close();
        process.exit(1);
    }

    // Mirror the exact shape produced by sp.controller.ts so the
    // /internal/integrations/accounts/:id/credentials decrypt path
    // works without any changes. The wrapper object is `{ encrypted: "<aes>" }`
    // and the inner JSON has these fields.
    const innerCredentials = {
        access_token: args.accessToken ?? '',
        refresh_token: args.refreshToken,
        expires_in: args.expiresIn ?? 3600,
        token_type: 'bearer',
        obtained_at: new Date().toISOString(),
        selling_partner_id: args.sellingPartnerId ?? null,
    };

    const secureCredentials = {
        encrypted: encrypt(JSON.stringify(innerCredentials)),
    };

    await account.update({
        status: IntegrationStatus.CONNECTED,
        credentials: secureCredentials,
        connected_at: new Date(),
        oauth_state: null,
    });

    console.log('\nSP-API credentials seeded successfully:');
    console.log(`  account_id          : ${account.id}`);
    console.log(`  organization_id     : ${account.organization_id}`);
    console.log(`  account_name        : ${account.account_name}`);
    console.log(`  integration_type    : ${account.integration_type}`);
    console.log(`  status              : ${account.status}`);
    console.log(`  selling_partner_id  : ${args.sellingPartnerId ?? '(not set)'}`);
    console.log(`  connected_at        : ${account.connected_at?.toISOString()}`);

    await sequelize.close();
}

main().catch(async (err) => {
    console.error('Error:', err);
    try { await sequelize.close(); } catch { /* ignore */ }
    process.exit(1);
});