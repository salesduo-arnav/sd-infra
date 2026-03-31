import { SystemConfig } from '../models/system_config';
import redisClient from '../config/redis';
import Logger from '../utils/logger';

class ConfigService {
    private cache: Map<string, string> = new Map();
    private lastRefresh: number = 0;
    private refreshing: boolean = false;
    private readonly CACHE_TTL_MS = 60_000; // 1 minute

    /**
     * Initialize the config cache. Call once at startup after DB and Redis are connected.
     */
    async initialize(): Promise<void> {
        await this.loadFromDb();

        // Subscribe to cross-instance invalidation via Redis Pub/Sub
        // This allows other services (micro tools, scaled instances) to be notified of config changes
        try {
            const subscriber = redisClient.duplicate();
            subscriber.on('error', (err) => {
                Logger.warn('[ConfigService] Subscriber Redis error (non-fatal)', err);
            });
            await subscriber.connect();
            await subscriber.subscribe('config:invalidate', async () => {
                Logger.info('[ConfigService] Received invalidation signal, refreshing cache...');
                try {
                    await this.loadFromDb();
                } catch (err) {
                    Logger.error('[ConfigService] Failed to refresh cache on invalidation', err);
                }
            });
            Logger.info('[ConfigService] Subscribed to config:invalidate channel');
        } catch (err) {
            Logger.warn('[ConfigService] Failed to subscribe to Redis Pub/Sub for config invalidation. Cross-instance sync disabled.', err);
        }

        Logger.info(`[ConfigService] Initialized with ${this.cache.size} config entries`);
    }

    /**
     * Get a config value by key. Returns the cached value or the default.
     * Triggers a non-blocking background refresh if the cache is stale.
     */
    get(key: string, defaultValue?: string): string | undefined {
        this.refreshIfStale();
        const value = this.cache.get(key);
        return value !== undefined ? value : defaultValue;
    }

    /**
     * Get a config value as a number.
     */
    getNumber(key: string, defaultValue: number): number {
        const raw = this.get(key);
        if (raw === undefined) return defaultValue;
        const parsed = parseInt(raw, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Get a config value as a boolean.
     */
    getBoolean(key: string, defaultValue: boolean): boolean {
        const raw = this.get(key);
        if (raw === undefined) return defaultValue;
        return raw === 'true' || raw === '1';
    }

    /**
     * Get a config value as parsed JSON.
     */
    getJson<T>(key: string, defaultValue: T): T {
        const raw = this.get(key);
        if (raw === undefined) return defaultValue;
        try {
            return JSON.parse(raw) as T;
        } catch {
            Logger.warn(`[ConfigService] Failed to parse JSON for key "${key}", using default`);
            return defaultValue;
        }
    }

    /**
     * Eagerly reload the cache from DB. Call after admin config updates.
     */
    async refresh(): Promise<void> {
        await this.loadFromDb();
    }

    /**
     * Publish an invalidation signal so other instances/services refresh their caches.
     */
    async publishInvalidation(): Promise<void> {
        try {
            await redisClient.publish('config:invalidate', Date.now().toString());
        } catch (err) {
            Logger.warn('[ConfigService] Failed to publish invalidation signal', err);
        }
    }

    private async loadFromDb(): Promise<void> {
        try {
            const configs = await SystemConfig.findAll();
            const newCache = new Map<string, string>();
            for (const config of configs) {
                newCache.set(config.key, config.value);
            }
            this.cache = newCache;
            this.lastRefresh = Date.now();
        } catch (err) {
            Logger.error('[ConfigService] Failed to load configs from DB', err);
        }
    }

    private refreshIfStale(): void {
        if (this.refreshing) return;
        if (Date.now() - this.lastRefresh > this.CACHE_TTL_MS) {
            this.refreshing = true;
            this.loadFromDb()
                .finally(() => { this.refreshing = false; });
        }
    }
}

export const configService = new ConfigService();
