/**
 * @fileoverview Async configuration loader/validator for MCP Desktop.
 * Loads config from environment, .env, and secure storage (keytar),
 * validates with Joi, merges with defaults, and exposes getConfig().
 *
 * All operations are async. No blocking calls.
 */

const Joi = require('joi');
const keytar = require('keytar');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

// Default config values
const DEFAULTS = {
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
  PORT: Joi.number().integer().min(1).max(65535).default(DEFAULTS.PORT),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default(DEFAULTS.NODE_ENV),
  LOG_LEVEL: Joi.string().valid('info', 'warn', 'error', 'debug').default(DEFAULTS.LOG_LEVEL),
  CACHE_TTL: Joi.number().integer().min(60).max(86400).default(DEFAULTS.CACHE_TTL),
  
  // Microsoft Configuration
  MICROSOFT_CLIENT_ID: Joi.string().required(),
  MICROSOFT_TENANT_ID: Joi.string().required(),
  MICROSOFT_REDIRECT_URI: Joi.string().uri().default(DEFAULTS.MICROSOFT_REDIRECT_URI),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow('').optional(), // Loaded from keytar
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
  const envPath = path.join(process.cwd(), '.env');
  if (await fs.pathExists(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Async loader for secrets from keytar
async function loadSecrets() {
  // Example: MICROSOFT_CLIENT_SECRET stored in keytar
  const MICROSOFT_CLIENT_SECRET = await keytar.getPassword('mcp-desktop', 'MICROSOFT_CLIENT_SECRET') || '';
  return { MICROSOFT_CLIENT_SECRET };
}

// Production environment validation
function validateProductionEnvironment(config) {
  if (config.NODE_ENV !== 'production') {
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
    throw error;
  }
  
  // Log warnings
  if (warnings.length > 0) {
    MonitoringService.warn('Production environment warnings', {
      warnings,
      timestamp: new Date().toISOString()
    }, 'config');
  }
  
  MonitoringService.info('Production environment validation passed', {
    httpsEnabled: config.ENABLE_HTTPS,
    corsConfigured: config.CORS_ALLOWED_ORIGINS !== DEFAULTS.CORS_ALLOWED_ORIGINS,
    timestamp: new Date().toISOString()
  }, 'config');
}

/**
 * Loads, merges, and validates config from env, .env, and keytar.
 * @returns {Promise<Object>} Validated config object
 */
async function getConfig() {
  try {
    await loadDotenv();
    const secrets = await loadSecrets();
    // Merge: defaults < env < secrets
    const merged = {
      ...DEFAULTS,
      ...process.env,
      ...secrets,
    };
    
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Configuration loaded successfully', {
        port: merged.PORT,
        nodeEnv: merged.NODE_ENV,
        clientIdSet: !!merged.MICROSOFT_CLIENT_ID,
        timestamp: new Date().toISOString()
      }, 'config');
    }
    
    const { value, error } = configSchema.validate(merged, { abortEarly: false, allowUnknown: true });
    if (error) {
      const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        'Configuration validation failed',
        ErrorService.SEVERITIES.CRITICAL,
        {
          details: error.details.map(e => e.message),
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      throw new Error('Config validation failed: ' + error.details.map(e => e.message).join('; '));
    }
    
    validateProductionEnvironment(value);
    
    MonitoringService.info('Configuration validation successful', {
      nodeEnv: value.NODE_ENV,
      port: value.PORT,
      timestamp: new Date().toISOString()
    }, 'config');
    
    return value;
  } catch (error) {
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.SYSTEM,
      `Configuration loading failed: ${error.message}`,
      ErrorService.SEVERITIES.CRITICAL,
      {
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    throw error;
  }
}

module.exports = {
  getConfig,
};
