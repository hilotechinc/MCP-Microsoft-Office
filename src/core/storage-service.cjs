/**
 * @fileoverview StorageService handles persistent storage using multiple database types for MCP Server.
 * Provides async CRUD for settings/history and encryption for sensitive data. Production-ready with connection pooling.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');
const { databaseFactory } = require('./database-factory.cjs');
const { MigrationManager } = require('./database-migrations.cjs');
const { BackupManager } = require('./database-backup.cjs');
const { getConfig } = require('../config/index.cjs');

// Legacy SQLite path for backward compatibility
const DB_PATH = path.join(__dirname, '../../data/mcp.sqlite');
const ENCRYPTION_KEY = process.env.DEVICE_REGISTRY_ENCRYPTION_KEY || process.env.MCP_ENCRYPTION_KEY || 'dev_default_key_32bytes_long__!!';

// Service instances
let migrationManager = null;
let backupManager = null;
let initialized = false;

// Log service initialization
MonitoringService.info('Storage service initialized', {
    serviceName: 'storage-service',
    timestamp: new Date().toISOString()
}, 'storage');

if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
    const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        'DEVICE_REGISTRY_ENCRYPTION_KEY must be exactly 32 bytes for AES-256-CBC',
        ErrorService.SEVERITIES.CRITICAL,
        {
            keyLength: Buffer.from(ENCRYPTION_KEY).length,
            requiredLength: 32,
            timestamp: new Date().toISOString()
        }
    );
    MonitoringService.logError(mcpError);
    throw mcpError;
}

/**
 * Get database connection from factory
 */
async function getConnection() {
    if (!initialized) {
        throw new Error('Storage service not initialized. Call init() first.');
    }
    return await databaseFactory.getConnection();
}

function encrypt(text) {
    const startTime = Date.now();
    
    try {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Encryption operation started', {
                textLength: text.length,
                timestamp: new Date().toISOString()
            }, 'storage');
        }
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const result = iv.toString('base64') + ':' + encrypted;
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_encryption_success', executionTime, {
            textLength: text.length,
            timestamp: new Date().toISOString()
        });
        
        return result;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Encryption failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                textLength: text.length,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_encryption_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

