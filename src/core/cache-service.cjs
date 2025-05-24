/**
 * @fileoverview In-memory cache service with TTL and async API for MCP Desktop.
 * Provides get, set, invalidate, and stats methods. Follows project async and modular rules.
 */

const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

const DEFAULT_TTL = 3600; // seconds

// Log service initialization
MonitoringService.info('Cache service initialized', {
    serviceName: 'cache-service',
    defaultTtl: DEFAULT_TTL,
    timestamp: new Date().toISOString()
}, 'cache');

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
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Cache get operation started', {
                key,
                timestamp: new Date().toISOString()
            }, 'cache');
        }
        
        try {
            const entry = this._cache.get(key);
            const storageService = require('./storage-service.cjs');
            
            if (!entry) {
                this._stats.misses++;
                const executionTime = Date.now() - startTime;
                
                MonitoringService.trackMetric('cache_miss', executionTime, {
                    key,
                    timestamp: new Date().toISOString()
                });
                
                return null;
            }
            
            if (Date.now() > entry.expiry) {
                await this.invalidate(key);
                this._stats.misses++;
                const executionTime = Date.now() - startTime;
                
                MonitoringService.trackMetric('cache_expired', executionTime, {
                    key,
                    timestamp: new Date().toISOString()
                });
                
                return null;
            }
            
            this._stats.hits++;
            const executionTime = Date.now() - startTime;
            
            MonitoringService.trackMetric('cache_hit', executionTime, {
                key,
                timestamp: new Date().toISOString()
            });
            
            return entry.value;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Cache get operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    key,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('cache_get_failure', executionTime, {
                key,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Async set in cache with TTL (seconds).
     * @param {string} key
     * @param {any} value
     * @param {number} [ttl=DEFAULT_TTL]
     * @returns {Promise<void>}
     */
    async set(key, value, ttl = DEFAULT_TTL) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Cache set operation started', {
                key,
                ttl,
                valueType: typeof value,
                timestamp: new Date().toISOString()
            }, 'cache');
        }
        
        try {
            await this.invalidate(key);
            const expiry = Date.now() + ttl * 1000;
            this._cache.set(key, { value, expiry });
            this._stats.sets++;
            
            // Schedule expiration cleanup
            const timeout = setTimeout(() => {
                this.invalidate(key);
            }, ttl * 1000);
            this._timeouts.set(key, timeout);
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('cache_set_success', executionTime, {
                key,
                ttl,
                timestamp: new Date().toISOString()
            });
            
            // Track cache size metrics
            MonitoringService.trackMetric('cache_size', this._cache.size, {
                operation: 'set',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Cache set operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    key,
                    ttl,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('cache_set_failure', executionTime, {
                key,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Remove a key from cache.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async invalidate(key) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Cache invalidate operation started', {
                key,
                timestamp: new Date().toISOString()
            }, 'cache');
        }
        
        try {
            let wasDeleted = false;
            
            if (this._cache.has(key)) {
                this._cache.delete(key);
                this._stats.deletes++;
                wasDeleted = true;
            }
            
            if (this._timeouts.has(key)) {
                clearTimeout(this._timeouts.get(key));
                this._timeouts.delete(key);
            }
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('cache_invalidate_success', executionTime, {
                key,
                wasDeleted,
                timestamp: new Date().toISOString()
            });
            
            // Track cache size metrics
            MonitoringService.trackMetric('cache_size', this._cache.size, {
                operation: 'invalidate',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Cache invalidate operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    key,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('cache_invalidate_failure', executionTime, {
                key,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get cache stats.
     * @returns {Promise<object>}
     */
    async stats() {
        const startTime = Date.now();
        
        try {
            const stats = { 
                ...this._stats, 
                size: this._cache.size,
                hitRatio: this._stats.hits + this._stats.misses > 0 ? 
                    (this._stats.hits / (this._stats.hits + this._stats.misses)).toFixed(3) : 0
            };
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('cache_stats_success', executionTime, {
                cacheSize: stats.size,
                hitRatio: stats.hitRatio,
                timestamp: new Date().toISOString()
            });
            
            // Log cache performance periodically
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Cache statistics retrieved', {
                    stats,
                    timestamp: new Date().toISOString()
                }, 'cache');
            }
            
            return stats;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Cache stats operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('cache_stats_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Clear all cache entries.
     * @returns {Promise<void>}
     */
    async clear() {
        const startTime = Date.now();
        
        try {
            const initialSize = this._cache.size;
            
            MonitoringService.info('Cache clear operation started', {
                initialSize,
                timestamp: new Date().toISOString()
            }, 'cache');
            
            for (const key of this._cache.keys()) {
                await this.invalidate(key);
            }
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('cache_clear_success', executionTime, {
                clearedEntries: initialSize,
                timestamp: new Date().toISOString()
            });
            
            MonitoringService.info('Cache cleared successfully', {
                clearedEntries: initialSize,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'cache');
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Cache clear operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('cache_clear_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
}

module.exports = new CacheService();
