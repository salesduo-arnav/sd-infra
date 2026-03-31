import { WebClient, KnownBlock, ChatPostMessageResponse } from '@slack/web-api';
import { GlobalIntegration, GlobalIntegrationStatus } from '../models/global_integration';
import { decrypt } from '../utils/encryption';

// ============================
// Types
// ============================

export interface SlackMessageOptions {
    organization_id: string;
    channel: string;
    text: string;
    blocks?: KnownBlock[];
}

export interface SlackDmOptions {
    organization_id: string;
    user_email?: string;
    user_id?: string;
    text: string;
    blocks?: KnownBlock[];
}

export interface SlackFileOptions {
    organization_id: string;
    channel: string;
    file: Buffer;
    filename: string;
    title?: string;
    initial_comment?: string;
}

export interface SlackFileDmOptions {
    organization_id: string;
    user_email?: string;
    user_id?: string;
    file: Buffer;
    filename: string;
    title?: string;
    initial_comment?: string;
}

export interface SlackChannel {
    id: string;
    name: string;
    is_private: boolean;
    num_members: number;
}

export interface SlackUser {
    id: string;
    name: string;
    real_name: string;
    email?: string;
}

// ============================
// Service
// ============================

interface CachedClient {
    client: WebClient;
    expiresAt: number;
}

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SlackService {
    private clientCache = new Map<string, CachedClient>();

    // --------------------------------------------------
    // Client management
    // --------------------------------------------------

    private async getClient(organizationId: string): Promise<WebClient> {
        const cached = this.clientCache.get(organizationId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.client;
        }

        const integration = await GlobalIntegration.findOne({
            where: {
                organization_id: organizationId,
                service_name: 'slack',
                status: GlobalIntegrationStatus.CONNECTED,
            },
        });

        if (!integration || !integration.credentials) {
            throw Object.assign(new Error('Slack is not connected for this organization'), { statusCode: 404 });
        }

        const encrypted = (integration.credentials as { encrypted: string }).encrypted;
        const creds = JSON.parse(decrypt(encrypted));
        const client = new WebClient(creds.access_token);

        this.clientCache.set(organizationId, {
            client,
            expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
        });

        return client;
    }

    private invalidateClient(organizationId: string): void {
        this.clientCache.delete(organizationId);
    }

    private getSlackErrorCode(error: unknown): string | undefined {
        return (error as { data?: { error?: string } })?.data?.error;
    }

    /**
     * Handle token revocation errors by marking the integration as disconnected.
     */
    private async handleTokenError(organizationId: string, error: unknown): Promise<never> {
        const code = this.getSlackErrorCode(error);

        if (code === 'token_revoked' || code === 'invalid_auth' || code === 'account_inactive') {
            this.invalidateClient(organizationId);

            await GlobalIntegration.update(
                { status: GlobalIntegrationStatus.DISCONNECTED },
                { where: { organization_id: organizationId, service_name: 'slack' } }
            );

            throw Object.assign(
                new Error(`Slack token is no longer valid (${code}). Please reconnect Slack.`),
                { statusCode: 401 }
            );
        }

        throw error;
    }

    // --------------------------------------------------
    // Channel resolution
    // --------------------------------------------------

    /**
     * Resolve a channel name to its ID. If the input looks like an ID (starts with C/G), return as-is.
     */
    private async resolveChannelId(client: WebClient, channel: string): Promise<string> {
        // Already an ID
        if (/^[CG][A-Za-z0-9]+$/.test(channel)) {
            return channel;
        }

        // Strip leading # if present
        const name = channel.replace(/^#/, '');

        let cursor: string | undefined;
        do {
            const result = await client.conversations.list({
                types: 'public_channel,private_channel',
                limit: 200,
                cursor,
                exclude_archived: true,
            });
            const found = result.channels?.find(ch => ch.name === name);
            if (found?.id) return found.id;
            cursor = result.response_metadata?.next_cursor || undefined;
        } while (cursor);

        throw Object.assign(
            new Error(`Slack channel "${channel}" not found`),
            { statusCode: 404 }
        );
    }

    // --------------------------------------------------
    // Messaging
    // --------------------------------------------------

    public async sendToChannel(options: SlackMessageOptions): Promise<ChatPostMessageResponse> {
        const { organization_id, channel, text, blocks } = options;
        const client = await this.getClient(organization_id);

        try {
            // Resolve channel name to ID first so join works correctly
            const channelId = await this.resolveChannelId(client, channel);

            try {
                return await client.chat.postMessage({ channel: channelId, text, blocks });
            } catch (error: unknown) {
                if (this.getSlackErrorCode(error) === 'not_in_channel') {
                    // Auto-join using the resolved ID
                    await client.conversations.join({ channel: channelId });
                    return await client.chat.postMessage({ channel: channelId, text, blocks });
                }

                throw error;
            }
        } catch (error: unknown) {
            // Re-throw if it already has a statusCode (our own errors like 404)
            if ((error as { statusCode?: number }).statusCode) throw error;
            return this.handleTokenError(organization_id, error);
        }
    }

    public async sendToUser(options: SlackDmOptions): Promise<ChatPostMessageResponse> {
        const { organization_id, user_email, user_id, text, blocks } = options;
        const client = await this.getClient(organization_id);

        try {
            let resolvedUserId = user_id;

            if (!resolvedUserId && user_email) {
                const userResult = await client.users.lookupByEmail({ email: user_email });
                resolvedUserId = userResult.user?.id;
            }

            if (!resolvedUserId) {
                throw Object.assign(
                    new Error(`No Slack user found with email "${user_email}"`),
                    { statusCode: 404 }
                );
            }

            const dmResult = await client.conversations.open({ users: resolvedUserId });
            const dmChannelId = dmResult.channel?.id;

            if (!dmChannelId) {
                throw Object.assign(new Error('Failed to open DM conversation'), { statusCode: 500 });
            }

            return await client.chat.postMessage({ channel: dmChannelId, text, blocks });
        } catch (error: unknown) {
            if (this.getSlackErrorCode(error) === 'users_not_found') {
                throw Object.assign(
                    new Error(`No Slack user found with email "${user_email}"`),
                    { statusCode: 404 }
                );
            }

            if ((error as { statusCode?: number }).statusCode) throw error;
            return this.handleTokenError(organization_id, error);
        }
    }

    // --------------------------------------------------
    // File uploads
    // --------------------------------------------------

    public async sendFileToChannel(options: SlackFileOptions): Promise<void> {
        const { organization_id, channel, file, filename, title, initial_comment } = options;
        const client = await this.getClient(organization_id);

        try {
            const channelId = await this.resolveChannelId(client, channel);

            try {
                await client.filesUploadV2({
                    channel_id: channelId,
                    file,
                    filename,
                    title,
                    initial_comment,
                });
            } catch (error: unknown) {
                if (this.getSlackErrorCode(error) === 'not_in_channel') {
                    await client.conversations.join({ channel: channelId });
                    await client.filesUploadV2({
                        channel_id: channelId,
                        file,
                        filename,
                        title,
                        initial_comment,
                    });
                    return;
                }
                throw error;
            }
        } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode) throw error;
            return this.handleTokenError(organization_id, error);
        }
    }

    public async sendFileToUser(options: SlackFileDmOptions): Promise<void> {
        const { organization_id, user_email, user_id, file, filename, title, initial_comment } = options;
        const client = await this.getClient(organization_id);

        try {
            let resolvedUserId = user_id;

            if (!resolvedUserId && user_email) {
                const userResult = await client.users.lookupByEmail({ email: user_email });
                resolvedUserId = userResult.user?.id;
            }

            if (!resolvedUserId) {
                throw Object.assign(
                    new Error(`No Slack user found with email "${user_email}"`),
                    { statusCode: 404 }
                );
            }

            const dmResult = await client.conversations.open({ users: resolvedUserId });
            const dmChannelId = dmResult.channel?.id;

            if (!dmChannelId) {
                throw Object.assign(new Error('Failed to open DM conversation'), { statusCode: 500 });
            }

            await client.filesUploadV2({
                channel_id: dmChannelId,
                file,
                filename,
                title,
                initial_comment,
            });
        } catch (error: unknown) {
            if (this.getSlackErrorCode(error) === 'users_not_found') {
                throw Object.assign(
                    new Error(`No Slack user found with email "${user_email}"`),
                    { statusCode: 404 }
                );
            }

            if ((error as { statusCode?: number }).statusCode) throw error;
            return this.handleTokenError(organization_id, error);
        }
    }

    // --------------------------------------------------
    // Queries
    // --------------------------------------------------

    public async listChannels(organizationId: string): Promise<SlackChannel[]> {
        const client = await this.getClient(organizationId);

        try {
            const channels: SlackChannel[] = [];
            let cursor: string | undefined;

            do {
                const result = await client.conversations.list({
                    types: 'public_channel,private_channel',
                    limit: 200,
                    cursor,
                    exclude_archived: true,
                });

                for (const ch of result.channels || []) {
                    channels.push({
                        id: ch.id!,
                        name: ch.name!,
                        is_private: ch.is_private ?? false,
                        num_members: ch.num_members ?? 0,
                    });
                }

                cursor = result.response_metadata?.next_cursor || undefined;
            } while (cursor);

            return channels;
        } catch (error) {
            return this.handleTokenError(organizationId, error);
        }
    }

    public async lookupUserByEmail(organizationId: string, email: string): Promise<SlackUser> {
        const client = await this.getClient(organizationId);

        try {
            const result = await client.users.lookupByEmail({ email });
            const user = result.user!;

            return {
                id: user.id!,
                name: user.name!,
                real_name: user.real_name || user.name!,
                email: user.profile?.email,
            };
        } catch (error: unknown) {
            if (this.getSlackErrorCode(error) === 'users_not_found') {
                throw Object.assign(
                    new Error(`No Slack user found with email "${email}"`),
                    { statusCode: 404 }
                );
            }

            return this.handleTokenError(organizationId, error);
        }
    }

    public async testConnection(organizationId: string): Promise<{ ok: boolean; team: string; bot_id: string }> {
        const client = await this.getClient(organizationId);

        try {
            const result = await client.auth.test();
            return {
                ok: result.ok ?? false,
                team: result.team ?? '',
                bot_id: result.bot_id ?? '',
            };
        } catch (error) {
            return this.handleTokenError(organizationId, error);
        }
    }
}

export const slackService = new SlackService();
