/**
 * @fileoverview Async configuration loader/validator for MCP Web App.
 * Loads config from environment and .env files,
 * validates with Joi, merges with defaults, and exposes getConfig().
 *
 * All operations are async. No blocking calls.
 */

const Joi = require('joi');
// No longer using keytar for secrets management
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

// Default config values
const DEFAULTS = {
  HOST: 'localhost',
  PORT: 3000,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  CACHE_TTL: 3600,
  MICROSOFT_CLIENT_ID: '',
  MICROSOFT_TENANT_ID: '',
  MICROSOFT_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  SERVER_URL: 'http://localhost:3000',
  ENABLE_HTTPS: false,
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  AUTH_RATE_LIMIT: 100,
  API_RATE_LIMIT: 1000,
  HSTS_MAX_AGE: 31536000,
  DB_TYPE: 'sqlite',
  DB_PATH: './data/mcp.sqlite',
  LOG_FILE_PATH: './logs/mcp.log',
  MCP_SERVER_URL: 'http://localhost:3000',
  API_HOST: 'localhost',
  API_PORT: 3000,
  BACKUP_DIR: './backups',
  BACKUP_RETENTION_DAYS: 30,
  BACKUP_MAX_COUNT: 50
};

// Production-specific required environment variables
const PRODUCTION_REQUIRED = [
  'JWT_SECRET',
  'DEVICE_REGISTRY_ENCRYPTION_KEY',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_TENANT_ID',
  'SERVER_URL'
];

