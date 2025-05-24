/**
 * @fileoverview StorageService handles persistent storage using SQLite for MCP Desktop.
 * Provides async CRUD for settings/history and encryption for sensitive data. Modular and testable.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

const DB_PATH = path.join(__dirname, '../../data/mcp.sqlite');
const ENCRYPTION_KEY = process.env.MCP_ENCRYPTION_KEY || 'dev_default_key_32bytes_long__!!';

// Log service initialization
MonitoringService.info('Storage service initialized', {
    serviceName: 'storage-service',
    dbPath: DB_PATH,
    timestamp: new Date().toISOString()
}, 'storage');

if (Buffer.from(ENCRYPTION_KEY).length !== 32) {
    const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        'ENCRYPTION_KEY must be exactly 32 bytes for AES-256-CBC',
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

function getDb() {
    return new sqlite3.Database(DB_PATH);
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
            dbPath: DB_PATH,
            timestamp: new Date().toISOString()
        }, 'storage');
        
        if (!fs.existsSync(path.dirname(DB_PATH))) {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
            MonitoringService.info('Created storage directory', {
                directory: path.dirname(DB_PATH),
                timestamp: new Date().toISOString()
            }, 'storage');
        }
        
        const db = getDb();
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, secure INTEGER DEFAULT 0)`, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });
                db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, payload TEXT, ts DATETIME DEFAULT CURRENT_TIMESTAMP)`, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });
                db.on('trace', () => {});
                db.on('profile', () => {});
                resolve();
            });
        });
        db.close();
        
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
                dbPath: DB_PATH,
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

async function setSetting(key, value) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Setting storage operation started', {
            key,
            valueType: typeof value,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const db = getDb();
        await new Promise((resolve, reject) => {
            db.run('INSERT OR REPLACE INTO settings (key, value, secure) VALUES (?, ?, 0)', [key, JSON.stringify(value)], err => err ? reject(err) : resolve());
        });
        db.close();
        
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

async function getSetting(key) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting setting operation started', {
            key,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const db = getDb();
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ? AND secure = 0', [key], (err, row) => err ? reject(err) : resolve(row));
        });
        db.close();
        
        const result = row ? JSON.parse(row.value) : null;
        const executionTime = Date.now() - startTime;
        
        MonitoringService.trackMetric('storage_get_setting_success', executionTime, {
            key,
            found: !!row,
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

async function setSecure(key, value) {
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
        const db = getDb();
        await new Promise((resolve, reject) => {
            db.run('INSERT OR REPLACE INTO settings (key, value, secure) VALUES (?, ?, 1)', [key, enc], err => err ? reject(err) : resolve());
        });
        db.close();
        
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

async function getSecure(key) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting secure setting operation started', {
            key,
            timestamp: new Date().toISOString()
        }, 'storage');
    }
    
    try {
        const db = getDb();
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT value FROM settings WHERE key = ? AND secure = 1', [key], (err, row) => err ? reject(err) : resolve(row));
        });
        db.close();
        
        const result = row ? decrypt(row.value) : null;
        const executionTime = Date.now() - startTime;
        
        MonitoringService.trackMetric('storage_get_secure_success', executionTime, {
            key,
            found: !!row,
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
        const db = getDb();
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO history (event, payload) VALUES (?, ?)', [event, JSON.stringify(payload)], err => err ? reject(err) : resolve());
        });
        db.close();
        
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
        const db = getDb();
        const rows = await new Promise((resolve, reject) => {
            db.all('SELECT event, payload, ts FROM history ORDER BY ts DESC LIMIT ?', [limit], (err, rows) => err ? reject(err) : resolve(rows));
        });
        db.close();
        
        const result = rows.map(row => ({ event: row.event, payload: JSON.parse(row.payload), ts: row.ts }));
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

module.exports = {
    init,
    setSetting,
    getSetting,
    setSecure,
    getSecure,
    addHistory,
    getHistory,
    DB_PATH
};
