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
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing device registration request', {
                deviceName: options.deviceName,
                deviceType: options.deviceType,
                clientId: options.clientId,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
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

            // Pattern 2: User Activity Logs
            MonitoringService.info('Device registered successfully', {
                deviceId,
                userCode,
                deviceName: options.deviceName || 'Unknown Device',
                deviceType: options.deviceType || 'unknown',
                expiresAt: new Date(expiresAt).toISOString(),
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth');

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
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Device registration failed: ${error.message}`,
                'error',
                {
                    operation: 'registerDevice',
                    deviceName: options.deviceName,
                    deviceType: options.deviceType,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device registration failed', {
                error: error.message,
                operation: 'registerDevice',
                timestamp: new Date().toISOString()
            }, 'auth');
            
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
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing device authorization request', {
                userCode,
                userId: userId ? userId.substring(0, 8) + '...' : 'unknown',
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
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

            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Device authorized successfully', {
                    deviceId: device.device_id,
                    deviceName: device.device_name,
                    deviceType: device.device_type,
                    userCode,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.info('Device authorized successfully', {
                    deviceId: device.device_id,
                    deviceName: device.device_name,
                    deviceType: device.device_type,
                    userCode,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            MonitoringService.trackMetric('device_authorization_success', Date.now() - startTime, {
                timestamp: new Date().toISOString()
            });

            return true;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Device authorization failed: ${error.message}`,
                'error',
                {
                    operation: 'authorizeDevice',
                    userCode,
                    userId,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Device authorization failed', {
                    error: error.message,
                    operation: 'authorizeDevice',
                    userCode,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.error('Device authorization failed', {
                    error: error.message,
                    operation: 'authorizeDevice',
                    userCode,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
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
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing get device by code request', {
                deviceCode: deviceCode ? deviceCode.substring(0, 8) + '...' : 'unknown',
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE device_code = ? AND expires_at > ?',
                    [deviceCode, Date.now()]
                );
                connection.release();
                
                const device = rows.length > 0 ? rows[0] : null;
                
                // Pattern 2: User Activity Logs
                if (device && device.user_id) {
                    MonitoringService.info('Device retrieved by code successfully', {
                        deviceId: device.device_id,
                        deviceName: device.device_name,
                        deviceType: device.device_type,
                        isAuthorized: device.is_authorized,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth', null, device.user_id);
                } else {
                    MonitoringService.info('Device lookup by code completed', {
                        found: !!device,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return device;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to get device by code: ${error.message}`,
                'error',
                {
                    operation: 'getDeviceByCode',
                    deviceCode,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device lookup by code failed', {
                error: error.message,
                operation: 'getDeviceByCode',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Get device by user code for authorization
     * @param {string} userCode - User code from registration
     * @returns {Promise<Object|null>} Device data or null
     */
    async getDeviceByUserCode(userCode) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing get device by user code request', {
                userCode,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE user_code = ? AND expires_at > ?',
                    [userCode, Date.now()]
                );
                connection.release();
                
                const device = rows.length > 0 ? rows[0] : null;
                
                // Pattern 1: Development Debug Logs (additional detail)
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Device search result', {
                        userCode,
                        found: !!device,
                        rowCount: rows.length,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                // Pattern 2: User Activity Logs
                if (device && device.user_id) {
                    MonitoringService.info('Device retrieved by user code successfully', {
                        deviceId: device.device_id,
                        deviceName: device.device_name,
                        deviceType: device.device_type,
                        isAuthorized: device.is_authorized,
                        userCode,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth', null, device.user_id);
                } else {
                    MonitoringService.info('Device lookup by user code completed', {
                        userCode,
                        found: !!device,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return device;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to get device by user code: ${error.message}`,
                'error',
                {
                    operation: 'getDeviceByUserCode',
                    userCode,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device lookup by user code failed', {
                error: error.message,
                operation: 'getDeviceByUserCode',
                userCode,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Get device by device ID for refresh token validation
     * @param {string} deviceId - Device ID
     * @returns {Promise<Object|null>} Device data or null
     */
    async getDeviceById(deviceId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing get device by ID request', {
                deviceId,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM devices WHERE device_id = ?',
                    [deviceId]
                );
                connection.release();
                
                const device = rows.length > 0 ? rows[0] : null;
                
                // Pattern 2: User Activity Logs
                if (device && device.user_id) {
                    MonitoringService.info('Device retrieved by ID successfully', {
                        deviceId: device.device_id,
                        deviceName: device.device_name,
                        deviceType: device.device_type,
                        isAuthorized: device.is_authorized,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth', null, device.user_id);
                } else {
                    MonitoringService.info('Device lookup by ID completed', {
                        deviceId,
                        found: !!device,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return device;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to get device by ID: ${error.message}`,
                'error',
                {
                    operation: 'getDeviceById',
                    deviceId,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device lookup by ID failed', {
                error: error.message,
                operation: 'getDeviceById',
                deviceId,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Update device last seen timestamp
     * @param {string} deviceId - Device ID
     */
    async updateLastSeen(deviceId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing update device last seen request', {
                deviceId,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            const lastSeen = Date.now();
            
            try {
                const result = await connection.query(
                    'UPDATE devices SET last_seen = ? WHERE device_id = ?',
                    [lastSeen, deviceId]
                );
                connection.release();
                
                const updated = result.changes > 0;
                
                // Pattern 2: User Activity Logs
                MonitoringService.info('Device last seen updated', {
                    deviceId,
                    updated,
                    lastSeen: new Date(lastSeen).toISOString(),
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
                
                return updated;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to update device last seen: ${error.message}`,
                'error',
                {
                    operation: 'updateLastSeen',
                    deviceId,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device last seen update failed', {
                error: error.message,
                operation: 'updateLastSeen',
                deviceId,
                timestamp: new Date().toISOString()
            }, 'auth');
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
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing store device request', {
                deviceId: deviceData.device_id,
                deviceName: deviceData.device_name,
                deviceType: deviceData.device_type,
                userCode: deviceData.user_code,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
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
                
                // Pattern 2: User Activity Logs
                MonitoringService.info('Device stored successfully', {
                    deviceId: deviceData.device_id,
                    deviceName: deviceData.device_name,
                    deviceType: deviceData.device_type,
                    userCode: deviceData.user_code,
                    lastID: result.lastID,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
                
                return result.lastID;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to store device: ${error.message}`,
                'error',
                {
                    operation: 'storeDevice',
                    deviceId: deviceData.device_id,
                    deviceName: deviceData.device_name,
                    deviceType: deviceData.device_type,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device storage failed', {
                error: error.message,
                operation: 'storeDevice',
                deviceId: deviceData.device_id,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Update device authorization status
     * @param {string} deviceId - Device ID
     * @param {string} userId - User ID
     */
    async updateDeviceAuthorization(deviceId, userId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing update device authorization request', {
                deviceId,
                userId: userId ? userId.substring(0, 8) + '...' : 'unknown',
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const result = await connection.query(
                    'UPDATE devices SET is_authorized = TRUE, user_id = ?, last_seen = ? WHERE device_id = ?',
                    [userId, Date.now(), deviceId]
                );
                connection.release();
                
                const updated = result.changes > 0;
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Device authorization updated successfully', {
                        deviceId,
                        updated,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth', null, userId);
                } else {
                    MonitoringService.info('Device authorization updated', {
                        deviceId,
                        updated,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return updated;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to update device authorization: ${error.message}`,
                'error',
                {
                    operation: 'updateDeviceAuthorization',
                    deviceId,
                    userId,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Device authorization update failed', {
                    error: error.message,
                    operation: 'updateDeviceAuthorization',
                    deviceId,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.error('Device authorization update failed', {
                    error: error.message,
                    operation: 'updateDeviceAuthorization',
                    deviceId,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            throw mcpError;
        }
    }

    /**
     * Start cleanup timer for expired devices
     */
    startCleanupTimer() {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing start cleanup timer request', {
                interval: CLEANUP_INTERVAL,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            this.cleanupInterval = setInterval(() => {
                this.cleanupExpiredDevices();
            }, CLEANUP_INTERVAL);

            // Pattern 2: User Activity Logs
            MonitoringService.info('Device cleanup timer started', {
                interval: CLEANUP_INTERVAL,
                intervalMinutes: Math.floor(CLEANUP_INTERVAL / 60000),
                timestamp: new Date().toISOString()
            }, 'auth');
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to start cleanup timer: ${error.message}`,
                'error',
                {
                    operation: 'startCleanupTimer',
                    interval: CLEANUP_INTERVAL,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Cleanup timer start failed', {
                error: error.message,
                operation: 'startCleanupTimer',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Clean up expired devices
     */
    async cleanupExpiredDevices() {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing cleanup expired devices request', {
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            const connection = await StorageService.getConnection();
            const now = Date.now();
            
            try {
                const result = await connection.query(
                    'DELETE FROM devices WHERE expires_at < ? AND is_authorized = FALSE',
                    [now]
                );
                connection.release();
                
                // Pattern 2: User Activity Logs
                MonitoringService.info('Cleaned up expired devices', {
                    deletedCount: result.changes,
                    cutoffTime: new Date(now).toISOString(),
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
                
                return result.changes;
            } catch (error) {
                connection.release();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Device cleanup failed: ${error.message}`,
                'error',
                {
                    operation: 'cleanupExpiredDevices',
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Device cleanup failed', {
                error: error.message,
                operation: 'cleanupExpiredDevices',
                timestamp: new Date().toISOString()
            }, 'auth');
        }
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing stop cleanup timer request', {
                hasInterval: !!this.cleanupInterval,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        try {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
                
                // Pattern 2: User Activity Logs
                MonitoringService.info('Device cleanup timer stopped', {
                    timestamp: new Date().toISOString()
                }, 'auth');
            } else {
                // Pattern 2: User Activity Logs
                MonitoringService.info('Cleanup timer stop requested but no timer was running', {
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                `Failed to stop cleanup timer: ${error.message}`,
                'error',
                {
                    operation: 'stopCleanupTimer',
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Cleanup timer stop failed', {
                error: error.message,
                operation: 'stopCleanupTimer',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }
}

// Create singleton instance
const deviceRegistry = new DeviceRegistry();

module.exports = deviceRegistry;
