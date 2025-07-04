/**
 * @fileoverview Handles /api/auth/device endpoints for OAuth2 device flow authentication.
 * Implements device registration, authorization, token polling, and refresh operations.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const DeviceRegistry = require('../../auth/device-registry.cjs');
const DeviceJwtService = require('../../auth/device-jwt.cjs');

/**
 * Helper function to validate request against schema and log validation errors
 * @param {object} req - Express request object
 * @param {object} schema - Joi schema to validate against
 * @param {string} endpoint - Endpoint path for error context
 * @param {object} [additionalContext] - Additional context for validation errors
 * @returns {object} Object with error and value properties
 */
function validateRequest(req, schema, endpoint, additionalContext = {}) {
    const { error, value } = schema.validate(req.body, { 
        abortEarly: false,
        stripUnknown: true 
    });
    
    if (error) {
        const validationError = ErrorService.createError(
            'validation',
            `Invalid request data for ${endpoint}`,
            'warning',
            {
                endpoint,
                validationErrors: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                })),
                ...additionalContext
            }
        );
        MonitoringService.logError(validationError);
    }
    
    return { error, value };
}

// Validation schemas
const deviceRegistrationSchema = Joi.object({
    device_name: Joi.string().required().description('Human-readable device name'),
    device_type: Joi.string().required().description('Device type (e.g., browser, mobile, desktop)'),
    client_id: Joi.string().optional().description('Optional client identifier'),
    scope: Joi.string().optional().description('Optional scope parameter'),
    audience: Joi.string().optional().description('Optional audience parameter')
});

const deviceAuthorizationSchema = Joi.object({
    user_code: Joi.string().length(6).alphanum().required().description('6-digit user code'),
    user_id: Joi.string().required().description('Microsoft 365 user ID from authentication or "current_session"')
});

const tokenPollSchema = Joi.object({
    grant_type: Joi.string().valid('urn:ietf:params:oauth:grant-type:device_code').required(),
    device_code: Joi.string().required().description('Device code from registration'),
    client_id: Joi.string().optional().description('Optional client identifier')
});

const refreshTokenSchema = Joi.object({
    grant_type: Joi.string().valid('refresh_token').required(),
    refresh_token: Joi.string().required().description('Valid refresh token')
});

/**
 * Register a new device and initiate OAuth2 device flow
 * POST /api/auth/device/register
 */
