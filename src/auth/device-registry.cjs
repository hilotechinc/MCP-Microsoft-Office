/**
 * @fileoverview Device Registry Service for MCP Microsoft Office
 * Manages device registration, authorization, and cleanup for multi-user remote deployment
 */

const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const StorageService = require('../core/storage-service.cjs');

// Device code configuration
const DEVICE_CODE_LENGTH = 8;
const USER_CODE_LENGTH = 6;
const DEVICE_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const VERIFICATION_URI = 'https://microsoft.com/devicelogin';

// Characters to exclude from user codes to avoid confusion
const USER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class DeviceRegistry {
    constructor() {
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }

    /**
     * Generate a new device registration
     * @param {Object} options - Device registration options
     * @param {string} options.deviceName - Human-readable device name
     * @param {string} options.deviceType - Device type (browser, mobile, desktop, etc.)
     * @param {string} [options.clientId] - Optional client identifier
     * @param {string} [options.scope] - Optional scope parameter
     * @param {string} [options.audience] - Optional audience parameter
     * @returns {Promise<Object>} Device registration data
     */
    async registerDevice(options = {}) {
        const startTime = Date.now();
        
        try {
            const deviceId = uuid();
            const deviceSecret = this.generateDeviceSecret();
            const deviceCode = this.generateDeviceCode();
            const userCode = this.generateUserCode();
            const expiresAt = Date.now() + DEVICE_CODE_EXPIRY;
            const createdAt = Date.now();

            const deviceData = {
                device_id: deviceId,
                device_secret: deviceSecret,
                device_code: deviceCode,
                user_code: userCode,
                verification_uri: VERIFICATION_URI,
                expires_at: expiresAt,
                is_authorized: false,
                user_id: null,
                device_name: options.deviceName || 'Unknown Device',
                device_type: options.deviceType || 'unknown',
                created_at: createdAt,
                last_seen: createdAt,
                metadata: JSON.stringify({
                    client_info: 'MCP Client',
                    registration_ip: 'unknown',
                    client_id: options.clientId,
                    scope: options.scope,
                    audience: options.audience
                })
            };

            // Store device in database
            await this.storeDevice(deviceData);

            MonitoringService.info('Device registered successfully', {
                deviceId,
                userCode,
                expiresAt: new Date(expiresAt).toISOString(),
                timestamp: new Date().toISOString()
            }, 'device-registry');

            MonitoringService.trackMetric('device_registration_success', Date.now() - startTime, {
                timestamp: new Date().toISOString()
            });

            return {
                device_code: deviceCode,
                user_code: userCode,
                verification_uri: VERIFICATION_URI,
                verification_uri_complete: `${VERIFICATION_URI}?user_code=${userCode}`,
                expires_in: Math.floor(DEVICE_CODE_EXPIRY / 1000),
                interval: 5 // Polling interval in seconds
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                'device-registry',
                `Device registration failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('device_registration_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Authorize a device with user credentials
     * @param {string} userCode - User code from device registration
     * @param {string} userId - User ID from Microsoft authentication
     * @returns {Promise<boolean>} Authorization success
     */
    async authorizeDevice(userCode, userId) {
        const startTime = Date.now();
        
        try {
            const device = await this.getDeviceByUserCode(userCode);
            
            if (!device) {
                throw new Error('Invalid user code');
            }

            if (device.expires_at < Date.now()) {
                throw new Error('User code expired');
            }

            if (device.is_authorized) {
                throw new Error('Device already authorized');
            }

            // Update device with authorization
            await this.updateDeviceAuthorization(device.device_id, userId);

            MonitoringService.info('Device authorized successfully', {
                deviceId: device.device_id,
                userId,
                userCode,
                timestamp: new Date().toISOString()
            }, 'device-registry');

            MonitoringService.trackMetric('device_authorization_success', Date.now() - startTime, {
                timestamp: new Date().toISOString()
            });

            return true;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                'device-registry',
                `Device authorization failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    userCode,
                    userId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('device_authorization_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get device by device code for token polling
     * @param {string} deviceCode - Device code from registration
     * @returns {Promise<Object|null>} Device data or null
     */
    async getDeviceByCode(deviceCode) {
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE device_code = ? AND expires_at > ?',
                    [deviceCode, Date.now()]
                );
                connection.release();
                return rows.length > 0 ? rows[0] : null;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            const mcpError = ErrorService.createError(
                'device-registry',
                `Failed to get device by code: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    deviceCode,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
    }

    /**
     * Get device by user code for authorization
     * @param {string} userCode - User code from registration
     * @returns {Promise<Object|null>} Device data or null
     */
    async getDeviceByUserCode(userCode) {
        try {
            MonitoringService.debug('Searching for device by user code', {
                userCode,
                timestamp: new Date().toISOString()
            }, 'device-registry');
            
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE user_code = ? AND expires_at > ?',
                    [userCode, Date.now()]
                );
                connection.release();
                
                MonitoringService.debug('Device search result', {
                    userCode,
                    found: rows.length > 0,
                    rowCount: rows.length,
                    timestamp: new Date().toISOString()
                }, 'device-registry');
                
                return rows.length > 0 ? rows[0] : null;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            const mcpError = ErrorService.createError(
                'device-registry',
                `Failed to get device by user code: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    userCode,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
    }

    /**
     * Get device by device ID for refresh token validation
     * @param {string} deviceId - Device ID
     * @returns {Promise<Object|null>} Device data or null
     */
    async getDeviceById(deviceId) {
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE device_id = ?',
                    [deviceId]
                );
                connection.release();
                return rows.length > 0 ? rows[0] : null;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            const mcpError = ErrorService.createError(
                'device-registry',
                `Failed to get device by ID: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    deviceId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
    }

    /**
     * Update device last seen timestamp
     * @param {string} deviceId - Device ID
     */
    async updateLastSeen(deviceId) {
        try {
            const connection = await StorageService.getConnection();
            const lastSeen = Date.now();
            
            try {
                const result = await connection.query(
                    'UPDATE devices SET last_seen = ? WHERE device_id = ?',
                    [lastSeen, deviceId]
                );
                connection.release();
                return result.changes > 0;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Failed to update device last seen', {
                deviceId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'device-registry');
        }
    }

    /**
     * Generate a secure device secret
     * @returns {string} Base64 encoded device secret
     */
    generateDeviceSecret() {
        return crypto.randomBytes(32).toString('base64');
    }

    /**
     * Generate a device code
     * @returns {string} Device code
     */
    generateDeviceCode() {
        return crypto.randomBytes(DEVICE_CODE_LENGTH).toString('hex');
    }

    /**
     * Generate a user-friendly code (excludes confusing characters)
     * @returns {string} User code
     */
    generateUserCode() {
        let result = '';
        for (let i = 0; i < USER_CODE_LENGTH; i++) {
            result += USER_CODE_CHARS.charAt(Math.floor(Math.random() * USER_CODE_CHARS.length));
        }
        return result;
    }

    /**
     * Store device in database
     * @param {Object} deviceData - Device data to store
     * @returns {Promise<void>}
     */
    async storeDevice(deviceData) {
        const connection = await StorageService.getConnection();
        
        try {
            const result = await connection.query(
                `INSERT INTO devices (
                    device_id, device_secret, device_code, user_code, 
                    verification_uri, expires_at, is_authorized, user_id, 
                    device_name, device_type, created_at, last_seen, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    deviceData.device_id,
                    deviceData.device_secret,
                    deviceData.device_code,
                    deviceData.user_code,
                    deviceData.verification_uri,
                    deviceData.expires_at,
                    deviceData.is_authorized,
                    deviceData.user_id,
                    deviceData.device_name,
                    deviceData.device_type,
                    deviceData.created_at,
                    deviceData.last_seen,
                    deviceData.metadata
                ]
            );
            connection.release();
            return result.lastID;
        } catch (error) {
            connection.release();
            throw error;
        }
    }

    /**
     * Update device authorization status
     * @param {string} deviceId - Device ID
     * @param {string} userId - User ID
     */
    async updateDeviceAuthorization(deviceId, userId) {
        const connection = await StorageService.getConnection();
        
        try {
            const result = await connection.query(
                'UPDATE devices SET is_authorized = TRUE, user_id = ?, last_seen = ? WHERE device_id = ?',
                [userId, Date.now(), deviceId]
            );
            connection.release();
            return result.changes > 0;
        } catch (error) {
            connection.release();
            throw error;
        }
    }

    /**
     * Start cleanup timer for expired devices
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredDevices();
        }, CLEANUP_INTERVAL);

        MonitoringService.info('Device cleanup timer started', {
            interval: CLEANUP_INTERVAL,
            timestamp: new Date().toISOString()
        }, 'device-registry');
    }

    /**
     * Clean up expired devices
     */
    async cleanupExpiredDevices() {
        try {
            const connection = await StorageService.getConnection();
            const now = Date.now();
            
            try {
                const result = await connection.query(
                    'DELETE FROM devices WHERE expires_at < ? AND is_authorized = FALSE',
                    [now]
                );
                connection.release();
                
                MonitoringService.info('Cleaned up expired devices', {
                    deletedCount: result.changes,
                    timestamp: new Date().toISOString()
                }, 'device-registry');
                
                return result.changes;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Device cleanup failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'device-registry');
        }
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            
            MonitoringService.info('Device cleanup timer stopped', {
                timestamp: new Date().toISOString()
            }, 'device-registry');
        }
    }
}

// Create singleton instance
const deviceRegistry = new DeviceRegistry();

module.exports = deviceRegistry;