function decrypt(data) {
    const startTime = Date.now();
    
    try {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Decryption operation started', {
                dataLength: data.length,
                timestamp: new Date().toISOString()
            }, 'storage');
        }
        
        const [ivStr, encrypted] = data.split(':');
        if (!ivStr || !encrypted) {
            throw new Error('Invalid encrypted data format');
        }
        
        const iv = Buffer.from(ivStr, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_decryption_success', executionTime, {
            dataLength: data.length,
            timestamp: new Date().toISOString()
        });
        
        return decrypted;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Decryption failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                dataLength: data.length,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_decryption_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function init() {
    const startTime = Date.now();
    
    try {
        MonitoringService.info('Storage service initialization started', {
            timestamp: new Date().toISOString()
        }, 'storage');
        
        // Get config asynchronously
        const config = await getConfig();
        
        // Initialize database factory first
        await databaseFactory.init(config);
        
        migrationManager = new MigrationManager(databaseFactory);
        backupManager = new BackupManager(config);
        
        await migrationManager.migrate();
        
        initialized = true;
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_init_success', executionTime, {
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.info('Storage service initialized successfully', {
            executionTimeMs: executionTime,
            timestamp: new Date().toISOString()
        }, 'storage');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Storage initialization failed: ${error.message}`,
            ErrorService.SEVERITIES.CRITICAL,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_init_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function setSetting(key, value, userId) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Setting storage operation started', {
            key,
            valueType: typeof value,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const connection = await getConnection();
        await connection.query('INSERT OR REPLACE INTO settings (key, value, user_id) VALUES (?, ?, ?)', [key, JSON.stringify(value), userId]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_set_setting_success', executionTime, {
            key,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to set setting: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                key,
                valueType: typeof value,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_set_setting_failure', executionTime, {
            key,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function getSetting(key, userId) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting setting operation started', {
            key,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const connection = await getConnection();
        const row = await connection.query('SELECT value FROM settings WHERE key = ? AND user_id = ?', [key, userId]);
        connection.release();
        
        const result = row && row.length > 0 ? JSON.parse(row[0].value) : null;
        const executionTime = Date.now() - startTime;
        
        MonitoringService.trackMetric('storage_get_setting_success', executionTime, {
            key,
            found: !!result,
            timestamp: new Date().toISOString()
        });
        
        return result;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to get setting: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                key,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_get_setting_failure', executionTime, {
            key,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function setSecure(key, value, userId) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Secure setting storage operation started', {
            key,
            valueLength: value.length,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const enc = encrypt(value);
        const connection = await getConnection();
        await connection.query('INSERT OR REPLACE INTO secure_settings (key, encrypted_value, user_id) VALUES (?, ?, ?)', [key, enc, userId]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_set_secure_success', executionTime, {
            key,
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.info('Secure value stored successfully', {
            key,
            executionTimeMs: executionTime,
            timestamp: new Date().toISOString()
        }, 'storage');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to set secure setting: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                key,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_set_secure_failure', executionTime, {
            key,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function getSecure(key, userId) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting secure setting operation started', {
            key,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const connection = await getConnection();
        const row = await connection.query('SELECT encrypted_value FROM secure_settings WHERE key = ? AND user_id = ?', [key, userId]);
        connection.release();
        
        const result = row && row.length > 0 ? decrypt(row[0].encrypted_value) : null;
        const executionTime = Date.now() - startTime;
        
        MonitoringService.trackMetric('storage_get_secure_success', executionTime, {
            key,
            found: !!result,
            timestamp: new Date().toISOString()
        });
        
        return result;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to get secure setting: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                key,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_get_secure_failure', executionTime, {
            key,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function addHistory(event, payload) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Adding history entry', {
            event,
            payloadSize: JSON.stringify(payload).length,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const connection = await getConnection();
        await connection.query('INSERT INTO history (event, payload) VALUES (?, ?)', [event, JSON.stringify(payload)]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_add_history_success', executionTime, {
            event,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to add history entry: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                event,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_add_history_failure', executionTime, {
            event,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function getHistory(limit = 50) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting history entries', {
            limit,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const connection = await getConnection();
        const rows = await connection.query('SELECT event, payload, ts FROM history ORDER BY ts DESC LIMIT ?', [limit]);
        connection.release();
        
        const result = rows && rows.length > 0 ? rows.map(row => ({ event: row.event, payload: JSON.parse(row.payload), ts: row.ts })) : [];
        const executionTime = Date.now() - startTime;
        
        MonitoringService.trackMetric('storage_get_history_success', executionTime, {
            limit,
            resultCount: result.length,
            timestamp: new Date().toISOString()
        });
        
        return result;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.DATABASE,
            `Failed to get history: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                limit,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('storage_get_history_failure', executionTime, {
            limit,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

async function registerDevice(deviceId, deviceSecret, deviceCode, userCode, verificationUri, expiresAt) {
    const startTime = Date.now();
    
    if (!deviceId || !deviceSecret) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.VALIDATION,
            'Device ID and secret are required',
            ErrorService.SEVERITIES.ERROR,
            { deviceId: !!deviceId, deviceSecret: !!deviceSecret }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
    
    try {
        const connection = await getConnection();
        await connection.query(`INSERT OR REPLACE INTO devices 
            (device_id, device_secret, device_code, user_code, verification_uri, expires_at, created_at, is_authorized) 
            VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`, 
            [deviceId, deviceSecret, deviceCode, userCode, verificationUri, expiresAt, Date.now()]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_register_device_success', executionTime, {
            deviceId: deviceId,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        MonitoringService.info('Device registered successfully', {
            deviceId: deviceId,
            executionTime: executionTime,
            timestamp: new Date().toISOString()
        }, 'storage');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_register_device_error', executionTime, {
            deviceId: deviceId,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to register device: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                deviceId: deviceId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

async function getDevice(deviceId) {
    const startTime = Date.now();
    
    if (!deviceId) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.VALIDATION,
            'Device ID is required',
            ErrorService.SEVERITIES.ERROR,
            { deviceId: deviceId }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
    
    try {
        const connection = await getConnection();
        const row = await connection.query('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
        connection.release();
        
        const result = row && row.length > 0 ? {
            deviceId: row[0].device_id,
            deviceSecret: row[0].device_secret,
            deviceCode: row[0].device_code,
            userCode: row[0].user_code,
            verificationUri: row[0].verification_uri,
            expiresAt: row[0].expires_at,
            isAuthorized: row[0].is_authorized,
            userId: row[0].user_id,
            createdAt: row[0].created_at,
            lastSeen: row[0].last_seen,
            metadata: row[0].metadata ? JSON.parse(row[0].metadata) : null
        } : null;
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_get_device_success', executionTime, {
            deviceId: deviceId,
            found: !!result,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        return result;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_get_device_error', executionTime, {
            deviceId: deviceId,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to get device: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                deviceId: deviceId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

async function authorizeDevice(deviceId, userId) {
    const startTime = Date.now();
    
    if (!deviceId || !userId) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.VALIDATION,
            'Device ID and user ID are required',
            ErrorService.SEVERITIES.ERROR,
            { deviceId: !!deviceId, userId: !!userId }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
    
    try {
        const connection = await getConnection();
        await connection.query('UPDATE devices SET is_authorized = TRUE, user_id = ?, last_seen = ? WHERE device_id = ?', 
            [userId, Date.now(), deviceId]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_authorize_device_success', executionTime, {
            deviceId: deviceId,
            userId: userId,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        MonitoringService.info('Device authorized successfully', {
            deviceId: deviceId,
            userId: userId,
            executionTime: executionTime,
            timestamp: new Date().toISOString()
        }, 'storage');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_authorize_device_error', executionTime, {
            deviceId: deviceId,
            userId: userId,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to authorize device: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                deviceId: deviceId,
                userId: userId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

async function updateDeviceMetadata(deviceId, metadata) {
    const startTime = Date.now();
    
    if (!deviceId) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.VALIDATION,
            'Device ID is required',
            ErrorService.SEVERITIES.ERROR,
            { deviceId: deviceId }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
    
    try {
        const connection = await getConnection();
        await connection.query('UPDATE devices SET metadata = ?, last_seen = ? WHERE device_id = ?', 
            [JSON.stringify(metadata), Date.now(), deviceId]);
        connection.release();
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_update_device_metadata_success', executionTime, {
            deviceId: deviceId,
            timestamp: new Date().toISOString()
        }, 'storage');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('storage_update_device_metadata_error', executionTime, {
            deviceId: deviceId,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to update device metadata: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                deviceId: deviceId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

/**
 * Get backup manager instance
 */
function getBackupManager() {
    if (!backupManager) {
        throw new Error('Storage service not initialized. Call init() first.');
    }
    return backupManager;
}

/**
 * Get migration manager instance
 */
function getMigrationManager() {
    if (!migrationManager) {
        throw new Error('Storage service not initialized. Call init() first.');
    }
    return migrationManager;
}

/**
 * Health check for storage service
 */
async function healthCheck() {
    try {
        const connection = await getConnection();
        const result = await connection.query('SELECT 1 as test', []);
        connection.release();
        
        return {
            status: 'healthy',
            database: databaseFactory.getConfig().type,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    init,
    getConnection,
    setSetting,
    getSetting,
    setSecureSetting: setSecure,
    getSecureSetting: getSecure,
    addHistory,
    getHistory,
    registerDevice,
    getDevice,
    authorizeDevice,
    updateDeviceMetadata,
    getBackupManager,
    getMigrationManager,
    healthCheck
};