async function registerDevice(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Device registration request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                clientId: req.body?.client_id,
                deviceName: req.body?.device_name,
                deviceType: req.body?.device_type,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Validate request
        const { error, value } = validateRequest(req, deviceRegistrationSchema, '/api/auth/device/register');
        if (error) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Device registration validation failed', {
                    sessionId: req.session.id,
                    validationErrors: error.details.map(d => d.message),
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid registration parameters',
                details: error.details.map(d => d.message)
            });
        }

        // Register device with registry service
        const deviceRegistration = await DeviceRegistry.registerDevice({
            clientId: value.client_id,
            scope: value.scope || 'microsoft.graph',
            audience: value.audience,
            deviceName: value.device_name,
            deviceType: value.device_type
        });

        // Pattern 2: User Activity Logs
        if (req.session?.id) {
            MonitoringService.info('Device registration completed successfully', {
                sessionId: req.session.id,
                deviceId: deviceRegistration.device_id,
                userCode: deviceRegistration.user_code,
                clientId: value.client_id,
                deviceName: value.device_name,
                deviceType: value.device_type,
                timestamp: new Date().toISOString()
            }, 'auth');
        } else {
            MonitoringService.info('Device registration completed', {
                deviceId: deviceRegistration.device_id,
                userCode: deviceRegistration.user_code,
                clientId: value.client_id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Return OAuth2-compliant device registration response
        res.json({
            device_code: deviceRegistration.device_code,
            user_code: deviceRegistration.user_code,
            verification_uri: deviceRegistration.verification_uri,
            verification_uri_complete: `${deviceRegistration.verification_uri}?user_code=${deviceRegistration.user_code}`,
            expires_in: 900, // 15 minutes
            interval: 5 // Poll every 5 seconds
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Device registration failed',
            'error',
            { 
                endpoint: '/api/auth/device/register',
                error: error.message,
                deviceName: req.body?.device_name,
                deviceType: req.body?.device_type,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        if (req.session?.id) {
            MonitoringService.error('Device registration failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Device registration service unavailable'
        });
    }
}

/**
 * Authorize a device using user code
 * POST /api/auth/device/authorize
 */
async function authorizeDevice(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Device authorization request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                userCode: req.body?.user_code,
                userId: req.body?.user_id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Validate request
        const { error, value } = validateRequest(req, deviceAuthorizationSchema, '/api/auth/device/authorize');
        if (error) {
            // Pattern 4: User Error Tracking
            const userId = req?.user?.userId;
            if (userId) {
                MonitoringService.error('Device authorization validation failed', {
                    validationErrors: error.details.map(d => d.message),
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (req.session?.id) {
                MonitoringService.error('Device authorization validation failed', {
                    sessionId: req.session.id,
                    validationErrors: error.details.map(d => d.message),
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid authorization parameters',
                details: error.details.map(d => d.message)
            });
        }

        // Get user ID from current session if 'current_session' is specified
        let userId = value.user_id;
        if (userId === 'current_session') {
            // Check if user is authenticated in current session
            if (!req.session?.msUser?.username) {
                // Pattern 4: User Error Tracking
                if (req.session?.id) {
                    MonitoringService.error('Device authorization failed - no Microsoft 365 session', {
                        sessionId: req.session.id,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return res.status(401).json({
                    error: 'unauthorized',
                    error_description: 'Microsoft 365 authentication required to authorize device'
                });
            }
            // CRITICAL FIX: Use Microsoft 365 email as consistent user identifier
            // This ensures JWT tokens will carry the same user ID as web sessions
            userId = `ms365:${req.session.msUser.username}`;
        }

        // Find device by user code
        const device = await DeviceRegistry.getDeviceByUserCode(value.user_code);
        if (!device) {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Device authorization failed - invalid user code', {
                    userCode: value.user_code,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Device authorization failed - invalid user code', {
                    sessionId: req.session.id,
                    userCode: value.user_code,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid or expired user code'
            });
        }

        // Check if device is already authorized
        if (device.is_authorized) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Device authorization failed - already authorized', {
                    sessionId: req.session.id,
                    deviceId: device.device_id,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Device already authorized'
            });
        }

        // Authorize the device
        await DeviceRegistry.authorizeDevice(value.user_code, userId);

        // Pattern 2: User Activity Logs
        if (req.session?.id) {
            MonitoringService.info('Device authorized successfully', {
                sessionId: req.session.id,
                deviceId: device.device_id,
                userId: userId.substring(0, 8) + '...',
                userCode: value.user_code,
                sessionBased: value.user_id === 'current_session',
                timestamp: new Date().toISOString()
            }, 'auth');
        } else {
            MonitoringService.info('Device authorized successfully', {
                deviceId: device.device_id,
                userId: userId.substring(0, 8) + '...',
                userCode: value.user_code,
                sessionBased: value.user_id === 'current_session',
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.json({
            success: true,
            message: 'Device authorized successfully'
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Device authorization failed',
            'error',
            { 
                endpoint: '/api/auth/device/authorize',
                userCode: req.body.user_code,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('Device authorization failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (req.session?.id) {
            MonitoringService.error('Device authorization failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Device authorization service unavailable'
        });
    }
}

/**
 * Poll for access token after device authorization
 * POST /api/auth/device/token
 */
async function pollForToken(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Token polling request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                deviceCode: req.body?.device_code ? req.body.device_code.substring(0, 8) + '...' : 'undefined',
                clientId: req.body?.client_id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Validate request
        const { error, value } = validateRequest(req, tokenPollSchema, '/api/auth/device/token');
        if (error) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token polling validation failed', {
                    sessionId: req.session.id,
                    validationErrors: error.details.map(d => d.message),
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid token request parameters',
                details: error.details.map(d => d.message)
            });
        }

        // Find device by device code
        const device = await DeviceRegistry.getDeviceByCode(value.device_code);
        if (!device) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token polling failed - invalid device code', {
                    sessionId: req.session.id,
                    deviceCode: value.device_code.substring(0, 8) + '...',
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid or expired device code'
            });
        }

        // Check if device is authorized
        if (!device.is_authorized) {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Token polling - authorization pending', {
                    deviceId: device.device_id,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'authorization_pending',
                error_description: 'User has not yet authorized the device'
            });
        }

        // Generate token pair
        const tokens = DeviceJwtService.generateTokenPair(
            device.device_id,
            device.user_id,
            {
                clientId: value.client_id,
                scope: 'microsoft.graph'
            }
        );

        // Update device last seen
        await DeviceRegistry.updateLastSeen(device.device_id);

        // Pattern 2: User Activity Logs
        MonitoringService.info('Access tokens issued successfully', {
            deviceId: device.device_id,
            userId: device.user_id.substring(0, 8) + '...',
            clientId: value.client_id,
            scope: 'microsoft.graph',
            timestamp: new Date().toISOString()
        }, 'auth');

        res.json({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_type: tokens.tokenType,
            expires_in: tokens.expiresIn,
            scope: 'microsoft.graph'
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Token polling failed',
            'error',
            { 
                endpoint: '/api/auth/device/token',
                deviceCode: req.body.device_code ? req.body.device_code.substring(0, 8) + '...' : 'undefined',
                error: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        if (req.session?.id) {
            MonitoringService.error('Token polling failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Token service unavailable'
        });
    }
}

/**
 * Refresh access token using refresh token
 * POST /api/auth/device/refresh
 */
async function refreshToken(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Token refresh request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                refreshToken: req.body?.refresh_token ? req.body.refresh_token.substring(0, 20) + '...' : 'undefined',
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Validate request
        const { error, value } = validateRequest(req, refreshTokenSchema, '/api/auth/device/refresh');
        if (error) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token refresh validation failed', {
                    sessionId: req.session.id,
                    validationErrors: error.details.map(d => d.message),
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid refresh token request',
                details: error.details.map(d => d.message)
            });
        }

        // Validate refresh token
        const decoded = DeviceJwtService.validateRefreshToken(value.refresh_token);
        
        // Get device details
        const device = await DeviceRegistry.getDeviceById(decoded.deviceId);
        if (!device || !device.is_authorized) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token refresh failed - invalid device', {
                    sessionId: req.session.id,
                    deviceId: decoded.deviceId,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid or revoked refresh token'
            });
        }

        // Generate new token pair
        const tokens = DeviceJwtService.generateTokenPair(
            device.device_id,
            device.user_id,
            {
                refreshed: true,
                originalIat: decoded.iat
            }
        );

        // Update device last seen
        await DeviceRegistry.updateLastSeen(device.device_id);

        // Pattern 2: User Activity Logs
        MonitoringService.info('Access tokens refreshed successfully', {
            deviceId: device.device_id,
            userId: device.user_id.substring(0, 8) + '...',
            originalIat: decoded.iat,
            timestamp: new Date().toISOString()
        }, 'auth');

        res.json({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_type: tokens.tokenType,
            expires_in: tokens.expiresIn,
            scope: 'microsoft.graph'
        });

    } catch (error) {
        let errorResponse;
        
        if (error.category === 'auth' && error.message.includes('expired')) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token refresh failed - expired token', {
                    sessionId: req.session.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            errorResponse = {
                error: 'invalid_grant',
                error_description: 'Refresh token has expired'
            };
        } else if (error.category === 'auth') {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token refresh failed - invalid token', {
                    sessionId: req.session.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            errorResponse = {
                error: 'invalid_grant',
                error_description: 'Invalid refresh token'
            };
        } else {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Token refresh failed',
                'error',
                { 
                    endpoint: '/api/auth/device/refresh',
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);

            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('Token refresh failed', {
                    sessionId: req.session.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            errorResponse = {
                error: 'server_error',
                error_description: 'Token refresh service unavailable'
            };
        }

        res.status(400).json(errorResponse);
    }
}

