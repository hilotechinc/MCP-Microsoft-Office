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

// Default config values
const DEFAULTS = {
  PORT: 3000,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  CACHE_TTL: 3600,
  MICROSOFT_CLIENT_ID: '',
  MICROSOFT_TENANT_ID: '',
  MICROSOFT_REDIRECT_URI: 'http://localhost:3000/auth/callback',
};

// Joi schema for config validation
const configSchema = Joi.object({
  PORT: Joi.number().integer().min(1).max(65535).default(DEFAULTS.PORT),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default(DEFAULTS.NODE_ENV),
  LOG_LEVEL: Joi.string().valid('info', 'warn', 'error', 'debug').default(DEFAULTS.LOG_LEVEL),
  CACHE_TTL: Joi.number().integer().min(60).max(86400).default(DEFAULTS.CACHE_TTL),
  MICROSOFT_CLIENT_ID: Joi.string().required(),
  MICROSOFT_TENANT_ID: Joi.string().required(),
  MICROSOFT_REDIRECT_URI: Joi.string().uri().default(DEFAULTS.MICROSOFT_REDIRECT_URI),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow('').optional(), // Loaded from keytar
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

/**
 * Loads, merges, and validates config from env, .env, and keytar.
 * @returns {Promise<Object>} Validated config object
 */
async function getConfig() {
  await loadDotenv();
  const secrets = await loadSecrets();
  // Merge: defaults < env < secrets
  const merged = {
    ...DEFAULTS,
    ...process.env,
    ...secrets,
  };
  const { value, error } = configSchema.validate(merged, { abortEarly: false });
  if (error) {
    // Use ErrorService if available, else throw
    // ErrorService.createError('config', 'Config validation failed', 'error', { details: error.details });
    throw new Error('Config validation failed: ' + error.details.map(e => e.message).join('; '));
  }
  return value;
}

module.exports = {
  getConfig,
};