// Joi schema for config validation
const configSchema = Joi.object({
  HOST: Joi.string().default(DEFAULTS.HOST),
  PORT: Joi.number().integer().min(1).max(65535).default(DEFAULTS.PORT),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default(DEFAULTS.NODE_ENV),
  LOG_LEVEL: Joi.string().valid('info', 'warn', 'error', 'debug').default(DEFAULTS.LOG_LEVEL),
  CACHE_TTL: Joi.number().integer().min(60).max(86400).default(DEFAULTS.CACHE_TTL),
  
  // Microsoft Configuration
  MICROSOFT_CLIENT_ID: Joi.string().required(),
  MICROSOFT_TENANT_ID: Joi.string().required(),
  MICROSOFT_REDIRECT_URI: Joi.string().uri().default(DEFAULTS.MICROSOFT_REDIRECT_URI),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow('').optional(), // Loaded from environment
  MICROSOFT_AUTHORITY: Joi.string().uri().optional(),
  MICROSOFT_SCOPES: Joi.string().optional(),
  
  // Server Configuration
  SERVER_URL: Joi.string().uri().default(DEFAULTS.SERVER_URL),
  
  // Security Configuration
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().optional()
  }),
  DEVICE_REGISTRY_ENCRYPTION_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().optional()
  }),
  
  // HTTPS Configuration
  ENABLE_HTTPS: Joi.boolean().default(DEFAULTS.ENABLE_HTTPS),
  SSL_KEY_PATH: Joi.string().when('ENABLE_HTTPS', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  SSL_CERT_PATH: Joi.string().when('ENABLE_HTTPS', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  
  // CORS Configuration
  CORS_ALLOWED_ORIGINS: Joi.string().default(DEFAULTS.CORS_ALLOWED_ORIGINS),
  
  // Rate Limiting
  AUTH_RATE_LIMIT: Joi.number().integer().min(1).max(10000).default(DEFAULTS.AUTH_RATE_LIMIT),
  API_RATE_LIMIT: Joi.number().integer().min(1).max(100000).default(DEFAULTS.API_RATE_LIMIT),
  
  // Security Headers
  HSTS_MAX_AGE: Joi.number().integer().min(0).default(DEFAULTS.HSTS_MAX_AGE),
  CSP_ADDITIONAL_DOMAINS: Joi.string().optional(),
  
  // Database Configuration
  DB_TYPE: Joi.string().valid('sqlite', 'postgresql', 'mysql').default(DEFAULTS.DB_TYPE),
  DB_PATH: Joi.string().default(DEFAULTS.DB_PATH),
  DB_HOST: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgresql', 'mysql'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_PORT: Joi.number().integer().min(1).max(65535).when('DB_TYPE', {
    is: Joi.valid('postgresql', 'mysql'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_NAME: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgresql', 'mysql'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_USER: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgresql', 'mysql'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_PASSWORD: Joi.string().when('DB_TYPE', {
    is: Joi.valid('postgresql', 'mysql'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_SSL: Joi.boolean().optional(),
  
  // Logging Configuration
  LOG_FILE_PATH: Joi.string().default(DEFAULTS.LOG_FILE_PATH),
  
  // Development Configuration
  MCP_SERVER_URL: Joi.string().uri().default(DEFAULTS.MCP_SERVER_URL),
  API_HOST: Joi.string().default(DEFAULTS.API_HOST),
  API_PORT: Joi.number().integer().min(1).max(65535).default(DEFAULTS.API_PORT),
  
  // Optional Integrations
  OPENAI_API_KEY: Joi.string().optional(),
  CLAUDE_API_KEY: Joi.string().optional(),
  
  // Monitoring
  APPLICATIONINSIGHTS_CONNECTION_STRING: Joi.string().optional(),
  MONITORING_ENDPOINT: Joi.string().uri().optional(),
  
  // Cache Configuration
  REDIS_URL: Joi.string().uri().optional(),
  REDIS_PASSWORD: Joi.string().optional(),
  
  // Backup Configuration
  BACKUP_DIR: Joi.string().default(DEFAULTS.BACKUP_DIR),
  BACKUP_RETENTION_DAYS: Joi.number().integer().min(1).max(365).default(DEFAULTS.BACKUP_RETENTION_DAYS),
  BACKUP_MAX_COUNT: Joi.number().integer().min(1).max(100).default(DEFAULTS.BACKUP_MAX_COUNT)
});

// Helper to load .env if present (async, non-blocking)
async function loadDotenv() {
  const startTime = Date.now();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Loading .env file', {
        cwd: process.cwd(),
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    const envPath = path.join(process.cwd(), '.env');
    const envExists = await fs.pathExists(envPath);
    
    if (envExists) {
      dotenv.config({ path: envPath });
      
      // Pattern 2: User Activity Logs (successful operation)
      MonitoringService.info('Environment file loaded successfully', {
        envPath,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }, 'config');
    } else {
      // Pattern 2: User Activity Logs (no .env file found)
      MonitoringService.info('No .env file found, using environment variables only', {
        envPath,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'config',
      'Failed to load .env file',
      'error',
      {
        envPath: path.join(process.cwd(), '.env'),
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    MonitoringService.error('Environment file loading failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    }, 'config');
    
    throw error;
  }
}

// Async loader for secrets from environment variables
async function loadSecrets() {
  const startTime = Date.now();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Loading secrets from environment variables', {
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    // Example: MICROSOFT_CLIENT_SECRET from environment variable
    const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
    
    const secrets = {
      MICROSOFT_CLIENT_SECRET
    };
    
    // Pattern 2: User Activity Logs (successful operation)
    MonitoringService.info('Secrets loaded successfully', {
      secretsLoaded: Object.keys(secrets).length,
      clientSecretSet: !!MICROSOFT_CLIENT_SECRET,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, 'config');
    
    return secrets;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'config',
      'Failed to load secrets from environment',
      'error',
      {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    MonitoringService.error('Secrets loading failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    }, 'config');
    
    throw error;
  }
}

// Production environment validation
function validateProductionEnvironment(config) {
  const startTime = Date.now();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Starting production environment validation', {
        nodeEnv: config.NODE_ENV,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    if (config.NODE_ENV !== 'production') {
      // Pattern 2: User Activity Logs (skipping validation)
      MonitoringService.info('Production validation skipped for non-production environment', {
        nodeEnv: config.NODE_ENV,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }, 'config');
      return; // Only validate in production
    }
    
    const missingVars = [];
    const warnings = [];
    
    // Check required production variables
    PRODUCTION_REQUIRED.forEach(varName => {
      if (!config[varName] || config[varName] === DEFAULTS[varName]) {
        missingVars.push(varName);
      }
    });
    
    // Security warnings
    if (config.ENABLE_HTTPS === false) {
      warnings.push('HTTPS is disabled in production - this is not recommended');
    }
    
    if (config.JWT_SECRET && config.JWT_SECRET.length < 64) {
      warnings.push('JWT_SECRET should be at least 64 characters for production');
    }
    
    if (config.CORS_ALLOWED_ORIGINS === DEFAULTS.CORS_ALLOWED_ORIGINS) {
      warnings.push('CORS_ALLOWED_ORIGINS should be configured for production domains');
    }
    
    if (config.LOG_LEVEL === 'debug') {
      warnings.push('Debug logging is enabled in production - consider using "info" or "warn"');
    }
    
    // Throw error for missing required variables
    if (missingVars.length > 0) {
      const error = new Error(
        `Production environment validation failed. Missing required environment variables: ${missingVars.join(', ')}\n` +
        'Please check your .env file or environment configuration.'
      );
      error.missingVars = missingVars;
      
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'config',
        'Production environment validation failed',
        'critical',
        {
          missingVars,
          requiredVars: PRODUCTION_REQUIRED,
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      MonitoringService.error('Production environment validation failed', {
        missingVars,
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'config');
      
      throw error;
    }
    
    // Log warnings
    if (warnings.length > 0) {
      MonitoringService.warn('Production environment warnings', {
        warnings,
        warningCount: warnings.length,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    // Pattern 2: User Activity Logs (successful validation)
    MonitoringService.info('Production environment validation passed', {
      httpsEnabled: config.ENABLE_HTTPS,
      corsConfigured: config.CORS_ALLOWED_ORIGINS !== DEFAULTS.CORS_ALLOWED_ORIGINS,
      warningCount: warnings.length,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, 'config');
    
  } catch (error) {
    // If error wasn't already handled above, handle it here
    if (!error.missingVars) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'config',
        'Unexpected error during production environment validation',
        'error',
        {
          error: error.message,
          stack: error.stack,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      MonitoringService.error('Production environment validation failed unexpectedly', {
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    throw error;
  }
}

/**
 * Loads, merges, and validates config from env and .env files.
 * @returns {Promise<Object>} Validated config object
 */
async function getConfig() {
  const startTime = Date.now();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Starting configuration loading process', {
        cwd: process.cwd(),
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    await loadDotenv();
    const secrets = await loadSecrets();
    
    // Merge: defaults < env < secrets
    const merged = {
      ...DEFAULTS,
      ...process.env,
      ...secrets,
    };
    
    // Pattern 1: Development Debug Logs (configuration details)
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Configuration merged successfully', {
        port: merged.PORT,
        nodeEnv: merged.NODE_ENV,
        clientIdSet: !!merged.MICROSOFT_CLIENT_ID,
        tenantIdSet: !!merged.MICROSOFT_TENANT_ID,
        httpsEnabled: merged.ENABLE_HTTPS,
        dbType: merged.DB_TYPE,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    const { value, error } = configSchema.validate(merged, { abortEarly: false, allowUnknown: true });
    if (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'config',
        'Configuration validation failed',
        'critical',
        {
          details: error.details.map(e => e.message),
          validationErrors: error.details.length,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      MonitoringService.error('Configuration validation failed', {
        validationErrors: error.details.length,
        firstError: error.details[0]?.message,
        timestamp: new Date().toISOString()
      }, 'config');
      
      throw new Error('Config validation failed: ' + error.details.map(e => e.message).join('; '));
    }
    
    validateProductionEnvironment(value);
    
    // Pattern 2: User Activity Logs (successful configuration loading)
    MonitoringService.info('Configuration loaded and validated successfully', {
      nodeEnv: value.NODE_ENV,
      port: value.PORT,
      httpsEnabled: value.ENABLE_HTTPS,
      dbType: value.DB_TYPE,
      clientIdConfigured: !!value.MICROSOFT_CLIENT_ID,
      tenantIdConfigured: !!value.MICROSOFT_TENANT_ID,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, 'config');
    
    return value;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'config',
      `Configuration loading failed: ${error.message}`,
      'critical',
      {
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    MonitoringService.error('Configuration loading failed', {
      error: error.message,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }, 'config');
    
    throw error;
  }
}

module.exports = {
  getConfig,
};