/**
 * OAuth2 resource server discovery endpoint
 * GET /.well-known/oauth-protected-resource
 */
async function getResourceServerInfo(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('OAuth2 resource server info request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                host: req.get('host'),
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        const resourceInfo = {
            resource: baseUrl,
            authorization_servers: [`${baseUrl}/api/auth/device`],
            scopes_supported: ['microsoft.graph'],
            bearer_methods_supported: ['header'],
            resource_documentation: `${baseUrl}/docs/api`,
            protection_policy_uri: `${baseUrl}/privacy`,
            resource_registration: `${baseUrl}/api/auth/device/register`
        };

        res.json(resourceInfo);

        // Pattern 2: User Activity Logs
        if (req.session?.id) {
            MonitoringService.info('OAuth2 resource server info provided', {
                sessionId: req.session.id,
                baseUrl: baseUrl,
                timestamp: new Date().toISOString()
            }, 'auth');
        } else {
            MonitoringService.info('OAuth2 resource server info provided', {
                baseUrl: baseUrl,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'auth');
        }

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Failed to provide resource server info',
            'error',
            { 
                endpoint: '/.well-known/oauth-protected-resource',
                error: error.message,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        if (req.session?.id) {
            MonitoringService.error('OAuth2 resource server info failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Resource server info unavailable'
        });
    }
}

/**
 * Generate a long-lived MCP bearer token for authenticated users
 * POST /api/auth/generate-mcp-token
 */
async function generateMcpToken(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('MCP token generation request received', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                userId: req.user?.userId?.substring(0, 8) + '...' || 'undefined',
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Ensure user is authenticated (via session or existing token)
        if (!req.user || !req.user.userId) {
            // Pattern 4: User Error Tracking
            if (req.session?.id) {
                MonitoringService.error('MCP token generation failed - no authentication', {
                    sessionId: req.session.id,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(401).json({
                error: 'authentication_required',
                error_description: 'User must be authenticated to generate MCP token'
            });
        }

        const { userId, sessionId, microsoftEmail, microsoftName } = req.user;
        
        // Generate a pseudo-device ID for this MCP token
        const deviceId = `mcp-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Ensure we're using Microsoft 365-based userId for consistency
        // This should already be in ms365:email@domain.com format from auth middleware
        if (!userId || !userId.startsWith('ms365:')) {
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('MCP token generation failed - invalid user context', {
                    userId: userId.substring(0, 8) + '...',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (req.session?.id) {
                MonitoringService.error('MCP token generation failed - invalid user context', {
                    sessionId: req.session.id,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return res.status(400).json({
                error: 'invalid_user_context',
                error_description: 'User must be authenticated with Microsoft 365 to generate MCP token'
            });
        }
        
        // Use DeviceJwtService to generate a long-lived token
        // CRITICAL: Use Microsoft 365-based userId to ensure consistency across sessions and API calls
        const tokenPayload = {
            sessionId: sessionId || 'direct-generation',
            microsoftEmail: microsoftEmail,
            microsoftName: microsoftName,
            originalUserId: userId,  // Store original for debugging
            tokenType: 'mcp-bearer'
        };

        const mcpToken = DeviceJwtService.generateLongLivedAccessToken(deviceId, userId, tokenPayload);

        // Pattern 1: Development Debug Logs (enhanced)
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('MCP Token Generated with Microsoft 365 Identity', {
                userId: userId,
                microsoftEmail: microsoftEmail,
                sessionId: sessionId,
                deviceId: deviceId,
                tokenPayload: tokenPayload,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('MCP bearer token generated successfully', {
                userId: userId.substring(0, 8) + '...',
                deviceId,
                microsoftEmail: microsoftEmail,
                expiresIn: '24h',
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (req.session?.id) {
            MonitoringService.info('MCP bearer token generated successfully', {
                sessionId: req.session.id,
                deviceId,
                expiresIn: '24h',
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Return the token with usage instructions
        res.json({
            access_token: mcpToken,
            token_type: 'Bearer',
            expires_in: 86400, // 24 hours in seconds
            scope: 'microsoft.graph',
            device_id: deviceId,
            usage_instructions: {
                claude_desktop_config: {
                    mcpServers: {
                        microsoft365: {
                            command: 'node',
                            args: ['path/to/mcp-adapter.cjs'],
                            env: {
                                MCP_SERVER_URL: `${req.protocol}://${req.get('host')}`,
                                MCP_BEARER_TOKEN: mcpToken
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Failed to generate MCP token',
            'error',
            { 
                endpoint: '/api/auth/generate-mcp-token',
                error: error.message,
                userId: req.user?.userId?.substring(0, 8) + '...' || 'unknown',
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('MCP token generation failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (req.session?.id) {
            MonitoringService.error('MCP token generation failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'MCP token generation failed'
        });
    }
}

module.exports = {
    registerDevice,
    authorizeDevice,
    pollForToken,
    refreshToken,
    getResourceServerInfo,
    generateMcpToken
};
