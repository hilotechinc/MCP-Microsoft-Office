/**
 * @fileoverview In-memory cache service with TTL and async API for MCP Desktop.
 * Provides get, set, invalidate, and stats methods. Follows project async and modular rules.
 */

const DEFAULT_TTL = 3600; // seconds

class CacheService {
    constructor() {
        this._cache = new Map();
        this._timeouts = new Map();
        this._stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
    }

    /**
     * Async get from cache. Returns null if missing or expired.
     * @param {string} key
     * @returns {Promise<any|null>}
     */
    async get(key) {
        const entry = this._cache.get(key);
        if (!entry) {
            this._stats.misses++;
            return null;
        }
        if (Date.now() > entry.expiry) {
            await this.invalidate(key);
            this._stats.misses++;
            return null;
        }
        this._stats.hits++;
        return entry.value;
    }

    /**
     * Async set in cache with TTL (seconds).
     * @param {string} key
     * @param {any} value
     * @param {number} [ttl=DEFAULT_TTL]
     * @returns {Promise<void>}
     */
    async set(key, value, ttl = DEFAULT_TTL) {
        await this.invalidate(key);
        const expiry = Date.now() + ttl * 1000;
        this._cache.set(key, { value, expiry });
        this._stats.sets++;
        // Schedule expiration cleanup
        const timeout = setTimeout(() => {
            this.invalidate(key);
        }, ttl * 1000);
        this._timeouts.set(key, timeout);
    }

    /**
     * Remove a key from cache.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async invalidate(key) {
        if (this._cache.has(key)) {
            this._cache.delete(key);
            this._stats.deletes++;
        }
        if (this._timeouts.has(key)) {
            clearTimeout(this._timeouts.get(key));
            this._timeouts.delete(key);
        }
    }

    /**
     * Get cache stats.
     * @returns {Promise<object>}
     */
    async stats() {
        return { ...this._stats, size: this._cache.size };
    }

    /**
     * Clear all cache entries.
     * @returns {Promise<void>}
     */
    async clear() {
        for (const key of this._cache.keys()) {
            await this.invalidate(key);
        }
    }
}

module.exports = new CacheService();
